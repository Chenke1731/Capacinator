import knexFactory from 'knex';
import { ScenariosController } from '../ScenariosController.js';

/**
 * 合并契约测试（2026-10-17 返工，Codex 复审 P1×2）：
 * - 枚举失配：页面发 favor_source/favor_target，服务端只认 use_source/use_target，
 *   未知串静默落入 manual 分支——冲突被丢、源标 merged、返回成功（目标 40% 原样）。
 *   契约：共享枚举（shared/types/scenarios），未知策略显式 400。
 * - manual 死路：全库无 resolution 写路径（无路由/无 UI），且再提交 manual 时
 *   detectMergeConflicts 按活数据重算>0 → 外层分支重插新 pending 行（已裁决行
 *   被无视）→ 永远失败+冲突表积重。契约：冲突行 upsert 复用（已裁决保留裁决），
 *   PATCH 裁决端点打通闭环。
 * 本文件以**页面真实载荷形态**（merge_strategy + resolve_conflicts_as 双字段）驱动。
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

/** 页面真实载荷形态：Scenarios.tsx 同时发 merge_strategy 与 resolve_conflicts_as */
const mkReq = (id: string, strategy: string) => ({
  params: { id },
  body: { merge_strategy: strategy, resolve_conflicts_as: strategy },
  headers: {},
  user: { id: 'u1', name: 'tester' },
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
});

const mkResolveReq = (id: string, conflictId: string, resolution: string) => ({
  params: { id, conflictId },
  body: { resolution },
  headers: {},
  user: { id: 'u1', name: 'tester' },
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
});

describe('merge 契约（页面载荷, 真 sqlite）', () => {
  let db: any;
  let controller: ScenariosController;
  let mockRes: any;

  const callMerge = async (id: string, strategy: string) => {
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.merge(mkReq(id, strategy) as any, mockRes);
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    return { body: mockRes.json.mock.calls[0]?.[0], statusCode: mockRes.statusCode };
  };

  const callResolve = async (id: string, conflictId: string, resolution: string) => {
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await (controller as any).resolveMergeConflict(mkResolveReq(id, conflictId, resolution) as any, mockRes);
    for (let i = 0; i < 500 && mockRes.json.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    return { body: mockRes.json.mock.calls[0]?.[0], statusCode: mockRes.statusCode };
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

  const row = (id: string, scenario: string, project: string, person: string, pct: number, changeType: string) => ({
    id, scenario_id: scenario, project_id: project, person_id: person, role_id: 'r1',
    allocation_percentage: pct, status: 'active', is_primary: 0,
    assignment_date_mode: 'fixed', start_date: '2026-01-01', end_date: '2026-02-28',
    computed_start_date: '2026-01-01', computed_end_date: '2026-02-28',
    change_type: changeType, created_at: new Date(), updated_at: new Date()
  });

  const seedConflict = (p2Pcts: [number, number] = [40, 90]) =>
    db('scenario_project_assignments').insert([
      row('t-row', BASELINE, 'p1', 'd1', 40, 'added'),
      row('s-row', 'br', 'p1', 'd1', 80, 'modified'),
      row('t-row2', BASELINE, 'p2', 'd2', p2Pcts[0], 'added'),
      row('s-row2', 'br', 'p2', 'd2', p2Pcts[1], 'modified')
    ]);

  test('未知策略(favor_source 页面旧枚举)显式 400,不再静默空转', async () => {
    await seedConflict();
    const { body, statusCode } = await callMerge('br', 'favor_source');
    expect(statusCode ?? mockRes.json.mock.calls.length).toBeDefined();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(body)).toMatch(/merge strategy/i);
    // 源不得被标 merged,目标保持原值
    expect((await db('scenarios').where({ id: 'br' }).first()).status).toBe('active');
    expect(Number((await db('scenario_project_assignments').where({ id: 't-row' }).first()).allocation_percentage)).toBe(40);
  });

  test('页面载荷 use_source: 源值写进目标(40→80),源标 merged', async () => {
    await seedConflict();
    const { body } = await callMerge('br', 'use_source');
    expect(body.success).toBe(true);
    const target = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    expect(Number(target.allocation_percentage)).toBe(80);
    expect((await db('scenarios').where({ id: 'br' }).first()).status).toBe('merged');
  });

  test('manual 全环: 落冲突→PATCH 裁决→再合并成功,已裁决不重插', async () => {
    await seedConflict();
    // 第一步: manual 落 pending 冲突
    const first = await callMerge('br', 'manual');
    expect(first.body.success).toBe(false);
    const pendingRows = await db('scenario_merge_conflicts').where({ resolution: 'pending' });
    expect(pendingRows).toHaveLength(2);
    // 冲突态事实源=pending 行,场景保持 active(真库 CHECK 无 'conflict' 值)
    expect((await db('scenarios').where({ id: 'br' }).first()).status).toBe('active');

    // 第二步: 裁决两条(一 source 一 target)
    const r1 = await callResolve('br', pendingRows[0].id, 'use_source');
    expect(r1.body.data?.resolution ?? r1.body.resolution).toBe('use_source');
    await callResolve('br', pendingRows[1].id, 'use_target');

    // 第三步: 再提交 manual——已裁决行必须被复用,不得重插 pending
    const second = await callMerge('br', 'manual');
    expect(second.body.success).toBe(true);
    // 合并成功后清空冲突表是既有语义(与 use_source 用例一致),不留历史行
    expect(await db('scenario_merge_conflicts').count('* as c').first()).toMatchObject({ c: 0 });
    expect((await db('scenarios').where({ id: 'br' }).first()).status).toBe('merged');
    const t1 = await db('scenario_project_assignments').where({ id: 't-row' }).first();
    const t2 = await db('scenario_project_assignments').where({ id: 't-row2' }).first();
    expect(Number(t1.allocation_percentage)).toBe(80); // use_source → 80
    expect(Number(t2.allocation_percentage)).toBe(40); // use_target → 保留 40
  });

  test('manual 部分裁决: 仍拒绝合并,已裁决行保留裁决', async () => {
    await seedConflict();
    await callMerge('br', 'manual');
    const pendingRows = await db('scenario_merge_conflicts').where({ resolution: 'pending' });
    await callResolve('br', pendingRows[0].id, 'use_source');

    const retry = await callMerge('br', 'manual');
    expect(retry.body.success).toBe(false);
    // 一行已裁决保留,另一行仍 pending,且无重插
    expect(await db('scenario_merge_conflicts').where({ resolution: 'use_source' })).toHaveLength(1);
    expect(await db('scenario_merge_conflicts').where({ resolution: 'pending' })).toHaveLength(1);
    expect(await db('scenario_merge_conflicts').count('* as c').first()).toMatchObject({ c: 2 });
    expect((await db('scenarios').where({ id: 'br' }).first()).status).toBe('active');
  });
});
