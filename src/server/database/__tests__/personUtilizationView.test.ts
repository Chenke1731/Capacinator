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
    // 场景叠加反例(Codex 2026-10-17 复审): 复制相同 active 分支
    await db('scenarios').insert([
      { id: 'baseline-0000-0000-0000-000000000000', name: '基线', status: 'active', scenario_type: 'baseline', created_by: 'p-idle-0' },
      { id: 's-branch', name: '分支副本', status: 'active', scenario_type: 'branch',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000', created_by: 'p-idle-0' }
    ]);
    await db('scenario_project_assignments').insert({
      id: 'sa-copy', scenario_id: 's-branch', project_id: 'prj1', person_id: 'p-partial-30',
      role_id: 'r1', allocation_percentage: 30, status: 'active', change_type: 'added'
    });
    // 过期分配反例(独立人员,不挤占满载边界用例): 100% 但区间已结束
    await db('people').insert({ id: 'p-expired', name: '过期分配', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 });
    await db('project_assignments').insert({
      id: 'a4', project_id: 'prj1', person_id: 'p-expired', role_id: 'r1',
      allocation_percentage: 100, status: 'active',
      start_date: '2026-01-01', end_date: '2026-01-31',
      computed_start_date: '2026-01-01', computed_end_date: '2026-01-31'
    });
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

  test('分支复制不双计: 视图只算基线切片(叠加反例曾 60→120% 幻影超载)', async () => {
    // p-partial-30: 基线 30% + 分支复制 30% → 视图必须仍是 30
    const row = await db('person_utilization_view').where('person_id', 'p-partial-30').first();
    expect(Number(row.total_allocation_percentage)).toBe(30);
    expect(row.utilization_status).toBe('Partially-allocated');
  });

  test('基线两轨都算: spa(baseline) 轨的分配也计入(dev 库 59 行全在此轨)', async () => {
    // 真实数据形态: 基线事实常存于 scenario_project_assignments(baseline-uuid)
    // 而非 project_assignments——只算后者的分子会把全员分子归零(dev 探针实证)
    await db('scenario_project_assignments').insert({
      id: 'sa-base-track', scenario_id: 'baseline-0000-0000-0000-000000000000',
      project_id: 'prj1', person_id: 'p-idle-0', role_id: 'r1',
      allocation_percentage: 20, status: 'active', change_type: 'added'
    });
    const row = await db('person_utilization_view').where('person_id', 'p-idle-0').first();
    expect(Number(row.total_allocation_percentage)).toBe(20);
    expect(row.utilization_status).toBe('Partially-allocated');
  });

  test('已结束的分配不计入当前负荷(时间窗反例曾把过期 100% 照算)', async () => {
    // p-expired 的 100% 分配区间为 2026-01(已结束) → 当前 0 分配
    const row = await db('person_utilization_view').where('person_id', 'p-expired').first();
    expect(Number(row.total_allocation_percentage)).toBe(0);
    expect(row.utilization_status).toBe('Available');
  });
});
