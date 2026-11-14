import { Knex } from 'knex';
import path from 'path';

/**
 * E2E Test Database Configuration
 * Uses a file-based SQLite database for proper cross-process access
 */

// E2E database path.
// E2E_DB_PATH (or DATABASE_URL) lets a second isolated stack (nightly audit)
// use its own file instead of deleting the Playwright e2e database.
const DEFAULT_E2E_DB_DIR = path.resolve(process.cwd(), '.e2e-data');
const configuredDb = process.env.E2E_DB_PATH ?? process.env.DATABASE_URL;
const normalizeDb = (value: string) => (value.startsWith('sqlite:') ? value.slice('sqlite:'.length) : value);
const E2E_DB_FILE = configuredDb
  ? path.resolve(normalizeDb(configuredDb))
  : path.join(DEFAULT_E2E_DB_DIR, 'e2e-test.db');
const E2E_DB_DIR = configuredDb ? path.dirname(E2E_DB_FILE) : DEFAULT_E2E_DB_DIR;

const e2eConfig: Knex.Config = {
  client: 'better-sqlite3',
  connection: {
    filename: E2E_DB_FILE
  },
  useNullAsDefault: true,
  acquireConnectionTimeout: 10000, // 10 seconds for E2E
  migrations: {
    directory: path.resolve(process.cwd(), 'src/server/database/migrations'),
    loadExtensions: ['.ts', '.js'],
    extension: 'ts'
  },
  seeds: {
    directory: path.resolve(process.cwd(), 'src/server/database/seeds'),
    loadExtensions: ['.ts', '.js'], 
    extension: 'ts'
  },
  // SQLite configuration optimized for E2E tests
  pool: {
    min: 0,
    max: 1,
    afterCreate: (conn: any, cb: any) => {
      // E2E optimizations for speed
      conn.pragma('synchronous = OFF'); // Fastest, acceptable for tests
      conn.pragma('journal_mode = MEMORY'); // Keep journal in memory
      conn.pragma('foreign_keys = ON');
      conn.pragma('busy_timeout = 5000'); // 5 second timeout
      conn.pragma('cache_size = -32000'); // 32MB cache
      conn.pragma('temp_store = MEMORY'); // Use memory for temp tables
      cb();
    }
  }
};

export default e2eConfig;
export { DEFAULT_E2E_DB_DIR, E2E_DB_FILE, E2E_DB_DIR };