/**
 * I02a/D18 路线 B：computed 日期写点 + 刷新接线集成守卫。
 *
 * 事故（P0 F1）：AssignmentsController.update 计算了 computed 日期但从未落库，
 * 阶段/项目日期变化后分配仍停留在旧窗口（dev 库实证漂移 3 周+，利用率
 * 265% vs 真值 145%）。本套件覆盖：
 *  A. 写路径落库：create / update / bulk / scenario upsert 的 computed 与
 *     共享原语一致（update 是最关键回归——去掉 `...computedDates` 必红）。
 *  B. 刷新接线：阶段时间线 update 后 phase 模式分配跨场景刷新，无变化不写
 *     不审计；项目 aspiration update 后 project 模式分配刷新。
 *  C. 事务边界：刷新服务在传入 trx 时绝不碰 this.db（单连接池死锁防线）。
 *  D. 原子性/护栏：刷新失败时时间线写回滚；被 phase 模式分配引用的阶段
 *     删除返回 409 引用清单。
 *  E. cascade：applyCascade 在同事务刷新并返回可审计变更。
 */
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';
import { ProjectPhasesController } from '../../../src/server/api/controllers/ProjectPhasesController';
import { ProjectsController } from '../../../src/server/api/controllers/ProjectsController';
import { ScenariosController } from '../../../src/server/api/controllers/ScenariosController';
import { ProjectPhaseDependenciesController } from '../../../src/server/api/controllers/ProjectPhaseDependenciesController';
import { AssignmentRecalculationService } from '../../../src/server/services/AssignmentRecalculationService';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_ID = `i02a-person-${SUFFIX}`;
const ROLE_ID = `i02a-role-${SUFFIX}`;
const PROJECT_ID = `i02a-project-${SUFFIX}`;
const PHASE_A_ID = `i02a-phase-a-${SUFFIX}`;
const PHASE_B_ID = `i02a-phase-b-${SUFFIX}`;
const TIMELINE_A_ID = `i02a-tl-a-${SUFFIX}`;
const TIMELINE_B_ID = `i02a-tl-b-${SUFFIX}`;
const BRANCH_ID = `i02a-branch-${SUFFIX}`;
const PROJECT2_ID = `i02a-project2-${SUFFIX}`;
const PHASE2_ID = `i02a-phase2-${SUFFIX}`;
const TIMELINE2_ID = `i02a-tl2-${SUFFIX}`;
const PHASE_NO_TIMELINE_ID = `i02a-phase3-${SUFFIX}`;

const A_START = '2026-03-01';
const A_END = '2026-03-31';
const B_START = '2026-05-01';
const B_END = '2026-05-31';
const ASPIRATION_START = '2026-06-01';
const ASPIRATION_FINISH = '2026-08-31';

type AuditEvent = {
  table: string;
  recordId: string;
  action: string;
  oldValues: any;
  newValues: any;
  comment?: string;
};

let app: express.Application;
let request: ReturnType<typeof supertest>;
let auditEvents: AuditEvent[] = [];

function makeApp() {
  const assignments = new AssignmentsController();
  const phases = new ProjectPhasesController();
  const projects = new ProjectsController();
  const scenarios = new ScenariosController();
  const dependencies = new ProjectPhaseDependenciesController();
  for (const controller of [assignments, phases, projects, scenarios, dependencies]) {
    (controller as any).db = db;
  }

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    (req as any).user = { id: PERSON_ID, name: 'I02A Tester' };
    (req as any).logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    (req as any).logAuditEvent = async (
      table: string,
      recordId: string,
      action: string,
      oldValues: any,
      newValues: any,
      comment?: string
    ) => {
      auditEvents.push({ table, recordId, action, oldValues, newValues, comment });
    };
    next();
  });

  const assignmentRoutes = express.Router();
  assignmentRoutes.post('/', (req, res) => assignments.create(req, res));
  assignmentRoutes.post('/bulk', (req, res) => assignments.bulkAssign(req, res));
  assignmentRoutes.put('/:id', (req, res) => assignments.update(req, res));
  testApp.use('/api/assignments', assignmentRoutes);

  const phaseRoutes = express.Router();
  phaseRoutes.post('/bulk', (req, res) => phases.bulkUpdate(req, res));
  phaseRoutes.put('/:id', (req, res) => phases.update(req, res));
  phaseRoutes.delete('/:id', (req, res) => phases.delete(req, res));
  testApp.use('/api/project-phases', phaseRoutes);

  const projectRoutes = express.Router();
  projectRoutes.put('/:id', (req, res) => projects.update(req, res));
  projectRoutes.delete('/:id/phases/:phaseTimelineId', (req, res) => projects.deleteProjectPhase(req, res));
  testApp.use('/api/projects', projectRoutes);

  const scenarioRoutes = express.Router();
  scenarioRoutes.post('/:id/assignments', (req, res) => scenarios.upsertAssignment(req, res));
  testApp.use('/api/scenarios', scenarioRoutes);

  const dependencyRoutes = express.Router();
  dependencyRoutes.post('/apply-cascade', (req, res) => dependencies.applyCascade(req, res));
  testApp.use('/api/project-phase-dependencies', dependencyRoutes);

  return testApp;
}

async function insertAssignment(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? randomUUID();
  const row = {
    id,
    scenario_id: BASELINE_SCENARIO_ID,
    project_id: PROJECT_ID,
    person_id: PERSON_ID,
    role_id: ROLE_ID,
    phase_id: PHASE_A_ID,
    allocation_percentage: 20,
    status: 'active',
    assignment_date_mode: 'phase',
    start_date: null,
    end_date: null,
    computed_start_date: A_START,
    computed_end_date: A_END,
    change_type: 'added',
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
    name: `I02A Person ${SUFFIX}`,
    email: `i02a-${SUFFIX}@example.com`,
    worker_type: 'FTE',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await db('roles').insert({
    id: ROLE_ID,
    name: `I02A Role ${SUFFIX}`,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await db('project_phases').insert([
    { id: PHASE_A_ID, name: `I02A 分析 ${SUFFIX}`, order_index: 1 },
    { id: PHASE_B_ID, name: `I02A 开发 ${SUFFIX}`, order_index: 2 },
    { id: PHASE_NO_TIMELINE_ID, name: `I02A 孤儿 ${SUFFIX}`, order_index: 3 },
    { id: PHASE2_ID, name: `I02A 他项目阶段 ${SUFFIX}`, order_index: 1 },
  ]);
  await db('projects').insert({
    id: PROJECT_ID,
    name: `I02A Project ${SUFFIX}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    aspiration_start: ASPIRATION_START,
    aspiration_finish: ASPIRATION_FINISH,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await db('projects').insert({
    id: PROJECT2_ID,
    name: `I02A Project 2 ${SUFFIX}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    aspiration_start: '2026-01-01',
    aspiration_finish: '2026-02-01',
    created_at: new Date(),
    updated_at: new Date(),
  });
  await db('project_phases_timeline').insert({
    id: TIMELINE2_ID,
    project_id: PROJECT2_ID,
    phase_id: PHASE2_ID,
    start_date: '2026-01-01',
    end_date: '2026-01-31',
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
    name: `I02A Branch ${SUFFIX}`,
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
  auditEvents = [];
  await db('scenario_project_assignments').where('project_id', PROJECT_ID).del();
  await db('project_phases_timeline').where('project_id', PROJECT_ID).del();
  await db('project_phases_timeline').insert([
    { id: TIMELINE_A_ID, project_id: PROJECT_ID, phase_id: PHASE_A_ID, start_date: A_START, end_date: A_END },
    { id: TIMELINE_B_ID, project_id: PROJECT_ID, phase_id: PHASE_B_ID, start_date: B_START, end_date: B_END },
  ]);
  await db('projects').where('id', PROJECT_ID).update({
    aspiration_start: ASPIRATION_START,
    aspiration_finish: ASPIRATION_FINISH,
  });
});

// 内存测试库随 setup.afterAll 销毁，无需逐表清理；beforeEach 已重置本套件数据。

describe('G-A 写路径落库 computed', () => {
  test('create（phase 模式）→ computed 取阶段时间线', async () => {
    const res = await request.post('/api/assignments').send({
      project_id: PROJECT_ID,
      person_id: PERSON_ID,
      role_id: ROLE_ID,
      phase_id: PHASE_A_ID,
      allocation_percentage: 20,
      assignment_date_mode: 'phase',
    });
    expect(res.status).toBe(200);
    const id = String(res.body.data.id).replace(/^spa-/, '');
    const row = await db('scenario_project_assignments').where('id', id).first();
    expect(row.computed_start_date).toBe(A_START);
    expect(row.computed_end_date).toBe(A_END);
  });

  test('update（phase A→B）→ computed 随更新落库（P0 F1 回归）', async () => {
    const seeded = await insertAssignment();
    const res = await request.put(`/api/assignments/${seeded.id}`).send({
      assignment_date_mode: 'phase',
      phase_id: PHASE_B_ID,
    });
    expect(res.status).toBe(200);
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.phase_id).toBe(PHASE_B_ID);
    expect(row.computed_start_date).toBe(B_START);
    expect(row.computed_end_date).toBe(B_END);
  });

  test('update（fixed 日期）→ computed 跟随新起止', async () => {
    const seeded = await insertAssignment({ assignment_date_mode: 'fixed', start_date: '2026-04-01', end_date: '2026-04-10' });
    const res = await request.put(`/api/assignments/${seeded.id}`).send({
      assignment_date_mode: 'fixed',
      start_date: '2026-04-05',
      end_date: '2026-04-20',
    });
    expect(res.status).toBe(200);
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.computed_start_date).toBe('2026-04-05');
    expect(row.computed_end_date).toBe('2026-04-20');
  });

  test('update（切 project 模式）→ computed 取 aspiration', async () => {
    const seeded = await insertAssignment();
    const res = await request.put(`/api/assignments/${seeded.id}`).send({
      assignment_date_mode: 'project',
    });
    expect(res.status).toBe(200);
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.computed_start_date).toBe(ASPIRATION_START);
    expect(row.computed_end_date).toBe(ASPIRATION_FINISH);
  });

  test('bulkAssign → fixed 模式 + computed 落库', async () => {
    const res = await request.post('/api/assignments/bulk').send({
      project_id: PROJECT_ID,
      assignments: [
        {
          person_id: PERSON_ID,
          role_id: ROLE_ID,
          allocation_percentage: 15,
          start_date: '2026-07-01',
          end_date: '2026-07-10',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.summary.successful).toBe(1);
    const row = await db('scenario_project_assignments').where('project_id', PROJECT_ID).first();
    expect(row.assignment_date_mode).toBe('fixed');
    expect(row.computed_start_date).toBe('2026-07-01');
    expect(row.computed_end_date).toBe('2026-07-10');
  });

  test('scenario upsert（project 模式）→ computed 落库', async () => {
    const res = await request.post(`/api/scenarios/${BRANCH_ID}/assignments`).send({
      project_id: PROJECT_ID,
      person_id: PERSON_ID,
      role_id: ROLE_ID,
      allocation_percentage: 25,
      assignment_date_mode: 'project',
    });
    expect(res.status).toBe(200);
    const row = await db('scenario_project_assignments').where({ scenario_id: BRANCH_ID, project_id: PROJECT_ID }).first();
    expect(row.computed_start_date).toBe(ASPIRATION_START);
    expect(row.computed_end_date).toBe(ASPIRATION_FINISH);
  });
});

describe('G-B 阶段时间线刷新接线（跨场景）', () => {
  test('阶段更新 → baseline+branch phase 模式分配同事务刷新，并逐条审计', async () => {
    await insertAssignment({ id: `i02a-a-${SUFFIX}-base` });
    await insertAssignment({ id: `i02a-a-${SUFFIX}-branch`, scenario_id: BRANCH_ID });

    const res = await request.put(`/api/project-phases/${TIMELINE_A_ID}`).send({
      start_date: '2026-03-10',
      end_date: '2026-04-09',
    });
    expect(res.status).toBe(200);

    const rows = await db('scenario_project_assignments').where('project_id', PROJECT_ID).orderBy('id');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.computed_start_date).toBe('2026-03-10');
      expect(row.computed_end_date).toBe('2026-04-09');
    }
    const assignmentAudits = auditEvents.filter(
      (e) => e.table === 'scenario_project_assignments' && e.action === 'UPDATE'
    );
    expect(assignmentAudits).toHaveLength(2);
    expect(assignmentAudits.map((e) => e.recordId).sort()).toEqual(
      [`i02a-a-${SUFFIX}-base`, `i02a-a-${SUFFIX}-branch`].sort()
    );
  });

  test('阶段日期无变化 → 不写分配、不产生分配审计', async () => {
    await insertAssignment();
    const res = await request.put(`/api/project-phases/${TIMELINE_A_ID}`).send({
      start_date: A_START,
      end_date: A_END,
    });
    expect(res.status).toBe(200);
    const assignmentAudits = auditEvents.filter((e) => e.table === 'scenario_project_assignments');
    expect(assignmentAudits).toHaveLength(0);
  });

  test('bulkUpdate → 同事务刷新 + 提交后逐条审计', async () => {
    const seeded = await insertAssignment();
    const res = await request.post('/api/project-phases/bulk').send({
      updates: [{ id: TIMELINE_A_ID, start_date: '2026-03-05', end_date: '2026-04-04' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toHaveLength(1);
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.computed_start_date).toBe('2026-03-05');
    expect(row.computed_end_date).toBe('2026-04-04');
    expect(
      auditEvents.filter((e) => e.table === 'scenario_project_assignments' && e.recordId === seeded.id)
    ).toHaveLength(1);
  });

  test('阶段变化只动 phase 模式行：fixed 行原样保留', async () => {
    const fixed = await insertAssignment({
      id: `i02a-fixed-${SUFFIX}`,
      assignment_date_mode: 'fixed',
      phase_id: null,
      start_date: '2026-02-01',
      end_date: '2026-02-10',
      computed_start_date: '2026-02-01',
      computed_end_date: '2026-02-10',
    });
    const phase = await insertAssignment();
    const res = await request.put(`/api/project-phases/${TIMELINE_A_ID}`).send({
      start_date: '2026-03-11',
      end_date: '2026-04-10',
    });
    expect(res.status).toBe(200);
    const fixedRow = await db('scenario_project_assignments').where('id', fixed.id).first();
    expect(fixedRow.computed_start_date).toBe('2026-02-01');
    expect(fixedRow.computed_end_date).toBe('2026-02-10');
    const phaseRow = await db('scenario_project_assignments').where('id', phase.id).first();
    expect(phaseRow.computed_start_date).toBe('2026-03-11');
  });

  test('孤儿 phase 行（无时间线）跳过刷新，不写 NULL', async () => {
    const orphan = await insertAssignment({
      id: `i02a-orphan-${SUFFIX}`,
      phase_id: PHASE_NO_TIMELINE_ID,
      computed_start_date: '2026-01-05',
      computed_end_date: '2026-01-06',
    });
    const res = await request.put(`/api/project-phases/${TIMELINE_A_ID}`).send({
      start_date: '2026-03-12',
      end_date: '2026-04-11',
    });
    expect(res.status).toBe(200);
    const row = await db('scenario_project_assignments').where('id', orphan.id).first();
    expect(row.computed_start_date).toBe('2026-01-05');
    expect(row.computed_end_date).toBe('2026-01-06');
  });
});

describe('G-B2 阶段 bulkUpdate / updateProjectPhases', () => {
  test('updateProjectPhases → 返回 phase_changes 并刷新分配', async () => {
    const { ProjectPhaseCascadeService } = await import(
      '../../../src/server/services/ProjectPhaseCascadeService'
    );
    const seeded = await insertAssignment();
    const service = new ProjectPhaseCascadeService(db as any);
    const result = await service.updateProjectPhases(PROJECT_ID, [
      { phase_id: PHASE_A_ID, start_date: new Date('2026-03-18'), end_date: new Date('2026-04-17') },
    ]);
    expect(result.phase_changes).toHaveLength(1);
    expect(result.phase_changes[0]).toMatchObject({
      phase_id: PHASE_A_ID,
      new_start_date: '2026-03-18',
      new_end_date: '2026-04-17',
    });
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.computed_start_date).toBe('2026-03-18');
    expect(row.computed_end_date).toBe('2026-04-17');
  });
});
describe('G-B3 项目 aspiration 刷新', () => {
  test('项目 aspiration 更新 → project 模式分配刷新并审计', async () => {
    const seeded = await insertAssignment({
      assignment_date_mode: 'project',
      phase_id: null,
      computed_start_date: '2026-01-01',
      computed_end_date: '2026-01-31',
    });
    const res = await request.put(`/api/projects/${PROJECT_ID}`).send({
      aspiration_start: '2026-09-01',
      aspiration_finish: '2026-11-30',
    });
    expect(res.status).toBe(200);
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.computed_start_date).toBe('2026-09-01');
    expect(row.computed_end_date).toBe('2026-11-30');
    const assignmentAudits = auditEvents.filter(
      (e) => e.table === 'scenario_project_assignments' && e.recordId === seeded.id
    );
    expect(assignmentAudits).toHaveLength(1);
    expect(assignmentAudits[0].comment).toBe('recomputed from project aspiration');
  });
});

describe('G-C 事务边界（单连接池死锁防线）', () => {
  test('传入 trx 时刷新服务绝不访问 this.db', async () => {
    await insertAssignment({
      scenario_id: BRANCH_ID,
      id: `i02a-trx-${SUFFIX}`,
      computed_start_date: '2026-01-01',
      computed_end_date: '2026-01-31',
    });
    const forbidden = new Proxy(
      {},
      {
        get() {
          throw new Error('this.db 被访问：事务内应只使用传入的 trx');
        },
      }
    );
    const service = new AssignmentRecalculationService(forbidden as any);

    const changes = await db.transaction(async (trx) => {
      return service.recalculateForPhaseTimelineChange(PROJECT_ID, [PHASE_A_ID], { trx });
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].new.start).toBe(A_START);
  });

  test('project 模式刷新同样只走传入 trx', async () => {
    await insertAssignment({
      id: `i02a-trx-project-${SUFFIX}`,
      assignment_date_mode: 'project',
      phase_id: null,
      computed_start_date: '2026-01-01',
      computed_end_date: '2026-01-31',
    });
    const forbidden = new Proxy(
      {},
      {
        get() {
          throw new Error('this.db 被访问：事务内应只使用传入的 trx');
        },
      }
    );
    const service = new AssignmentRecalculationService(forbidden as any);
    const changes = await db.transaction(async (trx) => {
      return service.recalculateForProjectDateChange(PROJECT_ID, { trx });
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].new.start).toBe(ASPIRATION_START);
  });
});

describe('G-D 原子性与删除护栏', () => {
  test('刷新失败 → 阶段时间线写回滚（不留半状态）', async () => {
    await insertAssignment();
    await db.raw(`
      CREATE TRIGGER i02a_block_computed_update
      BEFORE UPDATE OF computed_start_date ON scenario_project_assignments
      BEGIN
        SELECT RAISE(ABORT, 'i02a simulated refresh failure');
      END;
    `);
    try {
      const res = await request.put(`/api/project-phases/${TIMELINE_A_ID}`).send({
        start_date: '2026-03-20',
        end_date: '2026-04-19',
      });
      expect(res.status).toBe(500);
    } finally {
      await db.raw('DROP TRIGGER i02a_block_computed_update');
    }
    const timeline = await db('project_phases_timeline').where('id', TIMELINE_A_ID).first();
    expect(timeline.start_date).toBe(A_START);
    expect(timeline.end_date).toBe(A_END);
  });

  test('custom-phase 删除端点同规则 → 409（P2-6）', async () => {
    await insertAssignment();
    const blocked = await request.delete(`/api/projects/${PROJECT_ID}/phases/${TIMELINE_A_ID}`);
    expect(blocked.status).toBe(409);
  });

  test('被 phase 模式分配引用 → 删除阶段 409 带引用清单', async () => {
    const seeded = await insertAssignment();
    const blocked = await request.delete(`/api/project-phases/${TIMELINE_A_ID}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.references).toHaveLength(1);
    expect(blocked.body.references[0].id).toBe(seeded.id);

    await db('scenario_project_assignments').where('id', seeded.id).del();
    const allowed = await request.delete(`/api/project-phases/${TIMELINE_A_ID}`);
    expect([200, 204]).toContain(allowed.status);
    const gone = await db('project_phases_timeline').where('id', TIMELINE_A_ID).first();
    expect(gone).toBeUndefined();
  });
});

describe('G-E cascade 同事务刷新', () => {
  test('cascade 拒绝跨项目 timeline（400，他项目零变化；P2-4）', async () => {
    const res = await request.post('/api/project-phase-dependencies/apply-cascade').send({
      project_id: PROJECT_ID,
      cascade_data: {
        affected_phases: [
          {
            phase_timeline_id: TIMELINE2_ID,
            phase_name: '他项目阶段',
            current_start_date: '2026-01-01',
            current_end_date: '2026-01-31',
            new_start_date: '2026-01-10',
            new_end_date: '2026-02-09',
            dependency_type: 'finish-to-start',
            lag_days: 0,
            affects_count: 0,
          },
        ],
        cascade_count: 1,
        circular_dependencies: [],
      },
    });
    expect(res.status).toBe(400);
    const other = await db('project_phases_timeline').where('id', TIMELINE2_ID).first();
    expect(other.start_date).toBe('2026-01-01');
    expect(other.end_date).toBe('2026-01-31');
  });

  test('applyCascade → 时间线更新 + 分配刷新 + 返回审计变更', async () => {
    const seeded = await insertAssignment();
    const res = await request.post('/api/project-phase-dependencies/apply-cascade').send({
      project_id: PROJECT_ID,
      cascade_data: {
        affected_phases: [
          {
            phase_timeline_id: TIMELINE_A_ID,
            phase_name: '分析',
            current_start_date: A_START,
            current_end_date: A_END,
            new_start_date: '2026-03-15',
            new_end_date: '2026-04-14',
            dependency_type: 'finish-to-start',
            lag_days: 0,
            affects_count: 0,
          },
        ],
        cascade_count: 1,
        circular_dependencies: [],
      },
    });
    expect(res.status).toBe(200);
    const timeline = await db('project_phases_timeline').where('id', TIMELINE_A_ID).first();
    expect(timeline.start_date).toBe('2026-03-15');
    expect(timeline.end_date).toBe('2026-04-14');
    const row = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(row.computed_start_date).toBe('2026-03-15');
    expect(row.computed_end_date).toBe('2026-04-14');
    expect(auditEvents.filter((e) => e.table === 'project_phases_timeline')).toHaveLength(1);
    expect(
      auditEvents.filter((e) => e.table === 'scenario_project_assignments' && e.recordId === seeded.id)
    ).toHaveLength(1);
  });
});
