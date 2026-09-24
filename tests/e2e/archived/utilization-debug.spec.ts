import { test, expect } from './fixtures'
test('Debug utilization report page structure', async ({ authenticatedPage, testHelpers }) => {
  await testHelpers.navigateTo('/');
  await testHelpers.handleProfileSelection();
  // Navigate to reports page first
  await testHelpers.navigateTo('/reports');
  await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
  // Navigate to utilization report
  console.log('Looking for Utilization Report button...');
  const utilizationButton = authenticatedPage.locator('button:has-text("Utilization Report")');
  const buttonCount = await utilizationButton.count();
  console.log(`Found ${buttonCount} Utilization Report buttons`);
  if (buttonCount > 0) {
    await utilizationButton.click();
    console.log('Clicked Utilization Report button');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // Debug page content
    console.log('=== PAGE CONTENT DEBUG ===');
    // Check for headings
    const headings = await authenticatedPage.locator('h1, h2, h3, h4, h5, h6').allTextContents();
    console.log('Headings found:', headings);
    // Check for tables
    const tables = await authenticatedPage.locator('table').count();
    console.log(`Tables found: ${tables}`);
    if (tables > 0) {
      const tableHeaders = await authenticatedPage.locator('th').allTextContents();
      console.log('Table headers:', tableHeaders);
    }
    // Check for buttons
    const buttons = await authenticatedPage.locator('button').allTextContents();
    console.log('Buttons found:', buttons.slice(0, 10)); // First 10 buttons
    // Check for any utilization text
    const pageText = await authenticatedPage.textContent('body');
    const hasUtilization = pageText?.includes('utilization') || pageText?.includes('Utilization');
    console.log(`Page contains utilization text: ${hasUtilization}`);
    // Take screenshot
    await authenticatedPage.screenshot({ path: '/tmp/utilization-debug.png', fullPage: true });
    console.log('Screenshot saved to /tmp/utilization-debug.png');
    // Check URL
    console.log('Current URL:', authenticatedPage.url());
  } else {
    console.log('No Utilization Report button found');
    // Debug what buttons are available
    const allButtons = await authenticatedPage.locator('button').allTextContents();
    console.log('Available buttons:', allButtons);
    await authenticatedPage.screenshot({ path: '/tmp/no-utilization-button.png', fullPage: true });
  }
});