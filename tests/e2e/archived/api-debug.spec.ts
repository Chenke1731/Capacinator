import { test, expect } from './fixtures'
test('Debug API calls in browser', async ({ authenticatedPage, testHelpers }) => {
  // Enable console logging
  authenticatedPage.on('console', (message) => {
    console.log(`Console: ${message.text()}`);
  });
  // Enable error logging
  authenticatedPage.on('pageerror', (error) => {
    console.error(`Page error: ${error.message}`);
  });
  // Navigate to debug page
  await authenticatedPage.goto('https://localhost:3121/debug-api-test.html');
  // Wait for the API tests to complete
  await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // Get the results
  const results = await authenticatedPage.textContent('#results');
  console.log('API Test Results:', results);
  // Take screenshot
  await authenticatedPage.screenshot({ path: '/tmp/api-debug-results.png' });
});