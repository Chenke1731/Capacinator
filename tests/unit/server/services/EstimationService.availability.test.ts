import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import { EstimationService } from '../../../../src/server/services/estimation/EstimationService';

/**
 * IP-03a / C06: 死线校验供给按人员可用率覆盖分段。
 * 整窗已批准覆盖 0 → 供给 0;部分休假按段扣除;
 * 不依赖"今天"的可用率视图代表未来窗口。
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE people (
    id TEXT PRIMARY KEY, name TEXT,
    default_availability_percentage REAL DEFAULT 100,
    is_active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE person_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT, role_id TEXT, is_primary INTEGER DEFAULT 0
  )`,
  `CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, status TEXT DEFAULT 'active', scenario_type TEXT
  )`,
  `CREATE TABLE scenario_project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id TEXT NOT NULL, project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE person_availability_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT,
    start_date TEXT, end_date TEXT,
    availability_percentage REAL,
    override_type TEXT, reason TEXT,
    is_approved INTEGER DEFAULT 0, approved_at DATETIME,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_pool_demands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, role_id TEXT,
    headcount REAL, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'open'
  )`
];

const CONVERSION = {
  estimated_loc: 100, loc_rate_per_pm: 500,
  design_share_pct: 15, deviation_low_pct: 0, deviation_high_pct: 0
};

describe('checkDeadline 可用率覆盖分段 (C06)', () => {
  let db: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    for (const stmt of DDL) await db.raw(stmt);

    await db('roles').insert([{ id: 'r-se', name: 'SE' }, { id: 'r-dev', name: '开发' }]);
    await db('people').insert([
      { id: 'se1', name: '沈设计', default_availability_percentage: 100 },
      { id: 'dev1', name: '张开发', default_availability_percentage: 100 }
    ]);
    await db('person_roles').insert([
      { person_id: 'se1', role_id: 'r-se', is_primary: 1 },
      { person_id: 'dev1', role_id: 'r-dev', is_primary: 1 }
    ]);
    await db('scenarios').insert({ id: BASELINE, status: 'active', scenario_type: 'baseline' });
  });

  afterAll(async () => {
    await db.destroy();
  });

  const check = () =>
    new EstimationService(db).checkDeadline({
      projectId: 'p-target', deadline: '2026-02-01', start: '2026-01-01',
      conversion: CONVERSION, scenarioId: BASELINE
    } as any);

  const addOverride = (p: { start: string; end: string; pct: number; approved?: number }) =>
    db('person_availability_overrides').insert({
      person_id: 'dev1', start_date: p.start, end_date: p.end,
      availability_percentage: p.pct, override_type: 'VACATION',
      is_approved: p.approved ?? 1, approved_at: new Date(),
      created_at: new Date(), updated_at: new Date()
    });

  test('无覆盖时供给为正(前提)', async () => {
    const r = await check();
    expect(r.dev.supplyPm).toBeGreaterThan(0);
  });

  test('C06: 整窗已批准覆盖 0 → 开发供给 0', async () => {
    await addOverride({ start: '2026-01-01', end: '2026-02-01', pct: 0 });
    const r = await check();
    expect(r.dev.supplyPm).toBe(0);
    // SE 侧不受影响
    expect(r.design.supplyPm).toBeGreaterThan(0);
  });

  test('部分休假按段扣除:半月 0 → 供给约为无覆盖时一半', async () => {
    await db('person_availability_overrides').del();
    await addOverride({ start: '2026-01-01', end: '2026-01-15', pct: 0 });
    const r = await check();
    // 1 月 22 工作日,前 11 个工作日为 0 → 有效约 11/22=0.5 个月
    expect(r.dev.supplyPm).toBeGreaterThan(0.3);
    expect(r.dev.supplyPm).toBeLessThan(0.7);
  });

  test('未批准覆盖不影响供给', async () => {
    await db('person_availability_overrides').del();
    await addOverride({ start: '2026-01-01', end: '2026-02-01', pct: 0, approved: 0 });
    const r = await check();
    expect(r.dev.supplyPm).toBeGreaterThan(0);
  });
});
