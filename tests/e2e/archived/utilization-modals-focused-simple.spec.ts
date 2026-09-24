import { test, expect } from './fixtures'

test.describe('Utilization Report - Basic Test', () => {
  test('check if utilization report loads with test data', async ({ authenticatedPage, testHelpers, e2eTestDataBuilder }) => {
    // Create test data
    const testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    
    // Wait for data to load
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    
    // Take a screenshot to see what's on the page
    await authenticatedPage.screenshot({ path: 'test-results/utilization-report.png', fullPage: true });
    
    // Check if our test data is visible
    const peopleNames = [
      testData.underUtilized.name,
      testData.available.name,
      testData.withAssignments.name
    ];
    
    console.log('Looking for test people:', peopleNames);
    
    // Check if any of our test people are visible
    let foundPeople = 0;
    for (const name of peopleNames) {
      const personElements = await authenticatedPage.locator(`text="${name}"`).count();
      if (personElements > 0) {
        foundPeople++;
        console.log(`Found ${name}: ${personElements} instances`);
      }
    }
    
    expect(foundPeople).toBeGreaterThan(0);
    
    // Look for any buttons on the page
    const buttons = await authenticatedPage.locator('button').all();
    console.log(`Found ${buttons.length} buttons on the page`);
    
    // Look specifically for Add/Reduce buttons
    const addButtons = await authenticatedPage.locator('button:has-text("Add"), button:has-text("➕")').count();
    const reduceButtons = await authenticatedPage.locator('button:has-text("Reduce"), button:has-text("⚡")').count();
    
    console.log(`Add buttons: ${addButtons}, Reduce buttons: ${reduceButtons}`);
    
    // If we find an add button, try clicking it
    if (addButtons > 0) {
      const firstAddButton = authenticatedPage.locator('button:has-text("Add"), button:has-text("➕")').first();
      await firstAddButton.click();
      
      // Wait and take another screenshot
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await authenticatedPage.screenshot({ path: 'test-results/after-add-click.png', fullPage: true });
      
      // Check what changed on the page
      const afterClickContent = await authenticatedPage.content();
      console.log('Page contains "Add Projects":', afterClickContent.includes('Add Projects'));
      console.log('Page contains "modal":', afterClickContent.includes('modal'));
      console.log('Page contains "overlay":', afterClickContent.includes('overlay'));
    }
  });
});