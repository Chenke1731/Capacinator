import { test, expect } from './fixtures'

test.describe('Utilization Modal Simple Debug', () => {
  test('debug add button visibility', async ({ authenticatedPage, testHelpers, e2eTestDataBuilder }) => {
    // Create test data
    const testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Debug: Look for any buttons in the table
    console.log('Looking for buttons in the utilization table...');
    
    // Find all table rows
    const rows = await authenticatedPage.locator('tbody tr').all();
    console.log(`Found ${rows.length} rows in the table`);
    
    // Check each row for buttons
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowText = await row.textContent();
      const buttons = await row.locator('button').all();
      
      console.log(`Row ${i}: ${rowText?.substring(0, 50)}...`);
      console.log(`  Buttons found: ${buttons.length}`);
      
      for (const button of buttons) {
        const btnText = await button.textContent();
        const isVisible = await button.isVisible();
        console.log(`    Button: "${btnText}" (visible: ${isVisible})`);
      }
    }
    
    // Look specifically for Add buttons
    const addButtons = await authenticatedPage.locator('button').filter({ hasText: /Add|➕|Add Projects/i }).all();
    console.log(`\nFound ${addButtons.length} Add buttons total`);
    
    // Try different selectors
    const addProjectButtons = await authenticatedPage.locator('button:has-text("Add Projects")').count();
    const plusButtons = await authenticatedPage.locator('button:has-text("➕")').count();
    const addTextButtons = await authenticatedPage.locator('button:has-text("Add")').count();
    
    console.log(`Buttons with "Add Projects": ${addProjectButtons}`);
    console.log(`Buttons with "➕": ${plusButtons}`);
    console.log(`Buttons with "Add": ${addTextButtons}`);
    
    // Take screenshot
    await authenticatedPage.screenshot({ path: 'test-results/utilization-table-debug.png', fullPage: true });
  });
});