/**
 * I01v/D16+F4 审计落地测试（EXP-B07/EXP-B08 观测面）：
 *
 * 1. 白名单生效：demand_intake 入表后，捕获/更新/转换/拒绝/删除均落审计行，
 *    action 对齐设计稿 §4.4 的 INTAKE_* 五事件（修复前：isTableAudited 静默
 *    跳过 → 零行）。
 * 2. F4 await：审计失败时 convert 必须走错误路径（500）而非浮动 Promise 的
 *    UnhandledRejection；且项目已建、intake 已 converted——重试 409（R5 评审
 *    裁决：接受 500 + 文档化恢复路径）。
 * 3. R4：AuditService.undoSpecificChange 对 INTAKE_* 行返回 false 不抛错
 *    （客户端已按 undone:false 提示不可撤销，不再 alert 假成功）。
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';
import { db } from '../setup';
import { DemandIntakeController } from '../../../src/server/api/controllers/DemandIntakeController';
import { createEnhancedAuditMiddleware } from '../../../src/server/middleware/enhancedAuditMiddleware';
import { AuditService } from '../../../src/server/services/audit/AuditService';
import { getAuditConfig } from '../../../src/server/config/index';

jest.mock('../../../src/server/database/index.js', () => ({
  db: require('../setup').db,
}));

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const DEMAND_TYPE_ID = `i01v-audit-type-${SUFFIX}`;
const DEMAND_SUB_ID = `i01v-audit-sub-${SUFFIX}`;
const PHASE_1_ID = `i01v-audit-phase-1-${SUFFIX}`;

const loggerStub = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logPerformance: jest.fn(),
};

let createdProjectIds: string[] = [];

/** 与生产 app.ts 同序装配：logger 桩 → 审计中间件 →（可选）失败注入 → 路由 */
function buildApp(options: { failAudit?: boolean } = {}): ReturnType<typeof supertest> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).logger = loggerStub;
    (req as any).requestId = 'audit-test-request';
    next();
  });
  app.use(createEnhancedAuditMiddleware(db));
  if (options.failAudit) {
    app.use((req, _res, next) => {
      (req as any).logAuditEvent = async () => {
        throw new Error('audit down');
      };
      next();
    });
  }
  const controller = new DemandIntakeController();
  (controller as any).db = db;
  const router = express.Router();
  router.post('/', (req, res) => controller.create(req, res));
  router.post('/batch', (req, res) => controller.createBatch(req, res));
  router.get('/counts', (req, res) => controller.counts(req, res));
  router.patch('/:id', (req, res) => controller.update(req, res));
  router.post('/:id/convert', (req, res) => controller.convert(req, res));
  router.post('/:id/reject', (req, res) => controller.reject(req, res));
  router.post('/:id/reopen', (req, res) => controller.reopen(req, res));
  router.delete('/:id', (req, res) => controller.remove(req, res));
  app.use('/api/intake', router);
  return supertest(app);
}

const request = buildApp();
const failingRequest = buildApp({ failAudit: true });

async function auditRows(action: string) {
  return db('audit_log').where({ table_name: 'demand_intake', action });
}

beforeAll(async () => {
  await db('project_types').insert({ id: DEMAND_TYPE_ID, name: '需求交付' });
  await db('project_sub_types').insert({
    id: DEMAND_SUB_ID,
    name: `SR-AUDIT-${SUFFIX}`,
    project_type_id: DEMAND_TYPE_ID,
    is_active: 1,
  });
  await db('project_phases').insert({ id: PHASE_1_ID, name: `I01V-审计-${SUFFIX}`, order_index: 1 });
  await db('project_type_phases').insert({
    id: `i01v-audit-ptp-1-${SUFFIX}`,
    project_type_id: DEMAND_TYPE_ID,
    phase_id: PHASE_1_ID,
    order_index: 1,
    default_duration_days: 10,
    is_mandatory: 0,
    is_locked_order: 0,
  });
});

beforeEach(async () => {
  await db('demand_intake').del();
  await db('audit_log').del();
  createdProjectIds = [];
});

afterEach(async () => {
  for (const pid of createdProjectIds) {
    await db('project_phases_timeline').where('project_id', pid).del();
    await db('project_lifecycle_events').where('project_id', pid).del();
    await db('projects').where('id', pid).del();
  }
});

describe('D16 白名单 + INTAKE_* 审计落库', () => {
  test('捕获 → INTAKE_CREATE 行（修复前零行）', async () => {
    const res = await request
      .post('/api/intake')
      .send({ title: '审计捕获', source_channel: 'jdc_sr', source_ref: 'SR-AUD-001' });
    expect(res.status).toBe(200);

    const rows = await auditRows('INTAKE_CREATE');
    expect(rows).toHaveLength(1);
    expect(rows[0].record_id).toBe(res.body.data.id);
    expect(JSON.parse(String(rows[0].new_values))).toMatchObject({ title: '审计捕获' });
  });

  test('批量捕获 → 每条 INTAKE_CREATE（逐条 await）', async () => {
    const res = await request.post('/api/intake/batch').send({
      items: [
        { title: '批量甲', source_channel: 'internal' },
        { title: '批量乙', source_channel: 'internal' },
      ],
    });
    expect(res.status).toBe(200);
    const rows = await auditRows('INTAKE_CREATE');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r: any) => r.record_id))).toEqual(
      new Set(res.body.data.created.map((r: any) => r.id))
    );
  });

  test('更新/拒绝/删除 → INTAKE_UPDATE / INTAKE_REJECT / INTAKE_DELETE', async () => {
    const created = await request.post('/api/intake').send({ title: '流转', source_channel: 'internal' });
    const id = created.body.data.id;

    await request.patch(`/api/intake/${id}`).send({ title: '流转改' });
    expect(await auditRows('INTAKE_UPDATE')).toHaveLength(1);

    const second = await request.post('/api/intake').send({ title: '拒', source_channel: 'internal' });
    await request.post(`/api/intake/${second.body.data.id}/reject`).send({ reason: '重复' });
    const rejects = await auditRows('INTAKE_REJECT');
    expect(rejects).toHaveLength(1);
    expect(rejects[0].record_id).toBe(second.body.data.id);

    await request.delete(`/api/intake/${id}`);
    const deletes = await auditRows('INTAKE_DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].record_id).toBe(id);
  });

  test('转换 → INTAKE_CONVERT（intake）+ CREATE（projects）双事件', async () => {
    const created = await request
      .post('/api/intake')
      .send({ title: '转换审计', source_channel: 'jdc_sr', source_ref: 'SR-AUD-002' });
    const res = await request
      .post(`/api/intake/${created.body.data.id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID });
    expect(res.status).toBe(200);
    createdProjectIds.push(res.body.data.project.id);

    const converts = await auditRows('INTAKE_CONVERT');
    expect(converts).toHaveLength(1);
    expect(converts[0].record_id).toBe(created.body.data.id);

    const projectCreates = await db('audit_log').where({
      table_name: 'projects',
      action: 'CREATE',
    });
    expect(projectCreates).toHaveLength(1);
    expect(projectCreates[0].record_id).toBe(String(res.body.data.project.id));
  });

  test('I01u/D19① 重开 → INTAKE_REOPEN 审计行（new_values.status=new）', async () => {
    const created = await request.post('/api/intake').send({ title: '重开留痕', source_channel: 'internal' });
    await request.post(`/api/intake/${created.body.data.id}/reject`).send({ reason: '误拒' });
    const reopened = await request.post(`/api/intake/${created.body.data.id}/reopen`);
    expect(reopened.status).toBe(200);

    const rows = await auditRows('INTAKE_REOPEN');
    expect(rows).toHaveLength(1);
    expect(rows[0].record_id).toBe(created.body.data.id);
    expect(JSON.parse(String(rows[0].new_values))).toMatchObject({ status: 'new', reject_reason: null });
  });
});

describe('F4 await + R5 转换审计失败语义', () => {
  test('convert 审计失败：5xx + 项目存在 + 重试 409 含项目提示', async () => {
    // 标准 app 捕获（审计正常），失败 app 只做 convert
    const created = await request
      .post('/api/intake')
      .send({ title: '审计故障2', source_channel: 'jdc_sr', source_ref: 'SR-AUD-004' });
    const id = created.body.data.id;

    const res = await failingRequest
      .post(`/api/intake/${id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID });
    expect(res.status).toBe(500);

    const row = await db('demand_intake').where('id', id).first();
    expect(row.status).toBe('converted');
    expect(row.converted_project_id).toBeTruthy();
    createdProjectIds.push(row.converted_project_id);
    const project = await db('projects').where('id', row.converted_project_id).first();
    expect(project).toBeTruthy();

    const retry = await failingRequest
      .post(`/api/intake/${id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID });
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: 'invalid_status' });
    expect(String(retry.body.message)).toContain(row.converted_project_id);
  });
});

describe('R4 action 枚举消费者（UNDO 分支诚实性）', () => {
  test('undoSpecificChange 对 INTAKE_* 行返回 false 不抛错', async () => {
    const created = await request.post('/api/intake').send({ title: '撤销面', source_channel: 'internal' });
    await request.delete(`/api/intake/${created.body.data.id}`);
    const row = await db('audit_log')
      .where({ table_name: 'demand_intake', action: 'INTAKE_DELETE' })
      .first();
    expect(row).toBeTruthy();

    const service = new AuditService(db, getAuditConfig());
    const entry = {
      id: row.id,
      table_name: row.table_name,
      record_id: row.record_id,
      action: row.action,
      changed_by: row.changed_by,
      old_values: row.old_values ? JSON.parse(String(row.old_values)) : null,
      new_values: row.new_values ? JSON.parse(String(row.new_values)) : null,
      changed_fields: null,
      request_id: row.request_id,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      comment: row.comment,
      changed_at: new Date(row.changed_at),
    };
    const undone = await service.undoSpecificChange(entry as any, 'tester');
    expect(undone).toBe(false);
    // 留档仍在（未被误删/误恢复）
    const still = await db('audit_log').where('id', row.id).first();
    expect(still).toBeTruthy();
  });
});
