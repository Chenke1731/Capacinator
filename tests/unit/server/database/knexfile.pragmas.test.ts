/**
 * PRAGMA contract for the main knex connection (P2, optimization plan
 * 2026-09-28): the production/dev config must enable WAL — writes stop
 * taking the whole-database lock, so cron backups no longer block inline
 * edits (and vice versa). The e2e config is exempt on purpose (journal in
 * MEMORY for speed); this test pins the MAIN config only.
 *
 * Note: an in-memory database can never be WAL (its journal is always
 * 'memory'), so this test must exercise a real temp-file database.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import knexConfig from '../../../../src/server/database/knexfile';

const afterCreate = (knexConfig as any).pool.afterCreate as
  (conn: any, cb: (err: unknown) => void) => void;

describe('knexfile main-config PRAGMAs', () => {
  let dir: string;
  let conn: any;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'capacinator-pragma-'));
    conn = new Database(path.join(dir, 'pragma-test.db'));
  });

  afterEach(() => {
    conn.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies the afterCreate PRAGMAs to a fresh connection', (done) => {
    afterCreate(conn, (err) => {
      expect(err).toBeUndefined();
      expect(conn.pragma('journal_mode', { simple: true })).toBe('wal');
      done();
    });
  });

  it('keeps foreign keys and the busy timeout as before', (done) => {
    afterCreate(conn, (err) => {
      expect(err).toBeUndefined();
      expect(conn.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(conn.pragma('busy_timeout', { simple: true })).toBe(30000);
      done();
    });
  });
});
