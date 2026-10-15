import knexFactory from 'knex';
import { ScenariosController } from '../ScenariosController.js';

/**
 * IP-04a / F02: 场景分支字段保真(真 sqlite)。
 * baseline 分支的 copyAssignment 遗漏 status/is_primary/computed_* ——
 * 暂停分配被默认值激活、主投入丢失。分支未改动时必须事实保真(C05 家族)。
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active',
    scenario_type TEXT, parent_scenario_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_assignments (
    id TEXT PRIMARY KEY, project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_project_assignments (
    id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL,
    project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    is_primary INTEGER DEFAULT 0,
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    change_type TEXT, base_assignment_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_phases_timeline (
    id TEXT PRIMARY KEY, project_id TEXT, phase_id TEXT,
    start_date TEXT, end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_project_phases (
    id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL,
    project_id TEXT, phase_id TEXT, start_date TEXT, end_date TEXT, notes TEXT,
    change_type TEXT, base_phase_timeline_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`
];

describe('branchFromParent 字段保真 (F02, 真 sqlite)', () => {
  let db: any;
  let controller: ScenariosController;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    for (const stmt of DDL) await db.raw(stmt);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('scenario_project_assignments').del();
    await db('project_assignments').del();
    await db('scenario_project_phases').del();
    await db('project_phases_timeline').del();
    await db('scenarios').del();
    jest.clearAllMocks();

    await db('scenarios').insert({ id: BASELINE, name: 'Baseline', status: 'active', scenario_type: 'baseline' });

    // 基线切片:P1 暂停 100%(不得被分支激活)、P2 active 40% 主投入
    await db('scenario_project_assignments').insert([
      {
        id: 'b-p1', scenario_id: BASELINE, project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 100, status: 'paused', is_primary: 0,
        assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-03-31',
        computed_start_date: '2026-01-01', computed_end_date: '2026-03-31',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      },
      {
        id: 'b-p2', scenario_id: BASELINE, project_id: 'p2', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 40, status: 'active', is_primary: 1,
        assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-02-28',
        computed_start_date: '2026-01-01', computed_end_date: '2026-02-28',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      }
    ]);

    // 旧表来源:P3 暂停 25%(legacy project_assignments 分支同样不得激活)
    await db('project_assignments').insert({
      id: 'legacy-p3', project_id: 'p3', person_id: 'd2', role_id: 'r1',
      allocation_percentage: 25, status: 'paused',
      assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-01-31',
      computed_start_date: '2026-01-01', computed_end_date: '2026-01-31',
      created_at: new Date(), updated_at: new Date()
    });

    controller = new ScenariosController();
    (controller as any).db = db;
  });

  const branchRows = () => db('scenario_project_assignments').where({ scenario_id: 'br1' });

  test('F02: baseline 分支保留 paused 状态——不静默激活历史分配', async () => {
    await (controller as any).branchFromParent('br1', BASELINE);

    const p1 = await branchRows().where({ project_id: 'p1' }).first();
    expect(p1).toBeTruthy();
    expect(p1.status).toBe('paused');

    const p3 = await branchRows().where({ project_id: 'p3' }).first();
    expect(p3.status).toBe('paused');
  });

  test('F02: 主投入 is_primary 与 computed 日期保真复制', async () => {
    await (controller as any).branchFromParent('br1', BASELINE);

    const p2 = await branchRows().where({ project_id: 'p2' }).first();
    expect(p2.is_primary).toBe(1);
    expect(p2.computed_start_date).toBe('2026-01-01');
    expect(p2.computed_end_date).toBe('2026-02-28');
    expect(p2.allocation_percentage).toBe(40);
    expect(p2.assignment_date_mode).toBe('fixed');
  });

  test('C05 家族: 分支未改动时有效负荷与基线一致', async () => {
    await (controller as any).branchFromParent('br1', BASELINE);

    const baselineActiveSum = await db('scenario_project_assignments')
      .where({ scenario_id: BASELINE }).where('status', 'active')
      .sum('allocation_percentage as s').first();
    const branchActiveSum = await branchRows().where('status', 'active')
      .sum('allocation_percentage as s').first();
    expect(Number(branchActiveSum.s)).toBe(Number(baselineActiveSum.s)); // 仅 P2 40%
    expect(Number(branchActiveSum.s)).toBe(40);
  });

  test('非基线父分支整行展开复制(含 status/is_primary)', async () => {
    await (controller as any).branchFromParent('br1', BASELINE);
    // 再从 br1 分支 br2——展开复制路径
    await (controller as any).branchFromParent('br2', 'br1');

    const p1 = await db('scenario_project_assignments').where({ scenario_id: 'br2', project_id: 'p1' }).first();
    const p2 = await db('scenario_project_assignments').where({ scenario_id: 'br2', project_id: 'p2' }).first();
    expect(p1.status).toBe('paused');
    expect(p2.is_primary).toBe(1);
  });
});
