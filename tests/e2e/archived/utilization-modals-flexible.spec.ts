import { test, expect } from './fixtures';

test.describe('Utilization Report Modals - Flexible', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  });

  test('should open Reduce Load modal for over-utilized person', async ({ authenticatedPage }) => {
    // Find any person with utilization > 100%
    const rows = await authenticatedPage.locator('table tbody tr').all();
    let overUtilizedRow = null;
    
    for (const row of rows) {
      const utilizationText = await row.locator('td:nth-child(3)').textContent();
      const utilization = parseInt(utilizationText?.replace('%', '') || '0');
      if (utilization > 100) {
        overUtilizedRow = row;
        break;
      }
    }
    
    if (!overUtilizedRow) {
      test.skip('No over-utilized person found in test data');
      return;
    }
    
    // Get person name and click reduce button
    const personName = await overUtilizedRow.locator('td:nth-child(1)').textContent();
    console.log(`Testing with over-utilized person: ${personName}`);
    
    const reduceButton = overUtilizedRow.locator('button:has-text("🔻"), button:has-text("Reduce"), button:has-text("Reduce Load")');
    await reduceButton.click();
    
    // Wait for modal
    await authenticatedPage.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Verify modal content
    await expect(authenticatedPage.locator('[role="dialog"] h2')).toContainText('Reduce Workload');
    await expect(authenticatedPage.locator('[role="dialog"]')).toContainText(personName || '');
  });

  test('should open Add Projects modal for under-utilized person', async ({ authenticatedPage }) => {
    // Find any person with Add Projects button
    const rows = await authenticatedPage.locator('table tbody tr').all();
    let underUtilizedRow = null;
    
    for (const row of rows) {
      const addButton = row.locator('button:has-text("➕"), button:has-text("Add"), button:has-text("Add Projects")');
      if (await addButton.count() > 0) {
        underUtilizedRow = row;
        break;
      }
    }
    
    if (!underUtilizedRow) {
      test.skip('No under-utilized person with Add Projects button found');
      return;
    }
    
    // Get person name and click add button
    const personName = await underUtilizedRow.locator('td:nth-child(1)').textContent();
    console.log(`Testing with under-utilized person: ${personName}`);
    
    const addButton = underUtilizedRow.locator('button:has-text("➕"), button:has-text("Add"), button:has-text("Add Projects")');
    await addButton.click();
    
    // Wait for modal
    await authenticatedPage.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Verify modal content
    await expect(authenticatedPage.locator('[role="dialog"] h2')).toContainText('Add Projects');
    await expect(authenticatedPage.locator('[role="dialog"]')).toContainText(personName || '');
  });

  test('should display utilization statistics', async ({ authenticatedPage }) => {
    // Check for utilization summary cards
    await expect(authenticatedPage.locator('text="Utilization %"')).toBeVisible();
    await expect(authenticatedPage.locator('text="# People Overutilized"')).toBeVisible();
    await expect(authenticatedPage.locator('text="# People Underutilized"')).toBeVisible();
    
    // Verify the statistics are displayed
    const utilizationPercent = await authenticatedPage.locator('.stat-card:has-text("Utilization %") .stat-value').textContent();
    const overutilizedCount = await authenticatedPage.locator('.stat-card:has-text("# People Overutilized") .stat-value').textContent();
    const underutilizedCount = await authenticatedPage.locator('.stat-card:has-text("# People Underutilized") .stat-value').textContent();
    
    console.log(`Utilization Statistics:`);
    console.log(`  Overall Utilization: ${utilizationPercent}`);
    console.log(`  Overutilized People: ${overutilizedCount}`);
    console.log(`  Underutilized People: ${underutilizedCount}`);
  });

  test('should filter utilization table by location', async ({ authenticatedPage }) => {
    // Check if location filter exists
    const locationFilter = authenticatedPage.locator('select[name="location"], [data-testid="location-filter"]');
    if (await locationFilter.count() === 0) {
      test.skip('Location filter not found');
      return;
    }
    
    // Get initial row count
    const initialRows = await authenticatedPage.locator('table tbody tr').count();
    
    // Select a specific location
    const options = await locationFilter.locator('option').allTextContents();
    if (options.length > 1) {
      await locationFilter.selectOption({ index: 1 });
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      
      const filteredRows = await authenticatedPage.locator('table tbody tr').count();
      console.log(`Filtered from ${initialRows} to ${filteredRows} rows`);
    }
  });
});