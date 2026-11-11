/**
 * G1（I01v/D15，EXP-B09）：报表读侧场景切片守卫。
 *
 * 事故：capacity_gaps_view（055）的 role_demand CTE 汇总 effective_project_assignments
 * = 旧表 ∪ **全部** active 场景 → 建一个未改动分支后同一批分配被叠加计数，
 * dashboard 缺口/容量/需求报表数字翻倍（0.6 FTE→1.2，探针红证）。
 *
 * 本套件三层断言：
 *  A. baseline 对等（评审 R3）：无分支种子上 roleCapacityGaps(db, BASELINE)
 *     与现行 capacity_gaps_view 逐列相等——内联 CTE 抄写漂移（漏 0.8 折扣/
 *     漏 pool 求和）会两侧同错相消，必须用视图做天然基准。
 *  B. 分支不变性（G1 主体）：建未改动分支前后，dashboard/capacity/gaps/demand
 *     （缺省头）数字逐一相等。修复前必红。
 *  C. 头接线：显式 baseline 头 ≡ 缺省头；branch 头对分支改动敏感（防"切片恒
 *     baseline"这类反向错误）。
 *
 * 变异自证（人工，记录于台账）：把 roleCapacityGaps 需求侧换回
 * capacity_gaps_view 全场景求和 → B 段红；把 role_capacity CTE 的
 * Contractor 0.8 折扣删掉 → A 段红。
 */
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { db, TEST_PROJECT_SUB_TYPE_ID, TEST_PROJECT_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { roleCapacityGaps } from '../../../src/server/services/calc/roleGaps';
import { ReportDataService } from '../../../src/server/services/reports/ReportDataService';
import { ReportingController } from '../../../src/server/api/controllers/ReportingController';

// Mock the database module to use test database（同 gaps-analysis 套件模式）
jest.mock('../../../src/server/database/index.js', () => ({
  db: require('../setup').db,
}));

const ROLE_ID = 'i01v-role-1';
const ROLE_NAME = 'I01V Engineer';
const PERSON_FTE = 'i01v-person-fte';
const PERSON_CONTRACTOR = 'i01v-person-contractor';
const PROJECT_ID = 'i01v-project-1';
const BRANCH_ID = 'i01v-branch-1';

let app: express.Application;
let request: ReturnType<typeof supertest>;
let controller: ReportingController;

const loggerStub = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logPerformance: jest.fn(),
};

async function seedScenarioAssignments(
  scenarioId: string,
  rows: Array<{ person: string; allocation: number }>
): Promise<void> {
  for (const [i, row] of rows.entries()) {
    await db('scenario_project_assignments').insert({
      id: `${scenarioId}-asg-${i}`,
      scenario_id: scenarioId,
      project_id: PROJECT_ID,
      person_id: row.person,
      role_id: ROLE_ID,
      allocation_percentage: row.allocation,
      status: 'active',
      change_type: 'added',
    });
  }
}

/** 复制 baseline 分配到新分支（与 ScenariosController 分支复制同形） */
async function createUnchangedBranch(): Promise<void> {
  await db('scenarios').insert({
    id: BRANCH_ID,
    name: 'I01V 未改动分支',
    parent_scenario_id: BASELINE_SCENARIO_ID,
    created_by: PERSON_FTE,
    status: 'active',
    scenario_type: 'branch',
    branch_point: new Date().toISOString(),
  });
  const baselineRows = await db('scenario_project_assignments').where({
    scenario_id: BASELINE_SCENARIO_ID,
  });
  for (const [i, row] of baselineRows.entries()) {
    await db('scenario_project_assignments').insert({
      ...row,
      id: `${BRANCH_ID}-copy-${i}`,
      scenario_id: BRANCH_ID,
    });
  }
}

const round6 = (v: unknown) => Math.round(Number(v) * 1e6) / 1e6;

/** 统一列裁剪：只比较两个来源共有的口径列（防视图/原语列序漂移误伤） */
function pickGapColumns(row: Record<string, unknown>) {
  return {
    role_id: row.role_id,
    role_name: row.role_name,
    people_count: Number(row.people_count),
    total_capacity_fte: round6(row.total_capacity_fte),
    total_capacity_hours: round6(row.total_capacity_hours),
    total_demand_fte: round6(row.total_demand_fte),
    total_demand_hours: round6(row.total_demand_hours),
    capacity_gap_fte: round6(row.capacity_gap_fte),
    capacity_gap_hours: round6(row.capacity_gap_hours),
    people_with_reduced_availability: Number(row.people_with_reduced_availability),
    status: row.status,
  };
}

beforeAll(async () => {
  // ── 种子：1 角色 × 2 人（FTE + Contractor 各 100%/8h）× 1 项目
  await db('roles').insert({ id: ROLE_ID, name: ROLE_NAME });
  await db('people').insert([
    {
      id: PERSON_FTE,
      name: 'I01V FTE',
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      is_active: 1,
    },
    {
      id: PERSON_CONTRACTOR,
      name: 'I01V Contractor',
      worker_type: 'Contractor',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      is_active: 1,
    },
  ]);
  await db('person_roles').insert([
    { id: 'i01v-pr-1', person_id: PERSON_FTE, role_id: ROLE_ID, is_primary: 1 },
    { id: 'i01v-pr-2', person_id: PERSON_CONTRACTOR, role_id: ROLE_ID, is_primary: 1 },
  ]);
  await db('projects').insert({
    id: PROJECT_ID,
    name: 'I01V 项目',
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    // project_demands_view JOIN project_types 要求非空（055 视图）
    project_type_id: TEST_PROJECT_TYPE_ID,
    include_in_demand: 1,
    priority: 'P1',
    aspiration_start: '2026-01-05',
    aspiration_finish: '2026-12-31',
  });

  // baseline 场景 + 分配（0.5 + 0.3 FTE）+ 开放池需求 0.5 FTE
  await db('scenarios').insert({
    id: BASELINE_SCENARIO_ID,
    name: '基线',
    created_by: PERSON_FTE,
    status: 'active',
    scenario_type: 'baseline',
  });
  await seedScenarioAssignments(BASELINE_SCENARIO_ID, [
    { person: PERSON_FTE, allocation: 50 },
    { person: PERSON_CONTRACTOR, allocation: 30 },
  ]);
  await db('project_pool_demands').insert({
    id: 'i01v-pool-1',
    project_id: PROJECT_ID,
    role_id: ROLE_ID,
    headcount: 0.5,
    status: 'open',
  });

  // ── HTTP 栈（logger 桩：控制器显式使用 req.logger）
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).logger = loggerStub;
    next();
  });
  controller = new ReportingController();
  (controller as any).db = db;
  app.get('/api/reporting/dashboard', (req, res) => controller.getDashboard(req as any, res));
  app.get('/api/reporting/capacity', (req, res) => controller.getCapacityReport(req as any, res));
  app.get('/api/reporting/gaps', (req, res) => controller.getGapsAnalysis(req as any, res));
  app.get('/api/reporting/demand', (req, res) => controller.getDemandReport(req as any, res));
  request = supertest(app);
});

beforeEach(async () => {
  // 每个用例从干净分配态起步（种子实体留在 beforeAll）
  await db('scenario_project_assignments').whereNot({ scenario_id: BASELINE_SCENARIO_ID }).del();
  await db('scenarios').whereNot({ id: BASELINE_SCENARIO_ID }).del();
});

describe('G1 报表读侧场景切片（D15/EXP-B09）', () => {
  test('A. baseline 对等：roleCapacityGaps(BASELINE) 与 capacity_gaps_view 逐列相等', async () => {
    const fresh = await roleCapacityGaps(db, BASELINE_SCENARIO_ID);
    const view = (await db('capacity_gaps_view').select('*')) as Array<Record<string, unknown>>;

    const freshSorted = fresh.map(pickGapColumns).sort((a, b) => String(a.role_id).localeCompare(String(b.role_id)));
    const viewSorted = view.map(pickGapColumns).sort((a, b) => String(a.role_id).localeCompare(String(b.role_id)));

    expect(freshSorted).toEqual(viewSorted);
    // 非空断言防"空库空对空"假绿：角色行存在且容量含 Contractor 0.8 折扣（1.0 + 0.8）
    const mine = fresh.find((r) => r.role_id === ROLE_ID)!;
    expect(mine.people_count).toBe(2);
    expect(round6(mine.total_capacity_fte)).toBe(1.8);
    // 需求 = 0.5 + 0.3 + 开放池 0.5 = 1.3
    expect(round6(mine.total_demand_fte)).toBe(1.3);
  });

  test('B. 分支不变性：建未改动分支前后，四报表（缺省头）数字逐一相等', async () => {
    const service = new ReportDataService(db);
    const snapshot = async () => ({
      dashboard: await service.getDashboardStats({}),
      capacity: await service.getCapacityReport({}),
      gaps: await service.getGapsAnalysis(),
      demand: await service.getDemandReport({}),
    });

    const before = await snapshot();
    await createUnchangedBranch();
    const after = await snapshot();

    expect(after.dashboard).toEqual(before.dashboard);
    expect(after.capacity).toEqual(before.capacity);
    expect(after.gaps).toEqual(before.gaps);
    expect(after.demand).toEqual(before.demand);
    // 非空断言：baseline 数字本体（0.5+0.3+0.5=1.3 FTE）不因分支翻倍
    const role = after.capacity.capacityGaps.find((g) => g.role_id === ROLE_ID)!;
    expect(round6(role.total_demand_fte)).toBe(1.3);
  });

  test('C. 头接线：显式 baseline 头 ≡ 缺省头；branch 头对分支改动敏感', async () => {
    const defaultResp = await request.get('/api/reporting/demand');
    const explicitBaseline = await request
      .get('/api/reporting/demand')
      .set('X-Scenario-Id', BASELINE_SCENARIO_ID);

    expect(defaultResp.status).toBe(200);
    expect(explicitBaseline.status).toBe(200);
    expect(explicitBaseline.body.data).toEqual(defaultResp.body.data);

    // 建分支并给分支追加一条 100% 分配——只应影响 branch 头
    await createUnchangedBranch();
    await db('scenario_project_assignments').insert({
      id: `${BRANCH_ID}-extra`,
      scenario_id: BRANCH_ID,
      project_id: PROJECT_ID,
      person_id: PERSON_FTE,
      role_id: ROLE_ID,
      allocation_percentage: 100,
      status: 'active',
      change_type: 'added',
    });

    const baselineAfter = await request.get('/api/reporting/demand');
    const branchAfter = await request
      .get('/api/reporting/demand')
      .set('X-Scenario-Id', BRANCH_ID);

    expect(baselineAfter.body.data).toEqual(defaultResp.body.data);
    expect(branchAfter.body.data.summary.total_hours).toBeGreaterThan(
      defaultResp.body.data.summary.total_hours
    );

    // dashboard 缺口同样分支敏感（branch 下需求侧变，GAP 档位变化可观测）
    const dashboardBranch = await request
      .get('/api/reporting/dashboard')
      .set('X-Scenario-Id', BRANCH_ID);
    expect(dashboardBranch.status).toBe(200);
    expect(dashboardBranch.body.data.capacityGaps).not.toEqual(
      defaultResp.status === 200 ? (await request.get('/api/reporting/dashboard')).body.data.capacityGaps : null
    );
  });
});
