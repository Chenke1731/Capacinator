/**
 * Mobile and Responsive Import/Export E2E Tests
 * Comprehensive testing for mobile devices, tablets, touch interactions, and responsive layouts
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Mobile and Responsive Import/Export', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('mobile-responsive');
    
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 5,
      people: 8,
      locations: 3,
      projectTypes: 2,
      roles: 4,
      scenarios: 1
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `mobile-${Date.now()}`);
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

  async function createMobileTestFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    projectsSheet.addRows([
      {
        name: 'Mobile Test Project 1',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1
      },
      {
        name: 'Mobile Test Project 2',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2
      }
    ]);

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test.describe('Mobile Phone Layout (375px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set mobile phone viewport
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test(`${tags.responsive} should display import/export interface properly on mobile`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Import section should be visible and usable
      await expect(page.locator('text=Import & Export Data')).toBeVisible();
      
      // File upload area should be accessible
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();

      // Upload area should be appropriately sized for mobile
      const uploadArea = page.locator('[data-testid="file-upload-area"]').or(
        page.locator('text=Drop Excel file here').locator('..')
      );
      
      if (await uploadArea.isVisible()) {
        const boundingBox = await uploadArea.boundingBox();
        expect(boundingBox?.width).toBeLessThan(375); // Should fit in mobile width
        expect(boundingBox?.height).toBeGreaterThan(40); // Should be tall enough for touch
      }

      // Export section should be visible
      await expect(page.locator('text=Export Data')).toBeVisible();
      
      // Controls should be stacked vertically on mobile
      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      const templateButton = page.locator('button:has-text("Download Template")');
      
      await expect(exportButton).toBeVisible();
      await expect(templateButton).toBeVisible();

      // Buttons should be appropriately sized for touch
      if (await exportButton.isVisible()) {
        const buttonBox = await exportButton.boundingBox();
        expect(buttonBox?.height).toBeGreaterThan(40); // Minimum touch target size
      }
    });

    test(`${tags.responsive} should support touch interactions for file upload`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      const testFile = await createMobileTestFile('mobile-touch-test.xlsx');

      // File input should be accessible via touch
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();

      // Upload file
      await fileInput.setInputFiles(testFile);

      // Should show file selection clearly on mobile
      await expect(page.locator('text=mobile-touch-test.xlsx')).toBeVisible();

      // Import button should be easily tappable
      const importButton = page.locator('button:has-text("Upload and Import")');
      await expect(importButton).toBeVisible();
      
      // Use tap instead of click for mobile interaction
      await importButton.tap();

      // Should show mobile-appropriate progress indicators
      await expect(page.locator('text=Processing').or(
        page.locator('[data-testid="mobile-progress"]')
      )).toBeVisible({ timeout: 10000 });

      // Wait for completion
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

      // Results should be clearly visible on mobile
      const resultsSection = page.locator('[data-testid="import-results"]').or(
        page.locator('text=Import Successful').locator('..')
      );
      await expect(resultsSection).toBeVisible();
    });

    test(`${tags.responsive} should handle mobile export workflow`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Export controls should be easily accessible on mobile
      const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
      await expect(scenarioSelect).toBeVisible();

      // Dropdown should be appropriately sized for mobile
      const selectBox = await scenarioSelect.boundingBox();
      expect(selectBox?.height).toBeGreaterThan(40);

      // Checkboxes should be easily tappable
      const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
      if (await assignmentsCheckbox.isVisible()) {
        await assignmentsCheckbox.tap();
        
        // Should provide visual feedback for touch interaction
        await expect(assignmentsCheckbox).not.toBeChecked();
        
        // Tap again to toggle back
        await assignmentsCheckbox.tap();
        await expect(assignmentsCheckbox).toBeChecked();
      }

      // Export button should work with touch
      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      await exportButton.tap();

      // Should show loading state appropriate for mobile
      await expect(page.locator('button:has-text("Exporting..."):disabled')).toBeVisible();

      // Should handle file download on mobile
      await expect(exportButton).toBeEnabled({ timeout: 10000 });
    });

    test(`${tags.responsive} should scroll properly with mobile content`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Page should be scrollable to access all content
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = 667; // Mobile viewport height

      if (pageHeight > viewportHeight) {
        // Scroll to bottom to ensure all content is accessible
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        // Should still be able to interact with controls after scrolling
        const exportButton = page.locator('button:has-text("Export Scenario Data")');
        await expect(exportButton).toBeVisible();

        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));

        // Import controls should be visible
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toBeVisible();
      }
    });
  });

  test.describe('Tablet Layout (768px)', () => {
    test.beforeEach(async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
    });

    test(`${tags.responsive} should optimize layout for tablet devices`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Should have more space for side-by-side layout
      const importSection = page.locator('[data-testid="import-section"]').or(
        page.locator('text=Import & Export Data').locator('..')
      );
      await expect(importSection).toBeVisible();

      const exportSection = page.locator('[data-testid="export-section"]').or(
        page.locator('text=Export Data').locator('..')
      );
      await expect(exportSection).toBeVisible();

      // On tablet, sections might be side by side or have more space
      const importBox = await importSection.boundingBox();
      const exportBox = await exportSection.boundingBox();

      if (importBox && exportBox) {
        // Sections should fit comfortably in tablet layout
        expect(importBox.width + exportBox.width).toBeLessThanOrEqual(800);
      }

      // Controls should be appropriately spaced for tablet
      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      const templateButton = page.locator('button:has-text("Download Template")');

      await expect(exportButton).toBeVisible();
      await expect(templateButton).toBeVisible();

      // Buttons should be easily tappable on tablet
      const exportButtonBox = await exportButton.boundingBox();
      expect(exportButtonBox?.height).toBeGreaterThan(44); // iOS touch target size
    });

    test(`${tags.responsive} should handle tablet touch gestures`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      const testFile = await createMobileTestFile('tablet-test.xlsx');

      // File upload should work with tablet touch
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFile);

      await expect(page.locator('text=tablet-test.xlsx')).toBeVisible();

      // Advanced settings should be accessible on tablet
      const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
      if (await advancedButton.isVisible()) {
        await advancedButton.tap();
        
        // Advanced panel should display properly on tablet
        const advancedPanel = page.locator('[data-testid="advanced-settings"]').or(
          page.locator('text=Override Settings for This Import').locator('..')
        );
        await expect(advancedPanel).toBeVisible();
      }

      // Import should work with touch interaction
      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.tap();

      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe('Landscape Orientation', () => {
    test.beforeEach(async ({ page }) => {
      // Set landscape mobile viewport
      await page.setViewportSize({ width: 667, height: 375 });
    });

    test(`${tags.responsive} should adapt to landscape orientation`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Content should adapt to landscape layout
      await expect(page.locator('text=Import & Export Data')).toBeVisible();

      // Should make better use of horizontal space
      const container = page.locator('[data-testid="import-export-container"]').or(
        page.locator('main')
      );
      
      if (await container.isVisible()) {
        const containerBox = await container.boundingBox();
        expect(containerBox?.width).toBeGreaterThan(600); // Should use available width
      }

      // Controls should remain accessible in landscape
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();

      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      await expect(exportButton).toBeVisible();

      // Should not require excessive scrolling in landscape
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      expect(bodyHeight).toBeLessThan(500); // Should fit in landscape height with minimal scrolling
    });
  });

  test.describe('Cross-Device File Handling', () => {
    test(`${tags.edge_case} should handle mobile file picker limitations`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      const testFile = await createMobileTestFile('mobile-picker-test.xlsx');

      // File input should be accessible on mobile
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();

      // Should accept file selection
      await fileInput.setInputFiles(testFile);

      // Should show appropriate file information for mobile
      await expect(page.locator('text=mobile-picker-test.xlsx')).toBeVisible();

      // File size should be shown if available
      const fileSizeInfo = page.locator('[data-testid="file-size"]').or(
        page.locator(':text-matches("\\d+\\s*(KB|MB)", "i")')
      );
      
      if (await fileSizeInfo.isVisible()) {
        await expect(fileSizeInfo).toBeVisible();
      }

      // Should provide clear feedback about file acceptance
      const importButton = page.locator('button:has-text("Upload and Import")');
      await expect(importButton).toBeEnabled();
    });

    test(`${tags.performance} should handle downloads on mobile devices`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Template download should work on mobile
      const templateButton = page.locator('button:has-text("Download Template")');
      await expect(templateButton).toBeVisible();

      // Tap to download (mobile browsers handle downloads differently)
      await templateButton.tap();

      // Should show appropriate feedback for mobile download
      await expect(page.locator('button:has-text("Downloading..."):disabled').or(
        templateButton.filter({ hasText: /Template/ })
      )).toBeVisible({ timeout: 5000 });

      // Button should return to normal state
      await expect(templateButton).toBeEnabled({ timeout: 10000 });
    });
  });

  test.describe('Touch Accessibility', () => {
    test(`${tags.accessibility} should meet touch accessibility standards`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // All interactive elements should meet minimum touch target size (44px)
      const interactiveElements = [
        'button:has-text("Export Scenario Data")',
        'button:has-text("Download Template")',
        'input[type="file"]',
        'select[aria-label="Export Scenario:"]',
        'input[type="checkbox"]'
      ];

      for (const selector of interactiveElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible()) {
          const box = await element.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.width).toBeGreaterThanOrEqual(44);
        }
      }

      // Elements should have adequate spacing for touch
      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      const templateButton = page.locator('button:has-text("Download Template")');

      if (await exportButton.isVisible() && await templateButton.isVisible()) {
        const exportBox = await exportButton.boundingBox();
        const templateBox = await templateButton.boundingBox();

        if (exportBox && templateBox) {
          // Should have adequate spacing between touch targets
          const spacing = Math.abs(exportBox.y - templateBox.y) - exportBox.height;
          expect(spacing).toBeGreaterThanOrEqual(8); // Minimum spacing
        }
      }
    });

    test(`${tags.accessibility} should provide touch feedback`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Touch interactions should provide visual feedback
      const exportButton = page.locator('button:has-text("Export Scenario Data")');
      await expect(exportButton).toBeVisible();

      // Should show active state on touch
      await exportButton.hover(); // Simulate touch start
      
      // Should provide clear visual feedback for touch interactions
      const buttonStyles = await exportButton.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          cursor: styles.cursor,
          opacity: styles.opacity
        };
      });

      expect(buttonStyles.cursor).toBe('pointer');
      expect(parseFloat(buttonStyles.opacity)).toBeGreaterThan(0.5);
    });
  });

  test.describe('Responsive Design Validation', () => {
    const viewports = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPhone 12', width: 390, height: 844 },
      { name: 'iPad', width: 768, height: 1024 },
      { name: 'iPad Pro', width: 1024, height: 1366 },
      { name: 'Small Desktop', width: 1280, height: 800 }
    ];

    viewports.forEach(viewport => {
      test(`${tags.responsive} should work properly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ 
        authenticatedPage,
        testHelpers 
      }) => {
        const page = authenticatedPage;

        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        // Core functionality should be accessible at all viewport sizes
        await expect(page.locator('text=Import & Export Data')).toBeVisible();

        // File input should be accessible
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toBeVisible();

        // Export controls should be accessible
        const exportButton = page.locator('button:has-text("Export Scenario Data")');
        await expect(exportButton).toBeVisible();

        // Layout should not break at this viewport size
        const container = page.locator('main').or(
          page.locator('[data-testid="app-container"]')
        );
        
        if (await container.isVisible()) {
          const containerBox = await container.boundingBox();
          expect(containerBox?.width).toBeLessThanOrEqual(viewport.width);
        }

        // No horizontal scrolling should be required
        const hasHorizontalScroll = await page.evaluate(() => 
          document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(hasHorizontalScroll).toBe(false);
      });
    });
  });

  test.describe('Mobile-Specific Error Handling', () => {
    test(`${tags.edge_case} should handle mobile connection issues gracefully`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Simulate network issues
      await page.route('/api/import/template*', route => route.abort('failed'));

      const templateButton = page.locator('button:has-text("Download Template")');
      await templateButton.tap();

      // Should show mobile-appropriate error message
      const errorMessage = page.locator('text=failed').or(
        page.locator('[role="alert"]')
      );
      await expect(errorMessage).toBeVisible({ timeout: 5000 });

      // Error should be clearly visible on mobile
      const errorBox = await errorMessage.boundingBox();
      expect(errorBox?.width).toBeLessThan(375);
      
      // Should provide retry option appropriate for mobile
      const retryButton = page.locator('button:has-text("Retry")').or(
        page.locator('button:has-text("Try Again")')
      );
      
      if (await retryButton.isVisible()) {
        await expect(retryButton).toBeVisible();
        
        // Retry button should be easily tappable
        const retryBox = await retryButton.boundingBox();
        expect(retryBox?.height).toBeGreaterThanOrEqual(44);
      }
    });

    test(`${tags.edge_case} should handle orientation changes during operations`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const page = authenticatedPage;

      // Start in portrait
      await page.setViewportSize({ width: 375, height: 667 });

      const testFile = await createMobileTestFile('orientation-test.xlsx');
      
      // Start import process
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFile);

      const importButton = page.locator('button:has-text("Upload and Import")');
      await importButton.tap();

      // Change to landscape during import
      await page.setViewportSize({ width: 667, height: 375 });

      // Import should continue and complete successfully
      await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

      // UI should adapt to new orientation
      await expect(page.locator('[data-testid="import-results"]').or(
        page.locator('text=Import Successful').locator('..')
      )).toBeVisible();
    });
  });
});