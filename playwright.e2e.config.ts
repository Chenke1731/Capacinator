import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E Test Configuration with Isolated Environment
 * This configuration ensures complete isolation from dev environment
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel - disabled for shared data scenarios */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'test-results/e2e-html', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }]
  ],
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like await page.goto('/') */
    baseURL: 'http://localhost:3122', // E2E-specific port (E2E_PORTS.frontend)
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshots on failure */
    screenshot: 'only-on-failure',
    
    /* Video recording */
    video: 'retain-on-failure',
    
    /* Timeout for each action */
    actionTimeout: 15000,
    
    /* Timeout for navigation */
    navigationTimeout: 30000,
    
    /* Extra HTTP headers */
    extraHTTPHeaders: {
      'X-Test-Environment': 'e2e'
    },
    
    /* Ignore SSL certificate errors for self-signed certificates */
    ignoreHTTPSErrors: true,
  },

  /* Global test configuration */
  timeout: 90 * 1000, // 90 seconds per test (longer for e2e)
  expect: {
    timeout: 15 * 1000, // 15 seconds for expect assertions
  },

  /* Test output directories */
  outputDir: 'test-results/e2e-artifacts',

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        actionTimeout: 15000,
        navigationTimeout: 30000,
        // Use a different storage state for e2e tests (optional)
        // storageState: 'test-results/e2e-auth.json'
      },
    },
    
    // Enable additional browsers for comprehensive e2e testing
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        actionTimeout: 15000,
        navigationTimeout: 30000,
      },
    },

    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        actionTimeout: 15000,
        navigationTimeout: 30000,
      },
    },

    /* Test against mobile viewports for responsive testing */
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        actionTimeout: 20000,
        navigationTimeout: 40000,
      },
    },
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
        actionTimeout: 20000,
        navigationTimeout: 40000,
      },
    },
  ],

  /* Run your local e2e server before starting the tests */
  // webServer: {
  //   command: './scripts/start-e2e-server.sh',
  //   url: 'http://localhost:3120',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000, // 2 minutes to start e2e environment
  //   env: {
  //     NODE_ENV: 'e2e',
  //     PORT: '3111',
  //     FRONTEND_PORT: '3121',
  //     E2E_RESET_DB: 'true',
  //     E2E_SEED_DATA: 'true',
  //   },
  // },

  /* Global setup and teardown */
  // globalSetup: path.join(__dirname, 'tests/e2e/helpers/e2e-global-setup.ts'),
  // globalTeardown: path.join(__dirname, 'tests/e2e/helpers/e2e-global-teardown.ts'),
});