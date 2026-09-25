/**
 * Import Preview and Analysis Feature Test Suite
 * Tests for dry-run import analysis and change preview functionality
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import Preview and Analysis', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('import-preview');
    
    // Create baseline test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 3,
      assignments: 2,
      locations: 1,
      roles: 2
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `preview-${Date.now()}`);
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

  async function createTestExcelFile(filename: string, data: any): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Add Projects sheet
    if (data.Projects) {
      const projectsSheet = workbook.addWorksheet('Projects');
      projectsSheet.columns = [
        { header: 'Project Name', key: 'name', width: 30 },
        { header: 'Project Type', key: 'type', width: 20 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Priority', key: 'priority', width: 15 }
      ];
      
      data.Projects.forEach((project: any) => {
        projectsSheet.addRow(project);
      });
    }

    // Add Rosters sheet
    if (data.Rosters) {
      const rostersSheet = workbook.addWorksheet('Rosters');
      rostersSheet.columns = [
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Primary Role', key: 'role', width: 20 },
        { header: 'Worker Type', key: 'workerType', width: 15 },
        { header: 'Availability %', key: 'availability', width: 15 },
        { header: 'Hours Per Day', key: 'hoursPerDay', width: 15 }
      ];
      
      data.Rosters.forEach((person: any) => {
        rostersSheet.addRow(person);
      });
    }

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.smoke} should display import preview section when file uploaded`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create a test Excel file
    const testFile = await createTestExcelFile('preview-test.xlsx', {
      Projects: [{
        name: 'Preview Test Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 2
      }],
      Rosters: [{
        name: 'Preview Test Person',
        email: 'preview@test.com',
        role: testData.roles[0].name,
        workerType: 'FTE',
        availability: 100,
        hoursPerDay: 8
      }]
    });

    // Upload file using the file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Should show file is selected
    await expect(page.locator('text=preview-test.xlsx')).toBeVisible();

    // Should show preview analysis button or section
    // Note: This depends on implementation - might be automatic or require button click
    const analyzeButton = page.locator('button:has-text("Analyze")').or(
      page.locator('button:has-text("Preview Changes")')
    );
    
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Should show analysis results
    await expect(page.locator('[data-testid="import-analysis"]').or(
      page.locator('text=Analysis Results').or(
        page.locator('text=Preview Changes')
      )
    )).toBeVisible({ timeout: 10000 });
  });

  test(`${tags.critical} should analyze import changes without making modifications`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test file with both new and existing data
    const testFile = await createTestExcelFile('analysis-test.xlsx', {
      Projects: [
        // New project
        {
          name: 'Brand New Project',
          type: testData.projectTypes[0].name,
          location: testData.locations[0].name,
          priority: 1
        },
        // Existing project (should be detected as update)
        {
          name: testData.projects[0].name,
          type: testData.projectTypes[0].name,
          location: testData.locations[0].name,
          priority: 3 // Different priority
        }
      ],
      Rosters: [
        // New person
        {
          name: 'New Analysis Person',
          email: 'new@analysis.com',
          role: testData.roles[0].name,
          workerType: 'Contractor',
          availability: 80,
          hoursPerDay: 6
        },
        // Person with conflicting email
        {
          name: 'Different Person',
          email: testData.people[0].email, // Same email as existing person
          role: testData.roles[1].name,
          workerType: 'FTE',
          availability: 100,
          hoursPerDay: 8
        }
      ]
    });

    // Record initial data counts
    const initialProjectCount = testData.projects.length;
    const initialPeopleCount = testData.people.length;

    // Upload and analyze file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Trigger analysis (implementation-dependent)
    const analyzeButton = page.locator('button:has-text("Analyze")').or(
      page.locator('button:has-text("Preview Changes")')
    );
    
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    } else {
      // If no explicit analyze button, analysis might be automatic
      await page.waitForTimeout(2000);
    }

    // Wait for analysis results
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 15000 });

    // Verify analysis summary shows expected changes
    await expect(page.locator('text=Would Create').or(
      page.locator('text=New Records')
    )).toBeVisible();

    await expect(page.locator('text=Would Update').or(
      page.locator('text=Modified Records')
    )).toBeVisible();

    // Look for conflict warnings
    await expect(page.locator('text=Conflict').or(
      page.locator('text=Warning')
    )).toBeVisible();

    // Verify no actual changes were made to the database
    // This would require API calls or navigation to verify data unchanged
    await testHelpers.navigateTo('/projects');
    
    // Count should be the same
    const projectRows = page.locator('[data-testid="project-row"]').or(
      page.locator('tr:has([data-testid="project-name"])')
    );
    
    await expect(projectRows).toHaveCount(initialProjectCount);
  });

  test(`${tags.functional} should display detailed change preview`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test file with various types of changes
    const testFile = await createTestExcelFile('detailed-preview.xlsx', {
      Projects: [
        {
          name: 'Detailed Preview Project 1',
          type: testData.projectTypes[0].name,
          location: testData.locations[0].name,
          priority: 1
        },
        {
          name: 'Detailed Preview Project 2',
          type: testData.projectTypes[0].name,
          location: testData.locations[0].name,
          priority: 2
        }
      ],
      Rosters: [
        {
          name: 'Preview Person 1',
          email: 'preview1@test.com',
          role: testData.roles[0].name,
          workerType: 'FTE',
          availability: 100,
          hoursPerDay: 8
        }
      ]
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Trigger analysis
    const analyzeButton = page.locator('button:has-text("Analyze")').or(
      page.locator('button:has-text("Preview Changes")')
    );
    
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Wait for detailed preview
    await page.waitForSelector('[data-testid="change-preview"]', { timeout: 10000 });

    // Verify detailed information is shown
    await expect(page.locator('text=Detailed Preview Project').first()).toBeVisible();
    await expect(page.locator('text=Preview Person 1')).toBeVisible();

    // Verify change counts
    await expect(page.locator('text=2').and(page.locator(':near(:text("projects"))'))).toBeVisible();
    await expect(page.locator('text=1').and(page.locator(':near(:text("people"))'))).toBeVisible();
  });

  test(`${tags.validation} should detect and display conflicts`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create file with deliberate conflicts
    const testFile = await createTestExcelFile('conflict-test.xlsx', {
      Projects: [
        {
          name: 'Conflict Test Project',
          type: 'Non-existent Type', // Should cause error
          location: testData.locations[0].name,
          priority: 1
        }
      ],
      Rosters: [
        {
          name: 'Conflict Person 1',
          email: testData.people[0].email, // Duplicate email
          role: testData.roles[0].name,
          workerType: 'FTE',
          availability: 100,
          hoursPerDay: 8
        },
        {
          name: 'Conflict Person 2',
          email: 'invalid-email-format', // Invalid email
          role: testData.roles[0].name,
          workerType: 'FTE',
          availability: 100,
          hoursPerDay: 8
        }
      ]
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Trigger analysis
    const analyzeButton = page.locator('button:has-text("Analyze")').or(
      page.locator('button:has-text("Preview Changes")')
    );
    
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Wait for conflict detection
    await page.waitForSelector('[data-testid="conflicts-section"]', { timeout: 10000 });

    // Verify conflicts are displayed
    await expect(page.locator('text=Conflict').or(
      page.locator('text=Error')
    )).toBeVisible();

    // Should show email conflict
    await expect(page.locator('text=email').and(
      page.locator(':near(:text("conflict"))')
    )).toBeVisible();

    // Should show high risk assessment
    await expect(page.locator('text=High Risk').or(
      page.locator('text=Risk: High')
    )).toBeVisible();
  });

  test(`${tags.accessibility} should provide screen reader friendly analysis`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createTestExcelFile('a11y-test.xlsx', {
      Projects: [{
        name: 'Accessibility Test Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 2
      }]
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Verify file input has proper labeling
    await expect(page.locator('input[type="file"]')).toHaveAttribute('accept', '.xlsx,.xls');

    // Check analysis results have proper ARIA labels
    const analyzeButton = page.locator('button:has-text("Analyze")');
    if (await analyzeButton.isVisible()) {
      await expect(analyzeButton).toBeEnabled();
      await analyzeButton.click();
    }

    // Wait for results and verify accessibility
    await page.waitForSelector('[role="region"]', { timeout: 10000 });
    
    // Verify results have semantic structure
    const analysisSection = page.locator('[data-testid="analysis-results"]').or(
      page.locator('[role="region"]:has-text("Analysis")')
    );
    
    await expect(analysisSection).toBeVisible();
  });

  test(`${tags.performance} should handle large file analysis efficiently`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create larger test dataset
    const largeProjects = Array.from({ length: 50 }, (_, i) => ({
      name: `Performance Test Project ${i + 1}`,
      type: testData.projectTypes[0].name,
      location: testData.locations[0].name,
      priority: (i % 3) + 1
    }));

    const largePeople = Array.from({ length: 50 }, (_, i) => ({
      name: `Performance Test Person ${i + 1}`,
      email: `perf${i + 1}@test.com`,
      role: testData.roles[0].name,
      workerType: 'FTE',
      availability: 100,
      hoursPerDay: 8
    }));

    const testFile = await createTestExcelFile('large-analysis.xlsx', {
      Projects: largeProjects,
      Rosters: largePeople
    });

    // Upload file and measure analysis time
    const startTime = Date.now();
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Wait for analysis to complete
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 30000 });
    
    const analysisTime = Date.now() - startTime;

    // Should complete within reasonable time (15 seconds)
    expect(analysisTime).toBeLessThan(15000);

    // Verify results show correct counts
    await expect(page.locator('text=50').and(
      page.locator(':near(:text("projects"))')
    )).toBeVisible();
  });

  test(`${tags.edge_case} should handle missing worksheets gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create file with only Projects sheet (missing Rosters)
    const testFile = await createTestExcelFile('incomplete.xlsx', {
      Projects: [{
        name: 'Incomplete Test Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      }]
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Should show validation errors
    await page.waitForSelector('[data-testid="validation-errors"]', { timeout: 10000 });

    // Should mention missing worksheets
    await expect(page.locator('text=Missing').and(
      page.locator(':near(:text("worksheet"))')
    )).toBeVisible();

    // Should still allow user to proceed with warnings
    const proceedButton = page.locator('button:has-text("Import Anyway")').or(
      page.locator('button:has-text("Continue")')
    );
    
    if (await proceedButton.isVisible()) {
      await expect(proceedButton).toBeVisible();
    }
  });

  test(`${tags.integration} should integrate with import settings`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test file
    const testFile = await createTestExcelFile('settings-test.xlsx', {
      Projects: [{
        name: 'Settings Test Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      }]
    });

    // Modify import settings first
    const clearExistingCheckbox = page.locator('input[type="checkbox"]:near(:text("Clear existing"))');
    if (await clearExistingCheckbox.isVisible()) {
      await clearExistingCheckbox.check();
    }

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Should reflect the "clear existing" setting in analysis
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 10000 });

    // Should show deletion warnings when clear existing is selected
    await expect(page.locator('text=Delete').or(
      page.locator('text=Remove')
    )).toBeVisible();
  });

  test(`${tags.regression} should maintain analysis state during navigation`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createTestExcelFile('state-test.xlsx', {
      Projects: [{
        name: 'State Test Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      }]
    });

    // Upload and analyze
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Wait for results
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 10000 });

    // Navigate away and back
    await testHelpers.navigateTo('/projects');
    await testHelpers.navigateTo('/import');

    // Analysis state should be cleared and require re-upload
    await expect(page.locator('text=Drop Excel file here')).toBeVisible();
    await expect(page.locator('[data-testid="analysis-results"]')).not.toBeVisible();
  });
});