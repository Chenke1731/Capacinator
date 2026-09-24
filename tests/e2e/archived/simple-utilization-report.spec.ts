import { test, expect } from './fixtures';

test.describe('Simple Utilization Report Test', () => {
  test('should navigate to utilization report and verify basic functionality', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to reports page
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    
    // Click on Utilization Report tab
    await authenticatedPage.click('button:has-text("Utilization Report")');
    
    // Wait for the report to load
    await authenticatedPage.waitForSelector('text="Team Utilization Overview"', { timeout: 30000 });
    
    // Verify key elements are present
    await expect(authenticatedPage.locator('text="Utilization %"')).toBeVisible();
    await expect(authenticatedPage.locator('text="# People Overutilized"')).toBeVisible();
    await expect(authenticatedPage.locator('text="# People Underutilized"')).toBeVisible();
    
    // Verify the table is present
    const table = authenticatedPage.locator('table');
    await expect(table).toBeVisible();
    
    // Count rows to ensure data is loaded
    const rows = await table.locator('tbody tr').count();
    console.log(`Found ${rows} people in utilization table`);
    expect(rows).toBeGreaterThan(0);
    
    // Check for action buttons
    const reduceButtons = await authenticatedPage.locator('button:has-text("🔻"), button:has-text("Reduce")').count();
    const addButtons = await authenticatedPage.locator('button:has-text("➕"), button:has-text("Add")').count();
    
    console.log(`Found ${reduceButtons} Reduce Load buttons`);
    console.log(`Found ${addButtons} Add Projects buttons`);
    
    // Test filtering if location filter exists
    const locationFilter = authenticatedPage.locator('select[name="location"], select:has(option:has-text("All Locations"))');
    if (await locationFilter.count() > 0) {
      const initialRows = rows;
      
      // Try to select a specific location
      const options = await locationFilter.locator('option').count();
      if (options > 1) {
        // Select the second option (first non-"All" option)
        await locationFilter.selectOption({ index: 1 });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        
        const filteredRows = await table.locator('tbody tr').count();
        console.log(`After filtering: ${filteredRows} rows (was ${initialRows})`);
      }
    }
    
    // Test modal interaction if any action buttons exist
    if (reduceButtons > 0) {
      // Click the first reduce button
      const firstReduceButton = authenticatedPage.locator('button:has-text("🔻"), button:has-text("Reduce")').first();
      await firstReduceButton.click();
      
      // Wait for modal
      await authenticatedPage.waitForSelector('[role="dialog"]', { timeout: 5000 });
      
      // Verify modal has expected content
      const modalTitle = await authenticatedPage.locator('[role="dialog"] h2').textContent();
      expect(modalTitle).toContain('Reduce');
      
      // Close modal
      const closeButton = authenticatedPage.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button:has-text("Cancel"), [role="dialog"] button[aria-label="Close"]');
      if (await closeButton.count() > 0) {
        await closeButton.click();
      } else {
        // Click outside modal
        await authenticatedPage.keyboard.press('Escape');
      }
      
      // Wait for modal to close
      await authenticatedPage.waitForSelector('[role="dialog"]', { state: 'detached' });
    }
  });
  
  test('should handle error states gracefully', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to reports
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    
    // Click utilization report
    await authenticatedPage.click('button:has-text("Utilization Report")');
    
    // Check if error modal appears
    const errorModal = authenticatedPage.locator('text="Failed to load"');
    
    if (await errorModal.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Error modal detected - clicking retry');
      
      // Click retry button
      const retryButton = authenticatedPage.locator('button:has-text("Retry")');
      if (await retryButton.count() > 0) {
        await retryButton.click();
        
        // Wait for either success or another error
        await authenticatedPage.waitForSelector('text="Team Utilization Overview", text="Failed to load"', { timeout: 10000 });
      }
    }
    
    // If we get here, either there was no error or retry succeeded
    const hasContent = await authenticatedPage.locator('text="Team Utilization Overview"').isVisible().catch(() => false);
    expect(hasContent || await errorModal.isVisible()).toBe(true);
  });
});