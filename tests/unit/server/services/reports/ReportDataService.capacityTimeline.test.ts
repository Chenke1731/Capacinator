import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import { ReportDataService } from '../../../../../src/server/services/reports/ReportDataService';
import { workdaysBetween } from '../../../../../src/server/services/calc/workCalendar';

/**
 * 容量时间线（2026-10-16 缺口①，Codex 独立复核 + 台账双源确认）：
 * 旧实现三宗罪——每月写死 22 天（查询 1 个工作日也回 176h）、可用率
 * `|| 100` 回退（显式 0% 被吞成 100%）、不查已批准可用率覆盖（休假
 * 不扣减）、默认窗口写死 2023-01-01~2024-12-31（过期窗口）。
 * 修复契约：月桶容量 = Σ 段容量% × 段真实工作日 × 日小时（复用 IP-03a
 * 分段原语），窗口感知部分月。期望值用 workdaysBetween 推导（日历
 * 本身有独立测试守卫，此处验证的是"报表消费日历+覆盖+0% 保真"）。
 */
const DDL = [
  `CREATE TABLE people (
    id TEXT PRIMARY KEY, name TEXT, default_hours_per_day REAL DEFAULT 8,
    default_availability_percentage REAL DEFAULT 100, is_active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE person_availability_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT, start_date TEXT, end_date TEXT,
    availability_percentage REAL, override_type TEXT, is_approved INTEGER DEFAULT 0,
    created_at DATETIME, updated_at DATETIME
  )`
];

describe('calculateCapacityTimeline 容量时间线 (缺口①)', () => {
  let db: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    for (const stmt of DDL) await db.raw(stmt);
    await db('people').insert([
      { id: 'p-full', name: '全职', default_hours_per_day: 8, default_availability_percentage: 100, is_active: 1 },
      { id: 'p-zero', name: '显式零可用', default_hours_per_day: 8, default_availability_percentage: 0, is_active: 1 },
      { id: 'p-leave', name: '十一月休假', default_hours_per_day: 8, default_availability_percentage: 100, is_active: 1 },
      { id: 'p-pending', name: '未批准覆盖', default_hours_per_day: 8, default_availability_percentage: 100, is_active: 1 },
      { id: 'p-inactive', name: '已停用', default_hours_per_day: 8, default_availability_percentage: 100, is_active: 0 }
    ]);
    await db('person_availability_overrides').insert([
      { person_id: 'p-leave', start_date: '2026-11-01', end_date: '2026-11-30', availability_percentage: 0, is_approved: 1 },
      { person_id: 'p-pending', start_date: '2026-10-01', end_date: '2026-10-31', availability_percentage: 0, is_approved: 0 }
    ]);
  });

  afterAll(async () => {
    await db.destroy();
  });

  const timeline = (start?: string, end?: string) =>
    new ReportDataService(db).calculateCapacityTimeline(start, end);

  test('0% 可用率保真是 0，不是 ||100 回退（Codex 探针：0% 仍回 176h）', async () => {
    const r = await timeline('2026-10-01', '2026-10-31');
    expect(r).toHaveLength(1);
    // 十月贡献者 = p-full + p-leave + p-pending（均 100%）；p-zero 显式 0%
    // 不得贡献（若被 ||100 吞 → 4 人份），p-inactive 排除
    const oct = workdaysBetween('2026-10-01', '2026-10-31') * 8;
    expect(r[0].capacity).toBe(oct * 3);
  });

  test('单工作日窗口按 1 天计，不是整月 22 天（Codex 探针：1 天也回 176h）', async () => {
    const r = await timeline('2026-10-20', '2026-10-20');
    expect(r).toHaveLength(1);
    expect(r[0].period).toBe('2026-10');
    // 3 名 100% 人员 × 1 个工作日 × 8h（常量锚点，非日历推导；旧实现 3×176）
    expect(r[0].capacity).toBe(24);
  });

  test('已批准 0% 覆盖的月份按人扣除，未覆盖月份不受影响', async () => {
    const r = await timeline('2026-10-01', '2026-11-30');
    expect(r.map((e) => e.period)).toEqual(['2026-10', '2026-11']);
    // 十月 3 人全勤；十一月 p-leave 批准覆盖 0% → 仅 p-full + p-pending
    // （若覆盖被忽略 → 3 人份）
    expect(r[0].capacity).toBe(workdaysBetween('2026-10-01', '2026-10-31') * 8 * 3);
    expect(r[1].capacity).toBe(workdaysBetween('2026-11-01', '2026-11-30') * 8 * 2);
  });

  test('未批准覆盖不生效（IP-03a/C06 语义守卫）', async () => {
    const r = await timeline('2026-10-01', '2026-10-31');
    // p-pending 的 10 月 0% 覆盖 is_approved=0，不得扣减（若误生效 → 2 人份）
    expect(r[0].capacity).toBe(workdaysBetween('2026-10-01', '2026-10-31') * 8 * 3);
  });

  test('部分月窗口只计窗口内工作日', async () => {
    const r = await timeline('2026-10-16', '2026-10-31');
    expect(r).toHaveLength(1);
    expect(r[0].capacity).toBe(workdaysBetween('2026-10-16', '2026-10-31') * 8 * 3);
  });

  test('默认窗口=本月 1 日~未来三个月末，不再是写死的 2023-2024', async () => {
    const r = await timeline();
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(r.length).toBe(4);
    expect(r[0].period).toBe(cur);
    expect(r.some((e) => e.period.startsWith('2023') || e.period.startsWith('2024'))).toBe(false);
  });
});
