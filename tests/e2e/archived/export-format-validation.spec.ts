/**
 * Export Format Validation E2E Tests
 * Comprehensive testing for Excel structure, CSV formatting, metadata integrity, and file standards
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Export Format Validation', () => {
  let testContext: TestDataContext;
  let testData: any;
  let downloadPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage, page }) => {
    // Create isolated test context with comprehensive data
    testContext = testDataHelpers.createTestContext('export-format-validation');
    
    // Create rich test data for export validation
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 10,
      people: 15,
      assignments: 20,
      phases: 5,
      scenarios: 2,
      locations: 4,
      projectTypes: 3,
      roles: 6
    });

    // Set up download directory
    downloadPath = path.join(__dirname, '../../../downloads', `format-validation-${Date.now()}`);
    await fs.mkdir(downloadPath, { recursive: true });

    await testHelpers.navigateTo('/import');
    await testHelpers.setupPage();
    
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
      // Directory might not exist
    }
  });

  async function downloadAndValidateTemplate(page: any, templateType: string = 'complete'): Promise<string> {
    let downloadedFilePath: string | null = null;
    
    // Set up download listener
    page.on('download', async (download: any) => {
      downloadedFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(downloadedFilePath);
    });

    // Configure template options
    if (templateType !== 'complete') {
      await page.selectOption('select[aria-label="Template Type:"]', templateType);
    }

    // Download template
    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    
    // Wait for download
    await page.waitForTimeout(3000);
    
    if (!downloadedFilePath) {
      throw new Error('Template download failed');
    }
    
    return downloadedFilePath;
  }

  async function downloadAndValidateScenario(page: any, options: any = {}): Promise<string> {
    let downloadedFilePath: string | null = null;
    
    // Set up download listener
    page.on('download', async (download: any) => {
      downloadedFilePath = path.join(downloadPath, download.suggestedFilename());
      await download.saveAs(downloadedFilePath);
    });

    // Configure export options
    if (options.includeAssignments === false) {
      await page.uncheck('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    }
    if (options.includePhases === false) {
      await page.uncheck('input[type="checkbox"]:near(:text("Include Phase Timelines"))');
    }

    // Export scenario
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();
    
    // Wait for download
    await page.waitForTimeout(3000);
    
    if (!downloadedFilePath) {
      throw new Error('Scenario export failed');
    }
    
    return downloadedFilePath;
  }

  test(`${tags.critical} should generate valid Excel template with proper structure`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const templateFile = await downloadAndValidateTemplate(page, 'complete');

    // Verify file exists and has content
    const stats = await fs.stat(templateFile);
    expect(stats.size).toBeGreaterThan(5000); // Should be substantial

    // Load and validate Excel structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templateFile);

    // Verify required worksheets exist
    const worksheetNames = workbook.worksheets.map(ws => ws.name);
    expect(worksheetNames).toContain('Template Info');
    expect(worksheetNames).toContain('Instructions');
    expect(worksheetNames).toContain('Projects');
    expect(worksheetNames).toContain('Rosters');

    // Validate Template Info sheet structure
    const templateInfoSheet = workbook.getWorksheet('Template Info');
    expect(templateInfoSheet).toBeDefined();
    expect(templateInfoSheet!.rowCount).toBeGreaterThan(1);

    // Verify metadata properties
    let foundTemplateType = false;
    let foundVersion = false;
    let foundGenerated = false;

    templateInfoSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        const property = row.getCell(1).value?.toString();
        const value = row.getCell(2).value?.toString();
        
        if (property === 'Template Type' && value === 'Capacinator Import Template') {
          foundTemplateType = true;
        }
        if (property === 'Version') {
          foundVersion = true;
          expect(value).toMatch(/^\d+\.\d+$/); // Should be version format like "1.0"
        }
        if (property === 'Generated') {
          foundGenerated = true;
          expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO date format
        }
      }
    });

    expect(foundTemplateType).toBe(true);
    expect(foundVersion).toBe(true);
    expect(foundGenerated).toBe(true);

    // Validate Projects sheet structure
    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet).toBeDefined();
    expect(projectsSheet!.columnCount).toBeGreaterThan(4);

    // Verify required columns exist
    const projectsHeaders = projectsSheet!.getRow(1).values as any[];
    expect(projectsHeaders).toContain('Project Name *');
    expect(projectsHeaders).toContain('Project Type');
    expect(projectsHeaders).toContain('Location');
    expect(projectsHeaders).toContain('Priority');

    // Validate Rosters sheet structure
    const rostersSheet = workbook.getWorksheet('Rosters');
    expect(rostersSheet).toBeDefined();
    expect(rostersSheet!.columnCount).toBeGreaterThan(3);

    // Verify required columns exist
    const rostersHeaders = rostersSheet!.getRow(1).values as any[];
    expect(rostersHeaders).toContain('Name *');
    expect(rostersHeaders).toContain('Email *');
    expect(rostersHeaders).toContain('Primary Role');

    // Validate Instructions sheet has content
    const instructionsSheet = workbook.getWorksheet('Instructions');
    expect(instructionsSheet).toBeDefined();
    expect(instructionsSheet!.rowCount).toBeGreaterThan(5);

    // Verify workbook metadata
    expect(workbook.creator).toBe('Capacinator');
    expect(workbook.properties.title).toBe('Capacinator Import Template');
    expect(workbook.properties.subject).toBe('Capacinator Data Import Template');
  });

  test(`${tags.critical} should generate valid scenario export with proper data structure`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const scenarioFile = await downloadAndValidateScenario(page, {
      includeAssignments: true,
      includePhases: true
    });

    // Verify file exists and has content
    const stats = await fs.stat(scenarioFile);
    expect(stats.size).toBeGreaterThan(5000);

    // Load and validate Excel structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(scenarioFile);

    // Verify required worksheets for full export
    const worksheetNames = workbook.worksheets.map(ws => ws.name);
    expect(worksheetNames).toContain('Export Metadata');
    expect(worksheetNames).toContain('Projects');
    expect(worksheetNames).toContain('Rosters');
    expect(worksheetNames).toContain('Project Assignments');

    // Validate Export Metadata sheet
    const metadataSheet = workbook.getWorksheet('Export Metadata');
    expect(metadataSheet).toBeDefined();

    let foundExportType = false;
    let foundScenarioInfo = false;
    let foundExportDate = false;

    metadataSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const property = row.getCell(1).value?.toString();
        const value = row.getCell(2).value?.toString();
        
        if (property === 'Export Type' && value === 'Capacinator Scenario Export') {
          foundExportType = true;
        }
        if (property === 'Scenario Name') {
          foundScenarioInfo = true;
          expect(value).toBeTruthy();
        }
        if (property === 'Export Date') {
          foundExportDate = true;
          expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        }
      }
    });

    expect(foundExportType).toBe(true);
    expect(foundScenarioInfo).toBe(true);
    expect(foundExportDate).toBe(true);

    // Validate Projects sheet has actual data
    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet).toBeDefined();
    expect(projectsSheet!.rowCount).toBeGreaterThan(1); // Header + data

    // Verify data integrity in projects
    let projectDataFound = false;
    projectsSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        const projectName = row.getCell(1).value?.toString();
        if (projectName && projectName.trim() !== '') {
          projectDataFound = true;
          // Verify all required fields have values
          expect(row.getCell(2).value).toBeTruthy(); // Project Type
          expect(row.getCell(4).value).toBeTruthy(); // Location
        }
      }
    });
    expect(projectDataFound).toBe(true);

    // Validate Rosters sheet has actual data
    const rostersSheet = workbook.getWorksheet('Rosters');
    expect(rostersSheet).toBeDefined();
    expect(rostersSheet!.rowCount).toBeGreaterThan(1);

    // Verify data integrity in rosters
    let rosterDataFound = false;
    rostersSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const personName = row.getCell(1).value?.toString();
        if (personName && personName.trim() !== '') {
          rosterDataFound = true;
          // Verify email format
          const email = row.getCell(2).value?.toString();
          expect(email).toMatch(/@/); // Basic email validation
        }
      }
    });
    expect(rosterDataFound).toBe(true);
  });

  test(`${tags.functional} should generate different template types with appropriate structure`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test complete template
    const completeTemplate = await downloadAndValidateTemplate(page, 'complete');
    const completeWorkbook = new ExcelJS.Workbook();
    await completeWorkbook.xlsx.readFile(completeTemplate);
    const completeSheets = completeWorkbook.worksheets.map(ws => ws.name);

    // Test minimal template
    const minimalTemplate = await downloadAndValidateTemplate(page, 'minimal');
    const minimalWorkbook = new ExcelJS.Workbook();
    await minimalWorkbook.xlsx.readFile(minimalTemplate);
    const minimalSheets = minimalWorkbook.worksheets.map(ws => ws.name);

    // Complete template should have more sheets
    expect(completeSheets.length).toBeGreaterThan(minimalSheets.length);

    // Both should have core sheets
    expect(completeSheets).toContain('Projects');
    expect(completeSheets).toContain('Rosters');
    expect(minimalSheets).toContain('Projects');
    expect(minimalSheets).toContain('Rosters');

    // Complete should have additional features
    expect(completeSheets).toContain('Instructions');
    expect(completeSheets).toContain('Template Info');

    // Verify filename conventions
    expect(path.basename(completeTemplate)).toContain('complete');
    expect(path.basename(minimalTemplate)).toContain('minimal');
  });

  test(`${tags.functional} should respect export option selections`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test export without assignments and phases
    const minimalExport = await downloadAndValidateScenario(page, {
      includeAssignments: false,
      includePhases: false
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(minimalExport);
    const worksheetNames = workbook.worksheets.map(ws => ws.name);

    // Should have core sheets
    expect(worksheetNames).toContain('Export Metadata');
    expect(worksheetNames).toContain('Projects');
    expect(worksheetNames).toContain('Rosters');

    // Should NOT have optional sheets
    expect(worksheetNames).not.toContain('Project Assignments');
    expect(worksheetNames).not.toContain('Project Phase Timelines');
  });

  test(`${tags.validation} should generate files with proper Excel MIME type and headers`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Monitor network response for template download
    let responseHeaders: any = {};
    page.on('response', response => {
      if (response.url().includes('/template')) {
        responseHeaders = response.headers();
      }
    });

    const templateFile = await downloadAndValidateTemplate(page);

    // Verify HTTP headers
    expect(responseHeaders['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(responseHeaders['content-disposition']).toContain('attachment');
    expect(responseHeaders['content-disposition']).toContain('.xlsx');

    // Verify file format
    const fileBuffer = await fs.readFile(templateFile);
    const header = fileBuffer.toString('hex', 0, 4);
    expect(header).toBe('504b0304'); // ZIP file signature (Excel is ZIP-based)
  });

  test(`${tags.validation} should maintain data type integrity in exports`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const scenarioFile = await downloadAndValidateScenario(page);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(scenarioFile);

    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet).toBeDefined();

    // Validate data types in exported data
    projectsSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        const priority = row.getCell(3).value; // Priority column
        if (priority !== null && priority !== undefined) {
          // Priority should be a number
          expect(typeof priority).toBe('number');
          expect(priority).toBeGreaterThanOrEqual(1);
          expect(priority).toBeLessThanOrEqual(3);
        }
      }
    });

    const rostersSheet = workbook.getWorksheet('Rosters');
    expect(rostersSheet).toBeDefined();

    // Validate data types in rosters
    rostersSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const availability = row.getCell(5).value; // Availability % column
        if (availability !== null && availability !== undefined) {
          // Availability should be a number
          expect(typeof availability).toBe('number');
          expect(availability).toBeGreaterThanOrEqual(0);
          expect(availability).toBeLessThanOrEqual(100);
        }

        const hoursPerDay = row.getCell(6).value; // Hours per day column
        if (hoursPerDay !== null && hoursPerDay !== undefined) {
          expect(typeof hoursPerDay).toBe('number');
          expect(hoursPerDay).toBeGreaterThan(0);
          expect(hoursPerDay).toBeLessThanOrEqual(24);
        }
      }
    });
  });

  test(`${tags.validation} should generate files with proper naming conventions`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test template naming
    const templateFile = await downloadAndValidateTemplate(page, 'complete');
    const templateFilename = path.basename(templateFile);
    
    expect(templateFilename).toMatch(/^capacinator_import_template_complete_\d{4}-\d{2}-\d{2}\.xlsx$/);

    // Test scenario export naming
    const scenarioFile = await downloadAndValidateScenario(page);
    const scenarioFilename = path.basename(scenarioFile);
    
    expect(scenarioFilename).toMatch(/\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(scenarioFilename).toContain('export');
  });

  test(`${tags.validation} should handle special characters in export data`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test data with special characters (this would need test data helper enhancement)
    const scenarioFile = await downloadAndValidateScenario(page);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(scenarioFile);

    // Verify Excel can handle the file without corruption
    expect(workbook.worksheets.length).toBeGreaterThan(0);

    // Check that data is properly encoded
    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet).toBeDefined();

    // Verify no encoding issues with cell values
    projectsSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const projectName = row.getCell(1).value?.toString();
        if (projectName) {
          // Should not contain encoding artifacts
          expect(projectName).not.toMatch(/[��]/);
          expect(projectName).not.toMatch(/&amp;|&lt;|&gt;/);
        }
      }
    });
  });

  test(`${tags.performance} should generate files efficiently with large datasets`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create additional test data for performance testing
    const largeTestData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 50,
      people: 100,
      assignments: 150
    });

    // Measure export time
    const startTime = Date.now();
    
    const scenarioFile = await downloadAndValidateScenario(page);
    
    const exportTime = Date.now() - startTime;

    // Should complete within reasonable time (30 seconds)
    expect(exportTime).toBeLessThan(30000);

    // Verify file is substantial but not excessive
    const stats = await fs.stat(scenarioFile);
    expect(stats.size).toBeGreaterThan(10000); // > 10KB
    expect(stats.size).toBeLessThan(50000000); // < 50MB

    // Verify data integrity wasn't compromised for performance
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(scenarioFile);
    
    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet!.rowCount).toBeGreaterThan(50); // Should have at least 50 projects + header

    // Clean up large test data
    await testDataHelpers.cleanupTestData(largeTestData);
  });

  test(`${tags.regression} should maintain format consistency across multiple exports`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Generate multiple exports
    const export1 = await downloadAndValidateScenario(page);
    await page.waitForTimeout(1000); // Brief pause
    const export2 = await downloadAndValidateScenario(page);

    // Load both files
    const workbook1 = new ExcelJS.Workbook();
    await workbook1.xlsx.readFile(export1);
    
    const workbook2 = new ExcelJS.Workbook();
    await workbook2.xlsx.readFile(export2);

    // Should have identical structure
    const sheets1 = workbook1.worksheets.map(ws => ws.name).sort();
    const sheets2 = workbook2.worksheets.map(ws => ws.name).sort();
    expect(sheets1).toEqual(sheets2);

    // Should have same column structure
    const projects1 = workbook1.getWorksheet('Projects');
    const projects2 = workbook2.getWorksheet('Projects');
    
    expect(projects1!.columnCount).toBe(projects2!.columnCount);

    // Headers should be identical
    const headers1 = projects1!.getRow(1).values;
    const headers2 = projects2!.getRow(1).values;
    expect(headers1).toEqual(headers2);
  });

  test(`${tags.edge_case} should handle empty scenario export gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create scenario with minimal data
    const emptyTestData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 0,
      people: 0,
      assignments: 0
    });

    const scenarioFile = await downloadAndValidateScenario(page);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(scenarioFile);

    // Should still have proper structure
    const worksheetNames = workbook.worksheets.map(ws => ws.name);
    expect(worksheetNames).toContain('Export Metadata');
    expect(worksheetNames).toContain('Projects');
    expect(worksheetNames).toContain('Rosters');

    // Sheets should have headers but no data
    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet!.rowCount).toBe(1); // Only header row

    // Metadata should still be valid
    const metadataSheet = workbook.getWorksheet('Export Metadata');
    expect(metadataSheet!.rowCount).toBeGreaterThan(1);

    // Clean up empty test data
    await testDataHelpers.cleanupTestData(emptyTestData);
  });
});