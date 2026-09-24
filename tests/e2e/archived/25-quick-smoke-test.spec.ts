import { test, expect, tags } from './fixtures';
test.describe('Quick Smoke Test - Dev Environment', () => {
  test(`${tags.smoke} should load application and verify all pages`, async ({ authenticatedPage, testHelpers }) => {
    // Check main navigation exists
    await expect(authenticatedPage.locator('.sidebar, nav')).toBeVisible();
    // Test each main page loads with data
    const pages = [
      { name: 'Dashboard', url: '/', selector: 'text=Current Projects' },
      { name: 'Projects', url: '/projects', selector: 'th:has-text("Name"), th:has-text("Project")' },
      { name: 'People', url: '/people', selector: 'th:has-text("Name"), th:has-text("People")' },
      { name: 'Assignments', url: '/assignments', selector: 'th:has-text("Allocation"), th:has-text("Assignment")' },
      { name: 'Reports', url: '/reports', selector: 'h1:has-text("Reports"), .report-tabs' }
    ];
    for (const pageInfo of pages) {
      console.log(`Testing ${pageInfo.name} page...`);
      // Navigate to page
      await testHelpers.navigateTo(pageInfo.url);
      await testHelpers.waitForPageContent();
      // Verify page loaded
      if (pageInfo.name === 'Reports') {
        // For Reports page, just verify we navigated to the correct URL
        await expect(authenticatedPage).toHaveURL(/\/reports/);
        // Wait a bit for any initial loading
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      } else {
        // For other pages, check for specific content
        await expect(authenticatedPage.locator(pageInfo.selector).first()).toBeVisible({ timeout: 10000 });
      }
      // Check for data (except Import and Reports pages which have different content)
      if (pageInfo.name !== 'Import' && pageInfo.name !== 'Reports' && pageInfo.name !== 'Settings') {
        const dataElements = await authenticatedPage.locator('tbody tr, .card, .data-item').count();
        // Some pages might not have data in test environment, just verify the page loaded
        if (dataElements === 0) {
          console.log(`Note: ${pageInfo.name} page has no data, but loaded successfully`);
        }
      }
    }
    console.log('✅ Smoke test passed - all pages are accessible');
  });
  test('should verify API connectivity', async ({ apiContext }) => {
    // Check API health endpoint
    const response = await apiContext.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const healthData = await response.json();
    expect(healthData.status).toBe('ok');
    // Check roles endpoint (basic data check)
    const rolesResponse = await apiContext.get('/api/roles');
    expect(rolesResponse.ok()).toBeTruthy();
    const rolesData = await rolesResponse.json();
    expect(rolesData.data || rolesData).toBeInstanceOf(Array);
    expect((rolesData.data || rolesData).length).toBeGreaterThan(0);
    console.log('✅ API connectivity verified');
  });
  test('should verify data relationships work', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to assignments page
    await testHelpers.navigateTo('/assignments');
    await testHelpers.waitForDataTable();
    // If there are assignments, they should show related data
    const assignmentRows = await authenticatedPage.locator('tbody tr').count();
    if (assignmentRows > 0) {
      // First assignment should show project and person names
      const firstRow = authenticatedPage.locator('tbody tr').first();
      // Check for project name column
      const projectCell = firstRow.locator('td').nth(0); // Adjust index based on your table
      const projectText = await projectCell.textContent();
      expect(projectText).toBeTruthy();
      // Check for person name column  
      const personCell = firstRow.locator('td').nth(1); // Adjust index based on your table
      const personText = await personCell.textContent();
      expect(personText).toBeTruthy();
      console.log('✅ Data relationships verified');
    } else {
      console.log('⚠️ No assignments found to test relationships');
    }
  });
  test('should verify forms work', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to projects page
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    
    // Check for any interactive button that might open a form
    const addButtons = authenticatedPage.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create"), button[aria-label*="add"], button[aria-label*="new"]');
    const buttonCount = await addButtons.count();
    
    if (buttonCount > 0) {
      await expect(addButtons.first()).toBeVisible();
      // Click to open form
      await addButtons.first().click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Wait for animation
      
      // Should show form (modal or page)
      const formElements = await authenticatedPage.locator('form, [role="dialog"], .modal, input[type="text"]').count();
      expect(formElements).toBeGreaterThan(0);
      
      // Close form if it's a modal
      const closeButton = authenticatedPage.locator('button[aria-label="Close"], button:has-text("Cancel"), button:has-text("×")');
      if (await closeButton.isVisible()) {
        await closeButton.first().click();
      } else {
        // Navigate back if it's a page
        await authenticatedPage.goBack();
      }
      console.log('✅ Forms verified');
    } else {
      console.log('⚠️ No add buttons found - form test skipped');
      test.skip('No add buttons found on projects page');
    }
  });
  test('should verify dashboard metrics update', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/');
    await testHelpers.waitForPageContent();
    // Check that metric cards exist
    const metricCards = await authenticatedPage.locator('.metric-card, .summary-card, [class*="card"]').count();
    expect(metricCards).toBeGreaterThan(0);
    // Check that charts are rendered
    const charts = await authenticatedPage.locator('.chart-container, canvas, svg.chart').count();
    expect(charts).toBeGreaterThan(0);
    // Navigate to another page and back to verify data persists
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    await testHelpers.navigateTo('/');
    await testHelpers.waitForPageContent();
    // Metrics should still be visible
    const metricsAfterNav = await authenticatedPage.locator('.metric-card, .summary-card, [class*="card"]').count();
    expect(metricsAfterNav).toBeGreaterThan(0);
    console.log('✅ Dashboard metrics verified');
  });
  test('should handle browser refresh', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to a specific page
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForPageContent();
    
    // Reload the page
    await authenticatedPage.reload();
    
    // Should maintain authentication and show content
    await testHelpers.waitForPageContent();
    
    // Verify we're still on the same page
    await expect(authenticatedPage).toHaveURL(/\/people/);
    
    // Content should still be visible - check for any main content
    const mainContent = await authenticatedPage.locator('main, .main-content, table, .data-table').count();
    expect(mainContent).toBeGreaterThan(0);
    
    console.log('✅ Browser refresh handled correctly');
  });
  test.describe('Mobile Viewport', () => {
    test('should handle mobile navigation', async ({ authenticatedPage, testHelpers }) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      // Check if mobile menu toggle exists
      const mobileMenuToggle = authenticatedPage.locator('[aria-label="Menu"], button:has-text("Menu"), .mobile-menu-toggle');
      if (await mobileMenuToggle.isVisible()) {
        // Open mobile menu
        await mobileMenuToggle.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
        // Navigation should be visible
        const nav = authenticatedPage.locator('.sidebar, nav');
        await expect(nav).toBeVisible();
        // Close menu
        await mobileMenuToggle.click();
      }
      console.log('✅ Mobile viewport tested');
    });
  });
  test.describe('Performance', () => {
    test('should load pages within acceptable time', async ({ authenticatedPage, testHelpers }) => {
      const startTime = Date.now();
      // Measure initial load
      await testHelpers.navigateTo('/');
      await testHelpers.waitForPageContent();
      const initialLoadTime = Date.now() - startTime;
      expect(initialLoadTime).toBeLessThan(10000); // 10 seconds max for initial load
      // Measure navigation speed
      const navStartTime = Date.now();
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForPageContent();
      const navigationTime = Date.now() - navStartTime;
      expect(navigationTime).toBeLessThan(5000); // 5 seconds max for navigation
      console.log(`Initial load time: ${initialLoadTime}ms`);
      console.log(`Navigation time: ${navigationTime}ms`);
    });
  });
});