/**
 * board-feed contract (P7): one slim request for the whole board.
 * - returns every project (no pagination cliff — the demand board's
 *   correctness depends on the full set for trees + client filters)
 * - carries the audited board fields incl. assembled summaries and tags
 * - drops the heavy detail fields (getById owns those)
 */
import { describe, test, expect, afterEach, beforeAll, jest } from '@jest/globals';
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
process.env.NODE_ENV = 'development'; // temp

const app = express();
app.use(express.json());
app.use('/api', routes);
const request = supertest(app);

describe('GET /api/projects/board-feed', () => {
  let projectId: string;
  beforeAll(async () => {
    const now = new Date();
    await mockSetupDb('project_types').insert({ id: 'bf-type-id', name: 'bf-type', created_at: now, updated_at: now });
    await mockSetupDb('project_sub_types')
      .insert({ id: 'bf-sub-id', project_type_id: 'bf-type-id', name: 'bf-sub', sort_order: 0, is_default: 1, is_active: 1, created_at: now, updated_at: now });
  });
  afterEach(async () => {
    await mockSetupDb('projects').where('name', 'like', 'bf-%').del();
  });
  afterAll(async () => {
    await mockSetupDb('project_sub_types').where('id', 'bf-sub-id').del();
    await mockSetupDb('project_types').where('id', 'bf-type-id').del();
  });

  test('returns the full set with board fields, without heavy detail fields', async () => {
    const created = await request.post('/api/projects')
      .send({ name: 'bf-project', project_type_id: 'bf-type-id', project_sub_type_id: 'bf-sub-id' });
    projectId = (created.body.data ?? created.body).id;

    const res = await request.get('/api/projects/board-feed');
    if (res.status !== 200) console.log('DBG:', JSON.stringify(res.body).slice(0, 1200));
    expect(res.status).toBe(200);
    const payload = res.body.data;
    const rows = Array.isArray(payload) ? payload : payload.data;
    expect(rows.some((r: any) => r.id === projectId)).toBe(true);

    const row = rows.find((r: any) => r.id === projectId);
    for (const f of ['name', 'seq_number', 'parent_id', 'project_type_name', 'lifecycle_state', 'tags', 'lifecycle_warnings', 'estimation_summary']) {
      expect(f in row).toBe(true);
    }
    for (const heavy of ['description', 'data_restrictions', 'aspiration_start', 'current_phase_id']) {
      expect(heavy in row).toBe(false);
    }
  });
});
