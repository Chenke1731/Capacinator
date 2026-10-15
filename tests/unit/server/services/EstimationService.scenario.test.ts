import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import { EstimationService } from '../../../../src/server/services/estimation/EstimationService';

/**
 * IP-02b / C05 / F01: 死线校验按"选定场景的有效分配"读取。
 * 基线 59-式切片自含(scenario_project_assignments 按 scenario_id 分片);
 * 未改动的 active 备选分支不得改变基线供给——不得把所有 active 分支叠加。
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
    id TEXT PRIMARY KEY, status TEXT DEFAULT 'active',
    scenario_type TEXT, parent_scenario_id TEXT
  )`,
  `CREATE TABLE project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id TEXT NOT NULL, project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_pool_demands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, role_id TEXT,
    headcount REAL, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'open'
  )`,
  // 迁移 034 的并集视图(现行 fetchAssignments 的读取源)——RED 必须命中现行实现
  `CREATE VIEW effective_project_assignments AS
    SELECT pa.id, pa.project_id, pa.person_id, pa.role_id, pa.phase_id,
      pa.allocation_percentage, pa.assignment_date_mode, pa.start_date, pa.end_date,
      pa.computed_start_date, pa.computed_end_date, pa.notes,
      'base' as source_type, null as scenario_id, 'added' as change_type,
      null as base_assignment_id, pa.created_at, pa.updated_at
    FROM project_assignments pa
    UNION ALL
    SELECT spa.id, spa.project_id, spa.person_id, spa.role_id, spa.phase_id,
      spa.allocation_percentage, spa.assignment_date_mode, spa.start_date, spa.end_date,
      spa.computed_start_date, spa.computed_end_date, spa.notes,
      'scenario' as source_type, spa.scenario_id, 'added' as change_type,
      null as base_assignment_id, spa.created_at, spa.updated_at
    FROM scenario_project_assignments spa`
];

const CONVERSION = {
  estimated_loc: 100,
  loc_rate_per_pm: 500,
  design_share_pct: 15,
  deviation_low_pct: 0,
  deviation_high_pct: 0
};

describe('checkDeadline 场景切片 (C05/F01)', () => {
  let db: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    for (const stmt of DDL) await db.raw(stmt);

    await db('roles').insert([{ id: 'r-se', name: 'SE' }, { id: 'r-dev', name: '开发' }]);
    await db('people').insert([
      { id: 'se1', name: '沈设计', default_availability_percentage: 100, is_active: 1 },
      { id: 'dev1', name: '张开发', default_availability_percentage: 100, is_active: 1 }
    ]);
    await db('person_roles').insert([
      { person_id: 'se1', role_id: 'r-se', is_primary: 1 },
      { person_id: 'dev1', role_id: 'r-dev', is_primary: 1 }
    ]);
    await db('scenarios').insert({ id: BASELINE, status: 'active', scenario_type: 'baseline' });

    // 基线:dev1 → 其他事项 50%,覆盖整个校验窗口(2026-01-01~02-01)
    await db('scenario_project_assignments').insert({
      scenario_id: BASELINE, project_id: 'other', person_id: 'dev1', role_id: 'r-dev',
      allocation_percentage: 50, status: 'active', assignment_date_mode: 'fixed',
      start_date: '2026-01-01', end_date: '2026-02-01',
      computed_start_date: '2026-01-01', computed_end_date: '2026-02-01'
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  const check = (scenarioId?: string) =>
    new EstimationService(db).checkDeadline({
      projectId: 'p-target',
      deadline: '2026-02-01',
      start: '2026-01-01',
      conversion: CONVERSION,
      ...(scenarioId ? { scenarioId } : {})
    } as any);

  test('C05: 新增未改动的 active 备选分支不改变基线供给', async () => {
    const before = await check(BASELINE);
    expect(before.dev.supplyPm).toBeGreaterThan(0); // 前提:基线本身有正供给(50% 被占)

    // 新建 active 备选分支,复制基线分配(未改动)
    await db('scenarios').insert({ id: 'br1', status: 'active', scenario_type: 'what-if', parent_scenario_id: BASELINE });
    await db('scenario_project_assignments').insert({
      scenario_id: 'br1', project_id: 'other', person_id: 'dev1', role_id: 'r-dev',
      allocation_percentage: 50, status: 'active', assignment_date_mode: 'fixed',
      start_date: '2026-01-01', end_date: '2026-02-01',
      computed_start_date: '2026-01-01', computed_end_date: '2026-02-01'
    });

    const after = await check(BASELINE);
    expect(after.dev.supplyPm).toBe(before.dev.supplyPm);
    expect(after.design.supplyPm).toBe(before.design.supplyPm);
  });

  test('F01: 基线普通新分配进入死线校验的负荷(切片可读基线写入)', async () => {
    const before = await check(BASELINE);
    await db('scenario_project_assignments').insert({
      scenario_id: BASELINE, project_id: 'other2', person_id: 'dev1', role_id: 'r-dev',
      allocation_percentage: 25, status: 'active', assignment_date_mode: 'fixed',
      start_date: '2026-01-01', end_date: '2026-02-01',
      computed_start_date: '2026-01-01', computed_end_date: '2026-02-01'
    });
    const after = await check(BASELINE);
    expect(after.dev.supplyPm).toBeLessThan(before.dev.supplyPm);
  });

  test('场景选择真实生效:分支改动只影响分支视角,不影响基线视角', async () => {
    // br1 提到 100%:分支视角供给应明显低于基线(50%+25% 负荷);
    // 拉开差距避免 round1 显示精度把 0.25/0.20 撞平
    await db('scenario_project_assignments').where({ scenario_id: 'br1' })
      .update({ allocation_percentage: 100 });
    const baseView = await check(BASELINE);
    const brView = await check('br1');
    expect(brView.dev.supplyPm).toBeLessThan(baseView.dev.supplyPm);
  });
});
