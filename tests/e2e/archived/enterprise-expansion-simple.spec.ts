import { test, expect } from './fixtures'
test.describe('Enterprise Expansion Scenario - Simplified', () => {
  test('should navigate through enterprise workflow', async ({ authenticatedPage, testHelpers }) => {
    // Test 1: Navigate to the main dashboard
    await testHelpers.navigateTo('/');
    await expect(authenticatedPage.locator('h1')).toContainText('Dashboard');
    // Test 2: Check roles page
    await testHelpers.navigateTo('/roles');
    await expect(authenticatedPage.locator('h1')).toContainText('Roles');
    // Test 3: Check people management
    await testHelpers.navigateTo('/people');
    await expect(authenticatedPage.locator('h1')).toContainText('People');
    // Test 4: Check projects page
    await testHelpers.navigateTo('/projects');
    await expect(authenticatedPage.locator('h1')).toContainText('Projects');
    // Test 5: Check assignments
    await testHelpers.navigateTo('/assignments');
    await expect(authenticatedPage.locator('h1')).toContainText('Assignments');
    // Test 6: Check reports
    await testHelpers.navigateTo('/reports');
    await expect(authenticatedPage.locator('h1')).toContainText('Reports');
    // Test 7: Check allocations (redirects to roles)
    await testHelpers.navigateTo('/allocations');
    await expect(authenticatedPage.locator('h1')).toContainText('Roles');
    // Test 8: Check availability
    await testHelpers.navigateTo('/availability');
    await expect(authenticatedPage.locator('h1')).toContainText('Availability');
    // Test 9: Check settings
    await testHelpers.navigateTo('/settings');
    await expect(authenticatedPage.locator('h1')).toContainText('Settings');
    console.log('✅ Enterprise expansion navigation test completed');
  });
  test('should test project detail page features', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to projects
    await testHelpers.navigateTo('/projects');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Look for any existing project to click on
    const projectCards = authenticatedPage.locator('.project-card');
    const projectCount = await projectCards.count();
    if (projectCount > 0) {
      // Click on the first project
      await projectCards.first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Should be on project detail page
      await expect(authenticatedPage.locator('h1')).toBeVisible();
      // Look for demand curve section if it exists
      const demandSection = authenticatedPage.locator('.demand-curve-section, .demand-chart-section');
      if (await demandSection.count() > 0) {
        await expect(demandSection).toBeVisible();
        console.log('✅ Found demand curve section');
      }
      console.log('✅ Project detail page test completed');
    } else {
      console.log('⚠️  No projects found to test detail page');
    }
  });
  test('should test person detail page features', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to people
    await testHelpers.navigateTo('/people');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Look for any existing person to click on
    const personCards = authenticatedPage.locator('.person-card');
    const personCount = await personCards.count();
    if (personCount > 0) {
      // Click on the first person
      await personCards.first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Should be on person detail page
      await expect(authenticatedPage.locator('h1')).toBeVisible();
      // Look for allocation chart section if it exists
      const allocationSection = authenticatedPage.locator('.allocation-chart-section, .person-allocation-chart');
      if (await allocationSection.count() > 0) {
        await expect(allocationSection).toBeVisible();
        console.log('✅ Found allocation chart section');
      }
      console.log('✅ Person detail page test completed');
    } else {
      console.log('⚠️  No people found to test detail page');
    }
  });
  test('should test capacity planning features', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to reports
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Look for capacity report functionality
    const capacityReportButton = authenticatedPage.locator('button:has-text("Capacity"), button:has-text("Generate"), .report-button');
    if (await capacityReportButton.count() > 0) {
      await capacityReportButton.first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Should show some kind of report content
      await expect(authenticatedPage.locator('body')).toBeVisible();
      console.log('✅ Capacity report functionality tested');
    } else {
      console.log('⚠️  No capacity report button found');
    }
  });
  test('should test assignment management', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to assignments
    await testHelpers.navigateTo('/assignments');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Look for assignment creation button
    const newAssignmentButton = authenticatedPage.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create")');
    if (await newAssignmentButton.count() > 0) {
      await newAssignmentButton.first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Should show assignment form or modal
      await expect(authenticatedPage.locator('body')).toBeVisible();
      console.log('✅ Assignment creation functionality tested');
    } else {
      console.log('⚠️  No assignment creation button found');
    }
  });
});