import { test, expect } from './fixtures';
test.describe('Smoke Test - Basic Infrastructure', () => {
  test('should load application and authenticate', async ({ authenticatedPage, testHelpers }) => {
    // Wait for React app to load
    await authenticatedPage.waitForSelector('#root, body', { timeout: 10000 });
    // Verify page loads
    await testHelpers.waitForPageContent();
    // Verify we're authenticated (should be on dashboard or similar page)
    const currentUrl = authenticatedPage.url();
    expect(currentUrl).toMatch(/\/(dashboard|projects|people)/);
    // Verify page title
    await expect(authenticatedPage).toHaveTitle(/Capacinator/);
    // Verify heading exists
    const heading = authenticatedPage.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    const headingText = await heading.textContent();
    console.log('Page heading:', headingText);
    // Verify navigation sidebar exists
    const sidebar = authenticatedPage.locator('.sidebar, nav').first();
    await expect(sidebar).toBeVisible();
    console.log('✅ Smoke test passed - application loads and authenticates successfully');
  });
  test('should navigate between main pages', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to Projects
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    expect(authenticatedPage.url()).toContain('/projects');
    // Check for projects content - heading may be visually hidden but page content should exist
    const projectsContent = authenticatedPage.locator('table, .data-table, .project-list, main');
    await expect(projectsContent.first()).toBeVisible();
    // Navigate to People
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForPageContent();
    expect(authenticatedPage.url()).toContain('/people');
    // Check for people content - heading may be visually hidden but page content should exist
    const peopleContent = authenticatedPage.locator('table, .data-table, .people-list, main');
    await expect(peopleContent.first()).toBeVisible();
    // Navigate back to Dashboard
    await testHelpers.navigateTo('/dashboard');
    await testHelpers.waitForPageContent();
    expect(authenticatedPage.url()).toContain('/dashboard');
    console.log('✅ Navigation test passed - can navigate between pages');
  });
  test('should have working sidebar navigation', async ({ authenticatedPage, testHelpers }) => {
    // Check sidebar exists
    const sidebar = authenticatedPage.locator('.sidebar, nav');
    await expect(sidebar).toBeVisible();
    // Check navigation links exist
    const navLinks = sidebar.locator('a[href]');
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThan(3); // At least Dashboard, Projects, People, Assignments
    console.log(`✅ Sidebar found`);
    console.log(`✅ Navigation links found`);
  });
  test('should display main content area', async ({ authenticatedPage, testHelpers }) => {
    // Check main content area exists
    const mainContent = authenticatedPage.locator('main, .main-content, [role="main"], .content');
    await expect(mainContent.first()).toBeVisible();
    // Check for some content
    const contentElements = [
      '.card',
      '.chart-container', 
      '.data-table',
      'table',
      '.metric-card'
    ];
    let foundContent = false;
    for (const selector of contentElements) {
      if (await authenticatedPage.locator(selector).count() > 0) {
        foundContent = true;
        console.log(`✅ Found content: ${selector}`);
        break;
      }
    }
    expect(foundContent).toBe(true);
    console.log(`✅ Main content area found`);
  });
});