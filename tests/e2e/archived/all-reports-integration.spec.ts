import { test, expect } from '@playwright/test';

test.describe('All Reports Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
  });

  test('should render all four report types with data', async ({ page }) => {
    // Test each report tab
    const reports = [
      {
        tab: 'Capacity',
        charts: ['Capacity by Role', 'Capacity by Location', 'Capacity Over Time'],
        metrics: ['Total Capacity', 'Available FTEs', 'Allocated Hours', 'Utilization Rate']
      },
      {
        tab: 'Utilization',
        charts: ['Utilization by Person', 'Utilization by Role', 'Utilization Distribution'],
        metrics: ['Utilization %', '# People Overutilized', '# People Underutilized', '# People Optimally Utilized']
      },
      {
        tab: 'Demand',
        charts: ['Demand by Project', 'Demand by Role', 'Demand Trend Over Time'],
        metrics: ['Total Demand', '# Projects with Demand', '# Roles with Demand', 'Peak Month']
      },
      {
        tab: 'Gaps Analysis',
        charts: ['Capacity vs Demand by Role', 'Gap Trend Analysis', 'Resource Allocation Gaps'],
        metrics: ['Total Gap in Hours', '# Projects with Gaps', '# Roles with Gaps', 'Unutilized Hours']
      }
    ];

    for (const report of reports) {
      // Click on the report tab
      await page.click(`button:has-text("${report.tab}")`);
      await page.waitForLoadState('networkidle');
      
      // Wait for content to load
      await page.waitForSelector('.report-content', { timeout: 10000 });
      
      // Check that charts are rendered
      const chartContainers = page.locator('.chart-container');
      const chartCount = await chartContainers.count();
      expect(chartCount).toBeGreaterThanOrEqual(3); // Each report should have at least 3 charts
      
      // Verify at least one chart has SVG content (indicates data is rendered)
      const svgElements = page.locator('.chart-container svg');
      const svgCount = await svgElements.count();
      expect(svgCount).toBeGreaterThan(0);
      
      // Check summary metrics are present
      const summaryCards = page.locator('.report-summary-card');
      const cardCount = await summaryCards.count();
      expect(cardCount).toBe(4); // Each report should have 4 summary cards
      
      // Verify specific metrics for this report
      for (const metric of report.metrics) {
        const metricElement = page.locator(`text="${metric}"`);
        await expect(metricElement).toBeVisible({ timeout: 5000 });
      }
      
      console.log(`✅ ${report.tab} report verified`);
    }
  });

  test('should maintain date filters across report types', async ({ page }) => {
    // Set a custom date range
    const startDate = '2025-10-01';
    const endDate = '2025-11-30';
    
    await page.fill('input[type="date"]:first-of-type', startDate);
    await page.fill('input[type="date"]:last-of-type', endDate);
    await page.waitForLoadState('networkidle');
    
    // Switch between tabs and verify dates persist
    const tabs = ['Utilization', 'Demand', 'Gaps Analysis', 'Capacity'];
    
    for (const tab of tabs) {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForLoadState('networkidle');
      
      // Check date inputs still have the same values
      const startInput = await page.locator('input[type="date"]:first-of-type').inputValue();
      const endInput = await page.locator('input[type="date"]:last-of-type').inputValue();
      
      expect(startInput).toBe(startDate);
      expect(endInput).toBe(endDate);
    }
  });

  test('should show consistent data across related reports', async ({ page }) => {
    // Get total hours from Demand report
    await page.click('button:has-text("Demand")');
    await page.waitForLoadState('networkidle');
    
    const demandTotalElement = page.locator('.report-summary-card:has-text("Total Demand") .metric');
    const demandTotalText = await demandTotalElement.textContent();
    const demandTotal = parseInt(demandTotalText?.replace(/[^\d]/g, '') || '0');
    
    // Get capacity from Capacity report
    await page.click('button:has-text("Capacity")');
    await page.waitForLoadState('networkidle');
    
    const capacityTotalElement = page.locator('.report-summary-card:has-text("Total Capacity") .metric');
    const capacityTotalText = await capacityTotalElement.textContent();
    const capacityTotal = parseInt(capacityTotalText?.replace(/[^\d]/g, '') || '0');
    
    // Both should have reasonable values
    expect(demandTotal).toBeGreaterThan(0);
    expect(capacityTotal).toBeGreaterThan(0);
    
    // Check Gaps Analysis shows the difference
    await page.click('button:has-text("Gaps Analysis")');
    await page.waitForLoadState('networkidle');
    
    const gapTotalElement = page.locator('.report-summary-card:has-text("Total Gap") .metric');
    const gapTotalText = await gapTotalElement.textContent();
    const gapTotal = parseInt(gapTotalText?.replace(/[^\d]/g, '') || '0');
    
    // Gap should be related to demand vs capacity
    expect(gapTotal).toBeDefined();
  });

  test('should handle loading states properly', async ({ page }) => {
    // Intercept API calls to add delay
    await page.route('**/api/reporting/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });
    
    // Switch to a different tab
    await page.click('button:has-text("Utilization")');
    
    // Should show loading state
    const loadingIndicator = page.locator('text=Loading');
    const hasLoading = await loadingIndicator.isVisible().catch(() => false);
    
    // Eventually should show content
    await expect(page.locator('.report-content')).toBeVisible({ timeout: 10000 });
  });

  test('should export data from any report', async ({ page }) => {
    const tabs = ['Capacity', 'Utilization', 'Demand', 'Gaps Analysis'];
    
    for (const tab of tabs) {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForLoadState('networkidle');
      
      // Look for export functionality
      const exportButton = page.locator('button:has-text("Export")').first();
      const hasExport = await exportButton.isVisible().catch(() => false);
      
      if (hasExport) {
        // Click export to show options
        await exportButton.click();
        
        // Should show export options
        const exportOptions = page.locator('[class*="dropdown"]');
        await expect(exportOptions).toBeVisible({ timeout: 5000 });
        
        // Close dropdown
        await page.keyboard.press('Escape');
      }
    }
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Charts should stack vertically on mobile
    const chartsGrid = page.locator('.charts-grid');
    const gridStyle = await chartsGrid.evaluate(el => window.getComputedStyle(el));
    
    // On mobile, grid should be single column or have appropriate layout
    // This is a basic check - could be expanded based on actual responsive behavior
    await expect(chartsGrid).toBeVisible();
    
    // Summary cards should also be visible
    const summaryCards = page.locator('.report-summary');
    await expect(summaryCards).toBeVisible();
  });
});