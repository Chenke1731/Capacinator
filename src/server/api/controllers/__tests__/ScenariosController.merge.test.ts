import knexFactory from 'knex';
import { ScenariosController } from '../ScenariosController.js';

/**
 * IP-04b / F03: 场景合并闭环（真 sqlite）。
 * - 策略真正执行:use_source/target 对冲突行按策略取值
 * - status/is_primary 单独变化也算差异并参与合并
 * - manual 有未决冲突:拒绝合并、落冲突表、源不标 merged
 * - 目标变化+源 merged 状态同一事务:中途失败两边均保持原状
 */
const BASELINE = 'baseline-0000-0000-0000-000000000000';

const DDL = [
  `CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active',
    scenario_type TEXT, parent_scenario_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)`,
  `CREATE TABLE scenario_merge_conflicts (
    id TEXT PRIMARY KEY, source_scenario_id TEXT, target_scenario_id TEXT,
    conflict_type TEXT, entity_id TEXT,
    source_data TEXT, target_data TEXT, resolved_data TEXT,
    resolution TEXT DEFAULT 'pending', created_at DATETIME
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
  `CREATE TABLE scenario_project_phases (
    id TEXT PRIMARY KEY, scenario_id TEXT, project_id TEXT, phase_id TEXT,
    start_date TEXT, end_date TEXT, notes TEXT, change_type TEXT,
    base_phase_timeline_id TEXT, created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_projects (
    id TEXT PRIMARY KEY, scenario_id TEXT, project_id TEXT,
    name TEXT, priority INTEGER, aspiration_start TEXT, aspiration_finish TEXT,
    change_type TEXT, created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_id TEXT,
    action TEXT, old_values TEXT, new_values TEXT, comment TEXT,
    created_at DATETIME
  )`
];

const mkReq = (id: string, strategy: string) => ({
  params: { id },
  body: { resolve_conflicts_as: strategy },
  headers: {},
  user: { id: 'u1', name: 'tester' },
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
});

describe('merge 合并闭环 (F03, 真 sqlite)', () => {
  let db: any;
  let controller: ScenariosController;
  let mockRes: any;

  const callMerge = async (id: string, strategy: string) => {
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.merge(mkReq(id, strategy) as any, mockRes);
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    return mockRes.json.mock.calls[0]?.[0];
  };

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true });
    for (const stmt of DDL) await db.raw(stmt);
    await db('scenarios').insert([
      { id: BASELINE, name: 'Baseline', status: 'active', scenario_type: 'baseline' },
      { id: 'br', name: '分支', status: 'active', scenario_type: 'what-if', parent_scenario_id: BASELINE }
    ]);
    await db('projects').insert([{ id: 'p1', name: '事项A' }, { id: 'p2', name: '事项B' }]);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('scenario_project_assignments').del();
    await db('scenario_project_phases').del();
    await db('scenario_projects').del();
    await db('scenario_merge_conflicts').del();
    await db('scenarios').where({ id: 'br' }).update({ status: 'active' });
    jest.clearAllMocks();
    controller = new ScenariosController();
    (controller as any).db = db;
  });

  const seedConflict = () =>
    db('scenario_project_assignments').insert([
      {
        id: 't-row', scenario_id: BASELINE, project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 40, status: 'active', is_primary: 0,
        assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-02-28',
        computed_start_date: '2026-01-01', computed_end_date: '2026-02-28',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      },
      {
        id: 's-row', scenario_id: 'br', project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 80, status: 'active', is_primary: 0,
        assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-02-28',
        computed_start_date: '2026-01-01', computed_end_date: '2026-02-28',
        change_type: 'modified', created_at: new Date(), updated_at: new Date()
      }
    ]);

  test('use_source: 冲突行按源值写入目标,源标 merged,冲突表清空', async () => {
    await seedConflict();
    const result = await callMerge('br', 'use_source');

    expect(result.success).toBe(true);
    const target = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    expect(Number(target.allocation_percentage)).toBe(80);
    expect(await db('scenarios').where({ id: 'br' }).first()).toMatchObject({ status: 'merged' });
    expect(await db('scenario_merge_conflicts').count('* as c').first()).toMatchObject({ c: 0 });
  });

  test('use_target: 冲突行保留目标值(源值不落),源标 merged', async () => {
    await seedConflict();
    const result = await callMerge('br', 'use_target');

    expect(result.success).toBe(true);
    const target = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    expect(Number(target.allocation_percentage)).toBe(40);
    expect(await db('scenarios').where({ id: 'br' }).first()).toMatchObject({ status: 'merged' });
  });

  test('status/is_primary 单独变化算差异并参与合并(旧比较清单漏这两字段)', async () => {
    await db('scenario_project_assignments').insert([
      {
        id: 't-row', scenario_id: BASELINE, project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 50, status: 'active', is_primary: 0,
        assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-02-28',
        computed_start_date: '2026-01-01', computed_end_date: '2026-02-28',
        change_type: 'added', created_at: new Date(), updated_at: new Date()
      },
      {
        id: 's-row', scenario_id: 'br', project_id: 'p1', person_id: 'd1', role_id: 'r1',
        allocation_percentage: 50, status: 'paused', is_primary: 1,
        assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-02-28',
        computed_start_date: '2026-01-01', computed_end_date: '2026-02-28',
        change_type: 'modified', created_at: new Date(), updated_at: new Date()
      }
    ]);

    const result = await callMerge('br', 'use_source');
    expect(result.success).toBe(true);
    const target = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    expect(target.status).toBe('paused');      // 旧实现:非冲突分支直接跳过,状态变化丢失
    expect(Number(target.is_primary)).toBe(1);
  });

  test('manual + 未决冲突:拒绝合并、冲突落表、源不标 merged、目标不变', async () => {
    await seedConflict();
    const result = await callMerge('br', 'manual');

    expect(result.success).toBe(false);
    expect(result.conflicts).toBeGreaterThan(0);
    expect(await db('scenario_merge_conflicts').count('* as c').first()).toMatchObject({ c: 1 });
    expect(await db('scenarios').where({ id: 'br' }).first()).toMatchObject({ status: 'conflict' });
    const target = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    expect(Number(target.allocation_percentage)).toBe(40);
  });

  test('原子性: 状态更新失败时目标数据与源状态均回滚(旧实现数据先提交、状态另写)', async () => {
    await seedConflict();
    // 源再加一条无冲突新行——旧实现会在 performMerge 自有事务内提交非冲突复制,
    // 之后再在事务外做源状态更新;注入该后半步失败即暴露"数据已提交、状态未落"
    await db('scenario_project_assignments').insert({
      id: 's-new', scenario_id: 'br', project_id: 'p2', person_id: 'd2', role_id: 'r1',
      allocation_percentage: 30, status: 'active', is_primary: 0,
      assignment_date_mode: 'fixed', start_date: '2026-03-01', end_date: '2026-03-31',
      computed_start_date: '2026-03-01', computed_end_date: '2026-03-31',
      change_type: 'added', created_at: new Date(), updated_at: new Date()
    });

    // 注入:scenarios 状态更新为 merged 时 ABORT(区分"事务外状态写"的旧结构)
    await db.raw(`CREATE TRIGGER block_merged BEFORE UPDATE OF status ON scenarios
      WHEN NEW.status = 'merged' BEGIN SELECT RAISE(ABORT, 'injected: status update failed'); END`);

    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.merge(mkReq('br', 'use_source') as any, mockRes);
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0 && mockRes.status.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    await db.raw('DROP TRIGGER block_merged');

    // 两边均保持原状:冲突行未改、非冲突新行未复制、源仍 active
    const target = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    expect(Number(target.allocation_percentage)).toBe(40);
    const copied = await db('scenario_project_assignments')
      .where({ scenario_id: BASELINE, project_id: 'p2' }).count('* as c').first();
    expect(Number(copied.c)).toBe(0); // 旧实现:非冲突行已提交,此处为 1
    expect(await db('scenarios').where({ id: 'br' }).first()).toMatchObject({ status: 'active' });
  });
});
