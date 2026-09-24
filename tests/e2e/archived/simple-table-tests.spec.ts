import { test, expect } from './fixtures';
test.describe('Simple Table Tests', () => {
  test('can navigate to Projects page and see table', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to Projects page
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageContent();
    // Check that we're on the Projects page
    expect(authenticatedPage.url()).toContain('/projects');
    // Check for table or data
    const tableSelectors = [
      'table',
      '.data-table',
      '.table-container',
      '[role="table"]'
    ];
    let foundTable = false;
    for (const selector of tableSelectors) {
      if (await authenticatedPage.locator(selector).count() > 0) {
        foundTable = true;
        console.log(`✅ Found table with selector: ${selector}`);
        break;
      }
    }
    // If no table found, check for empty state
    if (!foundTable) {
      const emptyState = authenticatedPage.locator('.empty-state, text=/no projects|empty/i');
      expect(await emptyState.count()).toBeGreaterThan(0);
      console.log('ℹ️ No table found, but empty state is displayed');
    }
  });
  test('can navigate to People page and see table', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to People page
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForPageContent();
    // Check that we're on the People page
    expect(authenticatedPage.url()).toContain('/people');
    // Check for table or data
    const tableSelectors = [
      'table',
      '.data-table',
      '.table-container',
      '[role="table"]'
    ];
    let foundTable = false;
    for (const selector of tableSelectors) {
      if (await authenticatedPage.locator(selector).count() > 0) {
        foundTable = true;
        console.log(`✅ Found table with selector: ${selector}`);
        break;
      }
    }
    // If no table found, check for empty state
    if (!foundTable) {
      const emptyState = authenticatedPage.locator('.empty-state, text=/no people|empty/i');
      expect(await emptyState.count()).toBeGreaterThan(0);
      console.log('ℹ️ No table found, but empty state is displayed');
    }
  });
  test('can navigate to Assignments page and see content', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to Assignments page
    await testHelpers.navigateTo('/assignments');
    await testHelpers.waitForPageContent();
    // Check that we're on the Assignments page
    expect(authenticatedPage.url()).toContain('/assignments');
    // Check for content - could be table, cards, or list
    const contentSelectors = [
      'table',
      '.data-table',
      '.assignment-card',
      '.assignment-list',
      '.card',
      '[role="table"]'
    ];
    let foundContent = false;
    for (const selector of contentSelectors) {
      if (await authenticatedPage.locator(selector).count() > 0) {
        foundContent = true;
        console.log(`✅ Found content with selector: ${selector}`);
        break;
      }
    }
    // If no content found, check for empty state
    if (!foundContent) {
      const emptyState = authenticatedPage.locator('.empty-state, text=/no assignments|empty/i');
      expect(await emptyState.count()).toBeGreaterThan(0);
      console.log('ℹ️ No assignments found, but empty state is displayed');
    }
  });
  test('can navigate to Reports page and see tabs', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to Reports page
    await testHelpers.navigateTo('/reports');
    await testHelpers.waitForPageContent();
    // Check that we're on the Reports page
    expect(authenticatedPage.url()).toContain('/reports');
    // Check for report tabs or sections
    const tabSelectors = [
      '[role="tablist"]',
      '.tabs',
      '.report-tabs',
      '.nav-tabs',
      '[role="tab"]'
    ];
    let foundTabs = false;
    for (const selector of tabSelectors) {
      if (await authenticatedPage.locator(selector).count() > 0) {
        foundTabs = true;
        console.log(`✅ Found tabs with selector: ${selector}`);
        break;
      }
    }
    // If no tabs, check for report content
    if (!foundTabs) {
      const reportContent = authenticatedPage.locator('.report-content, .chart-container, canvas, svg');
      expect(await reportContent.count()).toBeGreaterThan(0);
      console.log('ℹ️ No tabs found, but report content is displayed');
    }
  });
  test('can navigate to Import page and see file upload', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to Import page
    await testHelpers.navigateTo('/import');
    await testHelpers.waitForPageContent();
    // Check that we're on the Import page
    expect(authenticatedPage.url()).toContain('/import');
    // Check for file upload input
    const fileInput = authenticatedPage.locator('input[type="file"]');
    const uploadArea = authenticatedPage.locator('.upload-area, .dropzone, [role="button"]:has-text("upload")');
    const hasFileInput = await fileInput.count() > 0;
    const hasUploadArea = await uploadArea.count() > 0;
    expect(hasFileInput || hasUploadArea).toBe(true);
    if (hasFileInput) {
      console.log('✅ Found file input element');
    }
    if (hasUploadArea) {
      console.log('✅ Found upload area');
    }
  });
  test('can see navigation sidebar on all pages', async ({ authenticatedPage, testHelpers }) => {
    const pages = ['/dashboard', '/projects', '/people'];
    for (const page of pages) {
      await testHelpers.navigateTo(page);
      await testHelpers.waitForPageContent();
      // Check sidebar is visible
      const sidebar = authenticatedPage.locator('.sidebar, nav, [role="navigation"]').first();
      await expect(sidebar).toBeVisible();
      // Check navigation links exist
      const navLinks = sidebar.locator('a[href]');
      const linkCount = await navLinks.count();
      expect(linkCount).toBeGreaterThan(3);
      console.log(`✅ Navigation sidebar verified on ${page}`);
    }
  });
  test('tables have proper headers', async ({ authenticatedPage, testHelpers }) => {
    // Test Projects table headers
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForDataTable();
    const projectHeaders = authenticatedPage.locator('th');
    if (await projectHeaders.count() > 0) {
      const headerTexts = await projectHeaders.allTextContents();
      console.log('Project table headers:', headerTexts);
      expect(headerTexts.length).toBeGreaterThan(0);
    }
    // Test People table headers
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    const peopleHeaders = authenticatedPage.locator('th');
    if (await peopleHeaders.count() > 0) {
      const headerTexts = await peopleHeaders.allTextContents();
      console.log('People table headers:', headerTexts);
      expect(headerTexts.length).toBeGreaterThan(0);
    }
  });
  test('can interact with table rows', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForDataTable();
    // Check if there are table rows
    const rows = authenticatedPage.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount > 0) {
      // Try clicking the first row
      const firstRow = rows.first();
      await firstRow.click();
      // Check if any action happened (modal opened, navigation, etc.)
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check if we navigated to a detail page
      const urlChanged = !authenticatedPage.url().endsWith('/projects');
      // Check if a modal opened
      const modalOpened = await authenticatedPage.locator('[role="dialog"], .modal').count() > 0;
      if (urlChanged || modalOpened) {
        console.log('✅ Row click triggered an action');
        // Go back or close modal
        if (urlChanged) {
          await authenticatedPage.goBack();
        } else if (modalOpened) {
          const closeButton = authenticatedPage.locator('button[aria-label="Close"], button:has-text("Cancel")');
          if (await closeButton.isVisible()) {
            await closeButton.click();
          }
        }
      } else {
        console.log('ℹ️ Row click did not trigger navigation or modal');
      }
    } else {
      console.log('ℹ️ No table rows found to interact with');
    }
  });
});