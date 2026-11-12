/**
 * I02c：People 列表 search 服务端过滤（评审 N4 存量）。
 *
 * 事故：People.tsx 把 search 发给 /api/people，PeopleController.getAll 只认
 * 角色/主管/类型/地点四个过滤，页面又无本地过滤——输入关键词毫无效果。
 * 本套件钉住姓名/邮箱子串过滤 + 分页 total 同口径。
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { db } from '../setup';
import { PeopleController } from '../../../src/server/api/controllers/PeopleController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ALPHA_ID = `i02c-alpha-${SUFFIX}`;
const BETA_ID = `i02c-beta-${SUFFIX}`;
const OTHER_ID = `i02c-other-${SUFFIX}`;

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await db('people').insert([
    {
      id: ALPHA_ID,
      name: `I02C Alpha ${SUFFIX}`,
      email: `alpha-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: BETA_ID,
      name: `I02C Beta ${SUFFIX}`,
      email: `beta-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: OTHER_ID,
      name: `Unrelated ${SUFFIX}`,
      email: `other-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);

  const controller = new PeopleController();
  (controller as any).db = db;
  // 本套件验证过滤链而非审计；关闭 enableAudit 避免 auditedDb 包装（测试库无 setDefaultContext）
  (controller as any).options.enableAudit = false;

  const app = express();
  app.use(express.json());
  app.get('/api/people', (req, res) => controller.getAll(req, res));
  request = supertest(app);
});

describe('GET /api/people?search=', () => {
  test('姓名子串命中，分页 total 同过滤', async () => {
    const res = await request.get('/api/people').query({ search: `I02C Alpha ${SUFFIX}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(ALPHA_ID);
    expect(res.body.pagination.total).toBe(1);
  });

  test('前缀命中多行（大小写不敏感 ASCII）', async () => {
    const res = await request.get('/api/people').query({ search: 'i02c' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.id).sort()).toEqual([ALPHA_ID, BETA_ID].sort());
    expect(res.body.pagination.total).toBe(2);
  });

  test('邮箱子串命中', async () => {
    const res = await request.get('/api/people').query({ search: `beta-${SUFFIX}@` });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(BETA_ID);
  });

  test('无匹配返回空数组与 total 0', async () => {
    const res = await request.get('/api/people').query({ search: `no-match-${SUFFIX}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  test('空白 search 不过滤', async () => {
    const res = await request.get('/api/people').query({ search: '   ' });
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(3);
  });
});
