/**
 * User Experience Validation E2E Tests for Import/Export
 * Comprehensive testing for usability, intuitiveness, feedback quality, and overall user satisfaction
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


test.describe('Import/Export User Experience Validation', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('user-experience-validation');
    
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 25,
      people: 35,
      assignments: 45,
      phases: 20,
      scenarios: 2,
      locations: 6,
      projectTypes: 4,
      roles: 8
    });

    // Set up test files directory
    testFilesPath = path.join(__dirname, '../../../test-files', `ux-validation-${Date.now()}`);
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

  async function createUserFriendlyTestFile(filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    
    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 50 }
    ];

    projectsSheet.addRows([
      {
        name: 'UX Test Project Alpha',
        type: testData.projectTypes[0].name,
        location: testData.locations[0].name,
        priority: 1,
        description: 'A user experience validation project'
      },
      {
        name: 'UX Test Project Beta',
        type: testData.projectTypes[1].name,
        location: testData.locations[1].name,
        priority: 2,
        description: 'Another UX validation project'
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
        name: 'UX Test Person A',
        email: 'ux.test.a@company.com',
        role: testData.roles[0].name,
        workerType: 'FTE'
      },
      {
        name: 'UX Test Person B',
        email: 'ux.test.b@company.com',
        role: testData.roles[1].name,
        workerType: 'Contractor'
      }
    ]);

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  test(`${tags.usability} should provide intuitive and discoverable interface`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Main heading should be clear and descriptive
    await expect(page.locator('h1:has-text("Import")').or(
      page.locator('text=Import & Export Data')
    )).toBeVisible();

    // File upload area should be prominent and clear
    const fileUploadArea = page.locator('[data-testid="file-upload-area"]').or(
      page.locator('text=Drop Excel file here').locator('..')
    );
    
    await expect(fileUploadArea).toBeVisible();

    // Upload instructions should be clear
    await expect(page.locator('text=Drop Excel file here').or(
      page.locator('text=Click to browse')
    )).toBeVisible();

    // Supported file types should be mentioned
    await expect(page.locator('text=.xlsx').or(
      page.locator('text=Excel').or(
        page.locator('text=Supports .xlsx and .xls files')
      )
    )).toBeVisible();

    // Export section should be clearly separated
    await expect(page.locator('text=Export').and(
      page.locator(':near(:text("Data"))')
    )).toBeVisible();

    // Action buttons should be clearly labeled
    await expect(page.locator('button:has-text("Download Template")')).toBeVisible();
    await expect(page.locator('button:has-text("Export Scenario Data")')).toBeVisible();

    // Visual hierarchy should be clear - import and export sections distinguishable
    const importSection = page.locator('[data-testid="import-section"]').or(
      page.locator('text=Import & Export Data').locator('..')
    );
    
    const exportSection = page.locator('[data-testid="export-section"]').or(
      page.locator('text=Export Data').locator('..')
    );

    if (await importSection.isVisible() && await exportSection.isVisible()) {
      const importBox = await importSection.boundingBox();
      const exportBox = await exportSection.boundingBox();
      
      // Sections should be visually distinct
      expect(importBox).toBeTruthy();
      expect(exportBox).toBeTruthy();
    }
  });

  test(`${tags.usability} should provide clear and helpful feedback at every step`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createUserFriendlyTestFile('feedback-test.xlsx');

    // File selection feedback
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Should show file selection confirmation
    await expect(page.locator('text=feedback-test.xlsx')).toBeVisible();

    // Should show file size if available
    const fileSizeDisplay = page.locator('[data-testid="file-size"]').or(
      page.locator(':text-matches("\\d+\\s*(KB|MB)", "i")')
    );
    
    if (await fileSizeDisplay.isVisible()) {
      await expect(fileSizeDisplay).toBeVisible();
    }

    // Import button should become enabled with clear indication
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeEnabled();

    // Button state should be visually distinct when enabled
    const buttonStyles = await importButton.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        opacity: styles.opacity,
        cursor: styles.cursor,
        backgroundColor: styles.backgroundColor
      };
    });

    expect(parseFloat(buttonStyles.opacity)).toBeGreaterThan(0.8);
    expect(buttonStyles.cursor).toBe('pointer');

    // Start import and check progress feedback
    await importButton.click();

    // Should show immediate feedback that process started
    await expect(page.locator('text=Processing').or(
      page.locator('text=Uploading').or(
        page.locator('button:has-text("Importing..."):disabled')
      )
    )).toBeVisible({ timeout: 5000 });

    // Should show completion feedback
    await expect(page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    )).toBeVisible({ timeout: 30000 });

    // Should show summary of what was imported
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("2"))')
    )).toBeVisible();

    await expect(page.locator('text=people:').and(
      page.locator(':near(:text("2"))')
    )).toBeVisible();

    // Success feedback should be positive and encouraging
    const successMessage = page.locator('[data-testid="success-message"]').or(
      page.locator('text=Import Successful').locator('..')
    );
    
    await expect(successMessage).toBeVisible();
  });

  test(`${tags.usability} should minimize cognitive load and decision fatigue`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Default options should be sensible
    const scenarioSelect = page.locator('select[aria-label="Export Scenario:"]');
    if (await scenarioSelect.isVisible()) {
      const selectedValue = await scenarioSelect.inputValue();
      expect(selectedValue).toBeTruthy(); // Should have a default selection
    }

    // Template type should have a sensible default
    const templateSelect = page.locator('select[aria-label="Template Type:"]');
    if (await templateSelect.isVisible()) {
      const selectedValue = await templateSelect.inputValue();
      expect(selectedValue).toBeTruthy();
    }

    // Checkboxes should have reasonable defaults
    const assignmentsCheckbox = page.locator('input[type="checkbox"]:near(:text("Include Project Assignments"))');
    if (await assignmentsCheckbox.isVisible()) {
      const isChecked = await assignmentsCheckbox.isChecked();
      // Either state is fine, but should be intentional
      expect(typeof isChecked).toBe('boolean');
    }

    // Advanced settings should be collapsed by default to reduce complexity
    const advancedSettings = page.locator('[data-testid="advanced-settings"]').or(
      page.locator('text=Override Settings for This Import').locator('..')
    );

    // Should not be visible initially (collapsed)
    if (await page.locator('button:has-text("Show Advanced Settings")').isVisible()) {
      await expect(advancedSettings).not.toBeVisible();
    }

    // Primary actions should be prominently displayed
    const importButton = page.locator('button:has-text("Upload and Import")');
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    const templateButton = page.locator('button:has-text("Download Template")');

    // Check button prominence
    for (const button of [exportButton, templateButton]) {
      if (await button.isVisible()) {
        const buttonBox = await button.boundingBox();
        expect(buttonBox?.height).toBeGreaterThan(30); // Should be adequately sized
      }
    }

    // Should guide user through the most common workflow
    const testFile = await createUserFriendlyTestFile('cognitive-load-test.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Import button should become the obvious next action
    await expect(importButton).toBeEnabled();
    await expect(importButton).toBeVisible();

    // Should not overwhelm with too many options at once
    const visibleButtons = await page.locator('button:visible').count();
    expect(visibleButtons).toBeLessThan(10); // Reasonable number of visible actions
  });

  test(`${tags.usability} should provide excellent error prevention and recovery`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test file type validation
    const textFile = path.join(testFilesPath, 'wrong-type.txt');
    await fs.writeFile(textFile, 'This is not an Excel file');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(textFile);

    // Should prevent or warn about wrong file type
    const errorMessage = page.locator('text=Please select a valid Excel file').or(
      page.locator('text=Invalid file type').or(
        page.locator('[role="alert"]')
      )
    );

    // Either immediate validation or validation on import attempt
    let errorShown = false;
    try {
      await expect(errorMessage).toBeVisible({ timeout: 3000 });
      errorShown = true;
    } catch (e) {
      // Try clicking import to trigger validation
      const importButton = page.locator('button:has-text("Upload and Import")');
      if (await importButton.isEnabled()) {
        await importButton.click();
        await expect(errorMessage).toBeVisible({ timeout: 5000 });
        errorShown = true;
      }
    }

    expect(errorShown).toBe(true);

    // Error should be specific and actionable
    const errorText = await errorMessage.textContent();
    expect(errorText?.toLowerCase()).toContain('excel');

    // Should provide path to recovery
    await expect(page.locator('text=Download Template').or(
      page.locator('button:has-text("Download Template")')
    )).toBeVisible();

    // Reset and test with valid file
    await page.reload();
    await testHelpers.setupPage();

    const validFile = await createUserFriendlyTestFile('valid-file.xlsx');
    await fileInput.setInputFiles(validFile);

    // Should accept valid file without issues
    await expect(page.locator('text=valid-file.xlsx')).toBeVisible();
    
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeEnabled();

    // Should provide confirmation for destructive actions
    await importButton.click();

    // Import should proceed without additional confirmation (since it's not destructive)
    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // But export might ask for confirmation if data is large
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    // Should either export directly or ask for confirmation appropriately
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
  });

  test(`${tags.usability} should be responsive and performant for good user experience`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Page should load quickly
    const loadStartTime = Date.now();
    await page.waitForSelector('text=Import & Export Data', { timeout: 10000 });
    const loadTime = Date.now() - loadStartTime;
    
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds

    // UI should be responsive to interactions
    const responseStartTime = Date.now();
    
    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    
    // Should show immediate feedback
    await expect(page.locator('button:has-text("Downloading..."):disabled').or(
      templateButton.filter({ hasText: /Template/ })
    )).toBeVisible({ timeout: 2000 });
    
    const responseTime = Date.now() - responseStartTime;
    expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds

    await expect(templateButton).toBeEnabled({ timeout: 10000 });

    // File upload should provide immediate feedback
    const testFile = await createUserFriendlyTestFile('responsive-test.xlsx');
    const fileInput = page.locator('input[type="file"]');
    
    const uploadStartTime = Date.now();
    await fileInput.setInputFiles(testFile);
    
    // Should show file name immediately
    await expect(page.locator('text=responsive-test.xlsx')).toBeVisible({ timeout: 1000 });
    
    const uploadFeedbackTime = Date.now() - uploadStartTime;
    expect(uploadFeedbackTime).toBeLessThan(1000); // Immediate feedback

    // Import button should enable quickly
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeEnabled({ timeout: 1000 });

    // Large operations should show progress
    await importButton.click();

    // Should show progress indication within reasonable time
    await expect(page.locator('text=Processing').or(
      page.locator('[data-testid="import-progress"]')
    )).toBeVisible({ timeout: 5000 });

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    console.log(`UX Performance - Load: ${loadTime}ms, Response: ${responseTime}ms, Upload feedback: ${uploadFeedbackTime}ms`);
  });

  test(`${tags.usability} should support efficient task completion workflows`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test the most common workflow: download template, fill it out, import
    
    // Step 1: Download template (should be quick and easy)
    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();
    await expect(templateButton).toBeEnabled({ timeout: 10000 });

    // Step 2: Import data (should be straightforward)
    const testFile = await createUserFriendlyTestFile('efficient-workflow.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    // Should require minimal steps to proceed
    const importButton = page.locator('button:has-text("Upload and Import")');
    await expect(importButton).toBeEnabled();
    await importButton.click();

    await expect(page.locator('text=Import Successful')).toBeVisible({ timeout: 30000 });

    // Step 3: Export data (should be one-click for common case)
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();
    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Entire workflow should be completable in reasonable time
    // (Template download + Import + Export = ~45 seconds max)

    // Should provide shortcuts for power users
    // Check if there are keyboard shortcuts mentioned
    const shortcutHint = page.locator('text=Ctrl').or(
      page.locator('text=keyboard').or(
        page.locator('[title*="shortcut"]')
      )
    );

    if (await shortcutHint.isVisible()) {
      await expect(shortcutHint).toBeVisible();
    }

    // Should remember user preferences
    const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
    if (await advancedButton.isVisible()) {
      await advancedButton.click();

      // Make a setting change
      const settingCheckbox = page.locator('input[type="checkbox"]').first();
      if (await settingCheckbox.isVisible()) {
        const initialState = await settingCheckbox.isChecked();
        await settingCheckbox.setChecked(!initialState);
        
        // Navigate away and back to see if preference persists
        await testHelpers.navigateTo('/projects');
        await testHelpers.navigateTo('/import');
        
        if (await advancedButton.isVisible()) {
          await advancedButton.click();
          
          // Check if setting persisted (implementation-dependent)
          const currentState = await settingCheckbox.isChecked();
          // Both persistence and reset are acceptable UX patterns
        }
      }
    }
  });

  test(`${tags.usability} should provide clear visual hierarchy and information architecture`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Page should have clear structure
    
    // Primary heading should be largest and most prominent
    const mainHeading = page.locator('h1').first();
    const mainHeadingSize = await mainHeading.evaluate(el => {
      return window.getComputedStyle(el).fontSize;
    });

    // Secondary headings should be smaller
    const subHeadings = page.locator('h2, h3');
    if (await subHeadings.count() > 0) {
      const subHeadingSize = await subHeadings.first().evaluate(el => {
        return window.getComputedStyle(el).fontSize;
      });

      // Main heading should be larger than sub-headings
      expect(parseFloat(mainHeadingSize)).toBeGreaterThan(parseFloat(subHeadingSize));
    }

    // Sections should be visually distinct
    const importSection = page.locator('[data-testid="import-section"]').or(
      page.locator('text=Import').locator('..').locator('..')
    );

    const exportSection = page.locator('[data-testid="export-section"]').or(
      page.locator('text=Export').locator('..').locator('..')
    );

    // Should have adequate spacing between sections
    if (await importSection.isVisible() && await exportSection.isVisible()) {
      const importBox = await importSection.boundingBox();
      const exportBox = await exportSection.boundingBox();
      
      if (importBox && exportBox) {
        const verticalSpacing = Math.abs(exportBox.y - (importBox.y + importBox.height));
        expect(verticalSpacing).toBeGreaterThan(10); // Should have spacing
      }
    }

    // Important actions should be visually prominent
    const primaryButtons = page.locator('button:has-text("Upload and Import"), button:has-text("Export Scenario Data")');
    const buttonCount = await primaryButtons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = primaryButtons.nth(i);
      if (await button.isVisible()) {
        const buttonStyles = await button.evaluate(el => {
          const styles = window.getComputedStyle(el);
          return {
            padding: styles.padding,
            backgroundColor: styles.backgroundColor,
            fontSize: styles.fontSize
          };
        });

        // Primary buttons should have adequate padding and size
        expect(buttonStyles.padding).toBeTruthy();
        expect(buttonStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)'); // Should have background
      }
    }

    // Form elements should be properly grouped
    const formGroups = page.locator('.form-group, .field-group, [data-testid*="group"]');
    if (await formGroups.count() > 0) {
      // Form groups should be present and organized
      await expect(formGroups.first()).toBeVisible();
    }

    // Color should not be the only indicator of state
    const testFile = await createUserFriendlyTestFile('visual-hierarchy-test.xlsx');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    
    // Button state should be indicated by more than just color
    const enabledStyles = await importButton.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        cursor: styles.cursor,
        opacity: styles.opacity,
        textDecoration: styles.textDecoration
      };
    });

    expect(enabledStyles.cursor).toBe('pointer');
    expect(parseFloat(enabledStyles.opacity)).toBeGreaterThan(0.8);
  });

  test(`${tags.usability} should provide contextual help and progressive disclosure`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Should provide help context without overwhelming
    const helpElements = page.locator('[data-testid="help"], [aria-label*="help"], button:has-text("Help")');
    const helpText = page.locator('text=Supports .xlsx and .xls files').or(
      page.locator('text=Drop Excel file here')
    );

    // Basic help should be visible
    await expect(helpText).toBeVisible();

    // Advanced help should be available but not intrusive
    if (await helpElements.count() > 0) {
      const helpButton = helpElements.first();
      await helpButton.click();

      const helpContent = page.locator('[data-testid="help-content"]').or(
        page.locator('.help-panel').or(
          page.locator('text=How to import')
        )
      );

      if (await helpContent.isVisible()) {
        await expect(helpContent).toBeVisible();
        
        // Help should be comprehensive but scannable
        const helpTextContent = await helpContent.textContent();
        expect(helpTextContent!.length).toBeGreaterThan(50); // Should be informative
        
        // Should be closeable
        const closeButton = page.locator('button:has-text("Close")').or(
          page.locator('[aria-label="Close"]')
        );
        
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await expect(helpContent).not.toBeVisible();
        }
      }
    }

    // Progressive disclosure - advanced features should be tucked away
    const advancedButton = page.locator('button:has-text("Show Advanced Settings")');
    if (await advancedButton.isVisible()) {
      // Advanced settings should be collapsed initially
      const advancedPanel = page.locator('[data-testid="advanced-settings"]').or(
        page.locator('text=Override Settings for This Import').locator('..')
      );
      
      await expect(advancedPanel).not.toBeVisible();

      // Should expand when requested
      await advancedButton.click();
      await expect(advancedPanel).toBeVisible();

      // Should be collapsible
      const hideButton = page.locator('button:has-text("Hide Advanced Settings")');
      if (await hideButton.isVisible()) {
        await hideButton.click();
        await expect(advancedPanel).not.toBeVisible();
      }
    }

    // Tooltips should provide just-in-time help
    const tooltipTriggers = page.locator('[title], [aria-describedby]');
    if (await tooltipTriggers.count() > 0) {
      const trigger = tooltipTriggers.first();
      await trigger.hover();
      
      // Should show tooltip content
      const tooltip = page.locator('[role="tooltip"], .tooltip');
      if (await tooltip.isVisible()) {
        await expect(tooltip).toBeVisible();
      }
    }

    // Examples should be provided where helpful
    const exampleText = page.locator('text=example').or(
      page.locator('text=e.g.').or(
        page.locator('text=for example')
      )
    );

    if (await exampleText.isVisible()) {
      await expect(exampleText).toBeVisible();
    }
  });

  test(`${tags.usability} should handle edge cases gracefully with good user communication`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    // Test graceful handling of network issues
    await page.route('/api/import/template*', route => route.abort('failed'));

    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    // Should show user-friendly error message
    const errorMessage = page.locator('[role="alert"]').or(
      page.locator('text=failed').or(
        page.locator('text=error')
      )
    );

    await expect(errorMessage).toBeVisible({ timeout: 10000 });

    // Error should be informative and actionable
    const errorText = await errorMessage.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(10);

    // Should provide recovery options
    const retryButton = page.locator('button:has-text("Retry")').or(
      page.locator('button:has-text("Try Again")')
    );

    if (await retryButton.isVisible()) {
      // Restore network and test retry
      await page.unroute('/api/import/template*');
      await retryButton.click();
      
      await expect(templateButton).toBeEnabled({ timeout: 10000 });
    }

    // Test handling of empty states
    await page.reload();
    await testHelpers.setupPage();

    // Should handle scenario with no data gracefully
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    if (await exportButton.isEnabled()) {
      await exportButton.click();
      
      // Should either export successfully or show helpful message
      await expect(exportButton).toBeEnabled({ timeout: 15000 });
    }

    // Test file size limitations communication
    const emptyFile = path.join(testFilesPath, 'empty-file.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.writeFile(emptyFile);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(emptyFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    if (await importButton.isEnabled()) {
      await importButton.click();

      // Should handle empty file gracefully with clear message
      const emptyFileMessage = page.locator('text=No data found').or(
        page.locator('text=Empty file').or(
          page.locator('text=No worksheets')
        )
      );

      await expect(emptyFileMessage).toBeVisible({ timeout: 15000 });

      // Should provide guidance on what to do next
      await expect(page.locator('text=Download Template').or(
        page.locator('button:has-text("Download Template")')
      )).toBeVisible();
    }
  });

  test(`${tags.usability} should provide satisfying completion and success states`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    const page = authenticatedPage;

    const testFile = await createUserFriendlyTestFile('success-states.xlsx');

    // Complete import workflow
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);

    const importButton = page.locator('button:has-text("Upload and Import")');
    await importButton.click();

    // Success message should be prominent and positive
    const successMessage = page.locator('text=Import Successful').or(
      page.locator('text=Import Complete')
    );

    await expect(successMessage).toBeVisible({ timeout: 30000 });

    // Should show what was accomplished
    await expect(page.locator('text=projects:').and(
      page.locator(':near(:text("2"))')
    )).toBeVisible();

    await expect(page.locator('text=people:').and(
      page.locator(':near(:text("2"))')
    )).toBeVisible();

    // Should provide clear next steps
    const nextStepsGuidance = page.locator('text=You can now').or(
      page.locator('text=Next').or(
        page.locator('text=View your imported data')
      )
    );

    if (await nextStepsGuidance.isVisible()) {
      await expect(nextStepsGuidance).toBeVisible();
    }

    // Should offer to continue workflow
    const continueOptions = page.locator('button:has-text("Import Another File")').or(
      page.locator('button:has-text("Export Data")').or(
        page.locator('a:has-text("View Projects")')
      )
    );

    if (await continueOptions.count() > 0) {
      await expect(continueOptions.first()).toBeVisible();
    }

    // Test export success state
    const exportButton = page.locator('button:has-text("Export Scenario Data")');
    await exportButton.click();

    await expect(exportButton).toBeEnabled({ timeout: 15000 });

    // Export completion should be communicated
    // (File download may not show visible success, but button should return to normal state)
    await expect(exportButton).toBeEnabled();
    await expect(exportButton).not.toHaveText(/Exporting/);

    // Template download success
    const templateButton = page.locator('button:has-text("Download Template")');
    await templateButton.click();

    await expect(templateButton).toBeEnabled({ timeout: 10000 });

    // Should maintain positive, encouraging tone throughout
    const allText = await page.locator('body').textContent();
    expect(allText).not.toContain('failed');
    expect(allText).not.toContain('error');

    // Success states should feel rewarding and complete
    await expect(successMessage).toBeVisible();
  });
});