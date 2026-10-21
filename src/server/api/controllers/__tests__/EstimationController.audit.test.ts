import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';
import { EstimationController } from '../EstimationController.js';
import { DesignEstimationController } from '../DesignEstimationController.js';

/**
 * IP-07e / §4-295 剩余项:估算/回填写路径"修订并保留历史"。
 *
 * 现状(红):两控制器写路径(create/backfill)零审计——主管修订回填值
 * 不留痕,§4-295"实际可复核、修订并保留历史"缺修订历史;可复核入口
 * (AuditLog 页 + GET /audit/history/:table/:record)已有,缺的是数据源。
 *
 * 同 IP-07d 模式:捕获 req.logAuditEvent 断言接线契约(表名/记录ID/
 * 动作/前后值);400 拒绝与 404 无变化不记。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');

describe('估算与回填审计: 修订保留历史 (IP-07e/§4-295)', () => {
  let db: any;
  let estimations: EstimationController;
  let designs: DesignEstimationController;
  let auditCalls: Array<{ tableName: string; recordId: string; action: string; oldValues?: any; newValues?: any }>;
  let mockRes: any;

  const run = async (fn: () => void | Promise<void>) => {
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await fn();
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    return {
      statusCode: (mockRes.status as jest.Mock).mock.calls[0]?.[0] ?? 200,
      body: mockRes.json.mock.calls[0]?.[0]
    };
  };

  const req = (params: Record<string, string>, body?: Record<string, unknown>) =>
    ({
      params, body, headers: {}, user: { id: 'auditor-1' },
      logAuditEvent: async (tableName: string, recordId: string, action: string, oldValues?: any, newValues?: any) => {
        auditCalls.push({ tableName, recordId, action, oldValues, newValues });
        return 'audit-id';
      },
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
    }) as never;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.ts')).sort();
    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(MIGRATIONS, f)) as { up?: (k: unknown) => Promise<void> };
      if (mod.up) await mod.up(db);
    }
    await db('project_types').insert({ id: 'pt1', name: '软件' });
    await db('project_sub_types').insert({ id: 'pst1', project_type_id: 'pt1', name: '交付' });
    await db('projects').insert({ id: 'prj1', name: '事项甲', project_sub_type_id: 'pst1' });
    await db('people').insert({ id: 'p1', name: '张三', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 });

    estimations = new EstimationController();
    (estimations as any).db = db;
    designs = new DesignEstimationController();
    (designs as any).db = db;
  }, 120000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('project_estimations').del();
    await db('project_design_estimations').del();
    auditCalls = [];
  });

  const calls = (action: string) => auditCalls.filter((c) => c.action === action);

  test('LOC 估算 create: 记 CREATE,新值含估算参数', async () => {
    const r = await run(() => estimations.create(req({ projectId: 'prj1' }, {
      estimated_loc: 1000, loc_rate_per_pm: 10000, design_share_pct: 30
    }), mockRes as never));
    expect(r.statusCode).toBe(201);
    expect(calls('CREATE')).toHaveLength(1);
    const c = calls('CREATE')[0];
    expect(c.tableName).toBe('project_estimations');
    expect(c.newValues).toMatchObject({ project_id: 'prj1', estimated_loc: 1000 });
    expect(c.recordId).toBeTruthy();
  });

  test('LOC 回填: 记 UPDATE 前后值齐(actual 三项),完整回填 backfilled_at 一并入新值', async () => {
    const [row] = await db('project_estimations').insert({
      project_id: 'prj1', estimated_loc: 1000, loc_rate_per_pm: 10000, design_share_pct: 30, created_by: 'p1'
    }).returning('*');
    const r = await run(() => estimations.backfill(req({ id: String(row.id) }, {
      actual_loc: 1200, actual_design_pm: 3.5, actual_dev_pm: 6
    }), mockRes as never));
    expect(r.statusCode).toBe(200);
    expect(calls('UPDATE')).toHaveLength(1);
    const c = calls('UPDATE')[0];
    expect(c.tableName).toBe('project_estimations');
    expect(c.oldValues).toMatchObject({ estimated_loc: 1000, actual_loc: null });
    expect(c.newValues).toMatchObject({ actual_loc: 1200, actual_design_pm: 3.5, actual_dev_pm: 6 });
    // 完整回填被审计留痕(新值含 backfilled_at)
    expect(c.newValues.backfilled_at).toBeTruthy();
  });

  test('LOC 回填 400 拒绝(空值): 不记审计(无变化)', async () => {
    const [row] = await db('project_estimations').insert({
      project_id: 'prj1', estimated_loc: 1000, loc_rate_per_pm: 10000, design_share_pct: 30, created_by: 'p1'
    }).returning('*');
    const r = await run(() => estimations.backfill(req({ id: String(row.id) }, { actual_loc: '' }), mockRes as never));
    expect(r.statusCode).toBe(400);
    expect(auditCalls).toHaveLength(0);
  });

  test('设计估算 create + 回填: 各记审计,前值齐', async () => {
    const r = await run(() => designs.create(req({ projectId: 'prj1' }, { estimated_design_pm: 5 }), mockRes as never));
    expect(r.statusCode).toBe(201);
    expect(calls('CREATE')).toHaveLength(1);
    expect(calls('CREATE')[0].tableName).toBe('project_design_estimations');
    const id = calls('CREATE')[0].recordId;

    const r2 = await run(() => designs.backfill(req({ id }, { actual_design_pm: 4.2 }), mockRes as never));
    expect(r2.statusCode).toBe(200);
    expect(calls('UPDATE')).toHaveLength(1);
    const c = calls('UPDATE')[0];
    expect(c.oldValues).toMatchObject({ estimated_design_pm: 5, actual_design_pm: null });
    expect(c.newValues).toMatchObject({ actual_design_pm: 4.2, backfilled_at: expect.anything() });
  });
});
