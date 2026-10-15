import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import { EstimationService } from '../../../../src/server/services/estimation/EstimationService';

/**
 * IP-02c / R03: 已裁决开发人月覆盖(064"换算给默认,手动可覆盖")进入死线校验;
 * 结果标注各侧实际采用的估算来源与 MDE 未校验(D08 未裁决不假装)。
 * R03 反例: LOC500/费率500/占比15 → 旧校验开发需求 0.85,无视人工覆盖 4。
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE people (
    id TEXT PRIMARY KEY, name TEXT, default_availability_percentage REAL DEFAULT 100,
    is_active INTEGER DEFAULT 1
  )`,
  `CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE person_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT, role_id TEXT, is_primary INTEGER DEFAULT 0
  )`,
  `CREATE TABLE scenarios (id TEXT PRIMARY KEY, status TEXT DEFAULT 'active', scenario_type TEXT)`,
  `CREATE TABLE scenario_project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL,
    project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE person_availability_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT, start_date TEXT, end_date TEXT,
    availability_percentage REAL, override_type TEXT, is_approved INTEGER DEFAULT 0,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_pool_demands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, role_id TEXT,
    headcount REAL, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'open'
  )`
];

const CONVERSION = {
  estimated_loc: 500, loc_rate_per_pm: 500,
  design_share_pct: 15, deviation_low_pct: 0, deviation_high_pct: 0
};

describe('checkDeadline 估算来源 (R03)', () => {
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

  const check = (extra: any = {}) =>
    new EstimationService(db).checkDeadline({
      projectId: 'p1', deadline: '2026-12-02', start: '2026-11-01',
      conversion: CONVERSION, scenarioId: BASELINE, ...extra
    } as any);

  test('R03: 人工开发覆盖 4 参与开发侧需求(旧校验只算 LOC 换算 0.85)', async () => {
    const r = await check({ devPmOverride: 4 });
    expect(r.dev.demand.mid).toBe(4);
    expect(r.demand_sources.dev).toBe('estimated_pm_override');
  });

  test('无覆盖时开发侧仍用 LOC 换算并标注来源', async () => {
    const r = await check({});
    // 500/500×85%=0.85,SideCheckResult.demand 按 round1 展示(0.9)
    expect(r.dev.demand.mid).toBe(0.9);
    expect(r.demand_sources.dev).toBe('loc_conversion');
  });

  test('设计侧保持 LOC 换算(D5 双历史/D08 未定),MDE 未校验如实标注', async () => {
    const r = await check({ devPmOverride: 4 });
    // 500/500×15%=0.15,round1 展示为 0.2
    expect(r.design.demand.mid).toBe(0.2);
    expect(r.demand_sources.design).toBe('loc_conversion');
    expect(r.demand_sources.mde_verified).toBe(false);
  });

  test('覆盖区间沿用同一偏差因子(20/50 偏差下 4 → [3.2, 6])', async () => {
    const r = await check({
      devPmOverride: 4,
      conversion: { ...CONVERSION, deviation_low_pct: 20, deviation_high_pct: 50 }
    });
    expect(r.dev.demand.low).toBe(3.2);
    expect(r.dev.demand.high).toBe(6);
  });
});
