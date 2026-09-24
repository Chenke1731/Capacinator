import { test } from './fixtures';

test('Screenshot scenario comparison modal', async ({ authenticatedPage, testHelpers }) => {
  // Navigate to scenarios page
  await testHelpers.navigateTo('/scenarios');
  await testHelpers.waitForPageContent();
  
  // Wait for scenarios to load
  await authenticatedPage.waitForSelector('.hierarchy-row', { timeout: 30000 });
  
  // Click compare button on first scenario
  const compareButton = await authenticatedPage.locator('.action-button[title*="Compare Scenarios"]').first();
  await compareButton.click();
  
  // Wait for modal
  await authenticatedPage.waitForSelector('.modal-content', { timeout: 5000 });
  await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  
  // Take screenshot
  await authenticatedPage.screenshot({ 
    path: '/home/tony/Pictures/Screenshots/modal-test.png',
    fullPage: true
  });
  
  console.log('Screenshot saved to /home/tony/Pictures/Screenshots/modal-test.png');
});