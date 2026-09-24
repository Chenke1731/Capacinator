import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration specifically for scenario planning tests.
 * These tests focus on database corruption prevention and require special handling.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    '**/scenario-*.spec.ts',
    '**/scenario-*.test.ts'
  ],
  
  /* Run tests in files in parallel but run tests within files serially for database safety */
  fullyParallel: false,
  workers: 1, // Critical: Use only 1 worker to prevent database conflicts
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only for flaky network issues, not for logic errors */
  retries: process.env.CI ? 1 : 0,
  
  /* Opt out of parallel tests on CI for database safety */
  workers: process.env.CI ? 1 : 1,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'test-results/scenario-html-report' }],
    ['json', { outputFile: 'test-results/scenario-results.json' }],
    ['junit', { outputFile: 'test-results/scenario-junit.xml' }]
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3122',
    
    /* API base URL for request operations */
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video recording for critical scenario tests */
    video: 'retain-on-failure',
    
    /* Longer timeout for database operations */
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  /* Configure global setup and teardown */
  globalSetup: './tests/e2e/helpers/global-setup.ts',
  globalTeardown: './tests/e2e/helpers/global-teardown.ts',

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'scenario-chrome',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/scenario-*.spec.ts'
    },
    
    {
      name: 'scenario-firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: '**/scenario-planning.spec.ts' // Run basic tests only on Firefox
    },

    /* Test against mobile viewports for scenario management UI */
    {
      name: 'scenario-mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/scenario-planning.spec.ts' // UI tests only
    },

    /* Database corruption prevention tests - Chrome only for consistency */
    {
      name: 'scenario-corruption-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        '**/scenario-merge-corruption-prevention.spec.ts',
        '**/scenario-concurrent-operations.spec.ts'
      ],
      timeout: 60000, // Longer timeout for complex operations
    }
  ],

  /* E2E world servers — same pair as playwright.config.ts (must mirror
     E2E_PORTS in tests/e2e/helpers/port-cleanup.ts). The old pair
     (backend 3131 / frontend 3130) was self-contradictory: the frontend
     had no PORT env, so its /api proxy silently targeted 3110 — the dev
     backend. Unified onto the e2e world (3111/3122). */
  webServer: [
    {
      command: 'npx tsx src/server/index.ts',
      url: 'http://localhost:3111/api/health',
      timeout: 90_000,
      reuseExistingServer: !process.env.CI,
      env: { NODE_ENV: 'e2e', PORT: '3111', FORCE_COLOR: '0' },
      stdout: 'pipe',
    },
    {
      command:
        'npx vite --config client-vite.config.ts --port 3122 --strictPort',
      url: 'http://localhost:3122',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    }
  ],

  /* Test timeouts */
  timeout: 30000,
  expect: {
    timeout: 10000
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results/scenario-artifacts/',
  
  /* Global test configuration */
  globalTimeout: 600000, // 10 minutes for all scenario tests
  
  /* Metadata for test reports */
  metadata: {
    testType: 'Scenario Planning E2E Tests',
    focus: 'Database Corruption Prevention',
    criticality: 'HIGH - These tests prevent data loss',
    description: 'Critical tests ensuring scenario merge operations never corrupt the database'
  }
});