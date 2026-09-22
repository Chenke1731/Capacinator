import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';

import {
  LifecycleService,
  LifecycleError,
  LIFECYCLE_STATES
} from '../../../../src/server/services/lifecycle/LifecycleService';

/**
 * Real in-memory SQLite so transactions and side effects are exercised
 * end-to-end (guard matrix, 排序即建池, 退回三动作, 裁决取消全释放).
 */
describe('LifecycleService (in-memory SQLite)', () => {
  let db: any;
  let service: LifecycleService;
  const DEV_ROLE = 'role-dev';
  const SE_ROLE = 'role-se';

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    // better-sqlite3's raw() rejects multi-statement strings — one per call
    const ddl = [
      `CREATE TABLE projects (
        id TEXT PRIMARY KEY, name TEXT, lifecycle_state TEXT,
        external_number TEXT, iteration_label TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT)`,
      `CREATE TABLE project_assignments (
        id TEXT PRIMARY KEY, project_id TEXT, role_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE scenario_project_assignments (
        id TEXT PRIMARY KEY, project_id TEXT, role_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE project_pool_demands (
        id TEXT PRIMARY KEY, project_id TEXT, role_id TEXT, headcount REAL,
        start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'open',
        notes TEXT, created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE project_lifecycle_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT,
        from_state TEXT, to_state TEXT NOT NULL, external_number TEXT,
        iteration_label TEXT, note TEXT, actor TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE project_design_estimations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT,
        estimated_design_pm REAL NOT NULL,
        deviation_low_pct REAL DEFAULT 20, deviation_high_pct REAL DEFAULT 50,
        notes TEXT, actual_design_pm REAL, backfilled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE project_estimations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT,
        estimated_loc REAL, backfilled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    for (const stmt of ddl) {
      await db.raw(stmt);
    }
    await db('roles').insert([
      { id: SE_ROLE, name: 'SE' },
      { id: DEV_ROLE, name: '开发' }
    ]);
    service = new LifecycleService(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function seedProject(id: string, state: string | null) {
    await db('projects').insert({ id, name: id, lifecycle_state: state });
  }

  afterEach(async () => {
    await db('projects').del();
    await db('project_assignments').del();
    await db('scenario_project_assignments').del();
    await db('project_pool_demands').del();
    await db('project_lifecycle_events').del();
  });

  test('state machine constants: 8 states', () => {
    expect(LIFECYCLE_STATES).toHaveLength(8);
  });

  test('free jump: pending_rat → scheduled succeeds without a pool (2026-09-21 ruling)', async () => {
    await seedProject('p1', 'pending_rat');
    const result = await service.transition({ projectId: 'p1', to: 'scheduled' });
    expect(result.project.lifecycle_state).toBe('scheduled');
    // The missing dev-side demand is an advisory warning, not a blocker
    const inputs = await (service as any).warningInputs(['p1']);
    const warnings = (service as any).computeWarningsForProject(
      { id: 'p1', lifecycle_state: 'scheduled' }, inputs
    );
    expect(warnings).toContain('NO_DEV_DEMAND');
  });

  test('in_iteration without a number warns NO_ITERATION_NUMBER; filled number clears it (2026-09-22 混排裁决)', async () => {
    await seedProject('p1', 'in_iteration');
    expect(await service.computeWarnings('p1')).toContain('NO_ITERATION_NUMBER');

    // 前缀自述粒度: SR 号与 AR 号同等对待,填上即消警
    await service.updateFields('p1', { external_number: 'SR-26-001' });
    expect(await service.computeWarnings('p1')).not.toContain('NO_ITERATION_NUMBER');

    await service.updateFields('p1', { external_number: 'AR-2026-101' });
    expect(await service.computeWarnings('p1')).not.toContain('NO_ITERATION_NUMBER');
  });

  test('non-iteration states never warn NO_ITERATION_NUMBER', async () => {
    await seedProject('p1', 'backlog');
    expect(await service.computeWarnings('p1')).not.toContain('NO_ITERATION_NUMBER');
  });

  test('rejects projects without a lifecycle (standing items)', async () => {
    await seedProject('p1', null);
    await expect(
      service.transition({ projectId: 'p1', to: 'designing' })
    ).rejects.toThrow(/not applicable/);
  });

  test('404 for unknown project', async () => {
    await expect(
      service.transition({ projectId: 'nope', to: 'designing' })
    ).rejects.toThrow(LifecycleError);
  });

  test('happy path: pending_rat → designing → backlog (AR recorded) → scheduled (pool) → in_iteration → delivered', async () => {
    await seedProject('p1', 'pending_rat');

    await service.transition({ projectId: 'p1', to: 'designing' });

    // 准入 without AR works (plain items)
    const admitted = await service.transition({ projectId: 'p1', to: 'backlog' });
    expect(admitted.project.lifecycle_state).toBe('backlog');
    expect(admitted.project.external_number).toBeNull();

    // Now set AR via the field-only update
    await service.updateFields('p1', { external_number: ' AR-123 ' });
    const withAr = await db('projects').where('id', 'p1').first();
    expect(withAr.external_number).toBe('AR-123');

    // Scheduling without a pool now succeeds (warning advises instead)
    const scheduled = await service.transition({
      projectId: 'p1',
      to: 'scheduled',
      pool: { role_id: DEV_ROLE, headcount: 2, start_date: '2026-10-01', end_date: '2026-12-31' }
    });
    expect(scheduled.project.lifecycle_state).toBe('scheduled');
    const pools = await db('project_pool_demands').where('project_id', 'p1');
    expect(pools).toHaveLength(1);
    expect(pools[0].headcount).toBe(2);
    expect(pools[0].status).toBe('open');

    const started = await service.transition({
      projectId: 'p1',
      to: 'in_iteration',
      iteration_label: 'Iter-10'
    });
    expect(started.project.iteration_label).toBe('Iter-10');

    // delivered auto-cancels remaining open pools
    const delivered = await service.transition({ projectId: 'p1', to: 'delivered' });
    expect(delivered.project.lifecycle_state).toBe('delivered');
    const poolsAfter = await db('project_pool_demands').where('project_id', 'p1');
    expect(poolsAfter[0].status).toBe('cancelled');

    // Every step left an audit event (creation excluded here)
    const events = await service.listEvents('p1');
    expect(events.map((e: any) => e.to_state)).toEqual([
      'delivered', 'in_iteration', 'scheduled', 'backlog', 'designing'
    ]);

    // Free flow: delivered may be left again (premature delivery happens)
    const revived = await service.transition({ projectId: 'p1', to: 'designing' });
    expect(revived.project.lifecycle_state).toBe('designing');
  });

  test('scheduled with dev demand raises no NO_DEV_DEMAND warning', async () => {
    await seedProject('p1', 'backlog');
    await db('scenario_project_assignments').insert({
      id: 'a1', project_id: 'p1', role_id: DEV_ROLE, status: 'active'
    });

    await service.transition({ projectId: 'p1', to: 'scheduled' });
    const warnings = await service.computeWarnings('p1');
    expect(warnings).not.toContain('NO_DEV_DEMAND');
    expect(warnings).toContain('NO_LOC_ESTIMATE'); // no LOC estimation yet
  });

  test('裁决取消 pauses every active assignment and cancels open pools', async () => {
    await seedProject('p1', 'in_iteration');
    await db('scenario_project_assignments').insert([
      { id: 'a1', project_id: 'p1', role_id: DEV_ROLE, status: 'active' },
      { id: 'a2', project_id: 'p1', role_id: SE_ROLE, status: 'active' }
    ]);
    await db('project_assignments').insert({
      id: 'a3', project_id: 'p1', role_id: DEV_ROLE, status: 'active'
    });
    await db('project_pool_demands').insert({
      id: 'pool1', project_id: 'p1', role_id: DEV_ROLE, headcount: 1, status: 'open'
    });

    const result = await service.transition({ projectId: 'p1', to: 'cancelled' });
    expect(result.project.lifecycle_state).toBe('cancelled');

    const statuses = await db('scenario_project_assignments').where('project_id', 'p1');
    expect(statuses.every((s: any) => s.status === 'paused')).toBe(true);
    const baseStatuses = await db('project_assignments').where('project_id', 'p1');
    expect(baseStatuses.every((s: any) => s.status === 'paused')).toBe(true);
    const pool = await db('project_pool_demands').where('id', 'pool1').first();
    expect(pool.status).toBe('cancelled');
  });

  test('退回 with pause: only dev-side assignments paused, SE untouched', async () => {
    await seedProject('p1', 'in_iteration');
    await db('scenario_project_assignments').insert([
      { id: 'a1', project_id: 'p1', role_id: DEV_ROLE, status: 'active' },
      { id: 'a2', project_id: 'p1', role_id: SE_ROLE, status: 'active' }
    ]);

    const result = await service.transition({
      projectId: 'p1',
      to: 'designing',
      dev_assignments_action: 'pause'
    });
    expect(result.project.lifecycle_state).toBe('designing');

    const dev = await db('scenario_project_assignments').where('id', 'a1').first();
    const se = await db('scenario_project_assignments').where('id', 'a2').first();
    expect(dev.status).toBe('paused');
    expect(se.status).toBe('active');
  });

  test('退回 with release deletes dev-side assignments, keeps AR', async () => {
    await seedProject('p1', 'scheduled');
    await db('projects').where('id', 'p1').update({ external_number: 'AR-9' });
    await db('scenario_project_assignments').insert([
      { id: 'a1', project_id: 'p1', role_id: DEV_ROLE, status: 'active' },
      { id: 'a2', project_id: 'p1', role_id: SE_ROLE, status: 'active' }
    ]);

    await service.transition({
      projectId: 'p1',
      to: 'designing',
      dev_assignments_action: 'release'
    });

    const remaining = await db('scenario_project_assignments').where('project_id', 'p1');
    expect(remaining.map((r: any) => r.id)).toEqual(['a2']);
    const project = await db('projects').where('id', 'p1').first();
    expect(project.external_number).toBe('AR-9');
  });

  test('退回 default keeps dev assignments untouched', async () => {
    await seedProject('p1', 'in_iteration');
    await db('scenario_project_assignments').insert({
      id: 'a1', project_id: 'p1', role_id: DEV_ROLE, status: 'active'
    });

    await service.transition({ projectId: 'p1', to: 'designing' });

    const row = await db('scenario_project_assignments').where('id', 'a1').first();
    expect(row.status).toBe('active');
  });

  test('NOK ⇄ designing round trip works', async () => {
    await seedProject('p1', 'designing');

    await service.transition({ projectId: 'p1', to: 'nok' });
    let project = await db('projects').where('id', 'p1').first();
    expect(project.lifecycle_state).toBe('nok');

    await service.transition({ projectId: 'p1', to: 'designing' });
    project = await db('projects').where('id', 'p1').first();
    expect(project.lifecycle_state).toBe('designing');
  });

  test('same-state transition rejected', async () => {
    await seedProject('p1', 'designing');
    await expect(
      service.transition({ projectId: 'p1', to: 'designing' })
    ).rejects.toThrow(/already/);
  });

  test('updateFields trims and nulls empty values', async () => {
    await seedProject('p1', 'designing');
    await service.updateFields('p1', { external_number: '  AR-7  ', iteration_label: '  ' });
    const project = await db('projects').where('id', 'p1').first();
    expect(project.external_number).toBe('AR-7');
    expect(project.iteration_label).toBeNull();
  });
});
