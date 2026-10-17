import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';
import { ActualInvestmentsController } from '../ActualInvestmentsController.js';
import { AssignmentsController } from '../AssignmentsController.js';

/**
 * IP-07c / F06：关键写入的乐观锁（版本令牌 + 409 载荷含当前值）。
 *
 * 现状（F06 证据）：setManual 是无 onConflict 条件的 merge（并发人工编辑后写
 * 静默覆盖先写）、assignment update 是无条件 WHERE id 覆盖——均无版本比较。
 * updated_at 作令牌不可靠（真库 TEXT 默认值与 Date 写入的毫秒数混存，实测），
 * 故用整数 version 列（迁移 072），原子比较 WHERE version=expected_version。
 *
 * 契约（渐进收紧）：
 * - 带 expected_version：先读方令牌过期 → 409 {error, current(含 version)}；
 *   令牌正确 → 写入成功且 version+1
 * - 无令牌：旧覆盖行为不变（兼容既有调用方），version 仍递增（供下次比较）
 * - 409 不吞草稿：载荷带当前可展示值，前端保留输入由 UI 层测试锁
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');
const BASELINE = 'baseline-0000-0000-0000-000000000000';

describe('乐观锁: 人工月账与分配写入 (真迁移库)', () => {
  let db: any;
  let actuals: ActualInvestmentsController;
  let assignments: AssignmentsController;
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
    await db('roles').insert({ id: 'r1', name: '开发' });
    await db('projects').insert({ id: 'prj1', name: '事项甲', project_sub_type_id: 'pst1' });
    await db('people').insert({ id: 'p1', name: '张三', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 });
    await db('scenarios').insert({ id: BASELINE, name: '基线', status: 'active', scenario_type: 'baseline', created_by: 'p1' });
    await db('scenario_project_assignments').insert({
      id: 'a-1', scenario_id: BASELINE, project_id: 'prj1', person_id: 'p1', role_id: 'r1',
      allocation_percentage: 40, status: 'active', change_type: 'added'
    });
    await db('project_actual_investments').insert({
      project_id: 'prj1', month: '2026-09', fte: 0.9, source: 'snapshot'
    });

    actuals = new ActualInvestmentsController();
    (actuals as any).db = db;
    assignments = new AssignmentsController();
    (assignments as any).db = db;
  }, 120000);

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // 每用例重置夹具到已知版本
    await db('project_actual_investments').where({ project_id: 'prj1', month: '2026-09' })
      .update({ fte: 0.9, source: 'snapshot' });
    await db('scenario_project_assignments').where({ id: 'a-1' })
      .update({ allocation_percentage: 40 });
    jest.clearAllMocks();
  });

  const setManual = (body: Record<string, unknown>) =>
    run(() => actuals.setManual(
      { params: { projectId: 'prj1' }, body, headers: {}, user: { id: 'u1' },
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } } as never,
      mockRes as never
    ));

  const updateAssignment = (id: string, body: Record<string, unknown>) =>
    run(() => (assignments as any).update(
      { params: { id }, body, headers: { 'x-scenario-id': BASELINE }, user: { id: 'u1' },
        logAuditEvent: jest.fn(),
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } } as never,
      mockRes as never
    ));

  describe('setManual(人工月账)', () => {
    test('令牌过期: 他人已改 → 409 + 载荷含当前值与版本', async () => {
      // B 先改(无令牌兼容路径), 行版本前移
      const b = await setManual({ month: '2026-09', fte: 0.5 });
      expect(b.statusCode).toBe(200);
      // A 带过期令牌(expected_version=1)提交 → 409
      const a = await setManual({ month: '2026-09', fte: 0.8, expected_version: 1 });
      expect(a.statusCode).toBe(409);
      expect(a.body.error).toMatch(/conflict/i);
      expect(a.body.current).toMatchObject({ month: '2026-09', fte: 0.5 });
      // A 的写入未生效
      const row = await db('project_actual_investments').where({ project_id: 'prj1', month: '2026-09' }).first();
      expect(Number(row.fte)).toBe(0.5);
    });

    test('令牌正确: 写入成功且版本前移', async () => {
      const cur = await db('project_actual_investments').where({ project_id: 'prj1', month: '2026-09' }).first();
      const r = await setManual({ month: '2026-09', fte: 0.8, expected_version: Number(cur.version) });
      expect(r.statusCode).toBe(200);
      const row = await db('project_actual_investments').where({ project_id: 'prj1', month: '2026-09' }).first();
      expect(Number(row.fte)).toBe(0.8);
      expect(Number(row.version)).toBe(Number(cur.version) + 1);
    });

    test('无令牌: 旧覆盖行为不变(兼容)', async () => {
      const r = await setManual({ month: '2026-09', fte: 0.6 });
      expect(r.statusCode).toBe(200);
      const row = await db('project_actual_investments').where({ project_id: 'prj1', month: '2026-09' }).first();
      expect(Number(row.fte)).toBe(0.6);
    });
  });

  describe('assignment update(重要分配)', () => {
    test('令牌过期: 他人已改 → 409 + 载荷含当前分配值', async () => {
      const b = await updateAssignment('a-1', { allocation_percentage: 60 });
      expect(b.statusCode).toBe(200);
      const a = await updateAssignment('a-1', { allocation_percentage: 80, expected_version: 1 });
      expect(a.statusCode).toBe(409);
      expect(a.body.error).toMatch(/conflict/i);
      expect(a.body.current).toMatchObject({ allocation_percentage: 60 });
      const row = await db('scenario_project_assignments').where({ id: 'a-1' }).first();
      expect(Number(row.allocation_percentage)).toBe(60);
    });

    test('令牌正确: 写入成功且版本前移', async () => {
      const cur = await db('scenario_project_assignments').where({ id: 'a-1' }).first();
      const r = await updateAssignment('a-1', {
        allocation_percentage: 80, expected_version: Number(cur.version)
      });
      expect(r.statusCode).toBe(200);
      const row = await db('scenario_project_assignments').where({ id: 'a-1' }).first();
      expect(Number(row.allocation_percentage)).toBe(80);
      expect(Number(row.version)).toBe(Number(cur.version) + 1);
    });

    test('无令牌: 旧覆盖行为不变(兼容)', async () => {
      const r = await updateAssignment('a-1', { allocation_percentage: 50 });
      expect(r.statusCode).toBe(200);
      const row = await db('scenario_project_assignments').where({ id: 'a-1' }).first();
      expect(Number(row.allocation_percentage)).toBe(50);
    });
  });
});
