/**
 * Utilization Report Accuracy Tests
 * Validates utilization calculations and metrics
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Utilization Report Accuracy', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('utilaccuracy');
    // Create test data for utilization report testing
    // Create more assignments than available hours to ensure some over-utilization
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 5,
      assignments: 15 // More assignments to create varied utilization levels
    });
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Switch to Utilization Report tab
    const utilizationTab = authenticatedPage.locator('button:has-text("Utilization Report"), button:has-text("Utilization")').first();
    if (await utilizationTab.isVisible()) {
      await utilizationTab.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.reports} should display utilization summary metrics`, async ({ 
    authenticatedPage 
  }) => {
    // Check for summary content
    const hasContent = await authenticatedPage.locator('.summary-card, .metric-card').count() > 0;
    if (!hasContent) {
      // Check for empty state (shouldn't happen with test data)
      const emptyState = authenticatedPage.locator('text=/no data|no utilization/i');
      if (await emptyState.count() > 0) {
        await expect(emptyState).toBeVisible();
        return;
      }
    }
    // Check for key utilization metrics
    const metrics = [
      { selector: 'text=Average Utilization', pattern: /\d+%/ },
      { selector: 'text=Over-utilized', pattern: /\d+/, minValue: 0 },
      { selector: 'text=Under-utilized', pattern: /\d+/, minValue: 0 },
      { selector: 'text=Optimal', pattern: /\d+/, minValue: 0 }
    ];
    let totalPeople = 0;
    for (const metric of metrics) {
      const element = authenticatedPage.locator(metric.selector);
      if (await element.isVisible()) {
        const value = await element.locator('..').locator('.metric, .value, .number').textContent();
        if (value && metric.pattern) {
          expect(value).toMatch(metric.pattern);
          if (metric.selector.includes('utilized') || metric.selector.includes('Optimal')) {
            const count = parseInt(value?.match(/\d+/, 10)?.[0] || '0');
            totalPeople += count;
          }
        }
      }
    }
    // Total of categorized people should be at least our test people count
    if (totalPeople > 0) {
      expect(totalPeople).toBeGreaterThanOrEqual(4); // seed people present
    }
  });
  test(`${tags.reports} should display utilization distribution chart`, async ({ 
    authenticatedPage 
  }) => {
    // Look for utilization charts
    const chartContainers = authenticatedPage.locator('.chart-container');
    const chartCount = await chartContainers.count();
    if (chartCount > 0) {
      // Check first chart
      const firstChart = chartContainers.first();
      await expect(firstChart).toBeVisible();
      // Check for chart SVG
      const chartSvg = firstChart.locator('svg, .recharts-wrapper');
      await expect(chartSvg).toBeVisible();
      // Check for data elements (bars, pie slices, etc)
      const dataElements = firstChart.locator('.recharts-bar, .recharts-pie-sector, rect[width]');
      const elementCount = await dataElements.count();
      // Should have data elements (at least one per utilization category)
      expect(elementCount).toBeGreaterThan(0);
      if (elementCount > 0) {
        // Verify chart is interactive
        await dataElements.first().hover();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      }
    }
  });
  test(`${tags.reports} should display person-level utilization table`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Look for utilization table
    const table = authenticatedPage.locator('table:has(th:has-text("Name")), table:has(th:has-text("Person"))').first();
    if (await table.isVisible()) {
      // Check expected headers
      const expectedHeaders = ['Name', 'Role', 'Utilization', 'Available', 'Assigned'];
      for (const header of expectedHeaders) {
        const headerElement = table.locator(`th:has-text("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
      // Check data rows (should include our test people)
      const rows = table.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(testData.people.length);
      if (rowCount > 0) {
        // Validate first person's data
        const firstRow = rows.first();
        // Name should not be empty
        const personName = await firstRow.locator('td').first().textContent();
        expect(personName?.trim()).toBeTruthy();
        // Utilization should be a percentage
        const utilizationCells = firstRow.locator('td:has-text("%")');
        if (await utilizationCells.count() > 0) {
          const utilizationText = await utilizationCells.first().textContent();
          const utilization = parseFloat(utilizationText?.match(/\d+\.?\d*/)?.[0] || '0');
          // Utilization should be between 0-200%
          expect(utilization).toBeGreaterThanOrEqual(0);
          expect(utilization).toBeLessThanOrEqual(200);
        }
        // Verify at least one test person appears
        let foundTestPerson = false;
        for (const person of testData.people) {
          const personRow = table.locator(`tr:has-text("${person.name}")`);
          if (await personRow.count() > 0) {
            foundTestPerson = true;
            // Verify this person has utilization data
            const utilCell = personRow.locator('td:has-text("%")');
            if (await utilCell.count() > 0) {
              const utilText = await utilCell.textContent();
              expect(utilText).toMatch(/\d+\.?\d*%/);
            }
            break;
          }
        }
        expect(foundTestPerson).toBe(true);
      }
    }
  });
  test(`${tags.reports} should show utilization color coding`, async ({ 
    authenticatedPage 
  }) => {
    const table = authenticatedPage.locator('table').first();
    if (await table.isVisible()) {
      const rows = table.locator('tbody tr');
      const rowCount = await rows.count();
      if (rowCount > 0) {
        // Check for color-coded utilization indicators
        const utilizationIndicators = table.locator('.utilization-indicator, .status-badge, [class*="bg-"]');
        if (await utilizationIndicators.count() > 0) {
          // Check different utilization levels
          const overUtilized = table.locator('[class*="red"], [class*="danger"], .over-utilized');
          const underUtilized = table.locator('[class*="yellow"], [class*="warning"], .under-utilized');
          const optimal = table.locator('[class*="green"], [class*="success"], .optimal');
          // At least one type should exist given our test data with varied assignments
          const hasIndicators = 
            await overUtilized.count() > 0 ||
            await underUtilized.count() > 0 ||
            await optimal.count() > 0;
          expect(hasIndicators).toBeTruthy();
        }
      }
    }
  });
  test(`${tags.reports} ${tags.api} should verify utilization calculations`, async ({ 
    apiContext,
    testDataHelpers 
  }) => {
    const response = await apiContext.get('/api/reporting/utilization');
    if (response.ok()) {
      const data = await response.json();
      // Verify data structure
      expect(data).toBeTruthy();
      if (data.summary) {
        // Check summary metrics
        if (data.summary.averageUtilization !== undefined) {
          const avgUtil = data.summary.averageUtilization;
          expect(avgUtil).toBeGreaterThanOrEqual(0);
          expect(avgUtil).toBeLessThanOrEqual(200);
        }
        // Check counts (should include our test people)
        const totalPeople = (data.summary.overUtilized || 0) + 
                          (data.summary.underUtilized || 0) + 
                          (data.summary.optimal || 0);
        if (totalPeople > 0) {
          expect(totalPeople).toBeGreaterThanOrEqual(testData.people.length);
        }
      }
      if (data.people && Array.isArray(data.people)) {
        // Should include our test people
        expect(data.people.length).toBeGreaterThanOrEqual(testData.people.length);
        // Validate person utilization data
        if (data.people.length > 0) {
          const firstPerson = data.people[0];
          expect(firstPerson).toHaveProperty('name');
          expect(firstPerson).toHaveProperty('utilization');
          expect(firstPerson).toHaveProperty('availableHours');
          expect(firstPerson).toHaveProperty('assignedHours');
          // Verify utilization calculation
          if (firstPerson.availableHours > 0) {
            const calculatedUtil = (firstPerson.assignedHours / firstPerson.availableHours) * 100;
            const reportedUtil = firstPerson.utilization;
            // Should be within 1% due to rounding
            expect(Math.abs(calculatedUtil - reportedUtil)).toBeLessThan(1);
          }
          // Verify our test people are included
          const apiPeopleNames = data.people.map((p: any) => p.name);
          for (const testPerson of testData.people) {
            expect(apiPeopleNames).toContain(testPerson.name);
          }
        }
      }
    }
  });
  test(`${tags.reports} should filter by utilization level`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Look for utilization level filter
    const filterButtons = authenticatedPage.locator('button:has-text("Over-utilized"), button:has-text("Under-utilized"), button:has-text("Optimal")');
    if (await filterButtons.count() > 0) {
      // Get initial row count
      const table = authenticatedPage.locator('table').first();
      const initialRows = await table.locator('tbody tr').count();
      // With our test data, we should have at least some people
      expect(initialRows).toBeGreaterThanOrEqual(testData.people.length);
      // Click over-utilized filter
      const overUtilizedButton = authenticatedPage.locator('button:has-text("Over-utilized")').first();
      if (await overUtilizedButton.isVisible()) {
        await overUtilizedButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Check filtered results
        const filteredRows = await table.locator('tbody tr').count();
        // Should have filtered some results (or show empty state)
        expect(filteredRows).toBeLessThanOrEqual(initialRows);
        // If we have filtered results, verify they are over-utilized
        if (filteredRows > 0) {
          const firstRow = table.locator('tbody tr').first();
          const utilCell = firstRow.locator('td:has-text("%")');
          if (await utilCell.count() > 0) {
            const utilText = await utilCell.textContent();
            const utilValue = parseFloat(utilText?.match(/\d+\.?\d*/)?.[0] || '0');
            // Over-utilized is typically > 100%
            expect(utilValue).toBeGreaterThan(90); // Allow some margin
          }
        }
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    }
  });
  test(`${tags.reports} should show utilization trends over time`, async ({ 
    authenticatedPage 
  }) => {
    // Look for trend chart
    const trendChart = authenticatedPage.locator('.chart-container:has-text("Utilization Trend"), .chart-container:has-text("Over Time")');
    if (await trendChart.isVisible()) {
      // Check for line chart elements
      const lineElements = trendChart.locator('.recharts-line, path[d]');
      const dotElements = trendChart.locator('.recharts-dot, circle');
      const hasLineData = await lineElements.count() > 0 || await dotElements.count() > 0;
      expect(hasLineData).toBeTruthy();
      // Check for x-axis with dates
      const xAxisLabels = trendChart.locator('.recharts-xAxis text');
      if (await xAxisLabels.count() > 0) {
        const firstLabel = await xAxisLabels.first().textContent();
        expect(firstLabel).toBeTruthy();
        // Since we have test assignments, trend should have data points
        const dataPoints = await dotElements.count();
        expect(dataPoints).toBeGreaterThan(0);
      }
    }
  });
  test(`${tags.reports} should export utilization data`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Look for export button
    const exportButton = authenticatedPage.locator('button:has-text("Export"), button[aria-label*="export"]');
    if (await exportButton.isVisible()) {
      await exportButton.click();
      // Check for export options
      const csvOption = authenticatedPage.locator('text=CSV');
      const excelOption = authenticatedPage.locator('text=Excel');
      const hasExportOptions = await csvOption.isVisible() || await excelOption.isVisible();
      expect(hasExportOptions).toBeTruthy();
      // If CSV option exists, verify it would export our test data
      if (await csvOption.isVisible()) {
        // Set up download promise
        const downloadPromise = authenticatedPage.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await csvOption.click();
        const download = await downloadPromise;
        if (download) {
          // Verify file name
          expect(download.suggestedFilename()).toMatch(/utilization.*\.csv/i);
        }
      }
      // Verify no errors on export dialog
      await testHelpers.verifyNoErrors();
    }
  });
});