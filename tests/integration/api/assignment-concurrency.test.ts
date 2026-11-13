/**
 * I02m/P1：并发编辑不得把 computed 覆盖回旧阶段日期。
 *
 * 旧实现：AssignmentsController.update 在事务外 compute 新日期，再事务外写；
 * 另一请求在两者之间改阶段并刷新 computed（刷新不 bump version）后，本请求
 * 仍用旧日期+旧 version 写入成功 → 阶段四月、分配三月。
 *
 * 本用例用 :memory: + pool max:1 串行化复现：
 *  - 在分配请求的 compute 后注入延迟（此时新实现已持有事务连接）；
 *  - 延迟窗口内发起阶段更新（四月）；
 *  - 新实现：A 先提交（三月），B 随后刷新为四月；旧实现：B 先刷新，A 再覆盖回三月。
 * 断言最终 computed = 四月（固定 wording 见测试名）。
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import knex, { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';
import { ProjectPhasesController } from '../../../src/server/api/controllers/ProjectPhasesController';

const PHASE_ID = 'i02m-phase';
const TIMELINE_ID = 'i02m-timeline';
const PROJECT_ID = 'i02m-project';
const PERSON_ID = 'i02m-person';
const ROLE_ID = 'i02m-role';
const ASSIGNMENT_ID = 'i02m-assignment';

let database: Knex;
let app: express.Application;
let request: ReturnType<typeof supertest>;
let assignmentController: AssignmentsController;

beforeAll(async () => {
  database = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
    acquireConnectionTimeout: 1000,
  });

  await database.schema.createTable('project_phases', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
  });
  await database.schema.createTable('project_phases_timeline', (table) => {
    table.string('id').primary();
    table.string('project_id').notNullable();
    table.string('phase_id').notNullable();
    table.string('start_date').notNullable();
    table.string('end_date').notNullable();
    table.string('phase_source').defaultTo('template');
    table.string('template_phase_id');
    table.integer('is_deletable').defaultTo(1);
    table.integer('original_duration_days');
    table.integer('template_min_duration_days');
    table.integer('template_max_duration_days');
    table.integer('is_duration_customized').defaultTo(0);
    table.integer('is_name_customized').defaultTo(0);
    table.text('template_compliance_data');
    table.datetime('created_at');
    table.datetime('updated_at');
  });
  await database.schema.createTable('people', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
    table.string('email');
    table.string('worker_type').defaultTo('FTE');
    table.float('default_availability_percentage').defaultTo(100);
    table.float('default_hours_per_day').defaultTo(8);
  });
  await database.schema.createTable('roles', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
  });
  await database.schema.createTable('person_availability_overrides', (table) => {
    table.string('person_id').notNullable();
    table.string('start_date').notNullable();
    table.string('end_date').notNullable();
    table.float('availability_percentage').notNullable();
    table.integer('is_approved').defaultTo(0);
  });
  await database.schema.createTable('projects', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
  });
  await database.schema.createTable('scenario_project_assignments', (table) => {
    table.string('id').primary();
    table.string('scenario_id');
    table.string('project_id');
    table.string('person_id');
    table.string('role_id');
    table.string('phase_id');
    table.float('allocation_percentage').defaultTo(50);
    table.string('status').defaultTo('active');
    table.integer('is_primary').defaultTo(0);
    table.string('assignment_date_mode').defaultTo('phase');
    table.date('start_date');
    table.date('end_date');
    table.date('computed_start_date');
    table.date('computed_end_date');
    table.text('notes');
    table.string('change_type').defaultTo('added');
    table.string('base_assignment_id');
    table.integer('version').notNullable().defaultTo(1);
    table.datetime('created_at');
    table.datetime('updated_at');
  });
  await database.schema.createTable('audit_log', (table) => {
    table.string('id').primary();
    table.string('table_name');
    table.string('record_id');
    table.string('action');
    table.text('comment');
    table.datetime('changed_at');
  });

  await database('project_phases').insert({ id: PHASE_ID, name: 'I02M Phase' });
  await database('project_phases_timeline').insert({
    id: TIMELINE_ID,
    project_id: PROJECT_ID,
    phase_id: PHASE_ID,
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    phase_source: 'template',
  });
  await database('people').insert({
    id: PERSON_ID,
    name: 'I02M Person',
    email: 'i02m@example.com',
    worker_type: 'FTE',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
  });
  await database('roles').insert({ id: ROLE_ID, name: 'I02M Role' });
  await database('projects').insert({ id: PROJECT_ID, name: 'I02M Project' });
  await database('scenario_project_assignments').insert({
    id: ASSIGNMENT_ID,
    scenario_id: 'baseline-0000-0000-0000-000000000000',
    project_id: PROJECT_ID,
    person_id: PERSON_ID,
    role_id: ROLE_ID,
    phase_id: PHASE_ID,
    allocation_percentage: 50,
    status: 'active',
    assignment_date_mode: 'phase',
    computed_start_date: '2026-03-01',
    computed_end_date: '2026-03-31',
    notes: 'initial',
    version: 1,
  });

  const assignments = new AssignmentsController();
  (assignments as any).db = database;
  assignmentController = assignments;
  const phases = new ProjectPhasesController();
  (phases as any).db = database;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 'i02m-user', name: 'I02M' };
    (req as any).logger = { info() {}, debug() {}, warn() {}, error() {} };
    (req as any).logAuditEvent = async (
      table: string,
      recordId: string,
      action: string,
      _oldValues: any,
      _newValues: any,
      comment?: string
    ) => {
      await database('audit_log').insert({
        id: randomUUID(),
        table_name: table,
        record_id: String(recordId),
        action,
        comment: comment ?? null,
        changed_at: new Date(),
      });
    };
    next();
  });
  app.put('/api/assignments/:id', (req, res) => assignments.update(req, res));
  app.put('/api/project-phases/:id', (req, res) => phases.update(req, res));
  request = supertest(app);

  // 在 compute 之后插入窗口：旧实现此时连接空闲，B 可完成刷新；新实现
  // 已持有事务连接，B 必须等 A 提交。仅作用于本实例。
  const proto = Object.getPrototypeOf(assignments);
  const originalCompute = proto.computeAssignmentDates;
  let computeFinished = false;
  (assignments as any).computeAssignmentDates = async function (assignment: any, conn: any) {
    const result = await originalCompute.call(this, assignment, conn);
    computeFinished = true;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return result;
  };
  (assignments as any).__computeFinished = () => computeFinished;
});

afterAll(async () => {
  await database.destroy();
});

describe('P1 并发：阶段改日期 vs 分配保存', () => {
  test('分配请求先算旧日期，阶段更新并发完成，最终 computed 必须为四月', async () => {
    // supertest Test 是惰性 thenable：必须立刻挂 then 才会真正发请求
    const assignmentResPromise = request
      .put(`/api/assignments/${ASSIGNMENT_ID}`)
      // I02r: 只有调度字段（日期/mode/phase）触碰才重算；notes-only 不再触发
      // compute。用 mode 字段保持“保存会重算日期”的并发前提。
      .send({ assignment_date_mode: 'phase', notes: 'race-edit' })
      .then((res) => res);
    const deadline = Date.now() + 5000;
    while (!(assignmentController as any).__computeFinished()) {
      if (Date.now() > deadline) {
        throw new Error('assignment compute did not run before deadline');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const phaseResPromise = request
      .put(`/api/project-phases/${TIMELINE_ID}`)
      .send({ start_date: '2026-04-01', end_date: '2026-04-30' });

    const [assignmentRes, phaseRes] = await Promise.all([assignmentResPromise, phaseResPromise]);
    expect(assignmentRes.status).toBe(200);
    expect(phaseRes.status).toBe(200);

    const timeline = await database('project_phases_timeline').where('id', TIMELINE_ID).first();
    expect(timeline.start_date).toBe('2026-04-01');

    const row = await database('scenario_project_assignments').where('id', ASSIGNMENT_ID).first();
    expect(row.notes).toBe('race-edit');
    expect(row.computed_start_date).toBe('2026-04-01');
    expect(row.computed_end_date).toBe('2026-04-30');
  });
});
