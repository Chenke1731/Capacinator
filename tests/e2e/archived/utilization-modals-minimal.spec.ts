import { test, expect } from './fixtures'

test.describe('Utilization Modal - Minimal Tests', () => {
  test('verify utilization report loads and has action buttons', async ({ 
    authenticatedPage, 
    testHelpers, 
    e2eTestDataBuilder 
  }) => {
    // Create test data
    const testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.click('button:has-text("Utilization Report")');
    
    // Wait for report to load
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { 
      timeout: 10000 
    });
    
    // Wait for table data to load
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    
    // Verify we have utilization data
    const utilizationRows = await authenticatedPage.locator('tbody tr').count();
    expect(utilizationRows).toBeGreaterThan(0);
    console.log(`Found ${utilizationRows} utilization rows`);
    
    // Count action buttons
    const addButtons = await authenticatedPage.locator('button:has-text("➕ Add Projects")').count();
    const reduceButtons = await authenticatedPage.locator('button:has-text("🔻 Reduce Load")').count();
    
    console.log(`Add buttons: ${addButtons}, Reduce buttons: ${reduceButtons}`);
    
    // We should have at least some buttons
    expect(addButtons + reduceButtons).toBeGreaterThan(0);
    
    // Verify percentage cells exist
    const percentageCells = await authenticatedPage.locator('td').filter({ 
      hasText: /\d+(\.\d+)?%/ 
    }).count();
    
    expect(percentageCells).toBeGreaterThan(0);
    console.log(`Found ${percentageCells} percentage cells`);
    
    // Verify we have the test people
    const personNames = [
      testData.overUtilized.name,
      testData.underUtilized.name,
      testData.available.name
    ];
    
    for (const name of personNames) {
      const personVisible = await authenticatedPage.locator(`text="${name}"`).count();
      expect(personVisible).toBeGreaterThan(0);
    }
    
    // Test complete
    console.log('✅ Utilization report loaded successfully with test data');
  });
});