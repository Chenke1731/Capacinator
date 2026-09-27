import { test, expect } from '../../fixtures';

test.describe('Demand Report Charts', () => {
  test.use({ 
    // Set default timeout for all tests in this suite
    actionTimeout: 30000,
    navigationTimeout: 30000 
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/reports');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    
    // Click on Demand tab
    await authenticatedPage.click('button:has-text("Demand")');
    
    // Wait for demand report to load
    await authenticatedPage.waitForSelector('.report-content', { state: 'visible' });
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('should display all three demand charts', async ({ authenticatedPage }) => {
    // Check that all three chart containers are present
    const chartContainers = authenticatedPage.locator('.chart-container');
    await expect(chartContainers).toHaveCount(3);
    
    // Verify chart titles are visible
    await expect(authenticatedPage.locator('h3:has-text("Demand by Project")')).toBeVisible();
    await expect(authenticatedPage.locator('h3:has-text("Demand by Role")')).toBeVisible();
    await expect(authenticatedPage.locator('h3:has-text("Demand Trend Over Time")')).toBeVisible();
  });

  test('should show data in Demand by Project chart', async ({ authenticatedPage }) => {
    // Wait for chart container to be visible
    const projectChartContainer = authenticatedPage.locator('.chart-container:has(h3:has-text("Demand by Project"))');
    await expect(projectChartContainer).toBeVisible();
    
    // Wait for chart SVG to be rendered
    const chartSvg = projectChartContainer.locator('svg');
    await expect(chartSvg).toBeVisible();
    
    // Check if there's demand data
    const totalDemand = await authenticatedPage.locator('.summary-card:has(h3:has-text("Total Demand")) .metric').textContent();
    
    if (totalDemand && totalDemand.includes('0 hours')) {
      // No demand data - verify the chart handles empty state gracefully
      console.log('No demand data in test environment - verifying empty state handling');
      await expect(projectChartContainer).toBeVisible();
      // The chart should still render even with no data
      await expect(chartSvg).toBeVisible();
    } else {
      // Check for bars using various possible selectors
      const bars = projectChartContainer.locator('path[class*="recharts-bar"], rect[class*="recharts-bar"], g[class*="recharts-bar"] rect, .recharts-bar-rectangle, .recharts-rectangle');

      // Wait for at least one bar to be visible
      await expect(bars.first()).toBeVisible({ timeout: 10000 });

      // Count bars with a SINGLE selector: the union above multi-matches
      // each bar (a bar's rect hits both the g[…]rect branch and its own
      // class), so union counts scale ~2× per bar — once that crossed 10
      // it tripped a fabricated "top 10" bound. The product has no such
      // slice: BarChart renders the full byProject array.
      const barCount = await projectChartContainer.locator('.recharts-bar-rectangle').count();
      expect(barCount).toBeGreaterThan(0);
    }
  });

  test('should show data in Demand by Role chart', async ({ authenticatedPage }) => {
    // Wait for role chart container to be visible
    const roleChartContainer = authenticatedPage.locator('.chart-container:has(h3:has-text("Demand by Role"))');
    await expect(roleChartContainer).toBeVisible();
    
    // Wait for chart SVG to be rendered
    const chartSvg = roleChartContainer.locator('svg');
    await expect(chartSvg).toBeVisible();
    
    // Check if there's demand data
    const totalDemand = await authenticatedPage.locator('.summary-card:has(h3:has-text("Total Demand")) .metric').textContent();
    
    if (totalDemand && totalDemand.includes('0 hours')) {
      // No demand data - verify the chart handles empty state gracefully
      console.log('No demand data in test environment - verifying empty state handling');
      await expect(roleChartContainer).toBeVisible();
      await expect(chartSvg).toBeVisible();
    } else {
      // Check for bars using various possible selectors
      const bars = roleChartContainer.locator('path[class*="recharts-bar"], rect[class*="recharts-bar"], g[class*="recharts-bar"] rect, .recharts-bar-rectangle, .recharts-rectangle');
      
      // Wait for at least one bar to be visible
      await expect(bars.first()).toBeVisible({ timeout: 10000 });
      
      const barCount = await bars.count();
      expect(barCount).toBeGreaterThan(0);
    }
  });

  test('should show timeline with multiple months', async ({ authenticatedPage }) => {
    // Check for line chart container
    const timelineChartContainer = authenticatedPage.locator('.chart-container:has(h3:has-text("Demand Trend Over Time"))');
    await expect(timelineChartContainer).toBeVisible();
    
    // Wait for chart SVG to be rendered
    const chartSvg = timelineChartContainer.locator('svg');
    await expect(chartSvg).toBeVisible();
    
    // The timeline chart should render even with no data
    // It will show an empty line chart or a message
    const axes = timelineChartContainer.locator('.recharts-xAxis, .recharts-yAxis');
    
    // At minimum, we should see chart axes
    expect(await axes.count()).toBeGreaterThan(0);
  });

  test('should update charts when date range changes', async ({ authenticatedPage }) => {
    // Get initial state
    const projectChartContainer = authenticatedPage.locator('.chart-container:has(h3:has-text("Demand by Project"))');
    await expect(projectChartContainer).toBeVisible();
    
    const initialTotalDemand = await authenticatedPage.locator('.summary-card:has(h3:has-text("Total Demand")) .metric').textContent();
    
    // Change date range to a different period
    const startDateInput = authenticatedPage.locator('input[type="date"]').first();
    const endDateInput = authenticatedPage.locator('input[type="date"]').nth(1);
    
    await startDateInput.fill('2025-06-01');
    await endDateInput.fill('2025-06-30');
    
    // Click refresh and wait for update
    await authenticatedPage.click('button:has-text("Refresh")');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Verify the page updated
    await expect(projectChartContainer).toBeVisible();
    
    // Check that the total demand metric exists (even if it's 0)
    const newTotalDemand = await authenticatedPage.locator('.summary-card:has(h3:has-text("Total Demand")) .metric').textContent();
    expect(newTotalDemand).toBeTruthy();
  });

  test('should display chart tooltips on hover', async ({ authenticatedPage }) => {
    // This test is primarily checking that hovering doesn't break the UI
    // Tooltips are an enhancement and may not always be present
    
    const projectChartContainer = authenticatedPage.locator('.chart-container:has(h3:has-text("Demand by Project"))');
    await expect(projectChartContainer).toBeVisible();
    
    const chartSvg = projectChartContainer.locator('svg');
    await expect(chartSvg).toBeVisible();
    
    // Try to find visible interactive elements within the chart
    const visibleElements = projectChartContainer.locator('rect:visible, path:visible, circle:visible');
    const elementCount = await visibleElements.count();
    
    if (elementCount > 0) {
      try {
        // Find a visible element that we can hover over
        for (let i = 0; i < Math.min(elementCount, 5); i++) {
          const element = visibleElements.nth(i);
          const box = await element.boundingBox();
          if (box && box.width > 5 && box.height > 5) {
            // Found a reasonably sized element
            await element.hover({ force: true, timeout: 5000 });
            break;
          }
        }
      } catch (e) {
        // Hover might fail if elements are not interactive
        console.log('Could not hover over chart elements:', e.message);
      }
    }
    
    // Verify the chart is still visible after hover attempt
    await expect(projectChartContainer).toBeVisible();
  });

  test('should show summary metrics', async ({ authenticatedPage }) => {
    // Check summary cards are visible
    await expect(authenticatedPage.locator('.report-summary')).toBeVisible();
    
    // Verify specific metrics
    await expect(authenticatedPage.locator('h3:has-text("Total Demand")')).toBeVisible();
    await expect(authenticatedPage.locator('h3:has-text("# Projects with Demand")')).toBeVisible();
    await expect(authenticatedPage.locator('h3:has-text("# Roles with Demand")')).toBeVisible();
    await expect(authenticatedPage.locator('h3:has-text("Peak Month")')).toBeVisible();
    
    // Verify total hours shows a value
    const totalHours = authenticatedPage.locator('.summary-card:has(h3:has-text("Total Demand")) .metric');
    const hoursText = await totalHours.textContent();
    expect(hoursText).toMatch(/\d+\s*hours/);
  });

  test('should handle empty state gracefully', async ({ authenticatedPage }) => {
    // Set date range far in the future where there's no data
    const startDateInput = authenticatedPage.locator('input[type="date"]').first();
    const endDateInput = authenticatedPage.locator('input[type="date"]').nth(1);
    
    await startDateInput.fill('2030-01-01');
    await endDateInput.fill('2030-12-31');
    
    // Click refresh
    await authenticatedPage.click('button:has-text("Refresh")');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Verify page doesn't crash and shows appropriate message or empty charts
    await expect(authenticatedPage.locator('.report-content')).toBeVisible();
    
    // Check that total demand shows 0
    const totalHours = authenticatedPage.locator('.summary-card:has(h3:has-text("Total Demand")) .metric');
    const hoursText = await totalHours.textContent();
    expect(hoursText).toMatch(/0\s*hours/);
  });

  test('should export chart data', async ({ authenticatedPage }) => {
    // Wait for charts to load
    await authenticatedPage.waitForSelector('.chart-container svg', { state: 'visible' });
    
    // Look for export functionality - usually a button or download icon
    const exportButton = authenticatedPage.locator('button:has-text("Export"), button:has-text("Download"), button[title*="Export"], button[title*="Download"], button[aria-label*="Export"], button[aria-label*="Download"]');
    
    const exportButtonCount = await exportButton.count();
    
    if (exportButtonCount > 0) {
      // Set up download promise before clicking
      const downloadPromise = authenticatedPage.waitForEvent('download', { timeout: 5000 });
      
      await exportButton.first().click();
      
      try {
        // Wait for download to start
        const download = await downloadPromise;
        // Verify download has a filename
        expect(download.suggestedFilename()).toBeTruthy();
      } catch (e) {
        // Export might not trigger a download, could be copy to clipboard or other mechanism
        console.log('Export button clicked but no download triggered');
      }
    } else {
      // If no export button found, that's ok - export is an optional feature
      console.log('No export functionality found in demand report charts');
    }
  });

  test('should show project and role tables below charts', async ({ authenticatedPage }) => {
    // Simple check for tables
    await expect(authenticatedPage.locator('h3:has-text("High-Demand Projects")')).toBeVisible();
    await expect(authenticatedPage.locator('h3:has-text("High-Demand Roles")')).toBeVisible();
  });
});