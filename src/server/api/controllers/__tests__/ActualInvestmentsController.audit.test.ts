import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';
import { ActualInvestmentsController } from '../ActualInvestmentsController.js';

/**
 * IP-07e / §4-298:人工月账写路径的审计前后值一致性。
 *
 * 现状(红):ActualInvestmentsController 三条写路径(snapshot/setManual/remove)
 * 零审计——不记录修改者、来源、前后值;§4-298 要求"覆盖人工月账和重要
 * 分配写入,审计记录与实际变化一致"。
 *
 * 本套件锁控制器→logAuditEvent 接线契约(表名/记录ID/动作/前后值);
 * 落库链路由 enhancedAuditMiddleware(全局)+AuditService 承担(另有覆盖)。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');

describe('人工月账审计: 前后值与修改者落审计 (IP-07e/§4-298)', () => {
  let db: any;
  let controller: ActualInvestmentsController;
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

    controller = new ActualInvestmentsController();
    (controller as any).db = db;
  }, 120000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('project_actual_investments').del();
    auditCalls = [];
  });

  const calls = (action: string) => auditCalls.filter((c) => c.action === action);

  test('setManual 新建: 记 CREATE,新值含 fte/source', async () => {
    const r = await run(() => controller.setManual(req({ projectId: 'prj1' }, { month: '2026-09', fte: 1.2 }), mockRes as never));
    expect(r.statusCode).toBe(200);
    expect(calls('CREATE')).toHaveLength(1);
    const c = calls('CREATE')[0];
    expect(c.tableName).toBe('project_actual_investments');
    expect(c.newValues).toMatchObject({ project_id: 'prj1', month: '2026-09', fte: 1.2, source: 'manual' });
    expect(c.recordId).toBeTruthy();
  });

  test('setManual 改写既有(无令牌 merge 路径): 记 UPDATE 且前后值齐', async () => {
    await db('project_actual_investments').insert({ project_id: 'prj1', month: '2026-09', fte: 0.9, source: 'snapshot' });
    const r = await run(() => controller.setManual(req({ projectId: 'prj1' }, { month: '2026-09', fte: 0.5 }), mockRes as never));
    expect(r.statusCode).toBe(200);
    expect(calls('UPDATE')).toHaveLength(1);
    const c = calls('UPDATE')[0];
    expect(c.oldValues).toMatchObject({ fte: 0.9, source: 'snapshot' });
    expect(c.newValues).toMatchObject({ fte: 0.5, source: 'manual' });
  });

  test('setManual 带令牌改写: 记 UPDATE 前后值齐;令牌过期 409 不记(无变化)', async () => {
    const [row] = await db('project_actual_investments').insert({ project_id: 'prj1', month: '2026-09', fte: 0.9, source: 'snapshot' }).returning('*');
    const ok = await run(() => controller.setManual(req({ projectId: 'prj1' }, { month: '2026-09', fte: 1.5, expected_version: Number(row.version) }), mockRes as never));
    expect(ok.statusCode).toBe(200);
    expect(calls('UPDATE')).toHaveLength(1);
    expect(calls('UPDATE')[0].oldValues).toMatchObject({ fte: 0.9 });
    expect(calls('UPDATE')[0].newValues).toMatchObject({ fte: 1.5, source: 'manual' });

    auditCalls = [];
    const stale = await run(() => controller.setManual(req({ projectId: 'prj1' }, { month: '2026-09', fte: 2, expected_version: 1 }), mockRes as never));
    expect(stale.statusCode).toBe(409);
    expect(auditCalls).toHaveLength(0);
  });

  test('snapshot 刷新既有快照: 记 UPDATE;manual 行 skipped 不记', async () => {
    await db('project_actual_investments').insert({ project_id: 'prj1', month: '2026-09', fte: 0.4, source: 'snapshot' });
    const r = await run(() => controller.snapshot(req({ projectId: 'prj1' }, { month: '2026-09' }), mockRes as never));
    expect(r.statusCode).toBe(200);
    expect(calls('UPDATE')).toHaveLength(1);
    expect(calls('UPDATE')[0].oldValues).toMatchObject({ fte: 0.4, source: 'snapshot' });
    expect(calls('UPDATE')[0].newValues).toMatchObject({ source: 'snapshot' });

    auditCalls = [];
    await db('project_actual_investments').where({ project_id: 'prj1', month: '2026-09' }).update({ source: 'manual', fte: 0.7 });
    const skipped = await run(() => controller.snapshot(req({ projectId: 'prj1' }, { month: '2026-09' }), mockRes as never));
    expect(skipped.statusCode).toBe(200);
    // sendSuccess 双层信封: body.data.data = 行载荷
    expect(skipped.body.data.data).toMatchObject({ skipped: true, source: 'manual' });
    expect(auditCalls).toHaveLength(0);
  });

  test('snapshot 首次补行: 记 CREATE', async () => {
    const r = await run(() => controller.snapshot(req({ projectId: 'prj1' }, { month: '2026-09' }), mockRes as never));
    expect(r.statusCode).toBe(200);
    expect(calls('CREATE')).toHaveLength(1);
    expect(calls('CREATE')[0].newValues).toMatchObject({ month: '2026-09', source: 'snapshot' });
  });

  test('remove: 记 DELETE 且前值齐;空删不记', async () => {
    const [row] = await db('project_actual_investments').insert({ project_id: 'prj1', month: '2026-09', fte: 0.9, source: 'manual' }).returning('*');
    const r = await run(() => controller.remove(req({ projectId: 'prj1', month: '2026-09' }) as never, mockRes as never));
    expect(r.statusCode).toBe(200);
    expect(calls('DELETE')).toHaveLength(1);
    expect(calls('DELETE')[0].oldValues).toMatchObject({ id: row.id, fte: 0.9, source: 'manual' });

    auditCalls = [];
    const empty = await run(() => controller.remove(req({ projectId: 'prj1', month: '2026-09' }) as never, mockRes as never));
    expect(empty.statusCode).toBe(200);
    expect(auditCalls).toHaveLength(0);
  });
});
