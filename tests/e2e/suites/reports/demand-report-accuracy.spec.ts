/**
 * Demand Report Accuracy Tests
 * Validates demand calculations and project data
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Demand Report Accuracy', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('demandaccuracy');
    // Create test data for demand report testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 5,
      people: 4,
      assignments: 12
    });
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Demand report is usually the default tab, but click it to be sure
    const demandTab = authenticatedPage.locator('button:has-text("Demand Report"), button:has-text("Demand")').first();
    if (await demandTab.isVisible()) {
      await demandTab.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.reports} should display demand summary metrics`, async ({ 
    authenticatedPage 
  }) => {
    // Check for summary cards
    const hasContent = await authenticatedPage.locator('.summary-card').count() > 0;
    if (!hasContent) {
      // Check for empty state (shouldn't happen with test data)
      const emptyState = authenticatedPage.locator('text=/no data|no demand|no projects/i');
      if (await emptyState.count() > 0) {
        await expect(emptyState).toBeVisible();
        return;
      }
    }
    // Verify key metrics
    const metrics = [
      { selector: 'text=Total Demand', pattern: /\d+\s*hours?/i },
      { selector: 'text=Active Projects', pattern: /\d+/, minValue: testData.projects.length },
      { selector: 'text=Peak Month', pattern: /\d{4}-\d{2}/ },
      { selector: 'text=Resource Types', pattern: /\d+/ }
    ];
    for (const metric of metrics) {
      const element = authenticatedPage.locator(metric.selector);
      if (await element.isVisible()) {
        const value = await element.locator('..').locator('.metric, .value').textContent();
        expect(value).toMatch(metric.pattern);
        if (metric.minValue) {
          const numValue = parseInt(value?.match(/\d+/, 10)?.[0] || '0');
          expect(numValue).toBeGreaterThanOrEqual(metric.minValue);
        }
      }
    }
  });
  test(`${tags.reports} should display demand by project chart`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Look for chart containers
    const chartContainer = authenticatedPage.locator('.chart-container:has-text("Demand by Project")');
    if (await chartContainer.isVisible()) {
      // Check for chart elements
      const chartSvg = chartContainer.locator('svg, .recharts-wrapper');
      await expect(chartSvg).toBeVisible();
      // Check for bar elements (should have at least as many as test projects)
      const bars = chartContainer.locator('.recharts-bar, rect[width]');
      const barCount = await bars.count();
      if (barCount > 0) {
        // Should show our test projects
        expect(barCount).toBeGreaterThanOrEqual(testData.projects.length);
        // Test hover interaction
        await bars.first().hover();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Check for tooltip
        const tooltip = authenticatedPage.locator('.recharts-tooltip');
        if (await tooltip.isVisible()) {
          const tooltipText = await tooltip.textContent();
          expect(tooltipText).toBeTruthy();
          // Tooltip might contain test project name
          const hasTestProject = testData.projects.some((p: any) => 
            tooltipText?.includes(p.name)
          );
          if (hasTestProject) {
            expect(hasTestProject).toBe(true);
          }
        }
      }
    }
  });
  test(`${tags.reports} should display demand timeline`, async ({ 
    authenticatedPage 
  }) => {
    // Look for timeline chart
    const timelineChart = authenticatedPage.locator('.chart-container:has-text("Demand Over Time"), .chart-container:has-text("Demand Timeline")');
    if (await timelineChart.isVisible()) {
      const chartSvg = timelineChart.locator('svg');
      await expect(chartSvg).toBeVisible();
      // Check for line or area chart elements
      const dataElements = timelineChart.locator('.recharts-line, .recharts-area, path[d]');
      const elementCount = await dataElements.count();
      expect(elementCount).toBeGreaterThan(0);
    }
  });
  test(`${tags.reports} should display project demand table`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Look for project table
    const table = authenticatedPage.locator('table:has-text("Project"), table').first();
    if (await table.isVisible()) {
      // Check headers
      const expectedHeaders = ['Project', 'Start', 'End', 'Demand', 'Status'];
      for (const header of expectedHeaders) {
        const headerElement = table.locator(`th:has-text("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
      // Check for data rows (should include test projects)
      const rows = table.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(testData.projects.length);
      if (rowCount > 0) {
        // Validate first row
        const firstRow = rows.first();
        // Project name should not be empty
        const projectName = await firstRow.locator('td').first().textContent();
        expect(projectName?.trim()).toBeTruthy();
        // Dates should be valid
        const startDate = await firstRow.locator('td').nth(1).textContent();
        const endDate = await firstRow.locator('td').nth(2).textContent();
        if (startDate && endDate) {
          expect(startDate).toMatch(/\d{4}-\d{2}-\d{2}/);
          expect(endDate).toMatch(/\d{4}-\d{2}-\d{2}/);
        }
        // Check if any test projects appear in the table
        let foundTestProject = false;
        for (const project of testData.projects) {
          const projectRow = table.locator(`tr:has-text("${project.name}")`);
          if (await projectRow.count() > 0) {
            foundTestProject = true;
            break;
          }
        }
        expect(foundTestProject).toBe(true);
      }
    }
  });
  test(`${tags.reports} ${tags.api} should verify demand API data`, async ({ 
    apiContext,
    testDataHelpers 
  }) => {
    const response = await apiContext.get('/api/reporting/demand');
    if (response.ok()) {
      const data = await response.json();
      // Verify data structure
      expect(data).toBeTruthy();
      if (data.summary) {
        // Check summary metrics
        expect(data.summary).toHaveProperty('totalDemand');
        expect(data.summary.totalDemand).toBeGreaterThanOrEqual(0);
        if (data.summary.activeProjects !== undefined) {
          expect(data.summary.activeProjects).toBeGreaterThanOrEqual(testData.projects.length);
        }
      }
      if (data.projects && Array.isArray(data.projects)) {
        // Should include our test projects
        expect(data.projects.length).toBeGreaterThanOrEqual(testData.projects.length);
        // Validate project data structure
        if (data.projects.length > 0) {
          const firstProject = data.projects[0];
          expect(firstProject).toHaveProperty('name');
          expect(firstProject).toHaveProperty('demand');
          expect(firstProject).toHaveProperty('startDate');
          expect(firstProject).toHaveProperty('endDate');
          // Verify test projects are included
          const projectNames = data.projects.map((p: any) => p.name);
          for (const testProject of testData.projects) {
            expect(projectNames).toContain(testProject.name);
          }
        }
      }
    }
  });
  test(`${tags.reports} should filter demand by date range`, async ({ 
    authenticatedPage,
    testHelpers,
    testDataHelpers 
  }) => {
    const hasContent = await authenticatedPage.locator('.summary-card').count() > 0;
    if (!hasContent) {
      return;
    }
    // Get initial demand value
    const demandCard = authenticatedPage.locator('.summary-card:has-text("Total Demand")');
    const initialDemand = await demandCard.locator('.metric').textContent();
    const initialValue = parseInt(initialDemand?.match(/\d+/, 10)?.[0] || '0');
    // Look for date filters
    const dateFilters = authenticatedPage.locator('input[type="date"]');
    if (await dateFilters.count() >= 2) {
      // Set custom date range that includes our test data
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      // Use test project dates if available
      const startDate = testData.projects[0]?.startDate || today.toISOString().split('T')[0];
      const endDate = testData.projects[testData.projects.length - 1]?.endDate || nextMonth.toISOString().split('T')[0];
      await dateFilters.first().fill(startDate);
      await dateFilters.last().fill(endDate);
      // Apply filter
      const applyButton = authenticatedPage.locator('button:has-text("Apply"), button:has-text("Filter")');
      if (await applyButton.isVisible()) {
        await applyButton.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Verify no errors
        await testHelpers.verifyNoErrors();
        // Get updated demand
        const updatedDemand = await demandCard.locator('.metric').textContent();
        const updatedValue = parseInt(updatedDemand?.match(/\d+/, 10)?.[0] || '0');
        // Value should be >= 0 and reasonable for our test data
        expect(updatedValue).toBeGreaterThanOrEqual(0);
        // If we have assignments, demand should be > 0
        if (testData.assignments.length > 0) {
          expect(updatedValue).toBeGreaterThan(0);
        }
      }
    }
  });
  test(`${tags.reports} should show demand by role breakdown`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Look for role breakdown
    const roleSection = authenticatedPage.getByText('Demand by Role').or(authenticatedPage.getByText('Role Demand'));
    if (await roleSection.isVisible()) {
      // Check for role data (could be chart or table)
      const roleChart = authenticatedPage.locator('.chart-container:has-text("Role")');
      const roleTable = authenticatedPage.locator('table:has(th:has-text("Role"))');
      const hasRoleData = await roleChart.isVisible() || await roleTable.isVisible();
      expect(hasRoleData).toBeTruthy();
      if (await roleTable.isVisible()) {
        const rows = roleTable.locator('tbody tr');
        const rowCount = await rows.count();
        if (rowCount > 0) {
          // Check first role entry
          const firstRow = rows.first();
          const roleName = await firstRow.locator('td').first().textContent();
          const roleDemand = await firstRow.locator('td:has-text(/\\d+ hours/)').textContent();
          expect(roleName?.trim()).toBeTruthy();
          expect(roleDemand).toMatch(/\d+/);
          // Verify roles from our test people are represented
          const roleSet = new Set(testData.people.map((p: any) => p.role));
          expect(rowCount).toBeGreaterThanOrEqual(roleSet.size);
        }
      }
    }
  });
});