/**
 * I02r 写路径安全守卫（真迁移库 + 真实 controller）：
 *  - 场景归属：场景轨按 (id, X-Scenario-Id) 定位，跨场景 update/delete 404；
 *  - direct 轨只在 baseline 可写，且写后补审计；
 *  - 身份列（project/person/role/scenario/id）不可由 update 载荷改写；
 *  - fixed 日期 null/'' 拒绝，不能静默落成 computed 回退；
 *  - SE/MDE 单人制必须显式 replace_assignment_id + 版本，旧行保留/替换可审计；
 *  - NULL phase 的业务键重复显式 409（SQLite 唯一索引不拦 NULL）；
 *  - allocation 严格数值，字符串不参与容量求和。
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_A_ID = `i02r-person-a-${SUFFIX}`;
const PERSON_B_ID = `i02r-person-b-${SUFFIX}`;
const ROLE_ID = `i02r-role-${SUFFIX}`;
const PROJECT_ID = `i02r-project-${SUFFIX}`;
const PROJECT_OTHER_ID = `i02r-project-other-${SUFFIX}`;
const BRANCH_ID = `i02r-branch-${SUFFIX}`;

type AuditEvent = {
  table: string;
  recordId: string;
  action: string;
  oldValues: any;
  newValues: any;
};

let app: express.Application;
let request: ReturnType<typeof supertest>;
let auditEvents: AuditEvent[] = [];
let seRoleId: string;

function makeApp() {
  const assignments = new AssignmentsController();
  (assignments as any).db = db;

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    (req as any).user = { id: PERSON_A_ID, name: 'I02R Tester' };
    (req as any).logger = { info() {}, debug() {}, warn() {}, error() {} };
    (req as any).logAuditEvent = async (
      table: string,
      recordId: string,
      action: string,
      oldValues: any,
      newValues: any
    ) => {
      auditEvents.push({ table, recordId: String(recordId), action, oldValues, newValues });
    };
    next();
  });

  const routes = express.Router();
  routes.post('/', (req, res) => assignments.create(req, res));
  routes.put('/:id', (req, res) => assignments.update(req, res));
  routes.delete('/:id', (req, res) => assignments.delete(req, res));
  testApp.use('/api/assignments', routes);
  return testApp;
}

async function insertScenarioAssignment(overrides: Record<string, any> = {}) {
  const row = {
    id: randomUUID(),
    scenario_id: BASELINE_SCENARIO_ID,
    project_id: PROJECT_ID,
    person_id: PERSON_A_ID,
    role_id: ROLE_ID,
    phase_id: null,
    allocation_percentage: 20,
    status: 'active',
    assignment_date_mode: 'fixed',
    start_date: '2026-03-01',
    end_date: '2026-03-31',
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
  await db('people').insert([
    {
      id: PERSON_A_ID,
      name: `I02R Person A ${SUFFIX}`,
      email: `i02r-a-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
    {
      id: PERSON_B_ID,
      name: `I02R Person B ${SUFFIX}`,
      email: `i02r-b-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
  ]);
  await db('roles').insert({
    id: ROLE_ID,
    name: `I02R Role ${SUFFIX}`,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await db('projects').insert([
    {
      id: PROJECT_ID,
      name: `I02R Project ${SUFFIX}`,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      aspiration_start: '2026-03-01',
      aspiration_finish: '2026-03-31',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: PROJECT_OTHER_ID,
      name: `I02R Project Other ${SUFFIX}`,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      aspiration_start: '2026-04-01',
      aspiration_finish: '2026-04-30',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  const baseline = await db('scenarios').where('id', BASELINE_SCENARIO_ID).first();
  if (!baseline) {
    await db('scenarios').insert({
      id: BASELINE_SCENARIO_ID,
      name: 'Baseline',
      status: 'active',
      scenario_type: 'baseline',
      created_by: PERSON_A_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  await db('scenarios').insert({
    id: BRANCH_ID,
    name: `I02R Branch ${SUFFIX}`,
    parent_scenario_id: BASELINE_SCENARIO_ID,
    status: 'active',
    scenario_type: 'branch',
    created_by: PERSON_A_ID,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // SE 角色按 name 判定单人制；复用种子 SE（若有），否则建一个
  let se = await db('roles').where('name', 'SE').first();
  if (!se) {
    se = { id: randomUUID(), name: 'SE' };
    await db('roles').insert({ ...se, created_at: new Date(), updated_at: new Date() });
  }
  seRoleId = se.id;

  app = makeApp();
  request = supertest(app);
});

beforeEach(async () => {
  auditEvents = [];
  await db('scenario_project_assignments').whereIn('project_id', [PROJECT_ID, PROJECT_OTHER_ID]).del();
  await db('project_assignments').whereIn('project_id', [PROJECT_ID, PROJECT_OTHER_ID]).del();
});

describe('I02r 场景归属与 direct 轨', () => {
  test('跨场景 update/delete 404，原行不变', async () => {
    const seeded = await insertScenarioAssignment({ scenario_id: BRANCH_ID });

    const updateRes = await request
      .put(`/api/assignments/${seeded.id}`)
      .set('X-Scenario-Id', BASELINE_SCENARIO_ID)
      .send({ allocation_percentage: 90 });
    expect(updateRes.status).toBe(404);

    const afterUpdate = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(afterUpdate.allocation_percentage).toBe(20);

    const deleteRes = await request
      .delete(`/api/assignments/${seeded.id}`)
      .set('X-Scenario-Id', BASELINE_SCENARIO_ID);
    expect(deleteRes.status).toBe(404);
    expect(await db('scenario_project_assignments').where('id', seeded.id).first()).toBeTruthy();

    // 正确的场景上下文可写
    const okRes = await request
      .put(`/api/assignments/${seeded.id}`)
      .set('X-Scenario-Id', BRANCH_ID)
      .send({ allocation_percentage: 30 });
    expect(okRes.status).toBe(200);
  });

  test('direct 轨只在 baseline 可写，且 update/delete 写审计', async () => {
    const directId = randomUUID();
    await db('project_assignments').insert({
      id: directId,
      project_id: PROJECT_ID,
      person_id: PERSON_A_ID,
      role_id: ROLE_ID,
      phase_id: null,
      allocation_percentage: 25,
      status: 'active',
      assignment_date_mode: 'fixed',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
      computed_start_date: '2026-03-01',
      computed_end_date: '2026-03-31',
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const branchRes = await request
      .put(`/api/assignments/${directId}`)
      .set('X-Scenario-Id', BRANCH_ID)
      .send({ allocation_percentage: 40 });
    expect(branchRes.status).toBe(404);

    const okRes = await request
      .put(`/api/assignments/${directId}`)
      .set('X-Scenario-Id', BASELINE_SCENARIO_ID)
      .send({ allocation_percentage: 40 });
    expect(okRes.status).toBe(200);
    expect(auditEvents.some((e) => e.table === 'project_assignments' && e.action === 'UPDATE')).toBe(true);

    const deleteRes = await request
      .delete(`/api/assignments/${directId}`)
      .set('X-Scenario-Id', BASELINE_SCENARIO_ID);
    expect(deleteRes.status).toBe(200);
    expect(auditEvents.some((e) => e.table === 'project_assignments' && e.action === 'DELETE')).toBe(true);
  });

  test('update 载荷不能改写身份列', async () => {
    const seeded = await insertScenarioAssignment();
    const res = await request
      .put(`/api/assignments/${seeded.id}`)
      .set('X-Scenario-Id', BASELINE_SCENARIO_ID)
      .send({
        id: 'injected-id',
        scenario_id: BRANCH_ID,
        project_id: PROJECT_OTHER_ID,
        person_id: PERSON_B_ID,
        role_id: seRoleId,
        allocation_percentage: 35,
      });
    expect(res.status).toBe(200);

    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.scenario_id).toBe(BASELINE_SCENARIO_ID);
    expect(row.project_id).toBe(PROJECT_ID);
    expect(row.person_id).toBe(PERSON_A_ID);
    expect(row.role_id).toBe(ROLE_ID);
    expect(Number(row.allocation_percentage)).toBe(35);
    expect(await db('scenario_project_assignments').where('id', 'injected-id').first()).toBeFalsy();
  });
});

describe('I02r 日期与数值硬校验', () => {
  test.each([null, ''])('fixed 模式 start_date=%p 被拒绝且原值不变', async (value) => {
    const seeded = await insertScenarioAssignment();
    const res = await request
      .put(`/api/assignments/${seeded.id}`)
      .send({ start_date: value });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('Start date and end date are required');

    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.start_date).toBe('2026-03-01');
    expect(row.computed_start_date).toBe('2026-03-01');
  });

  test('allocation 字符串被拒绝（不能参与容量拼接）', async () => {
    const seeded = await insertScenarioAssignment();

    const updateRes = await request
      .put(`/api/assignments/${seeded.id}`)
      .send({ allocation_percentage: '30' });
    expect(updateRes.status).toBe(400);
    expect(String(updateRes.body.error)).toContain('must be a number');

    const createRes = await request.post('/api/assignments').send({
      project_id: PROJECT_ID,
      person_id: PERSON_A_ID,
      role_id: ROLE_ID,
      allocation_percentage: '30',
      assignment_date_mode: 'fixed',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    });
    expect(createRes.status).toBe(400);
  });

  test('create 忽略非白名单字段（billable/id 不落库、不报 SQL 错）', async () => {
    const res = await request.post('/api/assignments').send({
      id: 'injected-id',
      billable: true,
      project_id: PROJECT_ID,
      person_id: PERSON_A_ID,
      role_id: ROLE_ID,
      allocation_percentage: 30,
      assignment_date_mode: 'fixed',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    });
    expect(res.status).toBe(200);
    const id = String(res.body.data.id).replace(/^spa-/, '');
    expect(id).not.toBe('injected-id');
  });
});

describe('I02r 重复键与 SE/MDE 单人制', () => {
  test('NULL phase 的同业务键重复 create → 409 ASSIGNMENT_DUPLICATE', async () => {
    const payload = {
      project_id: PROJECT_ID,
      person_id: PERSON_A_ID,
      role_id: ROLE_ID,
      allocation_percentage: 20,
      assignment_date_mode: 'fixed',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    };
    const first = await request.post('/api/assignments').send(payload);
    expect(first.status).toBe(200);

    const second = await request.post('/api/assignments').send(payload);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ASSIGNMENT_DUPLICATE');
    expect(second.body.existing_id).toBeTruthy();
  });

  test('SE 槽位被他占：无显式替换 → 409 且旧行保留', async () => {
    const seeded = await insertScenarioAssignment({
      role_id: seRoleId,
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    });

    const res = await request.post('/api/assignments').send({
      project_id: PROJECT_ID,
      person_id: PERSON_B_ID,
      role_id: seRoleId,
      allocation_percentage: 30,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_SLOT_OCCUPIED');
    expect(await db('scenario_project_assignments').where('id', seeded.id).first()).toBeTruthy();
  });

  test('SE 替换缺 replace_expected_version → 400，旧行保留', async () => {
    const seeded = await insertScenarioAssignment({
      role_id: seRoleId,
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    });

    const res = await request.post('/api/assignments').send({
      project_id: PROJECT_ID,
      person_id: PERSON_B_ID,
      role_id: seRoleId,
      allocation_percentage: 30,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      replace_assignment_id: seeded.id,
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('replace_expected_version');
    expect(await db('scenario_project_assignments').where('id', seeded.id).first()).toBeTruthy();
  });

  test('显式 replace_assignment_id + 版本 → 旧行删除/新行创建且双审计', async () => {
    const seeded = await insertScenarioAssignment({
      role_id: seRoleId,
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    });

    const res = await request.post('/api/assignments').send({
      project_id: PROJECT_ID,
      person_id: PERSON_B_ID,
      role_id: seRoleId,
      allocation_percentage: 30,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      replace_assignment_id: seeded.id,
      replace_expected_version: seeded.version,
    });
    expect(res.status).toBe(200);

    expect(await db('scenario_project_assignments').where('id', seeded.id).first()).toBeFalsy();
    const replacement = await db('scenario_project_assignments')
      .where({ project_id: PROJECT_ID, role_id: seRoleId, person_id: PERSON_B_ID })
      .first();
    expect(replacement).toBeTruthy();
    expect(auditEvents.some((e) => e.action === 'DELETE' && e.recordId === seeded.id)).toBe(true);
    expect(auditEvents.some((e) => e.action === 'CREATE' && e.recordId === replacement.id)).toBe(true);
  });

  test('replace_expected_version 过期 → 409，旧行保留', async () => {
    const seeded = await insertScenarioAssignment({
      role_id: seRoleId,
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    });

    const res = await request.post('/api/assignments').send({
      project_id: PROJECT_ID,
      person_id: PERSON_B_ID,
      role_id: seRoleId,
      allocation_percentage: 30,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      replace_assignment_id: seeded.id,
      replace_expected_version: 99,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_VERSION_CONFLICT');
    expect(await db('scenario_project_assignments').where('id', seeded.id).first()).toBeTruthy();
  });
});

describe('I02r 非调度字段更新不重写 computed', () => {
  test('allocation-only 更新成功且 computed 保持不变', async () => {
    const seeded = await insertScenarioAssignment({
      start_date: 'not-a-date',
      end_date: 'not-a-date',
      computed_start_date: '2026-03-01',
      computed_end_date: '2026-03-31',
    });

    const res = await request
      .put(`/api/assignments/${seeded.id}`)
      .send({ allocation_percentage: 45 });
    expect(res.status).toBe(200);

    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(Number(row.allocation_percentage)).toBe(45);
    expect(row.computed_start_date).toBe('2026-03-01');
    expect(row.computed_end_date).toBe('2026-03-31');
    expect(row.start_date).toBe('not-a-date');
  });
});
