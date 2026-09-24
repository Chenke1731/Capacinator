import { test, expect } from './fixtures'

test.describe('Modal Click Debug', () => {
  test('debug why modal is not opening', async ({ authenticatedPage, testHelpers, e2eTestDataBuilder }) => {
    // Create test data
    const testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Find the first Add button
    console.log('Looking for Add buttons...');
    const addButtons = await authenticatedPage.locator('button:has-text("➕ Add Projects")').all();
    console.log(`Found ${addButtons.length} Add buttons`);
    
    if (addButtons.length === 0) {
      throw new Error('No Add buttons found!');
    }
    
    // Try clicking the first button
    const firstButton = addButtons[0];
    const buttonText = await firstButton.textContent();
    const isVisible = await firstButton.isVisible();
    const isEnabled = await firstButton.isEnabled();
    
    console.log(`First button: "${buttonText}" (visible: ${isVisible}, enabled: ${isEnabled})`);
    
    // Get button position
    const box = await firstButton.boundingBox();
    console.log(`Button position:`, box);
    
    // Try different clicking strategies
    console.log('Strategy 1: Regular click');
    try {
      await firstButton.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Check if modal appeared
      const modalVisible = await authenticatedPage.locator('text="Add Projects:"').isVisible();
      console.log(`Modal visible after regular click: ${modalVisible}`);
      
      if (!modalVisible) {
        console.log('Strategy 2: Force click');
        await firstButton.click({ force: true });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        
        const modalVisible2 = await authenticatedPage.locator('text="Add Projects:"').isVisible();
        console.log(`Modal visible after force click: ${modalVisible2}`);
      }
    } catch (error) {
      console.log('Click error:', error);
    }
    
    // Take screenshot
    await authenticatedPage.screenshot({ path: 'test-results/modal-click-debug.png', fullPage: true });
    
    // Check page state
    const pageTitle = await authenticatedPage.title();
    const pageUrl = authenticatedPage.url();
    console.log(`Page title: "${pageTitle}"`);
    console.log(`Page URL: "${pageUrl}"`);
    
    // Check for any error messages
    const errors = await authenticatedPage.locator('.error, [class*="error"]').all();
    console.log(`Error elements on page: ${errors.length}`);
    
    // Look for any modal-like elements
    const modalElements = [
      '[role="dialog"]',
      '.modal',
      '[class*="modal"]',
      'div[style*="position: fixed"]',
      'div[style*="z-index"]'
    ];
    
    for (const selector of modalElements) {
      const count = await authenticatedPage.locator(selector).count();
      if (count > 0) {
        console.log(`Found ${count} elements matching ${selector}`);
      }
    }
  });
});