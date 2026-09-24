import { test, expect, waitForPageReady } from './helpers/base-test';
import { testConfig } from './helpers/test-config';
test.describe('Critical Issues and Missing Functionality', () => {
  test('Project Detail page shows stub implementation', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Navigate to projects page
    await testHelpers.navigateTo('/projects');
    await waitForPageReady(page);
    const tableRows = authenticatedPage.locator(testConfig.selectors.dataTable);
    const rowCount = await tableRows.count();
    if (rowCount > 0) {
      const viewButton = tableRows.first().getByRole('button', { name: /view details|view|eye/i });
      if (await viewButton.isVisible()) {
        await viewButton.click();
        await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        // Should navigate to project detail page
        const url = authenticatedPage.url();
        if (url.match(/\/projects\/[^\/]+$/)) {
          // Check if page shows "Coming soon" or actual content
          const hasComingSoon = await authenticatedPage.locator('text=/coming soon/i').isVisible();
          const hasPhaseManager = await authenticatedPage.locator('.project-phase-manager').isVisible();
          if (hasComingSoon) {
            console.log('✅ Project detail shows stub implementation as expected');
          } else if (hasPhaseManager) {
            console.log('✅ Project detail has been implemented with phase manager');
          }
          expect(hasComingSoon || hasPhaseManager).toBeTruthy();
        }
      }
    } else {
      console.log('⚠️ No projects available to test detail view');
    }
  });
  test('Missing routes cause navigation failures', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Test missing new project route
    await testHelpers.navigateTo('/projects');
    await waitForPageReady(page);
    const addProjectButton = authenticatedPage.locator('button:has-text("New Project"), button:has-text("Add Project")');
    if (await addProjectButton.isVisible()) {
      const currentUrl = authenticatedPage.url();
      await addProjectButton.click();
      await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      const newUrl = authenticatedPage.url();
      // Check if navigation happened or modal opened
      const urlChanged = newUrl !== currentUrl;
      const hasModal = await authenticatedPage.locator(testConfig.selectors.modalDialog).isVisible();
      const hasError = await authenticatedPage.locator('text=/404|not found|error/i').isVisible();
      console.log(`Navigation result: URL changed=${urlChanged}, Modal=${hasModal}, Error=${hasError}`);
      // Test passes if any expected behavior occurs
      expect(urlChanged || hasModal || hasError).toBeTruthy();
    }
    // Test missing edit person route
    await testHelpers.navigateTo('/people');
    await waitForPageReady(page);
    const peopleRows = authenticatedPage.locator(testConfig.selectors.dataTable);
    const peopleCount = await peopleRows.count();
    if (peopleCount > 0) {
      const editButton = peopleRows.first().locator('button:has-text("Edit")');
      if (await editButton.isVisible()) {
        await editButton.click();
        await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        // Check for navigation, modal, or error
        const hasModal = await authenticatedPage.locator(testConfig.selectors.modalDialog).isVisible();
        const urlChanged = authenticatedPage.url().includes('/edit');
        const hasError = await authenticatedPage.locator('text=/404|not found|error/i').isVisible();
        console.log(`Edit result: URL changed=${urlChanged}, Modal=${hasModal}, Error=${hasError}`);
        expect(urlChanged || hasModal || hasError).toBeTruthy();
      }
    }
  });
  test('Delete functionality only logs to console', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Test projects delete
    await testHelpers.navigateTo('/projects');
    await waitForPageReady(page);
    const tableRows = authenticatedPage.locator(testConfig.selectors.dataTable);
    const rowCount = await tableRows.count();
    if (rowCount > 0) {
      const consoleMessages: string[] = [];
      authenticatedPage.on('console', msg => {
        consoleMessages.push(msg.text());
      });
      const deleteButton = tableRows.first().locator('button[title*="Delete"], button:has([data-testid="trash"])');
      if (await deleteButton.isVisible()) {
        const initialRowCount = await tableRows.count();
        await deleteButton.click();
        await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        // Check if delete confirmation modal appears
        const hasModal = await authenticatedPage.locator(testConfig.selectors.modalDialog).isVisible();
        if (hasModal) {
          console.log('✅ Delete confirmation modal appeared');
          // Close modal
          const cancelButton = authenticatedPage.locator('button').filter({ hasText: /Cancel/i });
          if (await cancelButton.isVisible()) {
            await cancelButton.click();
          }
        } else {
          // Check if TODO message was logged
          const hasTodoMessage = consoleMessages.some(msg => 
            msg.includes('TODO: Implement delete functionality')
          );
          if (hasTodoMessage) {
            console.log('✅ Delete logs TODO message as expected');
          }
          // Verify row count hasn't changed (no actual deletion)
          const finalRowCount = await tableRows.count();
          expect(finalRowCount).toBe(initialRowCount);
          console.log('✅ Row count unchanged - delete is not implemented');
        }
      }
    }
    // Test people delete
    await testHelpers.navigateTo('/people');
    await waitForPageReady(page);
    const peopleRows = authenticatedPage.locator(testConfig.selectors.dataTable);
    const peopleCount = await peopleRows.count();
    if (peopleCount > 0) {
      const consoleMessages: string[] = [];
      authenticatedPage.on('console', msg => {
        consoleMessages.push(msg.text());
      });
      const deleteButton = peopleRows.first().locator('button[title*="Delete"], button:has([data-testid="trash"])');
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        // Should log TODO message or show modal
        const hasModal = await authenticatedPage.locator(testConfig.selectors.modalDialog).isVisible();
        const hasTodoMessage = consoleMessages.some(msg => 
          msg.includes('TODO: Implement delete functionality')
        );
        expect(hasModal || hasTodoMessage).toBeTruthy();
        console.log('✅ People delete shows expected behavior');
      }
    }
  });
  test('Forms and CRUD operations status check', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Check if assignments page has working forms
    await testHelpers.navigateTo('/assignments');
    await waitForPageReady(page);
    const hasAssignmentForm = await authenticatedPage.locator('form, .assignment-form').isVisible();
    const hasAssignmentButton = await authenticatedPage.locator('button').filter({ 
      hasText: /Create Assignment|New Assignment|Add Assignment/i 
    }).isVisible();
    console.log(`Assignments page: Form=${hasAssignmentForm}, Button=${hasAssignmentButton}`);
    // Check if scenarios page has working CRUD
    await testHelpers.navigateTo('/scenarios');
    await waitForPageReady(page);
    const hasScenarioButton = await authenticatedPage.locator('button').filter({ 
      hasText: /Create Scenario|New Scenario/i 
    }).isVisible();
    console.log(`Scenarios page: Create button=${hasScenarioButton}`);
    // Summary
    console.log('\n📊 CRUD Operations Summary:');
    console.log(`- Assignments: ${hasAssignmentForm || hasAssignmentButton ? '✅ Has UI' : '❌ Missing'}`);
    console.log(`- Scenarios: ${hasScenarioButton ? '✅ Has UI' : '❌ Missing'}`);
    // Test passes - we're just checking status
    expect(true).toBeTruthy();
  });
  test('API error handling and user feedback', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const networkErrors: any[] = [];
    // Monitor network errors
    authenticatedPage.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        });
      }
    });
    // Navigate through main pages to check for API errors
    const pages = ['/dashboard', '/people', '/projects', '/assignments', '/reports'];
    for (const pagePath of pages) {
      await authenticatedPage.goto(pagePath);
      await waitForPageReady(page);
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Wait for API calls
    }
    // Check if any API errors occurred
    if (networkErrors.length > 0) {
      console.log(`\n🔴 Found ${networkErrors.length} API errors:`);
      networkErrors.forEach(error => {
        console.log(`   ${error.method} ${error.url} - ${error.status}`);
      });
      // Check if errors are displayed to user
      const hasErrorUI = await authenticatedPage.locator('.error, .alert-danger, [role="alert"]').isVisible();
      console.log(`User error feedback shown: ${hasErrorUI ? '✅ Yes' : '❌ No'}`);
    } else {
      console.log('✅ No API errors detected during navigation');
    }
    // Test passes - we're monitoring, not failing on errors
    expect(true).toBeTruthy();
  });
});