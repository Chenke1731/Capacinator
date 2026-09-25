/**
 * Assignment CRUD Operations Tests - With Proper Data Isolation
 * This is an example of how tests should be written with dynamic data
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Assignment CRUD Operations - Isolated', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('assign');
    // Create test data dynamically
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 3,
      assignments: 0 // We'll create assignments in tests
    });
    // Navigate to assignments page
    await testHelpers.navigateTo('/assignments');
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.crud} should create a new assignment with dynamic data`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    // Click create button
    await authenticatedPage.click('button:has-text("New Assignment")');
    // Fill form with test data
    const modal = authenticatedPage.locator('[role="dialog"]');
    // Select specific project from our test data
    await testDataHelpers.selectSpecificOption(
      'select[name="project_id"]',
      testData.projects[0].name
    );
    // Select specific person from our test data
    await testDataHelpers.selectSpecificOption(
      'select[name="person_id"]',
      testData.people[0].name
    );
    // Fill allocation
    await modal.locator('input[name="allocation_percentage"]').fill('50');
    // Set dates
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    await modal.locator('input[name="start_date"]').fill(today.toISOString().split('T')[0]);
    await modal.locator('input[name="end_date"]').fill(nextMonth.toISOString().split('T')[0]);
    // Submit with response monitoring
    const assignment = await testDataHelpers.performActionWithResponse(
      async () => await modal.locator('button:has-text("Create")').click(),
      '/api/assignments',
      'POST'
    );
    // Track created assignment for cleanup
    if (assignment.id) {
      testContext.createdIds.assignments.push(assignment.id);
    }
    // Verify assignment appears in list with specific identifiers
    await expect(
      testDataHelpers.findByTestData('.assignment-card', testData.projects[0].name)
    ).toBeVisible();
    await expect(
      testDataHelpers.findByTestData('.assignment-card', testData.people[0].name)
    ).toBeVisible();
  });
  test('should update an existing assignment with dynamic data', async ({ 
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
    // Refresh page to see new assignment
    await authenticatedPage.reload();
    // Find and click the specific assignment
    await testDataHelpers.clickSpecific(
      '.assignment-card',
      testData.projects[0].name
    );
    // Click edit button
    await authenticatedPage.click('button:has-text("Edit")');
    // Update allocation
    const modal = authenticatedPage.locator('[role="dialog"]');
    await modal.locator('input[name="allocation_percentage"]').fill('75');
    // Save changes
    await modal.locator('button:has-text("Save")').click();
    // Verify update
    await expect(
      testDataHelpers.findByTestData('.assignment-card', '75%')
    ).toBeVisible();
  });
  test('should delete a specific assignment', async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    // Create an assignment first
    const assignment = await testDataHelpers.createTestAssignment(testContext, {
      project: testData.projects[1],
      person: testData.people[1],
      allocation: 40
    });
    // Refresh page to see new assignment
    await authenticatedPage.reload();
    // Find the specific assignment card
    const assignmentCard = await testDataHelpers.findByTestData(
      '.assignment-card',
      testData.projects[1].name
    );
    // Click delete button on this specific card
    await assignmentCard.locator('button[aria-label="Delete"]').click();
    // Confirm deletion
    await authenticatedPage.click('button:has-text("Delete")');
    // Verify assignment is removed
    await expect(assignmentCard).not.toBeVisible();
  });
  test('should filter assignments by project', async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    // Create multiple assignments
    await testDataHelpers.createTestAssignment(testContext, {
      project: testData.projects[0],
      person: testData.people[0]
    });
    await testDataHelpers.createTestAssignment(testContext, {
      project: testData.projects[1],
      person: testData.people[1]
    });
    // Refresh page
    await authenticatedPage.reload();
    // Filter by first project
    await testDataHelpers.selectSpecificOption(
      'select[name="project_filter"]',
      testData.projects[0].name
    );
    // Verify only assignments for first project are visible
    await expect(
      testDataHelpers.findByTestData('.assignment-card', testData.projects[0].name)
    ).toBeVisible();
    await expect(
      testDataHelpers.findByTestData('.assignment-card', testData.projects[1].name)
    ).not.toBeVisible();
  });
  test.describe('Edge Cases with Dynamic Data', () => {
    test('should handle overlapping assignments', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      // Create first assignment
      await testDataHelpers.createTestAssignment(testContext, {
        project: testData.projects[0],
        person: testData.people[0],
        allocation: 60
      });
      // Try to create overlapping assignment
      await authenticatedPage.click('button:has-text("New Assignment")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await testDataHelpers.selectSpecificOption(
        'select[name="project_id"]',
        testData.projects[1].name
      );
      await testDataHelpers.selectSpecificOption(
        'select[name="person_id"]',
        testData.people[0].name // Same person
      );
      await modal.locator('input[name="allocation_percentage"]').fill('50'); // Would exceed 100%
      // Use same dates
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await modal.locator('input[name="start_date"]').fill(today.toISOString().split('T')[0]);
      await modal.locator('input[name="end_date"]').fill(nextMonth.toISOString().split('T')[0]);
      // Submit
      await modal.locator('button:has-text("Create")').click();
      // Should show overallocation warning
      await expect(modal.locator('.error-message, .warning-message')).toContainText(/allocation|exceeds|100%/i);
    });
    test('should validate date ranges', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await authenticatedPage.click('button:has-text("New Assignment")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await testDataHelpers.selectSpecificOption(
        'select[name="project_id"]',
        testData.projects[0].name
      );
      await testDataHelpers.selectSpecificOption(
        'select[name="person_id"]',
        testData.people[0].name
      );
      // Set end date before start date
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      await modal.locator('input[name="start_date"]').fill(today.toISOString().split('T')[0]);
      await modal.locator('input[name="end_date"]').fill(yesterday.toISOString().split('T')[0]);
      await modal.locator('button:has-text("Create")').click();
      // Should show validation error
      await expect(modal.locator('.error-message')).toContainText(/end.*before.*start/i);
    });
  });
  test.describe('Performance with Dynamic Data', () => {
    test('should handle multiple assignments efficiently', async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      // Create 10 assignments
      const assignments = [];
      for (let i = 0; i < 10; i++) {
        const assignment = await testDataHelpers.createTestAssignment(testContext, {
          project: testData.projects[i % 2],
          person: testData.people[i % 3],
          allocation: 10 + (i * 5)
        });
        assignments.push(assignment);
      }
      // Refresh page
      await authenticatedPage.reload();
      // Verify all assignments are displayed
      for (const assignment of assignments) {
        const personName = testData.people.find((p: any) => p.id === assignment.person_id)?.name;
        if (personName) {
          await testDataHelpers.waitForElementWithText('.assignment-card', personName, 5000);
        }
      }
      // Verify count
      const cardCount = await testDataHelpers.getSpecificElementCount('.assignment-card');
      expect(cardCount).toBe(10);
    });
  });
});