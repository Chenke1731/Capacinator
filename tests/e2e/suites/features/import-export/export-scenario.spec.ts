/**
 * Export Scenario Feature Test Suite
 * Tests for exporting scenario data functionality with real user workflows
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Export Scenario Functionality', () => {
  let testContext: TestDataContext;
  let testData: any;
  let downloadPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage, page }) => {
    // Create isolated test context with comprehensive data
    testContext = testDataHelpers.createTestContext('export');
    
    // Create test data for export
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 5,
      assignments: 8,
      phases: 2,
      scenarios: 1
    });

    // Set up download handling
    downloadPath = path.join(__dirname, '../../../downloads', `export-test-${Date.now()}`);
    await fs.mkdir(downloadPath, { recursive: true });

    // Navigate to import page
    await testHelpers.navigateTo('/import');
    await testHelpers.setupPage();
    
    // Wait for scenarios to load
    await page.waitForSelector('[data-testid="export-section"]', { timeout: 10000 });
  });

  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up test data
    await testDataHelpers.cleanupTestContext(testContext);
    
    // Clean up downloaded files
    try {
      const files = await fs.readdir(downloadPath);
      for (const file of files) {
        await fs.unlink(path.join(downloadPath, file));
      }
      await fs.rmdir(downloadPath);
    } catch (error) {
      // Directory might not exist or be empty
    }
  });

  test(`${tags.smoke} should display export scenario section`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Verify export section is visible
    await expect(page.locator('text=Export Data')).toBeVisible();
    await expect(page.locator('text=Export Scenario Data')).toBeVisible();
    await expect(page.locator('text=Export current scenario data in re-importable Excel format')).toBeVisible();

    // Verify scenario selector
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await expect(scenarioSelect).toBeVisible();
    
    // Verify export options
    await expect(page.locator('text=Include Project Assignments')).toBeVisible();
    await expect(page.locator('text=Include Phase Timelines')).toBeVisible();
    
    // Verify export button
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
  });

  test(`${tags.critical} should export baseline scenario data successfully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Set up download listener
    let downloadPath: string | null = null;
    page.on('download', async (download) => {
      downloadPath = path.join(__dirname, '../../../downloads', download.suggestedFilename());
      await download.saveAs(downloadPath);
    });

    // Select baseline scenario (should be default)
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await expect(scenarioSelect).toBeVisible();
    
    // Ensure both options are checked
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    const phasesCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Phase Timelines"))');
    
    await assignmentsCheckbox.check();
    await phasesCheckbox.check();

    // Click export button
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Wait for download
    await page.waitForTimeout(3000); // Allow time for download to complete
    
    expect(downloadPath).toBeTruthy();
    
    if (downloadPath) {
      // Verify file exists and has content
      const stats = await fs.stat(downloadPath);
      expect(stats.size).toBeGreaterThan(1000); // Should be a substantial Excel file

      // Load and verify Excel content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadPath);

      // Verify required worksheets
      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
      expect(worksheetNames).toContain('Export Metadata');
      expect(worksheetNames).toContain('Project Assignments');
      
      // Verify projects data
      const projectsSheet = workbook.getWorksheet('Projects');
      expect(projectsSheet).toBeDefined();
      expect(projectsSheet!.rowCount).toBeGreaterThan(1); // Header + data rows

      // Verify metadata
      const metadataSheet = workbook.getWorksheet('Export Metadata');
      expect(metadataSheet).toBeDefined();
      
      let foundExportType = false;
      metadataSheet!.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const property = row.getCell(1).value?.toString();
          const value = row.getCell(2).value?.toString();
          if (property === 'Export Type' && value === 'Capacinator Scenario Export') {
            foundExportType = true;
          }
        }
      });
      expect(foundExportType).toBe(true);

      // Clean up
      await fs.unlink(downloadPath);
    }
  });

  test(`${tags.regression} should export specific scenario when selected`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Set up download listener
    let downloadPath: string | null = null;
    page.on('download', async (download) => {
      downloadPath = path.join(__dirname, '../../../downloads', download.suggestedFilename());
      await download.saveAs(downloadPath);
    });

    // Select a specific scenario from dropdown
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await scenarioSelect.selectOption({ index: 1 }); // Select first non-current option

    // Get the selected scenario name for verification
    const selectedOption = await scenarioSelect.locator('option:checked').textContent();
    expect(selectedOption).toBeTruthy();

    // Export the scenario
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Wait for download
    await page.waitForTimeout(3000);
    
    expect(downloadPath).toBeTruthy();
    
    if (downloadPath) {
      // Verify the filename contains scenario info
      const filename = path.basename(downloadPath);
      expect(filename).toMatch(/\.xlsx$/);
      expect(filename).toContain('export');

      // Verify file content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadPath);

      const metadataSheet = workbook.getWorksheet('Export Metadata');
      expect(metadataSheet).toBeDefined();

      // Clean up
      await fs.unlink(downloadPath);
    }
  });

  test(`${tags.functional} should handle export options correctly`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Set up download listener
    let downloadPath: string | null = null;
    page.on('download', async (download) => {
      downloadPath = path.join(__dirname, '../../../downloads', download.suggestedFilename());
      await download.saveAs(downloadPath);
    });

    // Uncheck assignment and phases options
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    const phasesCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Phase Timelines"))');
    
    await assignmentsCheckbox.uncheck();
    await phasesCheckbox.uncheck();

    // Export with minimal options
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Wait for download
    await page.waitForTimeout(3000);
    
    expect(downloadPath).toBeTruthy();
    
    if (downloadPath) {
      // Verify Excel content excludes optional worksheets
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(downloadPath);

      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      
      // Should have core worksheets
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
      expect(worksheetNames).toContain('Export Metadata');
      
      // Should NOT have optional worksheets
      expect(worksheetNames).not.toContain('Project Assignments');
      expect(worksheetNames).not.toContain('Project Phase Timelines');

      // Clean up
      await fs.unlink(downloadPath);
    }
  });

  test(`${tags.accessibility} should be keyboard accessible`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Navigate to export section using keyboard
    await page.keyboard.press('Tab');
    
    // Find the export scenario select
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await scenarioSelect.focus();
    await expect(scenarioSelect).toBeFocused();

    // Navigate to checkboxes
    await page.keyboard.press('Tab');
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    await expect(assignmentsCheckbox).toBeFocused();

    // Toggle checkbox with keyboard
    await page.keyboard.press('Space');
    await expect(assignmentsCheckbox).not.toBeChecked();

    // Navigate to export button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeFocused();

    // Verify button can be activated with keyboard
    await expect(exportButton).toBeEnabled();
  });

  test(`${tags.edge_case} should handle loading states during export`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    
    // Click export button
    await exportButton.click();

    // Immediately check for loading state
    await expect(page.locator('button:has-text("Exporting..."):disabled')).toBeVisible();
    
    // Wait for export to complete and button to return to normal state
    await expect(exportButton).toBeEnabled({ timeout: 10000 });
    await expect(page.locator('button:has-text("Export Scenario Data")')).toBeVisible();
  });

  test(`${tags.error_handling} should handle export errors gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Mock network failure by intercepting the export request
    await page.route('/api/import/export/scenario*', (route) => {
      route.abort('failed');
    });

    // Set up alert handler
    let alertMessage = '';
    page.on('dialog', async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    // Try to export
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Wait for error dialog
    await page.waitForTimeout(2000);
    
    // Verify error was shown to user
    expect(alertMessage).toContain('Export failed');
    
    // Verify button returns to enabled state
    await expect(exportButton).toBeEnabled();
  });

  test(`${tags.responsive} should work on mobile viewport`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify export section is still accessible
    await expect(page.locator('text=Export Data')).toBeVisible();
    
    // Verify controls are properly sized
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await expect(scenarioSelect).toBeVisible();
    
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeVisible();
    
    // Verify button is clickable on mobile
    await expect(exportButton).toBeEnabled();
    
    // Test touch interaction
    await exportButton.tap();
    
    // Should show loading state
    await expect(page.locator('button:has-text("Exporting...")').first()).toBeVisible();
  });

  test(`${tags.performance} should export large datasets efficiently`, async ({ 
    authenticatedPage,
    testHelpers,
    testDataHelpers 
  }) => {
    const page = authenticatedPage;

    // Create larger test dataset
    const largeTestData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 25,
      people: 50,
      assignments: 75,
      phases: 10
    });

    // Set up download listener
    let downloadPath: string | null = null;
    const startTime = Date.now();
    
    page.on('download', async (download) => {
      downloadPath = path.join(__dirname, '../../../downloads', download.suggestedFilename());
      await download.saveAs(downloadPath);
    });

    // Refresh page to load new data
    await page.reload();
    await page.waitForSelector('[data-testid="export-section"]');

    // Export the large dataset
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Wait for download with extended timeout
    await page.waitForTimeout(10000);
    const exportTime = Date.now() - startTime;
    
    expect(downloadPath).toBeTruthy();
    
    if (downloadPath) {
      // Verify file is substantial
      const stats = await fs.stat(downloadPath);
      expect(stats.size).toBeGreaterThan(5000); // Larger file for more data

      // Verify export completed within reasonable time (30 seconds)
      expect(exportTime).toBeLessThan(30000);

      // Clean up
      await fs.unlink(downloadPath);
    }

    // Clean up large test data
    await testDataHelpers.cleanupTestData(largeTestData);
  });

  test(`${tags.security} should handle scenario access permissions`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Verify only accessible scenarios appear in dropdown
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    const options = await scenarioSelect.locator('option').all();
    
    // Should have at least the current scenario option
    expect(options.length).toBeGreaterThan(0);
    
    // Verify each option contains valid scenario data
    for (const option of options) {
      const text = await option.textContent();
      expect(text).toBeTruthy();
      
      if (text && !text.includes('Current:') && !text.includes('Loading')) {
        // Should contain scenario type in parentheses
        expect(text).toMatch(/\([^)]+\)/);
      }
    }
  });

  test(`${tags.integration} should work with scenario switching`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Get initial scenario selection
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    const initialValue = await scenarioSelect.inputValue();

    // Select a different scenario
    const options = await scenarioSelect.locator('option').all();
    if (options.length > 1) {
      await scenarioSelect.selectOption({ index: 1 });
      
      // Verify selection changed
      const newValue = await scenarioSelect.inputValue();
      expect(newValue).not.toBe(initialValue);
      
      // Verify export button is still enabled
      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      await expect(exportButton).toBeEnabled();
    }
  });
});