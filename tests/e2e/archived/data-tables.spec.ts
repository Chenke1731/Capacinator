/**
 * Data Tables Test Suite
 * Tests for data table functionality across different pages
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Data Tables Functionality', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('tables');
    // Create test data dynamically
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 3,
      assignments: 2
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Projects Table', () => {
    test(`${tags.smoke} should display and interact with Projects table`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Table should be visible
      await expect(authenticatedPage.locator('table')).toBeVisible();
      // Should have table headers
      const headers = ['Project Name', 'Project Type', 'Location', 'Start Date', 'End Date', 'Current Phase', 'Actions'];
      for (const header of headers) {
        await expect(authenticatedPage.locator(`th:has-text("${header}")`)).toBeVisible();
      }
      // Should display our test data
      for (const project of testData.projects) {
        const projectRow = await testDataHelpers.findByTestData('tbody tr', project.name);
        await expect(projectRow).toBeVisible();
      }
      // Test sorting by clicking header
      await authenticatedPage.click('th:has-text("Project Name")');
      await testHelpers.waitForDataTable();
      // Test search functionality with specific test project
      const searchTerm = testData.projects[0].name.split('-')[0];
      await testHelpers.searchInTable(searchTerm);
      // Should still show the searched project
      const searchedProject = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[0].name
      );
      await expect(searchedProject).toBeVisible();
      // Clear search
      await testHelpers.searchInTable('');
      await testHelpers.waitForDataTable();
    });
    test('should handle Projects table filtering', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Test status filter if available
      const statusFilter = authenticatedPage.locator('select').filter({ hasText: 'Status' }).or(
        authenticatedPage.locator('label:has-text("Status") + select')
      );
      if (await statusFilter.isVisible()) {
        await statusFilter.selectOption('active');
        await testHelpers.waitForDataTable();
        // Clear filters
        await testHelpers.clearFilters();
      }
    });
    test('should handle project row actions', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Find specific test project row
      const projectRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[0].name
      );
      // Check for action buttons
      const viewButton = projectRow.locator('button:has-text("View")');
      const editButton = projectRow.locator('button:has-text("Edit")');
      // At least one action should be available
      const hasActions = 
        await viewButton.isVisible() || 
        await editButton.isVisible() ||
        await projectRow.locator('[role="button"]').count() > 0;
      expect(hasActions).toBeTruthy();
    });
  });
  test.describe('People Table', () => {
    test(`${tags.smoke} should display and interact with People table`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Table should be visible
      await expect(authenticatedPage.locator('table')).toBeVisible();
      // Should have appropriate headers
      const headers = ['NAME', 'PRIMARY ROLE', 'TYPE', 'LOCATION', 'AVAILABILITY', 'HOURS/DAY', 'ACTIONS'];
      for (const header of headers) {
        await expect(authenticatedPage.locator(`th:has-text("${header}")`)).toBeVisible();
      }
      // Should display our test people
      for (const person of testData.people) {
        const personRow = await testDataHelpers.findByTestData('tbody tr', person.name);
        await expect(personRow).toBeVisible();
      }
      // Test search with specific test person
      const searchTerm = testData.people[0].name.split('-')[0];
      await testHelpers.searchInTable(searchTerm);
      await testHelpers.waitForDataTable();
      // Should still show the searched person
      const searchedPerson = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.people[0].name
      );
      await expect(searchedPerson).toBeVisible();
      // Clear search
      await testHelpers.searchInTable('');
    });
    test('should display correct person data columns', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Find specific test person row
      const personRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.people[0].name
      );
      // Check that row has expected number of columns
      const cells = personRow.locator('td');
      const cellCount = await cells.count();
      expect(cellCount).toBeGreaterThanOrEqual(6);
      // Verify person name is displayed
      await expect(personRow).toContainText(testData.people[0].name);
    });
  });
  test.describe('Assignments Table', () => {
    test('should display and interact with Assignments table', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      // Table should be visible
      const table = authenticatedPage.locator('table');
      const hasTable = await table.isVisible();
      if (hasTable) {
        // Should have appropriate headers
        const expectedHeaders = ['Project', 'Person', 'Role', 'Allocation', 'Start Date', 'End Date'];
        for (const header of expectedHeaders) {
          const headerElement = authenticatedPage.locator(`th:has-text("${header}")`);
          if (await headerElement.count() > 0) {
            await expect(headerElement).toBeVisible();
          }
        }
        // Should display our test assignments
        if (testData.assignments && testData.assignments.length > 0) {
          const rowCount = await testHelpers.getTableRowCount();
          expect(rowCount).toBeGreaterThanOrEqual(testData.assignments.length);
        }
      }
    });
  });
  test.describe('Table Interactions', () => {
    test('should handle pagination if available', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Look for pagination controls
      const pagination = authenticatedPage.locator('.pagination, [aria-label="pagination"]');
      if (await pagination.isVisible()) {
        // Check for page numbers or next/prev buttons
        const nextButton = authenticatedPage.locator('button:has-text("Next"), [aria-label="Next page"]');
        const pageNumbers = authenticatedPage.locator('.page-number, [aria-label*="Page"]');
        const hasPagination = 
          await nextButton.isVisible() || 
          await pageNumbers.count() > 0;
        expect(hasPagination).toBeTruthy();
      }
    });
    test('should handle bulk actions if available', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Look for select all checkbox
      const selectAllCheckbox = authenticatedPage.locator('th input[type="checkbox"], th [role="checkbox"]');
      if (await selectAllCheckbox.count() > 0) {
        // Check if clicking select all enables bulk actions
        await selectAllCheckbox.click();
        // Look for bulk action buttons
        const bulkActions = authenticatedPage.locator('button:has-text("Delete Selected"), button:has-text("Export Selected")');
        if (await bulkActions.count() > 0) {
          await expect(bulkActions.nth(0)).toBeVisible();
        }
        // Uncheck to clean up
        await selectAllCheckbox.click();
      }
    });
    test('should maintain table state on navigation', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Apply a search filter
      const searchTerm = testData.projects[0].name.split('-')[0];
      await testHelpers.searchInTable(searchTerm);
      await testHelpers.waitForDataTable();
      // Navigate away and back
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Check if search was preserved (implementation dependent)
      const searchInput = authenticatedPage.locator('input[placeholder*="Search"]');
      if (await searchInput.isVisible()) {
        const currentValue = await searchInput.inputValue();
        // Some implementations preserve search, others don't
        // This is just to check the behavior
        console.log('Search preservation:', currentValue);
      }
    });
  });
});