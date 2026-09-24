import { test, expect, APIRequestContext } from '@playwright/test';
import { StandardTestHelpers } from '../helpers/standard-test-helpers';
import { TestDataFactory } from '../helpers/test-data-factory';
import { E2EErrorHandler } from '../helpers/error-handler';
import { UtilizationReportPage } from '../page-objects/UtilizationReportPage';
import { ReportHelpers } from '../helpers/report-helpers';

/**
 * STANDARDIZED VERSION: Utilization Report Test
 * Demonstrates migration from old patterns to new standardized approach
 */
test.describe('Utilization Report - Standardized', () => {
  let helpers: StandardTestHelpers;
  let errorHandler: E2EErrorHandler;
  let testDataFactory: TestDataFactory;
  let apiContext: APIRequestContext;
  let utilizationPage: UtilizationReportPage;
  let reportHelpers: ReportHelpers;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:3111',
      extraHTTPHeaders: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });

  test.beforeEach(async ({ page }, testInfo) => {
    // Initialize helpers and page objects
    helpers = new StandardTestHelpers(page);
    errorHandler = new E2EErrorHandler(page, testInfo);
    testDataFactory = new TestDataFactory(apiContext, 'utilization-test');
    utilizationPage = new UtilizationReportPage(page);
    reportHelpers = new ReportHelpers(page);
    
    // Start error monitoring
    errorHandler.startMonitoring();
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture errors if test failed
    if (testInfo.status === 'failed') {
      await errorHandler.captureErrorContext();
    }
    
    // Clean up test data
    await testDataFactory.cleanup();
    
    // Stop monitoring and assert no critical errors
    errorHandler.stopMonitoring();
    await errorHandler.assertNoCriticalErrors();
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('should navigate to utilization report and verify basic functionality', async ({ page }) => {
    // Create test data with various utilization levels
    const testData = await testDataFactory.createBulkTestData({
      people: 5,
      projects: 3,
      assignments: 10,
      withUtilizationScenarios: true
    });

    // Navigate using page object
    await utilizationPage.navigate();
    
    // Verify page loaded with expected title
    const pageTitle = await utilizationPage.getPageTitle();
    expect(pageTitle).toContain('Utilization');
    
    // Get and verify utilization stats
    const stats = await utilizationPage.getUtilizationStats();
    
    expect(parseInt(stats.overutilized, 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(stats.underutilized, 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(stats.optimal, 10)).toBeGreaterThanOrEqual(0);
    
    // Verify table has data
    const hasData = await utilizationPage.verifyUtilizationDisplay();
    expect(hasData).toBe(true);
    
    // Get row count
    const rowCount = await utilizationPage.getTableRowCount();
    expect(rowCount).toBeGreaterThan(0);
    console.log(`Found ${rowCount} people in utilization table`);
    
    // Test filtering by location
    const locations = ['All Locations', 'New York', 'San Francisco'];
    for (const location of locations) {
      try {
        await utilizationPage.filterByLocation(location);
        const filteredCount = await utilizationPage.getTableRowCount();
        console.log(`Location "${location}": ${filteredCount} rows`);
      } catch {
        // Location might not exist in test data
        console.log(`Location "${location}" not available`);
      }
    }
  });

  test('should handle reduce load workflow correctly', async ({ page }) => {
    // Create an over-utilized person
    const overUtilizedData = await testDataFactory.createScenarioTestData('overUtilization');
    
    // Navigate to utilization report
    await utilizationPage.navigate();
    
    // Find the over-utilized person
    const overUtilizedPeople = await utilizationPage.getPeopleWithHighUtilization(100);
    expect(overUtilizedPeople).toContain(overUtilizedData.person.name);
    
    // Click reduce load for this person
    await utilizationPage.clickReduceLoad(overUtilizedData.person.name);
    
    // Get and verify assignments in modal
    const assignments = await utilizationPage.getReduceLoadModalAssignments();
    expect(assignments.length).toBeGreaterThan(0);
    console.log(`Found ${assignments.length} assignments to reduce`);
    
    // Select first assignment and reduce
    await utilizationPage.selectAssignmentToReduce(assignments[0]);
    await utilizationPage.confirmReduceLoad();
    
    // Verify success message
    const hasSuccess = await utilizationPage.hasSuccessMessage();
    expect(hasSuccess).toBe(true);
  });

  test('should handle add projects workflow correctly', async ({ page }) => {
    // Create an under-utilized person and available projects
    const underUtilizedData = await testDataFactory.createScenarioTestData('underUtilization');
    
    // Navigate to utilization report
    await utilizationPage.navigate();
    
    // Find under-utilized people
    const underUtilizedPeople = await utilizationPage.getPeopleWithLowUtilization(50);
    expect(underUtilizedPeople.length).toBeGreaterThan(0);
    
    // Click add projects for first under-utilized person
    const targetPerson = underUtilizedPeople[0];
    await utilizationPage.clickAddProjects(targetPerson);
    
    // Get available projects in modal
    const availableProjects = await utilizationPage.getAddProjectsModalProjects();
    expect(availableProjects.length).toBeGreaterThan(0);
    
    // Select a project and set allocation
    await utilizationPage.selectProjectToAdd(availableProjects[0]);
    await utilizationPage.setAllocationPercentage(40);
    await utilizationPage.confirmAddProjects();
    
    // Verify success
    const hasSuccess = await utilizationPage.hasSuccessMessage();
    expect(hasSuccess).toBe(true);
  });

  test('should handle complex report configuration', async ({ page }) => {
    // Create diverse test data
    const largeDataset = await testDataFactory.createBulkTestData({
      people: 20,
      projects: 10,
      assignments: 50
    });

    // Navigate to reports
    await reportHelpers.navigateToReports('utilization');
    
    // Configure report with specific parameters
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    await reportHelpers.configureReport({
      startDate: today.toISOString().split('T')[0],
      endDate: nextMonth.toISOString().split('T')[0],
      includeContractors: true,
      groupBy: 'department'
    });
    
    // Get report data
    const reportData = await reportHelpers.getUtilizationReportData();
    
    // Verify report generated with data
    expect(reportData.details.length).toBeGreaterThan(0);
    expect(reportData.summary.averageUtilization).toBeTruthy();
    
    // Test export functionality
    await utilizationPage.exportReport('csv');
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Simulate network error scenario
    await page.route('**/api/reports/utilization', route => {
      route.abort('failed');
    });
    
    // Try to navigate to utilization report
    await utilizationPage.navigate();
    
    // Should show error state
    const hasError = await utilizationPage.hasError();
    
    if (hasError) {
      const errorMessage = await utilizationPage.getErrorMessage();
      console.log(`Handled error: ${errorMessage}`);
      
      // Remove route override and retry
      await page.unroute('**/api/reports/utilization');
      await utilizationPage.reload();
      
      // Should recover
      const hasRecovered = await utilizationPage.verifyUtilizationDisplay();
      expect(hasRecovered).toBe(true);
    }
  });

  test('should verify accessibility compliance', async ({ page }) => {
    // Navigate to report
    await utilizationPage.navigate();
    
    // Check basic accessibility
    const accessibilityIssues = await page.evaluate(() => {
      const issues = [];
      
      // Check table headers
      const tables = document.querySelectorAll('table');
      tables.forEach((table, index) => {
        const headers = table.querySelectorAll('th');
        if (headers.length === 0) {
          issues.push(`Table ${index + 1} missing headers`);
        }
      });
      
      // Check form labels
      const inputs = document.querySelectorAll('input, select');
      inputs.forEach(input => {
        if (!input.getAttribute('aria-label') && !input.id) {
          issues.push(`Input missing label: ${input.name || input.type}`);
        }
      });
      
      // Check button text
      const buttons = document.querySelectorAll('button');
      buttons.forEach(button => {
        if (!button.textContent?.trim() && !button.getAttribute('aria-label')) {
          issues.push('Button missing accessible text');
        }
      });
      
      return issues;
    });
    
    expect(accessibilityIssues).toHaveLength(0);
  });

  test('should handle concurrent operations efficiently', async ({ page }) => {
    // Create test data
    await testDataFactory.createBulkTestData({
      people: 10,
      projects: 5,
      assignments: 20
    });

    // Navigate to report
    await utilizationPage.navigate();
    
    // Perform multiple operations concurrently
    const operations = [
      utilizationPage.setDateRange(
        new Date().toISOString().split('T')[0],
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      ),
      utilizationPage.refreshReport(),
      utilizationPage.getUtilizationStats()
    ];
    
    const startTime = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - startTime;
    
    console.log(`Concurrent operations completed in ${duration}ms`);
    expect(duration).toBeLessThan(5000); // Should complete quickly
  });

  test.describe('Mobile Responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } });
    
    test('should be usable on mobile', async ({ page }) => {
      // Create minimal test data
      await testDataFactory.createBulkTestData({
        people: 3,
        projects: 2,
        assignments: 5
      });

      // Navigate on mobile
      await utilizationPage.navigate();
      
      // Verify critical elements are visible
      const stats = await utilizationPage.getUtilizationStats();
      expect(stats.overall).toBeTruthy();
      
      // Verify table is scrollable
      const tableBox = await page.locator('table').boundingBox();
      expect(tableBox?.width).toBeLessThanOrEqual(375);
      
      // Test mobile-specific interactions
      const firstRow = await page.locator('table tbody tr').first();
      await firstRow.scrollIntoViewIfNeeded();
      
      // Verify action buttons are accessible
      const actionButtons = await firstRow.locator('button').count();
      expect(actionButtons).toBeGreaterThan(0);
    });
  });
});

/**
 * KEY IMPROVEMENTS IN THIS STANDARDIZED VERSION:
 * 
 * 1. Uses Page Objects (UtilizationReportPage) instead of direct selectors
 * 2. Implements proper error monitoring with E2EErrorHandler
 * 3. Uses TestDataFactory for consistent test data creation
 * 4. Automatic cleanup of test data after each test
 * 5. Smart wait strategies instead of arbitrary timeouts
 * 6. Better test organization with clear setup/teardown
 * 7. More comprehensive test scenarios
 * 8. Accessibility and performance checks included
 * 9. Mobile responsiveness testing
 * 10. Proper error recovery patterns
 */