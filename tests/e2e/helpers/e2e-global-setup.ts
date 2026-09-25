/**
 * Global Setup for E2E Tests — slim version (2026-09-24 migration)
 *
 * Server lifecycle is owned by Playwright's native webServer config:
 * the backend (3111, NODE_ENV=e2e → .e2e-data/e2e-test.db rebuilt from
 * scratch on startup) and the frontend (3122, strictPort) are started
 * and guaranteed-reaped by Playwright itself. This setup only:
 *   1. asserts the port contract (e2e never overlaps the dev stack),
 *   2. asserts backend health (fail fast with a clear message),
 *   3. warms the frontend — first page load triggers vite's on-demand
 *      compilation; paying that cost here (inside the setup budget)
 *      keeps per-test profile/login fixtures inside their timeouts.
 *      Root cause of the 2026-09-24 "Profile selection failed" batch
 *      timeouts in the cold e2e world.
 */
import { FullConfig, chromium } from '@playwright/test';
import { E2E_PORTS, assertE2ePortsDisjointFromDev } from './port-cleanup.js';

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('🚀 E2E global setup (webServer owns process lifecycle)...');

  assertE2ePortsDisjointFromDev();

  const baseURL =
    config.projects[0]?.use?.baseURL || `http://localhost:${E2E_PORTS.frontend}`;

  // 1. Backend health — webServer already ensured it; a failure here means
  //    the webServer config and this file drifted apart.
  const health = await fetch(`http://localhost:${E2E_PORTS.backend}/api/health`);
  if (!health.ok) {
    throw new Error(
      `E2E backend on :${E2E_PORTS.backend} unhealthy (${health.status}) — check webServer config`
    );
  }
  console.log('✅ E2E backend healthy');

  // 2. Warm the frontend (cold-start compilation budget: 60s page load,
  //    30s for either the login dialog or the main app to render) AND log
  //    in once — the storage state is saved to test-results/e2e-auth.json,
  //    which the authenticatedPage fixture injects into every context,
  //    skipping the interactive login (~3-5s saved per test).
  const browser = await chromium.launch({ headless: process.env.HEADED !== 'true' });
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Login if the profile dialog shows (state could persist from the page's
    // own localStorage in dev — tests always start from a fresh context).
    const loginVisible = await page.locator('#person-select').isVisible().catch(() => false)
      || await page.waitForSelector('#person-select', { timeout: 5000 }).then(() => true).catch(() => false);

    if (loginVisible) {
      // Radix combobox select: open, pick the first person, Continue
      await page.click('#person-select');
      await page.locator('[role="option"]').first().click();
      await page.locator('button:has-text("Continue")').click();
      await page.waitForSelector('.sidebar, nav', { timeout: 30_000 });
      console.log('✅ Logged in during global warmup');
    } else {
      await page.waitForSelector('.sidebar, nav', { timeout: 30_000 });
      console.log('✅ Frontend warm (main app already rendered)');
    }

    await page.context().storageState({ path: 'test-results/e2e-auth.json' });
    console.log('✅ Auth storage state saved for per-test reuse');
  } finally {
    await browser.close();
  }

  // 3. Env markers consumed by helpers/tests.
  process.env.TEST_BASE_URL = baseURL;
  process.env.TEST_SETUP_COMPLETE = 'true';

  console.log('✅ E2E global setup complete');
}

export default globalSetup;
