/**
 * Table Navigation Tests
 * Verifies basic table functionality across all pages
 * Migrated from simple-table-tests.spec.ts
 */
import { test, expect, tags } from '../../fixtures';
test.describe('Table Navigation and Display', () => {
  test(`${tags.smoke} can navigate to Projects page and see table`, async ({ 
    authenticatedPage, 
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/projects');
    // Check for table or no data message
    const table = authenticatedPage.locator('table').first();
    const noData = authenticatedPage.locator('text=/no.*data|no.*projects/i');
    // Either table or no data message should be visible
    const tableOrNoData = await Promise.race([
      table.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'table'),
      noData.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'noData')
    ]).catch(() => null);
    expect(tableOrNoData).toBeTruthy();
    // If table is visible, check headers
    if (await table.isVisible()) {
      await expect(authenticatedPage.locator('th')).toHaveCount(7); // Expected number of columns
    }
  });
  test(`${tags.smoke} can navigate to People page and see table`, async ({ 
    authenticatedPage, 
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/people');
    // Check for table or no data message
    const table = authenticatedPage.locator('table').first();
    const noData = authenticatedPage.locator('text=/no.*data|no.*people/i');
    // Either table or no data message should be visible
    const tableOrNoData = await Promise.race([
      table.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'table'),
      noData.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'noData')
    ]).catch(() => null);
    expect(tableOrNoData).toBeTruthy();
    // If table is visible, check for expected headers
    if (await table.isVisible()) {
      const headers = ['NAME', 'PRIMARY ROLE', 'TYPE', 'LOCATION', 'AVAILABILITY', 'HOURS/DAY', 'ACTIONS'];
      for (const header of headers) {
        await expect(authenticatedPage.locator(`th:has-text("${header}")`)).toBeVisible();
      }
    }
  });
  test(`${tags.smoke} can navigate to Assignments page and see content`, async ({ 
    authenticatedPage, 
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/assignments');
    // Check for page heading
    await expect(authenticatedPage.locator('h1:has-text("Assignments")')).toBeVisible({ timeout: 10000 });
    // Check for table or no data message
    const table = authenticatedPage.locator('table').first();
    const noData = authenticatedPage.locator('text=/no.*data|no.*assignments/i');
    // Either table or no data message should be visible
    const tableOrNoData = await Promise.race([
      table.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'table'),
      noData.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'noData')
    ]).catch(() => null);
    expect(tableOrNoData).toBeTruthy();
  });
  test(`${tags.smoke} can navigate to Reports page and see tabs`, async ({ 
    authenticatedPage, 
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/reports');
    // Check for report tabs
    await expect(authenticatedPage.locator('button:has-text("Demand Report")')).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.locator('button:has-text("Capacity Report")')).toBeVisible();
    await expect(authenticatedPage.locator('button:has-text("Utilization Report")')).toBeVisible();
    // Check for either "Gaps Report" or "Gaps Analysis"
    const gapsButton = authenticatedPage.locator('button:has-text("Gaps Report"), button:has-text("Gaps Analysis"), button:has-text("Gaps")');
    await expect(gapsButton).toBeVisible();
  });
  test.describe('Table Interactions', () => {
    test('should handle table sorting', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 1) {
        // Click on a sortable header
        const nameHeader = authenticatedPage.locator('th:has-text("Project Name"), th:has-text("Name")').first();
        if (await nameHeader.isVisible()) {
          await nameHeader.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {}); // Wait for sort
          // Verify no errors occurred
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test('should handle table search', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const searchInput = authenticatedPage.locator('input[placeholder*="Search"], input[type="search"]');
      if (await searchInput.count() > 0) {
        await testHelpers.searchInTable('test');
        // Wait for filtered results
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Clear search
        await testHelpers.searchInTable('');
      }
    });
    test('should handle pagination if available', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Check if pagination controls exist
      const paginationControls = authenticatedPage.locator('.pagination, [class*="pagination"]');
      if (await paginationControls.isVisible()) {
        const nextButton = authenticatedPage.locator('button:has-text("Next"), [aria-label="Next page"]');
        if (await nextButton.isEnabled()) {
          await nextButton.click();
          await testHelpers.waitForDataTable();
          // Verify navigation worked
          await testHelpers.verifyNoErrors();
        }
      }
    });
  });
  test.describe('Responsive Tables', () => {
    test.use({ viewport: { width: 768, height: 1024 } });
    test('tables should be responsive on tablet', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const table = authenticatedPage.locator('table');
      await expect(table).toBeVisible();
      // Table should be scrollable or adapted for smaller screens
      const tableContainer = authenticatedPage.locator('.table-container, [class*="overflow"]');
      if (await tableContainer.count() > 0) {
        await expect(tableContainer.first()).toBeVisible();
      }
    });
  });
});