/**
 * 工作台 v2 任务选择数据契约（§13.1 selection=1）：
 *  - 行投影：timeline 包络/aspiration/has_phase_timeline/role_demands/
 *    assigned_summary/single_person_slots，裁掉列表页重负载；
 *  - scope=demand 映射 include_in_demand=1，scope=all 不加需求过滤；
 *  - 角色需求：显式覆盖优先（source=override/template），percentage NULL =
 *    unconfigured（headcount=null 不给 0）；无覆盖行回落类型资源模板；
 *  - assigned_summary 按请求场景切片、任意状态（同键查重口径）；
 *  - single_person_slots 与服务端 SE/MDE 谓词同构（含 version/日期）；
 *  - 祖先行（include_ancestors=1）空摘要只导航。
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { ProjectsController } from '../../../src/server/api/controllers/ProjectsController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TYPE_ID = `sel-type-${SUFFIX}`;
const SUB_TYPE_ID = `sel-subtype-${SUFFIX}`;
const SUB_TYPE_FALLBACK_ID = `sel-subtype-fb-${SUFFIX}`;
const PERSON_ID = `sel-person-${SUFFIX}`;
let SE_ROLE_ID = '';
let MDE_ROLE_ID = '';
const DEV_ROLE_ID = `sel-role-dev-${SUFFIX}`;
const PROJECT_A_ID = `sel-project-a-${SUFFIX}`;      // 显式覆盖 + 时间线 + SE 占位
const PROJECT_B_ID = `sel-project-b-${SUFFIX}`;      // 无覆盖 → 模板回落
const PROJECT_C_ID = `sel-project-c-${SUFFIX}`;      // include_in_demand=0
const PROJECT_PARENT_ID = `sel-parent-${SUFFIX}`;
const PHASE_A_ID = `sel-phase-a-${SUFFIX}`;
const PHASE_B_ID = `sel-phase-b-${SUFFIX}`;
const BRANCH_ID = `sel-branch-${SUFFIX}`;

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await db('project_types').insert({ id: TYPE_ID, name: `Sel Type ${SUFFIX}` });
  await db('project_sub_types').insert([
    { id: SUB_TYPE_ID, name: `Sel Sub ${SUFFIX}`, project_type_id: TYPE_ID },
    { id: SUB_TYPE_FALLBACK_ID, name: `Sel Sub FB ${SUFFIX}`, project_type_id: TYPE_ID },
  ]);
  await db('people').insert({
    id: PERSON_ID,
    name: `Sel Person ${SUFFIX}`,
    email: `sel-${SUFFIX}@example.com`,
    worker_type: 'FTE',
    default_availability_percentage: 100,
  });
  // SE/MDE 由既有种子提供（roles.name 唯一）；只补缺
  SE_ROLE_ID = String((await db('roles').where('name', 'SE').first())?.id ?? '');
  MDE_ROLE_ID = String((await db('roles').where('name', 'MDE').first())?.id ?? '');
  if (!SE_ROLE_ID) {
    SE_ROLE_ID = `sel-role-se-${SUFFIX}`;
    await db('roles').insert({ id: SE_ROLE_ID, name: 'SE' });
  }
  if (!MDE_ROLE_ID) {
    MDE_ROLE_ID = `sel-role-mde-${SUFFIX}`;
    await db('roles').insert({ id: MDE_ROLE_ID, name: 'MDE' });
  }
  await db('roles').insert([{ id: DEV_ROLE_ID, name: `Sel Dev ${SUFFIX}` }]);
  await db('projects').insert([
    {
      id: PROJECT_A_ID,
      name: `Sel A ${SUFFIX}`,
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_ID,
      aspiration_start: '2027-01-04',
      aspiration_finish: '2027-02-26',
      include_in_demand: true,
      lifecycle_state: 'designing',
    },
    {
      id: PROJECT_B_ID,
      name: `Sel B ${SUFFIX}`,
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_FALLBACK_ID,
      include_in_demand: true,
      lifecycle_state: 'backlog',
    },
    {
      id: PROJECT_C_ID,
      name: `Sel C ${SUFFIX}`,
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_ID,
      include_in_demand: false,
      lifecycle_state: 'designing',
    },
    {
      id: PROJECT_PARENT_ID,
      name: `Sel Parent ${SUFFIX}`,
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_ID,
      include_in_demand: true,
    },
    {
      id: `sel-child-of-parent-${SUFFIX}`,
      name: `Sel Child Deep ${SUFFIX}`,
      parent_id: PROJECT_PARENT_ID,
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_ID,
      include_in_demand: true,
    },
  ]);
  await db('project_phases').insert([
    { id: PHASE_A_ID, name: `Sel Phase A ${SUFFIX}`, order_index: 1 },
    { id: PHASE_B_ID, name: `Sel Phase B ${SUFFIX}`, order_index: 2 },
  ]);
  await db('project_phases_timeline').insert({
    id: randomUUID(),
    project_id: PROJECT_A_ID,
    phase_id: PHASE_A_ID,
    start_date: '2027-03-01',
    end_date: '2027-03-31',
  });
  await db('project_allocation_overrides').insert([
    {
      id: randomUUID(),
      project_id: PROJECT_A_ID,
      phase_id: PHASE_A_ID,
      role_id: SE_ROLE_ID,
      allocation_percentage: 100,
      is_inherited: true,
    },
    {
      id: randomUUID(),
      project_id: PROJECT_A_ID,
      phase_id: PHASE_A_ID,
      role_id: DEV_ROLE_ID,
      allocation_percentage: 50,
      is_inherited: false,
    },
  ]);
  await db('resource_templates').insert([
    {
      id: randomUUID(),
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_FALLBACK_ID,
      phase_id: PHASE_A_ID,
      role_id: DEV_ROLE_ID,
      allocation_percentage: 80,
    },
  ]);
  const baseline = await db('scenarios').where('id', BASELINE_SCENARIO_ID).first();
  if (!baseline) {
    await db('scenarios').insert({ id: BASELINE_SCENARIO_ID, name: 'Baseline', status: 'active', scenario_type: 'baseline', created_by: PERSON_ID });
  }
  const branch = await db('scenarios').where('id', BRANCH_ID).first();
  if (!branch) {
    await db('scenarios').insert({ id: BRANCH_ID, name: `Sel Branch ${SUFFIX}`, status: 'active', scenario_type: 'branch', parent_scenario_id: BASELINE_SCENARIO_ID, created_by: PERSON_ID });
  }
  await db('scenario_project_assignments').insert([
    {
      id: randomUUID(),
      scenario_id: BASELINE_SCENARIO_ID,
      project_id: PROJECT_A_ID,
      person_id: PERSON_ID,
      role_id: SE_ROLE_ID,
      phase_id: null,
      allocation_percentage: 40,
      status: 'active',
      assignment_date_mode: 'fixed',
      start_date: '2027-01-04',
      end_date: '2027-02-26',
      computed_start_date: '2027-01-04',
      computed_end_date: '2027-02-26',
      version: 3,
    },
    {
      // 任意状态都进摘要：paused 行是同键查重的口径来源
      id: randomUUID(),
      scenario_id: BASELINE_SCENARIO_ID,
      project_id: PROJECT_A_ID,
      person_id: PERSON_ID,
      role_id: DEV_ROLE_ID,
      phase_id: null,
      allocation_percentage: 20,
      status: 'paused',
      assignment_date_mode: 'fixed',
      start_date: '2027-01-04',
      end_date: '2027-02-26',
      version: 1,
    },
    {
      id: randomUUID(),
      scenario_id: BRANCH_ID,
      project_id: PROJECT_B_ID,
      person_id: PERSON_ID,
      role_id: DEV_ROLE_ID,
      phase_id: null,
      allocation_percentage: 80,
      status: 'active',
      assignment_date_mode: 'fixed',
      start_date: '2027-01-04',
      end_date: '2027-02-26',
      version: 1,
    },
  ]);

  const controller = new ProjectsController();
  (controller as any).db = db;
  const app = express();
  app.use(express.json());
  app.get('/api/projects', (req, res) => controller.getAll(req as any, res));
  request = supertest(app);
});

function getRow(path: string, id: string) {
  return request.get(path).then((res) => {
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<Record<string, any>>;
    return rows.find((row) => row.id === id);
  });
}

describe('工作台 v2 selection=1 数据契约', () => {
  test('行投影：timeline 包络/aspiration/has_phase_timeline/has_children', async () => {
    const row = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_A_ID);
    expect(row).toBeTruthy();
    expect(row!.timeline_start).toBe('2027-03-01');
    expect(row!.timeline_end).toBe('2027-03-31');
    expect(row!.aspiration_start).toBe('2027-01-04');
    expect(row!.aspiration_finish).toBe('2027-02-26');
    expect(row!.has_phase_timeline).toBe(true);
    expect(row!.has_children).toBe(false);
    expect(row!.lifecycle_state).toBe('designing');
    // 裁掉列表页重负载
    expect(row!.tags).toBeUndefined();
    expect(row!.staffing_summary).toBeUndefined();
    expect(row!.lifecycle_warnings).toBeUndefined();
  });

  test('role_demands：显式覆盖 override/template 来源区分', async () => {
    const row = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_A_ID);
    const demands = row!.role_demands as Array<Record<string, any>>;
    const se = demands.find((d) => d.role_name === 'SE');
    const dev = demands.find((d) => d.role_name?.startsWith('Sel Dev'));
    expect(se).toMatchObject({ required_headcount: 1, source: 'template', phase_id: PHASE_A_ID });
    expect(dev).toMatchObject({ required_headcount: 0.5, source: 'override' });
  });

  test('role_demands：无覆盖行的项目回落类型资源模板；无需求行=未配置空数组', async () => {
    const rowB = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_B_ID);
    const demands = rowB!.role_demands as Array<Record<string, any>>;
    expect(demands).toHaveLength(1);
    expect(demands[0]).toMatchObject({ required_headcount: 0.8, source: 'template', phase_id: PHASE_A_ID });
    // 既无覆盖也无匹配模板：未配置 → 空数组（UI 显示"未配置"，不得显示 0）
    const rowC = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_C_ID);
    expect(rowC!.role_demands).toEqual([]);
  });

  test('assigned_summary：基线切片 + 任意状态（含 paused）', async () => {
    const row = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_A_ID);
    const summary = row!.assigned_summary as Array<Record<string, any>>;
    expect(summary).toHaveLength(2);
    const paused = summary.find((s) => s.status === 'paused');
    expect(paused?.person_name).toContain('Sel Person');
    expect(summary.every((s) => s.id && s.role_id && s.person_id)).toBe(true);
  });

  test('assigned_summary：分支场景切片只看本场景', async () => {
    const res = await request
      .get('/api/projects?selection=1&scope=all&limit=200')
      .set('X-Scenario-Id', BRANCH_ID);
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<Record<string, any>>;
    const a = rows.find((r) => r.id === PROJECT_A_ID);
    const b = rows.find((r) => r.id === PROJECT_B_ID);
    expect((a!.assigned_summary as unknown[]).length).toBe(0);
    expect((b!.assigned_summary as unknown[]).length).toBe(1);
  });

  test('single_person_slots：SE/MDE active 占位含版本与日期（基线场景）', async () => {
    const row = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_A_ID);
    const slots = row!.single_person_slots as Array<Record<string, any>>;
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      role_name: 'SE',
      incumbent_person_id: PERSON_ID,
      incumbent_version: 3,
      incumbent_start_date: '2027-01-04',
      incumbent_end_date: '2027-02-26',
    });
    expect(String(slots[0].incumbent_assignment_id)).toMatch(/^spa-/);
  });

  test('scope=demand 过滤 include_in_demand，scope=all 全量', async () => {
    const demandRow = await getRow(`/api/projects?selection=1&scope=demand&limit=200`, PROJECT_C_ID);
    expect(demandRow).toBeUndefined();
    const allRow = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_C_ID);
    expect(allRow).toBeTruthy();
  });

  test('祖先行（include_ancestors=1）保持导航形状：空摘要 + is_ancestor', async () => {
    const row = await getRow(
      `/api/projects?selection=1&scope=all&include_ancestors=1&search=${encodeURIComponent(`Sel Child Deep ${SUFFIX}`)}&limit=10`,
      PROJECT_PARENT_ID
    );
    expect(row).toMatchObject({ is_ancestor: true });
    expect(row!.role_demands).toEqual([]);
    expect(row!.assigned_summary).toEqual([]);
    expect(row!.single_person_slots).toEqual([]);
    expect(row!.timeline_start).toBeNull();
    expect(row!.has_phase_timeline).toBe(false);
  });
});
