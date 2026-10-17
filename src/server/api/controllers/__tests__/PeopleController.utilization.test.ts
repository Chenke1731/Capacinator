import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';
import { PeopleController } from '../PeopleController.js';

/**
 * PeopleController.getUtilization 场景感知（IP-03b 续，Codex 2026-10-17 复审）：
 * 旧实现直读视图分子=基线+全部 active 分支叠加，复制一个分支即 60%→120%
 * 幻影超载；且不滤过期分配。契约：
 * - baseline（无头/默认头）→ 视图快路径（基线两轨+今天窗口，070）
 * - 选定分支场景（X-Scenario-Id）→ 分子按场景切片重算（今天窗口），
 *   状态经 utilizationTier（与视图同构口径）
 * 测试跑真迁移建库（迁移真身=测试 schema，DDL 漂移教训）。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');
const BASELINE = 'baseline-0000-0000-0000-000000000000';

describe('getUtilization 场景切片 (真迁移库)', () => {
  let db: any;
  let controller: PeopleController;
  let mockRes: any;

  const call = async (headers: Record<string, unknown>) => {
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    const req = {
      headers,
      user: { id: 'u1', name: 'tester' },
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
    };
    await controller.getUtilization(req as never, mockRes as never);
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    return (mockRes.json.mock.calls[0]?.[0] as Array<Record<string, unknown>>) ?? [];
  };

  const rowOf = (rows: Array<Record<string, unknown>>, id: string): Record<string, unknown> => {
    const row = rows.find((r) => r.person_id === id);
    expect(row).toBeDefined();
    return row as Record<string, unknown>;
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
    await db('scenarios').insert([
      { id: BASELINE, name: '基线', status: 'active', scenario_type: 'baseline', created_by: 'p1' },
      { id: 's-branch', name: '分支', status: 'active', scenario_type: 'branch', parent_scenario_id: BASELINE, created_by: 'p1' }
    ]);
    // 基线轨: spa(baseline) 60%
    await db('scenario_project_assignments').insert({
      id: 'base-a', scenario_id: BASELINE, project_id: 'prj1', person_id: 'p1', role_id: 'r1',
      allocation_percentage: 60, status: 'active', change_type: 'added'
    });
    // 分支轨: 同人 90%(modified)
    await db('scenario_project_assignments').insert({
      id: 'br-a', scenario_id: 's-branch', project_id: 'prj1', person_id: 'p1', role_id: 'r1',
      allocation_percentage: 90, status: 'active', change_type: 'modified'
    });

    controller = new PeopleController();
    (controller as any).getDb = () => db; // 绕审计包装,直查测试库
  }, 120000);

  afterAll(async () => {
    await db.destroy();
  });

  test('无场景头=baseline: 视图快路径,基线 60%', async () => {
    const rows = await call({});
    const row = rowOf(rows, 'p1');
    expect(Number(row.total_allocation_percentage)).toBe(60);
    expect(row.utilization_status).toBe('Partially-allocated');
  });

  test('X-Scenario-Id=分支: 分子按场景切片 90%(不再叠加基线成 150%)', async () => {
    const rows = await call({ 'x-scenario-id': 's-branch' });
    const row = rowOf(rows, 'p1');
    expect(Number(row.total_allocation_percentage)).toBe(90);
    expect(row.utilization_status).toBe('Fully-allocated');
  });

  test('分支行已过期: 分支视角当前 0 分配(baseline 视角不受影响)', async () => {
    await db('scenario_project_assignments').where({ id: 'br-a' }).update({
      start_date: '2026-01-01', end_date: '2026-01-31',
      computed_start_date: '2026-01-01', computed_end_date: '2026-01-31'
    });
    const branchRows = await call({ 'x-scenario-id': 's-branch' });
    expect(Number(rowOf(branchRows, 'p1').total_allocation_percentage)).toBe(0);
    expect(rowOf(branchRows, 'p1').utilization_status).toBe('Available');

    const baseRows = await call({});
    expect(Number(rowOf(baseRows, 'p1').total_allocation_percentage)).toBe(60);
  });
});
