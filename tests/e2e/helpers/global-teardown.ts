/**
 * Global Teardown for E2E Tests — slim version (2026-09-24 migration)
 *
 * Server processes are owned (and guaranteed-reaped) by Playwright's
 * webServer; the e2e database is rebuilt from scratch by the backend on
 * the next run, so test-data cleanup is unnecessary. Only the local auth
 * artifact remains to clean.
 *
 * History: this file used to stop spawned processes, clear ports with
 * SIGTERM→SIGKILL, and delete test data by name pattern (198 lines) —
 * the machinery behind the recurring teardown "Killed" that swallowed
 * test summaries and left orphan processes.
 */
import fs from 'fs';
import path from 'path';

async function globalTeardown(): Promise<void> {
  console.log('🧹 E2E global teardown...');

  const authPath = path.resolve('test-results/e2e-auth.json');
  if (fs.existsSync(authPath)) {
    fs.unlinkSync(authPath);
    console.log('🗑️ Removed e2e auth state');
  }

  console.log('✅ E2E global teardown complete (webServer processes reaped by Playwright)');
}

export default globalTeardown;
