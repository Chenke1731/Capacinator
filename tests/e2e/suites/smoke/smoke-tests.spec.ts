/**
 * Smoke Test Suite
 * Quick tests to verify basic functionality is working
 * Should complete in under 1 minute
 */
import { test, expect, tags } from '../../fixtures';
test.describe('Smoke Tests', () => {
  test.describe.configure({ mode: 'parallel' }); // Run in parallel for speed
  test(`${tags.smoke} ${tags.critical} server health check`, async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });
  test(`${tags.smoke} ${tags.critical} can authenticate and reach dashboard`, async ({ 
    authenticatedPage, 
    testHelpers 
  }) => {
    await expect(authenticatedPage).toHaveURL(/.*\/dashboard/);
    await testHelpers.verifyNoErrors();
  });
  test(`${tags.smoke} main navigation links work`, async ({ authenticatedPage, testHelpers }) => {
    const mainPages = ['Projects', 'People', 'Assignments', 'Reports'];
    for (const page of mainPages) {
      const link = authenticatedPage.locator(`.nav-link:has-text("${page}"), a:has-text("${page}")`);
      await expect(link).toBeVisible();
      await expect(link).toBeEnabled();
    }
  });
  test(`${tags.smoke} projects page loads with tabs`, async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    // The projects page is now a tabbed interface (Requirements/Tickets/…)
    // with a div-grid table — there is no <table> element anymore. Success =
    // the Requirements tabpanel renders (with or without rows). The old
    // <table>/empty-state assertion predated the "real table" redesign.
    await authenticatedPage
      .locator('[role=tabpanel]')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
  });
  test(`${tags.smoke} people page loads with data`, async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/people');
    const table = authenticatedPage.locator('table');
    const emptyState = authenticatedPage.locator('text=/no people|no data/i');
    const hasContent = await Promise.race([
      table.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
      emptyState.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
    ]);
    expect(hasContent).toBeTruthy();
  });
  test(`${tags.smoke} assignments page is accessible`, async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/assignments');
    // Should show assignments heading
    await expect(authenticatedPage.locator('h1:has-text("Assignments")')).toBeVisible();
    // Should show either data or empty state
    const hasTable = await authenticatedPage.locator('table').isVisible();
    const hasEmptyState = await authenticatedPage.locator('text=/no assignments|no data/i').isVisible();
    expect(hasTable || hasEmptyState).toBeTruthy();
  });
  test(`${tags.smoke} reports page shows tabs`, async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/reports');
    // Should show at least one report tab
    const reportTabs = authenticatedPage.locator('button[role="tab"], .tab');
    const tabCount = await reportTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(3); // At least demand, capacity, utilization
  });
  test(`${tags.smoke} no console errors on main pages`, async ({ authenticatedPage, testHelpers }) => {
    const errors: string[] = [];
    // Listen for console errors
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    // SPA navigation via sidebar links (how a real user moves between pages).
    // Full page.goto per page re-mounts the app, re-triggers the login flow,
    // and re-runs cold module compilation — the source of chronic flakiness.
    await testHelpers.navigateTo('/dashboard');
    const sections = ['Projects', 'People', 'Assignments'];
    for (const section of sections) {
      await authenticatedPage.locator(`nav a:has-text("${section}")`).first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }
    // Should have no console errors
    expect(errors).toHaveLength(0);
  });
  test(`${tags.smoke} API endpoints respond`, async ({ apiContext }) => {
    const endpoints = [
      '/api/projects',
      '/api/people',
      '/api/assignments',
      '/api/roles',
      '/api/locations',
    ];
    for (const endpoint of endpoints) {
      const response = await apiContext.get(endpoint);
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      // All endpoints return {data: [...]} format
      expect(data).toHaveProperty('data');

      // Handle nested data structure for roles endpoint
      if (endpoint === '/api/roles' && data.data && typeof data.data === 'object' && 'data' in data.data) {
        // Roles endpoint returns {data: {data: [...]}}
        expect(Array.isArray(data.data.data)).toBeTruthy();
      } else {
        // Other endpoints return {data: [...]}
        expect(Array.isArray(data.data)).toBeTruthy();
      }
    }
  });
  test(`${tags.smoke} search functionality exists`, async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    // Should have search input
    const searchInput = authenticatedPage.locator('input[placeholder*="Search"], input[type="search"]');
    const searchExists = await searchInput.count() > 0;
    if (searchExists) {
      await searchInput.first().fill('test');
      await authenticatedPage.keyboard.press('Enter');
      // Should not crash
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await testHelpers.verifyNoErrors();
    }
  });
});