import { test, expect } from './fixtures';
test.describe('Simple UI Test', () => {
  test('should load and display basic UI elements', async ({ authenticatedPage, testHelpers }) => {
    // Should have a title/heading
    await expect(authenticatedPage.locator('h1').first()).toBeVisible();
    // Should have navigation elements
    await expect(authenticatedPage.locator('.sidebar, nav')).toBeVisible();
    // Should have main content area
    await expect(authenticatedPage.locator('.main-content, main, [role="main"], .content')).toBeVisible();
  });
  test('should be able to navigate to different pages', async ({ authenticatedPage, testHelpers }) => {
    // Try to navigate to Projects
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    // Should navigate to projects page
    expect(authenticatedPage.url()).toContain('/projects');
    // Try to navigate to Dashboard
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.waitForPageContent();
    // Should navigate to dashboard
    expect(authenticatedPage.url()).toContain('/dashboard');
  });
  test('should display some data or content', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.waitForPageContent();
    // Should have some content visible
    const contentSelectors = [
      '.card',
      '.chart-container',
      '.metric-card',
      '.data-display',
      'canvas',
      'svg',
      '[role="img"]'
    ];
    let foundContent = false;
    for (const selector of contentSelectors) {
      const count = await authenticatedPage.locator(selector).count();
      if (count > 0) {
        foundContent = true;
        console.log(`✅ Found content: ${selector}`);
        break;
      }
    }
    expect(foundContent).toBe(true);
  });
  test('should handle basic interactions', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to a page with data table
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    // Check if there are interactive elements
    const buttons = await authenticatedPage.locator('button').count();
    expect(buttons).toBeGreaterThan(0);
    // Try clicking a button
    const addButton = authenticatedPage.locator('button:has-text("New"), button:has-text("Add")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      // Should open a form or dialog
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const formOrDialog = authenticatedPage.locator('form, [role="dialog"]');
      expect(await formOrDialog.count()).toBeGreaterThan(0);
      // Close the form/dialog
      const closeButton = authenticatedPage.locator('button[aria-label="Close"], button:has-text("Cancel")');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
  });
  test('should have responsive navigation', async ({ authenticatedPage, testHelpers }) => {
    // Check desktop navigation
    const desktopNav = authenticatedPage.locator('.sidebar, nav:not(.mobile-nav)');
    await expect(desktopNav).toBeVisible();
    // Set mobile viewport
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });
    // Check if mobile menu exists
    const mobileMenuToggle = authenticatedPage.locator('[aria-label="Menu"], .mobile-menu-toggle, button:has-text("Menu")');
    const hasMobileMenu = await mobileMenuToggle.count() > 0;
    if (hasMobileMenu) {
      console.log('✅ Mobile menu toggle found');
      // Try to open mobile menu
      await mobileMenuToggle.first().click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Navigation should be visible somehow
      const navVisible = await authenticatedPage.locator('.sidebar, nav, [role="navigation"]').isVisible();
      expect(navVisible).toBe(true);
    } else {
      console.log('ℹ️ No mobile menu - navigation may always be visible');
    }
    // Reset viewport
    await authenticatedPage.setViewportSize({ width: 1280, height: 720 });
  });
});