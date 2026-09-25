/**
 * Template Workflow Feature Test Suite
 * Tests for complete template download → fill → import workflows
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Template Workflow End-to-End', () => {
  let testContext: TestDataContext;
  let testData: any;
  let downloadPath: string;
  let tempFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage, page }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('template-workflow');
    
    // Create minimal base data for template workflow
    testData = await testDataHelpers.createBulkTestData(testContext, {
      locations: 2,
      projectTypes: 2,
      roles: 3,
      scenarios: 1
    });

    // Set up directories for file handling
    downloadPath = path.join(__dirname, '../../../downloads', `template-test-${Date.now()}`);
    tempFilesPath = path.join(__dirname, '../../../temp', `template-${Date.now()}`);
    await fs.mkdir(downloadPath, { recursive: true });
    await fs.mkdir(tempFilesPath, { recursive: true });

    // Navigate to import page
    await testHelpers.navigateTo('/import');
    await testHelpers.setupPage();
    
    // Wait for page to load
    await page.waitForSelector('[data-testid="export-section"]', { timeout: 10000 });
  });

  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up test data
    await testDataHelpers.cleanupTestContext(testContext);
    
    // Clean up downloaded and temporary files
    try {
      const cleanupPaths = [downloadPath, tempFilesPath];
      for (const cleanupPath of cleanupPaths) {
        const files = await fs.readdir(cleanupPath);
        for (const file of files) {
          await fs.unlink(path.join(cleanupPath, file));
        }
        await fs.rmdir(cleanupPath);
      }
    } catch (error) {
      // Directories might not exist or be empty
    }
  });

  test(`${tags.smoke} should download template and show proper structure`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Set up download listener
    let downloadedFilePath: string | null = null;
    page.on('download', async (download) => {
      downloadedFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(downloadedFilePath);
    });

    // Verify template section is visible
    await expect(page.locator('text=Download Blank Template')).toBeVisible();
    await expect(page.locator('text=Download Excel template for data import')).toBeVisible();

    // Download complete template
    const templateButton = page.locator('button:has-text("Download Template")');
    await expect(templateButton).toBeEnabled();
    await templateButton.click();

    // Wait for download
    await page.waitForTimeout(3000);
    expect(downloadedFilePath).toBeTruthy();

    if (downloadedFilePath) {
      // Verify file exists and has content
      const stats = await fs.stat(downloadedFilePath);
      expect(stats.size).toBeGreaterThan(1000);

      // Load and verify Excel structure
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadedFilePath);

      // Verify required worksheets
      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      expect(worksheetNames).toContain('Template Info');
      expect(worksheetNames).toContain('Instructions');
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');

      // Verify template info sheet
      const templateInfoSheet = workbook.getWorksheet('Template Info');
      expect(templateInfoSheet).toBeDefined();

      let foundTemplateType = false;
      templateInfoSheet!.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const property = row.getCell(1).value?.toString();
          const value = row.getCell(2).value?.toString();
          if (property === 'Template Type' && value === 'Capacinator Import Template') {
            foundTemplateType = true;
          }
        }
      });
      expect(foundTemplateType).toBe(true);

      // Verify instructions sheet has content
      const instructionsSheet = workbook.getWorksheet('Instructions');
      expect(instructionsSheet).toBeDefined();
      expect(instructionsSheet!.rowCount).toBeGreaterThan(1);
    }
  });

  test(`${tags.critical} should complete full template workflow: download → edit → import`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Step 1: Download template
    let templateFilePath: string | null = null;
    page.on('download', async (download) => {
      templateFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(templateFilePath);
    });

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    await page.waitForTimeout(3000);

    expect(templateFilePath).toBeTruthy();

    if (templateFilePath) {
      // Step 2: Edit template with new data
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templateFilePath);

      // Clear existing sample data and add new test data
      const projectsSheet = workbook.getWorksheet('Projects');
      // Clear sample data (keep headers)
      const projectRowCount = projectsSheet!.rowCount;
      for (let i = projectRowCount; i > 1; i--) {
        projectsSheet!.spliceRows(i, 1);
      }

      // Add new project data
      projectsSheet!.addRow({
        name: 'Template Workflow Project 1',
        project_type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1,
        description: 'Project created via template workflow',
        start_date: '2024-01-15',
        end_date: '2024-06-15'
      });

      projectsSheet!.addRow({
        name: 'Template Workflow Project 2',
        project_type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2,
        description: 'Second project from template',
        start_date: '2024-02-01',
        end_date: '2024-07-01'
      });

      // Add people data
      const rostersSheet = workbook.getWorksheet('Rosters');
      // Clear sample data
      const rosterRowCount = rostersSheet!.rowCount;
      for (let i = rosterRowCount; i > 1; i--) {
        rostersSheet!.spliceRows(i, 1);
      }

      rostersSheet!.addRow({
        name: 'Template Test Person 1',
        email: 'template1@workflow.test',
        primary_role: testData.roles[0].name,
        worker_type: 'FTE',
        availability: 100,
        hours_per_day: 8,
        start_date: '2024-01-01'
      });

      rostersSheet!.addRow({
        name: 'Template Test Person 2',
        email: 'template2@workflow.test',
        primary_role: testData.roles[1].name,
        worker_type: 'Contractor',
        availability: 75,
        hours_per_day: 6,
        start_date: '2024-01-15'
      });

      // Save modified template
      const modifiedTemplatePath = path.join(tempFilesPath, 'modified-template.xlsx');
      await workbook.xlsx.writeFile(modifiedTemplatePath);

      // Step 3: Import the modified template
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(modifiedTemplatePath);

      // Should show file is selected
      await expect(page.locator('text=modified-template.xlsx')).toBeVisible();

      // Verify import options and settings
      await expect(page.locator('text=Clear existing data before import')).toBeVisible();
      
      // Keep default settings and proceed with import
      const importButton = page.locator('button:has-text("Upload and Import")');
      await expect(importButton).toBeEnabled();
      await importButton.click();

      // Wait for import to complete
      await expect(page.locator('text=Import Successful').or(
        page.locator('text=Import Complete')
      )).toBeVisible({ timeout: 15000 });

      // Verify import results are displayed
      await expect(page.locator('text=projects:').and(
        page.locator(':near(:text("2"))')
      )).toBeVisible();

      await expect(page.locator('text=people:').and(
        page.locator(':near(:text("2"))')
      )).toBeVisible();

      // Step 4: Verify imported data by navigating to projects page
      await testHelpers.navigateTo('/projects');
      
      // Should see the imported projects
      await expect(page.locator('text=Template Workflow Project 1')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Template Workflow Project 2')).toBeVisible();
    }
  });

  test(`${tags.functional} should handle different template types correctly`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test minimal template
    await page.selectOption('select[aria-label="Template Type:"]', 'minimal');

    let downloadedFilePath: string | null = null;
    page.on('download', async (download) => {
      downloadedFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(downloadedFilePath);
    });

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    await page.waitForTimeout(3000);

    expect(downloadedFilePath).toBeTruthy();

    if (downloadedFilePath) {
      // Verify filename indicates minimal template
      expect(path.basename(downloadedFilePath)).toContain('minimal');

      // Load and verify minimal structure
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadedFilePath);

      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
      
      // Minimal template might have fewer worksheets
      const projectsSheet = workbook.getWorksheet('Projects');
      expect(projectsSheet).toBeDefined();
      expect(projectsSheet!.columnCount).toBeGreaterThan(3);
    }
  });

  test(`${tags.functional} should handle template options correctly`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Uncheck optional template options
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    const phasesCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Phase Timelines"))');

    if (await assignmentsCheckbox.isVisible()) {
      await assignmentsCheckbox.uncheck();
    }
    if (await phasesCheckbox.isVisible()) {
      await phasesCheckbox.uncheck();
    }

    let downloadedFilePath: string | null = null;
    page.on('download', async (download) => {
      downloadedFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(downloadedFilePath);
    });

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    await page.waitForTimeout(3000);

    if (downloadedFilePath) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadedFilePath);

      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      
      // Should have core worksheets
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
      
      // Should NOT have optional worksheets when unchecked
      expect(worksheetNames).not.toContain('Project Assignments');
      expect(worksheetNames).not.toContain('Project Phase Timelines');
    }
  });

  test(`${tags.edge_case} should handle template import with missing data gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create a template file with incomplete data
    const workbook = new ExcelJS.Workbook();
    
    // Add template info (required for recognition)
    const templateInfoSheet = workbook.addWorksheet('Template Info');
    templateInfoSheet.columns = [
      { header: 'Property', key: 'property', width: 20 },
      { header: 'Value', key: 'value', width: 30 }
    ];
    templateInfoSheet.addRows([
      { property: 'Template Type', value: 'Capacinator Import Template' },
      { property: 'Version', value: '1.0' },
      { property: 'Generated', value: new Date().toISOString() }
    ]);

    // Add only projects sheet (missing Rosters)
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    projectsSheet.addRow({
      name: 'Incomplete Template Project',
      type: testData.projectTypes[0].name,
      location: testData.locations[0].name,
      priority: 2
    });

    const incompleteTemplatePath = path.join(tempFilesPath, 'incomplete-template.xlsx');
    await workbook.xlsx.writeFile(incompleteTemplatePath);

    // Upload incomplete template
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(incompleteTemplatePath);

    await expect(page.locator('text=incomplete-template.xlsx')).toBeVisible();

    // Try to import
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show validation warnings about missing worksheets
    await expect(page.locator('text=Warning').or(
      page.locator('text=Missing').or(
        page.locator('text=worksheet')
      )
    )).toBeVisible({ timeout: 10000 });

    // Should still allow import with warnings
    const proceedButton = page.locator('button:has-text("Import Anyway")').or(
      page.locator('button:has-text("Continue")')
    );
    
    if (await proceedButton.isVisible()) {
      await proceedButton.click();
      
      // Should show success for what was imported
      await expect(page.locator('text=Import').and(
        page.locator(':near(:text("Complete"))')
      )).toBeVisible({ timeout: 10000 });
    }
  });

  test(`${tags.accessibility} should provide accessible template workflow`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Verify template section has proper labels
    await expect(page.locator('label:has-text("Template Type:")')).toBeVisible();
    
    const templateSelect = page.locator('select[aria-label="Template Type:"]');
    await expect(templateSelect).toBeVisible();

    // Test keyboard navigation
    await templateSelect.focus();
    await expect(templateSelect).toBeFocused();

    // Navigate to template options
    await page.keyboard.press('Tab');
    
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    if (await assignmentsCheckbox.isVisible()) {
      await expect(assignmentsCheckbox).toBeFocused();
      
      // Test checkbox toggle with keyboard
      await page.keyboard.press('Space');
    }

    // Navigate to download button
    await page.keyboard.press('Tab');
    const templateButton = page.locator('button:has-text("Download Template")');
    await expect(templateButton).toBeFocused();

    // Verify button is keyboard accessible
    await expect(templateButton).toBeEnabled();
  });

  test(`${tags.performance} should handle template generation and import efficiently`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Measure template download time
    const downloadStartTime = Date.now();
    
    let downloadedFilePath: string | null = null;
    page.on('download', async (download) => {
      downloadedFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(downloadedFilePath);
    });

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    await page.waitForTimeout(3000);

    const downloadTime = Date.now() - downloadStartTime;
    
    expect(downloadedFilePath).toBeTruthy();
    expect(downloadTime).toBeLessThan(10000); // Should download within 10 seconds

    if (downloadedFilePath) {
      // Create a moderately large dataset for performance testing
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadedFilePath);

      // Add multiple projects and people
      const projectsSheet = workbook.getWorksheet('Projects');
      const rostersSheet = workbook.getWorksheet('Rosters');

      // Clear existing data
      const projectRowCount = projectsSheet!.rowCount;
      for (let i = projectRowCount; i > 1; i--) {
        projectsSheet!.spliceRows(i, 1);
      }

      const rosterRowCount = rostersSheet!.rowCount;
      for (let i = rosterRowCount; i > 1; i--) {
        rostersSheet!.spliceRows(i, 1);
      }

      // Add 25 projects and 25 people
      for (let i = 1; i <= 25; i++) {
        projectsSheet!.addRow({
          name: `Performance Project ${i}`,
          project_type: testData.projectTypes[i % testData.projectTypes.length].name,
          location: testData.locations[i % testData.locations.length].name,
          priority: (i % 3) + 1,
          description: `Performance test project ${i}`
        });

        rostersSheet!.addRow({
          name: `Performance Person ${i}`,
          email: `perf${i}@test.com`,
          primary_role: testData.roles[i % testData.roles.length].name,
          worker_type: i % 2 === 0 ? 'FTE' : 'Contractor',
          availability: 100,
          hours_per_day: 8
        });
      }

      const perfTestPath = path.join(tempFilesPath, 'performance-template.xlsx');
      await workbook.xlsx.writeFile(perfTestPath);

      // Measure import time
      const importStartTime = Date.now();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(perfTestPath);

      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.click();

      // Wait for import completion
      await expect(page.locator('text=Import Successful').or(
        page.locator('text=Import Complete')
      )).toBeVisible({ timeout: 30000 });

      const importTime = Date.now() - importStartTime;
      expect(importTime).toBeLessThan(20000); // Should import within 20 seconds

      // Verify large dataset was imported correctly
      await expect(page.locator('text=projects:').and(
        page.locator(':near(:text("25"))')
      )).toBeVisible();
    }
  });

  test(`${tags.error_handling} should handle template errors gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Mock network failure for template download
    await page.route('/api/import/export/template*', (route) => {
      route.abort('failed');
    });

    // Set up alert handler
    let alertMessage = '';
    page.on('dialog', async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    // Wait for error
    await page.waitForTimeout(2000);
    
    // Should show error to user
    expect(alertMessage).toContain('failed');

    // Button should return to enabled state
    await expect(templateButton).toBeEnabled();
  });

  test(`${tags.integration} should work with import settings integration`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Download template
    let templateFilePath: string | null = null;
    page.on('download', async (download) => {
      templateFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(templateFilePath);
    });

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    await page.waitForTimeout(3000);

    if (templateFilePath) {
      // Modify import settings before importing
      const clearExistingCheckbox = page.locator('input[type="checkbox"]:near(:text("Clear existing data"))');
      if (await clearExistingCheckbox.isVisible()) {
        await clearExistingCheckbox.check();
      }

      // Show advanced settings and modify
      const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
      if (await advancedButton.isVisible()) {
        await advancedButton.click();
        
        const autoCreateRolesCheckbox = page.locator('input[type="checkbox"]:near(:text("Auto-create missing roles"))');
        if (await autoCreateRolesCheckbox.isVisible()) {
          await autoCreateRolesCheckbox.check();
        }
      }

      // Fill template with data that would require these settings
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templateFilePath);

      const projectsSheet = workbook.getWorksheet('Projects');
      const rostersSheet = workbook.getWorksheet('Rosters');

      // Clear existing data
      const projectRowCount = projectsSheet!.rowCount;
      for (let i = projectRowCount; i > 1; i--) {
        projectsSheet!.spliceRows(i, 1);
      }

      // Add project with new role that doesn't exist
      projectsSheet!.addRow({
        name: 'Settings Test Project',
        project_type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      });

      const rosterRowCount = rostersSheet!.rowCount;
      for (let i = rosterRowCount; i > 1; i--) {
        rostersSheet!.spliceRows(i, 1);
      }

      rostersSheet!.addRow({
        name: 'Settings Test Person',
        email: 'settings@test.com',
        primary_role: 'Non-Existent Role', // This should be auto-created due to settings
        worker_type: 'FTE',
        availability: 100,
        hours_per_day: 8
      });

      const settingsTestPath = path.join(tempFilesPath, 'settings-template.xlsx');
      await workbook.xlsx.writeFile(settingsTestPath);

      // Import with modified settings
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(settingsTestPath);

      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.click();

      // Should complete successfully with auto-created role
      await expect(page.locator('text=Import Successful').or(
        page.locator('text=Import Complete')
      )).toBeVisible({ timeout: 15000 });
    }
  });
});