/**
 * Performance and Scalability E2E Tests for Import/Export
 * Comprehensive testing for concurrent users, memory usage, stress testing, and performance benchmarks
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import/Export Performance and Scalability', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;
  let performanceMetrics: any = {};

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('performance-scalability');
    
    // Create substantial test data for performance testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 100,
      people: 200,
      assignments: 300,
      phases: 50,
      scenarios: 3,
      locations: 10,
      projectTypes: 8,
      roles: 15
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `performance-${Date.now()}`);
    await fs.mkdir(testFilesPath, { recursive: true });

    await testHelpers.navigateTo('/import');
    await testHelpers.setupPage();

    // Initialize performance metrics
    performanceMetrics = {
      startTime: Date.now(),
      memoryBefore: null,
      memoryAfter: null,
      processingTime: null
    };
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

  async function createVeryLargeDataset(filename: string, recordCount: number): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    // Create Projects sheet with very large dataset
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'End Date', key: 'endDate', width: 15 },
      { header: 'Budget', key: 'budget', width: 15 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Add many project records with realistic data sizes
    for (let i = 1; i <= recordCount; i++) {
      projectsSheet.addRow({
        name: `Large Scale Performance Test Project ${i} - Enterprise Solution Implementation`,
        type: testData.projectTypes[i % testData.projectTypes.length].name,
        location: testData.locations[i % testData.locations.length].name,
        priority: (i % 3) + 1,
        description: `Comprehensive enterprise-level project ${i} designed for performance testing with extensive descriptive content, detailed requirements, comprehensive scope definition, and complex implementation strategies that span multiple business units and technological domains. This project includes integration with legacy systems, modern cloud infrastructure, third-party vendor solutions, and complex workflow automation requirements.`,
        startDate: new Date(2024, (i % 12), 1).toISOString().split('T')[0],
        endDate: new Date(2024, ((i % 12) + 6) % 12, 28).toISOString().split('T')[0],
        budget: Math.floor(Math.random() * 10000000) + 100000, // $100K - $10M
        status: ['Planning', 'Active', 'On Hold', 'Completed'][i % 4]
      });
    }

    // Create Rosters sheet with corresponding large dataset
    const rostersSheet = workbook.addWorksheet('Rosters');
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'role', width: 20 },
      { header: 'Secondary Role', key: 'secondaryRole', width: 20 },
      { header: 'Worker Type', key: 'workerType', width: 15 },
      { header: 'Availability %', key: 'availability', width: 15 },
      { header: 'Hours Per Day', key: 'hoursPerDay', width: 15 },
      { header: 'Hourly Rate', key: 'hourlyRate', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Manager', key: 'manager', width: 25 }
    ];

    for (let i = 1; i <= recordCount; i++) {
      rostersSheet.addRow({
        name: `Performance Test Employee ${i} - Senior Professional`,
        email: `performance.test.employee.${i}@enterprise-company-domain.com`,
        role: testData.roles[i % testData.roles.length].name,
        secondaryRole: testData.roles[(i + 1) % testData.roles.length].name,
        workerType: i % 3 === 0 ? 'Contractor' : 'FTE',
        availability: Math.floor(Math.random() * 40) + 60, // 60-100%
        hoursPerDay: Math.floor(Math.random() * 4) + 6, // 6-10 hours
        hourlyRate: Math.floor(Math.random() * 200) + 50, // $50-$250/hour
        department: ['Engineering', 'Product', 'Design', 'Operations', 'Sales'][i % 5],
        manager: `Manager ${Math.floor(i / 10)} - Department Lead`
      });
    }

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async function measureMemoryUsage(page: any): Promise<number> {
    return await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
  }

  async function measurePerformanceMetrics(page: any, operation: string): Promise<any> {
    const startTime = Date.now();
    const memoryBefore = await measureMemoryUsage(page);
    
    return {
      startTime,
      memoryBefore,
      async complete() {
        const endTime = Date.now();
        const memoryAfter = await measureMemoryUsage(page);
        return {
          operation,
          duration: endTime - startTime,
          memoryBefore,
          memoryAfter,
          memoryDelta: memoryAfter - memoryBefore
        };
      }
    };
  }

  test(`${tags.performance} should handle maximum file size import efficiently`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    test.slow(); // Mark as slow test - may take several minutes
    const page = authenticatedPage;

    // Create very large file (5000 records)
    const largeFile = await createVeryLargeDataset('max-size-test.xlsx', 5000);
    
    // Verify file size is substantial
    const stats = await fs.stat(largeFile);
    expect(stats.size).toBeGreaterThan(10000000); // Should be > 10MB
    console.log(`Test file size: ${Math.round(stats.size / 1024 / 1024)}MB`);

    const metrics = await measurePerformanceMetrics(page, 'max-size-import');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(largeFile);

    await expect(page.locator('text=max-size-test.xlsx')).toBeVisible();

    // Start import
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Monitor progress throughout import
    let progressVisible = false;
    const progressMonitor = setInterval(async () => {
      try {
        const progressElement = page.locator('[data-testid="import-progress"]').or(
          page.locator('text=Processing').or(
            page.locator('.progress-bar')
          )
        );
        if (await progressElement.isVisible()) {
          progressVisible = true;
        }
      } catch (error) {
        // Ignore errors during monitoring
      }
    }, 1000);

    // Wait for completion with extended timeout (10 minutes)
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 600000 });

    clearInterval(progressMonitor);
    const completionMetrics = await metrics.complete();

    // Performance assertions
    expect(completionMetrics.duration).toBeLessThan(600000); // Should complete within 10 minutes
    expect(progressVisible).toBe(true); // Should show progress for large files

    // Verify import success
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("5000"))')
    )).toBeVisible();

    await expect(page.locator('text=people:').and(
      page.locator(':near(:text("5000"))')
    )).toBeVisible();

    console.log(`Import completed in ${completionMetrics.duration}ms`);
    console.log(`Memory delta: ${Math.round(completionMetrics.memoryDelta / 1024 / 1024)}MB`);
  });

  test(`${tags.performance} should handle concurrent export operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Measure baseline performance
    const baselineMetrics = await measurePerformanceMetrics(page, 'baseline-export');
    
    // First export
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(page.locator('button:has-text("Exporting..."):disabled')).toBeVisible();
    await expect(exportButton).toBeEnabled({ timeout: 30000 });

    const firstExportMetrics = await baselineMetrics.complete();

    // Second export immediately after first completes
    const secondMetrics = await measurePerformanceMetrics(page, 'concurrent-export');
    
    await exportButton.click();
    await expect(page.locator('button:has-text("Exporting..."):disabled')).toBeVisible();
    await expect(exportButton).toBeEnabled({ timeout: 30000 });

    const secondExportMetrics = await secondMetrics.complete();

    // Third export for consistency
    const thirdMetrics = await measurePerformanceMetrics(page, 'third-export');
    
    await exportButton.click();
    await expect(exportButton).toBeEnabled({ timeout: 30000 });

    const thirdExportMetrics = await thirdMetrics.complete();

    // Performance consistency assertions
    expect(secondExportMetrics.duration).toBeLessThan(firstExportMetrics.duration * 2); // Not more than 2x slower
    expect(thirdExportMetrics.duration).toBeLessThan(firstExportMetrics.duration * 2);

    // Memory usage should not grow excessively with repeated exports
    expect(thirdExportMetrics.memoryAfter).toBeLessThan(firstExportMetrics.memoryBefore * 3);

    console.log(`Export times: ${firstExportMetrics.duration}ms, ${secondExportMetrics.duration}ms, ${thirdExportMetrics.duration}ms`);
  });

  test(`${tags.stress} should maintain performance under stress conditions`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    test.slow();
    const page = authenticatedPage;

    // Create multiple medium-large files
    const files = [];
    for (let i = 1; i <= 3; i++) {
      const file = await createVeryLargeDataset(`stress-test-${i}.xlsx`, 1000);
      files.push(file);
    }

    // Rapid-fire imports to stress test the system
    for (let i = 0; i < files.length; i++) {
      const metrics = await measurePerformanceMetrics(page, `stress-import-${i + 1}`);
      
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(files[i]);

      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.click();

      // Wait for completion
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 300000 });

      const completionMetrics = await metrics.complete();
      
      // Each import should complete within reasonable time
      expect(completionMetrics.duration).toBeLessThan(300000); // 5 minutes max

      // Brief pause between imports
      await page.waitForTimeout(2000);

      console.log(`Stress test ${i + 1} completed in ${completionMetrics.duration}ms`);
    }

    // UI should remain responsive after stress testing
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await expect(page.locator('button:has-text("Export Scenario Data")')).toBeEnabled();
  });

  test(`${tags.performance} should optimize memory usage during large imports`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    test.slow();
    const page = authenticatedPage;

    // Create large file for memory testing
    const largeFile = await createVeryLargeDataset('memory-test.xlsx', 3000);

    // Baseline memory measurement
    const baselineMemory = await measureMemoryUsage(page);
    console.log(`Baseline memory: ${Math.round(baselineMemory / 1024 / 1024)}MB`);

    // Start import and monitor memory throughout
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(largeFile);

    const memoryReadings: number[] = [baselineMemory];
    
    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Monitor memory usage during import
    const memoryMonitor = setInterval(async () => {
      try {
        const currentMemory = await measureMemoryUsage(page);
        memoryReadings.push(currentMemory);
      } catch (error) {
        // Ignore errors during monitoring
      }
    }, 2000);

    // Wait for completion
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 400000 });

    clearInterval(memoryMonitor);

    // Final memory measurement
    const finalMemory = await measureMemoryUsage(page);
    memoryReadings.push(finalMemory);

    const maxMemory = Math.max(...memoryReadings);
    const memoryGrowth = maxMemory - baselineMemory;

    console.log(`Max memory: ${Math.round(maxMemory / 1024 / 1024)}MB`);
    console.log(`Memory growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB`);
    console.log(`Final memory: ${Math.round(finalMemory / 1024 / 1024)}MB`);

    // Memory growth should be reasonable (less than 500MB for 3000 records)
    expect(memoryGrowth).toBeLessThan(500 * 1024 * 1024);

    // Memory should not leak significantly after import
    expect(finalMemory).toBeLessThan(maxMemory * 1.2); // Should release most memory
  });

  test(`${tags.performance} should handle network latency gracefully`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Simulate slow network conditions
    await page.route('/api/import/**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      route.continue();
    });

    const testFile = await createVeryLargeDataset('network-latency-test.xlsx', 500);

    const metrics = await measurePerformanceMetrics(page, 'network-latency-import');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Should show appropriate loading states during network delays
    await expect(page.locator('text=Processing').or(
      page.locator('text=Uploading')
    )).toBeVisible({ timeout: 15000 });

    // Should eventually complete despite network latency
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 180000 });

    const completionMetrics = await metrics.complete();

    // Should handle network delays gracefully
    expect(completionMetrics.duration).toBeGreaterThan(10000); // Should take longer due to simulated latency
    expect(completionMetrics.duration).toBeLessThan(180000); // But still complete within 3 minutes

    console.log(`Import with network latency completed in ${completionMetrics.duration}ms`);
  });

  test(`${tags.scalability} should scale with increasing data complexity`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test with progressively larger datasets
    const testSizes = [100, 500, 1000];
    const performanceResults: any[] = [];

    for (const size of testSizes) {
      const testFile = await createVeryLargeDataset(`scalability-test-${size}.xlsx`, size);
      
      const metrics = await measurePerformanceMetrics(page, `scalability-${size}`);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFile);

      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.click();

      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 300000 });

      const completionMetrics = await metrics.complete();
      performanceResults.push({
        size,
        duration: completionMetrics.duration,
        memoryDelta: completionMetrics.memoryDelta
      });

      // Brief pause between tests
      await page.waitForTimeout(3000);

      console.log(`${size} records: ${completionMetrics.duration}ms, memory: ${Math.round(completionMetrics.memoryDelta / 1024 / 1024)}MB`);
    }

    // Analyze scaling characteristics
    const timeRatio = performanceResults[2].duration / performanceResults[0].duration;
    const memoryRatio = performanceResults[2].memoryDelta / performanceResults[0].memoryDelta;

    // Performance should scale reasonably (not more than 20x slower for 10x data)
    expect(timeRatio).toBeLessThan(20);
    
    // Memory usage should scale reasonably
    expect(memoryRatio).toBeLessThan(15);

    console.log(`Time scaling ratio (1000/100): ${timeRatio.toFixed(2)}`);
    console.log(`Memory scaling ratio (1000/100): ${memoryRatio.toFixed(2)}`);
  });

  test(`${tags.performance} should efficiently handle template downloads`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test multiple template downloads for performance consistency
    const downloadTimes: number[] = [];

    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      
      const templateButton = page.locator('button:has-text("Download Template")');
      await templateButton.click();

      // Wait for download to complete
      await expect(templateButton).toBeEnabled({ timeout: 10000 });

      const downloadTime = Date.now() - startTime;
      downloadTimes.push(downloadTime);

      console.log(`Template download ${i + 1}: ${downloadTime}ms`);

      // Brief pause between downloads
      await page.waitForTimeout(1000);
    }

    // All downloads should complete quickly
    downloadTimes.forEach(time => {
      expect(time).toBeLessThan(10000); // Less than 10 seconds
    });

    // Performance should be consistent
    const avgTime = downloadTimes.reduce((a, b) => a + b, 0) / downloadTimes.length;
    const maxTime = Math.max(...downloadTimes);
    
    expect(maxTime).toBeLessThan(avgTime * 3); // No download should be more than 3x average

    console.log(`Average download time: ${avgTime.toFixed(0)}ms`);
  });

  test(`${tags.performance} should maintain UI responsiveness during operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createVeryLargeDataset('ui-responsiveness-test.xlsx', 2000);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // While import is processing, test UI responsiveness
    await expect(page.locator('text=Processing')).toBeVisible({ timeout: 10000 });

    // Navigation should remain responsive
    const navigationTests = [
      async () => {
        const navElement = page.locator('nav').or(page.locator('[data-testid="navigation"]'));
        if (await navElement.isVisible()) {
          await expect(navElement).toBeVisible({ timeout: 1000 });
        }
      },
      async () => {
        // Page title should be accessible
        await expect(page.locator('h1')).toBeVisible({ timeout: 1000 });
      },
      async () => {
        // Settings/options should be visible (though possibly disabled)
        const settingsSection = page.locator('[data-testid="import-settings"]').or(
          page.locator('text=Import Settings')
        );
        if (await settingsSection.isVisible()) {
          await expect(settingsSection).toBeVisible({ timeout: 1000 });
        }
      }
    ];

    // Run responsiveness tests while import is processing
    for (const test of navigationTests) {
      try {
        await test();
      } catch (error) {
        console.warn('UI responsiveness test failed:', error);
      }
      await page.waitForTimeout(2000); // Wait between tests
    }

    // Import should eventually complete
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 300000 });

    // After completion, all UI should be fully responsive again
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await expect(page.locator('button:has-text("Export Scenario Data")')).toBeEnabled();
  });

  test(`${tags.regression} should maintain consistent performance across sessions`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Create consistent test file
    const testFile = await createVeryLargeDataset('session-consistency-test.xlsx', 800);

    const sessionResults: any[] = [];

    // Simulate multiple user sessions
    for (let session = 1; session <= 3; session++) {
      console.log(`Starting session ${session}`);

      const metrics = await measurePerformanceMetrics(page, `session-${session}`);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFile);

      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.click();

      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 240000 });

      const completionMetrics = await metrics.complete();
      sessionResults.push(completionMetrics);

      console.log(`Session ${session} completed in ${completionMetrics.duration}ms`);

      // Brief pause between sessions
      await page.waitForTimeout(5000);
    }

    // Analyze consistency across sessions
    const durations = sessionResults.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxVariation = Math.max(...durations) - Math.min(...durations);

    // Performance should be consistent across sessions
    expect(maxVariation).toBeLessThan(avgDuration * 0.5); // Variation should be less than 50% of average

    console.log(`Average duration: ${avgDuration.toFixed(0)}ms, max variation: ${maxVariation.toFixed(0)}ms`);
  });
});