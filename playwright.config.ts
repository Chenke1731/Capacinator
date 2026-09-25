import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Unified Playwright Configuration
 * Single source of truth for all e2e tests
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Exclude the archive as a DIRECTORY: the finer '**/archived/**/*.spec.ts'
  // glob failed to match files directly under archived/ — Playwright then
  // tried to load them, their broken relative imports (archived/fixtures)
  // errored, and whole-suite discovery collapsed to "0 tests".
  testIgnore: ['**/archived/**'],
  
  /* Fail the build on CI if test.only is committed */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  
  /* Limit workers for better stability */
  workers: process.env.CI ? 2 : 4,
  
  /* Reporter configuration */
  reporter: process.env.CI 
    ? [['html'], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  
  /* Global timeout for each test */
  timeout: 60000,
  
  /* Global timeout for expect assertions */
  expect: {
    timeout: 10000
  },

  /* Global setup and teardown */
  globalSetup: './tests/e2e/helpers/e2e-global-setup.ts',
  globalTeardown: './tests/e2e/helpers/global-teardown.ts',
  
  /* Shared settings for all projects */
  use: {
    /* Base URL — E2E frontend port, must mirror E2E_PORTS.frontend
       (tests/e2e/helpers/port-cleanup.ts). Never 3120 (dev client). */
    baseURL: process.env.BASE_URL || 'http://localhost:3122',
    
    /* Trace collection */
    trace: 'on-first-retry',
    
    /* Screenshots */
    screenshot: 'only-on-failure',
    
    /* Ignore HTTPS errors for local development */
    ignoreHTTPSErrors: true,
    
    /* Timeout configuration */
    actionTimeout: 30000,
    navigationTimeout: 30000,
    
    /* Video recording */
    video: 'retain-on-failure',
    
    /* Viewport */
    viewport: { width: 1280, height: 720 },
    
    /* Locale and timezone */
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  /* Test projects configuration */
  projects: [
    // Quick smoke tests
    {
      name: 'smoke',
      testMatch: /.*smoke.*\.spec\.ts$/,
      use: { 
        ...devices['Desktop Chrome'],
        // Faster timeout for smoke tests
        navigationTimeout: 15000,
      },
    },

    // Main test suite - Chrome
    {
      name: 'chromium',
      // Project-level testIgnore REPLACES the config-level one, so the
      // archived/ exclusion must be repeated here — without it Playwright
      // loads the archive's specs, their broken imports (archived/fixtures)
      // error out, and default discovery collapses to "0 tests" (silently
      // zeroing the main suite; path-filtered runs kept working, which is
      // why nobody noticed).
      testMatch: /\.spec\.ts$/,
      // api specs are excluded: pure-API tests (no `page` usage) run in the
      // api project — one runner per world (v1.4 P4 migration).
      testIgnore: [/.*archived.*/, /.*smoke.*\.spec\.ts$/, /.*slow.*\.spec\.ts$/, /.*scenario.*\.spec\.ts$/, /.*api.*\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'] },
    },

    // API tests (no browser needed). testIgnore REPLACES the config-level
    // one, so archived/ must be repeated here; scenario specs are excluded
    // because playwright.scenario.config.ts is their sole runner (v1.4) —
    // api-scenario-filtering drives a real browser page, not a request context.
    {
      name: 'api',
      testMatch: /.*api.*\.spec\.ts$/,
      testIgnore: ['**/archived/**', /.*scenario.*\.spec\.ts$/],
      use: {
        // No browser context for API tests
        browserName: 'chromium',
        headless: true,
      },
    },
  ],

  /* Folder for test artifacts */
  outputDir: 'test-results/',

  /* E2E world servers — owned & reaped by Playwright (must mirror E2E_PORTS
     in tests/e2e/helpers/port-cleanup.ts; never 3110/3120 = dev stack).
     Backend NODE_ENV=e2e rebuilds .e2e-data/e2e-test.db from scratch. */
  webServer: [
    {
      command: 'npx tsx src/server/index.ts',
      url: `http://localhost:3111/api/health`,
      timeout: 90_000, // first run includes db rebuild + migrations + seed
      reuseExistingServer: !process.env.CI,
      env: { NODE_ENV: 'e2e', PORT: '3111', FORCE_COLOR: '0', AUDIT_ENABLED: 'true' },
      stdout: 'pipe',
    },
    {
      command:
        'npx vite --config client-vite.config.ts --port 3122 --strictPort',
      url: 'http://localhost:3122',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      // VITE_E2E disables the nginx-topology HMR websocket — its failed
      // wss handshake polluted the "no console errors" test (flaky).
      // PORT feeds the /api proxy target in client-vite.config.ts — without
      // it the proxy silently defaults to 3110 = the DEV backend, and the
      // e2e browser reads/writes dev data (incident: scenario tests never
      // saw apiContext-created data on 3111).
      env: { VITE_E2E: '1', PORT: '3111' },
    },
  ],

  /* Configure web server */
  // webServer: process.env.CI ? undefined : {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3120/api/health',
  //   timeout: 120 * 1000,
  //   reuseExistingServer: true,
  //   stdout: 'pipe',
  //   stderr: 'pipe',
  // },
});