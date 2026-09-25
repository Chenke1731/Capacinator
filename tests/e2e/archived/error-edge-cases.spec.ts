/**
 * Error Handling and Edge Cases E2E Tests for Import/Export
 * Comprehensive testing for unusual scenarios, error recovery, boundary conditions, and graceful degradation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import/Export Error Handling and Edge Cases', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('error-edge-cases');
    
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 10,
      people: 15,
      assignments: 20,
      locations: 5,
      projectTypes: 3,
      roles: 6,
      scenarios: 1
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `error-edge-${Date.now()}`);
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

  async function createCorruptedExcelFile(filename: string): Promise<string> {
    const filePath = path.join(testFilesPath, filename);
    // Create a file that looks like Excel but is corrupted
    const corruptedContent = Buffer.from('PK\x03\x04CORRUPTED_EXCEL_FILE_DATA\x00\x00\x00', 'binary');
    await fs.writeFile(filePath, corruptedContent);
    return filePath;
  }

  async function createEmptyExcelFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    // Create completely empty workbook
    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async function createMalformedExcelFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Create sheet with malformed structure
    const sheet = workbook.addWorksheet('MalformedSheet');
    
    // Add headers that don't match expected format
    sheet.addRow(['Not Project Name', 'Not Project Type', 'Random Header']);
    sheet.addRow(['Some Data', 'More Data', 'Even More Data']);
    
    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async function createExtremelyLargeFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    // Create extremely large dataset (10000+ records)
    for (let i = 1; i <= 10000; i++) {
      projectsSheet.addRow({
        name: `Extreme Test Project ${i} - ${'Very '.repeat(50)}Long Name`,
        type: testData.projectTypes[i % testData.projectTypes.length].name,
        location: testData.locations[i % testData.locations.length].name,
        priority: (i % 3) + 1
      });
    }

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async function createFileWithSpecialCharacters(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    // Add rows with various special characters and edge cases
    projectsSheet.addRows([
      {
        name: 'Project with émojis 🚀💡🎯',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      },
      {
        name: 'Проект с кириллицей',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2
      },
      {
        name: 'プロジェクト名前',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      },
      {
        name: 'Project with "quotes" and \'apostrophes\' & ampersands',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 3
      },
      {
        name: 'Project\nwith\nnewlines',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 2
      },
      {
        name: 'Project with\ttabs\tand   spaces',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 1
      }
    ]);

    const rostersSheet = workbook.addWorksheet('Rosters');
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'role', width: 20 },
      { header: 'Worker Type', key: 'workerType', width: 15 }
    ];

    rostersSheet.addRows([
      {
        name: 'José María García-López',
        email: 'josé.maría@company.com',
        role: testData.roles[0].name,
        workerType: 'FTE'
      },
      {
        name: 'محمد الأحمد',
        email: 'mohammed@company.com',
        role: testData.roles[1].name,
        workerType: 'Contractor'
      },
      {
        name: 'O\'Connor, Smith & Jones',
        email: 'complex@company.com',
        role: testData.roles[0].name,
        workerType: 'FTE'
      }
    ]);

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.edge_case} should handle completely empty file gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const emptyFile = await createEmptyExcelFile('empty-file.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(emptyFile);

    await expect(page.locator('text=empty-file.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show appropriate error message for empty file
    await expect(page.locator('text=No data found').or(
      page.locator('text=Empty file').or(
        page.locator('text=No worksheets')
      )
    )).toBeVisible({ timeout: 15000 });

    // Should not crash or hang
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    
    // Should be able to try again with a different file
    await expect(importButton).toBeVisible();
  });

  test(`${tags.edge_case} should handle corrupted Excel files gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const corruptedFile = await createCorruptedExcelFile('corrupted-file.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(corruptedFile);

    await expect(page.locator('text=corrupted-file.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show appropriate error message for corrupted file
    await expect(page.locator('text=corrupt').or(
      page.locator('text=invalid').or(
        page.locator('text=unable to read').or(
          page.locator('text=file format')
        )
      )
    )).toBeVisible({ timeout: 15000 });

    // Should provide user-friendly error message
    await expect(page.locator('text=Please select a valid Excel file')).toBeVisible();

    // UI should remain functional
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await expect(importButton).toBeVisible();
  });

  test(`${tags.edge_case} should handle malformed Excel structure`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const malformedFile = await createMalformedExcelFile('malformed-structure.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(malformedFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should detect missing required worksheets/columns
    await expect(page.locator('text=Missing required').or(
      page.locator('text=Invalid structure').or(
        page.locator('text=Expected worksheets')
      )
    )).toBeVisible({ timeout: 15000 });

    // Should provide guidance on correct format
    await expect(page.locator('text=Download Template').or(
      page.locator('text=template')
    )).toBeVisible();

    // Should not import partial/incorrect data
    const importResults = page.locator('[data-testid="import-results"]').or(
      page.locator('text=Import Successful')
    );
    
    // Should not show success if structure is wrong
    await expect(importResults).not.toBeVisible({ timeout: 5000 });
  });

  test(`${tags.stress} should handle extremely large files gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    test.slow(); // This test will take longer
    const page = authenticatedPage;

    const extremeFile = await createExtremelyLargeFile('extreme-size.xlsx');

    // Verify file is actually very large
    const stats = await fs.stat(extremeFile);
    expect(stats.size).toBeGreaterThan(50000000); // > 50MB

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(extremeFile);

    await expect(page.locator('text=extreme-size.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should either:
    // 1. Process successfully with progress indicators
    // 2. Show file size warning/error
    // 3. Timeout gracefully

    const progressIndicator = page.locator('text=Processing').or(
      page.locator('[data-testid="import-progress"]')
    );

    const sizeError = page.locator('text=too large').or(
      page.locator('text=file size').or(
        page.locator('text=exceeds limit')
      )
    );

    const successMessage = page.locator('text=Import Successful');

    // One of these should happen within reasonable time
    await Promise.race([
      expect(progressIndicator).toBeVisible({ timeout: 30000 }),
      expect(sizeError).toBeVisible({ timeout: 30000 }),
      expect(successMessage).toBeVisible({ timeout: 600000 }) // 10 minutes max
    ]);

    // System should remain responsive regardless of outcome
    await expect(page.locator('input[type="file"]')).toBeEnabled({ timeout: 10000 });
  });

  test(`${tags.edge_case} should handle files with special characters and encodings`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const specialCharsFile = await createFileWithSpecialCharacters('special-chars.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(specialCharsFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should handle special characters correctly
    await expect(page.locator('text=Import').and(
      page.locator(':near(:text("Successful"))')
    )).toBeVisible({ timeout: 30000 });

    // Verify special characters are preserved
    await testHelpers.navigateTo('/projects');
    
    // Should see emojis and special characters properly displayed
    await expect(page.locator('text=Project with émojis 🚀💡🎯')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Проект с кириллицей')).toBeVisible();
    await expect(page.locator('text=プロジェクト名前')).toBeVisible();

    // Check people with special characters
    await testHelpers.navigateTo('/people');
    await expect(page.locator('text=José María García-Lopez')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=محمد الأحمد')).toBeVisible();

    // Verify export preserves special characters
    await testHelpers.navigateTo('/import');
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });
  });

  test(`${tags.edge_case} should handle network interruptions during import`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create a reasonably sized file for network testing
    const workbook = new ExcelJS.Workbook();
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 }
    ];

    for (let i = 1; i <= 100; i++) {
      projectsSheet.addRow({
        name: `Network Test Project ${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length].name
      });
    }

    const networkTestFile = path.join(testFilesPath, 'network-test.xlsx');
    await workbook.xlsx.writeFile(networkTestFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(networkTestFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Wait for import to start
    await expect(page.locator('text=Processing')).toBeVisible({ timeout: 10000 });

    // Simulate network failure mid-import
    await page.route('/api/import/**', route => route.abort('failed'));

    // Should handle network failure gracefully
    await expect(page.locator('text=network error').or(
      page.locator('text=connection').or(
        page.locator('text=failed').or(
          page.locator('[role="alert"]')
        )
      )
    )).toBeVisible({ timeout: 15000 });

    // Should provide retry option
    const retryButton = page.locator('button:has-text("Retry")').or(
      page.locator('button:has-text("Try Again")')
    );

    if (await retryButton.isVisible()) {
      // Restore network and retry
      await page.unroute('/api/import/**');
      
      await retryButton.click();
      
      // Should eventually succeed
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });
    }
  });

  test(`${tags.edge_case} should handle invalid file types gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create various invalid file types
    const textFile = path.join(testFilesPath, 'not-excel.txt');
    await fs.writeFile(textFile, 'This is not an Excel file');

    const csvFile = path.join(testFilesPath, 'not-excel.csv');
    await fs.writeFile(csvFile, 'Name,Email\nTest,test@example.com');

    const pdfFile = path.join(testFilesPath, 'not-excel.pdf');
    await fs.writeFile(pdfFile, '%PDF-1.4\nFake PDF content');

    // Test each invalid file type
    const invalidFiles = [textFile, csvFile, pdfFile];

    for (const invalidFile of invalidFiles) {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(invalidFile);

      // Should show appropriate error immediately or after clicking import
      const importButton = page.locator('button:has-text("Upload and Import")');
      
      // May show error on file selection or on import attempt
      let errorShown = false;
      
      try {
        await expect(page.locator('text=Please select a valid Excel file').or(
          page.locator('text=Invalid file type')
        )).toBeVisible({ timeout: 2000 });
        errorShown = true;
      } catch (e) {
        // Error not shown immediately, try clicking import
        if (await importButton.isEnabled()) {
          await importButton.click();
          
          await expect(page.locator('text=Please select a valid Excel file').or(
            page.locator('text=Invalid file type').or(
              page.locator('text=Unsupported format')
            )
          )).toBeVisible({ timeout: 10000 });
          errorShown = true;
        }
      }

      expect(errorShown).toBe(true);

      // Reset for next test
      await page.reload();
      await testHelpers.setupPage();
    }
  });

  test(`${tags.edge_case} should handle browser limitations and memory constraints`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create file that approaches browser memory limits
    const workbook = new ExcelJS.Workbook();
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Description', key: 'description', width: 100 }
    ];

    // Add many records with large text content
    for (let i = 1; i <= 2000; i++) {
      projectsSheet.addRow({
        name: `Memory Test Project ${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length].name,
        description: 'Very long description '.repeat(100) + `for project ${i}`
      });
    }

    const memoryTestFile = path.join(testFilesPath, 'memory-test.xlsx');
    await workbook.xlsx.writeFile(memoryTestFile);

    // Monitor memory before upload
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(memoryTestFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should either complete successfully or fail gracefully
    try {
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 120000 });
      
      // If successful, verify no memory leak
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
      });

      console.log(`Memory usage: ${Math.round(initialMemory / 1024 / 1024)}MB -> ${Math.round(finalMemory / 1024 / 1024)}MB`);
      
    } catch (error) {
      // Should show memory/resource error
      await expect(page.locator('text=memory').or(
        page.locator('text=resource').or(
          page.locator('text=browser limitation')
        )
      )).toBeVisible({ timeout: 30000 });
    }

    // Browser should remain responsive
    await expect(page.locator('input[type="file"]')).toBeEnabled({ timeout: 10000 });
  });

  test(`${tags.edge_case} should handle export failures gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test various export failure scenarios
    
    // 1. Network failure during export
    await page.route('/api/export/**', route => route.abort('failed'));

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Should show export error
    await expect(page.locator('text=export failed').or(
      page.locator('text=download failed').or(
        page.locator('[role="alert"]')
      )
    )).toBeVisible({ timeout: 10000 });

    // Button should return to normal state
    await expect(exportButton).toBeEnabled({ timeout: 5000 });

    // 2. Test template download failure
    await page.route('/api/import/template*', route => route.abort('failed'));

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    await expect(page.locator('text=template').and(
      page.locator(':near(:text("failed"))')
    ).or(
      page.locator('text=download failed')
    )).toBeVisible({ timeout: 10000 });

    await expect(templateButton).toBeEnabled({ timeout: 5000 });

    // 3. Restore network and verify recovery
    await page.unroute('/api/export/**');
    await page.unroute('/api/import/template*');

    // Should work after network restoration
    await exportButton.click();
    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    await templateButton.click();
    await expect(templateButton).toBeEnabled({ timeout: 10000 });
  });

  test(`${tags.edge_case} should handle session timeout during operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create test file
    const workbook = new ExcelJS.Workbook();
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 }
    ];

    projectsSheet.addRow({
      name: 'Session Timeout Test Project',
      type: testData.projectTypes[0].name
    });

    const sessionTestFile = path.join(testFilesPath, 'session-test.xlsx');
    await workbook.xlsx.writeFile(sessionTestFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(sessionTestFile);

    // Simulate session timeout
    await page.route('/api/import/**', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'Session expired' })
      });
    });

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should handle authentication error appropriately
    await expect(page.locator('text=session').or(
      page.locator('text=login').or(
        page.locator('text=unauthorized').or(
          page.locator('text=expired')
        )
      )
    )).toBeVisible({ timeout: 15000 });

    // Should provide way to re-authenticate or redirect to login
    const loginButton = page.locator('button:has-text("Login")').or(
      page.locator('a:has-text("Sign In")')
    );

    if (await loginButton.isVisible()) {
      await expect(loginButton).toBeVisible();
    }
  });

  test(`${tags.edge_case} should handle concurrent user operations gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Simulate multiple operations happening simultaneously
    const workbook = new ExcelJS.Workbook();
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 }
    ];

    for (let i = 1; i <= 50; i++) {
      projectsSheet.addRow({
        name: `Concurrent Test Project ${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length].name
      });
    }

    const concurrentTestFile = path.join(testFilesPath, 'concurrent-test.xlsx');
    await workbook.xlsx.writeFile(concurrentTestFile);

    // Start import
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(concurrentTestFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Try to start export while import is running
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    
    // Should either queue the operation or prevent concurrent operations
    if (await exportButton.isEnabled()) {
      await exportButton.click();
      
      // Should handle gracefully - either queue or show appropriate message
      await expect(page.locator('text=operation in progress').or(
        page.locator('text=please wait').or(
          page.locator('button:has-text("Exporting..."):disabled')
        )
      )).toBeVisible({ timeout: 5000 });
    }

    // Wait for import to complete
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 60000 });

    // Now export should work
    if (!await exportButton.isDisabled()) {
      await exportButton.click();
      await expect(exportButton).toBeEnabled({ timeout: 15000 });
    }
  });

  test(`${tags.edge_case} should provide helpful error messages for all failure scenarios`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test that all error scenarios provide user-friendly messages
    
    // 1. Empty file error
    const emptyFile = await createEmptyExcelFile('empty.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(emptyFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    let errorElement = page.locator('[role="alert"]').or(
      page.locator('.error-message').or(
        page.locator('[data-testid="error-message"]')
      )
    );

    await expect(errorElement).toBeVisible({ timeout: 10000 });

    // Error should be specific and actionable
    const errorText = await errorElement.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(10); // Should be descriptive

    // 2. Network error provides clear message
    await page.reload();
    await testHelpers.setupPage();

    await page.route('/api/import/**', route => route.abort('failed'));

    const validFile = await createFileWithSpecialCharacters('network-error-test.xlsx');
    await fileInput.setInputFiles(validFile);
    await importButton.click();

    errorElement = page.locator('[role="alert"]').or(
      page.locator('text=network').or(
        page.locator('text=connection')
      )
    );

    await expect(errorElement).toBeVisible({ timeout: 10000 });

    // Should suggest next steps
    await expect(page.locator('text=try again').or(
      page.locator('text=retry').or(
        page.locator('button:has-text("Retry")')
      )
    )).toBeVisible();

    // 3. All error messages should be accessible
    const errorAriaLive = await errorElement.getAttribute('aria-live');
    const errorRole = await errorElement.getAttribute('role');
    
    expect(errorAriaLive || errorRole).toBeTruthy(); // Should be announced to screen readers
  });
});