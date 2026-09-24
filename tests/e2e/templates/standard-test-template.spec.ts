import { test, expect, APIRequestContext } from '@playwright/test';
import { StandardTestHelpers } from '../helpers/standard-test-helpers';
import { TestDataFactory } from '../helpers/test-data-factory';
import { E2EErrorHandler } from '../helpers/error-handler';
import { PeoplePage } from '../page-objects/PeoplePage';
import { UtilizationReportPage } from '../page-objects/UtilizationReportPage';

/**
 * STANDARD E2E TEST TEMPLATE
 * 
 * This template demonstrates best practices for writing E2E tests in Capacitor.
 * Copy this file as a starting point for new test suites.
 * 
 * Key patterns demonstrated:
 * 1. Error monitoring setup
 * 2. Test data factory usage
 * 3. Page object pattern
 * 4. Smart wait strategies
 * 5. Proper cleanup
 * 6. Consistent test structure
 */

// Test suite configuration
test.describe('Feature Name - Brief Description', () => {
  let helpers: StandardTestHelpers;
  let errorHandler: E2EErrorHandler;
  let testDataFactory: TestDataFactory;
  let apiContext: APIRequestContext;
  
  // Page objects
  let peoplePage: PeoplePage;
  let utilizationPage: UtilizationReportPage;

  // Setup hooks
  test.beforeAll(async ({ playwright }) => {
    // Create API context for test data creation
    apiContext = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:3111',
      extraHTTPHeaders: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });

  test.beforeEach(async ({ page }, testInfo) => {
    // Initialize helpers
    helpers = new StandardTestHelpers(page);
    errorHandler = new E2EErrorHandler(page, testInfo);
    testDataFactory = new TestDataFactory(apiContext, 'template-test');
    
    // Initialize page objects
    peoplePage = new PeoplePage(page);
    utilizationPage = new UtilizationReportPage(page);
    
    // Start error monitoring
    errorHandler.startMonitoring();
    
    // Navigate to starting page
    await helpers.waitForPageReady();
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Check for critical errors
    if (testInfo.status === 'failed') {
      await errorHandler.captureErrorContext();
    }
    
    // Clean up test data
    await testDataFactory.cleanup();
    
    // Stop error monitoring
    errorHandler.stopMonitoring();
    
    // Assert no critical errors occurred during test
    await errorHandler.assertNoCriticalErrors();
  });

  test.afterAll(async () => {
    // Dispose of API context
    await apiContext.dispose();
  });

  // Example test: Basic CRUD operations
  test('should perform basic CRUD operations', async ({ page }) => {
    // 1. Create test data using factory
    const testPerson = await testDataFactory.createPerson({
      name: 'Template Test User',
      email: 'template@test.com',
      default_availability_percentage: 80
    });

    // 2. Navigate using page object
    await peoplePage.navigate();
    
    // 3. Verify data appears in UI
    await peoplePage.searchPerson(testPerson.name);
    await expect(page.locator(`text="${testPerson.name}"`)).toBeVisible();
    
    // 4. Edit the person
    await peoplePage.clickPerson(testPerson.name);
    await peoplePage.fillPersonForm({
      name: 'Updated Template User',
      email: testPerson.email
    });
    await peoplePage.savePerson();
    
    // 5. Verify update
    await helpers.waitForText('successfully');
    await peoplePage.searchPerson('Updated Template User');
    const count = await peoplePage.getPersonCount();
    expect(count).toBe(1);
  });

  // Example test: Complex workflow
  test('should handle complex utilization workflow', async ({ page }) => {
    // 1. Create scenario data
    const scenarioData = await testDataFactory.createScenarioTestData('overUtilization');
    
    // 2. Navigate to utilization report
    await utilizationPage.navigate();
    
    // 3. Wait for data to load
    await helpers.waitForTable();
    
    // 4. Verify over-utilized person appears
    const overUtilizedPeople = await utilizationPage.getPeopleWithHighUtilization(100);
    expect(overUtilizedPeople).toContain(scenarioData.person.name);
    
    // 5. Reduce load for the person
    await utilizationPage.clickReduceLoad(scenarioData.person.name);
    
    // 6. Select assignments to reduce
    const assignments = await utilizationPage.getReduceLoadModalAssignments();
    expect(assignments.length).toBeGreaterThan(0);
    
    await utilizationPage.selectAssignmentToReduce(assignments[0]);
    await utilizationPage.confirmReduceLoad();
    
    // 7. Verify success
    await helpers.waitForText('successfully');
  });

  // Example test: Error handling
  test('should handle errors gracefully', async ({ page }) => {
    // 1. Try to create invalid data
    await peoplePage.navigate();
    await peoplePage.clickAddPerson();
    
    // 2. Submit form with missing required fields
    await peoplePage.fillPersonForm({
      name: '', // Invalid - empty name
      email: 'invalid-email' // Invalid - bad format
    });
    await peoplePage.savePerson();
    
    // 3. Verify error handling
    await helpers.waitForText('error', { matchCase: false });
    const hasError = await peoplePage.hasError();
    expect(hasError).toBe(true);
    
    // 4. Verify modal didn't close
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  // Example test: Performance and reliability
  test('should handle large datasets efficiently', async ({ page }) => {
    // 1. Create large dataset
    const largeDataset = await testDataFactory.createBulkTestData({
      people: 20,
      projects: 10,
      assignments: 50
    });
    
    // 2. Navigate to people page
    await peoplePage.navigate();
    
    // 3. Measure table load time
    const startTime = Date.now();
    await helpers.waitForTable();
    const loadTime = Date.now() - startTime;
    
    // 4. Verify all data loaded
    const rowCount = await peoplePage.getTableRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(20);
    
    // 5. Verify performance
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
    
    // 6. Test search performance
    const searchStartTime = Date.now();
    await peoplePage.searchPerson(largeDataset.people[0].name);
    const searchTime = Date.now() - searchStartTime;
    expect(searchTime).toBeLessThan(2000); // Search should be fast
  });

  // Example test: Visual regression (if enabled)
  test('should maintain visual consistency', async ({ page }) => {
    test.skip(!process.env.VISUAL_REGRESSION, 'Visual regression not enabled');
    
    // 1. Navigate to key pages
    await peoplePage.navigate();
    await helpers.waitForPageReady();
    
    // 2. Take visual snapshot
    await expect(page).toHaveScreenshot('people-page.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // 3. Navigate to utilization report
    await utilizationPage.navigate();
    await helpers.waitForPageReady();
    
    // 4. Take another snapshot
    await expect(page).toHaveScreenshot('utilization-report.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  // Example test: Accessibility
  test('should meet accessibility standards', async ({ page }) => {
    // Navigate to people page
    await peoplePage.navigate();
    
    // Run accessibility checks
    await helpers.waitForPageReady();
    
    // Check for basic accessibility issues
    const accessibilityResults = await page.evaluate(() => {
      const issues = [];
      
      // Check for alt text on images
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        if (!img.alt) {
          issues.push(`Image missing alt text: ${img.src}`);
        }
      });
      
      // Check for form labels
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        const id = input.id;
        if (id && !document.querySelector(`label[for="${id}"]`)) {
          issues.push(`Input missing label: ${id}`);
        }
      });
      
      // Check for heading hierarchy
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let lastLevel = 0;
      headings.forEach(heading => {
        const level = parseInt(heading.tagName[1], 10);
        if (level - lastLevel > 1) {
          issues.push(`Heading hierarchy skip: ${heading.tagName} after H${lastLevel}`);
        }
        lastLevel = level;
      });
      
      return issues;
    });
    
    expect(accessibilityResults).toHaveLength(0);
  });

  // Test group: Edge cases
  test.describe('Edge Cases', () => {
    test('should handle concurrent operations', async ({ page }) => {
      // Create multiple people concurrently
      const createPromises = Array.from({ length: 5 }, (_, i) => 
        testDataFactory.createPerson({
          name: `Concurrent User ${i}`,
          email: `concurrent${i}@test.com`
        })
      );
      
      const people = await Promise.all(createPromises);
      
      // Navigate and verify all were created
      await peoplePage.navigate();
      const rowCount = await peoplePage.getTableRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(5);
    });

    test('should recover from network interruptions', async ({ page, context }) => {
      // Simulate offline
      await context.setOffline(true);
      
      // Try to navigate
      await peoplePage.navigate().catch(() => {});
      
      // Go back online
      await context.setOffline(false);
      
      // Retry navigation
      await page.reload();
      await peoplePage.navigate();
      
      // Verify page loads correctly
      await expect(page.locator('h1')).toBeVisible();
    });
  });

  // Test group: Mobile responsiveness
  test.describe('Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } });
    
    test('should be usable on mobile devices', async ({ page }) => {
      await peoplePage.navigate();
      
      // Verify mobile menu is visible
      const mobileMenu = page.locator('[data-testid="mobile-menu"], .mobile-menu, button[aria-label="Menu"]');
      await expect(mobileMenu).toBeVisible();
      
      // Verify table is scrollable or responsive
      const table = page.locator('table');
      const tableBox = await table.boundingBox();
      expect(tableBox?.width).toBeLessThanOrEqual(375);
    });
  });
});

/**
 * USAGE NOTES:
 * 
 * 1. Copy this template when creating new test files
 * 2. Replace "Feature Name" with your feature
 * 3. Update page object imports as needed
 * 4. Modify test data creation to match your needs
 * 5. Keep the error monitoring and cleanup patterns
 * 6. Add feature-specific tests
 * 
 * BEST PRACTICES:
 * 
 * - Always use page objects for UI interactions
 * - Use test data factory for creating test data
 * - Clean up test data in afterEach
 * - Monitor for errors throughout the test
 * - Use descriptive test names
 * - Group related tests with describe blocks
 * - Keep tests independent and isolated
 * - Avoid hardcoded waits - use smart wait strategies
 * - Test both happy paths and edge cases
 * - Include accessibility and performance checks
 */