import knexFactory from 'knex';
import { AssignmentsController } from '../AssignmentsController.js';

/**
 * IP-03a / C07–C09: checkConflicts 按日期边界分段判冲突(真 sqlite)。
 * - C07 错峰两段 50%+新增 50% → 无冲突(并发峰值 100)
 * - C08 paused 100% 不占容量 → 新增 25% 无冲突
 * - C09 已批准可用率覆盖 0 → 新增 25% 冲突且容量为真 0(不 ||100 回退)
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE people (
    id TEXT PRIMARY KEY, name TEXT,
    default_availability_percentage REAL DEFAULT 100,
    is_active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT, include_in_demand INTEGER DEFAULT 1
  )`,
  `CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, status TEXT DEFAULT 'active', scenario_type TEXT
  )`,
  `CREATE TABLE scenario_project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id TEXT NOT NULL, project_id TEXT, person_id TEXT, role_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE person_availability_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT,
    start_date TEXT, end_date TEXT,
    availability_percentage REAL,
    override_type TEXT, reason TEXT,
    is_approved INTEGER DEFAULT 0, approved_at DATETIME,
    created_at DATETIME, updated_at DATETIME
  )`
];

describe('checkConflicts 分段容量判定 (C07–C09, 真 sqlite)', () => {
  let db: any;
  let controller: AssignmentsController;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    for (const stmt of DDL) await db.raw(stmt);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('scenario_project_assignments').del();
    await db('person_availability_overrides').del();
    await db('people').del();
    await db('projects').del();
    jest.clearAllMocks();

    await db('people').insert({ id: 'd1', name: '张开发', default_availability_percentage: 100 });
    await db('projects').insert([
      { id: 'p-other', name: '其他事项' },
      { id: 'p-target', name: '目标项目' }
    ]);
    await db('scenarios').insert({ id: BASELINE, status: 'active', scenario_type: 'baseline' }).catch(() => { /* 已存在 */ });

    controller = new AssignmentsController();
    (controller as any).db = db;
  });

  const insertAssignment = (p: Partial<{ scenario_id: string; project_id: string; allocation_percentage: number; status: string; start: string; end: string }>) =>
    db('scenario_project_assignments').insert({
      scenario_id: p.scenario_id ?? BASELINE,
      project_id: p.project_id ?? 'p-other',
      person_id: 'd1', role_id: 'r-dev',
      allocation_percentage: p.allocation_percentage ?? 50,
      status: p.status ?? 'active',
      assignment_date_mode: 'fixed',
      start_date: p.start ?? '2026-01-01', end_date: p.end ?? '2026-01-31',
      computed_start_date: p.start ?? '2026-01-01', computed_end_date: p.end ?? '2026-01-31',
      created_at: new Date(), updated_at: new Date()
    });

  test('C07: 上半月 50% + 下半月 50%,新增整月 50% → 无冲突(峰值 100)', async () => {
    await insertAssignment({ start: '2026-01-01', end: '2026-01-15', allocation_percentage: 50 });
    await insertAssignment({ start: '2026-01-16', end: '2026-01-31', allocation_percentage: 50 });

    const conflict = await controller.checkConflicts('d1', '2026-01-01', '2026-01-31', 50, undefined, BASELINE);
    expect(conflict).toBeNull();
  });

  test('C08: 已有 paused 100% 整月,新增 25% → 无冲突(暂停不占容量)', async () => {
    await insertAssignment({ start: '2026-01-01', end: '2026-01-31', allocation_percentage: 100, status: 'paused' });

    const conflict = await controller.checkConflicts('d1', '2026-01-01', '2026-01-31', 25, undefined, BASELINE);
    expect(conflict).toBeNull();
  });

  test('C09: 已批准可用率覆盖 0,新增 25% → 冲突,available_capacity 为真 0', async () => {
    await db('person_availability_overrides').insert({
      person_id: 'd1', start_date: '2026-01-01', end_date: '2026-01-31',
      availability_percentage: 0, override_type: 'VACATION', reason: '休假',
      is_approved: 1, approved_at: new Date(), created_at: new Date(), updated_at: new Date()
    });

    const conflict = await controller.checkConflicts('d1', '2026-01-01', '2026-01-31', 25, undefined, BASELINE);
    expect(conflict).not.toBeNull();
    expect(conflict!.available_capacity).toBe(0);
    expect(conflict!.total_allocation).toBe(25);
  });

  test('真实并发超载仍被拦截,且返回超载区间', async () => {
    await insertAssignment({ start: '2026-01-01', end: '2026-01-31', allocation_percentage: 80 });

    const conflict = await controller.checkConflicts('d1', '2026-01-01', '2026-01-31', 30, undefined, BASELINE);
    expect(conflict).not.toBeNull();
    expect(conflict!.total_allocation).toBe(110); // 峰值,非全部区间求和
    expect(conflict!.available_capacity).toBe(100);
    expect((conflict as any).overload_segments?.length).toBeGreaterThan(0);
  });

  test('未批准的可用率覆盖不生效', async () => {
    await db('person_availability_overrides').insert({
      person_id: 'd1', start_date: '2026-01-01', end_date: '2026-01-31',
      availability_percentage: 0, override_type: 'VACATION',
      is_approved: 0, created_at: new Date(), updated_at: new Date()
    });

    const conflict = await controller.checkConflicts('d1', '2026-01-01', '2026-01-31', 25, undefined, BASELINE);
    expect(conflict).toBeNull();
  });
});
