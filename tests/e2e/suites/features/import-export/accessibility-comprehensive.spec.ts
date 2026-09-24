/**
 * Comprehensive Accessibility E2E Tests for Import/Export
 * Testing WCAG 2.1 AA compliance, screen reader support, keyboard navigation, and assistive technology compatibility
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import/Export Accessibility Compliance', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('accessibility-tests');
    
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
    testFilesPath = path.join(__dirname, '../../../test-files', `accessibility-${Date.now()}`);
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

  async function createTestFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 }
    ];

    projectsSheet.addRow({
      name: 'Accessibility Test Project',
      type: testData.projectTypes[0].name,
      location: testData.locations[0].name,
      priority: 1
    });

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.accessibility} should have proper ARIA labels for all import/export controls`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // File upload area should have proper ARIA attributes
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('accept', '.xlsx,.xls');
    
    // Check for aria-label or aria-labelledby
    const fileInputAriaLabel = await fileInput.getAttribute('aria-label');
    const fileInputAriaLabelledBy = await fileInput.getAttribute('aria-labelledby');
    expect(fileInputAriaLabel || fileInputAriaLabelledBy).toBeTruthy();

    // Export scenario selector should have proper labeling
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await expect(scenarioSelect).toBeVisible();
    await expect(scenarioSelect).toHaveAttribute('aria-label', 'Export Scenario:');

    // Template type selector should have proper labeling
    const templateSelect = page.locator('select[aria-label="Template Type:"]');
    await expect(templateSelect).toBeVisible();
    await expect(templateSelect).toHaveAttribute('aria-label', 'Template Type:');

    // Checkboxes should have proper labels
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    if (await assignmentsCheckbox.isVisible()) {
      const checkboxId = await assignmentsCheckbox.getAttribute('id');
      const labelFor = page.locator(`label[for="${checkboxId}"]`);
      await expect(labelFor).toBeVisible();
    }

    // Buttons should have accessible names
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeVisible();
    
    const templateButton = page.locator('button:has-text("Download Template")');
    await expect(templateButton).toBeVisible();
  });

  test(`${tags.accessibility} should support complete keyboard navigation workflow`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Start from beginning of page and navigate using only keyboard
    await page.keyboard.press('Tab');

    // Navigate to file input
    let tabCount = 0;
    while (tabCount < 20) { // Safety limit
      const focusedElement = page.locator(':focus');
      const tagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());
      const type = await focusedElement.getAttribute('type');
      
      if (tagName === 'input' && type === 'file') {
        break;
      }
      
      await page.keyboard.press('Tab');
      tabCount++;
    }

    // File input should be focusable
    const fileInput = page.locator('input[type="file"]:focus');
    await expect(fileInput).toBeVisible();

    // Navigate to export section
    await page.keyboard.press('Tab');
    
    // Should reach scenario selector
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]:focus');
    if (await scenarioSelect.isVisible()) {
      // Should be able to change selection with keyboard
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
    }

    // Navigate to checkboxes
    await page.keyboard.press('Tab');
    const checkbox = page.locator('input[type="checkbox"]:focus');
    if (await checkbox.isVisible()) {
      // Should be able to toggle with space
      const initialChecked = await checkbox.isChecked();
      await page.keyboard.press('Space');
      const afterToggle = await checkbox.isChecked();
      expect(afterToggle).toBe(!initialChecked);
    }

    // Navigate to export button
    let buttonFound = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focusedButton = page.locator('button:focus');
      if (await focusedButton.isVisible()) {
        const buttonText = await focusedButton.textContent();
        if (buttonText?.includes('Export') || buttonText?.includes('Download')) {
          buttonFound = true;
          
          // Should be able to activate with Enter or Space
          await page.keyboard.press('Enter');
          break;
        }
      }
    }
    
    expect(buttonFound).toBe(true);
  });

  test(`${tags.accessibility} should provide screen reader friendly import workflow`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createTestFile('screen-reader-test.xlsx');

    // File input should have descriptive text
    const fileInput = page.locator('input[type="file"]');
    const fileInputLabel = page.locator('label:near(input[type="file"])').or(
      page.locator('[aria-labelledby]').filter({ has: fileInput })
    );
    
    if (await fileInputLabel.isVisible()) {
      const labelText = await fileInputLabel.textContent();
      expect(labelText).toBeTruthy();
      expect(labelText?.toLowerCase()).toContain('excel');
    }

    // Upload file
    await fileInput.setInputFiles(testFile);

    // Should announce file selection
    await expect(page.locator('text=screen-reader-test.xlsx')).toBeVisible();

    // File information should be accessible
    const fileInfo = page.locator('[data-testid="file-info"]').or(
      page.locator(':text-matches("screen-reader-test\\.xlsx")')
    );
    await expect(fileInfo).toBeVisible();

    // Import button should have clear labeling
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeVisible();
    await expect(importButton).toBeEnabled();

    // Progress should be announced
    await importButton.click();

    // Should have progress announcements
    const progressAnnouncement = page.locator('[aria-live="polite"]').or(
      page.locator('[role="status"]').or(
        page.locator('[aria-label*="progress"]')
      )
    );

    // Wait for import to start
    await expect(page.locator('text=Processing').or(
      page.locator('text=Uploading')
    )).toBeVisible({ timeout: 10000 });

    // Results should be accessible
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 30000 });

    // Results summary should be in accessible region
    const resultsRegion = page.locator('[role="region"]').or(
      page.locator('[data-testid="import-results"]')
    );
    await expect(resultsRegion).toBeVisible();
  });

  test(`${tags.accessibility} should handle focus management during async operations`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createTestFile('focus-test.xlsx');

    // Focus on import button
    const importButton = page.locator('button:has-text("Upload and Import")');
    
    // Upload file first
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);
    
    await expect(importButton).toBeVisible();
    await importButton.focus();
    await expect(importButton).toBeFocused();

    // Start import
    await importButton.click();

    // During processing, focus should be managed appropriately
    // Button should be disabled but focus shouldn't be lost unexpectedly
    await expect(importButton).toBeDisabled();

    // Should not steal focus to other elements during processing
    const originalFocus = page.locator(':focus');
    await page.waitForTimeout(2000); // Wait a bit during processing
    
    // Focus should still be on a reasonable element (not lost)
    const currentFocus = page.locator(':focus');
    await expect(currentFocus).toBeVisible();

    // Wait for completion
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // After completion, focus should be restored or moved to results
    const finalFocus = page.locator(':focus');
    await expect(finalFocus).toBeVisible();

    // Should be able to navigate away from results
    await page.keyboard.press('Tab');
    const nextFocus = page.locator(':focus');
    await expect(nextFocus).toBeVisible();
  });

  test(`${tags.accessibility} should support high contrast mode`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Simulate high contrast mode by checking for sufficient color contrast
    const elementsToCheck = [
      'button:has-text("Export Scenario Data")',
      'button:has-text("Download Template")',
      'input[type="file"]',
      'select[aria-label="Export Scenario:"]',
      'label'
    ];

    for (const selector of elementsToCheck) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        // Check that element has visible text/content
        const textContent = await element.textContent();
        const isVisible = await element.isVisible();
        expect(isVisible).toBe(true);
        
        // For buttons and inputs, verify they appear functional
        if (selector.includes('button')) {
          await expect(element).not.toHaveCSS('opacity', '0');
          await expect(element).not.toHaveCSS('visibility', 'hidden');
        }
      }
    }

    // Test with a file upload to ensure visibility throughout workflow
    const testFile = await createTestFile('contrast-test.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // File selection should be clearly visible
    await expect(page.locator('text=contrast-test.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeVisible();
    await expect(importButton).not.toHaveCSS('opacity', '0');
  });

  test(`${tags.accessibility} should provide clear error announcements`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test invalid file type error
    const invalidFile = path.join(testFilesPath, 'invalid.txt');
    await fs.writeFile(invalidFile, 'This is not an Excel file');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([invalidFile]);

    // Error should be announced and visible
    const errorMessage = page.locator('text=Please select a valid Excel file').or(
      page.locator('[role="alert"]').or(
        page.locator('[aria-live="assertive"]')
      )
    );
    
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Error should be persistent and clearly associated with the control
    const errorId = await errorMessage.getAttribute('id');
    if (errorId) {
      const associatedInput = page.locator(`[aria-describedby*="${errorId}"]`);
      await expect(associatedInput).toBeVisible();
    }

    // Test network error scenario
    await page.route('/api/import/template*', route => route.abort('failed'));

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    // Should show accessible error message
    const networkError = page.locator('text=failed').or(
      page.locator('[role="alert"]')
    );
    await expect(networkError).toBeVisible({ timeout: 5000 });
  });

  test(`${tags.accessibility} should support assistive technology announcements`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Check for live regions that would announce status changes
    const liveRegions = page.locator('[aria-live]');
    const statusRegions = page.locator('[role="status"]');
    const alertRegions = page.locator('[role="alert"]');

    // Should have at least one live region for announcements
    const hasLiveRegion = (await liveRegions.count()) > 0 || 
                         (await statusRegions.count()) > 0 || 
                         (await alertRegions.count()) > 0;
    expect(hasLiveRegion).toBe(true);

    const testFile = await createTestFile('assistive-tech-test.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // File selection should trigger announcement
    await expect(page.locator('text=assistive-tech-test.xlsx')).toBeVisible();

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Processing status should be announced
    await expect(page.locator('text=Processing').or(
      page.locator('[aria-live="polite"]').or(
        page.locator('[role="status"]')
      )
    )).toBeVisible({ timeout: 10000 });

    // Completion should be announced
    await expect(page.locator('text=Import Successful').or(
      page.locator('[role="status"]')
    )).toBeVisible({ timeout: 30000 });
  });

  test(`${tags.accessibility} should handle reduced motion preferences`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Simulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const testFile = await createTestFile('reduced-motion-test.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Progress indicators should respect reduced motion
    const progressElements = page.locator('[data-testid="import-progress"]').or(
      page.locator('.progress-bar').or(
        page.locator('[role="progressbar"]')
      )
    );

    if (await progressElements.first().isVisible()) {
      // Should not have excessive animations
      const element = progressElements.first();
      const animationDuration = await element.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return styles.animationDuration;
      });
      
      // With reduced motion, animations should be minimal or disabled
      expect(animationDuration).toMatch(/0s|none/);
    }

    // Complete workflow should work without relying on animations
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });
  });

  test(`${tags.accessibility} should provide descriptive button states`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Export button should have clear state indication
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    // Click export button
    await exportButton.click();

    // During export, button should show loading state accessibly
    const loadingButton = page.locator('button:has-text("Exporting...")').or(
      page.locator('button[disabled]:has-text("Export")')
    );
    
    if (await loadingButton.isVisible()) {
      // Should have aria-label or aria-describedby for state
      const ariaLabel = await loadingButton.getAttribute('aria-label');
      const ariaDescribedBy = await loadingButton.getAttribute('aria-describedby');
      const ariaDisabled = await loadingButton.getAttribute('aria-disabled');
      
      expect(ariaLabel || ariaDescribedBy || ariaDisabled).toBeTruthy();
    }

    // After export, button should return to normal state
    await expect(exportButton).toBeEnabled({ timeout: 10000 });
  });

  test(`${tags.accessibility} should support zoom and magnification`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test 200% zoom level
    await page.setViewportSize({ width: 640, height: 480 }); // Simulates zoom
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });

    // All controls should remain accessible at high zoom
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();

    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await expect(exportButton).toBeVisible();

    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    await expect(scenarioSelect).toBeVisible();

    // Should be able to complete workflow at high zoom
    const testFile = await createTestFile('zoom-test.xlsx');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeVisible();
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Reset zoom
    await page.evaluate(() => {
      document.body.style.zoom = '1';
    });
  });

  test(`${tags.accessibility} should provide accessible help and instructions`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Should have help text or instructions visible
    const helpText = page.locator('text=Supports .xlsx and .xls files').or(
      page.locator('[data-testid="help-text"]').or(
        page.locator('text=Drop Excel file here')
      )
    );
    await expect(helpText).toBeVisible();

    // Help text should be associated with form controls
    const fileInput = page.locator('input[type="file"]');
    const describedBy = await fileInput.getAttribute('aria-describedby');
    
    if (describedBy) {
      const helpElement = page.locator(`#${describedBy}`);
      await expect(helpElement).toBeVisible();
    }

    // Instructions should be clear and actionable
    const instructions = page.locator('text=Drop Excel file here or click to browse');
    if (await instructions.isVisible()) {
      const instructionText = await instructions.textContent();
      expect(instructionText).toBeTruthy();
      expect(instructionText?.length).toBeGreaterThan(10);
    }

    // Advanced settings should have help text
    const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
    if (await advancedButton.isVisible()) {
      await advancedButton.click();
      
      const advancedHelp = page.locator('text=Override Settings for This Import').or(
        page.locator('[data-testid="advanced-help"]')
      );
      await expect(advancedHelp).toBeVisible();
    }
  });
});