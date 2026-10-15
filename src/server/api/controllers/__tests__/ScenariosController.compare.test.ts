import knexFactory from 'knex';
import { ScenariosController } from '../ScenariosController.js';

/**
 * IP-04c / R04: 场景比较（真 sqlite）。
 * 同一人两条 100%:方案1 错峰(P1 11-02~13、P2 11-16~27),方案2 并行(P2 也 11-02~13)。
 * 期望:日期单独变化可见(旧/新日期)、受影响项目按变更集合计数=1(非项目总数之差 0)、
 * 并发峰值 100%→200% 可辨(窗口工时可相同)。
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active',
    scenario_type TEXT, parent_scenario_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT)`,
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
  `CREATE TABLE scenario_projects (
    id TEXT PRIMARY KEY, scenario_id TEXT, project_id TEXT,
    change_type TEXT, created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_phases_timeline (
    id TEXT PRIMARY KEY, project_id TEXT, phase_id TEXT,
    start_date TEXT, end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_project_phases (
    id TEXT PRIMARY KEY, scenario_id TEXT, project_id TEXT, phase_id TEXT,
    start_date TEXT, end_date TEXT, notes TEXT, change_type TEXT,
    base_phase_timeline_id TEXT, created_at DATETIME, updated_at DATETIME
  )`
];

describe('compare 场景比较 (R04, 真 sqlite)', () => {
  let db: any;
  let controller: ScenariosController;
  let mockReq: any;
  let mockRes: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    for (const stmt of DDL) await db.raw(stmt);

    await db('projects').insert([
      { id: 'p1', name: '事项A' }, { id: 'p2', name: '事项B' }
    ]);
    await db('people').insert({ id: 'd1', name: '张开发' });
    await db('roles').insert({ id: 'r1', name: '开发' });

    // 方案1(baseline):错峰——P1 前 11-02~13,P2 后 11-16~27,各 100%
    await db('scenarios').insert({ id: BASELINE, name: 'Baseline', status: 'active', scenario_type: 'baseline' });
    await db('scenario_project_assignments').insert([
      {
        id: 's1-p1', scenario_id: BASELINE, project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 100, status: 'active', assignment_date_mode: 'fixed',
        start_date: '2026-11-02', end_date: '2026-11-13',
        computed_start_date: '2026-11-02', computed_end_date: '2026-11-13',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      },
      {
        id: 's1-p2', scenario_id: BASELINE, project_id: 'p2', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 100, status: 'active', assignment_date_mode: 'fixed',
        start_date: '2026-11-16', end_date: '2026-11-27',
        computed_start_date: '2026-11-16', computed_end_date: '2026-11-27',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      }
    ]);

    // 方案2:并行——P2 改到 11-02~13(仅日期变化,比例不变)
    await db('scenarios').insert({ id: 'sc2', name: '并行方案', status: 'active', scenario_type: 'what-if' });
    await db('scenario_project_assignments').insert([
      {
        id: 's2-p1', scenario_id: 'sc2', project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 100, status: 'active', assignment_date_mode: 'fixed',
        start_date: '2026-11-02', end_date: '2026-11-13',
        computed_start_date: '2026-11-02', computed_end_date: '2026-11-13',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      },
      {
        id: 's2-p2', scenario_id: 'sc2', project_id: 'p2', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 100, status: 'active', assignment_date_mode: 'fixed',
        start_date: '2026-11-02', end_date: '2026-11-13',
        computed_start_date: '2026-11-02', computed_end_date: '2026-11-13',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      }
    ]);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ScenariosController();
    (controller as any).db = db;
    mockReq = { params: { id: BASELINE }, query: { compare_to: 'sc2' }, headers: {} };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  const compareResult = async () => {
    await controller.compare(mockReq, mockRes);
    await new Promise((r) => setImmediate(r));
    return mockRes.json.mock.calls[0][0];
  };

  test('R04: 仅日期变化的分配进入 modified,且 details 含旧/新日期', async () => {
    const result = await compareResult();
    const modified = result.differences.assignments.modified;
    expect(modified.length).toBe(1);
    expect(modified[0].modified.project_id ?? modified[0].project_id).toBe('p2');
    expect(modified[0].changes.dates.start.from).toBe('2026-11-16');
    expect(modified[0].changes.dates.start.to).toBe('2026-11-02');
    // details 必须呈现日期变化——旧的只写 "100% → 100%" 无法解释变化
    expect(modified[0].details).toContain('2026-11-16');
    expect(modified[0].details).toContain('2026-11-02');
  });

  test('R04: 受影响项目按变更集合计数=1(非两个方案项目总数之差 0)', async () => {
    const result = await compareResult();
    expect(result.metrics.timeline_impact.projects_affected).toBe(1);
    expect(result.metrics.timeline_impact.projects_affected_list?.[0]).toMatchObject({ project_id: 'p2' });
  });

  test('R04: 并发峰值可辨——错峰 100% → 并行 200%,含超载区间与人数', async () => {
    const result = await compareResult();
    const peak = result.metrics.utilization_impact.peak_comparison;
    expect(peak).toBeTruthy();
    expect(peak.scenario1_peak_pct).toBe(100);
    expect(peak.scenario2_peak_pct).toBe(200);
    expect(peak.overloaded_people.length).toBe(1);
    expect(peak.overloaded_people[0].person_name).toBe('张开发');
    expect(peak.overloaded_people[0].overload_segments?.length).toBeGreaterThan(0);
    expect(peak.window.start).toBe('2026-11-02');
    expect(peak.window.end).toBe('2026-11-27');
  });

  test('R04 佐证: 窗口总工时口径相同(原始和不变),不得称团队利用率', async () => {
    const result = await compareResult();
    // 两条 100% → 原始和都是 200,变化 0——峰值指标才是分辨器
    expect(result.metrics.utilization_impact.total_allocation_change).toBe(0);
  });
});
