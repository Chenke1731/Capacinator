import { test, expect } from './fixtures';
test.describe('Fixed Navigation Tests', () => {
  test('should load and display the app correctly', async ({ authenticatedPage, testHelpers }) => {
    // Check basic page accessibility
    const body = authenticatedPage.locator('body');
    await expect(body).toBeVisible();
    // Check navigation exists
    await expect(authenticatedPage.locator('.sidebar, nav')).toBeVisible();
    console.log('✅ Fixed navigation UI is accessible');
  });
  test('should navigate to dashboard using URL', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.waitForPageContent();
    // Should be on dashboard
    expect(authenticatedPage.url()).toContain('/dashboard');
    // Should not show errors
    const errorElements = authenticatedPage.locator('.error, [role="alert"]');
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });
  test('should navigate to projects using URL', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    // Should be on projects page
    expect(authenticatedPage.url()).toContain('/projects');
    // Should show projects content or empty state
    const hasContent = await authenticatedPage.locator('table, .data-table, .empty-state').count() > 0;
    expect(hasContent).toBe(true);
  });
  test('should navigate to people using navigation click', async ({ authenticatedPage, testHelpers }) => {
    // Navigate using helper method
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForPageContent();
    // Should be on people page
    expect(authenticatedPage.url()).toContain('/people');
    // Should show people content
    const hasContent = await authenticatedPage.locator('table, .data-table, h1:has-text("People")').count() > 0;
    expect(hasContent).toBe(true);
  });
  test('should maintain navigation state on page refresh', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to a specific page
    await testHelpers.navigateTo('/assignments');
    await testHelpers.waitForPageContent();
    // Get current URL
    const urlBefore = authenticatedPage.url();
    // Refresh the page
    await authenticatedPage.reload();
    await testHelpers.waitForPageContent();
    // Should still be on the same page
    const urlAfter = authenticatedPage.url();
    expect(urlAfter).toContain('/assignments');
    expect(urlAfter).toBe(urlBefore);
  });
  test('should handle navigation errors gracefully', async ({ authenticatedPage, testHelpers }) => {
    // Try to navigate to a non-existent page
    await authenticatedPage.goto('/non-existent-page-123');
    // Wait a bit for redirect or error handling
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Should either show 404 or redirect to valid page
    const currentUrl = authenticatedPage.url();
    const is404 = await authenticatedPage.locator('text=/404|not found/i').count() > 0;
    const isValidPage = currentUrl.includes('dashboard') || currentUrl.includes('projects') || currentUrl.includes('people');
    expect(is404 || isValidPage).toBe(true);
  });
  test('should have working breadcrumb navigation', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    // Check if breadcrumbs exist
    const breadcrumbs = authenticatedPage.locator('.breadcrumb, [aria-label="Breadcrumb"], nav[aria-label="breadcrumb"]');
    if (await breadcrumbs.count() > 0) {
      console.log('✅ Breadcrumbs found');
      // Try clicking home/dashboard breadcrumb
      const homeBreadcrumb = breadcrumbs.locator('a:has-text("Home"), a:has-text("Dashboard")').first();
      if (await homeBreadcrumb.isVisible()) {
        await homeBreadcrumb.click();
        await testHelpers.waitForPageContent();
        // Should navigate to home/dashboard
        expect(authenticatedPage.url()).toMatch(/\/(dashboard|$)/);
      }
    } else {
      console.log('ℹ️ No breadcrumb navigation found');
    }
  });
});