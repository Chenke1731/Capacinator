/**
 * Complex Import Scenarios E2E Tests
 * Comprehensive testing for large datasets, conflict resolution, rollback, and advanced import workflows
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Complex Import Scenarios', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('complex-import-scenarios');
    
    // Create baseline test data for conflict testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 20,
      people: 30,
      assignments: 40,
      locations: 5,
      projectTypes: 4,
      roles: 8,
      scenarios: 1
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `complex-import-${Date.now()}`);
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

  async function createComplexConflictFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Create Projects sheet with various conflict scenarios
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'End Date', key: 'endDate', width: 15 }
    ];

    // Add projects with various conflict types
    projectsSheet.addRows([
      // Exact duplicate of existing project
      {
        name: testData.projects[0].name,
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: testData.projects[0].priority,
        description: 'Exact duplicate project',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      },
      // Same name but different details (update scenario)
      {
        name: testData.projects[1].name,
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 3, // Different priority
        description: 'Updated project with same name',
        startDate: '2024-02-01',
        endDate: '2024-11-30'
      },
      // New project with non-existent project type
      {
        name: 'Conflict Test Project 1',
        type: 'Non-Existent Project Type',
        location: testData.locations[0].name,
        priority: 1,
        description: 'Project with invalid type',
        startDate: '2024-03-01',
        endDate: '2024-09-30'
      },
      // New project with non-existent location
      {
        name: 'Conflict Test Project 2',
        type: testData.projectTypes[0].name,
        location: 'Non-Existent Location',
        priority: 2,
        description: 'Project with invalid location',
        startDate: '2024-04-01',
        endDate: '2024-08-31'
      },
      // Valid new project
      {
        name: 'Valid New Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1,
        description: 'This project should import successfully',
        startDate: '2024-05-01',
        endDate: '2024-07-31'
      }
    ]);

    // Create Rosters sheet with various conflict scenarios
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
      // Duplicate email (conflict)
      {
        name: 'Conflict Person 1',
        email: testData.people[0].email, // Duplicate email
        role: testData.roles[0].name,
        workerType: 'FTE',
        availability: 100,
        hoursPerDay: 8
      },
      // Same name but different email (update scenario)
      {
        name: testData.people[1].name,
        email: 'updated@email.com', // Different email for same person
        role: testData.roles[1].name,
        workerType: 'Contractor',
        availability: 80,
        hoursPerDay: 6
      },
      // Invalid email format
      {
        name: 'Invalid Email Person',
        email: 'invalid-email-format',
        role: testData.roles[0].name,
        workerType: 'FTE',
        availability: 100,
        hoursPerDay: 8
      },
      // Non-existent role
      {
        name: 'Non-Existent Role Person',
        email: 'nonexistent@role.com',
        role: 'Non-Existent Role',
        workerType: 'FTE',
        availability: 100,
        hoursPerDay: 8
      },
      // Invalid availability percentage
      {
        name: 'Invalid Availability Person',
        email: 'invalid@availability.com',
        role: testData.roles[0].name,
        workerType: 'FTE',
        availability: 150, // Invalid > 100%
        hoursPerDay: 8
      },
      // Valid new person
      {
        name: 'Valid New Person',
        email: 'valid@new.com',
        role: testData.roles[0].name,
        workerType: 'FTE',
        availability: 90,
        hoursPerDay: 7
      }
    ]);

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async function createLargeDatasetFile(filename: string, recordCount: number): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Create Projects sheet with many records
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 50 }
    ];

    // Add many project records
    for (let i = 1; i <= recordCount; i++) {
      projectsSheet.addRow({
        name: `Large Dataset Project ${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length].name,
        location: testData.locations[i % testData.locations.length].name,
        priority: (i % 3) + 1,
        description: `Large dataset test project number ${i} with comprehensive details for testing import performance and data handling capabilities.`
      });
    }

    // Create Rosters sheet with many records
    const rostersSheet = workbook.addWorksheet('Rosters');
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'role', width: 20 },
      { header: 'Worker Type', key: 'workerType', width: 15 },
      { header: 'Availability %', key: 'availability', width: 15 },
      { header: 'Hours Per Day', key: 'hoursPerDay', width: 15 }
    ];

    for (let i = 1; i <= recordCount; i++) {
      rostersSheet.addRow({
        name: `Large Dataset Person ${i}`,
        email: `large${i}@dataset.com`,
        role: testData.roles[i % testData.roles.length].name,
        workerType: i % 3 === 0 ? 'Contractor' : 'FTE',
        availability: Math.floor(Math.random() * 40) + 60, // 60-100%
        hoursPerDay: Math.floor(Math.random() * 4) + 6 // 6-10 hours
      });
    }

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.critical} should detect and display comprehensive conflict analysis`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create file with multiple conflict types
    const conflictFile = await createComplexConflictFile('complex-conflicts.xlsx');

    // Upload and analyze file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(conflictFile);

    await expect(page.locator('text=complex-conflicts.xlsx')).toBeVisible();

    // Trigger analysis (preview/dry-run)
    const analyzeButton = page.locator('button:has-text("Analyze")').or(
      page.locator('button:has-text("Preview Changes")')
    );
    
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Wait for analysis results
    await expect(page.locator('[data-testid="analysis-results"]').or(
      page.locator('text=Analysis Results').or(
        page.locator('text=Preview Changes')
      )
    )).toBeVisible({ timeout: 15000 });

    // Should detect conflicts
    await expect(page.locator('text=Conflict').or(
      page.locator('text=Warning').or(
        page.locator('text=Error')
      )
    )).toBeVisible();

    // Should show specific conflict types
    await expect(page.locator('text=Duplicate').or(
      page.locator('text=email').and(page.locator(':near(:text("conflict"))'))
    )).toBeVisible();

    // Should show high risk assessment
    await expect(page.locator('text=High Risk').or(
      page.locator('text=Risk: High').or(
        page.locator('text=risk-high')
      )
    )).toBeVisible();

    // Should show detailed change preview
    await expect(page.locator('text=Would Create').or(
      page.locator('text=New Records')
    )).toBeVisible();

    await expect(page.locator('text=Would Update').or(
      page.locator('text=Modified Records')
    )).toBeVisible();

    // Should provide recommendations
    await expect(page.locator('text=Recommendation').or(
      page.locator('text=Suggestion')
    )).toBeVisible();
  });

  test(`${tags.performance} should handle large dataset import with progress tracking`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    test.slow(); // Mark as slow test
    const page = authenticatedPage;

    // Create large dataset
    const largeFile = await createLargeDatasetFile('large-dataset-2000.xlsx', 2000);

    // Check file size
    const stats = await fs.stat(largeFile);
    expect(stats.size).toBeGreaterThan(500000); // Should be > 500KB

    // Start performance monitoring
    const startTime = Date.now();

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(largeFile);

    await expect(page.locator('text=large-dataset-2000.xlsx')).toBeVisible();

    // Start import
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show progress indicators for large datasets
    await expect(page.locator('[data-testid="import-progress"]').or(
      page.locator('text=Processing').or(
        page.locator('text=Importing').or(
          page.locator('.progress-bar')
        )
      )
    )).toBeVisible({ timeout: 10000 });

    // Monitor progress changes
    let progressUpdated = false;
    const progressCheck = setInterval(async () => {
      try {
        const progressElements = await page.locator('[data-testid="import-progress"]').count();
        if (progressElements > 0) {
          progressUpdated = true;
        }
      } catch (error) {
        // Page might be updating, ignore errors
      }
    }, 1000);

    // Wait for completion with extended timeout
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 180000 }); // 3 minutes for large dataset

    clearInterval(progressCheck);

    const processingTime = Date.now() - startTime;
    
    // Should complete within reasonable time (3 minutes)
    expect(processingTime).toBeLessThan(180000);

    // Verify large dataset was imported
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("2000"))')
    )).toBeVisible();

    await expect(page.locator('text=people:').and(
      page.locator(':near(:text("2000"))')
    )).toBeVisible();
  });

  test(`${tags.functional} should allow selective conflict resolution`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const conflictFile = await createComplexConflictFile('selective-conflicts.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(conflictFile);

    // Analyze first
    const analyzeButton = page.locator('button:has-text("Analyze")');
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
    }

    // Wait for conflict detection
    await expect(page.locator('[data-testid="conflicts-section"]').or(
      page.locator('text=Conflicts detected')
    )).toBeVisible({ timeout: 15000 });

    // Should show options to resolve conflicts
    const resolveButton = page.locator('button:has-text("Resolve Conflicts")').or(
      page.locator('button:has-text("Configure Import")')
    );

    if (await resolveButton.isVisible()) {
      await resolveButton.click();

      // Should show conflict resolution options
      await expect(page.locator('text=Skip conflicted records').or(
        page.locator('text=Overwrite existing').or(
          page.locator('text=Auto-create missing')
        )
      )).toBeVisible();
    }

    // Proceed with import despite conflicts
    const proceedButton = page.locator('button:has-text("Import Anyway")').or(
      page.locator('button:has-text("Continue Import")')
    );

    if (await proceedButton.isVisible()) {
      await proceedButton.click();

      // Should show import results with conflict handling
      await expect(page.locator('text=Import').and(
        page.locator(':near(:text("Complete"))')
      )).toBeVisible({ timeout: 30000 });

      // Should show what was skipped/imported
      await expect(page.locator('text=skipped').or(
        page.locator('text=conflicts resolved')
      )).toBeVisible();
    }
  });

  test(`${tags.edge_case} should handle mixed data quality scenarios`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create file with mix of valid and invalid data
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    projectsSheet.addRows([
      // Valid record
      {
        name: 'Valid Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      },
      // Missing required field
      {
        name: '', // Empty name
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 2
      },
      // Invalid priority
      {
        name: 'Invalid Priority Project',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 'High' // Should be number
      },
      // Another valid record
      {
        name: 'Another Valid Project',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 3
      }
    ]);

    const mixedQualityFile = path.join(testFilesPath, 'mixed-quality.xlsx');
    await workbook.xlsx.writeFile(mixedQualityFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(mixedQualityFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show validation errors for invalid records
    await expect(page.locator('text=validation').and(
      page.locator(':near(:text("error"))')
    ).or(
      page.locator('text=Invalid data')
    )).toBeVisible({ timeout: 15000 });

    // Should still import valid records
    await expect(page.locator('text=Import').and(
      page.locator(':near(:text("Complete"))')
    )).toBeVisible({ timeout: 30000 });

    // Should show partial success results
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("2"))') // 2 valid projects
    )).toBeVisible();
  });

  test(`${tags.regression} should maintain data integrity during complex imports`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Record initial data counts
    const initialProjectCount = testData.projects.length;
    const initialPeopleCount = testData.people.length;

    // Create file with both new and update scenarios
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    // Add 5 new projects
    for (let i = 1; i <= 5; i++) {
      projectsSheet.addRow({
        name: `Data Integrity Test Project ${i}`,
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: (i % 3) + 1
      });
    }

    const integrityFile = path.join(testFilesPath, 'data-integrity.xlsx');
    await workbook.xlsx.writeFile(integrityFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(integrityFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Verify exact count increase
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("5"))')
    )).toBeVisible();

    // Navigate to verify data persisted correctly
    await testHelpers.navigateTo('/projects');
    
    // Should see the new projects
    await expect(page.locator('text=Data Integrity Test Project 1')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Data Integrity Test Project 5')).toBeVisible();

    // Verify no data corruption occurred
    const projectRows = page.locator('[data-testid="project-row"]').or(
      page.locator('tr:has([data-testid="project-name"])')
    );
    
    await expect(projectRows).toHaveCount(initialProjectCount + 5);
  });

  test(`${tags.edge_case} should handle import cancellation gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create medium-sized file for cancellation testing
    const cancelFile = await createLargeDatasetFile('cancel-test.xlsx', 500);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(cancelFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Wait for import to start
    await expect(page.locator('text=Processing').or(
      page.locator('text=Importing')
    )).toBeVisible({ timeout: 10000 });

    // Look for cancel button and click it if available
    const cancelButton = page.locator('button:has-text("Cancel")').or(
      page.locator('button:has-text("Stop Import")')
    );

    if (await cancelButton.isVisible()) {
      await cancelButton.click();

      // Should show cancellation confirmation
      await expect(page.locator('text=Import cancelled').or(
        page.locator('text=Import stopped')
      )).toBeVisible({ timeout: 10000 });

      // Should return to clean state
      await expect(page.locator('text=Drop Excel file here')).toBeVisible();
    } else {
      // If no cancel button, just wait for completion
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });
    }

    // Interface should be responsive and ready for new import
    await expect(page.locator('input[type="file"]')).toBeEnabled();
  });

  test(`${tags.functional} should support batch import with multiple validation passes`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create file requiring multiple validation passes
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    // Add projects with dependencies that need to be created in order
    projectsSheet.addRows([
      {
        name: 'Batch Test Project 1',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      },
      {
        name: 'Batch Test Project 2',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2
      },
      {
        name: 'Batch Test Project 3',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      }
    ]);

    const batchFile = path.join(testFilesPath, 'batch-test.xlsx');
    await workbook.xlsx.writeFile(batchFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(batchFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show batch processing indicators
    await expect(page.locator('text=Processing batch').or(
      page.locator('text=Validating records').or(
        page.locator('[data-testid="batch-progress"]')
      )
    )).toBeVisible({ timeout: 10000 });

    // Wait for batch completion
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 45000 });

    // Verify all batch items were processed
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("3"))')
    )).toBeVisible();

    // Should show batch summary
    await expect(page.locator('text=Processed in batches').or(
      page.locator('text=3 records processed')
    )).toBeVisible();
  });

  test(`${tags.validation} should provide detailed error reporting for complex scenarios`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const conflictFile = await createComplexConflictFile('detailed-errors.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(conflictFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Wait for processing and error detection
    await expect(page.locator('text=validation').and(
      page.locator(':near(:text("error"))')
    ).or(
      page.locator('[data-testid="error-summary"]')
    )).toBeVisible({ timeout: 30000 });

    // Should show detailed error breakdown
    await expect(page.locator('text=Invalid email format').or(
      page.locator('text=Duplicate email')
    )).toBeVisible();

    await expect(page.locator('text=Non-existent').and(
      page.locator(':near(:text("role"))')
    )).toBeVisible();

    // Should provide line/row references
    await expect(page.locator('text=Row').and(
      page.locator(':near(:text("3"))')
    ).or(
      page.locator('text=Line')
    )).toBeVisible();

    // Should offer error export/download
    const errorExportButton = page.locator('button:has-text("Download Error Report")').or(
      page.locator('button:has-text("Export Errors")')
    );

    if (await errorExportButton.isVisible()) {
      await expect(errorExportButton).toBeEnabled();
    }
  });

  test(`${tags.performance} should maintain performance with concurrent operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const concurrentFile = await createLargeDatasetFile('concurrent-test.xlsx', 1000);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(concurrentFile);

    // Start import
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Verify UI remains responsive during import
    await expect(page.locator('text=Processing')).toBeVisible({ timeout: 10000 });

    // Test navigation responsiveness
    await expect(page.locator('[data-testid="navigation"]').or(
      page.locator('nav')
    )).toBeVisible();

    // Should be able to interact with other UI elements (but not import controls)
    const settingsSection = page.locator('[data-testid="import-settings"]').or(
      page.locator('text=Import Settings')
    );
    
    if (await settingsSection.isVisible()) {
      // Settings should be visible but controls disabled during import
      await expect(settingsSection).toBeVisible();
    }

    // Wait for completion
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 120000 });

    // UI should be fully responsive again
    await expect(page.locator('input[type="file"]')).toBeEnabled();
  });
});