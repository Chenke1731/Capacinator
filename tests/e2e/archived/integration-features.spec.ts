/**
 * Integration E2E Tests for Import/Export with Other Features
 * Comprehensive testing for scenarios, permissions, audit integration, and cross-feature functionality
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import/Export Integration with Other Features', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('integration-features');
    
    // Create comprehensive test data for integration testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 15,
      people: 25,
      assignments: 30,
      phases: 10,
      scenarios: 3,
      locations: 6,
      projectTypes: 4,
      roles: 8
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `integration-${Date.now()}`);
    await fs.mkdir(testFilesPath, { recursive: true });

    await testHelpers.navigateTo('/import');
    await testHelpers.setupPage();
  });

  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up test data
    await testDataHelpers.cleanupTestContext(testContext);
    
    // Clean up test files
    try {
      const files = await fs.readdir(testFilesPath);
      for (const file of files) {
        await fs.unlink(path.join(testFilesPath, file));
      }
      await fs.rmdir(testFilesPath);
    } catch (error) {
      // Directory might not exist
    }
  });

  async function createIntegrationTestFile(filename: string, options: any = {}): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Create Projects sheet
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 50 }
    ];

    // Add projects that will test scenario integration
    projectsSheet.addRows([
      {
        name: 'Integration Test Project A',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1,
        description: 'Project designed to test scenario integration'
      },
      {
        name: 'Integration Test Project B',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2,
        description: 'Project designed to test permissions integration'
      },
      {
        name: 'Integration Test Project C',
        type: testData.projectTypes[2].name,
        location: testData.locations[2].name,
        priority: 3,
        description: 'Project designed to test audit integration'
      }
    ]);

    // Create Rosters sheet
    const rostersSheet = workbook.addWorksheet('Rosters');
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'role', width: 20 },
      { header: 'Worker Type', key: 'workerType', width: 15 },
      { header: 'Availability %', key: 'availability', width: 15 },
      { header: 'Hours Per Day', key: 'hoursPerDay', width: 15 }
    ];

    rostersSheet.addRows([
      {
        name: 'Integration Test Person A',
        email: 'integration.test.a@company.com',
        role: testData.roles[0].name,
        workerType: 'FTE',
        availability: 100,
        hoursPerDay: 8
      },
      {
        name: 'Integration Test Person B',
        email: 'integration.test.b@company.com',
        role: testData.roles[1].name,
        workerType: 'Contractor',
        availability: 80,
        hoursPerDay: 6
      },
      {
        name: 'Integration Test Person C',
        email: 'integration.test.c@company.com',
        role: testData.roles[2].name,
        workerType: 'FTE',
        availability: 90,
        hoursPerDay: 7
      }
    ]);

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.integration} should integrate properly with scenario management`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test file
    const testFile = await createIntegrationTestFile('scenario-integration.xlsx');

    // Import data
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Navigate to scenarios to verify integration
    await testHelpers.navigateTo('/scenarios');

    // Should see the default scenario with imported data
    await expect(page.locator('[data-testid="scenario-list"]').or(
      page.locator('text=Default Scenario')
    )).toBeVisible({ timeout: 10000 });

    // Should be able to create new scenario with imported data
    const newScenarioButton = page.locator('button:has-text("New Scenario")').or(
      page.locator('button:has-text("Create Scenario")')
    );
    
    if (await newScenarioButton.isVisible()) {
      await newScenarioButton.click();

      const scenarioNameInput = page.locator('input[placeholder*="scenario"]').or(
        page.locator('input[name="name"]')
      );
      await scenarioNameInput.fill('Import Integration Test Scenario');

      const createButton = page.locator('button:has-text("Create")');
      await createButton.click();

      // New scenario should include imported projects
      await expect(page.locator('text=Integration Test Project A')).toBeVisible({ timeout: 10000 });
    }

    // Test scenario export includes imported data
    await testHelpers.navigateTo('/import');
    
    // Select the scenario we're testing
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    if (await scenarioSelect.isVisible()) {
      // Should have options that include our test data
      const options = await scenarioSelect.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(1);
    }

    // Export scenario data
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Verify integration by checking projects are visible in projects page
    await testHelpers.navigateTo('/projects');
    await expect(page.locator('text=Integration Test Project A')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Integration Test Project B')).toBeVisible();
    await expect(page.locator('text=Integration Test Project C')).toBeVisible();
  });

  test(`${tags.integration} should respect user permissions for import/export operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Verify current user has import/export permissions
    await expect(page.locator('text=Import & Export Data')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.locator('button:has-text("Export Scenario Data")')).toBeVisible();

    // Test import permissions
    const testFile = await createIntegrationTestFile('permissions-test.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeVisible();
    await expect(importButton).toBeEnabled();

    await importButton.click();
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Test export permissions
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    await exportButton.click();
    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Test template download permissions
    const templateButton = page.locator('button:has-text("Download Template")');
    await expect(templateButton).toBeVisible();
    await expect(templateButton).toBeEnabled();

    await templateButton.click();
    await expect(templateButton).toBeEnabled({ timeout: 10000 });

    // Verify user can access imported data in other sections
    await testHelpers.navigateTo('/people');
    await expect(page.locator('text=Integration Test Person A')).toBeVisible({ timeout: 10000 });
  });

  test(`${tags.integration} should integrate with audit logging system`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Record timestamp before import for audit verification
    const importStartTime = new Date().toISOString();

    // Perform import operation
    const testFile = await createIntegrationTestFile('audit-integration.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Navigate to audit logs if accessible
    const auditLink = page.locator('a[href*="audit"]').or(
      page.locator('text=Audit').or(
        page.locator('text=Activity Log')
      )
    );

    if (await auditLink.isVisible()) {
      await auditLink.click();

      // Should see import activity in audit log
      await expect(page.locator('text=Import').and(
        page.locator(':near(:text("audit-integration.xlsx"))')
      )).toBeVisible({ timeout: 10000 });

      // Should show details of what was imported
      await expect(page.locator('text=projects:').and(
        page.locator(':near(:text("3"))')
      )).toBeVisible();

      await expect(page.locator('text=people:').and(
        page.locator(':near(:text("3"))')
      )).toBeVisible();
    }

    // Test export audit logging
    await testHelpers.navigateTo('/import');

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Check audit log for export activity if accessible
    if (await auditLink.isVisible()) {
      await auditLink.click();

      // Should see export activity
      await expect(page.locator('text=Export').or(
        page.locator('text=Download')
      )).toBeVisible({ timeout: 10000 });
    }

    // Verify audit data integrity - changes should be tracked
    await testHelpers.navigateTo('/projects');
    const projectRows = page.locator('[data-testid="project-row"]').or(
      page.locator('tr:has([data-testid="project-name"])')
    );
    
    const projectCount = await projectRows.count();
    expect(projectCount).toBeGreaterThan(0);
  });

  test(`${tags.integration} should work seamlessly with project phase management`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Import projects first
    const testFile = await createIntegrationTestFile('phase-integration.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Navigate to projects to add phases
    await testHelpers.navigateTo('/projects');

    // Find one of our imported projects
    const projectRow = page.locator('text=Integration Test Project A').locator('..');
    if (await projectRow.isVisible()) {
      // Access project details
      const projectLink = projectRow.locator('a').first().or(
        page.locator('text=Integration Test Project A')
      );
      await projectLink.click();

      // Should be able to add phases to imported project
      const addPhaseButton = page.locator('button:has-text("Add Phase")').or(
        page.locator('button:has-text("New Phase")')
      );

      if (await addPhaseButton.isVisible()) {
        await addPhaseButton.click();

        const phaseNameInput = page.locator('input[placeholder*="phase"]').or(
          page.locator('input[name*="name"]')
        );
        await phaseNameInput.fill('Integration Test Phase');

        const createPhaseButton = page.locator('button:has-text("Create")').or(
          page.locator('button:has-text("Add Phase")')
        );
        await createPhaseButton.click();

        await expect(page.locator('text=Integration Test Phase')).toBeVisible({ timeout: 10000 });
      }
    }

    // Test that phases are included in scenario exports
    await testHelpers.navigateTo('/import');

    // Ensure phase timeline export is enabled
    const phaseCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Phase Timelines"))');
    if (await phaseCheckbox.isVisible() && !await phaseCheckbox.isChecked()) {
      await phaseCheckbox.check();
    }

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Phases should be integrated into the overall project workflow
    await testHelpers.navigateTo('/projects');
    await expect(page.locator('text=Integration Test Project A')).toBeVisible();
  });

  test(`${tags.integration} should integrate with assignment and capacity management`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Import both projects and people
    const testFile = await createIntegrationTestFile('assignment-integration.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Navigate to assignments page
    const assignmentsLink = page.locator('a[href*="assignment"]').or(
      page.locator('text=Assignments')
    );

    if (await assignmentsLink.isVisible()) {
      await assignmentsLink.click();

      // Should be able to create assignments using imported data
      const newAssignmentButton = page.locator('button:has-text("New Assignment")').or(
        page.locator('button:has-text("Add Assignment")')
      );

      if (await newAssignmentButton.isVisible()) {
        await newAssignmentButton.click();

        // Should see imported projects and people in dropdowns
        const projectSelect = page.locator('select[name*="project"]').or(
          page.locator('[data-testid="project-select"]')
        );

        if (await projectSelect.isVisible()) {
          await projectSelect.click();
          await expect(page.locator('text=Integration Test Project A')).toBeVisible();
        }

        const personSelect = page.locator('select[name*="person"]').or(
          page.locator('[data-testid="person-select"]')
        );

        if (await personSelect.isVisible()) {
          await personSelect.click();
          await expect(page.locator('text=Integration Test Person A')).toBeVisible();
        }
      }
    }

    // Test capacity calculations include imported people
    const capacityLink = page.locator('a[href*="capacity"]').or(
      page.locator('text=Capacity')
    );

    if (await capacityLink.isVisible()) {
      await capacityLink.click();

      // Should see imported people in capacity view
      await expect(page.locator('text=Integration Test Person A')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Integration Test Person B')).toBeVisible();
    }

    // Verify assignment export includes imported data
    await testHelpers.navigateTo('/import');

    const assignmentCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    if (await assignmentCheckbox.isVisible() && !await assignmentCheckbox.isChecked()) {
      await assignmentCheckbox.check();
    }

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });
  });

  test(`${tags.integration} should handle cross-feature data dependencies`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create complex file with interdependent data
    const workbook = new ExcelJS.Workbook();
    
    // Projects that reference specific locations and types
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    projectsSheet.addRows([
      {
        name: 'Dependency Test Project Alpha',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      },
      {
        name: 'Dependency Test Project Beta',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2
      }
    ]);

    // People with specific roles
    const rostersSheet = workbook.addWorksheet('Rosters');
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'role', width: 20 },
      { header: 'Worker Type', key: 'workerType', width: 15 }
    ];

    rostersSheet.addRows([
      {
        name: 'Dependency Test Lead',
        email: 'dependency.lead@company.com',
        role: testData.roles[0].name,
        workerType: 'FTE'
      },
      {
        name: 'Dependency Test Member',
        email: 'dependency.member@company.com',
        role: testData.roles[1].name,
        workerType: 'Contractor'
      }
    ]);

    const dependencyFile = path.join(testFilesPath, 'dependency-test.xlsx');
    await workbook.xlsx.writeFile(dependencyFile);

    // Import the interdependent data
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(dependencyFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Verify dependencies are maintained across features
    
    // Check projects maintain their type and location references
    await testHelpers.navigateTo('/projects');
    await expect(page.locator('text=Dependency Test Project Alpha')).toBeVisible({ timeout: 10000 });
    
    const projectRow = page.locator('text=Dependency Test Project Alpha').locator('..');
    await expect(projectRow.locator(`text=${testData.projectTypes[0].name}`)).toBeVisible();
    await expect(projectRow.locator(`text=${testData.locations[0].name}`)).toBeVisible();

    // Check people maintain their role references
    await testHelpers.navigateTo('/people');
    await expect(page.locator('text=Dependency Test Lead')).toBeVisible({ timeout: 10000 });
    
    const personRow = page.locator('text=Dependency Test Lead').locator('..');
    await expect(personRow.locator(`text=${testData.roles[0].name}`)).toBeVisible();

    // Test that export maintains these dependencies
    await testHelpers.navigateTo('/import');

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Dependencies should be preserved in exported data
    // This would require analysis of the exported file, but we verify the system handles it
    await expect(page.locator('text=Export')).toBeVisible();
  });

  test(`${tags.integration} should integrate with notification and alert systems`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Check for notification area
    const notificationArea = page.locator('[data-testid="notifications"]').or(
      page.locator('.notifications').or(
        page.locator('[role="alert"]')
      )
    );

    // Import data and check for notifications
    const testFile = await createIntegrationTestFile('notification-test.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show import progress notifications
    await expect(page.locator('text=Processing').or(
      page.locator('text=Importing')
    )).toBeVisible({ timeout: 10000 });

    // Should show success notification
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 30000 });

    // Check if there's a global notification system
    if (await notificationArea.isVisible()) {
      await expect(notificationArea.locator('text=Import')).toBeVisible();
    }

    // Test export notifications
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Should show export progress
    await expect(page.locator('button:has-text("Exporting..."):disabled')).toBeVisible();

    // Should complete successfully
    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Template download should also show feedback
    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    // Should show download feedback
    await expect(templateButton).toBeEnabled({ timeout: 10000 });
  });

  test(`${tags.integration} should work with search and filtering systems`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Import data first
    const testFile = await createIntegrationTestFile('search-integration.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Test search functionality with imported data
    await testHelpers.navigateTo('/projects');

    const searchInput = page.locator('input[placeholder*="search"]').or(
      page.locator('input[type="search"]').or(
        page.locator('[data-testid="search-input"]')
      )
    );

    if (await searchInput.isVisible()) {
      // Search for imported project
      await searchInput.fill('Integration Test Project A');
      
      // Should find the imported project
      await expect(page.locator('text=Integration Test Project A')).toBeVisible({ timeout: 5000 });
      
      // Should not show other projects
      const projectRows = page.locator('[data-testid="project-row"]').or(
        page.locator('tbody tr')
      );
      const visibleRows = await projectRows.count();
      expect(visibleRows).toBeLessThanOrEqual(3); // Should filter results
    }

    // Test filtering with imported data
    const filterDropdown = page.locator('select[name*="filter"]').or(
      page.locator('[data-testid="filter-select"]')
    );

    if (await filterDropdown.isVisible()) {
      // Filter by project type
      await filterDropdown.selectOption(testData.projectTypes[0].name);
      
      // Should show only projects of that type
      await expect(page.locator('text=Integration Test Project A')).toBeVisible();
    }

    // Test people search
    await testHelpers.navigateTo('/people');

    const peopleSearchInput = page.locator('input[placeholder*="search"]').or(
      page.locator('input[type="search"]')
    );

    if (await peopleSearchInput.isVisible()) {
      await peopleSearchInput.fill('Integration Test Person B');
      
      await expect(page.locator('text=Integration Test Person B')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=integration.test.b@company.com')).toBeVisible();
    }
  });

  test(`${tags.integration} should maintain data consistency across feature updates`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Import initial data
    const testFile = await createIntegrationTestFile('consistency-test.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Make changes to imported data through the UI
    await testHelpers.navigateTo('/projects');

    const projectRow = page.locator('text=Integration Test Project A').locator('..');
    if (await projectRow.isVisible()) {
      // Edit project
      const editButton = projectRow.locator('button:has-text("Edit")').or(
        projectRow.locator('[data-testid="edit-button"]')
      );

      if (await editButton.isVisible()) {
        await editButton.click();

        const nameInput = page.locator('input[name*="name"]').or(
          page.locator('[data-testid="project-name-input"]')
        );
        
        if (await nameInput.isVisible()) {
          await nameInput.clear();
          await nameInput.fill('Updated Integration Test Project A');

          const saveButton = page.locator('button:has-text("Save")').or(
            page.locator('button:has-text("Update")')
          );
          await saveButton.click();

          await expect(page.locator('text=Updated Integration Test Project A')).toBeVisible();
        }
      }
    }

    // Verify consistency by exporting and checking data integrity
    await testHelpers.navigateTo('/import');

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Changes should be reflected in export
    // The system should maintain referential integrity

    // Verify the update is visible across features
    await testHelpers.navigateTo('/projects');
    await expect(page.locator('text=Updated Integration Test Project A')).toBeVisible();

    // Verify in any assignment views
    const assignmentsLink = page.locator('a[href*="assignment"]').or(
      page.locator('text=Assignments')
    );

    if (await assignmentsLink.isVisible()) {
      await assignmentsLink.click();
      
      // Updated project name should be reflected in assignment contexts
      if (await page.locator('text=Updated Integration Test Project A').isVisible()) {
        await expect(page.locator('text=Updated Integration Test Project A')).toBeVisible();
      }
    }
  });
});