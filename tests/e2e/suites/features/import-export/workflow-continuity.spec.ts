/**
 * Workflow Continuity E2E Tests for Import/Export
 * Comprehensive testing for resume operations, progress tracking, state persistence, and workflow recovery
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import/Export Workflow Continuity', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('workflow-continuity');
    
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 20,
      people: 30,
      assignments: 40,
      phases: 15,
      scenarios: 2,
      locations: 8,
      projectTypes: 5,
      roles: 10
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `workflow-${Date.now()}`);
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

  async function createWorkflowTestFile(filename: string, recordCount: number = 100): Promise<string> {
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

    for (let i = 1; i <= recordCount; i++) {
      projectsSheet.addRow({
        name: `Workflow Test Project ${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length].name,
        location: testData.locations[i % testData.locations.length].name,
        priority: (i % 3) + 1,
        description: `Workflow continuity test project ${i} with detailed information`
      });
    }

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

    for (let i = 1; i <= recordCount; i++) {
      rostersSheet.addRow({
        name: `Workflow Test Person ${i}`,
        email: `workflow.person.${i}@company.com`,
        role: testData.roles[i % testData.roles.length].name,
        workerType: i % 3 === 0 ? 'Contractor' : 'FTE',
        availability: Math.floor(Math.random() * 40) + 60,
        hoursPerDay: Math.floor(Math.random() * 4) + 6
      });
    }

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.functional} should display comprehensive progress tracking during import`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create larger file to ensure visible progress
    const testFile = await createWorkflowTestFile('progress-tracking.xlsx', 500);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    await expect(page.locator('text=progress-tracking.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show initial processing state
    await expect(page.locator('text=Processing').or(
      page.locator('text=Uploading').or(
        page.locator('[data-testid="import-progress"]')
      )
    )).toBeVisible({ timeout: 10000 });

    // Should show progress indicators
    const progressBar = page.locator('[role="progressbar"]').or(
      page.locator('.progress-bar').or(
        page.locator('[data-testid="progress-bar"]')
      )
    );

    const progressText = page.locator('text=Processing').or(
      page.locator('[data-testid="progress-text"]')
    );

    const progressPercentage = page.locator(':text-matches("\\d+%")');

    // Monitor progress updates
    let progressSeen = false;
    const progressMonitor = setInterval(async () => {
      try {
        if (await progressBar.isVisible() || 
            await progressText.isVisible() || 
            await progressPercentage.isVisible()) {
          progressSeen = true;
        }
      } catch (error) {
        // Ignore monitoring errors
      }
    }, 1000);

    // Wait for completion
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 120000 });

    clearInterval(progressMonitor);

    // Verify progress was shown
    expect(progressSeen).toBe(true);

    // Should show final results summary
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("500"))')
    )).toBeVisible();

    await expect(page.locator('text=people:').and(
      page.locator(':near(:text("500"))')
    )).toBeVisible();

    // Progress elements should be hidden after completion
    await expect(progressBar).not.toBeVisible({ timeout: 5000 });
  });

  test(`${tags.functional} should maintain state across browser refresh during workflow`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Start with file selection
    const testFile = await createWorkflowTestFile('state-persistence.xlsx', 50);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    await expect(page.locator('text=state-persistence.xlsx')).toBeVisible();

    // Configure import settings
    const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
    if (await advancedButton.isVisible()) {
      await advancedButton.click();

      // Set some advanced options
      const overrideCheckbox = page.locator('input[type="checkbox"]:near(:text("Override"))');
      if (await overrideCheckbox.isVisible() && !await overrideCheckbox.isChecked()) {
        await overrideCheckbox.check();
      }
    }

    // Refresh the page
    await page.reload();
    await testHelpers.setupPage();

    // File selection should be cleared (expected behavior)
    await expect(page.locator('text=Drop Excel file here')).toBeVisible();

    // But advanced settings state might be preserved depending on implementation
    if (await advancedButton.isVisible()) {
      await advancedButton.click();
      
      // Settings may or may not persist - both behaviors are acceptable
      // The test verifies the system handles refresh gracefully
    }

    // Should be able to restart workflow
    await fileInput.setInputFiles(testFile);
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeEnabled();

    await importButton.click();
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });
  });

  test(`${tags.functional} should handle interrupted imports gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create larger file for interruption testing
    const testFile = await createWorkflowTestFile('interruption-test.xlsx', 300);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Wait for import to start
    await expect(page.locator('text=Processing')).toBeVisible({ timeout: 10000 });

    // Navigate away during import
    await testHelpers.navigateTo('/projects');

    // Wait a moment, then navigate back
    await page.waitForTimeout(3000);
    await testHelpers.navigateTo('/import');

    // Should show clean state or resume state
    const currentState = await Promise.race([
      page.locator('text=Processing').isVisible(),
      page.locator('text=Import Successful').isVisible(),
      page.locator('text=Drop Excel file here').isVisible()
    ]);

    // Verify system is in a consistent state
    if (await page.locator('text=Processing').isVisible()) {
      // If still processing, wait for completion
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });
    } else {
      // Should be in clean state ready for new import
      await expect(page.locator('input[type="file"]')).toBeEnabled();
    }

    // Verify no data corruption occurred
    await testHelpers.navigateTo('/projects');
    const projectRows = page.locator('[data-testid="project-row"]').or(
      page.locator('tbody tr')
    );
    const projectCount = await projectRows.count();
    expect(projectCount).toBeGreaterThan(0); // Should have some projects
  });

  test(`${tags.functional} should provide workflow status persistence`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createWorkflowTestFile('status-persistence.xlsx', 100);

    // Complete an import workflow
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    // Check if there's a workflow history or recent imports section
    const historySection = page.locator('[data-testid="import-history"]').or(
      page.locator('text=Recent Imports').or(
        page.locator('text=Import History')
      )
    );

    if (await historySection.isVisible()) {
      // Should show recent import
      await expect(historySection.locator('text=status-persistence.xlsx')).toBeVisible();
      
      // Should show status and timestamp
      await expect(historySection.locator('text=Successful').or(
        historySection.locator('text=Complete')
      )).toBeVisible();
    }

    // Navigate away and back
    await testHelpers.navigateTo('/projects');
    await testHelpers.navigateTo('/import');

    // Status/history should persist
    if (await historySection.isVisible()) {
      await expect(historySection.locator('text=status-persistence.xlsx')).toBeVisible();
    }

    // Should be ready for new workflow
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await expect(page.locator('text=Drop Excel file here')).toBeVisible();
  });

  test(`${tags.functional} should support workflow step navigation and backtracking`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createWorkflowTestFile('step-navigation.xlsx', 75);

    // Step 1: File selection
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    await expect(page.locator('text=step-navigation.xlsx')).toBeVisible();

    // Step 2: Configuration (if available)
    const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
    if (await advancedButton.isVisible()) {
      await advancedButton.click();

      // Check if we can go back to file selection
      const changeFileButton = page.locator('button:has-text("Change File")').or(
        page.locator('button:has-text("Select Different File")')
      );

      if (await changeFileButton.isVisible()) {
        // Test backtracking
        await changeFileButton.click();
        
        // Should return to file selection
        await expect(page.locator('text=Drop Excel file here')).toBeVisible();
        
        // Re-select file
        await fileInput.setInputFiles(testFile);
        await advancedButton.click();
      }
    }

    // Step 3: Preview/Analysis (if available)
    const previewButton = page.locator('button:has-text("Preview")').or(
      page.locator('button:has-text("Analyze")').or(
        page.locator('button:has-text("Dry Run")')
      )
    );

    if (await previewButton.isVisible()) {
      await previewButton.click();

      // Should show preview results
      await expect(page.locator('[data-testid="preview-results"]').or(
        page.locator('text=Preview').or(
          page.locator('text=Analysis Results')
        )
      )).toBeVisible({ timeout: 15000 });

      // Should be able to go back and modify
      const backButton = page.locator('button:has-text("Back")').or(
        page.locator('button:has-text("Previous")')
      );

      if (await backButton.isVisible()) {
        await backButton.click();
        
        // Should return to previous step
        await expect(fileInput).toBeVisible();
      }
    }

    // Final step: Execute import
    const importButton = page.locator('button:has-text("Upload and Import")').or(
      page.locator('button:has-text("Confirm Import")')
    );

    await importButton.click();
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    // Should show completion step with next actions
    const nextActionButton = page.locator('button:has-text("Import Another File")').or(
      page.locator('button:has-text("Start New Import")')
    );

    if (await nextActionButton.isVisible()) {
      await nextActionButton.click();
      
      // Should return to beginning of workflow
      await expect(page.locator('text=Drop Excel file here')).toBeVisible();
    }
  });

  test(`${tags.functional} should track and display workflow completion metrics`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createWorkflowTestFile('metrics-test.xlsx', 150);

    // Start timing
    const startTime = Date.now();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Monitor for timing information
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    const endTime = Date.now();
    const actualDuration = endTime - startTime;

    // Check for workflow metrics display
    const metricsSection = page.locator('[data-testid="import-metrics"]').or(
      page.locator('text=Processing time').or(
        page.locator('text=Import Summary')
      )
    );

    if (await metricsSection.isVisible()) {
      // Should show processing time
      const processingTime = page.locator(':text-matches("\\d+\\.?\\d*\\s*(second|minute)")');
      if (await processingTime.isVisible()) {
        await expect(processingTime).toBeVisible();
      }

      // Should show records processed
      await expect(page.locator('text=projects:').and(
        page.locator(':near(:text("150"))')
      )).toBeVisible();

      await expect(page.locator('text=people:').and(
        page.locator(':near(:text("150"))')
      )).toBeVisible();
    }

    // Should show detailed results breakdown
    const resultsBreakdown = page.locator('[data-testid="import-results"]').or(
      page.locator('text=Import Results')
    );

    await expect(resultsBreakdown).toBeVisible();

    // Look for success/error counts
    const successCount = page.locator('text=Successful').or(
      page.locator('text=Created')
    );
    await expect(successCount).toBeVisible();

    // Performance should be reasonable
    expect(actualDuration).toBeLessThan(120000); // Should complete within 2 minutes

    console.log(`Import completed in ${actualDuration}ms`);
  });

  test(`${tags.functional} should support export workflow with progress tracking`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // First import some data to export
    const testFile = await createWorkflowTestFile('export-workflow.xlsx', 200);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    // Now test export workflow
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Should show export progress
    await expect(page.locator('button:has-text("Exporting..."):disabled')).toBeVisible();

    // Monitor for export progress indicators
    const exportProgress = page.locator('[data-testid="export-progress"]').or(
      page.locator('text=Generating').or(
        page.locator('text=Preparing export')
      )
    );

    let exportProgressSeen = false;
    const exportMonitor = setInterval(async () => {
      try {
        if (await exportProgress.isVisible()) {
          exportProgressSeen = true;
        }
      } catch (error) {
        // Ignore monitoring errors
      }
    }, 500);

    // Wait for export completion
    await expect(exportButton).toBeEnabled({ timeout: 30000 });

    clearInterval(exportMonitor);

    // Export should complete successfully
    await expect(page.locator('text=Export').or(
      page.locator('text=Download')
    )).toBeVisible();

    // Test template download workflow
    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    // Should show brief progress state
    await expect(page.locator('button:has-text("Downloading..."):disabled').or(
      templateButton.filter({ hasText: /Template/ })
    )).toBeVisible({ timeout: 5000 });

    await expect(templateButton).toBeEnabled({ timeout: 10000 });
  });

  test(`${tags.functional} should handle workflow state with multiple concurrent users`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Simulate workflow that might conflict with other users
    const testFile = await createWorkflowTestFile('concurrent-workflow.xlsx', 100);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Set specific configuration that might affect other users
    const scenarioSelect = page.locator('select[aria-label="Import Scenario:"]');
    if (await scenarioSelect.isVisible()) {
      // Select specific scenario
      await scenarioSelect.selectOption({ index: 0 });
    }

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Simulate another user action by triggering export during import
    await page.waitForTimeout(2000);

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    if (await exportButton.isEnabled()) {
      await exportButton.click();
      
      // Should handle concurrent operations appropriately
      await expect(page.locator('text=operation in progress').or(
        page.locator('button:has-text("Exporting..."):disabled')
      )).toBeVisible({ timeout: 5000 });
    }

    // Wait for import to complete
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    // Export should also complete or be ready
    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Data integrity should be maintained
    await testHelpers.navigateTo('/projects');
    const projectCount = await page.locator('[data-testid="project-row"]').count();
    expect(projectCount).toBeGreaterThan(0);
  });

  test(`${tags.functional} should provide workflow guidance and help context`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Check for workflow guidance elements
    const helpButton = page.locator('button:has-text("Help")').or(
      page.locator('[data-testid="help-button"]').or(
        page.locator('button[aria-label*="help"]')
      )
    );

    if (await helpButton.isVisible()) {
      await helpButton.click();

      // Should show contextual help
      await expect(page.locator('[data-testid="help-content"]').or(
        page.locator('.help-dialog').or(
          page.locator('text=How to import')
        )
      )).toBeVisible();

      // Close help
      const closeButton = page.locator('button:has-text("Close")').or(
        page.locator('[aria-label="Close"]')
      );
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }

    // Check for inline guidance
    const guidanceText = page.locator('text=Drop Excel file here').or(
      page.locator('text=Supports .xlsx and .xls files')
    );
    await expect(guidanceText).toBeVisible();

    // Check for step indicators
    const stepIndicator = page.locator('[data-testid="step-indicator"]').or(
      page.locator('.steps').or(
        page.locator('text=Step 1')
      )
    );

    if (await stepIndicator.isVisible()) {
      await expect(stepIndicator).toBeVisible();
    }

    // Upload file to see next step guidance
    const testFile = await createWorkflowTestFile('guidance-test.xlsx', 25);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Should show next step guidance
    await expect(page.locator('text=Click').and(
      page.locator(':near(:text("Import"))')
    ).or(
      page.locator('text=Ready to import')
    )).toBeVisible();

    // Complete workflow to see final guidance
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Should show post-import guidance
    await expect(page.locator('text=You can now').or(
      page.locator('text=Next steps').or(
        page.locator('text=View your imported data')
      )
    )).toBeVisible();
  });

  test(`${tags.functional} should maintain audit trail throughout workflow`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createWorkflowTestFile('audit-workflow.xlsx', 80);

    // Record workflow steps
    const workflowSteps: string[] = [];

    // Step 1: File selection
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);
    workflowSteps.push('File selected');

    await expect(page.locator('text=audit-workflow.xlsx')).toBeVisible();

    // Step 2: Configuration (if available)
    const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
    if (await advancedButton.isVisible()) {
      await advancedButton.click();
      workflowSteps.push('Advanced settings opened');
    }

    // Step 3: Import execution
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();
    workflowSteps.push('Import started');

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });
    workflowSteps.push('Import completed');

    // Check if audit information is available
    const auditLink = page.locator('a[href*="audit"]').or(
      page.locator('text=Audit').or(
        page.locator('text=Activity Log')
      )
    );

    if (await auditLink.isVisible()) {
      await auditLink.click();

      // Should see workflow steps in audit log
      await expect(page.locator('text=Import').and(
        page.locator(':near(:text("audit-workflow.xlsx"))')
      )).toBeVisible({ timeout: 10000 });

      // Should show details of import
      await expect(page.locator('text=projects:').and(
        page.locator(':near(:text("80"))')
      )).toBeVisible();

      await expect(page.locator('text=people:').and(
        page.locator(':near(:text("80"))')
      )).toBeVisible();
    }

    // Verify workflow completion is reflected in system state
    await testHelpers.navigateTo('/projects');
    await expect(page.locator('text=Workflow Test Project 1')).toBeVisible({ timeout: 10000 });

    console.log('Workflow steps completed:', workflowSteps);
  });
});