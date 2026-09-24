import { test, expect, APIRequestContext } from '@playwright/test';
import { StandardTestHelpers } from '../helpers/standard-test-helpers';
import { TestDataFactory } from '../helpers/test-data-factory';
import { E2EErrorHandler } from '../helpers/error-handler';
import { ProjectsPage } from '../page-objects/ProjectsPage';
import { PeoplePage } from '../page-objects/PeoplePage';
import { AssignmentHelpers } from '../helpers/assignment-helpers';

/**
 * STANDARDIZED VERSION: CRUD Operations Test
 * Demonstrates migration from TestDataContext pattern to TestDataFactory
 */
test.describe('CRUD Operations - Standardized', () => {
  let helpers: StandardTestHelpers;
  let errorHandler: E2EErrorHandler;
  let testDataFactory: TestDataFactory;
  let apiContext: APIRequestContext;
  let projectsPage: ProjectsPage;
  let peoplePage: PeoplePage;
  let assignmentHelpers: AssignmentHelpers;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://localhost:3111',
      extraHTTPHeaders: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });

  test.beforeEach(async ({ page }, testInfo) => {
    // Initialize all helpers and page objects
    helpers = new StandardTestHelpers(page);
    errorHandler = new E2EErrorHandler(page, testInfo);
    testDataFactory = new TestDataFactory(apiContext, 'crud-test');
    projectsPage = new ProjectsPage(page);
    peoplePage = new PeoplePage(page);
    assignmentHelpers = new AssignmentHelpers(page);
    
    // Start error monitoring
    errorHandler.startMonitoring();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed') {
      await errorHandler.captureErrorContext();
    }
    
    // Automatic cleanup via TestDataFactory
    await testDataFactory.cleanup();
    
    errorHandler.stopMonitoring();
    await errorHandler.assertNoCriticalErrors();
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test.describe('Projects CRUD', () => {
    test('should create a new project', async ({ page }) => {
      // Navigate to projects page
      await projectsPage.navigate();
      
      // Click add project
      await projectsPage.clickAddProject();
      
      // Fill project form with test data
      const projectData = {
        name: testDataFactory.getUniqueName('Test Project'),
        description: 'Project created by standardized E2E tests',
        priority: 2,
        location: 'San Francisco'
      };
      
      await projectsPage.fillProjectForm(projectData);
      
      // Submit and verify
      await projectsPage.saveProject();
      
      // Verify project appears in table
      await projectsPage.searchProject(projectData.name);
      const projectExists = await projectsPage.verifyProjectExists(projectData.name);
      expect(projectExists).toBe(true);
      
      // Verify project details
      const details = await projectsPage.getProjectDetails(projectData.name);
      expect(details?.description).toContain(projectData.description);
    });

    test('should edit an existing project', async ({ page }) => {
      // Create project via API for editing
      const project = await testDataFactory.createProject({
        name: testDataFactory.getUniqueName('Project To Edit'),
        description: 'Original description'
      });

      // Navigate and find project
      await projectsPage.navigate();
      await projectsPage.searchProject(project.name);
      
      // Edit project
      await projectsPage.editProject(project.name);
      
      const updatedData = {
        name: testDataFactory.getUniqueName('Updated Project'),
        description: 'Updated description via E2E test',
        priority: 1
      };
      
      await projectsPage.fillProjectForm(updatedData);
      await projectsPage.saveProject();
      
      // Verify update
      await projectsPage.searchProject(updatedData.name);
      const details = await projectsPage.getProjectDetails(updatedData.name);
      expect(details?.description).toContain(updatedData.description);
      expect(details?.priority).toBe('High'); // Priority 1 = High
    });

    test('should delete a project', async ({ page }) => {
      // Create project to delete
      const project = await testDataFactory.createProject({
        name: testDataFactory.getUniqueName('Project To Delete')
      });

      // Navigate and find project
      await projectsPage.navigate();
      await projectsPage.searchProject(project.name);
      
      // Get initial count
      const initialCount = await projectsPage.getProjectCount();
      
      // Delete project
      await projectsPage.deleteProject(project.name);
      
      // Verify deletion
      await helpers.waitForLoadingToComplete();
      await projectsPage.clearSearch();
      
      const finalCount = await projectsPage.getProjectCount();
      expect(finalCount).toBe(initialCount - 1);
      
      // Verify project no longer exists
      await projectsPage.searchProject(project.name);
      const stillExists = await projectsPage.verifyProjectExists(project.name);
      expect(stillExists).toBe(false);
    });
  });

  test.describe('People CRUD', () => {
    test('should create a new person', async ({ page }) => {
      // Navigate to people page
      await peoplePage.navigate();
      
      // Create new person
      await peoplePage.clickAddPerson();
      
      const personData = {
        name: testDataFactory.getUniqueName('Test Person'),
        email: 'test.person@example.com',
        role: 'Developer',
        location: 'New York',
        workerType: 'FTE' as const,
        availability: 100,
        hoursPerDay: 8
      };
      
      await peoplePage.fillPersonForm(personData);
      await peoplePage.savePerson();
      
      // Verify creation
      await peoplePage.searchPerson(personData.name);
      const personExists = await peoplePage.verifyPersonExists(personData.name);
      expect(personExists).toBe(true);
    });

    test('should handle bulk operations', async ({ page }) => {
      // Create multiple people for bulk operations
      const people = await testDataFactory.createBulkTestData({
        people: 5,
        projects: 0,
        assignments: 0
      });

      // Navigate to people page
      await peoplePage.navigate();
      
      // Select multiple people
      const namesToSelect = people.people.slice(0, 3).map(p => p.name);
      await peoplePage.bulkSelectPeople(namesToSelect);
      
      // Perform bulk delete
      await peoplePage.bulkDelete();
      
      // Verify deletion
      for (const name of namesToSelect) {
        const stillExists = await peoplePage.verifyPersonExists(name);
        expect(stillExists).toBe(false);
      }
      
      // Verify remaining people still exist
      const remainingNames = people.people.slice(3).map(p => p.name);
      for (const name of remainingNames) {
        const exists = await peoplePage.verifyPersonExists(name);
        expect(exists).toBe(true);
      }
    });
  });

  test.describe('Assignments CRUD', () => {
    test('should create assignment with conflict detection', async ({ page }) => {
      // Create test data
      const person = await testDataFactory.createPerson();
      const project1 = await testDataFactory.createProject();
      const project2 = await testDataFactory.createProject();

      // Create first assignment
      await assignmentHelpers.navigateToAssignments();
      
      await assignmentHelpers.createAssignment({
        personName: person.name,
        projectName: project1.name,
        allocation: 60,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });

      // Try to create conflicting assignment
      await assignmentHelpers.createAssignment({
        personName: person.name,
        projectName: project2.name,
        allocation: 60, // This will cause over-allocation
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });

      // Check for conflicts
      const conflicts = await assignmentHelpers.checkForConflicts(person.name);
      expect(conflicts.length).toBeGreaterThan(0);
    });

    test('should handle assignment timeline operations', async ({ page }) => {
      // Create test scenario
      const scenarioData = await testDataFactory.createScenarioTestData('conflictingAssignments');

      // Navigate to assignments
      await assignmentHelpers.navigateToAssignments();
      
      // Switch to timeline view
      await assignmentHelpers.switchToTimelineView();
      
      // Get utilization summary
      const summary = await assignmentHelpers.getUtilizationSummary();
      
      expect(summary.totalAssignments).toBeGreaterThan(0);
      expect(summary.overallocated).toBeGreaterThan(0);
      
      // Resolve conflicts
      const assignments = scenarioData.projects.map(p => p.name);
      await assignmentHelpers.resolveConflict(assignments[0], 'reduce');
      
      // Verify conflict resolved
      await helpers.waitForText('resolved');
      const remainingConflicts = await assignmentHelpers.checkForConflicts(scenarioData.person.name);
      expect(remainingConflicts.length).toBe(0);
    });
  });

  test.describe('Complex Workflows', () => {
    test('should handle full project lifecycle', async ({ page }) => {
      // 1. Create project
      const project = await testDataFactory.createProject({
        name: testDataFactory.getUniqueName('Lifecycle Project')
      });

      // 2. Create team members
      const team = await Promise.all([
        testDataFactory.createPerson({ name: testDataFactory.getUniqueName('Developer 1') }),
        testDataFactory.createPerson({ name: testDataFactory.getUniqueName('Developer 2') }),
        testDataFactory.createPerson({ name: testDataFactory.getUniqueName('Designer') })
      ]);

      // 3. Create assignments
      await assignmentHelpers.navigateToAssignments();
      
      for (const member of team) {
        await assignmentHelpers.createAssignment({
          personName: member.name,
          projectName: project.name,
          allocation: 40,
          role: member.name.includes('Developer') ? 'Developer' : 'Designer'
        });
      }

      // 4. Verify project team
      await projectsPage.navigate();
      await projectsPage.viewProjectDetails(project.name);
      
      const teamMembers = await projectsPage.getProjectTeamMembers();
      expect(teamMembers.length).toBe(3);
      
      // 5. Complete project
      await projectsPage.updateProjectStatus('Completed');
      
      // 6. Verify assignments ended
      await assignmentHelpers.navigateToAssignments();
      await assignmentHelpers.filterAssignments({
        project: project.name,
        status: 'completed'
      });
      
      const completedCount = await helpers.getTableRowCount();
      expect(completedCount).toBe(3);
    });
  });

  test('should maintain data integrity across operations', async ({ page }) => {
    // Create interconnected data
    const testScenario = await testDataFactory.createBulkTestData({
      people: 10,
      projects: 5,
      assignments: 20,
      withUtilizationScenarios: true
    });

    // Perform various operations and verify consistency
    const operations = [];
    
    // Edit some people
    for (let i = 0; i < 3; i++) {
      operations.push(
        peoplePage.navigate().then(async () => {
          await peoplePage.editPerson(testScenario.people[i].name);
          await peoplePage.fillPersonForm({ availability: 80 });
          await peoplePage.savePerson();
        })
      );
    }

    // Execute operations
    await Promise.all(operations);

    // Verify data integrity
    await assignmentHelpers.navigateToAssignments();
    const summary = await assignmentHelpers.getUtilizationSummary();
    
    expect(summary.totalAssignments).toBe(testScenario.assignments.length);
    expect(summary.activeAssignments).toBeGreaterThan(0);
  });
});

// Note: ProjectsPage should be created as a separate file in page-objects directory
// This example assumes it exists at '../page-objects/ProjectsPage'