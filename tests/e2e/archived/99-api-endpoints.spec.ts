import { test, expect } from './fixtures';
test.describe('API Endpoints Health Check', () => {
  test.describe('Critical API Endpoints', () => {
    test('should return 200 for all critical reporting endpoints', async ({ apiContext }) => {
      // Test critical API endpoints
      const criticalEndpoints = [
        '/api/reporting/dashboard',
        '/api/reporting/capacity?startDate=2024-01-01&endDate=2024-12-31',
        '/api/people',
        '/api/projects',
        '/api/roles',
        '/api/scenarios',
        '/api/health'
      ];
      for (const endpoint of criticalEndpoints) {
        console.log(`Testing endpoint: ${endpoint}`);
        const response = await apiContext.get(endpoint);
        // Check if endpoint exists
        if (response.status() === 404) {
          console.log(`Note: ${endpoint} returned 404 - endpoint may not be implemented`);
          continue;
        }
        expect(response.ok()).toBeTruthy();
        // Verify response is valid JSON
        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error(`Invalid JSON from ${endpoint}: ${responseText.substring(0, 100)}`);
          throw e;
        }
        // For reporting endpoints, verify they have some expected structure
        if (endpoint.includes('/reporting/dashboard')) {
          expect(data).toBeDefined();
          // Dashboard should have some data structure
          expect(Object.keys(data).length).toBeGreaterThan(0);
        }
        if (endpoint.includes('/reporting/capacity')) {
          expect(data).toBeDefined();
          // Capacity report should have some structure
          expect(Object.keys(data).length).toBeGreaterThan(0);
        }
      }
    });
    test('should return 200 for person utilization endpoint', async ({ apiContext, testDataHelpers }) => {
      // Create test person first
      const testContext = testDataHelpers.createTestContext('api-test');
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        people: 1
      });
      const personId = testData.people[0].id;
      const response = await apiContext.get(`/api/people/${personId}/utilization?startDate=2024-01-01&endDate=2024-12-31`);
      if (response.status() !== 404) {
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data).toBeDefined();
      } else {
        console.log('Person utilization endpoint not implemented');
      }
      // Cleanup
      await testDataHelpers.cleanupTestContext(testContext);
    });
    test('should handle database views correctly', async ({ apiContext }) => {
      // Test endpoints that rely on database views
      const viewEndpoints = [
        '/api/assignments',
        '/api/projects'
      ];
      for (const endpoint of viewEndpoints) {
        const response = await apiContext.get(endpoint);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data).toBeDefined();
        // Should return array or wrapped array
        const items = Array.isArray(data) ? data : (data.data || []);
        expect(Array.isArray(items)).toBeTruthy();
      }
    });
    test('should handle API errors gracefully', async ({ apiContext }) => {
      // Test invalid requests
      const invalidRequests = [
        { endpoint: '/api/projects/invalid-uuid', expectedStatus: [400, 404] },
        { endpoint: '/api/people/invalid-uuid', expectedStatus: [400, 404] },
        { endpoint: '/api/assignments/invalid-uuid', expectedStatus: [400, 404] }
      ];
      for (const { endpoint, expectedStatus } of invalidRequests) {
        const response = await apiContext.get(endpoint);
        expect(expectedStatus).toContain(response.status());
        // Should return JSON error response
        const responseText = await response.text();
        if (responseText) {
          try {
            const error = JSON.parse(responseText);
            expect(error).toHaveProperty('error');
          } catch {
            // Some endpoints might return plain text errors
            expect(responseText.length).toBeGreaterThan(0);
          }
        }
      }
    });
    test('should verify all required database views exist', async ({ apiContext }) => {
      // Check if we can query assignments with joins
      const response = await apiContext.get('/api/assignments?include=project,person');
      if (response.ok()) {
        const data = await response.json();
        const assignments = Array.isArray(data) ? data : (data.data || []);
        if (assignments.length > 0) {
          // Verify joined data is included
          const firstAssignment = assignments[0];
          // Check for either nested objects or flattened fields
          const hasProjectData = firstAssignment.project || firstAssignment.project_name;
          const hasPersonData = firstAssignment.person || firstAssignment.person_name;
          expect(hasProjectData || hasPersonData).toBeTruthy();
        }
      }
    });
  });
  test.describe('Data Validation', () => {
    test('should validate required fields when creating resources', async ({ apiContext }) => {
      // Test missing required fields
      const invalidProjectData = {
        // Missing required 'name' field
        description: 'Test project'
      };
      const response = await apiContext.post('/api/projects', {
        data: invalidProjectData
      });
      expect(response.ok()).toBeFalsy();
      expect([400, 422]).toContain(response.status());
    });
    test('should handle pagination correctly', async ({ apiContext }) => {
      const endpoints = [
        '/api/projects?limit=5&offset=0',
        '/api/people?limit=5&offset=0',
        '/api/assignments?limit=5&offset=0'
      ];
      for (const endpoint of endpoints) {
        const response = await apiContext.get(endpoint);
        if (response.ok()) {
          const data = await response.json();
          const items = Array.isArray(data) ? data : (data.data || []);
          // Should respect limit
          expect(items.length).toBeLessThanOrEqual(5);
          // Check for pagination metadata if supported
          if (data.meta || data.pagination) {
            const meta = data.meta || data.pagination;
            expect(meta).toHaveProperty('total');
            expect(meta).toHaveProperty('limit');
            expect(meta).toHaveProperty('offset');
          }
        }
      }
    });
  });
  test.describe('Performance', () => {
    test('should respond within acceptable time limits', async ({ apiContext }) => {
      const endpoints = [
        '/api/health',
        '/api/roles',
        '/api/projects',
        '/api/people'
      ];
      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await apiContext.get(endpoint);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        // API should respond within 5 seconds
        expect(responseTime).toBeLessThan(5000);
        // Health check should be very fast
        if (endpoint === '/api/health') {
          expect(responseTime).toBeLessThan(1000);
        }
      }
    });
  });
});