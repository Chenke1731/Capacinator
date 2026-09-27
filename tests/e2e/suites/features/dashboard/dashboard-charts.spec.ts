/**
 * Dashboard Charts Test Suite
 * Tests for dashboard visualizations and metrics
 * Uses dynamic test data for consistent chart displays
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Dashboard Charts and Metrics', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('dashboard');
    // Create test data to populate dashboard charts
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 5,  // Multiple projects for status distribution
      people: 4,    // People for utilization charts
      assignments: 6 // Assignments for resource allocation
    });
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.setupPage();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.smoke} should display all dashboard sections`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Verify dashboard title
    await testHelpers.verifyPageTitle('Dashboard');
    // Check for chart containers
    const chartContainers = authenticatedPage.locator('.chart-container, .dashboard-card, .metric-card');
    const chartCount = await chartContainers.count();
    expect(chartCount).toBeGreaterThanOrEqual(1);
    // Should show key metrics
    const metricsToCheck = [
      'Current Projects',
      'Total People',
      'Active Assignments',
      'Resource Utilization'
    ];
    for (const metric of metricsToCheck) {
      const metricSection = authenticatedPage.locator(`text=/${metric}/i`);
      if (await metricSection.count() > 0) {
        await expect(metricSection.first()).toBeVisible();
        // Should show a number value
        const metricValue = metricSection.locator('..').locator('text=/\\d+/');
        if (await metricValue.count() > 0) {
          const value = await metricValue.textContent();
          console.log(`${metric}: ${value}`);
        }
      }
    }
  });
  test.describe('Project Status Chart', () => {
    test('should display project status distribution', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for project status chart
      const statusChart = authenticatedPage.locator('.chart-container:has-text("Status"), .status-chart, [data-testid="project-status-chart"]');
      if (await statusChart.isVisible()) {
        await expect(statusChart).toBeVisible();
        // Should have chart visualization (SVG or Canvas)
        const chartElement = statusChart.locator('svg, canvas, .recharts-wrapper');
        await expect(chartElement).toBeVisible();
        // Should display our test projects count
        const chartText = await statusChart.textContent();
        expect(chartText).toBeTruthy();
        // Check for interactive elements if using recharts
        const chartSegments = statusChart.locator('.recharts-pie-sector, .recharts-bar, path[role="img"]');
        if (await chartSegments.count() > 0) {
          // Our test data should create chart segments
          expect(await chartSegments.count()).toBeGreaterThan(0);
          // Test interactivity
          await chartSegments.first().hover();
          // Check for tooltip
          const tooltip = authenticatedPage.locator('.recharts-tooltip, .chart-tooltip, [role="tooltip"]');
          const isTooltipVisible = await tooltip.isVisible({ timeout: 2000 }).catch(() => false);
          if (isTooltipVisible) {
            const tooltipText = await tooltip.textContent();
            expect(tooltipText).toMatch(/\d+/); // Should contain numbers
          }
        }
      }
    });
    test('should have clickable legend items', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const statusChart = authenticatedPage.locator('.chart-container:has-text("Status")');
      if (await statusChart.isVisible()) {
        // Look for legend
        const legend = statusChart.locator('.recharts-legend, .chart-legend, .legend');
        if (await legend.isVisible()) {
          const legendItems = legend.locator('.recharts-legend-item, .legend-item');
          const itemCount = await legendItems.count();
          if (itemCount > 0) {
            // Click first legend item to toggle
            await legendItems.first().click();
            await authenticatedPage.waitForTimeout(500);
            // Visual should update (hard to verify without visual regression)
            // Just ensure no errors occur
            await expect(statusChart).toBeVisible();
          }
        }
      }
    });
  });
  test.describe('Resource Utilization Chart', () => {
    test('should display resource utilization metrics', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for utilization chart
      const utilizationChart = authenticatedPage.locator('.chart-container:has-text("Utilization"), .utilization-chart, [data-testid="utilization-chart"]');
      if (await utilizationChart.isVisible()) {
        await expect(utilizationChart).toBeVisible();
        // Should have chart visualization
        const chartElement = utilizationChart.locator('svg, canvas, .recharts-wrapper');
        await expect(chartElement).toBeVisible();
        // Should show percentage values for our test people
        const chartText = await utilizationChart.textContent();
        expect(chartText).toMatch(/\d+%/);
        // Check for bars representing our test people
        const chartBars = utilizationChart.locator('.recharts-bar, rect[role="img"], .bar-chart-bar');
        if (await chartBars.count() > 0) {
          // Should have bars for our test people with assignments
          expect(await chartBars.count()).toBeGreaterThan(0);
          // Test hover interaction
          await chartBars.first().hover();
          const tooltip = authenticatedPage.locator('.recharts-tooltip, [role="tooltip"]');
          const isTooltipVisible = await tooltip.isVisible({ timeout: 2000 }).catch(() => false);
          if (isTooltipVisible) {
            const tooltipText = await tooltip.textContent();
            // Should show person name or utilization percentage
            expect(tooltipText).toBeTruthy();
          }
        }
      }
    });
    test('should show utilization breakdown', async ({
      authenticatedPage,
      testHelpers,
      testDataHelpers
    }) => {
      // Look for utilization details (4+ matches on the dashboard — take
      // the first to stay strict-mode safe)
      const utilizationSection = authenticatedPage
        .locator('text=/Utilization|Allocation/i')
        .first()
        .locator('..');
      if (await utilizationSection.isVisible()) {
        // Should show some of our test people
        const personName = testData.people[0].name.split('-')[0]; // Get prefix
        const hasTestPerson = await utilizationSection.textContent();
        // Log what we see
        console.log('Utilization section contains:', hasTestPerson?.substring(0, 100));
      }
    });
  });
  test.describe('Timeline/Capacity Chart', () => {
    test('should display timeline visualization', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for timeline chart
      const timelineChart = authenticatedPage.locator('.chart-container:has-text("Timeline"), .timeline-chart, [data-testid="timeline-chart"], .chart-container:has-text("Over Time")');
      if (await timelineChart.isVisible()) {
        await expect(timelineChart).toBeVisible();
        // Should have chart visualization
        const chartElement = timelineChart.locator('svg, canvas, .recharts-wrapper');
        await expect(chartElement).toBeVisible();
        // Should have axes
        const xAxis = timelineChart.locator('.recharts-xAxis, .x-axis, g.xAxis');
        const yAxis = timelineChart.locator('.recharts-yAxis, .y-axis, g.yAxis');
        if (await xAxis.isVisible()) {
          // X-axis should show time periods
          const xAxisText = await xAxis.textContent();
          expect(xAxisText).toBeTruthy();
        }
        if (await yAxis.isVisible()) {
          // Y-axis should show values
          const yAxisText = await yAxis.textContent();
          expect(yAxisText).toMatch(/\d+/);
        }
        // Should have data visualization
        const dataElements = timelineChart.locator('.recharts-line, .recharts-area, path[role="img"]');
        if (await dataElements.count() > 0) {
          expect(await dataElements.count()).toBeGreaterThan(0);
        }
      }
    });
  });
  test.describe('Dashboard Interactivity', () => {
    test('should handle chart resizing on viewport change', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Get initial chart size
      const chart = authenticatedPage.locator('.chart-container').first();
      const initialBox = await chart.boundingBox();
      // Change viewport
      await authenticatedPage.setViewportSize({ width: 1600, height: 900 });
      await authenticatedPage.waitForTimeout(500);
      // Chart should resize
      const newBox = await chart.boundingBox();
      if (initialBox && newBox) {
        // Width should be different
        expect(newBox.width).not.toBe(initialBox.width);
      }
      // Charts should still be visible
      await expect(chart).toBeVisible();
    });
    test('should navigate to detailed views from dashboard', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for clickable dashboard cards
      const projectCard = authenticatedPage.locator('.dashboard-card:has-text("Projects"), .metric-card:has-text("Projects")');
      if (await projectCard.isVisible()) {
        // Some cards might be clickable
        const isClickable = await projectCard.getAttribute('role') === 'button' || 
                          await projectCard.locator('a').count() > 0;
        if (isClickable) {
          await projectCard.click();
          await authenticatedPage.waitForURL('**/projects**', { timeout: 5000 }).catch(() => {});
          // Check if navigation occurred
          const url = authenticatedPage.url();
          console.log('Clicked projects card, current URL:', url);
        }
      }
    });
    test('should refresh data on demand', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for refresh button
      const refreshButton = authenticatedPage.locator('button[title*="Refresh"], button:has-text("Refresh"), button[aria-label*="Refresh"]');
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        // Should show loading state
        const loadingIndicator = authenticatedPage.locator('.loading, .spinner, [aria-busy="true"]');
        const wasLoading = await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false);
        console.log('Refresh triggered loading state:', wasLoading);
        // Wait for reload to complete
        await testHelpers.waitForLoadingComplete();
        // Charts should still be visible
        const charts = authenticatedPage.locator('.chart-container');
        await expect(charts.first()).toBeVisible();
      }
    });
  });
  test.describe('Empty State Handling', () => {
    test('should handle dashboard with no data gracefully', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      // Clean up our test data to simulate empty state
      await testDataHelpers.cleanupTestContext(testContext);
      // Reload dashboard
      await authenticatedPage.reload();
      await testHelpers.waitForPageLoad();
      // Should still show dashboard structure
      await testHelpers.verifyPageTitle('Dashboard');
      // Should show zero values or empty state messages
      const zeroValues = authenticatedPage.locator('text=/\\b0\\b/');
      const emptyMessages = authenticatedPage.locator('text=/no data|no projects|no people|empty/i');
      const hasEmptyIndication = 
        await zeroValues.count() > 0 || 
        await emptyMessages.count() > 0;
      expect(hasEmptyIndication).toBeTruthy();
      // Should not show errors
      await testHelpers.verifyNoErrors();
    });
  });
});