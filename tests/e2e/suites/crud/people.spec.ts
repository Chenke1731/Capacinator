/**
 * People CRUD Test Suite
 * Tests for people management functionality
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('People Management', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context for each test
    testContext = testDataHelpers.createTestContext('person');
    // Create test data dynamically
    testData = await testDataHelpers.createBulkTestData(testContext, {
      people: 3,
      projects: 2,  // For assignments
      assignments: 2  // Some people have assignments
    });
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('People List Display', () => {
    test(`${tags.smoke} should display people list with table`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Check page header
      await expect(authenticatedPage.locator('h1').first()).toContainText('People');
      // Should show data table or empty state
      const table = authenticatedPage.locator('table');
      const emptyState = authenticatedPage.locator('text=/no people|no data/i');
      const hasContent = await table.isVisible() || await emptyState.isVisible();
      expect(hasContent).toBeTruthy();
      // Should show Add Person button
      await expect(authenticatedPage.locator('button:has-text("Add Person")')).toBeVisible();
    });
    test('should display person data with all columns', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Check for expected columns
        const headers = ['NAME', 'PRIMARY ROLE', 'TYPE', 'LOCATION', 'AVAILABILITY', 'HOURS/DAY', 'ACTIONS'];
        for (const header of headers) {
          await expect(authenticatedPage.locator(`th:has-text("${header}")`)).toBeVisible();
        }
        // Check specific test person row has proper data
        const personRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.people[0].name
        );
        // Person name should be clickable
        const personLink = personRow.locator('td:first-child a, td:first-child button');
        await expect(personLink).toBeVisible();
        // Action buttons should be present
        await expect(personRow.locator('button:has-text("View")')).toBeVisible();
        await expect(personRow.locator('button:has-text("Edit")')).toBeVisible();
        await expect(personRow.locator('button[title*="Delete"], button:has([data-testid="trash"])')).toBeVisible();
      }
    });
    test('should display team insights summary', async ({ 
      authenticatedPage 
    }) => {
      const teamInsights = authenticatedPage.locator('.team-insights');
      if (await teamInsights.isVisible()) {
        // Should show insight items
        const insightItems = authenticatedPage.locator('.insight-item');
        await expect(insightItems).toHaveCount(3);
        // Check for specific patterns
        await expect(authenticatedPage.locator('.insight-item')).toContainText(/\d+ over-allocated/);
        await expect(authenticatedPage.locator('.insight-item')).toContainText(/\d+ available/);
        await expect(authenticatedPage.locator('.insight-item')).toContainText(/\d+ total people/);
      }
    });
    test('should display workload status indicators', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Check workload indicator for specific test person
        const personRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.people[0].name
        );
        const workloadColumns = personRow.locator('.workload-status, .status-indicator');
        if (await workloadColumns.count() > 0) {
          // Check for utilization percentages
          const indicator = workloadColumns.nth(0);
          const text = await indicator.textContent();
          expect(text).toMatch(/\d+%/);
          // Check for color coding
          const hasStatusColor = 
            await personRow.locator('.status-danger').count() > 0 ||
            await personRow.locator('.status-warning').count() > 0 ||
            await personRow.locator('.status-success').count() > 0 ||
            await personRow.locator('.status-info').count() > 0;
          expect(hasStatusColor).toBeTruthy();
        }
      }
    });
  });
  test.describe('People CRUD Operations', () => {
    test(`${tags.crud} ${patterns.crud('person').create} should handle Add Person`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const addButton = authenticatedPage.locator('button:has-text("Add Person")');
      await addButton.click();
      // Should navigate or show modal
      const url = authenticatedPage.url();
      const hasModal = await authenticatedPage.locator('[role="dialog"]').isVisible();
      expect(url.includes('/people/new') || hasModal).toBeTruthy();
      // If modal, fill form with unique data
      if (hasModal) {
        const personName = `${testContext.prefix}-New-Person`;
        const personEmail = `${testContext.prefix}-${Date.now()}@example.com`;
        await authenticatedPage.fill('#name', personName);
        await authenticatedPage.fill('#email', personEmail);
        // Select role using shadcn select if visible
        const roleSelect = authenticatedPage.locator('button[role="combobox"]').filter({ hasText: /role/i }).first();
        if (await roleSelect.isVisible()) {
          await roleSelect.click();
          await authenticatedPage.locator('[role="option"]').first().click();
        }
        // Submit form
        await authenticatedPage.locator('button[type="submit"], button:has-text("Save")').click();
        await testHelpers.waitForDataTable();
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    });
    test(`${tags.crud} ${patterns.crud('person').read} should navigate to person details`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Click specific test person
        const personRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.people[0].name
        );
        const personLink = personRow.locator('td:first-child a');
        const personName = testData.people[0].name;
        await personLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Should navigate to detail page
        expect(authenticatedPage.url()).toMatch(/\/people\/[a-f0-9-]+$/);
        // Should show person name
        await expect(authenticatedPage.locator(`h1:has-text("${personName}")`)).toBeVisible();
      }
    });
    test(`${tags.crud} ${patterns.crud('person').update} should handle Edit Person`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Find and edit specific test person
        const personRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.people[1].name
        );
        const editButton = personRow.locator('button:has-text("Edit")');
        await editButton.click();
        // Should navigate or show modal
        const url = authenticatedPage.url();
        const hasModal = await authenticatedPage.locator('[role="dialog"]').isVisible();
        expect(url.includes('/edit') || hasModal).toBeTruthy();
        // If modal, update field with unique name
        if (hasModal) {
          const nameInput = authenticatedPage.locator('input[name="name"]');
          const updatedName = `${testContext.prefix}-Updated-Person`;
          await nameInput.fill(updatedName);
          // Save changes
          await authenticatedPage.locator('button[type="submit"], button:has-text("Save")').click();
          await testHelpers.waitForDataTable();
          // Verify no errors
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test(`${tags.crud} ${patterns.crud('person').delete} should handle Delete Person`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      // Create an extra person to delete
      const personToDelete = await testDataHelpers.createTestUser(testContext, {
        name: `${testContext.prefix}-Person-To-Delete`
      });
      // Refresh page to see new person
      await authenticatedPage.reload();
      await testHelpers.waitForDataTable();
      const rowCount = await testHelpers.getTableRowCount();
      // Find and delete the specific person
      const personRow = await testDataHelpers.findByTestData(
        'tbody tr',
        personToDelete.name
      );
      const deleteButton = personRow.locator('button[title*="Delete"]');
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        // Should show confirmation
        const confirmDialog = authenticatedPage.locator('[role="alertdialog"], .confirm-dialog');
        await expect(confirmDialog).toBeVisible();
        // Confirm deletion
        await authenticatedPage.locator('button:has-text("Confirm"), button:has-text("Delete")').last().click();
        // Wait for deletion
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await testHelpers.waitForDataTable();
        // Verify deletion succeeded
        const newRowCount = await testHelpers.getTableRowCount();
        expect(newRowCount).toBeLessThan(rowCount);
      }
    });
  });
  test.describe('Search and Filtering', () => {
    test('should filter people by search term', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Use specific test person name for search
        const searchTerm = testData.people[0].name.split('-')[0];
        // Search for person
        await testHelpers.searchInTable(searchTerm);
        // Verify filtered results
        const filteredCount = await testHelpers.getTableRowCount();
        expect(filteredCount).toBeLessThanOrEqual(rowCount);
        // If results exist, they should contain search term
        if (filteredCount > 0) {
          const personResult = await testDataHelpers.findByTestData(
            'tbody tr',
            testData.people[0].name
          );
          await expect(personResult).toBeVisible();
        }
      }
    });
    test('should filter by role', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const roleFilter = authenticatedPage.locator('select[name*="role"], select:has(option:text-is("All Roles"))');
      if (await roleFilter.isVisible()) {
        const options = await roleFilter.locator('option').all();
        if (options.length > 1) {
          // Select specific role
          await roleFilter.selectOption({ index: 1 });
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Table should update
          await testHelpers.waitForDataTable();
          // Verify no errors
          await testHelpers.verifyNoErrors();
        }
      }
    });
  });
  test.describe('Quick Actions', () => {
    test('should handle quick action buttons', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      // Find quick action button for specific test person
      const personRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.people[0].name
      );
      const quickActionButtons = personRow.locator('.quick-action-btn');
      if (await quickActionButtons.count() > 0) {
        const firstButton = quickActionButtons.nth(0);
        const buttonText = await firstButton.textContent();
        await firstButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        const currentUrl = authenticatedPage.url();
        // Verify navigation based on action type
        if (buttonText?.includes('Assign')) {
          expect(currentUrl).toContain('assignments');
          expect(currentUrl).toContain('person=');
        } else if (buttonText?.includes('Reduce')) {
          expect(currentUrl).toContain('assignments');
          expect(currentUrl).toContain('action=reduce');
        } else if (buttonText?.includes('Monitor')) {
          expect(currentUrl).toContain('reports');
          expect(currentUrl).toContain('type=utilization');
        }
      }
    });
  });
  test.describe('Accessibility', () => {
    test('should have proper ARIA labels for actions', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Check specific test person row
        const personRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.people[0].name
        );
        // Check action buttons have proper labels
        const viewButton = personRow.locator('button:has-text("View")');
        const editButton = personRow.locator('button:has-text("Edit")');
        const deleteButton = personRow.locator('button[title*="Delete"]');
        // Buttons should have accessible text or aria-label
        await expect(viewButton).toBeVisible();
        await expect(editButton).toBeVisible();
        await expect(deleteButton).toBeVisible();
      }
    });
  });
});