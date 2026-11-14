/**
 * 撤销替换原子事务（DeepSeek P1，真迁移库）：
 * 客户端"删新行 + 重建旧行"两条请求非原子——删除成功、重建 409 时两人
 * 分配全丢。本端点把两步收进同一事务：
 * - 成功：替换行删除、旧行按原字段重建（fixed/phase 两种模式），双审计；
 * - 旧行同键已被占（DUPLICATE）：409 且**整体回滚**——替换行仍在；
 * - 版本冲突：409 且无副作用；
 * - 未找到替换行：404。
 * 不变式：任一步失败后，"替换行存在"这一撤销前状态必须原样保留。
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_OLD_ID = `i03d-old-${SUFFIX}`;
const PERSON_NEW_ID = `i03d-new-${SUFFIX}`;
const ROLE_ID = `i03d-role-${SUFFIX}`;
const PROJECT_ID = `i03d-project-${SUFFIX}`;
const PHASE_ID = `i03d-phase-${SUFFIX}`;
const TIMELINE_ID = `i03d-timeline-${SUFFIX}`;

type AuditEvent = { table: string; recordId: string; action: string };
let request: ReturnType<typeof supertest>;
let auditEvents: AuditEvent[] = [];

async function insertAssignment(overrides: Record<string, any> = {}) {
  const row = {
    id: randomUUID(),
    scenario_id: BASELINE_SCENARIO_ID,
    project_id: PROJECT_ID,
    person_id: PERSON_NEW_ID,
    role_id: ROLE_ID,
    phase_id: null,
    allocation_percentage: 20,
    status: 'active',
    assignment_date_mode: 'fixed',
    start_date: '2026-04-01',
    end_date: '2026-04-30',
    computed_start_date: '2026-04-01',
    computed_end_date: '2026-04-30',
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
  await db('scenario_project_assignments').insert(row);
  return row;
}

function incumbentPayload(overrides: Record<string, any> = {}) {
  return {
    person_id: PERSON_OLD_ID,
    role_id: ROLE_ID,
    phase_id: null,
    allocation_percentage: 60,
    assignment_date_mode: 'fixed',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    ...overrides,
  };
}

beforeAll(async () => {
  await db('people').insert([
    {
      id: PERSON_OLD_ID,
      name: `I03D Old ${SUFFIX}`,
      email: `i03d-old-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
    {
      id: PERSON_NEW_ID,
      name: `I03D New ${SUFFIX}`,
      email: `i03d-new-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
  ]);
  await db('roles').insert({ id: ROLE_ID, name: `I03D Role ${SUFFIX}` });
  await db('projects').insert({
    id: PROJECT_ID,
    name: `I03D Project ${SUFFIX}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    aspiration_start: '2026-03-01',
    aspiration_finish: '2026-05-31',
  });
  await db('project_phases').insert({ id: PHASE_ID, name: `I03D Phase ${SUFFIX}`, order_index: 1 });
  await db('project_phases_timeline').insert({
    id: TIMELINE_ID,
    project_id: PROJECT_ID,
    phase_id: PHASE_ID,
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
    });
  }

  const controller = new AssignmentsController();
  (controller as any).db = db;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: PERSON_OLD_ID, name: 'I03D Tester' };
    (req as any).logger = { info() {}, debug() {}, warn() {}, error() {} };
    (req as any).logAuditEvent = async (table: string, recordId: string, action: string) => {
      auditEvents.push({ table, recordId, action });
    };
    next();
  });
  app.post('/api/assignments/:id/undo-replace', (req, res) => controller.undoReplace(req as any, res));
  request = supertest(app);
});

beforeEach(async () => {
  auditEvents = [];
  await db('scenario_project_assignments').where({ scenario_id: BASELINE_SCENARIO_ID }).del();
});

describe('I03D 撤销替换原子事务', () => {
  test('成功：替换行删除、旧行按原字段重建（fixed），DELETE+CREATE 双审计', async () => {
    const replacement = await insertAssignment();

    const res = await request
      .post(`/api/assignments/spa-${replacement.id}/undo-replace`)
      .send({ expected_version: 1, incumbent: incumbentPayload() });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      scenario_id: BASELINE_SCENARIO_ID,
      project_id: PROJECT_ID,
      person_id: PERSON_OLD_ID,
      role_id: ROLE_ID,
      allocation_percentage: 60,
      assignment_date_mode: 'fixed',
      status: 'active',
    });

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(PERSON_OLD_ID);
    expect(rows[0].start_date).toBe('2026-01-01');
    expect(rows[0].end_date).toBe('2026-12-31');
    expect(rows[0].computed_start_date).toBe('2026-01-01');
    expect(rows[0].computed_end_date).toBe('2026-12-31');
    expect(rows.find((r: any) => r.person_id === PERSON_NEW_ID)).toBeUndefined();

    const actions = auditEvents.map((e) => `${e.action}:${e.recordId}`);
    expect(actions).toContain(`DELETE:${replacement.id}`);
    expect(actions).toContain(`CREATE:${rows[0].id}`);
  });

  test('旧行同键已被占：409 ASSIGNMENT_DUPLICATE 且整体回滚——替换行仍在、不产生新行', async () => {
    const replacement = await insertAssignment();
    // 撤销前另有同键行占位（person_old + role + phase null）
    const occupant = await insertAssignment({ person_id: PERSON_OLD_ID, allocation_percentage: 10 });

    const res = await request
      .post(`/api/assignments/${replacement.id}/undo-replace`)
      .send({ expected_version: 1, incumbent: incumbentPayload() });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_DUPLICATE');
    expect(res.body.existing_id).toBe(occupant.id);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    // 回滚：替换行仍在（撤销前状态），占位行未动，旧行未创建
    expect(rows).toHaveLength(2);
    expect(rows.find((r: any) => r.id === replacement.id)).toBeTruthy();
    expect(rows.find((r: any) => r.id === occupant.id)).toBeTruthy();
    expect(rows.filter((r: any) => r.person_id === PERSON_OLD_ID)).toHaveLength(1);
    expect(auditEvents).toHaveLength(0);
  });

  test('版本冲突：409 VERSION_CONFLICT 且无副作用', async () => {
    const replacement = await insertAssignment({ version: 3 });

    const res = await request
      .post(`/api/assignments/${replacement.id}/undo-replace`)
      .send({ expected_version: 1, incumbent: incumbentPayload() });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_VERSION_CONFLICT');
    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(replacement.id);
    expect(auditEvents).toHaveLength(0);
  });

  test('替换行不存在：404 且无副作用', async () => {
    const res = await request
      .post(`/api/assignments/spa-${randomUUID()}/undo-replace`)
      .send({ expected_version: 1, incumbent: incumbentPayload() });
    expect(res.status).toBe(404);
  });

  test('phase 模式旧行：记录 phase_id 并按共享原语派生日期', async () => {
    const replacement = await insertAssignment({ phase_id: PHASE_ID });

    const res = await request
      .post(`/api/assignments/${replacement.id}/undo-replace`)
      .send({
        expected_version: 1,
        incumbent: incumbentPayload({
          phase_id: PHASE_ID,
          assignment_date_mode: 'phase',
          start_date: null,
          end_date: null,
        }),
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      person_id: PERSON_OLD_ID,
      phase_id: PHASE_ID,
      assignment_date_mode: 'phase',
    });
    expect(res.body.data.computed_start_date).toBe('2026-04-01');
    expect(res.body.data.computed_end_date).toBe('2026-04-30');
  });

  test('fixed 模式缺日期/倒置：400 且无副作用', async () => {
    const replacement = await insertAssignment();
    const missing = await request
      .post(`/api/assignments/${replacement.id}/undo-replace`)
      .send({ expected_version: 1, incumbent: incumbentPayload({ start_date: null }) });
    expect(missing.status).toBe(400);

    const inverted = await request
      .post(`/api/assignments/${replacement.id}/undo-replace`)
      .send({ expected_version: 1, incumbent: incumbentPayload({ start_date: '2026-12-31', end_date: '2026-01-01' }) });
    expect(inverted.status).toBe(400);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(replacement.id);
  });
});
