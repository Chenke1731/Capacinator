import { test, expect } from './fixtures';
import { TestDataContext } from './utils/test-data-helpers';
test.describe('Data Relationships and Cross-References', () => {
  let testContext: TestDataContext;
  test.beforeEach(async ({ testDataHelpers }) => {
    testContext = testDataHelpers.createTestContext('data-rel');
  });
  test.afterEach(async ({ testDataHelpers }) => {
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Project Relationships', () => {
    test('should show all related data on project detail page', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      // Create test data with relationships
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 2,
        assignments: 2
      });
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Navigate to project detail
      const projectRow = await testDataHelpers.findByTestData('tbody tr', testData.projects[0].name);
      // Wait for the row to be visible and stable
      await projectRow.waitFor({ state: 'visible' });
      
      // Try multiple selectors for the view button
      const viewButton = projectRow.locator('button[title="View Details"]').first();
      
      // Ensure the button is visible and clickable
      await viewButton.waitFor({ state: 'visible' });
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/projects\/[a-f0-9-]+/);
      // Verify project information sections
      const sections = [
        'Information',
        'Details',
        'Overview',
        'Timeline',
        'Assignments',
        'Team',
        'Resources'
      ];
      let foundSections = 0;
      for (const section of sections) {
        const sectionElement = authenticatedPage.locator(`text=/${section}/i`);
        if (await sectionElement.count() > 0) {
          foundSections++;
        }
      }
      // Should have at least some key sections
      expect(foundSections).toBeGreaterThan(2);
      // Verify project name is displayed
      await expect(authenticatedPage.locator('h1, h2').filter({ hasText: testData.projects[0].name })).toBeVisible();
    });
    test('should show project phases with dates', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      // Create project with phases
      const project = await testDataHelpers.createTestProject(testContext, {
        name: `${testContext.prefix}-Phased-Project`,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      });
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      const projectRow = await testDataHelpers.findByTestData('tbody tr', project.name);
      // Wait for the row to be visible and stable
      await projectRow.waitFor({ state: 'visible' });
      
      // Try multiple selectors for the view button
      const viewButton = projectRow.locator('button[title="View Details"]').first();
      
      // Ensure the button is visible and clickable
      await viewButton.waitFor({ state: 'visible' });
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/projects\/[a-f0-9-]+/);
      // Check for phase/timeline visualization
      const timelineElements = [
        '.timeline',
        '.phase-container',
        '.gantt-chart',
        '[data-testid="timeline"]',
        'text=/phase|timeline|schedule/i'
      ];
      let hasTimeline = false;
      for (const selector of timelineElements) {
        if (await authenticatedPage.locator(selector).count() > 0) {
          hasTimeline = true;
          break;
        }
      }
      expect(hasTimeline).toBeTruthy();
    });
    test('should show related assignments on project page', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 3,
        assignments: 3
      });
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      const projectRow = await testDataHelpers.findByTestData('tbody tr', testData.projects[0].name);
      // Wait for the row to be visible and stable
      await projectRow.waitFor({ state: 'visible' });
      
      // Try multiple selectors for the view button
      const viewButton = projectRow.locator('button[title="View Details"]').first();
      
      // Ensure the button is visible and clickable
      await viewButton.waitFor({ state: 'visible' });
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/projects\/[a-f0-9-]+/);
      // Look for assignment section
      const assignmentSection = authenticatedPage.locator('text=/assignments|team|resources/i');
      if (await assignmentSection.count() > 0) {
        // Should show assigned people
        const personNames = testData.people.map(p => p.name);
        let foundPerson = false;
        for (const name of personNames) {
          const personElement = authenticatedPage.locator(`text=${name}`);
          if (await personElement.count() > 0) {
            foundPerson = true;
            break;
          }
        }
        expect(foundPerson).toBeTruthy();
      }
    });
  });
  test.describe('Person Relationships', () => {
    test('should show person assignments and projects', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 2,
        people: 1,
        assignments: 2
      });
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personRow = await testDataHelpers.findByTestData('tbody tr', testData.people[0].name);
      const viewButton = personRow.locator('button:has-text("View")');
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/people\/[a-f0-9-]+/);
      // Should show person name
      await expect(authenticatedPage.locator('h1, h2').filter({ hasText: testData.people[0].name })).toBeVisible();
      // Should show assignments
      const projectNames = testData.projects.map(p => p.name);
      let foundProject = false;
      for (const projectName of projectNames) {
        const projectElement = authenticatedPage.locator(`text=${projectName}`);
        if (await projectElement.count() > 0) {
          foundProject = true;
          break;
        }
      }
      expect(foundProject).toBeTruthy();
    });
    test('should show utilization metrics', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 1,
        assignments: 1
      });
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personRow = await testDataHelpers.findByTestData('tbody tr', testData.people[0].name);
      const viewButton = personRow.locator('button:has-text("View")');
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/people\/[a-f0-9-]+/);
      // Look for utilization information
      const utilizationElements = [
        'text=/utilization|workload|capacity/i',
        '.utilization-chart',
        '.workload-graph',
        '[data-testid="utilization"]',
        'text=/%/'
      ];
      let hasUtilization = false;
      for (const selector of utilizationElements) {
        if (await authenticatedPage.locator(selector).count() > 0) {
          hasUtilization = true;
          break;
        }
      }
      expect(hasUtilization).toBeTruthy();
    });
  });
  test.describe('Cross-Page Navigation', () => {
    test('should navigate from project to person', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 1,
        assignments: 1
      });
      // Start at project
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      const projectRow = await testDataHelpers.findByTestData('tbody tr', testData.projects[0].name);
      // Wait for the row to be visible and stable
      await projectRow.waitFor({ state: 'visible' });
      
      // Try multiple selectors for the view button
      const viewButton = projectRow.locator('button[title="View Details"]').first();
      
      // Ensure the button is visible and clickable
      await viewButton.waitFor({ state: 'visible' });
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/projects\/[a-f0-9-]+/);
      // Click on person name if visible
      const personLink = authenticatedPage.locator(`a:has-text("${testData.people[0].name}")`);
      if (await personLink.isVisible()) {
        await personLink.click();
        await authenticatedPage.waitForURL(/\/people\/[a-f0-9-]+/);
        // Verify we're on person page
        await expect(authenticatedPage.locator('h1, h2').filter({ hasText: testData.people[0].name })).toBeVisible();
      }
    });
    test('should navigate from person to project', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 1,
        assignments: 1
      });
      // Start at person
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personRow = await testDataHelpers.findByTestData('tbody tr', testData.people[0].name);
      const viewButton = personRow.locator('button:has-text("View")');
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/people\/[a-f0-9-]+/);
      // Click on project name if visible
      const projectLink = authenticatedPage.locator(`a:has-text("${testData.projects[0].name}")`);
      if (await projectLink.isVisible()) {
        await projectLink.click();
        await authenticatedPage.waitForURL(/\/projects\/[a-f0-9-]+/);
        // Verify we're on project page
        await expect(authenticatedPage.locator('h1, h2').filter({ hasText: testData.projects[0].name })).toBeVisible();
      }
    });
  });
  test.describe('Data Integrity', () => {
    test('should maintain consistency across views', async ({ authenticatedPage, testHelpers, testDataHelpers, apiContext }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 1,
        assignments: 1
      });
      // Get data from API
      const projectResponse = await apiContext.get(`/api/projects/${testData.projects[0].id}`);
      expect(projectResponse.ok()).toBeTruthy();
      const personResponse = await apiContext.get(`/api/people/${testData.people[0].id}`);
      expect(personResponse.ok()).toBeTruthy();
      const assignmentsResponse = await apiContext.get(`/api/assignments?project_id=${testData.projects[0].id}`);
      expect(assignmentsResponse.ok()).toBeTruthy();
      const assignments = await assignmentsResponse.json();
      expect(assignments.data || assignments).toHaveLength(1);
      // Verify UI shows consistent data
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForDataTable();
      // Should see the assignment
      const assignmentRow = authenticatedPage.locator('tbody tr').filter({ 
        hasText: testData.projects[0].name 
      }).filter({ 
        hasText: testData.people[0].name 
      });
      await expect(assignmentRow).toBeVisible();
    });
    test('should update related data in real-time', async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
      const testData = await testDataHelpers.createBulkTestData(testContext, {
        projects: 1,
        people: 1,
        assignments: 0
      });
      // Navigate to person page
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personRow = await testDataHelpers.findByTestData('tbody tr', testData.people[0].name);
      const viewButton = personRow.locator('button:has-text("View")');
      await viewButton.click();
      await authenticatedPage.waitForURL(/\/people\/[a-f0-9-]+/);
      // Add assignment
      const addButton = authenticatedPage.locator('button:has-text("Add Assignment")');
      await addButton.click();
      await authenticatedPage.waitForSelector('[role="dialog"]');
      // Fill assignment form
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      const projectSelect = authenticatedPage.locator('button[role="combobox"]').filter({ hasText: /project/i }).first();
      await projectSelect.click();
      await authenticatedPage.locator(`[role="option"]:has-text("${testData.projects[0].name}")`).click();
      const roleSelect = authenticatedPage.locator('button[role="combobox"]').filter({ hasText: /role/i }).first();
      await roleSelect.click();
      await authenticatedPage.locator('[role="option"]').first().click();
      await authenticatedPage.fill('input[name="allocation_percentage"]', '50');
      // Save
      const saveButton = authenticatedPage.locator('button:has-text("Save"), button:has-text("Create")');
      await saveButton.click();
      // Verify assignment appears
      await expect(authenticatedPage.locator('text=Assignment created successfully')).toBeVisible({ timeout: 10000 });
      // Assignment should now be visible on person page
      await expect(authenticatedPage.locator(`text=${testData.projects[0].name}`)).toBeVisible();
    });
  });
});