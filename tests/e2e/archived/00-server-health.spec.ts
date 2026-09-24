import { test, expect } from './fixtures';
test.describe('Server Health Check', () => {
  test('should reach the health endpoint', async ({ apiContext }) => {
    const response = await apiContext.get('/api/health');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });
  test('should load the main page', async ({ authenticatedPage, testHelpers }) => {
    // Should not be a complete error page
    await expect(authenticatedPage).not.toHaveTitle(/404|Error/);
    // Page should load without throwing
    await testHelpers.waitForPageContent();
    // Check basic elements exist
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
  test('should have working API endpoints', async ({ apiContext }) => {
    // Test a few basic endpoints
    const endpoints = ['/api/health', '/api/roles'];
    for (const endpoint of endpoints) {
      const response = await apiContext.get(endpoint);
      expect(response.status()).toBeLessThan(500); // No server errors
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toBeTruthy();
      }
    }
  });
});