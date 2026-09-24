/**
 * Unified E2E Test Fixtures
 * Provides consistent test setup across all e2e tests
 *
 * Key fixtures:
 * - testDataFactory: RECOMMENDED - Unified test data factory with cleanup tracking
 * - testContextManager: Per-test data isolation with automatic cleanup
 * - testHelpers: Common UI interaction helpers
 * - authenticatedPage: Pre-authenticated browser page
 * - testDataHelpers: Legacy test data creation helpers (deprecated)
 * - e2eTestDataBuilder: Legacy builder (deprecated - use testDataFactory)
 * - testData: Legacy generator (deprecated - use testDataFactory)
 */

import { test as base, Page, APIRequestContext } from '@playwright/test';
import { TestHelpers } from '../utils/test-helpers';
import { TestDataGenerator } from '../helpers/test-data-generator';
import { TestDataHelpers } from '../utils/test-data-helpers';
import { E2ETestDataBuilder } from '../helpers/e2e-test-data-builder';
import {
  UnifiedTestDataFactory,
  createUnifiedTestDataFactory,
} from '../helpers/unified-test-data-factory';
import {
  TestContextManager,
  createTestContextManager,
} from '../helpers/test-context-manager';
import type { TestContext } from '../helpers/test-context-manager';
import fs from 'fs';
import path from 'path';

// Define fixture types
type TestFixtures = {
  testHelpers: TestHelpers;
  authenticatedPage: Page;
  apiContext: APIRequestContext;
  /** RECOMMENDED: Unified test data factory with automatic cleanup and retry logic */
  testDataFactory: UnifiedTestDataFactory;
  /** @deprecated Use testDataFactory instead */
  testData: TestDataGenerator;
  /** @deprecated Use testDataFactory instead */
  testDataHelpers: TestDataHelpers;
  /** @deprecated Use testDataFactory instead */
  e2eTestDataBuilder: E2ETestDataBuilder;
  seededDatabase: void;
  /** Per-test data isolation manager */
  testContextManager: TestContextManager;
  /** Isolated test context (auto-created and cleaned up) */
  isolatedContext: TestContext;
};

// Extend base test with our fixtures
export const test = base.extend<TestFixtures>({
  // Test helpers fixture - provides common UI interactions
  testHelpers: async ({ page }, use) => {
    const helpers = new TestHelpers(page);
    await use(helpers);
  },

  // Pre-authenticated page fixture - handles profile selection automatically
  authenticatedPage: async ({ page, context }, use) => {
    const helpers = new TestHelpers(page);
    
    // Try to load saved auth state
    try {
      const authPath = path.resolve('test-results/e2e-auth.json');
      if (fs.existsSync(authPath)) {
        // Load saved storage state
        const storageState = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
        
        // Apply cookies and localStorage
        if (storageState.cookies && storageState.cookies.length > 0) {
          await context.addCookies(storageState.cookies);
        }
        if (storageState.origins && storageState.origins.length > 0) {
          for (const origin of storageState.origins) {
            if (origin.localStorage && origin.localStorage.length > 0) {
              await page.goto(origin.origin);
              await page.evaluate((items) => {
                for (const item of items) {
                  localStorage.setItem(item.name, item.value);
                }
              }, origin.localStorage);
            }
          }
        }
        console.log('✅ Loaded saved authentication state');
      }
    } catch (error) {
      console.log('⚠️ Could not load saved auth state:', error);
    }
    
    // Navigate to home using the helper which has baseURL context
    await helpers.navigateTo('/');
    
    // Setup page (handles profile selection if needed)
    await helpers.setupPage();
    
    // Ensure we're authenticated and ready
    const currentUrl = page.url();
    if (!currentUrl.includes('/dashboard') && !currentUrl.includes('/projects') && !currentUrl.includes('/people')) {
      try {
        await page.waitForURL('**/dashboard', { timeout: 10000 });
      } catch {
        // If not redirected, navigate to dashboard
        await helpers.navigateTo('/dashboard');
      }
    }
    
    // Clear any notifications or modals
    await helpers.clearNotifications();
    
    await use(page);
  },

  // API context for direct API calls
  apiContext: async ({ playwright }, use) => {
    const apiContext = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3111',
      extraHTTPHeaders: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    await use(apiContext);
    await apiContext.dispose();
  },

  // RECOMMENDED: Unified test data factory with automatic cleanup and retry logic
  testDataFactory: async ({ apiContext }, use) => {
    const factory = createUnifiedTestDataFactory(apiContext);

    // Use the factory
    await use(factory);

    // Automatic cleanup after test
    await factory.cleanup();
  },

  // @deprecated - Use testDataFactory instead
  // Test data generator (legacy)
  testData: async ({ apiContext }, use) => {
    const generator = new TestDataGenerator(apiContext);
    await use(generator);
  },

  // Test data helpers for isolated testing
  testDataHelpers: async ({ page, apiContext }, use) => {
    const helpers = new TestDataHelpers(page, apiContext);
    await use(helpers);
  },

  // E2E Test Data Builder - creates consistent test scenarios
  e2eTestDataBuilder: async ({ apiContext }, use) => {
    const testPrefix = `e2e_${Date.now()}`;
    const builder = new E2ETestDataBuilder(apiContext, testPrefix);
    
    // Use the builder
    await use(builder);
    
    // Cleanup after test
    await builder.cleanup();
  },

  // Database seeding fixture - runs once per test
  seededDatabase: async ({ apiContext }, use) => {
    // TODO: Implement database seeding
    // For now, we'll assume the dev database has sufficient data
    await use();

    // Cleanup can go here if needed
  },

  // Per-test data isolation manager
  testContextManager: async ({ page, apiContext }, use) => {
    const manager = createTestContextManager(apiContext, page);
    await use(manager);
  },

  // Isolated test context - automatically created and cleaned up per test
  isolatedContext: async ({ testContextManager }, use, testInfo) => {
    // Create a new isolated context for this test
    const context = await testContextManager.createContext({
      testFile: testInfo.file,
      testName: testInfo.title,
    });

    // Use the context during the test
    await use(context);

    // Automatically clean up after the test
    await testContextManager.cleanup();
  },
});

// Re-export expect and other utilities
export { expect } from '@playwright/test';
export { TestHelpers } from '../utils/test-helpers';
export { testConfig } from '../helpers/test-config';
export { TestContextManager } from '../helpers/test-context-manager';
export type { TestContext } from '../helpers/test-context-manager';
// Export unified test data factory (recommended)
export {
  UnifiedTestDataFactory,
  createUnifiedTestDataFactory,
  type Person,
  type Project,
  type Assignment,
  type Role,
  type Location,
  type Scenario,
} from '../helpers/unified-test-data-factory';

// Test tags for categorization
export const tags = {
  smoke: '@smoke',
  crud: '@crud',
  reports: '@reports',
  critical: '@critical',
  slow: '@slow',
  flaky: '@flaky',
};

// Common test patterns
export const patterns = {
  /**
   * Standard CRUD test pattern
   */
  crud: (resourceName: string) => ({
    create: `should create a new ${resourceName}`,
    read: `should display ${resourceName} details`,
    update: `should update ${resourceName}`,
    delete: `should delete ${resourceName}`,
    list: `should list all ${resourceName}s`,
  }),
  
  /**
   * Standard navigation test pattern
   */
  navigation: (pageName: string) => ({
    load: `should load ${pageName} page`,
    navigate: `should navigate to ${pageName}`,
    breadcrumb: `should show correct breadcrumb for ${pageName}`,
  }),
};