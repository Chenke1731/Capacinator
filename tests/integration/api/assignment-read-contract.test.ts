/**
 * I02s 读路径契约（真迁移库）：
 *  - 列表直接读 assignments_view 持久化 computed_*，不在读路径重算；
 *  - computed 缺失时回退 raw；两者都缺失时逐行标记，不让整页 500；
 *  - project 模式缺 aspiration 不生成 today/+90 伪日期；
 *  - 无 X-Scenario-Id 默认 baseline（不再是全场景）；includeAllScenarios 显式放开；
 *  - limit 封顶 2000，稳定排序 tiebreaker 由 id 兜底。
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_ID = `i02s-person-${SUFFIX}`;
const ROLE_ID = `i02s-role-${SUFFIX}`;
const PROJECT_ID = `i02s-project-${SUFFIX}`;
const PROJECT_NO_DATES_ID = `i02s-project-nodates-${SUFFIX}`;
const PROJECT_BRANCH_ID = `i02s-project-branch-${SUFFIX}`;
const PHASE_ID = `i02s-phase-${SUFFIX}`;
const PHASE_NO_TIMELINE_ID = `i02s-phase-orphan-${SUFFIX}`;
const TIMELINE_ID = `i02s-timeline-${SUFFIX}`;
const BRANCH_ID = `i02s-branch-${SUFFIX}`;

let app: express.Application;
let request: ReturnType<typeof supertest>;

function makeApp() {
  const assignments = new AssignmentsController();
  (assignments as any).db = db;

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    (req as any).user = { id: PERSON_ID, name: 'I02S Tester' };
    (req as any).logger = { info() {}, debug() {}, warn() {}, error() {} };
    (req as any).logAuditEvent = async () => {};
    next();
  });
  testApp.get('/api/assignments', (req, res) => assignments.getAll(req, res));
  return testApp;
}

async function insertAssignment(overrides: Record<string, any> = {}) {
  const row = {
    id: randomUUID(),
    scenario_id: BASELINE_SCENARIO_ID,
    project_id: PROJECT_ID,
    person_id: PERSON_ID,
    role_id: ROLE_ID,
    phase_id: PHASE_ID,
    allocation_percentage: 20,
    status: 'active',
    assignment_date_mode: 'phase',
    start_date: null,
    end_date: null,
    computed_start_date: '2026-03-01',
    computed_end_date: '2026-03-31',
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
  await db('scenario_project_assignments').insert(row);
  return row;
}

beforeAll(async () => {
  await db('people').insert({
    id: PERSON_ID,
    name: `I02S Person ${SUFFIX}`,
    email: `i02s-${SUFFIX}@example.com`,
    worker_type: 'FTE',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
  });
  await db('roles').insert({
    id: ROLE_ID,
    name: `I02S Role ${SUFFIX}`,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await db('projects').insert([
    {
      id: PROJECT_ID,
      name: `I02S Project ${SUFFIX}`,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      aspiration_start: '2026-04-01',
      aspiration_finish: '2026-04-30',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: PROJECT_NO_DATES_ID,
      name: `I02S Project No Dates ${SUFFIX}`,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      aspiration_start: null,
      aspiration_finish: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: PROJECT_BRANCH_ID,
      name: `I02S Project Branch ${SUFFIX}`,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      aspiration_start: null,
      aspiration_finish: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
  await db('project_phases').insert([
    { id: PHASE_ID, name: `I02S Phase ${SUFFIX}`, order_index: 1 },
    { id: PHASE_NO_TIMELINE_ID, name: `I02S Orphan ${SUFFIX}`, order_index: 2 },
  ]);
  await db('project_phases_timeline').insert({
    id: TIMELINE_ID,
    project_id: PROJECT_ID,
    phase_id: PHASE_ID,
    // 时间线是四月；行的持久化 computed 是三月——读路径必须保留三月（不重算）
    start_date: '2026-04-01',
    end_date: '2026-04-30',
  });

  const baseline = await db('scenarios').where('id', BASELINE_SCENARIO_ID).first();
  if (!baseline) {
    await db('scenarios').insert({
      id: BASELINE_SCENARIO_ID,
      name: 'Baseline',
      status: 'active',
      scenario_type: 'baseline',
      created_by: PERSON_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  await db('scenarios').insert({
    id: BRANCH_ID,
    name: `I02S Branch ${SUFFIX}`,
    parent_scenario_id: BASELINE_SCENARIO_ID,
    status: 'active',
    scenario_type: 'branch',
    created_by: PERSON_ID,
    created_at: new Date(),
    updated_at: new Date(),
  });

  app = makeApp();
  request = supertest(app);
});

beforeEach(async () => {
  await db('scenario_project_assignments')
    .whereIn('project_id', [PROJECT_ID, PROJECT_NO_DATES_ID, PROJECT_BRANCH_ID])
    .del();
});

function list(query = '', headers: Record<string, string> = {}) {
  let req = request.get(`/api/assignments?person_id=${PERSON_ID}${query}`);
  if (headers['X-Scenario-Id']) req = req.set('X-Scenario-Id', headers['X-Scenario-Id']);
  return req;
}

describe('I02s 列表读契约', () => {
  test('使用持久化 computed，不在读路径按阶段时间线重算', async () => {
    const seeded = await insertAssignment();
    const res = await list();
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: any) => String(r.id).replace(/^spa-/, '') === seeded.id);
    expect(row).toBeTruthy();
    expect(row.computed_start_date).toBe('2026-03-01');
    expect(row.computed_end_date).toBe('2026-03-31');
    expect(row.computed_dates_resolved).toBe(true);
    expect(row.date_resolution_error).toBeNull();
  });

  test('computed 缺失回退 raw，不生成 today/+90', async () => {
    const seeded = await insertAssignment({
      assignment_date_mode: 'fixed',
      start_date: '2026-05-01',
      end_date: '2026-05-31',
      computed_start_date: null,
      computed_end_date: null,
    });
    const res = await list();
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: any) => String(r.id).replace(/^spa-/, '') === seeded.id);
    expect(row.computed_start_date).toBe('2026-05-01');
    expect(row.computed_end_date).toBe('2026-05-31');
    expect(row.computed_dates_resolved).toBe(true);
  });

  test('project 模式缺 aspiration：返回 null 并逐行标记，不回退今天', async () => {
    const seeded = await insertAssignment({
      project_id: PROJECT_NO_DATES_ID,
      phase_id: null,
      assignment_date_mode: 'project',
      start_date: null,
      end_date: null,
      computed_start_date: null,
      computed_end_date: null,
    });
    const res = await list();
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: any) => String(r.id).replace(/^spa-/, '') === seeded.id);
    expect(row.computed_start_date).toBeNull();
    expect(row.computed_end_date).toBeNull();
    expect(row.computed_dates_resolved).toBe(false);
    expect(row.date_resolution_error).toBe('PROJECT_DATES_MISSING');
    expect(row.computed_start_date).not.toBe(new Date().toISOString().slice(0, 10));
  });

  test('phase 行缺时间线不会 500，其他行仍返回且该行有 error flag', async () => {
    const good = await insertAssignment();
    const orphan = await insertAssignment({
      phase_id: PHASE_NO_TIMELINE_ID,
      computed_start_date: null,
      computed_end_date: null,
    });
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const goodRow = res.body.data.find((r: any) => String(r.id).replace(/^spa-/, '') === good.id);
    const badRow = res.body.data.find((r: any) => String(r.id).replace(/^spa-/, '') === orphan.id);
    expect(goodRow.computed_dates_resolved).toBe(true);
    expect(badRow.computed_dates_resolved).toBe(false);
    expect(badRow.date_resolution_error).toBe('PHASE_TIMELINE_MISSING');
  });

  test('scenario 缺省 baseline；分支头只返回分支；includeAllScenarios 返回两轨', async () => {
    const baseline = await insertAssignment();
    const branch = await insertAssignment({
      scenario_id: BRANCH_ID,
      project_id: PROJECT_BRANCH_ID,
      phase_id: null,
      assignment_date_mode: 'fixed',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
      computed_start_date: '2026-06-01',
      computed_end_date: '2026-06-30',
    });

    const defaultRes = await list();
    expect(defaultRes.status).toBe(200);
    const defaultIds = defaultRes.body.data.map((r: any) => String(r.id).replace(/^spa-/, ''));
    expect(defaultIds).toContain(baseline.id);
    expect(defaultIds).not.toContain(branch.id);

    const branchRes = await list('', { 'X-Scenario-Id': BRANCH_ID });
    expect(branchRes.status).toBe(200);
    const branchIds = branchRes.body.data.map((r: any) => String(r.id).replace(/^spa-/, ''));
    expect(branchIds).toContain(branch.id);
    expect(branchIds).not.toContain(baseline.id);

    const allRes = await list('&includeAllScenarios=true');
    expect(allRes.status).toBe(200);
    const allIds = allRes.body.data.map((r: any) => String(r.id).replace(/^spa-/, ''));
    expect(allIds).toContain(baseline.id);
    expect(allIds).toContain(branch.id);
  });

  test('limit 封顶 2000，避免单请求拖垮读路径', async () => {
    const res = await list('&limit=9999');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(2000);
  });
});
