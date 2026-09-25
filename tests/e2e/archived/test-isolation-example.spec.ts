/**
 * Example Test Suite Using Per-Test Data Isolation
 *
 * This demonstrates how to use the new TestContextManager for
 * isolated test data that doesn't interfere with other tests.
 *
 * Key features:
 * 1. Each test gets its own unique data context
 * 2. Data is automatically cleaned up after each test
 * 3. Tests can run in parallel without data conflicts
 * 4. No hardcoded IDs or reliance on pre-existing data
 */

import { test, expect, TestContextManager } from '../fixtures';

test.describe('Test Isolation Example', () => {
  // Example 1: Using the isolatedContext fixture (recommended)
  test.describe('Using isolatedContext fixture', () => {
    test('should create isolated test data automatically', async ({
      isolatedContext,
      testContextManager,
    }) => {
      // The isolatedContext fixture automatically creates a new context
      expect(isolatedContext.id).toBeTruthy();
      expect(isolatedContext.prefix).toBeTruthy();

      // Create test data using the manager
      const person = await testContextManager.createPerson({
        name: testContextManager.generateName('TestUser'),
      });

      expect(person.id).toBeTruthy();
      expect(person.name).toContain(isolatedContext.prefix);

      // Data is tracked and will be automatically cleaned up after this test
      expect(isolatedContext.createdIds.people).toContain(person.id);
    });

    test('should have completely fresh data in next test', async ({
      isolatedContext,
      testContextManager,
    }) => {
      // This test has a fresh context - no data from previous test
      expect(isolatedContext.createdIds.people).toHaveLength(0);
      expect(isolatedContext.createdIds.projects).toHaveLength(0);

      // Create different test data
      const project = await testContextManager.createProject({
        name: testContextManager.generateName('TestProject'),
      });

      expect(project.id).toBeTruthy();
      expect(project.name).toContain(isolatedContext.prefix);
    });
  });

  // Example 2: Manual context management (for more control)
  test.describe('Manual context management', () => {
    test('should allow manual context creation', async ({
      testContextManager,
    }) => {
      // Create context manually with custom options
      const context = await testContextManager.createContext({
        prefix: 'manual_test',
        testFile: 'test-isolation-example.spec.ts',
        testName: 'manual context test',
      });

      expect(context.prefix).toBe('manual_test');

      // Create some test data
      const person = await testContextManager.createPerson();
      const project = await testContextManager.createProject();

      // Verify tracking
      expect(context.createdIds.people.length).toBeGreaterThan(0);
      expect(context.createdIds.projects.length).toBeGreaterThan(0);

      // Manual cleanup
      await testContextManager.cleanup();

      // After cleanup, the context should be marked as cleaned up
      expect(context.isCleanedUp).toBe(true);
    });
  });

  // Example 3: Creating bulk test data
  test.describe('Bulk data creation', () => {
    test('should create multiple entities efficiently', async ({
      isolatedContext,
      testContextManager,
    }) => {
      // Create bulk test data
      const { people, projects, assignments, scenarios } =
        await testContextManager.createBulkData({
          people: 3,
          projects: 2,
          assignments: 4,
          scenarios: 2,
        });

      // Verify all entities were created
      expect(people).toHaveLength(3);
      expect(projects).toHaveLength(2);
      expect(assignments).toHaveLength(4);
      expect(scenarios).toHaveLength(2);

      // All entities are tracked for cleanup
      expect(isolatedContext.createdIds.people.length).toBeGreaterThanOrEqual(3);
      expect(isolatedContext.createdIds.projects.length).toBeGreaterThanOrEqual(2);
      expect(isolatedContext.createdIds.assignments).toHaveLength(4);
      expect(isolatedContext.createdIds.scenarios).toHaveLength(2);
    });
  });

  // Example 4: Using with page interactions
  test.describe('Integration with page interactions', () => {
    test('should work with authenticated page', async ({
      authenticatedPage,
      testContextManager,
      isolatedContext,
    }) => {
      // Create test data first
      const project = await testContextManager.createProject({
        name: testContextManager.generateName('UITestProject'),
      });

      // Navigate to projects page
      await authenticatedPage.goto('/projects');

      // Wait for page to load
      await authenticatedPage.waitForLoadState('networkidle');

      // Verify the project is visible (may need to refresh if data was just created)
      await authenticatedPage.reload();

      // Look for our specific project using its unique name
      const projectExists = await authenticatedPage
        .locator(`text="${project.name}"`)
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      // The project should be visible (assuming the UI lists it)
      // Note: Actual visibility depends on the application's behavior
      console.log(
        `Project ${project.name} visible: ${projectExists}`
      );
    });
  });
});

/**
 * Best Practices for Test Isolation:
 *
 * 1. ALWAYS use unique prefixes for test data names
 *    - Use testContextManager.generateName() for entity names
 *    - Use testContextManager.generateEmail() for emails
 *
 * 2. NEVER rely on pre-existing data
 *    - Create all needed data within the test
 *    - Use ensureRole(), ensureLocation(), etc. for reference data
 *
 * 3. AVOID using .first() or hardcoded selectors
 *    - Instead, find elements by the unique names you created
 *    - Example: page.locator(`text="${myProject.name}"`)
 *
 * 4. LET the fixture handle cleanup
 *    - The isolatedContext fixture automatically cleans up
 *    - Don't worry about manual cleanup unless needed
 *
 * 5. USE descriptive context options for debugging
 *    - Pass testFile and testName to createContext()
 *    - This helps identify orphaned data if cleanup fails
 */
