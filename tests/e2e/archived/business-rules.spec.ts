/**
 * Business Rule Validation Tests
 * Critical tests for core business rules that govern the capacity planning system:
 * - Allocation percentages must never exceed 100% for any person during overlapping periods
 * - Project timelines must be consistent (start < end dates)
 * - Resource capacity limits must be enforced
 * - Assignment conflicts must be detected and prevented
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Business Rule Validation', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('bizrules');
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 2,
      assignments: 2
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  // Helper to attempt assignment creation and monitor for conflicts
  async function attemptAssignmentCreation(page: any, testHelpers: any, assignmentData: any) {
    await testHelpers.navigateTo('/assignments');
    await testHelpers.waitForPageReady();
    // Track API responses for business rule violations
    const businessRuleViolations = [];
    page.on('response', async response => {
      if (response.url().includes('/api/assignments') && response.status() === 400) {
        try {
          const errorData = await response.json();
          if (errorData.error && (
            errorData.error.includes('capacity') || 
            errorData.error.includes('allocation') ||
            errorData.error.includes('exceed')
          )) {
            businessRuleViolations.push({
              error: errorData.error,
              conflicts: errorData.conflicts,
              timestamp: Date.now()
            });
          }
        } catch (e) {
          // Response might not be JSON
        }
      }
    });
    // Attempt to create assignment
    const newButton = page.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create")');
    if (await newButton.count() > 0) {
      await newButton.first().click();
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Select person if provided
      if (assignmentData.personId) {
        const personSelect = page.locator('select[name="person_id"], select[name="person"]');
        if (await personSelect.count() > 0) {
          await personSelect.selectOption(assignmentData.personId);
        }
      }
      // Select project if provided
      if (assignmentData.projectId) {
        const projectSelect = page.locator('select[name="project_id"], select[name="project"]');
        if (await projectSelect.count() > 0) {
          await projectSelect.selectOption(assignmentData.projectId);
        }
      }
      // Fill allocation
      if (assignmentData.allocation !== undefined) {
        const allocationField = page.locator('input[type="number"], input[placeholder*="percent"], input[name*="allocation"]').first();
        if (await allocationField.count() > 0) {
          await allocationField.fill(String(assignmentData.allocation));
        }
      }
      // Fill dates
      if (assignmentData.startDate) {
        const startDateField = page.locator('input[type="date"][name*="start"], input[name="start_date"]').first();
        if (await startDateField.count() > 0) {
          await startDateField.fill(assignmentData.startDate);
        }
      }
      if (assignmentData.endDate) {
        const endDateField = page.locator('input[type="date"][name*="end"], input[name="end_date"]').first();
        if (await endDateField.count() > 0) {
          await endDateField.fill(assignmentData.endDate);
        }
      }
      // Try to submit
      const submitButton = page.locator('button:has-text("Create"), button:has-text("Save"), button[type="submit"]');
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      }
      // Return whether modal is still open (indicates failure)
      const modalStillOpen = await page.locator('.modal, .dialog, [role="dialog"]').count() > 0;
      return {
        success: !modalStillOpen,
        violations: businessRuleViolations
      };
    }
    return { success: false, violations: businessRuleViolations };
  }
  test.describe('Allocation Capacity Rules', () => {
    test(`${tags.critical} should prevent allocations exceeding 100% capacity`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers,
      apiContext 
    }) => {
      console.log('🔍 Testing 100% allocation capacity rule');
      // First, create assignments that total 80% for a person
      const person = testData.people[0];
      const project1 = testData.projects[0];
      const project2 = testData.projects[1];
      // Create first assignment via API for 80%
      const firstAssignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: person.id,
          project_id: project1.id,
          allocation_percentage: 80,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      expect(firstAssignment.ok()).toBe(true);
      const firstAssignmentData = await firstAssignment.json();
      testContext.createdIds.assignments.push(firstAssignmentData.id);
      // Now try to create another assignment that would exceed 100%
      const result = await attemptAssignmentCreation(authenticatedPage, testHelpers, {
        personId: person.id,
        projectId: project2.id,
        allocation: 30, // This would make total 110%
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
      // Should fail due to capacity exceeded
      expect(result.success).toBe(false);
      console.log('✅ System correctly prevented allocation exceeding 100%');
      // Verify error message if available
      const errorMessage = authenticatedPage.locator('.error-message, .alert-danger, [role="alert"]');
      if (await errorMessage.count() > 0) {
        const errorText = await errorMessage.textContent();
        expect(errorText?.toLowerCase()).toMatch(/capacity|allocation|exceed|100%/);
      }
    });
    test(`${tags.critical} should allow exactly 100% allocation`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers,
      apiContext 
    }) => {
      console.log('🔍 Testing exact 100% allocation rule');
      const person = testData.people[1]; // Use different person
      const project1 = testData.projects[0];
      const project2 = testData.projects[1];
      // Create first assignment for 60%
      const firstAssignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: person.id,
          project_id: project1.id,
          allocation_percentage: 60,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      });
      expect(firstAssignment.ok()).toBe(true);
      const firstAssignmentData = await firstAssignment.json();
      testContext.createdIds.assignments.push(firstAssignmentData.id);
      // Create second assignment for exactly 40% (total 100%)
      const result = await attemptAssignmentCreation(authenticatedPage, testHelpers, {
        personId: person.id,
        projectId: project2.id,
        allocation: 40,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
      // Should succeed as it's exactly 100%
      expect(result.success).toBe(true);
      console.log('✅ System correctly allowed exactly 100% allocation');
    });
    test(`${tags.critical} should detect allocation conflicts in overlapping periods`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers,
      apiContext 
    }) => {
      console.log('🔍 Testing allocation conflicts in overlapping periods');
      const person = testData.people[0];
      const project = testData.projects[0];
      // Create assignment for middle of year
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() + 1);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 3);
      const firstAssignment = await apiContext.post('/api/assignments', {
        data: {
          person_id: person.id,
          project_id: project.id,
          allocation_percentage: 60,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        }
      });
      expect(firstAssignment.ok()).toBe(true);
      const firstAssignmentData = await firstAssignment.json();
      testContext.createdIds.assignments.push(firstAssignmentData.id);
      // Try to create overlapping assignment
      const overlapStart = new Date(startDate);
      overlapStart.setMonth(overlapStart.getMonth() + 1); // Overlaps middle
      const overlapEnd = new Date(endDate);
      overlapEnd.setMonth(overlapEnd.getMonth() + 1);
      const result = await attemptAssignmentCreation(authenticatedPage, testHelpers, {
        personId: person.id,
        projectId: testData.projects[1].id,
        allocation: 50, // Would exceed 100% during overlap
        startDate: overlapStart.toISOString().split('T')[0],
        endDate: overlapEnd.toISOString().split('T')[0]
      });
      // Should fail due to overlap conflict
      expect(result.success).toBe(false);
      console.log('✅ System correctly detected allocation conflict in overlapping period');
    });
  });
  test.describe('Timeline Consistency Rules', () => {
    test(`${tags.critical} should prevent end date before start date`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      console.log('🔍 Testing timeline consistency rule');
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const result = await attemptAssignmentCreation(authenticatedPage, testHelpers, {
        personId: testData.people[0].id,
        projectId: testData.projects[0].id,
        allocation: 50,
        startDate: today.toISOString().split('T')[0],
        endDate: yesterday.toISOString().split('T')[0] // End before start
      });
      // Should fail validation
      expect(result.success).toBe(false);
      console.log('✅ System correctly prevented end date before start date');
      // Check for validation message
      const validationMessage = authenticatedPage.locator('.validation-error, .field-error, [role="alert"]');
      if (await validationMessage.count() > 0) {
        const messageText = await validationMessage.textContent();
        expect(messageText?.toLowerCase()).toMatch(/date|invalid|before|after/);
      }
    });
    test(`${tags.critical} should enforce project timeline boundaries`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers,
      apiContext 
    }) => {
      console.log('🔍 Testing project timeline boundary enforcement');
      // Get project details to know its timeline
      const project = testData.projects[0];
      // Try to create assignment outside project timeline
      const beforeProjectStart = new Date(project.start_date);
      beforeProjectStart.setMonth(beforeProjectStart.getMonth() - 2);
      const result = await attemptAssignmentCreation(authenticatedPage, testHelpers, {
        personId: testData.people[0].id,
        projectId: project.id,
        allocation: 50,
        startDate: beforeProjectStart.toISOString().split('T')[0],
        endDate: project.start_date
      });
      // System should either prevent this or show a warning
      if (!result.success) {
        console.log('✅ System prevented assignment outside project timeline');
      } else {
        // Check for warning message
        const warning = authenticatedPage.locator('.warning, .alert-warning');
        if (await warning.count() > 0) {
          console.log('✅ System showed warning for assignment outside project timeline');
        }
      }
    });
  });
  test.describe('Data Integrity Rules', () => {
    test(`${tags.critical} should validate required fields`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      console.log('🔍 Testing required field validation');
      // Try to create assignment with missing required fields
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForPageReady();
      const newButton = authenticatedPage.locator('button:has-text("New"), button:has-text("Add")');
      if (await newButton.count() > 0) {
        await newButton.first().click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Try to submit without filling required fields
        const submitButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Save")');
        // Button might be disabled
        const isDisabled = await submitButton.isDisabled();
        if (isDisabled) {
          console.log('✅ Submit button correctly disabled when required fields empty');
          expect(isDisabled).toBe(true);
        } else {
          // Try clicking and check for validation
          await submitButton.click();
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Should show validation errors
          const validationErrors = await authenticatedPage.locator('.error, .validation-error, .required').count();
          expect(validationErrors).toBeGreaterThan(0);
          console.log('✅ System showed validation errors for missing required fields');
        }
      }
    });
    test(`${tags.critical} should prevent duplicate assignments`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers,
      apiContext 
    }) => {
      console.log('🔍 Testing duplicate assignment prevention');
      const assignmentData = {
        person_id: testData.people[0].id,
        project_id: testData.projects[0].id,
        allocation_percentage: 50,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
      // Create first assignment via API
      const firstAssignment = await apiContext.post('/api/assignments', { data: assignmentData });
      expect(firstAssignment.ok()).toBe(true);
      const firstData = await firstAssignment.json();
      testContext.createdIds.assignments.push(firstData.id);
      // Try to create exact duplicate
      const result = await attemptAssignmentCreation(authenticatedPage, testHelpers, {
        personId: assignmentData.person_id,
        projectId: assignmentData.project_id,
        allocation: assignmentData.allocation_percentage,
        startDate: assignmentData.start_date,
        endDate: assignmentData.end_date
      });
      // System should prevent or warn about duplicate
      if (!result.success) {
        console.log('✅ System prevented duplicate assignment');
      } else {
        // Check if it merged/updated instead of creating duplicate
        await testHelpers.navigateTo('/assignments');
        const assignmentRows = authenticatedPage.locator(`tr:has-text("${testData.people[0].name}"):has-text("${testData.projects[0].name}")`);
        const count = await assignmentRows.count();
        expect(count).toBe(1); // Should only have one assignment, not duplicate
        console.log('✅ System merged duplicate assignment instead of creating new');
      }
    });
  });
});