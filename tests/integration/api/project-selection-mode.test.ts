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
import { ProjectAllocationController } from '../../../src/server/api/controllers/ProjectAllocationController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TYPE_ID = `sel-type-${SUFFIX}`;
const TYPE_EMPTY_ID = `sel-type-empty-${SUFFIX}`;
const SUB_TYPE_ID = `sel-subtype-${SUFFIX}`;
const SUB_TYPE_FALLBACK_ID = `sel-subtype-fb-${SUFFIX}`;
const SUB_TYPE_EMPTY_ID = `sel-subtype-empty-${SUFFIX}`;
const PERSON_ID = `sel-person-${SUFFIX}`;
let SE_ROLE_ID = '';
let MDE_ROLE_ID = '';
const DEV_ROLE_ID = `sel-role-dev-${SUFFIX}`;
const PROJECT_A_ID = `sel-project-a-${SUFFIX}`;      // 显式覆盖 + 时间线 + SE 占位
const PROJECT_B_ID = `sel-project-b-${SUFFIX}`;      // 无覆盖 → 模板回落
const PROJECT_C_ID = `sel-project-c-${SUFFIX}`;      // include_in_demand=0
const PROJECT_D_ID = `sel-project-d-${SUFFIX}`;      // 空类型 → 未配置（无需求行）
const PROJECT_E_ID = `sel-project-e-${SUFFIX}`;      // initialize 路由用（F5-A）
const PROJECT_PARENT_ID = `sel-parent-${SUFFIX}`;
const PHASE_A_ID = `sel-phase-a-${SUFFIX}`;
const PHASE_B_ID = `sel-phase-b-${SUFFIX}`;
const BRANCH_ID = `sel-branch-${SUFFIX}`;

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await db('project_types').insert([
    { id: TYPE_ID, name: `Sel Type ${SUFFIX}` },
    { id: TYPE_EMPTY_ID, name: `Sel Type Empty ${SUFFIX}` },
  ]);
  await db('project_sub_types').insert([
    { id: SUB_TYPE_ID, name: `Sel Sub ${SUFFIX}`, project_type_id: TYPE_ID },
    { id: SUB_TYPE_FALLBACK_ID, name: `Sel Sub FB ${SUFFIX}`, project_type_id: TYPE_ID },
    { id: SUB_TYPE_EMPTY_ID, name: `Sel Sub Empty ${SUFFIX}`, project_type_id: TYPE_EMPTY_ID },
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
    {
      id: PROJECT_D_ID,
      name: `Sel D ${SUFFIX}`,
      project_type_id: TYPE_EMPTY_ID,
      project_sub_type_id: SUB_TYPE_EMPTY_ID,
      include_in_demand: true,
    },
    {
      id: PROJECT_E_ID,
      name: `Sel E ${SUFFIX}`,
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_FALLBACK_ID,
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
    {
      // NULL sub_type = 该类型通配：所有 sub_type 的项目都继承
      id: randomUUID(),
      project_type_id: TYPE_ID,
      project_sub_type_id: null,
      phase_id: PHASE_B_ID,
      role_id: MDE_ROLE_ID,
      allocation_percentage: 60,
    },
    {
      // 另一 sub_type 的精确模板：不得泄漏到 FALLBACK sub_type 的项目
      id: randomUUID(),
      project_type_id: TYPE_ID,
      project_sub_type_id: SUB_TYPE_ID,
      phase_id: PHASE_A_ID,
      role_id: SE_ROLE_ID,
      allocation_percentage: 100,
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
    {
      // F3：父项目自身有分配数据——祖先行仍必须空摘要（实现保证，非夹具空洞）
      id: randomUUID(),
      scenario_id: BASELINE_SCENARIO_ID,
      project_id: PROJECT_PARENT_ID,
      person_id: PERSON_ID,
      role_id: DEV_ROLE_ID,
      phase_id: null,
      allocation_percentage: 30,
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
  // F5-A：initialize 路由与选择弹窗共用模板匹配规则
  const allocationController = new ProjectAllocationController();
  (allocationController as any).db = db;
  app.post('/api/project-allocations/:projectId/initialize', (req, res) =>
    allocationController.initializeProjectAllocations(req as any, res)
  );
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

  test('role_demands：模板回落=精确 sub_type + NULL 通配；无模板类型=未配置空数组', async () => {
    // B（FALLBACK sub）：DEV 精确 0.8 + MDE 通配 0.6；不收 SUB_TYPE_ID 的 SE
    const rowB = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_B_ID);
    const demandsB = rowB!.role_demands as Array<Record<string, any>>;
    expect(demandsB).toHaveLength(2);
    const devB = demandsB.find((d) => d.role_name?.startsWith('Sel Dev'));
    const mdeB = demandsB.find((d) => d.role_name === 'MDE');
    expect(devB).toMatchObject({ required_headcount: 0.8, source: 'template', phase_id: PHASE_A_ID });
    expect(mdeB).toMatchObject({ required_headcount: 0.6, source: 'template', phase_id: PHASE_B_ID });
    // C（SUB_TYPE sub，无覆盖）：SE 精确 + MDE 通配
    const rowC = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_C_ID);
    const demandsC = rowC!.role_demands as Array<Record<string, any>>;
    expect(demandsC).toHaveLength(2);
    expect(demandsC.find((d) => d.role_name === 'SE')).toMatchObject({ required_headcount: 1, source: 'template' });
    // D（无模板类型）：未配置 → 空数组（UI 显示"未配置"，不得显示 0）
    const rowD = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_D_ID);
    expect(rowD!.role_demands).toEqual([]);
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

  test('single_person_slots：SE/MDE active 占位含版本/日期/比例/阶段/模式（撤销重建需要完整字段）', async () => {
    const row = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_A_ID);
    const slots = row!.single_person_slots as Array<Record<string, any>>;
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      role_name: 'SE',
      incumbent_person_id: PERSON_ID,
      incumbent_version: 3,
      incumbent_start_date: '2027-01-04',
      incumbent_end_date: '2027-02-26',
      incumbent_allocation_percentage: 40,
      incumbent_phase_id: null,
      incumbent_assignment_date_mode: 'fixed',
      incumbent_raw_start_date: '2027-01-04',
      incumbent_raw_end_date: '2027-02-26',
    });
    expect(String(slots[0].incumbent_assignment_id)).toMatch(/^spa-/);
  });

  test('scope=demand 过滤 include_in_demand，scope=all 全量', async () => {
    const demandRow = await getRow(`/api/projects?selection=1&scope=demand&limit=200`, PROJECT_C_ID);
    expect(demandRow).toBeUndefined();
    const allRow = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_C_ID);
    expect(allRow).toBeTruthy();
  });

  test('F4：selection 模式下 scope 是唯一需求过滤真源，原始 include_in_demand 不直通', async () => {
    // 无 scope 时原始 include_in_demand=0 不得静默收窄"全量"视图
    const viaRawParam = await getRow(`/api/projects?selection=1&include_in_demand=0&limit=200`, PROJECT_C_ID);
    expect(viaRawParam).toBeTruthy();
    const viaScopeAll = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_C_ID);
    expect(viaScopeAll).toBeTruthy();
    // 非 selection 模式旧行为保留：include_in_demand 等值过滤仍生效
    const legacyIncluded = await getRow(`/api/projects?include_in_demand=0&limit=200`, PROJECT_C_ID);
    expect(legacyIncluded).toBeTruthy();
    const legacyExcluded = await getRow(`/api/projects?include_in_demand=1&limit=200`, PROJECT_C_ID);
    expect(legacyExcluded).toBeUndefined();
  });

  test('F3：祖先行有真实数据仍空摘要（实现保证）；同项目作为普通行摘要正常', async () => {
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

    // 同一父项目在无搜索的全量列表中是普通行：摘要必须有数据（防"恒空"矫枉过正）
    const normalRow = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_PARENT_ID);
    expect(normalRow!.is_ancestor).toBe(false);
    expect((normalRow!.assigned_summary as unknown[]).length).toBe(1);
    expect((normalRow!.role_demands as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('F5-A：initialize 与选择弹窗同规则——精确 sub_type + NULL 通配，不复制其他 sub_type', async () => {
    // E（FALLBACK sub，无覆盖）：预期只继承 DEV（精确）+ MDE（通配），不含 SE（SUB_TYPE_ID 精确）
    const before = await db('project_allocation_overrides').where({ project_id: PROJECT_E_ID });
    expect(before).toHaveLength(0);

    const res = await request.post(`/api/project-allocations/${PROJECT_E_ID}/initialize`);
    expect(res.status).toBe(200);

    const created = await db('project_allocation_overrides').where({ project_id: PROJECT_E_ID });
    expect(created).toHaveLength(2);
    const roleIds = created.map((r: any) => r.role_id).sort();
    expect(roleIds).toEqual([DEV_ROLE_ID, MDE_ROLE_ID].sort());
    for (const row of created) {
      expect(row.is_inherited).toBe(1);
    }

    // 弹窗回落与 initialize 产物一致：E 的 role_demands 即两条
    const rowE = await getRow(`/api/projects?selection=1&scope=all&limit=200`, PROJECT_E_ID);
    const demands = rowE!.role_demands as Array<Record<string, any>>;
    expect(demands).toHaveLength(2);
    expect(demands.find((d) => d.role_name?.startsWith('Sel Dev'))).toMatchObject({ required_headcount: 0.8 });
    expect(demands.find((d) => d.role_name === 'MDE')).toMatchObject({ required_headcount: 0.6 });
  });
});
