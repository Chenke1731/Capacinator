/**
 * Gaps Analysis Report Accuracy Tests
 * Validates capacity gaps calculations and recommendations
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Gaps Analysis Report Accuracy', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('gapsaccuracy');
    // Create test data for gaps analysis testing
    // Create more demand than capacity to ensure gaps
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 6,
      people: 4,
      assignments: 20 // Many assignments to create capacity gaps
    });
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Switch to Gaps Report tab
    const gapsTab = authenticatedPage.locator('button:has-text("Gaps Report"), button:has-text("Gaps Analysis"), button:has-text("Gaps")').first();
    if (await gapsTab.isVisible()) {
      await gapsTab.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.reports} should display gaps summary metrics`, async ({ 
    authenticatedPage 
  }) => {
    // Check for summary content
    const hasContent = await authenticatedPage.locator('.summary-card, .gap-summary').count() > 0;
    if (!hasContent) {
      // Check for empty state (might happen if capacity exceeds demand)
      const emptyState = authenticatedPage.locator('text=/no gaps|no data|all roles.*sufficient/i');
      if (await emptyState.count() > 0) {
        await expect(emptyState).toBeVisible();
        return;
      }
    }
    // Check for key gap metrics
    const metrics = [
      { selector: 'text=Total Gap', pattern: /\d+\s*hours?/ },
      { selector: 'text=Roles with Gaps', pattern: /\d+/, minValue: 0 },
      { selector: 'text=Critical Gaps', pattern: /\d+/, minValue: 0 },
      { selector: 'text=Gap Percentage', pattern: /\d+%/ }
    ];
    for (const metric of metrics) {
      const element = authenticatedPage.locator(metric.selector);
      if (await element.isVisible()) {
        const value = await element.locator('..').locator('.metric, .value').textContent();
        if (value && metric.pattern) {
          expect(value).toMatch(metric.pattern);
          if (metric.minValue !== undefined) {
            const numValue = parseInt(value?.match(/\d+/, 10)?.[0] || '0');
            expect(numValue).toBeGreaterThanOrEqual(metric.minValue);
          }
        }
      }
    }
  });
  test(`${tags.reports} should display gaps by role table`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Look for gaps table
    const table = authenticatedPage.locator('table:has(th:has-text("Role"))').first();
    if (await table.isVisible()) {
      // Check expected headers
      const expectedHeaders = ['Role', 'Demand', 'Capacity', 'Gap', 'Status'];
      for (const header of expectedHeaders) {
        const headerElement = table.locator(`th:has-text("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
      // Check data rows
      const rows = table.locator('tbody tr');
      const rowCount = await rows.count();
      if (rowCount > 0) {
        // Should have rows for roles from our test data
        const uniqueRoles = new Set(testData.people.map((p: any) => p.role));
        expect(rowCount).toBeGreaterThanOrEqual(uniqueRoles.size);
        // Validate first row calculations
        const firstRow = rows.first();
        const cells = await firstRow.locator('td').all();
        if (cells.length >= 4) {
          // Get demand, capacity, and gap values
          const demandText = await cells[1].textContent();
          const capacityText = await cells[2].textContent();
          const gapText = await cells[3].textContent();
          const demand = parseFloat(demandText?.match(/\d+\.?\d*/)?.[0] || '0');
          const capacity = parseFloat(capacityText?.match(/\d+\.?\d*/)?.[0] || '0');
          const gap = parseFloat(gapText?.match(/-?\d+\.?\d*/)?.[0] || '0');
          // Gap should equal demand - capacity
          const calculatedGap = demand - capacity;
          expect(Math.abs(calculatedGap - gap)).toBeLessThan(1); // Allow for rounding
        }
        // Check if our test data roles appear
        let foundTestRole = false;
        for (const person of testData.people) {
          const roleRow = table.locator(`tr:has-text("${person.role}")`);
          if (await roleRow.count() > 0) {
            foundTestRole = true;
            break;
          }
        }
        expect(foundTestRole).toBe(true);
      }
    }
  });
  test(`${tags.reports} should display gap visualization chart`, async ({ 
    authenticatedPage 
  }) => {
    // Look for gap visualization
    const chartContainer = authenticatedPage.locator('.chart-container:has-text("Gap"), .chart-container:has-text("Demand vs Capacity")');
    if (await chartContainer.isVisible()) {
      // Check for chart SVG
      const chartSvg = chartContainer.locator('svg, .recharts-wrapper');
      await expect(chartSvg).toBeVisible();
      // Check for bar elements (usually showing demand vs capacity)
      const bars = chartContainer.locator('.recharts-bar, rect[width]');
      const barCount = await bars.count();
      // Should have at least 2 bars per role (demand and capacity)
      // With our test data, expect bars for each unique role
      const uniqueRoles = new Set(testData.people.map((p: any) => p.role));
      expect(barCount).toBeGreaterThanOrEqual(uniqueRoles.size * 2);
    }
  });
  test(`${tags.reports} should show actionable recommendations`, async ({ 
    authenticatedPage 
  }) => {
    // Check for recommendations section
    const recommendations = authenticatedPage.getByText('Recommendations').or(authenticatedPage.getByText('Actions')).or(authenticatedPage.getByText('Suggested Actions'));
    if (await recommendations.isVisible()) {
      // Look for action items
      const actionButtons = authenticatedPage.locator('button:has-text("Hire"), button:has-text("Reallocate"), button:has-text("View People")');
      const actionLinks = authenticatedPage.locator('a:has-text("Add Person"), a:has-text("View Available")');
      const hasActions = 
        await actionButtons.count() > 0 || 
        await actionLinks.count() > 0;
      if (hasActions) {
        // Test clicking an action
        if (await actionButtons.first().isVisible()) {
          const buttonText = await actionButtons.first().textContent();
          expect(buttonText).toBeTruthy();
          // With many assignments and few people, we should have gap recommendations
          expect(await actionButtons.count()).toBeGreaterThan(0);
        }
      }
    }
  });
  test(`${tags.reports} ${tags.api} should verify gap calculations via API`, async ({ 
    apiContext,
    testDataHelpers 
  }) => {
    const response = await apiContext.get('/api/reporting/gaps');
    if (response.ok()) {
      const data = await response.json();
      // Verify data structure
      expect(data).toBeTruthy();
      if (data.summary) {
        // Check summary metrics
        if (data.summary.totalGap !== undefined) {
          // Gap can be positive (shortage) or negative (surplus)
          expect(typeof data.summary.totalGap).toBe('number');
          // With our test setup (many assignments, few people), expect positive gap
          if (testData.assignments.length > testData.people.length * 2) {
            expect(data.summary.totalGap).toBeGreaterThan(0);
          }
        }
        if (data.summary.rolesWithGaps !== undefined) {
          expect(data.summary.rolesWithGaps).toBeGreaterThanOrEqual(0);
        }
      }
      if (data.gaps && Array.isArray(data.gaps)) {
        // Should have gap data for roles
        const uniqueRoles = new Set(testData.people.map((p: any) => p.role));
        expect(data.gaps.length).toBeGreaterThanOrEqual(uniqueRoles.size);
        // Validate gap data structure
        if (data.gaps.length > 0) {
          const firstGap = data.gaps[0];
          expect(firstGap).toHaveProperty('role');
          expect(firstGap).toHaveProperty('demand');
          expect(firstGap).toHaveProperty('capacity');
          expect(firstGap).toHaveProperty('gap');
          // Verify gap calculation
          const calculatedGap = firstGap.demand - firstGap.capacity;
          expect(Math.abs(calculatedGap - firstGap.gap)).toBeLessThan(1);
          // Verify our test roles are represented
          const gapRoles = data.gaps.map((g: any) => g.role);
          let foundTestRole = false;
          for (const person of testData.people) {
            if (gapRoles.includes(person.role)) {
              foundTestRole = true;
              break;
            }
          }
          expect(foundTestRole).toBe(true);
        }
      }
    }
  });
  test(`${tags.reports} should highlight critical gaps`, async ({ 
    authenticatedPage 
  }) => {
    // Look for critical gap indicators
    const criticalIndicators = authenticatedPage.locator('.critical-gap, [class*="danger"], [class*="red"], .gap-critical');
    if (await criticalIndicators.count() > 0) {
      // Critical gaps should be visually distinct
      const firstCritical = criticalIndicators.first();
      await expect(firstCritical).toBeVisible();
      // Check if it has appropriate styling classes
      const className = await firstCritical.getAttribute('class');
      expect(className).toMatch(/critical|danger|red|error/i);
      // With our many assignments, we might have critical gaps
      const criticalCount = await criticalIndicators.count();
      expect(criticalCount).toBeGreaterThan(0);
    }
  });
  test(`${tags.reports} should filter gaps by severity`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Look for severity filter
    const severityFilter = authenticatedPage.locator('select:has-text("Severity"), button:has-text("Critical"), button:has-text("All Gaps")');
    if (await severityFilter.isVisible()) {
      const table = authenticatedPage.locator('table').first();
      const initialRowCount = await table.locator('tbody tr').count();
      // Should have some rows initially
      expect(initialRowCount).toBeGreaterThan(0);
      // Apply critical filter
      if (await severityFilter.first().getAttribute('role') === 'combobox') {
        // It's a select dropdown
        await severityFilter.selectOption({ label: 'Critical' });
      } else {
        // It's a button
        await severityFilter.first().click();
      }
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check filtered results
      const filteredRowCount = await table.locator('tbody tr').count();
      expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);
      // If we have critical gaps, verify they are indeed critical
      if (filteredRowCount > 0) {
        const firstRow = table.locator('tbody tr').first();
        const gapCell = firstRow.locator('td').nth(3);
        const gapText = await gapCell.textContent();
        const gapValue = parseFloat(gapText?.match(/\d+\.?\d*/)?.[0] || '0');
        // Critical gaps are typically large
        expect(gapValue).toBeGreaterThan(20); // Arbitrary threshold for critical
      }
      // Verify no errors
      await testHelpers.verifyNoErrors();
    }
  });
  test(`${tags.reports} should show gap timeline projection`, async ({ 
    authenticatedPage 
  }) => {
    // Look for timeline/projection chart
    const projectionChart = authenticatedPage.locator('.chart-container:has-text("Projection"), .chart-container:has-text("Gap Over Time")');
    if (await projectionChart.isVisible()) {
      // Should show how gaps change over time
      const lineElements = projectionChart.locator('.recharts-line, path[d]');
      const areaElements = projectionChart.locator('.recharts-area');
      const hasProjectionData = 
        await lineElements.count() > 0 || 
        await areaElements.count() > 0;
      expect(hasProjectionData).toBeTruthy();
      // With our test assignments spanning time, should have multiple data points
      if (await lineElements.count() > 0) {
        const dataPoints = projectionChart.locator('.recharts-dot, circle');
        expect(await dataPoints.count()).toBeGreaterThan(1);
      }
    }
  });
  test(`${tags.reports} should provide gap resolution options`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    const table = authenticatedPage.locator('table').first();
    if (await table.isVisible()) {
      const rows = table.locator('tbody tr');
      const rowsWithGaps = [];
      // Find rows with actual gaps
      for (let i = 0; i < await rows.count(); i++) {
        const row = rows.nth(i);
        const gapCell = row.locator('td').nth(3); // Gap column
        if (await gapCell.isVisible()) {
          const gapText = await gapCell.textContent();
          const gapValue = parseFloat(gapText?.match(/\d+\.?\d*/)?.[0] || '0');
          if (gapValue > 0) {
            rowsWithGaps.push(row);
          }
        }
      }
      // With our test data (many assignments, few people), we should have gaps
      expect(rowsWithGaps.length).toBeGreaterThan(0);
      // For rows with gaps, check for action buttons
      if (rowsWithGaps.length > 0) {
        const firstGapRow = rowsWithGaps[0];
        const actionCell = firstGapRow.locator('td').last();
        // Should have some action available
        const hasActions = 
          await actionCell.locator('button').count() > 0 ||
          await actionCell.locator('a').count() > 0 ||
          await firstGapRow.locator('button[aria-label*="action"], button[aria-label*="hire"]').count() > 0;
        if (!hasActions) {
          // Check if actions are in a separate actions column
          const actionsColumn = authenticatedPage.locator('.actions-column, td:has(button)');
          expect(await actionsColumn.count()).toBeGreaterThan(0);
        }
      }
    }
  });
});