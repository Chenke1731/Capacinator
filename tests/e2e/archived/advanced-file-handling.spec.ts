/**
 * Advanced File Handling E2E Tests
 * Comprehensive testing for large files, corruption scenarios, network issues, and edge cases
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Advanced File Handling for Import/Export', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('advanced-file-handling');
    
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 5,
      people: 10,
      locations: 3,
      projectTypes: 3,
      roles: 4,
      scenarios: 1
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `advanced-${Date.now()}`);
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

  async function createLargeExcelFile(filename: string, recordCount: number): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Create Projects sheet with many records
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

    // Add many project records
    for (let i = 1; i <= recordCount; i++) {
      projectsSheet.addRow({
        name: `Large Dataset Project ${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length].name,
        location: testData.locations[i % testData.locations.length].name,
        priority: (i % 3) + 1,
        description: `This is a test project number ${i} created for large dataset testing. It contains additional descriptive text to increase file size and test processing capabilities with substantial data volumes.`,
        startDate: new Date(2024, 0, i % 28 + 1).toISOString().split('T')[0],
        endDate: new Date(2024, 6, i % 28 + 1).toISOString().split('T')[0]
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

    // Add many people records
    for (let i = 1; i <= recordCount; i++) {
      rostersSheet.addRow({
        name: `Large Dataset Person ${i}`,
        email: `largeperson${i}@test.com`,
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

  async function createCorruptedFile(filename: string): Promise<string> {
    const filePath = path.join(testFilesPath, filename);
    // Create a file that looks like Excel but is corrupted
    const corruptedContent = 'PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00!\x00CORRUPTED_EXCEL_FILE_DATA';
    await fs.writeFile(filePath, corruptedContent);
    return filePath;
  }

  test(`${tags.performance} should handle large file upload (1000 records)`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create large Excel file
    const largeFile = await createLargeExcelFile('large-1000-records.xlsx', 1000);
    
    // Check file size
    const stats = await fs.stat(largeFile);
    expect(stats.size).toBeGreaterThan(100000); // Should be > 100KB

    // Start performance monitoring
    const startTime = Date.now();

    // Upload the large file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(largeFile);

    // Should show file is selected
    await expect(page.locator('text=large-1000-records.xlsx')).toBeVisible();

    // Should show file size information
    const fileSizeDisplay = page.locator('[data-testid="file-size"]').or(
      page.locator(':text-matches("\\d+\\s*(KB|MB)", "i")')
    );
    await expect(fileSizeDisplay.first()).toBeVisible({ timeout: 5000 });

    // Proceed with import
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeEnabled();
    
    // Monitor loading states
    await importButton.click();
    
    // Should show processing state
    await expect(page.locator('text=Processing').or(
      page.locator('text=Uploading').or(
        page.locator('[data-testid="import-progress"]')
      )
    )).toBeVisible({ timeout: 10000 });

    // Wait for completion with extended timeout for large files
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 60000 });

    const processingTime = Date.now() - startTime;
    
    // Should complete within reasonable time (2 minutes)
    expect(processingTime).toBeLessThan(120000);

    // Verify large dataset was imported
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("1000"))')
    )).toBeVisible();

    await expect(page.locator('text=people:').and(
      page.locator(':near(:text("1000"))')
    )).toBeVisible();
  });

  test(`${tags.performance} should handle very large file upload (5000 records)`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    test.slow(); // Mark as slow test
    const page = authenticatedPage;

    // Create very large Excel file
    const veryLargeFile = await createLargeExcelFile('very-large-5000-records.xlsx', 5000);
    
    // Check file size
    const stats = await fs.stat(veryLargeFile);
    expect(stats.size).toBeGreaterThan(500000); // Should be > 500KB

    // Upload the very large file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(veryLargeFile);

    await expect(page.locator('text=very-large-5000-records.xlsx')).toBeVisible();

    // Should handle large file without memory issues
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show progress indicators for large files
    await expect(page.locator('[data-testid="import-progress"]').or(
      page.locator('text=Processing large file')
    )).toBeVisible({ timeout: 15000 });

    // Wait for completion with very extended timeout
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 300000 }); // 5 minutes for very large files

    // Verify dataset was imported
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("5000"))')
    )).toBeVisible();
  });

  test(`${tags.edge_case} should handle corrupted Excel file gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create corrupted file
    const corruptedFile = await createCorruptedFile('corrupted.xlsx');

    // Upload corrupted file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(corruptedFile);

    await expect(page.locator('text=corrupted.xlsx')).toBeVisible();

    // Try to import
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show appropriate error message
    await expect(page.locator('text=corrupted').and(
      page.locator(':near(:text("Error"))')
    ).or(
      page.locator('text=Invalid file format').or(
        page.locator('text=File cannot be read')
      )
    )).toBeVisible({ timeout: 10000 });

    // Should not crash the application
    await expect(page.locator('[data-testid="import-section"]')).toBeVisible();
    
    // Should allow user to try again
    await expect(page.locator('button:has-text("Upload and Import")').or(
      page.locator('input[type="file"]')
    )).toBeVisible();
  });

  test(`${tags.edge_case} should handle file upload timeout scenarios`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create medium-sized file for timeout testing
    const timeoutTestFile = await createLargeExcelFile('timeout-test.xlsx', 500);

    // Intercept upload request and delay it to simulate timeout
    await page.route('/api/import/excel', async (route) => {
      // Delay for longer than typical timeout
      await new Promise(resolve => setTimeout(resolve, 15000));
      route.continue();
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(timeoutTestFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show timeout error or retry option
    await expect(page.locator('text=timeout').or(
      page.locator('text=Taking longer than expected').or(
        page.locator('text=Retry')
      )
    )).toBeVisible({ timeout: 20000 });

    // Should maintain UI responsiveness
    await expect(page.locator('[data-testid="import-section"]')).toBeVisible();
  });

  test(`${tags.edge_case} should handle multiple file selections correctly`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create multiple test files
    const file1 = await createLargeExcelFile('multiple-file-1.xlsx', 10);
    const file2 = await createLargeExcelFile('multiple-file-2.xlsx', 15);

    const fileInput = page.locator('input[type="file"]');
    
    // First file selection
    await fileInput.setInputFiles([file1]);
    await expect(page.locator('text=multiple-file-1.xlsx')).toBeVisible();

    // Second file selection (should replace first)
    await fileInput.setInputFiles([file2]);
    await expect(page.locator('text=multiple-file-2.xlsx')).toBeVisible();
    await expect(page.locator('text=multiple-file-1.xlsx')).not.toBeVisible();

    // Should only process the last selected file
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Should import data from file2 (15 records each)
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("15"))')
    )).toBeVisible();
  });

  test(`${tags.edge_case} should handle unsupported file types gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create various unsupported file types
    const txtFile = path.join(testFilesPath, 'unsupported.txt');
    await fs.writeFile(txtFile, 'This is a text file, not Excel');

    const csvFile = path.join(testFilesPath, 'unsupported.csv');
    await fs.writeFile(csvFile, 'Name,Email\nTest Person,test@example.com');

    const pdfFile = path.join(testFilesPath, 'unsupported.pdf');
    await fs.writeFile(pdfFile, '%PDF-1.4\nFake PDF content');

    // Test each unsupported file type
    const fileInput = page.locator('input[type="file"]');
    
    // Test text file
    await fileInput.setInputFiles([txtFile]);
    await expect(page.locator('text=Please select a valid Excel file').or(
      page.locator('text=Unsupported file type')
    )).toBeVisible({ timeout: 5000 });

    // Test CSV file
    await fileInput.setInputFiles([csvFile]);
    await expect(page.locator('text=Please select a valid Excel file').or(
      page.locator('text=Unsupported file type')
    )).toBeVisible({ timeout: 5000 });

    // Test PDF file
    await fileInput.setInputFiles([pdfFile]);
    await expect(page.locator('text=Please select a valid Excel file').or(
      page.locator('text=Unsupported file type')
    )).toBeVisible({ timeout: 5000 });

    // Import button should remain disabled or unavailable
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).not.toBeVisible();
  });

  test(`${tags.edge_case} should handle empty Excel files`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create empty Excel file
    const workbook = new ExcelJS.Workbook();
    const emptySheet = workbook.addWorksheet('Empty');
    // Add only headers, no data
    emptySheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 }
    ];

    const emptyFile = path.join(testFilesPath, 'empty.xlsx');
    await workbook.xlsx.writeFile(emptyFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([emptyFile]);

    await expect(page.locator('text=empty.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should handle empty file gracefully
    await expect(page.locator('text=No data to import').or(
      page.locator('text=Empty file').or(
        page.locator('text=No records found')
      )
    )).toBeVisible({ timeout: 10000 });

    // Should not crash and should allow retry
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test(`${tags.performance} should monitor memory usage during large file processing`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create large file for memory monitoring
    const largeFile = await createLargeExcelFile('memory-test.xlsx', 2000);

    // Start monitoring memory usage
    const initialMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([largeFile]);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Monitor memory during processing
    let peakMemory = initialMemory;
    const memoryCheckInterval = setInterval(async () => {
      try {
        const currentMemory = await page.evaluate(() => {
          if ('memory' in performance) {
            return (performance as any).memory.usedJSHeapSize;
          }
          return 0;
        });
        peakMemory = Math.max(peakMemory, currentMemory);
      } catch (error) {
        // Page might be navigating, ignore errors
      }
    }, 1000);

    // Wait for import completion
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 120000 });

    clearInterval(memoryCheckInterval);

    // Check final memory usage
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Memory should not have increased dramatically (indicating memory leaks)
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;
      
      // Memory increase should be reasonable (less than 200% of initial)
      expect(memoryIncreasePercent).toBeLessThan(200);
    }
  });

  test(`${tags.regression} should handle browser refresh during file upload`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createLargeExcelFile('refresh-test.xlsx', 100);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([testFile]);

    await expect(page.locator('text=refresh-test.xlsx')).toBeVisible();

    // Refresh the page
    await page.reload();

    // File selection should be cleared
    await expect(page.locator('text=refresh-test.xlsx')).not.toBeVisible();

    // Should show clean import interface
    await expect(page.locator('text=Drop Excel file here')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test(`${tags.edge_case} should handle concurrent file operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test file
    const testFile = await createLargeExcelFile('concurrent-test.xlsx', 50);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([testFile]);

    const importButton = page.locator('button:has-text("Upload and Import")');
    
    // Start import
    await importButton.click();

    // Try to upload another file while processing (should be prevented)
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    
    // Import button should be disabled during processing
    await expect(importButton).toBeDisabled();

    // Wait for completion
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    // Controls should be enabled again
    await expect(page.locator('input[type="file"]')).toBeEnabled();
  });
});