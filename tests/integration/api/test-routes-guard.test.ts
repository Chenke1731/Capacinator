/**
 * Environment guard for the e2e test routes (S1, optimization plan
 * 2026-09-28): /api/test-data and /api/test-context can bulk-DELETE
 * database content and the server listens on 0.0.0.0 (owner decision,
 * LAN access). The guard makes these dev/e2e-only tools physically
 * absent in production instead of merely undocumented. The e2e stack
 * runs NODE_ENV='e2e' (playwright webServer env), so it keeps access.
 */
import { describe, test, expect, afterEach, jest } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';
// Top-level import: setup.ts defines beforeAll/afterAll hooks, which are
// only legal at file scope — requiring it from inside the jest.mock
// factory (which runs mid-test) makes them "nested hooks" and jest aborts.
import { db as mockSetupDb } from '../setup';

// Same boundary mocks as the phase-dependencies supertest precedent:
// route the db at the integration test database, keep cron silent.
// The `mock`-prefixed variable is the hoist-whitelist trick — the factory
// may reference it because it is lazily evaluated only after this file's
// imports have run.
jest.mock('../../../src/server/database/index.js', () => {
  // Full export surface of the real module (db / getDb / getAuditedDb /
  // createDbFunction) — a bare { db } mock breaks the deep routes/index
  // import chain wherever a controller pulls getAuditedDb.
  return {
    db: mockSetupDb,
    getDb: () => mockSetupDb,
    getAuditedDb: () => mockSetupDb,
    createDbFunction: () => mockSetupDb
  };
});
jest.mock('../../../src/server/services/NotificationScheduler.js', () => ({
  notificationScheduler: {
    scheduleAssignmentNotification: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  }
}));

const ORIGINAL_ENV = process.env.NODE_ENV;

// routes/index.ts resolves the mount condition at module scope, so each
// scenario needs a fresh module registry with the env preset.
const mountApi = () => {
  let routes: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS require needed for reset-and-reload
    routes = require('../../../src/server/api/routes/index.js').default;
  });
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  return supertest(app);
};

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('test-route environment guard (S1)', () => {
  test('non-production: test-data routes stay mounted for dev/e2e', async () => {
    process.env.NODE_ENV = 'e2e';
    const request = mountApi();
    const res = await request.delete('/api/test-data/roles');
    expect(res.status).not.toBe(404);
  });

  test('production: test-data and test-context routes do not exist (404)', async () => {
    process.env.NODE_ENV = 'production';
    const request = mountApi();
    expect((await request.delete('/api/test-data/roles')).status).toBe(404);
    expect((await request.delete('/api/test-context/anything')).status).toBe(404);
  });
});
