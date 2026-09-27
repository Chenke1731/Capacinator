/**
 * Basic Navigation Test Suite
 * Tests for core navigation functionality
 */
import { test, expect, tags } from '../../fixtures';
test.describe('Navigation and Basic UI', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    // Start from dashboard
    await testHelpers.navigateTo('/dashboard');
  });
  test(`${tags.smoke} should load the dashboard page by default`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to root
    await authenticatedPage.goto('/');
    // Should redirect to /dashboard
    await expect(authenticatedPage).toHaveURL(/.*\/dashboard/);
    // Should show dashboard title
    await testHelpers.verifyPageTitle('Dashboard');
    // Should show navigation sidebar
    await testHelpers.waitForNavigation();
    // Should load dashboard charts
    await testHelpers.waitForDashboardCharts();
    // Should not show any errors
    await testHelpers.verifyNoErrors();
  });
  test(`${tags.smoke} should navigate between pages using sidebar`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Wait a moment for initial page load
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Navigate to Projects
    await testHelpers.navigateViaSidebar('Projects');
    await expect(authenticatedPage).toHaveURL(/.*\/projects/);
    await testHelpers.verifyPageTitle('Projects');
    // Navigate to People
    await testHelpers.navigateViaSidebar('People');
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
    await testHelpers.verifyPageTitle('People');
    // Navigate back to Dashboard
    await testHelpers.navigateViaSidebar('Dashboard');
    await expect(authenticatedPage).toHaveURL(/.*\/dashboard/);
    await testHelpers.verifyPageTitle('Dashboard');
  });
  test('should display sidebar navigation correctly', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Check all navigation items are present — the sidebar's real set
    // (Layout nav): no Locations/Settings entries; Iterations and
    // Import & Export are the ones this stale list was missing
    const navItems = [
      'Dashboard',
      'Projects',
      'Iterations',
      'People',
      'Assignments',
      'Scenarios',
      'Reports',
      'Import & Export',
      'Audit Log'
    ];
    for (const item of navItems) {
      const navLink = authenticatedPage.locator(
        `[data-testid="nav-${item.toLowerCase()}"], .nav-link:has-text("${item}")`
      );
      await expect(navLink).toBeVisible();
    }
  });
  test('should be responsive on mobile', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Set mobile viewport
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });
    // Dashboard should still be accessible
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.verifyPageTitle('Dashboard');
    // Navigation should be responsive
    await testHelpers.waitForNavigation();
    // Try navigating on mobile
    await testHelpers.navigateViaSidebar('Projects');
    await testHelpers.verifyPageTitle('Projects');
  });
  test('should handle browser back/forward navigation', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate through several pages
    await testHelpers.navigateViaSidebar('Projects');
    await testHelpers.navigateViaSidebar('People');
    await testHelpers.navigateViaSidebar('Assignments');
    // Use browser back
    await authenticatedPage.goBack();
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
    await authenticatedPage.goBack();
    await expect(authenticatedPage).toHaveURL(/.*\/projects/);
    // Use browser forward
    await authenticatedPage.goForward();
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
  });
  test('should display page loading states correctly', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to a page and check loading state
    await testHelpers.navigateTo('/projects');
    // Loading spinner should appear and then disappear
    await testHelpers.waitForDataTable();
    // Should not show loading spinner when done
    await testHelpers.waitForLoadingComplete();
  });
  test('should handle navigation errors gracefully', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Try to navigate to an invalid page
    await authenticatedPage.goto('/invalid-page-route');
    // Should either redirect to dashboard or show 404
    const currentUrl = authenticatedPage.url();
    const is404 = await authenticatedPage.locator('text=/404|not found/i').isVisible();
    const isDashboard = currentUrl.includes('/dashboard');
    expect(is404 || isDashboard).toBeTruthy();
  });
  test('should maintain navigation state on refresh', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to a specific page
    await testHelpers.navigateViaSidebar('People');
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
    // Reload the page
    await authenticatedPage.reload();
    // Should still be on the same page
    await expect(authenticatedPage).toHaveURL(/.*\/people/);
    await testHelpers.verifyPageTitle('People');
    // Navigation should still work
    await testHelpers.waitForNavigation();
  });
});