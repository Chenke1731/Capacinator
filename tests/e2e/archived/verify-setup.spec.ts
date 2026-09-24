/**
 * Verify E2E Setup
 * Simple test to verify the new test framework is working
 */
import { test, expect } from './fixtures';
// Skip global setup for this test
test.use({ 
  storageState: undefined,
});
test('verify test framework setup', async ({ page }) => {
  // Just verify we can reach the server
  const response = await page.request.get('/api/health');
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty('status', 'ok');
  console.log('✅ Test framework is working correctly');
});
test('verify fixtures are available', async ({ testHelpers, apiContext, testData }) => {
  // Verify fixtures are injected properly
  expect(testHelpers).toBeDefined();
  expect(apiContext).toBeDefined();
  expect(testData).toBeDefined();
  console.log('✅ All fixtures are available');
});
test('verify navigation works', async ({ authenticatedPage, testHelpers }) => {
  // This will test the full authentication flow
  await expect(authenticatedPage).toHaveURL(/.*\/(dashboard|projects|people)/);
  // Verify we can navigate
  await testHelpers.navigateViaSidebar('Projects');
  await expect(authenticatedPage).toHaveURL(/.*\/projects/);
  console.log('✅ Navigation and authentication working');
});