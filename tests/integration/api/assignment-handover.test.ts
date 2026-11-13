/**
 * I02z 交接完整事务（真迁移库）：
 * - 原人 fixed 分配截到 effective_date 前一天；
 * - 接手人同项目/角色/阶段从 effective_date 接续；
 * - 版本冲突/重复键/非法模式不产生半提交，旧行保留。
 */
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_A_ID = `i03a-person-a-${SUFFIX}`;
const PERSON_B_ID = `i03a-person-b-${SUFFIX}`;
const ROLE_ID = `i03a-role-${SUFFIX}`;
const PROJECT_ID = `i03a-project-${SUFFIX}`;
const PHASE_ID = `i03a-phase-${SUFFIX}`;
const TIMELINE_ID = `i03a-timeline-${SUFFIX}`;

type AuditEvent = { table: string; recordId: string; action: string; oldValues: any; newValues: any };

let request: ReturnType<typeof supertest>;
let auditEvents: AuditEvent[] = [];

async function insertAssignment(overrides: Record<string, any> = {}) {
  const row = {
    id: randomUUID(),
    scenario_id: BASELINE_SCENARIO_ID,
    project_id: PROJECT_ID,
    person_id: PERSON_A_ID,
    role_id: ROLE_ID,
    phase_id: null,
    allocation_percentage: 40,
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
      name: `I02Z A ${SUFFIX}`,
      email: `i03a-a-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
    {
      id: PERSON_B_ID,
      name: `I02Z B ${SUFFIX}`,
      email: `i03a-b-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
  ]);
  await db('roles').insert({ id: ROLE_ID, name: `I02Z Role ${SUFFIX}` });
  await db('projects').insert({
    id: PROJECT_ID,
    name: `I02Z Project ${SUFFIX}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    aspiration_start: '2026-03-01',
    aspiration_finish: '2026-03-31',
  });
  await db('project_phases').insert({ id: PHASE_ID, name: `I02Z Phase ${SUFFIX}`, order_index: 1 });
  await db('project_phases_timeline').insert({
    id: TIMELINE_ID,
    project_id: PROJECT_ID,
    phase_id: PHASE_ID,
    start_date: '2026-03-01',
    end_date: '2026-03-31',
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
    (req as any).user = { id: PERSON_A_ID, name: 'I02Z Tester' };
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
  app.post('/api/assignments/:id/handover', (req, res) => controller.handover(req as any, res));
  request = supertest(app);
});

beforeEach(async () => {
  auditEvents = [];
  await db('scenario_project_assignments').where('project_id', PROJECT_ID).del();
});

describe('I03a 交接完整事务', () => {
  test('缩短原人 + 创建接手人同事务完成，并双审计', async () => {
    const seeded = await insertAssignment();
    const res = await request
      .post(`/api/assignments/${seeded.id}/handover`)
      .send({
        successor_person_id: PERSON_B_ID,
        effective_date: '2026-03-15',
        expected_version: 1,
      });
    expect(res.status).toBe(200);

    const original = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(original.end_date).toBe('2026-03-14');
    expect(original.computed_end_date).toBe('2026-03-14');
    expect(Number(original.version)).toBe(2);

    const successor = await db('scenario_project_assignments')
      .where({ project_id: PROJECT_ID, person_id: PERSON_B_ID })
      .first();
    expect(successor).toBeTruthy();
    expect(successor.start_date).toBe('2026-03-15');
    expect(successor.end_date).toBe('2026-03-31');
    expect(Number(successor.allocation_percentage)).toBe(40);
    expect(auditEvents.some((event) => event.action === 'UPDATE' && event.recordId === seeded.id)).toBe(true);
    expect(auditEvents.some((event) => event.action === 'CREATE' && event.recordId === successor.id)).toBe(true);
  });

  test('版本过期 → 409，原行与接手人都不写', async () => {
    const seeded = await insertAssignment();
    const res = await request
      .post(`/api/assignments/${seeded.id}/handover`)
      .send({
        successor_person_id: PERSON_B_ID,
        effective_date: '2026-03-15',
        expected_version: 99,
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_VERSION_CONFLICT');

    const original = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(original.end_date).toBe('2026-03-31');
    expect(await db('scenario_project_assignments').where({ person_id: PERSON_B_ID }).first()).toBeFalsy();
  });

  test('direct 轨/非 fixed 分配拒绝交接', async () => {
    const directId = randomUUID();
    await db('project_assignments').insert({
      id: directId,
      project_id: PROJECT_ID,
      person_id: PERSON_A_ID,
      role_id: ROLE_ID,
      allocation_percentage: 40,
      status: 'active',
      assignment_date_mode: 'fixed',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
      version: 1,
    });
    const directRes = await request
      .post(`/api/assignments/${directId}/handover`)
      .send({ successor_person_id: PERSON_B_ID, effective_date: '2026-03-15', expected_version: 1 });
    expect(directRes.status).toBe(400);

    const phase = await insertAssignment({
      assignment_date_mode: 'phase',
      phase_id: PHASE_ID,
      start_date: null,
      end_date: null,
      computed_start_date: '2026-03-01',
      computed_end_date: '2026-03-31',
    });
    const phaseRes = await request
      .post(`/api/assignments/${phase.id}/handover`)
      .send({ successor_person_id: PERSON_B_ID, effective_date: '2026-03-15', expected_version: 1 });
    expect(phaseRes.status).toBe(400);
    await db('project_assignments').where('id', directId).del();
  });

  test('接手人已有同业务键 → 409，原行不变', async () => {
    const seeded = await insertAssignment();
    await insertAssignment({ person_id: PERSON_B_ID });
    const res = await request
      .post(`/api/assignments/${seeded.id}/handover`)
      .send({ successor_person_id: PERSON_B_ID, effective_date: '2026-03-15', expected_version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_DUPLICATE');
    const original = await db('scenario_project_assignments').where('id', seeded.id).first();
    expect(original.end_date).toBe('2026-03-31');
  });

  test('effective_date 必须在原窗口内部', async () => {
    const seeded = await insertAssignment();
    for (const date of ['2026-03-01', '2026-04-01']) {
      const res = await request
        .post(`/api/assignments/${seeded.id}/handover`)
        .send({ successor_person_id: PERSON_B_ID, effective_date: date, expected_version: 1 });
      expect(res.status).toBe(400);
    }
    expect(await db('scenario_project_assignments').where({ person_id: PERSON_B_ID }).first()).toBeFalsy();
  });
});
