/**
 * Assignment API Contract Tests
 * Validates API responses for proper JSON serialization and structure
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Assignment API Contract Tests', () => {
  let testContext: TestDataContext;
  let testData: any;
  let roles: any[] = [];
  test.beforeEach(async ({ testDataHelpers, apiContext }) => {
    // Create test context and data for each test
    testContext = testDataHelpers.createTestContext('apicontract');
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 1,
      people: 1,
      assignments: 0 // We'll create assignments in the tests
    });
    // Fetch available roles
    const rolesResponse = await apiContext.get('/api/roles');
    const rolesData = await rolesResponse.json();
    roles = rolesData.data || rolesData || [];
    testData.roles = roles;
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Serialization Validation', () => {
    test(`${tags.api} return valid JSON for assignment creation`, async ({ apiContext }) => {
      // Ensure we have test data
      if (!testData.projects.length || !testData.people.length || !testData.roles.length) {
        throw new Error('Test data not properly initialized');
      }
      // Test direct API call to assignment creation endpoint
      const validAssignmentData = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: testData.roles[0].id,
        allocation_percentage: 30,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignment_date_mode: 'fixed'
      };
      const response = await apiContext.post('/api/assignments', {
        data: validAssignmentData
      });
      // This call will fail if there's a circular reference in the JSON response
      const responseBody = await response.json();
      // Verify response structure
      expect(response.ok()).toBeTruthy();
      // Assignment API returns the object directly, not nested in 'data'
      const assignment = responseBody.data || responseBody; // envelope: {success, data} since the API信封迁移
      // Verify the response data matches what we sent
      expect(assignment.project_id).toBe(validAssignmentData.project_id);
      expect(assignment.person_id).toBe(validAssignmentData.person_id);
      expect(assignment.role_id).toBe(validAssignmentData.role_id);
      expect(assignment.allocation_percentage).toBe(validAssignmentData.allocation_percentage);
      expect(assignment.start_date).toBe(validAssignmentData.start_date);
      expect(assignment.end_date).toBe(validAssignmentData.end_date);
      // Verify ID is returned
      expect(assignment.id).toBeTruthy();
      // Cleanup - delete the created assignment if it has an ID
      // Note: The assignment ID might be returned as null in the creation response
      // We'll skip cleanup in that case as the test teardown will handle it
    });
    test(`${tags.api} return valid JSON for assignment deletion`, async ({ apiContext }) => {
      // Ensure we have test data
      if (!testData.projects.length || !testData.people.length || !testData.roles.length) {
        throw new Error('Test data not properly initialized');
      }
      // First create an assignment to delete
      const assignmentData = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: testData.roles[0].id,
        allocation_percentage: 25,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignment_date_mode: 'fixed'
      };
      const createResponse = await apiContext.post('/api/assignments', {
        data: assignmentData
      });
      const createResponseBody = await createResponse.json();
      expect(createResponse.ok()).toBeTruthy();
      const createdAssignment = createResponseBody.data || createResponseBody; // envelope: {success, data} since the API信封迁移
      // Now test deletion
      const deleteResponse = await apiContext.delete(`/api/assignments/${createdAssignment.id}`);
      // This call will fail if there's a circular reference in the JSON response  
      const deleteResponseBody = await deleteResponse.json();
      expect(deleteResponse.ok()).toBeTruthy();
      // Delete might return empty response or a message
      if (deleteResponseBody && typeof deleteResponseBody === 'object' && deleteResponseBody.message) {
        expect(deleteResponseBody.message.toLowerCase()).toContain('delete');
      }
    });
    test(`${tags.api} handle complex assignment objects without circular references`, async ({ 
      apiContext 
    }) => {
      // Ensure we have test data
      if (!testData.projects.length || !testData.people.length || !testData.roles.length) {
        throw new Error('Test data not properly initialized');
      }
      // Test with assignment that triggers all related joins and computed fields
      const complexAssignmentData = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: testData.roles[0].id,
        allocation_percentage: 50,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignment_date_mode: 'fixed',
        notes: 'Complex assignment with full data relationships'
      };
      const response = await apiContext.post('/api/assignments', {
        data: complexAssignmentData
      });
      // This should parse successfully despite complex object relationships
      const responseBody = await response.json();
      expect(response.ok()).toBeTruthy();
      const assignment = responseBody.data || responseBody; // envelope: {success, data} since the API信封迁移
      // Verify computed dates are present
      expect(assignment).toHaveProperty('computed_start_date');
      expect(assignment).toHaveProperty('computed_end_date');
      expect(assignment).toHaveProperty('created_at');
      expect(assignment).toHaveProperty('updated_at');
      // Cleanup if ID exists (might be null in response)
      // Test teardown will handle cleanup if needed
    });
    test(`${tags.api} validate assignment responses contain no circular references`, async ({ 
      apiContext 
    }) => {
      // Ensure we have test data
      if (!testData.projects.length || !testData.people.length || !testData.roles.length) {
        throw new Error('Test data not properly initialized');
      }
      const testAssignment = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: testData.roles[0].id,
        allocation_percentage: 40,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignment_date_mode: 'fixed'
      };
      const createResponse = await apiContext.post('/api/assignments', {
        data: testAssignment
      });
      // Test that JSON.stringify doesn't throw circular reference error
      const responseBody = await createResponse.json();
      expect(() => {
        JSON.stringify(responseBody);
      }).not.toThrow();
      expect(() => {
        JSON.parse(JSON.stringify(responseBody));
      }).not.toThrow();
      console.log('✅ Assignment response successfully round-tripped through JSON.stringify/parse');
      // Cleanup
      if (responseBody?.id) {
        await apiContext.delete(`/api/assignments/${responseBody.id}`);
      }
    });
  });
  test.describe('Error Response Validation', () => {
    test(`${tags.api} handle assignment creation errors gracefully`, async ({ apiContext }) => {
      // Test with invalid data that should trigger an error response
      const invalidAssignmentData = {
        project_id: 'invalid-project-id',
        person_id: 'invalid-person-id', 
        role_id: 'invalid-role-id',
        allocation_percentage: 150, // Invalid percentage
        start_date: 'invalid-date',
        end_date: 'invalid-date'
      };
      const response = await apiContext.post('/api/assignments', {
        data: invalidAssignmentData
      });
      // Should return error but still be valid JSON
      expect(response.status()).toBeGreaterThanOrEqual(400);
      // Error response should still be parseable JSON without circular refs
      let errorResponseBody;
      // Should not throw
      errorResponseBody = await response.json();
      expect(errorResponseBody).toHaveProperty('error');
      console.log('✅ Error response successfully parsed as JSON');
      // Verify we can stringify the error response
      expect(() => {
        JSON.stringify(errorResponseBody);
      }).not.toThrow();
    });
    test(`${tags.api} handle invalid date ranges`, async ({ apiContext }) => {
      // Ensure we have test data
      if (!testData.projects.length || !testData.people.length || !testData.roles.length) {
        throw new Error('Test data not properly initialized');
      }
      const invalidDateAssignment = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: testData.roles[0].id,
        allocation_percentage: 50,
        start_date: '2024-01-01',
        end_date: '2023-12-31', // End before start
        assignment_date_mode: 'fixed'
      };
      const response = await apiContext.post('/api/assignments', {
        data: invalidDateAssignment
      });
      expect(response.status()).toBeGreaterThanOrEqual(400);
      const errorResponse = await response.json();
      expect(errorResponse).toHaveProperty('error');
      // Verify no circular references
      expect(() => JSON.stringify(errorResponse)).not.toThrow();
    });
  });
  test.describe('Batch Operation Validation', () => {
    test(`${tags.api} handle bulk assignment operations`, async ({ apiContext }) => {
      // Ensure we have test data
      if (!testData.people.length) {
        throw new Error('Test data not properly initialized');
      }
      // List assignments filtered by person (the per-person nested route
      // /api/people/:id/assignments no longer exists; the list endpoint
      // takes a person_id filter and returns {success, data})
      const personId = testData.people[0].id;
      const response = await apiContext.get(`/api/assignments?person_id=${personId}`);
      expect(response.ok()).toBeTruthy();
      const responseBody = await response.json();
      const assignments = responseBody.data || responseBody;
      expect(Array.isArray(assignments)).toBeTruthy();
      // Verify no circular references in array response
      expect(() => JSON.stringify(assignments)).not.toThrow();
      // If assignments exist, verify their structure
      if (assignments.length > 0) {
        const firstAssignment = assignments[0];
        expect(firstAssignment).toHaveProperty('id');
        expect(firstAssignment).toHaveProperty('project_id');
        expect(firstAssignment).toHaveProperty('person_id');
        expect(firstAssignment).toHaveProperty('allocation_percentage');
      }
    });
  });
  test.describe('Update Operation Validation', () => {
    test(`${tags.api} handle assignment updates without circular references`, async ({ 
      apiContext 
    }) => {
      // Ensure we have test data
      if (!testData.projects.length || !testData.people.length || !testData.roles.length) {
        throw new Error('Test data not properly initialized');
      }
      // Create an assignment first
      const assignmentData = {
        project_id: testData.projects[0].id,
        person_id: testData.people[0].id,
        role_id: testData.roles[0].id,
        allocation_percentage: 30,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        assignment_date_mode: 'fixed'
      };
      const createResponse = await apiContext.post('/api/assignments', {
        data: assignmentData
      });
      const createBody = await createResponse.json();
      const createdAssignment = createBody.data || createBody; // envelope: {success, data}
      // Update the assignment
      const updateData = {
        allocation_percentage: 75,
        notes: 'Updated via API contract test'
      };
      const updateResponse = await apiContext.put(`/api/assignments/${createdAssignment.id}`, {
        data: updateData
      });
      expect(updateResponse.ok()).toBeTruthy();
      const updateBody = await updateResponse.json();
      const updatedAssignment = updateBody.data || updateBody;
      // Verify no circular references
      expect(() => JSON.stringify(updatedAssignment)).not.toThrow();
      // Verify update was applied
      expect(updatedAssignment.allocation_percentage).toBe(75);
      expect(updatedAssignment.notes).toBe('Updated via API contract test');
      // Cleanup if we have a valid ID
      if (createdAssignment.id) {
        await apiContext.delete(`/api/assignments/${createdAssignment.id}`);
      }
    });
  });
});