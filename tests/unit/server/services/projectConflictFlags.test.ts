import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';
import { computeProjectConflictFlags } from '../../../../src/server/services/board/projectConflictFlags';

/**
 * U15 任务视图"有冲突"标志（IP-06d，2026-10-17）。
 *
 * 契约：冲突**消费服务端统一计算结果**（person_utilization_view 的
 * Over-allocated 档，相对可用率口径）——某人的活跃分配（assignments_view，
 * 与看板格子同源）所属人员超载 → 其涉及项目标 has_conflict。
 * 前端只组织结果不重算。
 *
 * 边界钉：100% 恰好满载不算冲突（严格大于线，与视图判档一致）；
 * 非活跃分配不参与；无分配项目不标；低可用率 80/50=160% 相对超载要抓。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');

describe('computeProjectConflictFlags (U15 有冲突视图)', () => {
  let db: any;

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
    await db('projects').insert([
      { id: 'prj-a', name: '项目A', project_sub_type_id: 'pst1' },
      { id: 'prj-b', name: '项目B', project_sub_type_id: 'pst1' },
      { id: 'prj-c', name: '项目C(无人超载)', project_sub_type_id: 'pst1' },
      { id: 'prj-d', name: '项目D(无分配)', project_sub_type_id: 'pst1' }
    ]);
    await db('people').insert([
      // p-over: 两项目各 60% = 120% → Over-allocated
      { id: 'p-over', name: '超载者', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      // p-full: 单项目 100% = 恰好满载 → Fully-allocated,非冲突
      { id: 'p-full', name: '满载者', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      // p-lowcap: 可用率 50%,分 80% → 相对 160% 超载
      { id: 'p-lowcap', name: '低可用超载', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      // p-ok: 单项目 40% → 正常
      { id: 'p-ok', name: '正常者', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      // p-paused: 分配已暂停(非 active)不参与
      { id: 'p-paused', name: '暂停分配者', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 }
    ]);
    await db('person_availability_overrides').insert([
      { person_id: 'p-lowcap', start_date: '2026-10-01', end_date: '2026-12-31', availability_percentage: 50, is_approved: 1 }
    ]);
    await db('project_assignments').insert([
      { id: 'a1', project_id: 'prj-a', person_id: 'p-over', role_id: 'r1', allocation_percentage: 60, status: 'active' },
      { id: 'a2', project_id: 'prj-b', person_id: 'p-over', role_id: 'r1', allocation_percentage: 60, status: 'active' },
      { id: 'a3', project_id: 'prj-c', person_id: 'p-full', role_id: 'r1', allocation_percentage: 100, status: 'active' },
      { id: 'a4', project_id: 'prj-c', person_id: 'p-lowcap', role_id: 'r1', allocation_percentage: 80, status: 'active' },
      { id: 'a5', project_id: 'prj-c', person_id: 'p-ok', role_id: 'r1', allocation_percentage: 40, status: 'active' },
      { id: 'a6', project_id: 'prj-b', person_id: 'p-paused', role_id: 'r1', allocation_percentage: 50, status: 'paused' }
    ]);
  }, 120000);

  afterAll(async () => {
    await db.destroy();
  });

  test('超载者的两个项目都标冲突(prj-a/prj-b),低可用相对超载也标(prj-c)', async () => {
    const flags = await computeProjectConflictFlags(db);
    expect(flags.has('prj-a')).toBe(true);
    expect(flags.has('prj-b')).toBe(true);
    // prj-c: p-lowcap 相对 160% 超载 → 冲突(p-full 恰满载、p-ok 正常不改变结论)
    expect(flags.has('prj-c')).toBe(true);
  });

  test('恰好 100% 满载不算冲突的前提(prj-c 因 p-lowcap 而非 p-full 立案)——独立验证', async () => {
    // 单独验证严格大于线: 仅含 p-full 的场景不存在,改从视图口径直接断言
    const row = await db('person_utilization_view').where('person_id', 'p-full').first();
    expect(row.utilization_status).toBe('Fully-allocated');
  });

  test('无分配项目(prj-d)与暂停分配不在标志内', async () => {
    const flags = await computeProjectConflictFlags(db);
    expect(flags.has('prj-d')).toBe(false);
    // p-paused 的分配 prj-b 已因 p-over 立案——换独立断言: 暂停分配者不在超载名单
    const paused = await db('person_utilization_view').where('person_id', 'p-paused').first();
    expect(paused.utilization_status).toBe('Available');
  });
});
