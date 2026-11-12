/**
 * I01 /api/intake —— HTTP 合同测试（信封规范 §4 + CLAUDE.md API 契约）。
 *
 * 断言形态而非业务细节（业务已由 IntakeService.integration 覆盖）：
 * - 列表 {success,data,pagination}；单实体 {success,data}；写 {success:true}
 * - 错误 {error:code, message}；409 duplicate 带 existing_id
 * - /counts 路由顺序（不被 /:id 吞掉）；转换信封含 baseline/phase_count
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';
import { db } from '../setup';
import { DemandIntakeController } from '../../../src/server/api/controllers/DemandIntakeController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const DEMAND_TYPE_ID = `i01-api-demand-type-${SUFFIX}`;
const DEMAND_SUB_ID = `i01-api-demand-sub-${SUFFIX}`;
const PHASE_1_ID = `i01-api-phase-1-${SUFFIX}`;
const PHASE_2_ID = `i01-api-phase-2-${SUFFIX}`;

let app: express.Application;
let request: ReturnType<typeof supertest>;
let createdProjectIds: string[] = [];

beforeAll(async () => {
  // 类型名与生命周期门全等（'需求交付'）；每套件独立内存库无 UNIQUE 冲突
  await db('project_types').insert({ id: DEMAND_TYPE_ID, name: '需求交付' });
  await db('project_sub_types').insert({
    id: DEMAND_SUB_ID,
    name: `SR-API-${SUFFIX}`,
    project_type_id: DEMAND_TYPE_ID,
    is_active: 1,
  });
  await db('project_phases').insert([
    { id: PHASE_1_ID, name: `I01-API-分析-${SUFFIX}`, order_index: 1 },
    { id: PHASE_2_ID, name: `I01-API-开发-${SUFFIX}`, order_index: 2 },
  ]);
  await db('project_type_phases').insert([
    { id: `i01-api-ptp-1-${SUFFIX}`, project_type_id: DEMAND_TYPE_ID, phase_id: PHASE_1_ID, order_index: 1, default_duration_days: 30, is_mandatory: 0, is_locked_order: 0 },
    { id: `i01-api-ptp-2-${SUFFIX}`, project_type_id: DEMAND_TYPE_ID, phase_id: PHASE_2_ID, order_index: 2, default_duration_days: 45, is_mandatory: 0, is_locked_order: 0 },
  ]);

  app = express();
  app.use(express.json());
  const controller = new DemandIntakeController();
  (controller as any).db = db;
  const router = express.Router();
  // 与 routes/intake.ts 相同注册顺序（/counts 先于 /:id —— 本测试同时钉住这一点）
  router.post('/', (req, res) => controller.create(req, res));
  router.post('/batch', (req, res) => controller.createBatch(req, res));
  router.get('/', (req, res) => controller.getAll(req, res));
  router.get('/counts', (req, res) => controller.counts(req, res));
  router.get('/:id', (req, res) => controller.getById(req, res));
  router.patch('/:id', (req, res) => controller.update(req, res));
  router.post('/:id/convert', (req, res) => controller.convert(req, res));
  router.post('/:id/reject', (req, res) => controller.reject(req, res));
  router.post('/:id/reopen', (req, res) => controller.reopen(req, res));
  router.delete('/:id', (req, res) => controller.remove(req, res));
  app.use('/api/intake', router);
  request = supertest(app);
});

beforeEach(async () => {
  await db('demand_intake').del();
  createdProjectIds = [];
});

afterEach(async () => {
  for (const pid of createdProjectIds) {
    await db('project_phases_timeline').where('project_id', pid).del();
    await db('project_lifecycle_events').where('project_id', pid).del();
    await db('projects').where('id', pid).del();
  }
});

describe('POST /api/intake（捕获）', () => {
  test('201 形态：success+data+warnings，ref 归一落库', async () => {
    const res = await request
      .post('/api/intake')
      .send({ title: '用户登录改造', source_channel: 'jdc_sr', source_ref: 'sr-556677', raw_text: '原文' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      warnings: [],
      data: { status: 'new', source_ref: 'SR556677', title: '用户登录改造' },
    });
    const row = await db('demand_intake').where('id', res.body.data.id).first();
    expect(row.source_ref).toBe('SR556677');
  });

  test('400 校验信封：error=validation_error + message', async () => {
    const res = await request.post('/api/intake').send({ title: '   ', source_channel: 'internal' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_error', message: expect.any(String) });
  });

  test('409 重复信封：error=duplicate_source_ref + existing_id', async () => {
    const first = await request
      .post('/api/intake')
      .send({ title: 'A', source_channel: 'jdc_sr', source_ref: 'SR-000900' });
    const res = await request
      .post('/api/intake')
      .send({ title: 'B', source_channel: 'jdc_sr', source_ref: 'SR000900' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'duplicate_source_ref',
      existing_id: first.body.data.id,
    });
  });
});

describe('POST /api/intake/batch 与 GET 列表/计数', () => {
  test('batch 信封：data.created/skipped（批内重复跳过）', async () => {
    const res = await request.post('/api/intake/batch').send({
      items: [
        { title: '一号', source_channel: 'jdc_sr', source_ref: 'SR000910' },
        { title: '二号', source_channel: 'jdc_sr', source_ref: 'SR000911' },
        { title: '三号', source_channel: 'jdc_sr', source_ref: 'SR000911' }, // 批内重复 → skipped
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created.map((r: { title: string }) => r.title)).toEqual(['一号', '二号']);
    expect(res.body.data.skipped).toEqual([{ index: 2, reason: 'duplicate_source_ref' }]);
  });

  test('列表分页信封 + 默认 status=new + oldest 排序', async () => {
    await request.post('/api/intake').send({ title: '甲', source_channel: 'internal', source_ref: 'SR000901' });
    await request.post('/api/intake').send({ title: '乙', source_channel: 'internal', source_ref: 'SR000902' });
    const res = await request.get('/api/intake');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { title: string }) => r.title)).toEqual(['甲', '乙']);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 2, totalPages: 1 });
  });

  test('/counts 不被 /:id 吞掉：返回计数对象', async () => {
    await request.post('/api/intake').send({ title: '丙', source_channel: 'internal' });
    const res = await request.get('/api/intake/counts');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ new: 1, converted: 0, rejected: 0, by_source: { internal: 1 } });
  });

  test('GET /:id 404 信封', async () => {
    const res = await request.get('/api/intake/intake-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });
});

describe('PATCH/DELETE/REJECT 维护信封', () => {
  test('PATCH 更新返回完整实体', async () => {
    const created = await request.post('/api/intake').send({ title: '旧', source_channel: 'internal' });
    const res = await request.patch(`/api/intake/${created.body.data.id}`).send({ title: '新', requester: '李四' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: '新', requester: '李四', status: 'new' });
  });

  test('REJECT 无理由 400；有理由 200 且状态翻转', async () => {
    const created = await request.post('/api/intake').send({ title: 'X', source_channel: 'internal' });
    const bad = await request.post(`/api/intake/${created.body.data.id}/reject`).send({ reason: '' });
    expect(bad.status).toBe(400);
    const ok = await request.post(`/api/intake/${created.body.data.id}/reject`).send({ reason: '重复提交' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'rejected', reject_reason: '重复提交' });
  });

  test('I01u/D19① REOPEN：rejected→new 清理由；非 rejected 409；不存在 404', async () => {
    const created = await request.post('/api/intake').send({ title: '可复活', source_channel: 'internal' });
    const id = created.body.data.id;
    await request.post(`/api/intake/${id}/reject`).send({ reason: '信息不足' });

    const reopen = await request.post(`/api/intake/${id}/reopen`);
    expect(reopen.status).toBe(200);
    expect(reopen.body).toMatchObject({
      success: true,
      data: { status: 'new', reject_reason: null },
    });

    const again = await request.post(`/api/intake/${id}/reopen`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'invalid_status' });

    const missing = await request.post('/api/intake/intake-no-such/reopen');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: 'not_found' });
  });

  test('I01u/D19③ converted 行携带回链项目存在性（项目在=1）', async () => {
    const created = await request.post('/api/intake').send({ title: '回链', source_channel: 'jdc_sr', source_ref: 'SR-I01U-01' });
    const conv = await request
      .post(`/api/intake/${created.body.data.id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID });
    createdProjectIds.push(conv.body.data.project.id);

    const list = await request.get('/api/intake?status=converted');
    const row = list.body.data.find((r: { id: string }) => r.id === created.body.data.id);
    expect(row).toBeTruthy();
    expect(row.converted_project_id).toBe(conv.body.data.project.id);
    expect(Number(row.converted_project_exists)).toBe(1);
  });

  test('DELETE new → success；converted → 409', async () => {
    const created = await request.post('/api/intake').send({ title: 'D', source_channel: 'internal' });
    const res = await request.delete(`/api/intake/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const other = await request.post('/api/intake').send({ title: 'E', source_channel: 'internal' });
    const conv = await request
      .post(`/api/intake/${other.body.data.id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID });
    createdProjectIds.push(conv.body.data.project.id);
    const del = await request.delete(`/api/intake/${other.body.data.id}`);
    expect(del.status).toBe(409);
    expect(del.body).toMatchObject({ error: 'invalid_status' });
  });
});

describe('POST /:id/convert（转换信封）', () => {
  test('成功：data.project + baseline/phase_count/intake 回链；双击 409', async () => {
    const created = await request
      .post('/api/intake')
      .send({ title: '转换需求', source_channel: 'jdc_sr', source_ref: 'SR000999', priority_hint: 2 });
    const res = await request
      .post(`/api/intake/${created.body.data.id}/convert`)
      .send({
        project_type_id: DEMAND_TYPE_ID,
        project_sub_type_id: DEMAND_SUB_ID,
        expected_start: '2027-03-01',
        expected_finish: '2027-06-30',
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: expect.any(String),
    });
    expect(res.body.data.project).toMatchObject({
      lifecycle_state: 'pending_rat',
      aspiration_start: '2027-03-01',
      external_number: 'SR000999',
      priority: 2,
    });
    expect(res.body.data).toMatchObject({ baseline: 'set', phase_count: 2 });
    expect(res.body.data.intake).toMatchObject({
      status: 'converted',
      converted_project_id: res.body.data.project.id,
    });
    createdProjectIds.push(res.body.data.project.id);

    const second = await request
      .post(`/api/intake/${created.body.data.id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: 'invalid_status' });
  });

  test('无效类型配对 → 400 invalid_type', async () => {
    const created = await request.post('/api/intake').send({ title: '配对', source_channel: 'internal' });
    const res = await request
      .post(`/api/intake/${created.body.data.id}/convert`)
      .send({ project_type_id: DEMAND_TYPE_ID, project_sub_type_id: 'no-such-sub-type' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_type', message: expect.any(String) });
  });
});
