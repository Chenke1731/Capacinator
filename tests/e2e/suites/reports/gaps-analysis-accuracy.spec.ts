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
    // Check for key gap metrics — real cards: "Total Gap in Hours",
    // "# Projects with Gaps", "# Roles with Gaps", "# Unutilized Hours"
    // (values live in the card text; no .metric child elements exist)
    const metrics = [
      { selector: '.summary-card:has-text("Total Gap in Hours")', pattern: /\d+(\.\d+)?\s*hours?/i },
      { selector: '.summary-card:has-text("Projects with Gaps")', pattern: /\d+/, minValue: 0 },
      { selector: '.summary-card:has-text("Roles with Gaps")', pattern: /\d+/, minValue: 0 },
      { selector: '.summary-card:has-text("Unutilized Hours")', pattern: /\d+(\.\d+)?\s*hours?/i }
    ];
    for (const metric of metrics) {
      const element = authenticatedPage.locator(metric.selector).first();
      if (await element.isVisible()) {
        const value = await element.textContent();
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
    // Gaps-by-role is no longer a Role/Demand/Capacity/Gap/Status table —
    // the report renders role cards (critical shortages / adequate capacity)
    // plus the roleName chart. 20 seeded assignments guarantee shortages.
    // Two actionable containers render (Projects first, Roles second) —
    // anchor by section title instead of positional .first().
    const section = authenticatedPage
      .locator('.actionable-table-container')
      .filter({ hasText: 'Actionable Roles' })
      .first();
    await section.waitFor({ state: 'visible', timeout: 15000 });
    const items = section.locator('.actionable-item');
    await expect(items.first()).toBeVisible({ timeout: 10000 });
    const firstCard = items.first();
    await expect(firstCard.locator('strong')).not.toBeEmpty();
    await expect(firstCard.locator('.item-detail')).toContainText(/\d/);
  });
  test(`${tags.reports} should display gap visualization chart`, async ({ 
    authenticatedPage 
  }) => {
    // Look for gap visualization
    // flaky 加固(2026-10-13): 原先瞬时 isVisible() 门——未渲染即空过、半渲染
    // 计数不定即败;改等容器就位 + poll 到柱数稳定
    const chartContainer = authenticatedPage.locator('.chart-container:has-text("Gap"), .chart-container:has-text("Demand vs Capacity")').first();
    await chartContainer.waitFor({ state: 'visible', timeout: 15000 });
    // Check for chart SVG. Both selectors can match inside one container
    // (recharts-wrapper wraps the svg) — take the first to stay unambiguous.
    const chartSvg = chartContainer.locator('svg, .recharts-wrapper').first();
    await expect(chartSvg).toBeVisible();
    // Check for bar elements (usually showing demand vs capacity)
    const bars = chartContainer.locator('.recharts-bar, rect[width]');
    // Should have at least 2 bars per role (demand and capacity)
    // With our test data, expect bars for each unique role
    const uniqueRoles = new Set(testData.people.map((p: any) => p.role));
    await expect.poll(async () => await bars.count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(uniqueRoles.size * 2);
  });
  test(`${tags.reports} should show actionable recommendations`, async ({ 
    authenticatedPage 
  }) => {
    // Check for recommendations section
    const recommendations = authenticatedPage.getByText('Recommendations').or(authenticatedPage.getByText('Actions')).first().or(authenticatedPage.getByText('Suggested Actions')).first();
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
    // Resolution options live on the actionable cards, not table rows:
    // critical shortage cards offer View People / Hire More deep links
    // (carrying gap + window params); project cards offer View Project.
    const section = authenticatedPage.locator('.actionable-table-container').first();
    await section.waitFor({ state: 'visible', timeout: 15000 });
    const actionLinks = section.locator('.actionable-item .item-actions a');
    await expect(actionLinks.first()).toBeVisible({ timeout: 10000 });
    expect(await actionLinks.count()).toBeGreaterThan(0);
    // The first offered action must actually navigate somewhere useful
    const href = await actionLinks.first().getAttribute('href');
    expect(href).toMatch(/^\/(people|projects)/);
  });
});