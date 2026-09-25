/**
 * Performance and Load Testing Suite
 * Validates the application's performance under various load conditions:
 * - API response time benchmarks
 * - Concurrent user simulation
 * - Memory usage monitoring
 * - Database query performance
 * - Frontend rendering performance
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { TestHelpers } from '../../utils/test-helpers';
// Performance measurement helper
async function measureApiResponse(apiContext: any, endpoint: string, method: string = 'GET', data?: any) {
  const startTime = Date.now();
  try {
    let response;
    if (method === 'GET') {
      response = await apiContext.get(endpoint);
    } else if (method === 'POST') {
      response = await apiContext.post(endpoint, { data });
    } else if (method === 'PUT') {
      response = await apiContext.put(endpoint, { data });
    }
    const endTime = Date.now();
    const duration = endTime - startTime;
    const responseText = await response.text();
    return {
      duration,
      status: response.status(),
      success: response.ok(),
      size: responseText.length
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      duration: endTime - startTime,
      status: 0,
      success: false,
      error: error.message
    };
  }
}
test.describe('Performance and Load Testing', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('perftest');
    // Create test data for performance testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 5,
      people: 10,
      assignments: 20
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('API Response Time Benchmarks', () => {
    test(`${tags.performance} should meet response time SLAs for critical APIs`, async ({ 
      apiContext,
      testHelpers 
    }) => {
      console.log('⚡ Testing API response time benchmarks');
      const criticalEndpoints = [
        { endpoint: '/api/people', name: 'People List', maxTime: 500 },
        { endpoint: '/api/projects', name: 'Projects List', maxTime: 500 },
        { endpoint: '/api/assignments', name: 'Assignments List', maxTime: 750 },
        { endpoint: '/api/reporting/dashboard', name: 'Dashboard Data', maxTime: 1000 },
        { endpoint: '/api/roles', name: 'Roles List', maxTime: 300 },
        { endpoint: '/api/project-types', name: 'Project Types', maxTime: 300 }
      ];
      const performanceResults = [];
      for (const api of criticalEndpoints) {
        console.log(`Testing ${api.name} performance...`);
        // Warm up with one request
        await measureApiResponse(apiContext, api.endpoint);
        // Measure multiple requests
        const measurements = [];
        for (let i = 0; i < 5; i++) {
          const result = await measureApiResponse(apiContext, api.endpoint);
          measurements.push(result.duration);
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between requests
        }
        const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
        const maxTime = Math.max(...measurements);
        const minTime = Math.min(...measurements);
        performanceResults.push({
          endpoint: api.name,
          avgTime,
          maxTime,
          minTime,
          sla: api.maxTime,
          passes: avgTime <= api.maxTime
        });
        console.log(`${api.name}: avg=${avgTime.toFixed(0)}ms, max=${maxTime}ms, SLA=${api.maxTime}ms`);
        // Use softer assertion for CI environments
        if (process.env.CI) {
          // In CI, warn but don't fail if within 2x SLA
          expect(avgTime).toBeLessThan(api.maxTime * 2);
        } else {
          expect(avgTime).toBeLessThan(api.maxTime);
        }
        if (avgTime <= api.maxTime) {
          console.log(`✅ ${api.name} meets performance SLA`);
        } else {
          console.log(`⚠️ ${api.name} exceeds performance SLA (${avgTime.toFixed(0)}ms > ${api.maxTime}ms)`);
        }
      }
      // Summary report
      const passedSLAs = performanceResults.filter(r => r.passes).length;
      console.log(`\n📊 Performance Summary: ${passedSLAs}/${performanceResults.length} APIs meet SLA`);
    });
    test(`${tags.performance} should handle complex dashboard queries efficiently`, async ({ 
      authenticatedPage,
      testHelpers,
      apiContext 
    }) => {
      console.log('⚡ Testing complex dashboard query performance');
      await testHelpers.navigateTo('/dashboard');
      // Measure dashboard load time
      const startTime = Date.now();
      // Force dashboard refresh
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Wait for dashboard elements to load
      await authenticatedPage.waitForSelector('h1:has-text("Dashboard"), h2:has-text("Dashboard"), [data-testid="dashboard"]', { 
        timeout: 10000 
      });
      const loadTime = Date.now() - startTime;
      console.log(`Dashboard load time: ${loadTime}ms`);
      // Dashboard should load within reasonable time (adjust for CI)
      const maxLoadTime = process.env.CI ? 5000 : 3000;
      expect(loadTime).toBeLessThan(maxLoadTime);
      // Test dashboard API performance specifically
      const dashboardApiResult = await measureApiResponse(apiContext, '/api/reporting/dashboard');
      console.log(`Dashboard API response time: ${dashboardApiResult.duration}ms`);
      expect(dashboardApiResult.success).toBe(true);
    });
  });
  test.describe('Concurrent User Simulation', () => {
    test(`${tags.performance} ${tags.slow} should handle multiple concurrent users`, async ({ 
      browser,
      testHelpers 
    }) => {
      console.log('⚡ Testing concurrent user load');
      const concurrentUsers = process.env.CI ? 3 : 5; // Fewer users in CI
      const contexts = [];
      const pages = [];
      try {
        // Create multiple browser contexts (simulating different users)
        for (let i = 0; i < concurrentUsers; i++) {
          const context = await browser.newContext();
          const page = await context.newPage();
          contexts.push(context);
          pages.push(page);
        }
        // Login all users concurrently
        console.log(`Logging in ${concurrentUsers} concurrent users...`);
        const loginPromises = pages.map(async (page, index) => {
          const helpers = new TestHelpers(page);
          await page.goto('/', { waitUntil: 'domcontentloaded' });
          await helpers.setupPage();
          return { page, helpers, index };
        });
        const loggedInUsers = await Promise.all(loginPromises);
        console.log(`✅ All ${concurrentUsers} users logged in`);
        // Simulate concurrent operations
        console.log('Simulating concurrent operations...');
        const operationPromises = loggedInUsers.map(async ({ page, helpers, index }) => {
          const operations = [
            async () => {
              await helpers.navigateTo('/projects');
              await helpers.waitForPageReady();
              console.log(`User ${index + 1}: Loaded projects`);
            },
            async () => {
              await helpers.navigateTo('/assignments');
              await helpers.waitForPageReady();
              console.log(`User ${index + 1}: Loaded assignments`);
            },
            async () => {
              await helpers.navigateTo('/people');
              await helpers.waitForPageReady();
              console.log(`User ${index + 1}: Loaded people`);
            }
          ];
          // Execute random operations
          const randomOp = operations[Math.floor(Math.random() * operations.length)];
          const startTime = Date.now();
          await randomOp();
          const duration = Date.now() - startTime;
          return { user: index + 1, duration };
        });
        const results = await Promise.all(operationPromises);
        // Check performance under load
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        console.log(`\n📊 Concurrent Operations Summary:`);
        console.log(`Average operation time: ${avgDuration.toFixed(0)}ms`);
        // Performance should not degrade significantly under concurrent load
        const maxAcceptableTime = process.env.CI ? 5000 : 3000;
        expect(avgDuration).toBeLessThan(maxAcceptableTime);
      } finally {
        // Cleanup
        await Promise.all(contexts.map(context => context.close()));
      }
    });
  });
  test.describe('Frontend Rendering Performance', () => {
    test(`${tags.performance} should render large data tables efficiently`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      console.log('⚡ Testing large data table rendering');
      // Navigate to assignments (which has our test data)
      await testHelpers.navigateTo('/assignments');
      // Measure table rendering time
      const startTime = Date.now();
      await testHelpers.waitForDataTable();
      const tableLoadTime = Date.now() - startTime;
      console.log(`Table load time with ${testData.assignments.length} assignments: ${tableLoadTime}ms`);
      // Table should render quickly even with test data
      expect(tableLoadTime).toBeLessThan(2000);
      // Test pagination performance if available
      const nextPageButton = authenticatedPage.locator('button:has-text("Next"), [aria-label="Next page"]');
      if (await nextPageButton.isVisible()) {
        const paginationStart = Date.now();
        await nextPageButton.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        const paginationTime = Date.now() - paginationStart;
        console.log(`Pagination time: ${paginationTime}ms`);
        expect(paginationTime).toBeLessThan(1000);
      }
      // Test search/filter performance
      const searchInput = authenticatedPage.locator('input[placeholder*="search"], input[name*="search"]').first();
      if (await searchInput.isVisible()) {
        const searchStart = Date.now();
        await searchInput.fill(testContext.prefix);
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {}); // Debounce
        const searchTime = Date.now() - searchStart;
        console.log(`Search filter time: ${searchTime}ms`);
        expect(searchTime).toBeLessThan(1500);
      }
    });
    test(`${tags.performance} should handle rapid navigation without memory leaks`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      console.log('⚡ Testing rapid navigation performance');
      const pages = ['/dashboard', '/projects', '/people', '/assignments', '/reports'];
      const navigationTimes = [];
      // Rapid navigation test
      for (let i = 0; i < 10; i++) {
        const targetPage = pages[i % pages.length];
        const navStart = Date.now();
        await testHelpers.navigateTo(targetPage);
        const navTime = Date.now() - navStart;
        navigationTimes.push(navTime);
        console.log(`Navigation ${i + 1} to ${targetPage}: ${navTime}ms`);
      }
      // Check for performance degradation
      const firstHalf = navigationTimes.slice(0, 5);
      const secondHalf = navigationTimes.slice(5);
      const avgFirstHalf = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
      console.log(`\n📊 Navigation Performance:`);
      console.log(`First half average: ${avgFirstHalf.toFixed(0)}ms`);
      console.log(`Second half average: ${avgSecondHalf.toFixed(0)}ms`);
      // Performance should not degrade significantly
      const degradation = ((avgSecondHalf - avgFirstHalf) / avgFirstHalf) * 100;
      console.log(`Performance degradation: ${degradation.toFixed(1)}%`);
      // Allow up to 50% degradation (memory pressure, caching effects)
      expect(degradation).toBeLessThan(50);
    });
  });
  test.describe('Load Testing with Bulk Data', () => {
    test.skip(`${tags.performance} ${tags.slow} should handle large dataset operations`, async ({ 
      apiContext,
      testDataHelpers 
    }) => {
      // Skip in normal test runs - only run when specifically testing performance
      if (!process.env.RUN_PERFORMANCE_TESTS) {
        return;
      }
      console.log('⚡ Testing with large dataset');
      // Create larger dataset
      const largeTestContext = testDataHelpers.createTestContext('perfbulk');
      const largeTestData = await testDataHelpers.createBulkTestData(largeTestContext, {
        projects: 50,
        people: 100,
        assignments: 500
      });
      try {
        // Test API performance with large dataset
        const endpoints = [
          { url: '/api/projects', name: 'Projects' },
          { url: '/api/people', name: 'People' },
          { url: '/api/assignments', name: 'Assignments' }
        ];
        for (const endpoint of endpoints) {
          const result = await measureApiResponse(apiContext, endpoint.url);
          console.log(`${endpoint.name} with large dataset: ${result.duration}ms (${result.size} bytes)`);
          // Even with large dataset, should respond within reasonable time
          expect(result.duration).toBeLessThan(2000);
        }
      } finally {
        // Clean up large dataset
        await testDataHelpers.cleanupTestContext(largeTestContext);
      }
    });
  });
});