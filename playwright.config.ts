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
  testIgnore: ['**/archived/**/*.spec.ts'],
  
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
      testIgnore: [/.*smoke.*\.spec\.ts$/, /.*slow.*\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'] },
    },

    // Firefox tests
    {
      name: 'firefox',
      testMatch: /.*@cross-browser.*\.spec\.ts$/,
      use: { ...devices['Desktop Firefox'] },
    },

    // Mobile tests
    {
      name: 'mobile',
      testMatch: /.*mobile.*\.spec\.ts$/,
      use: { ...devices['iPhone 13'] },
    },

    // API tests (no browser needed)
    {
      name: 'api',
      testMatch: /.*api.*\.spec\.ts$/,
      use: {
        // No browser context for API tests
        browserName: 'chromium',
        headless: true,
      },
    },

    // Slow/Complex scenario tests
    {
      name: 'scenarios',
      testMatch: /.*scenario.*\.spec\.ts$/,
      timeout: 120000, // 2 minutes for complex scenarios
      use: { 
        ...devices['Desktop Chrome'],
        video: 'on', // Always record scenarios
      },
    },
  ],

  /* Folder for test artifacts */
  outputDir: 'test-results/',

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