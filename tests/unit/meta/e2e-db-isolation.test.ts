/**
 * I19b guard: the nightly audit and Playwright E2E must not share a database.
 *
 * `init-e2e.ts` deletes its target file on startup. If the nightly stack keeps
 * using the default `.e2e-data/e2e-test.db`, starting the nightly audit wipes
 * the database used by a concurrently running Playwright suite. These are
 * static assertions on the source contract; the runtime probe is the
 * `E2E_DB_PATH=...` check documented in the I19 ledger.
 */
import { readFileSync } from 'fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('nightly/E2E database isolation', () => {
  test('knexfile.e2e accepts an explicit E2E_DB_PATH override', () => {
    const src = read('src/server/database/knexfile.e2e.ts');
    expect(src).toMatch(/E2E_DB_PATH/);
    expect(src).toMatch(/DATABASE_URL/);
    expect(src).toMatch(/DEFAULT_E2E_DB_DIR/);
  });

  test('init-e2e refuses to delete outside .e2e-data', () => {
    const src = read('src/server/database/init-e2e.ts');
    expect(src).toMatch(/Refusing to initialize E2E database outside/);
    expect(src).toMatch(/DEFAULT_E2E_DB_DIR/);
  });

  test('nightly audit uses its own database and a lock', () => {
    const src = read('scripts/audit-nightly.mjs');
    expect(src).toMatch(/audit-nightly\.db/);
    expect(src).toMatch(/E2E_DB_PATH/);
    expect(src).toMatch(/AUDIT_NIGHTLY_DB/);
    expect(src).toMatch(/audit-nightly\.lock/);
  });
});
