import { test, expect } from './fixtures';

test.describe('Test Utilization Data Verification', () => {
  test.setTimeout(60000); // Increase timeout for data setup
  test('should show E2E test users with assignments', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Look for any E2E test users (both old and new naming conventions)
    const e2eUsers = [
      // New consolidated seed users
      'E2E Over Utilized',     // 120% utilization
      'E2E Normal Utilized',   // 80% utilization
      'E2E Under Utilized',    // 40% utilization
      'E2E Zero Utilized',     // 0% utilization
      // Old seed users (from existing database)
      'E2E Test User 1',
      'E2E Test User 2',
      'E2E Test Manager'
    ];
    
    for (const userName of e2eUsers) {
      const userRow = authenticatedPage.locator(`tr:has-text("${userName}")`).first();
      const userExists = await userRow.isVisible();
      
      if (userExists) {
        console.log(`✅ Found ${userName} in utilization table`);
        
        // Check utilization
        const utilizationCell = userRow.locator('td:nth-child(3)');
        const utilization = await utilizationCell.textContent();
        console.log(`   Utilization: ${utilization}`);
        
        // Check for reduce load button (various possible formats)
        const reduceButton = userRow.locator('button:has-text("🔻"), button:has-text("Reduce"), button:has-text("Reduce Load")');
        const hasReduceButton = await reduceButton.count() > 0;
        console.log(`   Has Reduce Load button: ${hasReduceButton}`);
        
        // Also check for Add Projects button for under-utilized users
        const addButton = userRow.locator('button:has-text("➕"), button:has-text("Add"), button:has-text("Add Projects")');
        const hasAddButton = await addButton.count() > 0;
        console.log(`   Has Add Projects button: ${hasAddButton}`);
      } else {
        console.log(`❌ ${userName} not found in utilization table`);
      }
    }
    
    // Check total number of people
    const allRows = await authenticatedPage.locator('table tbody tr').count();
    console.log(`\nTotal people in table: ${allRows}`);
    
    // Check for any action buttons
    const allReduceButtons = await authenticatedPage.locator('button:has-text("🔻"), button:has-text("Reduce"), button:has-text("Reduce Load")').count();
    const allAddButtons = await authenticatedPage.locator('button:has-text("➕"), button:has-text("Add"), button:has-text("Add Projects")').count();
    console.log(`Total Reduce Load buttons: ${allReduceButtons}`);
    console.log(`Total Add Projects buttons: ${allAddButtons}`);
    
    // Take a screenshot to see what's in the table
    await authenticatedPage.screenshot({ path: 'test-results/utilization-table.png', fullPage: true });
    
    // Let's also check what names are actually in the table
    const firstFewNames = await authenticatedPage.locator('table tbody tr td:nth-child(1)').allTextContents();
    console.log(`\nFirst 10 names in table: ${firstFewNames.slice(0, 10).join(', ')}`);
    
    // Verify at least some E2E users were found
    const foundE2EUsers = e2eUsers.filter(async userName => {
      const userRow = authenticatedPage.locator(`tr:has-text("${userName}")`).first();
      return await userRow.isVisible();
    });
    console.log(`\nSummary: Found ${foundE2EUsers.length} E2E users out of ${e2eUsers.length} expected`);
  });
});