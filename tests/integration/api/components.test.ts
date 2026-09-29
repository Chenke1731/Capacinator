/**
 * Component management (066) integration contract:
 * - plain CRUD via SimpleController on the real schema
 * - projects.component_id single-select FK wiring through
 *   ProjectsController create/update (black-list sanitization must
 *   pass it through and normalize '' to null)
 * - the legacy `status` field must no longer reach the insert (it made
 *   POST /api/projects 500 with "no column named status")
 * - RESTRICT semantics: a component referenced by a project cannot be
 *   deleted out from under it
 */
import { describe, test, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';
import { db as mockSetupDb } from '../setup';

jest.mock('../../../src/server/database/index.js', () => {
  const setupDb = require('../setup').db;
  return {
    db: setupDb,
    getDb: () => setupDb,
    getAuditedDb: () => setupDb,
    createDbFunction: () => setupDb
  };
});
jest.mock('../../../src/server/services/NotificationScheduler.js', () => ({
  notificationScheduler: {
    scheduleAssignmentNotification: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  }
}));

import routes from '../../../src/server/api/routes/index.js';

const app = express();
app.use(express.json());
app.use('/api', routes);
const request = supertest(app);
// create endpoints return a bare object (legacy envelope) — tolerate both
const idOf = (r: any) => r.body.data?.id ?? r.body.id;

afterEach(async () => {
  await mockSetupDb('projects').where('name', 'like', 'comp-test-%').del();
  await mockSetupDb('components').where('name', 'like', 'comp-test-%').del();
});

describe('components CRUD (066)', () => {
  test('create → list → update → delete round-trip', async () => {
    const created = await request.post('/api/components')
      .send({ name: 'comp-test-engine', code: 'ENG', description: '报表引擎' });
    expect(created.status).toBe(201);
    const id = idOf(created);
    expect((created.body.data ?? created.body).name).toBe('comp-test-engine');
    expect((created.body.data ?? created.body).is_active).toBe(1);

    const list = await request.get('/api/components');
    expect(list.body.data.some((c: any) => c.id === id)).toBe(true);

    const updated = await request.put(`/api/components/${id}`)
      .send({ description: '报表引擎 v2' });
    expect(updated.status).toBe(200);
    expect((updated.body.data ?? updated.body).description).toBe('报表引擎 v2');

    expect((await request.delete(`/api/components/${id}`)).status).toBe(200);
    expect((await request.get(`/api/components/${id}`)).status).toBe(404);
  });

  test('duplicate name is rejected by the unique constraint', async () => {
    await request.post('/api/components').send({ name: 'comp-test-dup' });
    const dup = await request.post('/api/components').send({ name: 'comp-test-dup' });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    await request.delete(`/api/components/${((await request.get('/api/components')).body.data ?? []).find((c: any) => c.name === 'comp-test-dup')?.id}`);
  });
});

describe('projects.component_id wiring', () => {
  // Self-seeded type/sub_type via direct inserts in beforeEach — same
  // db-access pattern as the (working) afterEach cleanup; the HTTP route
  // is blocked by a test-schema gap (project_types lacks parent_id/
  // is_default) and a one-off beforeAll insert hit pool contention.
  let subTypeId = '';
  beforeEach(async () => {
    const now = new Date();
    await mockSetupDb('project_types').insert({ id: 'comp-test-type-id', name: 'comp-test-type', created_at: now, updated_at: now });
    await mockSetupDb('project_sub_types')
      .insert({ id: 'comp-test-sub-id', project_type_id: 'comp-test-type-id', name: 'comp-test-sub', sort_order: 0, is_default: 1, is_active: 1, created_at: now, updated_at: now });
    subTypeId = 'comp-test-sub-id';
  });

const mkProjectBody = (component_id?: string | null) => ({
    name: 'comp-test-project',
    // create() validates the pair from the raw body — both must be sent
    project_type_id: 'comp-test-type-id',
    project_sub_type_id: subTypeId,
    component_id
  });

  const seedComponent = async () => {
    const res = await request.post('/api/components').send({ name: 'comp-test-for-project' });
    return idOf(res) as string;
  };

  test('create/update pass component_id through and persist it', async () => {
    const compId = await seedComponent();
    const created = await request.post('/api/projects').send(mkProjectBody(compId));
    expect([200, 201]).toContain(created.status);
    const pid = created.body.data.id;
    expect((created.body.data ?? created.body).component_id).toBe(compId);

    // reassign to another component via update
    const comp2 = idOf(await request.post('/api/components').send({ name: 'comp-test-second' }));
    const updated = await request.put(`/api/projects/${pid}`).send({ component_id: comp2 });
    expect(updated.status).toBe(200);
    const row = await mockSetupDb('projects').where('id', pid).first();
    expect(row.component_id).toBe(comp2);

    // '' normalizes to null (form reset), not a FK violation
    const cleared = await request.put(`/api/projects/${pid}`).send({ component_id: '' });
    expect(cleared.status).toBe(200);
    expect((await mockSetupDb('projects').where('id', pid).first()).component_id).toBeNull();
  });

  test('legacy status field no longer blows up the insert (was 500)', async () => {
    const compId = await seedComponent();
    const res = await request.post('/api/projects')
      .send({ ...mkProjectBody(compId), status: 'active' });
    expect([200, 201]).toContain(res.status);
  });

  test('RESTRICT: a component referenced by a project cannot be deleted', async () => {
    const compId = await seedComponent();
    await request.post('/api/projects').send(mkProjectBody(compId));
    const del = await request.delete(`/api/components/${compId}`);
    expect(del.status).toBeGreaterThanOrEqual(400);
  });

  test('by-component report aggregates project counts with an explicit unassigned bucket', async () => {
    const compId = await seedComponent();
    await request.post('/api/projects').send(mkProjectBody(compId));
    await request.post('/api/projects').send(mkProjectBody(null)); // unassigned

    const res = await request.get('/api/reporting/by-component');
    expect(res.status).toBe(200);
    const rows = res.body.data.data ?? res.body.data;
    const assigned = rows.find((r: any) => r.component_id === compId);
    expect(assigned?.project_count).toBeGreaterThanOrEqual(1);
    const unassigned = rows.find((r: any) => r.component_id === null);
    expect(unassigned?.component_name).toBe('未归属');
    expect(unassigned?.project_count).toBeGreaterThanOrEqual(1);
  });

  afterEach(async () => {
    // inner hooks run before the file-level cleanup, so dependents first
    await mockSetupDb('projects').where('name', 'like', 'comp-test-%').del();
    await mockSetupDb('project_sub_types').where('id', 'comp-test-sub-id').del();
    await mockSetupDb('project_types').where('id', 'comp-test-type-id').del();
  });
});
