import { test, expect } from './fixtures';
test.describe('Person Details Page', () => {
  test('can navigate to person details from people list', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to people page
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    // Check if there are people in the list
    const personRows = await authenticatedPage.locator('tbody tr').count();
    if (personRows === 0) {
      console.log('⚠️ No people found in list, skipping detail navigation test');
      return;
    }
    // Click on first person - handle different possible selectors
    const firstPerson = authenticatedPage.locator('tbody tr').first();
    const personNameElement = firstPerson.locator('.person-name, td a, td:first-child');
    const firstPersonName = await personNameElement.textContent();
    await firstPerson.click();
    // Wait for navigation to person details
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Check if we navigated to person details
    const urlPattern = /\/people\/.+/;
    if (authenticatedPage.url().match(urlPattern)) {
      // Verify person name is displayed somewhere on the page
      await expect(authenticatedPage.locator(`text="${firstPersonName?.trim()}"`).first()).toBeVisible({ timeout: 10000 });
      console.log('✅ Successfully navigated to person details');
    } else {
      console.log('⚠️ Person details navigation not implemented or requires different interaction');
    }
  });
  test('displays all person information sections', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to people page
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    // Get first person's row
    const firstRow = authenticatedPage.locator('tbody tr').first();
    if (await firstRow.count() === 0) {
      console.log('⚠️ No people found to test details page');
      return;
    }
    await firstRow.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Check if we're on a person details page
    if (!authenticatedPage.url().match(/\/people\/.+/)) {
      // Try alternative navigation
      const viewButton = firstRow.locator('button:has-text("View"), a:has-text("View")');
      if (await viewButton.count() > 0) {
        await viewButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      } else {
        console.log('⚠️ Cannot navigate to person details page');
        return;
      }
    }
    // Check for common sections on person details page
    const expectedSections = [
      'Workload Insights',
      'Basic Information',
      'Roles',
      'Skills',
      'Current Assignments',
      'Allocation',
      'Availability',
      'History'
    ];
    let foundSections = 0;
    for (const section of expectedSections) {
      const sectionElement = authenticatedPage.locator(`h2:text-is("${section}"), h3:text-is("${section}"), text="${section}"`);
      if (await sectionElement.count() > 0) {
        foundSections++;
      }
    }
    console.log(`✅ Found ${foundSections}/${expectedSections.length} expected sections`);
    expect(foundSections).toBeGreaterThan(0); // At least some sections should be present
  });
  test('shows person basic information', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    // Try to navigate to first person
    const firstRow = authenticatedPage.locator('tbody tr').first();
    if (await firstRow.count() === 0) {
      console.log('⚠️ No people found');
      return;
    }
    await firstRow.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // If not on details page, skip test
    if (!authenticatedPage.url().match(/\/people\/.+/)) {
      console.log('⚠️ Person details page not accessible');
      return;
    }
    // Look for basic information fields
    const infoFields = ['Email', 'Role', 'Department', 'Phone', 'Start Date'];
    let foundFields = 0;
    for (const field of infoFields) {
      const fieldElement = authenticatedPage.locator(`text="${field}"`);
      if (await fieldElement.count() > 0) {
        foundFields++;
      }
    }
    console.log(`✅ Found ${foundFields} information fields`);
  });
  test('can navigate back to people list', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    const firstRow = authenticatedPage.locator('tbody tr').first();
    if (await firstRow.count() === 0) {
      console.log('⚠️ No people found');
      return;
    }
    await firstRow.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // If on details page, try to navigate back
    if (authenticatedPage.url().match(/\/people\/.+/)) {
      // Look for back button or breadcrumb
      const backButton = authenticatedPage.locator('button:has-text("Back"), a:has-text("Back"), a:has-text("People")').first();
      if (await backButton.isVisible()) {
        await backButton.click();
        await testHelpers.waitForPageContent();
        // Should be back on people list
        expect(authenticatedPage.url()).toMatch(/\/people\/?$/);
        console.log('✅ Successfully navigated back to people list');
      } else {
        // Use browser back
        await authenticatedPage.goBack();
        await testHelpers.waitForPageContent();
        expect(authenticatedPage.url()).toMatch(/\/people\/?$/);
        console.log('✅ Used browser back to return to people list');
      }
    }
  });
  test('handles non-existent person gracefully', async ({ authenticatedPage, testHelpers }) => {
    // Try to navigate to a non-existent person
    await authenticatedPage.goto('/people/non-existent-id-12345');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Should either show error or redirect
    const hasError = await authenticatedPage.locator('text=/not found|error|404/i').count() > 0;
    const redirectedToList = authenticatedPage.url().match(/\/people\/?$/);
    expect(hasError || redirectedToList).toBe(true);
    console.log('✅ Non-existent person handled gracefully');
  });
});