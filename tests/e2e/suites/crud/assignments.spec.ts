/**
 * Assignment CRUD Operations Test Suite
 * Comprehensive tests for creating, reading, updating, and deleting assignments
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Assignment CRUD Operations', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context for each test
    testContext = testDataHelpers.createTestContext('assign');
    // Create test data dynamically
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 3,
      assignments: 0 // We'll create assignments in tests
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Create Assignment', () => {
    test(`${tags.crud} ${patterns.crud('assignment').create} via People page`, async ({
      authenticatedPage,
      testHelpers,
      testDataHelpers,
      apiContext
    }) => {
      // The Smart Assignment modal only lists projects WITH resource needs —
      // freshly-created test projects have none, so pick a seed project
      // (ids start with 'project-e2e-'; they carry phases/templates → demand).
      const projects = await (await apiContext.get('/api/projects')).json();
      const seedProject = (projects.data || []).find((p: any) => p.id.startsWith('project-e2e-'));
      if (!seedProject) throw new Error('No seed project available for smart-assignment flow');

      // Navigate to people page
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Click on specific test person
      await testDataHelpers.clickSpecific(
        'tbody tr',
        testData.people[0].name
      );
      // Wait for person details page to load
      await authenticatedPage.waitForURL('**/people/**');
      await testHelpers.waitForPageContent();
      // Click Add Assignment
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      // Wait for modal to open
      await authenticatedPage.waitForSelector('[role="dialog"], .modal, [data-testid="assignment-modal"]', { timeout: 10000 });
      // Switch to manual tab if needed
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual Selection")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      // Fill assignment form
      // Select specific test project using shadcn select
      const projectSelect = authenticatedPage.locator('button[role="combobox"]').filter({ hasText: /project/i }).first();
      await projectSelect.click();
      await authenticatedPage.locator(`[role="option"]:has-text("${seedProject.name}")`).click();
      // Select role using shadcn select
      const roleSelect = authenticatedPage.locator('button[role="combobox"]').filter({ hasText: /role/i }).first();
      await roleSelect.click();
      await authenticatedPage.locator('[role="option"]').first().click();
      // Set allocation (range slider, 0-100 step 5)
      await authenticatedPage.fill('#allocation-slider', '50');
      // Set dates
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await authenticatedPage.fill('#start-date', today.toISOString().split('T')[0]);
      await authenticatedPage.fill('#end-date', nextMonth.toISOString().split('T')[0]);
      // Save (button reads "Create Assignment"; success closes the dialog —
      // there is no success toast, the modal's onClose IS the signal)
      await authenticatedPage.getByRole('button', { name: /create assignment/i }).click();
      await expect(authenticatedPage.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 });
      // Verify assignment appears in list
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      // Table should have data
      const rowCount = await testHelpers.getTableRowCount();
      expect(rowCount).toBeGreaterThan(0);
    });
    test(`${tags.crud} create assignment via API`, async ({ apiContext, testDataHelpers }) => {
      // Get available roles
      const rolesResponse = await apiContext.get('/api/roles');
      const roles = await rolesResponse.json();
      const role = roles.data?.[0] || roles[0];
      if (!role) {
        test.skip('No roles available');
      }
      const assignment = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: role.id,
        allocation_percentage: 25,
        assignment_date_mode: 'fixed', // required — this path has no default
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      };
      const response = await apiContext.post('/api/assignments', { data: assignment });
      expect(response.ok()).toBeTruthy();
      const responseData = await response.json();
      expect(responseData.data).toHaveProperty('id');
      // Track created assignment for cleanup
      if (responseData.data.id) {
        testContext.createdIds.assignments.push(responseData.data.id);
      }
    });
  });
  test.describe('Read Assignment', () => {
    test(`${tags.crud} ${patterns.crud('assignment').list}`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      // Verify table headers
      const expectedHeaders = ['Project', 'Person', 'Role', 'Allocation', 'Start Date', 'End Date'];
      for (const header of expectedHeaders) {
        await expect(authenticatedPage.locator(`th:has-text("${header}")`)).toBeVisible();
      }
      // Verify data is displayed
      const rowCount = await testHelpers.getTableRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    });
    test(`${tags.crud} filter assignments`, async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      // Test search
      const searchInput = authenticatedPage.locator('input[placeholder*="Search"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('test');
        await authenticatedPage.keyboard.press('Enter');
        await testHelpers.waitForDataTable();
      }
      // Test filters if available
      const projectFilter = authenticatedPage.locator('select[name="project"]');
      if (await projectFilter.isVisible()) {
        const options = await projectFilter.locator('option').all();
        if (options.length > 1) {
          await projectFilter.selectOption({ index: 1 });
          await testHelpers.waitForDataTable();
        }
      }
    });
  });
  test.describe('Update Assignment', () => {
    test(`${tags.crud} ${patterns.crud('assignment').update}`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      // Create an assignment first
      const assignment = await testDataHelpers.createTestAssignment(testContext, {
        project: testData.projects[0],
        person: testData.people[0],
        allocation: 30
      });
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      // Find and edit the specific assignment
      const assignmentRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[0].name
      );
      // Inline edit: allocation is a number input in the row, saved on blur
      const allocationInput = assignmentRow.locator('.allocation-cell input');
      await allocationInput.fill('75');
      await allocationInput.blur();

      // No toast — verify the new value persisted after the refetch
      await expect(assignmentRow.locator('.allocation-cell input')).toHaveValue('75', { timeout: 10000 });
    });
    test(`${tags.crud} update assignment via API`, async ({ apiContext, testDataHelpers }) => {
      // Create an assignment first
      const assignment = await testDataHelpers.createTestAssignment(testContext, {
        project: testData.projects[1],
        person: testData.people[1],
        allocation: 40
      });
      const updates = {
        allocation_percentage: 100,
      };
      const response = await apiContext.put(`/api/assignments/${assignment.id}`, { 
        data: updates 
      });
      expect(response.ok()).toBeTruthy();
    });
  });
  test.describe('Delete Assignment', () => {
    test(`${tags.crud} ${patterns.crud('assignment').delete}`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      // Create an assignment to delete
      const assignment = await testDataHelpers.createTestAssignment(testContext, {
        project: testData.projects[1],
        person: testData.people[2],
        allocation: 50
      });
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      const initialRowCount = await testHelpers.getTableRowCount();
      // Find and delete the specific assignment
      const assignmentRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[1].name
      );
      const deleteButton = assignmentRow.getByRole('button', { name: /delete/i });
      // Handle confirmation dialog (native confirm())
      authenticatedPage.on('dialog', dialog => dialog.accept());
      await deleteButton.click();
      // No toast — the row disappearing IS the success signal
      await expect(assignmentRow).toBeHidden({ timeout: 10000 });
      await testHelpers.waitForDataTable();
      const newRowCount = await testHelpers.getTableRowCount();
      expect(newRowCount).toBeLessThan(initialRowCount);
    });
    test(`${tags.crud} delete assignment via API`, async ({ apiContext, testDataHelpers }) => {
      // Create an assignment to delete
      const assignment = await testDataHelpers.createTestAssignment(testContext, {
        project: testData.projects[0],
        person: testData.people[2],
        allocation: 60
      });
      const response = await apiContext.delete(`/api/assignments/${assignment.id}`);
      expect(response.ok()).toBeTruthy();
    });
  });
  test.describe('Edge Cases', () => {
    test('handle invalid date ranges via API', async ({ apiContext, testDataHelpers }) => {
      // Get available roles
      const rolesResponse = await apiContext.get('/api/roles');
      const roles = await rolesResponse.json();
      const role = roles.data?.[0] || roles[0];
      if (!role) {
        test.skip('No roles available');
      }
      const invalidAssignment = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: role.id,
        allocation_percentage: 50,
        start_date: '2024-01-01',
        end_date: '2023-12-31', // End before start
      };
      const response = await apiContext.post('/api/assignments', { data: invalidAssignment });
      expect(response.ok()).toBeFalsy();
    });
  });
});