import knexFactory from 'knex';
import { IterationsController } from '../IterationsController.js';

/**
 * IP-02d / R05: SE 强度用"今天→开工"窗口,不用整个迭代窗口。
 * 评估日 2026-10-14,开工 11-02(13 工作日≈0.6 月),SE 粗估 1 人月 → 约 167%。
 * 旧实现按迭代 11-02~12-31(约 2.02 月)显示 50%,掩盖赶不上风险。
 * MDE/开发仍用迭代窗口(已裁决角色窗口)。
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE iterations (
    id TEXT PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT, iteration_id TEXT, lifecycle_state TEXT,
    priority INTEGER, parent_id TEXT
  )`,
  `CREATE TABLE project_estimations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT,
    estimated_loc REAL, loc_rate_per_pm REAL, estimated_pm REAL,
    created_at DATETIME
  )`,
  `CREATE TABLE project_design_estimations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT,
    se_estimate_pm REAL, mde_estimate_pm REAL,
    created_at DATETIME
  )`,
  `CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active', scenario_type TEXT
  )`,
  `CREATE TABLE scenario_project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL,
    project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_assignments (
    id TEXT PRIMARY KEY, project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  // 迁移 035 的并集视图(getAll 的读取源;真实库后续迁移补了 status 列,此处对齐)
  `CREATE VIEW assignments_view AS
    SELECT 'spa-' || spa.id AS id, spa.project_id, spa.person_id, spa.role_id, spa.phase_id,
      spa.allocation_percentage, spa.status, spa.assignment_date_mode, spa.start_date, spa.end_date,
      spa.notes, spa.created_at, spa.updated_at,
      COALESCE(spa.computed_start_date, spa.start_date) AS computed_start_date,
      COALESCE(spa.computed_end_date, spa.end_date) AS computed_end_date,
      'scenario' AS assignment_type, spa.scenario_id, s.name AS scenario_name, s.scenario_type
    FROM scenario_project_assignments spa
    JOIN scenarios s ON spa.scenario_id = s.id
    WHERE s.status = 'active'
    UNION ALL
    SELECT pa.id, pa.project_id, pa.person_id, pa.role_id, pa.phase_id,
      pa.allocation_percentage, pa.status, pa.assignment_date_mode, pa.start_date, pa.end_date,
      pa.notes, pa.created_at, pa.updated_at,
      COALESCE(pa.computed_start_date, pa.start_date) AS computed_start_date,
      COALESCE(pa.computed_end_date, pa.end_date) AS computed_end_date,
      'direct' AS assignment_type, '${BASELINE}' AS scenario_id, 'Baseline' AS scenario_name, 'baseline' AS scenario_type
    FROM project_assignments pa`
];

describe('IterationsController.getAll SE 开工前窗口 (R05, 真 sqlite)', () => {
  let db: any;
  let controller: IterationsController;
  let mockRes: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    for (const stmt of DDL) await db.raw(stmt);

    await db('iterations').insert({
      id: 'it1', name: 'RP4 迭代', start_date: '2026-11-02', end_date: '2026-12-31',
      created_at: new Date(), updated_at: new Date()
    });
    await db('projects').insert({
      id: 'p1', name: '目标事项', iteration_id: 'it1', lifecycle_state: 'designing', priority: 3, parent_id: null
    });
    await db('project_design_estimations').insert({
      project_id: 'p1', se_estimate_pm: 1, mde_estimate_pm: 0.5, created_at: new Date()
    });
    await db('roles').insert([{ id: 'r-se', name: 'SE' }, { id: 'r-mde', name: 'MDE' }]);
    await db('people').insert([{ id: 'se1', name: '沈设计' }, { id: 'mde1', name: '马架构' }]);
    await db('scenarios').insert({ id: BASELINE, name: 'Baseline', status: 'active', scenario_type: 'baseline' });
    await db('scenario_project_assignments').insert([
      {
        scenario_id: BASELINE, project_id: 'p1', person_id: 'se1', role_id: 'r-se',
        allocation_percentage: 100, status: 'active', assignment_date_mode: 'fixed',
        start_date: '2026-10-14', end_date: '2026-11-02',
        computed_start_date: '2026-10-14', computed_end_date: '2026-11-02',
        created_at: new Date(), updated_at: new Date()
      },
      {
        scenario_id: BASELINE, project_id: 'p1', person_id: 'mde1', role_id: 'r-mde',
        allocation_percentage: 100, status: 'active', assignment_date_mode: 'fixed',
        start_date: '2026-11-02', end_date: '2026-12-31',
        computed_start_date: '2026-11-02', computed_end_date: '2026-12-31',
        created_at: new Date(), updated_at: new Date()
      }
    ]);

    // 不冻结 setImmediate(轮询推进依赖它);只冻结系统时间
    jest.useFakeTimers({ now: new Date('2026-10-14T08:00:00'), doNotFake: ['setImmediate', 'nextTick'] } as any);
    jest.setSystemTime(new Date('2026-10-14T08:00:00'));
  });

  afterAll(async () => {
    jest.useRealTimers();
    await db.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IterationsController();
    (controller as any).db = db;
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  const loadRows = async () => {
    // asyncHandler 返回 void 且异常可能被吞——显式捕获暴露真实错误
    await Promise.resolve(
      controller.getAll({ headers: {}, logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } } as any, mockRes)
    ).catch((e: any) => { throw new Error(`getAll failed: ${e?.message}`); });
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    const body = mockRes.json.mock.calls[0][0];
    return body.data[0].stats.load;
  };

  test('R05: SE 强度用今天→开工窗口(13 工作日≈0.6 月)→ 1 人月 ≈167%', async () => {
    const load = await loadRows();
    const se = load.find((r: any) => r.role === 'SE');
    expect(se).toBeTruthy();
    expect(se.intensity_pct).toBeGreaterThanOrEqual(160);
    expect(se.intensity_pct).toBeLessThanOrEqual(175);
    // 窗口起止可见;终点=开工前一日(SE 在开工前完成,开工日本身属开发)
    expect(se.window).toEqual({ start: '2026-10-14', end: '2026-11-01' });
  });

  test('MDE 仍用迭代窗口(0.5 人月 ÷ ~2 月 ≈ 25%)', async () => {
    const load = await loadRows();
    const mde = load.find((r: any) => r.role === 'MDE');
    expect(mde.intensity_pct).toBeGreaterThanOrEqual(20);
    expect(mde.intensity_pct).toBeLessThanOrEqual(30);
  });

  test('R03: 人工开发覆盖 4 生效于迭代开发总量(旧实现只算 LOC/费率=1)', async () => {
    await db('project_estimations').insert({
      project_id: 'p1', estimated_loc: 500, loc_rate_per_pm: 500, estimated_pm: 4,
      created_at: new Date()
    });
    const load = await loadRows();
    const body = await (async () => {
      // loadRows 只回 load;这里再取一次完整 body
      controller.getAll({ headers: {}, logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } } as any, mockRes);
      for (let i = 0; i < 500 && mockRes.json.mock.calls.length < 2; i++) {
        await new Promise((r) => setImmediate(r));
      }
      return mockRes.json.mock.calls[1]?.[0] ?? mockRes.json.mock.calls[0][0];
    })();
    expect(body.data[0].stats.dev_pm).toBe(4);
    void load;
  });
});
