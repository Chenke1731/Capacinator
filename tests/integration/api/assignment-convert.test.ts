/**
 * S4 转换事务（交互优化设计 §7.2，真迁移库）：
 * POST /api/assignments/:id/convert —— 同一事务内：
 * - 版本校验 + 目标键查重 + SE/MDE 槽位检查；
 * - 字段继承（status/notes/is_primary/change_type/base_assignment_id）；
 * - 条件删除影响行数必须为 1，再插入新行；
 * - DELETE/CREATE 双审计与业务同事务。
 * 失败整体回滚：原行保留、不产生新行、不留下审计。
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';
import { AssignmentsController } from '../../../src/server/api/controllers/AssignmentsController';
import { AuditService } from '../../../src/server/services/audit/AuditService';
import { getAuditConfig } from '../../../src/server/config/index.js';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_ID = `i06-person-${SUFFIX}`;
const OTHER_ID = `i06-other-${SUFFIX}`;
const ROLE_A = `i06-role-a-${SUFFIX}`;
const ROLE_B = `i06-role-b-${SUFFIX}`;
const ROLE_SE = `i06-role-se-${SUFFIX}`;
const ROLE_C = `i06-role-c-${SUFFIX}`;
const PROJECT_ID = `i06-project-${SUFFIX}`;
const PHASE_ID = `i06-phase-${SUFFIX}`;
const PHASE_BARE_ID = `i06-phase-bare-${SUFFIX}`;
const TIMELINE_ID = `i06-timeline-${SUFFIX}`;

let request: ReturnType<typeof supertest>;
let auditIds: string[] = [];

async function insertAssignment(overrides: Record<string, any> = {}) {
  const row = {
    id: randomUUID(),
    scenario_id: BASELINE_SCENARIO_ID,
    project_id: PROJECT_ID,
    person_id: PERSON_ID,
    role_id: ROLE_A,
    phase_id: null,
    allocation_percentage: 20,
    status: 'active',
    assignment_date_mode: 'fixed',
    start_date: '2026-04-01',
    end_date: '2026-04-30',
    computed_start_date: '2026-04-01',
    computed_end_date: '2026-04-30',
    notes: 'handover note',
    is_primary: 0,
    change_type: 'added',
    base_assignment_id: null,
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
  await db('scenario_project_assignments').insert(row);
  auditIds.push(String(row.id));
  return row;
}

async function insertDirectBase() {
  const id = randomUUID();
  await db('project_assignments').insert({
    id,
    project_id: PROJECT_ID,
    person_id: PERSON_ID,
    role_id: ROLE_A,
    phase_id: null,
    allocation_percentage: 5,
    status: 'active',
    assignment_date_mode: 'fixed',
    start_date: '2026-01-01',
    end_date: '2026-01-31',
    computed_start_date: '2026-01-01',
    computed_end_date: '2026-01-31',
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return id;
}

beforeAll(async () => {
  await db('people').insert([
    {
      id: PERSON_ID,
      name: `I06 Person ${SUFFIX}`,
      email: `i06-person-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
    {
      id: OTHER_ID,
      name: `I06 Other ${SUFFIX}`,
      email: `i06-other-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
    },
  ]);
  await db('roles').insert([
    { id: ROLE_A, name: `I06 Role A ${SUFFIX}` },
    { id: ROLE_B, name: `I06 Role B ${SUFFIX}` },
    { id: ROLE_SE, name: 'SE' },
    { id: ROLE_C, name: `I06 Role C ${SUFFIX}` },
  ]);
  await db('projects').insert({
    id: PROJECT_ID,
    name: `I06 Project ${SUFFIX}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    aspiration_start: '2026-04-01',
    aspiration_finish: '2026-04-30',
  });
  await db('project_phases').insert([
    { id: PHASE_ID, name: `I06 Phase ${SUFFIX}`, order_index: 1 },
    { id: PHASE_BARE_ID, name: `I06 Phase Bare ${SUFFIX}`, order_index: 2 },
  ]);
  await db('project_phases_timeline').insert({
    id: TIMELINE_ID,
    project_id: PROJECT_ID,
    phase_id: PHASE_ID,
    start_date: '2026-05-01',
    end_date: '2026-05-31',
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
    (req as any).user = { id: PERSON_ID, name: 'I06 Tester' };
    (req as any).logger = { info() {}, debug() {}, warn() {}, error() {} };
    (req as any).logAuditEvent = async () => undefined;
    next();
  });
  app.post('/api/assignments/:id/convert', (req, res) => controller.convert(req as any, res));
  request = supertest(app);
});

beforeEach(async () => {
  await db('scenario_project_assignments').where({ project_id: PROJECT_ID }).del();
  await db('project_assignments').where({ project_id: PROJECT_ID }).del();
  await db('audit_log').whereIn('record_id', auditIds).del();
  auditIds = [];
});

describe('I06 S4 convert 事务', () => {
  test('成功：旧行删除、新行继承状态/备注/主投入等字段，双审计同事务', async () => {
    const baseId = await insertDirectBase();
    const original = await insertAssignment({
      status: 'paused',
      is_primary: 1,
      base_assignment_id: baseId,
      change_type: 'modified',
    });

    const res = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: ROLE_B, expected_version: 1, allocation_percentage: 35 });

    expect(res.status).toBe(200);
    const converted = res.body.data;
    expect(converted).toMatchObject({
      scenario_id: BASELINE_SCENARIO_ID,
      project_id: PROJECT_ID,
      person_id: PERSON_ID,
      role_id: ROLE_B,
      phase_id: null,
      allocation_percentage: 35,
      assignment_date_mode: 'fixed',
      // 继承：paused 不得被转换“恢复”
      status: 'paused',
      notes: 'handover note',
      is_primary: 1,
      change_type: 'modified',
      base_assignment_id: baseId,
      version: 1,
    });
    expect(converted.id).not.toBe(original.id);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(converted.id);

    const audits = await db('audit_log')
      .where({ table_name: 'scenario_project_assignments' })
      .whereIn('record_id', [original.id, converted.id]);
    expect(audits.map((row: any) => `${row.action}:${row.record_id}`).sort()).toEqual(
      [`CREATE:${converted.id}`, `DELETE:${original.id}`].sort()
    );
    expect(audits.every((row: any) => row.comment === 'assignment convert [composite]')).toBe(true);
    expect(audits.every((row: any) => row.changed_by === PERSON_ID)).toBe(true);
  });

  test('目标键已被占：409 ASSIGNMENT_DUPLICATE，整体回滚（原行在、无新行、无审计）', async () => {
    const original = await insertAssignment();
    const occupant = await insertAssignment({ role_id: ROLE_B, allocation_percentage: 10 });

    const res = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: ROLE_B, expected_version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_DUPLICATE');
    expect(res.body.existing_id).toBe(occupant.id);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(2);
    expect(rows.find((row: any) => row.id === original.id)).toBeTruthy();
    const audits = await db('audit_log').whereIn('record_id', [original.id, occupant.id]);
    expect(audits).toHaveLength(0);
  });

  test('SE 槽位被他人占用：409 ASSIGNMENT_SLOT_OCCUPIED，原行保留', async () => {
    const original = await insertAssignment();
    const incumbent = await insertAssignment({ person_id: OTHER_ID, role_id: ROLE_SE });

    const res = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: ROLE_SE, expected_version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_SLOT_OCCUPIED');
    expect(res.body.incumbents.map((row: any) => row.id)).toContain(incumbent.id);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(2);
    expect(rows.find((row: any) => row.id === original.id)).toBeTruthy();
  });

  test('版本冲突：409 VERSION_CONFLICT，无副作用', async () => {
    const original = await insertAssignment();

    const res = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: ROLE_B, expected_version: 99 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_VERSION_CONFLICT');
    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].role_id).toBe(ROLE_A);
  });

  test('模式沿用：fixed 行换 phase 仍用显式日期；phase 行派生日期且 phase 不可空', async () => {
    const fixedRow = await insertAssignment();

    // fixed 行：换角色 + 换 phase，模式仍 fixed（模式沿用，不因 phase_id 自动切）
    const fixedRes = await request
      .post(`/api/assignments/${fixedRow.id}/convert`)
      .send({ role_id: ROLE_B, phase_id: PHASE_ID, expected_version: 1 });
    expect(fixedRes.status).toBe(200);
    expect(fixedRes.body.data.assignment_date_mode).toBe('fixed');
    expect(fixedRes.body.data.start_date).toBe('2026-04-01');
    expect(fixedRes.body.data.computed_start_date).toBe('2026-04-01');

    // phase 行：换角色（phase 保持），派生日期来自 timeline 2026-05-01..05-31
    const phaseRow = await insertAssignment({
      role_id: ROLE_A,
      assignment_date_mode: 'phase',
      phase_id: PHASE_ID,
      start_date: null,
      end_date: null,
      computed_start_date: '2026-05-01',
      computed_end_date: '2026-05-31',
    });
    const phaseRes = await request
      .post(`/api/assignments/${phaseRow.id}/convert`)
      .send({ role_id: ROLE_C, expected_version: 1 });
    expect(phaseRes.status).toBe(200);
    expect(phaseRes.body.data.assignment_date_mode).toBe('phase');
    expect(phaseRes.body.data.computed_start_date).toBe('2026-05-01');
    expect(phaseRes.body.data.computed_end_date).toBe('2026-05-31');

    // phase 行不能把 phase 清空
    const clearPhase = await request
      .post(`/api/assignments/${phaseRes.body.data.id}/convert`)
      .send({ role_id: ROLE_A, phase_id: null, expected_version: 1 });
    expect(clearPhase.status).toBe(400);
  });

  test('direct 行 400；未知行 404；无角色/阶段变化 400', async () => {
    const directId = randomUUID();
    await db('project_assignments').insert({
      id: directId,
      project_id: PROJECT_ID,
      person_id: PERSON_ID,
      role_id: ROLE_A,
      allocation_percentage: 10,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      status: 'active',
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const direct = await request
      .post(`/api/assignments/${directId}/convert`)
      .send({ role_id: ROLE_B, expected_version: 1 });
    expect(direct.status).toBe(400);

    const missing = await request
      .post(`/api/assignments/does-not-exist-${SUFFIX}/convert`)
      .send({ role_id: ROLE_B, expected_version: 1 });
    expect(missing.status).toBe(404);

    const original = await insertAssignment();
    const noop = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ expected_version: 1 });
    expect(noop.status).toBe(400);
    expect(String(noop.body.error)).toMatch(/role or phase change/i);
  });
});

describe('I06 S4 convert 评审修复守卫', () => {
  test('版本过期 + 目标键被占：先报 VERSION_CONFLICT（不被 DUPLICATE 掩盖）', async () => {
    const original = await insertAssignment({ version: 2 });
    await insertAssignment({ role_id: ROLE_B, allocation_percentage: 10 });

    const res = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: ROLE_B, expected_version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_VERSION_CONFLICT');
  });

  test('审计写入失败 → 业务整体回滚（原行保留、无新行、无审计）', async () => {
    const original = await insertAssignment();
    await db.raw(
      `CREATE TRIGGER i06_audit_abort BEFORE INSERT ON audit_log
       WHEN NEW.comment = 'assignment convert [composite]'
       BEGIN SELECT RAISE(ABORT, 'audit down'); END;`
    );
    try {
      const res = await request
        .post(`/api/assignments/${original.id}/convert`)
        .send({ role_id: ROLE_B, expected_version: 1 });
      expect(res.status).toBe(500);
    } finally {
      await db.raw('DROP TRIGGER IF EXISTS i06_audit_abort');
    }

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(original.id);
    expect(rows[0].role_id).toBe(ROLE_A);
    const audits = await db('audit_log').whereIn('record_id', [original.id]);
    expect(audits).toHaveLength(0);
  });

  test('复合审计对禁止逐条撤销：undo 返回 false，行集不变', async () => {
    const original = await insertAssignment();
    const res = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: ROLE_B, expected_version: 1 });
    expect(res.status).toBe(200);
    const convertedId = res.body.data.id;

    const auditService = new AuditService(db, getAuditConfig());
    expect(
      await auditService.undoLastChange('scenario_project_assignments', convertedId, 'tester')
    ).toBe(false);
    expect(
      await auditService.undoLastChange('scenario_project_assignments', original.id, 'tester')
    ).toBe(false);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(convertedId);
    expect(rows[0].role_id).toBe(ROLE_B);
  });

  test('角色不存在 / 阶段无时间线 → 400 且原行保留', async () => {
    const original = await insertAssignment();
    const badRole = await request
      .post(`/api/assignments/${original.id}/convert`)
      .send({ role_id: `missing-role-${SUFFIX}`, expected_version: 1 });
    expect(badRole.status).toBe(400);
    expect(String(badRole.body.error)).toMatch(/role_id does not exist/);
    expect(badRole.body.message).toBeTruthy();

    const phaseRow = await insertAssignment({
      role_id: ROLE_A,
      assignment_date_mode: 'phase',
      phase_id: PHASE_ID,
      start_date: null,
      end_date: null,
      computed_start_date: '2026-05-01',
      computed_end_date: '2026-05-31',
    });
    const noTimeline = await request
      .post(`/api/assignments/${phaseRow.id}/convert`)
      .send({ phase_id: PHASE_BARE_ID, expected_version: 1 });
    expect(noTimeline.status).toBe(400);
    expect(String(noTimeline.body.error)).toMatch(/no timeline/i);

    const rows = await db('scenario_project_assignments').where({ project_id: PROJECT_ID });
    expect(rows).toHaveLength(2);
    expect(rows.find((row: any) => row.id === original.id)).toBeTruthy();
    expect(rows.find((row: any) => row.id === phaseRow.id)).toBeTruthy();
  });

  test('SE 转换：清空 is_primary；removed 墓碑行拒绝转换', async () => {
    const primary = await insertAssignment({ is_primary: 1 });
    const toSe = await request
      .post(`/api/assignments/${primary.id}/convert`)
      .send({ role_id: ROLE_SE, expected_version: 1 });
    expect(toSe.status).toBe(200);
    expect(toSe.body.data.role_id).toBe(ROLE_SE);
    expect(toSe.body.data.is_primary).toBe(0);

    const tombstone = await insertAssignment({
      change_type: 'removed',
      role_id: ROLE_B,
    });
    const removed = await request
      .post(`/api/assignments/${tombstone.id}/convert`)
      .send({ role_id: ROLE_A, expected_version: 1 });
    expect(removed.status).toBe(400);
    expect(String(removed.body.error)).toMatch(/tombstone/i);
  });

  test('分支场景下 direct id 按 404（不泄露 baseline 行存在）', async () => {
    const directId = randomUUID();
    await db('project_assignments').insert({
      id: directId,
      project_id: PROJECT_ID,
      person_id: PERSON_ID,
      role_id: ROLE_A,
      allocation_percentage: 10,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      status: 'active',
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const res = await request
      .post(`/api/assignments/${directId}/convert`)
      .set('X-Scenario-Id', `branch-${SUFFIX}`)
      .send({ role_id: ROLE_B, expected_version: 1 });
    expect(res.status).toBe(404);
  });
});
