import { test, expect } from './fixtures';
test.describe('Basic Stability Test', () => {
  test('should load the home page with basic content', async ({ authenticatedPage, testHelpers }) => {
    // Wait for content
    await testHelpers.waitForPageContent();
    // Should have some content
    const bodyText = await authenticatedPage.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText.toLowerCase()).toContain('capacinator');
    // Should have basic structure
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
  test('should have working page navigation', async ({ authenticatedPage, testHelpers }) => {
    // Test navigation to dashboard
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.waitForPageContent();
    expect(authenticatedPage.url()).toContain('/dashboard');
    // Should load content
    const bodyText = await authenticatedPage.textContent('body');
    expect(bodyText).toBeTruthy();
  });
  test('should handle projects page navigation', async ({ authenticatedPage, testHelpers }) => {
    // Test navigation to projects
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    expect(authenticatedPage.url()).toContain('/projects');
    // Should load content without errors
    const bodyText = await authenticatedPage.textContent('body');
    expect(bodyText).toBeTruthy();
  });
  test('should handle people page navigation', async ({ authenticatedPage, testHelpers }) => {
    // Test navigation to people
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForPageContent();
    expect(authenticatedPage.url()).toContain('/people');
    // Should load content without errors
    const bodyText = await authenticatedPage.textContent('body');
    expect(bodyText).toBeTruthy();
  });
  test('should maintain stability across multiple navigations', async ({ authenticatedPage, testHelpers }) => {
    // Navigate through multiple pages rapidly
    const pages = ['/', '/dashboard', '/projects', '/people', '/assignments'];
    for (const path of pages) {
      await testHelpers.navigateTo(path);
      await testHelpers.waitForPageContent();
      // Should not have any errors
      const errorElements = await authenticatedPage.locator('.error, [role="alert"], .error-boundary').count();
      expect(errorElements).toBe(0);
    }
  });
  test('should handle page refresh without errors', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to projects
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    // Refresh the page
    await authenticatedPage.reload();
    await testHelpers.waitForPageContent();
    // Should still be on projects page
    expect(authenticatedPage.url()).toContain('/projects');
    // Should not have errors
    const errorElements = await authenticatedPage.locator('.error, [role="alert"]').count();
    expect(errorElements).toBe(0);
  });
});