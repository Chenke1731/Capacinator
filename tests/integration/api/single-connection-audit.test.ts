/**
 * P2-2（I02j/I02l）：单连接池（max:1）下的审计位置物理防线。
 *
 * 生产 SQLite 池 max=1：控制器事务持有唯一连接时，任何在事务回调内通过
 * this.db 另取连接的调用（服务刷新、logAuditEvent 持久化）都会等
 * acquireConnectionTimeout 后失败。本测试用独立的 :memory: 库 + max:1 +
 * 真实 audit 插入，钉住：
 *  - 刷新服务必须使用传入 trx（否则 500/超时）；
 *  - 审计必须在事务提交后执行（否则 500/超时）。
 * 变异自证（人工记录于台账）：去掉控制器 {trx} 或把 await logAuditEvent
 * 移入 db.transaction → 本用例红。
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import knex, { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { ProjectPhasesController } from '../../../src/server/api/controllers/ProjectPhasesController';

const PHASE_ID = 'p2b-phase-a';
const TIMELINE_ID = 'p2b-timeline-a';
const PROJECT_ID = 'p2b-project';
const ASSIGNMENT_ID = 'p2b-assignment';

let database: Knex;
let app: express.Application;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  database = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
    // 生产 acquireConnectionTimeout=30s；测试压到 500ms 让回归快速可见
    acquireConnectionTimeout: 500,
  });

  await database.schema.createTable('project_phases', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
    table.string('description');
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
  await database.schema.createTable('scenario_project_assignments', (table) => {
    table.string('id').primary();
    table.string('scenario_id');
    table.string('project_id');
    table.string('person_id');
    table.string('phase_id');
    table.string('assignment_date_mode');
    table.date('computed_start_date');
    table.date('computed_end_date');
  });
  await database.schema.createTable('audit_log', (table) => {
    table.string('id').primary();
    table.string('table_name');
    table.string('record_id');
    table.string('action');
    table.text('comment');
    table.datetime('changed_at');
  });

  await database('project_phases').insert({ id: PHASE_ID, name: 'P2B Phase A' });
  await database('project_phases_timeline').insert({
    id: TIMELINE_ID,
    project_id: PROJECT_ID,
    phase_id: PHASE_ID,
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    phase_source: 'template',
  });
  await database('scenario_project_assignments').insert({
    id: ASSIGNMENT_ID,
    scenario_id: 'baseline',
    project_id: PROJECT_ID,
    person_id: 'p2b-person',
    phase_id: PHASE_ID,
    assignment_date_mode: 'phase',
    computed_start_date: '2026-03-01',
    computed_end_date: '2026-03-31',
  });

  const controller = new ProjectPhasesController();
  (controller as any).db = database;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 'p2b-user', name: 'P2B' };
    (req as any).logger = { info() {}, debug() {}, warn() {}, error() {} };
    // 真实持久化：走同一个 max:1 池；若在事务内调用会等连接超时
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
  app.put('/api/project-phases/:id', (req, res) => controller.update(req, res));
  request = supertest(app);
});

afterAll(async () => {
  await database.destroy();
});

describe('max:1 单连接池：刷新 + 提交后审计', () => {
  test('阶段更新在 500ms 内完成，computed 刷新且审计落库', async () => {
    const res = await request
      .put(`/api/project-phases/${TIMELINE_ID}`)
      .send({ start_date: '2026-03-05', end_date: '2026-04-04' })
      .timeout(3000);

    expect(res.status).toBe(200);

    const timeline = await database('project_phases_timeline').where('id', TIMELINE_ID).first();
    expect(timeline.start_date).toBe('2026-03-05');
    expect(timeline.end_date).toBe('2026-04-04');

    const assignment = await database('scenario_project_assignments').where('id', ASSIGNMENT_ID).first();
    expect(assignment.computed_start_date).toBe('2026-03-05');
    expect(assignment.computed_end_date).toBe('2026-04-04');

    const audits = await database('audit_log').where({
      table_name: 'scenario_project_assignments',
      record_id: ASSIGNMENT_ID,
    });
    expect(audits).toHaveLength(1);
  });
});
