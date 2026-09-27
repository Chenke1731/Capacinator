/**
 * Core Navigation Tests
 * Tests basic navigation functionality across the application
 */
import { test, expect, tags } from '../../fixtures';
test.describe('Core Navigation', () => {
  test(`${tags.smoke} should load dashboard by default`, async ({ authenticatedPage, testHelpers }) => {
    // Should be on dashboard after authentication
    await expect(authenticatedPage).toHaveURL(/.*\/dashboard/);
    await testHelpers.verifyPageTitle('Dashboard');
    // Should show navigation sidebar
    await expect(authenticatedPage.locator('.sidebar, nav')).toBeVisible();
    // Should show dashboard content
    await testHelpers.waitForDashboardCharts();
    await testHelpers.verifyNoErrors();
  });
  test(`${tags.smoke} should navigate between main pages`, async ({ authenticatedPage, testHelpers }) => {
    // Test navigation to each main page
    const pages = [
      { name: 'Projects', urlPattern: /\/projects/ },
      { name: 'People', urlPattern: /\/people/ },
      { name: 'Assignments', urlPattern: /\/assignments/ },
      { name: 'Reports', urlPattern: /\/reports/ },
      { name: 'Settings', urlPattern: /\/settings/ },
    ];
    for (const page of pages) {
      await testHelpers.navigateViaSidebar(page.name);
      await expect(authenticatedPage).toHaveURL(page.urlPattern);
      await testHelpers.verifyPageTitle(page.name);
      await testHelpers.verifyNoErrors();
    }
  });
  test('should handle browser back/forward navigation', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to multiple pages
    await testHelpers.navigateViaSidebar('Projects');
    await testHelpers.navigateViaSidebar('People');
    await testHelpers.navigateViaSidebar('Reports');
    // Go back
    await authenticatedPage.goBack();
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
    // Go back again
    await authenticatedPage.goBack();
    await expect(authenticatedPage).toHaveURL(/.*\/projects/);
    // Go forward
    await authenticatedPage.goForward();
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
  });
  test('should show active navigation state', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateViaSidebar('Projects');
    // Check active state
    const projectsLink = authenticatedPage.locator('.nav-link:has-text("Projects")');
    await expect(projectsLink).toHaveClass(/active|selected/);
    // Other links should not be active
    const peopleLink = authenticatedPage.locator('.nav-link:has-text("People")');
    await expect(peopleLink).not.toHaveClass(/active|selected/);
  });
  test('should handle deep linking', async ({ authenticatedPage, testHelpers }) => {
    // Navigate directly to a specific page
    await authenticatedPage.goto('/projects');
    await testHelpers.waitForPageContent();
    // Should load the page correctly
    await expect(authenticatedPage).toHaveURL(/.*\/projects/);
    await testHelpers.verifyPageTitle('Projects');
  });
  test('should persist navigation state on reload', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to a specific page
    await testHelpers.navigateViaSidebar('Reports');
    // Reload the page
    await authenticatedPage.reload();
    await testHelpers.waitForPageContent();
    // Should still be on the same page
    await expect(authenticatedPage).toHaveURL(/.*\/reports/);
    await testHelpers.verifyPageTitle('Reports');
  });
  test('should handle navigation errors gracefully', async ({ authenticatedPage, testHelpers }) => {
    // Try to navigate to a non-existent page
    await authenticatedPage.goto('/non-existent-page');
    // Should show error or redirect
    const isError = await authenticatedPage.locator('text=/404|not found/i').isVisible();
    const isDashboard = await authenticatedPage.url().includes('/dashboard');
    expect(isError || isDashboard).toBeTruthy();
  });
  test.describe('Mobile Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } });
    test('should keep navigation usable on mobile viewport', async ({ authenticatedPage }) => {
      // The Layout has NO hamburger/collapse behavior: the sidebar simply
      // stays visible at 375px (no menu-toggle button exists). The real
      // mobile contract is that nav links remain visible and clickable.
      const sidebar = authenticatedPage.locator('.sidebar, nav');
      await expect(sidebar).toBeVisible();
      const menuToggle = authenticatedPage.locator('button[aria-label*="menu"], .menu-toggle');
      expect(await menuToggle.count()).toBe(0);

      // Navigate via the always-visible sidebar
      await authenticatedPage.getByRole('link', { name: 'Projects' }).first().click();
      await expect(authenticatedPage).toHaveURL(/\/projects/);
    });
  });
});