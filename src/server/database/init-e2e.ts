import { Knex } from 'knex';
import knex from 'knex';
import fs from 'fs/promises';
import path from 'node:path';
import e2eConfig, { DEFAULT_E2E_DB_DIR, E2E_DB_FILE, E2E_DB_DIR } from './knexfile.e2e.js';
import { initializeAuditService } from '../services/audit/index.js';

let e2eDb: Knex | null = null;

/**
 * Initialize E2E test database
 * Creates a fresh SQLite database for E2E tests
 */
export async function initializeE2EDatabase(): Promise<Knex> {
  console.log('🧪 Initializing E2E test database...');

  // Safety: E2E initialization deletes the target file. Never allow it to
  // point outside the dedicated .e2e-data directory (e.g. a production DB).
  const resolvedDbFile = path.resolve(E2E_DB_FILE);
  const allowedRoot = path.resolve(DEFAULT_E2E_DB_DIR);
  if (!resolvedDbFile.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error(
      `Refusing to initialize E2E database outside ${allowedRoot}: ${resolvedDbFile}`
    );
  }

  // Close existing connection if any
  if (e2eDb) {
    await e2eDb.destroy();
  }

  // Ensure E2E database directory exists
  try {
    await fs.mkdir(E2E_DB_DIR, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      console.error('❌ Failed to create E2E database directory:', err);
      throw err;
    }
  }

  // Delete existing E2E database file if it exists for a clean slate
  try {
    await fs.unlink(E2E_DB_FILE);
    console.log('🗑️ Removed existing E2E database file');
  } catch (err: any) {
    // File doesn't exist, that's fine
    if (err.code !== 'ENOENT') {
      console.warn('⚠️ Warning: Could not delete E2E database file:', err.message);
    }
  }

  // Create E2E database connection using the file-based config
  e2eDb = knex(e2eConfig);

  try {
    // Run migrations
    console.log('🔧 Running E2E database migrations...');
    await e2eDb.migrate.latest();
    
    // Run E2E specific seeds only - it includes all necessary data
    console.log('🌱 Seeding E2E test data...');
    await e2eDb.seed.run({ specific: 'e2e-test-data-consolidated.ts' });
    
    // Initialize audit service for E2E tests
    console.log('🔍 Initializing audit service for E2E...');
    initializeAuditService(e2eDb);
    
    // Set global E2E database for server to use
    (global as any).__E2E_DB__ = e2eDb;
    
    console.log('✅ E2E database initialized successfully');
    return e2eDb;
  } catch (error) {
    console.error('❌ Failed to initialize E2E database:', error);
    throw error;
  }
}

/**
 * Get E2E database instance
 */
export function getE2EDatabase(): Knex {
  if (!e2eDb) {
    throw new Error('E2E database not initialized. Call initializeE2EDatabase() first.');
  }
  return e2eDb;
}

/**
 * Cleanup E2E database
 * Closes connections and cleans up resources
 */
export async function cleanupE2EDatabase(): Promise<void> {
  console.log('🧹 Cleaning up E2E database...');
  
  if (e2eDb) {
    try {
      await e2eDb.destroy();
      e2eDb = null;
      // Clear global E2E database
      delete (global as any).__E2E_DB__;
      
      // Delete the E2E database file
      try {
        await fs.unlink(E2E_DB_FILE);
        console.log('🗑️ Removed E2E database file');
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.warn('⚠️ Warning: Could not delete E2E database file:', err.message);
        }
      }
      
      console.log('✅ E2E database cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up E2E database:', error);
    }
  }
}

/**
 * Reset E2E database to initial state
 * Useful between test suites
 */
export async function resetE2EDatabase(): Promise<void> {
  console.log('🔄 Resetting E2E database...');
  
  if (!e2eDb) {
    await initializeE2EDatabase();
    return;
  }

  try {
    // Rollback all migrations and re-run
    await e2eDb.migrate.rollback(undefined, true);
    await e2eDb.migrate.latest();
    
    // Re-seed data
    await e2eDb.seed.run({ specific: 'e2e-test-data-consolidated.ts' });
    
    console.log('✅ E2E database reset complete');
  } catch (error) {
    console.error('❌ Error resetting E2E database:', error);
    throw error;
  }
}