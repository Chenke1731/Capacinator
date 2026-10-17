import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';

/**
 * person_utilization_view 状态口径守卫（U01 / IP-03b，2026-10-17）。
 *
 * 病灶：视图 utilization_status 用**绝对分配和**判档（>=100 Over / >=80 Fully），
 * 无视人员可用率——可用率 50% 的人分到 80% 实际负荷 160% 却标 Fully；
 * 同时五处消费方四个口径（People 汇总死字段 allocation_status 恒 0、People 明细
 * 相对率 100/80/40 私设线、utilization 报表 100/90/50 私设线、capacity 报表
 * 跟视图）。U01 实证"顶部超负荷 0 人，明细却 224%/362%"。
 *
 * 契约：状态判档收敛到视图单一真相，口径=**相对可用率**（与 IP-03a
 * 冲突语义 loadPct>capacityPct 一致）：
 *   可用率 0 → Unavailable；ratio>100 → Over-allocated（严格大于，100% 算满载）；
 *   >=80 → Fully-allocated；>0 → Partially-allocated；=0 → Available
 * 本测试跑**真迁移**建库（非手写 DDL——status CHECK 漂移教训），是全类口径
 * 的结构守卫。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');

describe('person_utilization_view 相对可用率口径 (U01)', () => {
  let db: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    // knex migrate runner 走 ESM 动态 import,jest CJS 环境不可用——
    // 手动按文件名序执行迁移源码(测试库 schema=迁移真身,非手写 DDL)
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.ts')).sort();
    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(MIGRATIONS, f)) as { up?: (k: unknown) => Promise<void> };
      if (mod.up) await mod.up(db);
    }

    // projects 必填 project_sub_type_id → 先造 type/subtype 链;assignments 必填 role_id
    await db('project_types').insert({ id: 'pt1', name: '软件' });
    await db('project_sub_types').insert({ id: 'pst1', project_type_id: 'pt1', name: '交付' });
    await db('roles').insert({ id: 'r1', name: '开发' });
    await db('projects').insert({ id: 'prj1', name: '事项甲', project_sub_type_id: 'pst1' });
    await db('people').insert([
      { id: 'p-low-80', name: '低可用超载', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      { id: 'p-full-100', name: '满载边界', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      { id: 'p-partial-30', name: '部分分配', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      { id: 'p-idle-0', name: '空载', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 },
      { id: 'p-unavail', name: '不可用', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 }
    ]);
    await db('project_assignments').insert([
      { id: 'a1', project_id: 'prj1', person_id: 'p-low-80', role_id: 'r1', allocation_percentage: 80, status: 'active' },
      { id: 'a2', project_id: 'prj1', person_id: 'p-full-100', role_id: 'r1', allocation_percentage: 100, status: 'active' },
      { id: 'a3', project_id: 'prj1', person_id: 'p-partial-30', role_id: 'r1', allocation_percentage: 30, status: 'active' }
    ]);
    await db('person_availability_overrides').insert([
      // p-low-80: 可用率覆盖 50%(当前窗口) → 80/50 = 160% 超载
      { person_id: 'p-low-80', start_date: '2026-10-01', end_date: '2026-10-31', availability_percentage: 50, is_approved: 1 },
      // p-unavail: 覆盖 0 → Unavailable
      { person_id: 'p-unavail', start_date: '2026-10-01', end_date: '2026-10-31', availability_percentage: 0, is_approved: 1 }
    ]);
  }, 120000);

  afterAll(async () => {
    await db.destroy();
  });

  const statusOf = async (personId: string): Promise<string> => {
    const row = await db('person_utilization_view').where('person_id', personId).first();
    return row?.utilization_status ?? '(missing)';
  };

  test('低可用率超载: 80% 分配 / 50% 可用 = 160% → Over-allocated(旧绝对口径误标 Fully)', async () => {
    expect(await statusOf('p-low-80')).toBe('Over-allocated');
  });

  test('满载边界: 100/100 = 100% → Fully-allocated(严格大于线,不算超载)', async () => {
    expect(await statusOf('p-full-100')).toBe('Fully-allocated');
  });

  test('部分分配 30% → Partially-allocated', async () => {
    expect(await statusOf('p-partial-30')).toBe('Partially-allocated');
  });

  test('零分配 → Available', async () => {
    expect(await statusOf('p-idle-0')).toBe('Available');
  });

  test('可用率覆盖 0 → Unavailable(不看分配)', async () => {
    expect(await statusOf('p-unavail')).toBe('Unavailable');
  });
});
