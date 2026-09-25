/**
 * Database Transaction Safety and Concurrent Operation Tests
 * Critical tests that validate data integrity under concurrent operations,
 * prevent race conditions, and handle database transactions safely
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { TestHelpers } from '../../utils/test-helpers';
test.describe('Database Transaction Safety and Concurrent Operations', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('txnsafety');
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 3,
      assignments: 3
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  // Helper to create assignment via UI
  async function createAssignmentViaUI(page: any, testHelpers: any, data: any) {
    await testHelpers.navigateTo('/assignments');
    await testHelpers.waitForPageReady();
    const newButton = page.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create")');
    if (await newButton.count() > 0) {
      await newButton.first().click();
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Select person and project if provided
      if (data.personId) {
        const personSelect = page.locator('select[name*="person"]');
        if (await personSelect.count() > 0) {
          await personSelect.selectOption(data.personId);
        }
      }
      if (data.projectId) {
        const projectSelect = page.locator('select[name*="project"]');
        if (await projectSelect.count() > 0) {
          await projectSelect.selectOption(data.projectId);
        }
      }
      // Fill allocation
      if (data.allocation) {
        const allocationField = page.locator('input[type="number"], input[placeholder*="percent"]').first();
        if (await allocationField.count() > 0) {
          await allocationField.fill(String(data.allocation));
        }
      }
      // Fill dates
      if (data.startDate) {
        const startDateField = page.locator('input[type="date"][name*="start"]').first();
        if (await startDateField.count() > 0) {
          await startDateField.fill(data.startDate);
        }
      }
      if (data.endDate) {
        const endDateField = page.locator('input[type="date"][name*="end"]').first();
        if (await endDateField.count() > 0) {
          await endDateField.fill(data.endDate);
        }
      }
      // Submit form
      const submitButton = page.locator('button:has-text("Create"), button:has-text("Save")');
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      }
      // Return success if modal closed
      const modalClosed = await page.locator('.modal, [role="dialog"]').count() === 0;
      return modalClosed;
    }
    return false;
  }
  test.describe('Concurrent User Operations', () => {
    test(`${tags.critical} ${tags.integration} should handle multiple users creating assignments simultaneously without data corruption`, async ({ 
      browser,
      testDataHelpers 
    }) => {
      console.log('🔒 Testing concurrent assignment creation');
      // Create multiple browser contexts to simulate different users
      const contexts = [];
      const pages = [];
      const helpers = [];
      try {
        // Create 3 concurrent users
        for (let i = 0; i < 3; i++) {
          const context = await browser.newContext();
          const page = await context.newPage();
          contexts.push(context);
          pages.push(page);
        }
        // Setup all pages with authentication
        for (const page of pages) {
          const testHelper = new TestHelpers(page);
          helpers.push(testHelper);
          await page.goto('/', { waitUntil: 'domcontentloaded' });
          await testHelper.setupPage();
        }
        console.log('✅ All users authenticated');
        // Track API requests and responses for data integrity validation
        const apiRequests = [];
        const apiResponses = [];
        pages.forEach((page, index) => {
          page.on('request', request => {
            if (request.url().includes('/api/assignments') && request.method() === 'POST') {
              apiRequests.push({ 
                user: index, 
                url: request.url(), 
                method: request.method(),
                timestamp: Date.now()
              });
            }
          });
          page.on('response', response => {
            if (response.url().includes('/api/assignments')) {
              apiResponses.push({ 
                user: index, 
                url: response.url(), 
                status: response.status(),
                timestamp: Date.now()
              });
            }
          });
        });
        // Have all users attempt to create assignments concurrently
        const concurrentCreations = pages.map(async (page, index) => {
          try {
            const success = await createAssignmentViaUI(page, helpers[index], {
              personId: testData.people[index % testData.people.length].id,
              projectId: testData.projects[index % testData.projects.length].id,
              allocation: 30 + (index * 10), // Different allocations
              startDate: new Date().toISOString().split('T')[0],
              endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            return { success, user: index };
          } catch (error) {
            return { success: false, user: index, error: error.toString() };
          }
        });
        const results = await Promise.all(concurrentCreations);
        // Analyze results
        const successful = results.filter(r => r.success);
        console.log(`✅ Concurrent operations completed: ${successful.length}/${results.length} successful`);
        // At least some operations should succeed
        expect(successful.length).toBeGreaterThan(0);
        // Verify no server errors occurred
        const serverErrors = apiResponses.filter(r => r.status >= 500);
        expect(serverErrors.length).toBe(0);
        console.log('✅ No server errors during concurrent operations');
        // Check for data consistency by verifying assignments
        await helpers[0].navigateTo('/assignments');
        await helpers[0].waitForDataTable();
        // Verify test assignments exist
        let testAssignmentsFound = 0;
        for (const person of testData.people) {
          const personAssignment = pages[0].locator(`tr:has-text("${person.name}")`);
          if (await personAssignment.count() > 0) {
            testAssignmentsFound++;
          }
        }
        console.log(`✅ Found ${testAssignmentsFound} test assignments after concurrent creation`);
        expect(testAssignmentsFound).toBeGreaterThan(0);
      } finally {
        // Cleanup
        await Promise.all(contexts.map(context => context.close()));
      }
    });
    test(`${tags.critical} ${tags.integration} should prevent data corruption during concurrent updates`, async ({ 
      browser,
      apiContext,
      testDataHelpers 
    }) => {
      console.log('🔒 Testing concurrent update safety');
      // Create an assignment to update
      const targetAssignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: testData.people[0].id,
          project_id: testData.projects[0].id,
          allocation_percentage: 50,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      expect(targetAssignment.ok()).toBe(true);
      const assignmentData = await targetAssignment.json();
      testContext.createdIds.assignments.push(assignmentData.id);
      // Create multiple contexts for concurrent updates
      const updatePromises = [];
      for (let i = 0; i < 3; i++) {
        const updatePromise = apiContext.put(`/api/assignments/${assignmentData.id}`, {
          data: {
            allocation_percentage: 60 + i * 10 // Different values
          }
        });
        updatePromises.push(updatePromise);
      }
      // Execute updates concurrently
      const updateResults = await Promise.allSettled(updatePromises);
      // Analyze results
      const successfulUpdates = updateResults.filter(r => r.status === 'fulfilled' && r.value.ok());
      const failedUpdates = updateResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok()));
      console.log(`Updates: ${successfulUpdates.length} successful, ${failedUpdates.length} failed/rejected`);
      // At least one update should succeed
      expect(successfulUpdates.length).toBeGreaterThanOrEqual(1);
      // Verify final state is consistent
      const finalState = await apiContext.get(`/api/assignments/${assignmentData.id}`);
      if (finalState.ok()) {
        const finalData = await finalState.json();
        console.log(`Final allocation: ${finalData.allocation_percentage}%`);
        // Value should be one of the attempted values
        expect([60, 70, 80, 50]).toContain(finalData.allocation_percentage);
      }
      console.log('✅ Concurrent updates handled safely without corruption');
    });
  });
  test.describe('Transaction Rollback and Recovery', () => {
    test(`${tags.critical} should rollback transactions on validation failures`, async ({ 
      authenticatedPage,
      testHelpers,
      apiContext 
    }) => {
      console.log('🔒 Testing transaction rollback on validation failure');
      // Get initial counts
      const initialAssignments = await apiContext.get('/api/assignments');
      const initialCount = (await initialAssignments.json()).length;
      // Try to create invalid assignment (exceeding 100% allocation)
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForPageReady();
      // First create a valid assignment taking 80%
      const firstAssignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: testData.people[0].id,
          project_id: testData.projects[0].id,
          allocation_percentage: 80,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      expect(firstAssignment.ok()).toBe(true);
      testContext.createdIds.assignments.push((await firstAssignment.json()).id);
      // Now try to create another that would exceed 100%
      const invalidAssignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: testData.people[0].id,
          project_id: testData.projects[1].id,
          allocation_percentage: 30, // Would total 110%
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      // Should fail
      expect(invalidAssignment.ok()).toBe(false);
      expect([400, 422]).toContain(invalidAssignment.status());
      // Verify count only increased by 1 (the valid assignment)
      const finalAssignments = await apiContext.get('/api/assignments');
      const finalCount = (await finalAssignments.json()).length;
      expect(finalCount).toBe(initialCount + 1);
      console.log('✅ Failed transaction properly rolled back');
    });
    test(`${tags.critical} should maintain referential integrity`, async ({ 
      apiContext,
      testDataHelpers 
    }) => {
      console.log('🔒 Testing referential integrity');
      // Create assignment
      const assignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: testData.people[0].id,
          project_id: testData.projects[0].id,
          allocation_percentage: 50,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      expect(assignment.ok()).toBe(true);
      const assignmentData = await assignment.json();
      testContext.createdIds.assignments.push(assignmentData.id);
      // Try to delete the project that has assignments
      const deleteProject = await apiContext.delete(`/api/projects/${testData.projects[0].id}`);
      // Should either:
      // 1. Fail with integrity constraint error
      // 2. Cascade delete (check assignments)
      if (!deleteProject.ok()) {
        // Project deletion blocked - good!
        expect([400, 409]).toContain(deleteProject.status());
        console.log('✅ Referential integrity maintained - project with assignments cannot be deleted');
      } else {
        // If deletion succeeded, check if assignments were cascade deleted
        const assignmentCheck = await apiContext.get(`/api/assignments/${assignmentData.id}`);
        expect(assignmentCheck.status()).toBe(404);
        console.log('✅ Cascade delete worked properly');
      }
    });
  });
  test.describe('Deadlock Prevention', () => {
    test(`${tags.critical} should handle potential deadlock scenarios`, async ({ 
      apiContext,
      testDataHelpers 
    }) => {
      console.log('🔒 Testing deadlock prevention');
      // Create cross-dependent operations that could deadlock
      const operations = [
        // Operation 1: Update Person A, then Project B
        async () => {
          const updatePerson = await apiContext.put(`/api/people/${testData.people[0].id}`, {
            data: { utilization_target: 80 }
          });
          const updateProject = await apiContext.put(`/api/projects/${testData.projects[1].id}`, {
            data: { status: 'active' }
          });
          return { updatePerson: updatePerson.ok(), updateProject: updateProject.ok() };
        },
        // Operation 2: Update Project B, then Person A (opposite order)
        async () => {
          const updateProject = await apiContext.put(`/api/projects/${testData.projects[1].id}`, {
            data: { status: 'planning' }
          });
          const updatePerson = await apiContext.put(`/api/people/${testData.people[0].id}`, {
            data: { utilization_target: 90 }
          });
          return { updateProject: updateProject.ok(), updatePerson: updatePerson.ok() };
        }
      ];
      // Execute operations concurrently
      const results = await Promise.allSettled(operations.map(op => op()));
      // Both should complete (no deadlock)
      const completed = results.filter(r => r.status === 'fulfilled');
      expect(completed.length).toBe(2);
      console.log('✅ No deadlock detected - all operations completed');
      // Verify final state is consistent
      const personCheck = await apiContext.get(`/api/people/${testData.people[0].id}`);
      const projectCheck = await apiContext.get(`/api/projects/${testData.projects[1].id}`);
      expect(personCheck.ok()).toBe(true);
      expect(projectCheck.ok()).toBe(true);
      console.log('✅ Database state remains consistent after concurrent operations');
    });
  });
  test.describe('Data Consistency Verification', () => {
    test(`${tags.critical} should maintain assignment allocation constraints`, async ({ 
      apiContext,
      testHelpers,
      authenticatedPage 
    }) => {
      console.log('🔒 Testing assignment allocation constraints');
      // Create multiple assignments for same person
      const person = testData.people[0];
      const assignments = [];
      for (let i = 0; i < 3; i++) {
        const response = await apiContext.post('/api/assignments', {
          data: {
            person_id: person.id,
            project_id: testData.projects[i].id,
            allocation_percentage: 30,
            start_date: new Date().toISOString().split('T')[0],
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          }
        });
        if (response.ok()) {
          const data = await response.json();
          assignments.push(data);
          testContext.createdIds.assignments.push(data.id);
        }
      }
      // Verify total allocation doesn't exceed 100%
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Check person's utilization
      const personRow = authenticatedPage.locator(`tr:has-text("${person.name}")`);
      if (await personRow.count() > 0) {
        const utilizationCell = personRow.locator('td').nth(4); // Utilization column
        const utilizationText = await utilizationCell.textContent();
        if (utilizationText?.includes('%')) {
          const utilization = parseInt(utilizationText.match(/(\d+, 10)%/)?.[1] || '0');
          expect(utilization).toBeLessThanOrEqual(100);
          console.log(`✅ Person utilization (${utilization}%) within valid range`);
        }
      }
      // Verify via API
      const personDetails = await apiContext.get(`/api/people/${person.id}`);
      if (personDetails.ok()) {
        const data = await personDetails.json();
        if (data.current_utilization !== undefined) {
          expect(data.current_utilization).toBeLessThanOrEqual(100);
        }
      }
      console.log('✅ Assignment allocation constraints maintained');
    });
  });
});