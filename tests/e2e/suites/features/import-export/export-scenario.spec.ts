/**
 * Export Scenario Feature Test Suite
 * (modernized 2026-09-26, L4 harvest slice 6 — import-export self-sufficiency)
 *
 * The old version failed 11/11 in beforeEach on a fabricated
 * `[data-testid="export-section"]` and never reached the export tab
 * (import is the DEFAULT tab on /import). Anchored to the real
 * ImportUnified.tsx contract:
 *
 * - `/import?tab=export` selects the export tab directly
 *   (useBookmarkableTabs syncs the `tab` URL param)
 * - the export card is `.import-card.export-section` — no testid exists
 * - the scenario select is the only select in the
 *   "Choose Scenario to Export:" form-group
 * - assignment/phase checkboxes sit behind the "Show Options"
 *   disclosure button (aria-label anchors)
 * - the export button shares its text with the card heading (strict-mode
 *   unsafe) — select it by aria-label instead
 * - failures surface inside OperationProgress (no alert()): an aborted
 *   request renders "No response from server..." plus a Retry button
 * - server sheet contract (ImportController.exportScenarioData):
 *   Projects, Rosters, Standard Allocations, [Project Assignments],
 *   [Project Phase Timelines], Export Metadata — filename
 *   `{name}_export_{date}.xlsx`, metadata row Export Type =
 *   'Capacinator Scenario Export'
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
  let downloadDir: string;

  // Stable anchors into the export tab of ImportUnified.tsx
  const exportCard = () => page.locator('.import-card.export-section');
  const scenarioSelect = () =>
    page.locator('.form-group:has(label:has-text("Choose Scenario to Export:")) select');
  const showOptionsButton = () => page.locator('button[aria-label="Show export options"]');
  const includeAssignmentsCheckbox = () =>
    page.locator('.checkbox-label:has-text("Include Project Assignments") input');
  const includePhasesCheckbox = () =>
    page.locator('.checkbox-label:has-text("Include Phase Timelines") input');
  const exportButton = () =>
    page.locator('button[aria-label="Export selected scenario data as Excel file"]');

  let page: import('@playwright/test').Page;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    page = authenticatedPage;
    testContext = testDataHelpers.createTestContext('export');

    // A branch scenario beside the seed Baseline gives the dropdown a real
    // second entry (selection/switching tests) — assignments copied from
    // parent by branchFromParent keep the export sheets non-empty.
    await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 3,
      assignments: 4,
      scenarios: 1
    });

    downloadDir = path.join(__dirname, '../../../test-results', `export-${Date.now()}`);
    await fs.mkdir(downloadDir, { recursive: true });

    await testHelpers.navigateTo('/import?tab=export');
    await expect(exportCard()).toBeVisible();
    await expect(scenarioSelect()).toBeVisible();
  });

  test.afterEach(async ({ testDataHelpers }) => {
    await testDataHelpers.cleanupTestContext(testContext).catch(() => {});
    await fs.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
  });

  /** Click export, capture the download, return the saved path. */
  async function exportAndSave(): Promise<string> {
    const downloadPromise = page.waitForEvent('download');
    await exportButton().click();
    const download = await downloadPromise;
    const target = path.join(downloadDir, download.suggestedFilename());
    await download.saveAs(target);
    return target;
  }

  test(`${tags.smoke} should display export scenario section`, async () => {
    await expect(page.locator('h2', { hasText: 'Export Data' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Export Scenario Data' })).toBeVisible();
    await expect(
      page.getByText('Export current scenario data in re-importable Excel format')
    ).toBeVisible();

    // Placeholder (Current: …) + at least Baseline and the branch scenario
    const optionCount = await scenarioSelect().locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(3);

    await expect(exportButton()).toBeVisible();
    await expect(exportButton()).toBeEnabled();
  });

  test(`${tags.critical} should export current scenario data successfully`, async () => {
    // Options disclosure: both checkboxes default to checked
    await showOptionsButton().click();
    await expect(includeAssignmentsCheckbox()).toBeChecked();
    await expect(includePhasesCheckbox()).toBeChecked();

    const savedPath = await exportAndSave();

    const stats = await fs.stat(savedPath);
    expect(stats.size).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(savedPath);

    const worksheetNames = workbook.worksheets.map(ws => ws.name);
    expect(worksheetNames).toContain('Projects');
    expect(worksheetNames).toContain('Rosters');
    expect(worksheetNames).toContain('Export Metadata');
    expect(worksheetNames).toContain('Project Assignments');

    const projectsSheet = workbook.getWorksheet('Projects');
    expect(projectsSheet!.rowCount).toBeGreaterThan(1);

    const metadataSheet = workbook.getWorksheet('Export Metadata');
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

    await expect(page.getByText('Export completed successfully')).toBeVisible();
  });

  test(`should export a specific scenario when selected`, async () => {
    // First real (non-placeholder) option — placeholder is value=""
    const options = scenarioSelect().locator('option');
    const count = await options.count();
    let selectedValue = '';
    for (let i = 0; i < count; i++) {
      const value = await options.nth(i).getAttribute('value');
      if (value) {
        selectedValue = value;
        break;
      }
    }
    expect(selectedValue, 'no real scenario option in export dropdown').toBeTruthy();
    await scenarioSelect().selectOption(selectedValue);

    const savedPath = await exportAndSave();

    // Server filename contract: {scenario}_export_{date}.xlsx
    const filename = path.basename(savedPath);
    expect(filename).toMatch(/\.xlsx$/);
    expect(filename).toContain('export');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(savedPath);
    expect(workbook.getWorksheet('Export Metadata')).toBeDefined();
  });

  test(`should omit optional sheets when both export options are unchecked`, async () => {
    await showOptionsButton().click();
    await includeAssignmentsCheckbox().uncheck();
    await includePhasesCheckbox().uncheck();

    const savedPath = await exportAndSave();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(savedPath);
    const worksheetNames = workbook.worksheets.map(ws => ws.name);

    expect(worksheetNames).toContain('Projects');
    expect(worksheetNames).toContain('Rosters');
    expect(worksheetNames).toContain('Export Metadata');
    expect(worksheetNames).not.toContain('Project Assignments');
    expect(worksheetNames).not.toContain('Project Phase Timelines');
  });

  test(`should be keyboard accessible`, async () => {
    // Select is focusable and identifiable
    await scenarioSelect().focus();
    await expect(scenarioSelect()).toBeFocused();

    // Disclosure reveals the checkboxes; Space toggles
    await showOptionsButton().click();
    await includeAssignmentsCheckbox().focus();
    await expect(includeAssignmentsCheckbox()).toBeFocused();
    await page.keyboard.press('Space');
    await expect(includeAssignmentsCheckbox()).not.toBeChecked();

    // DOM tab order: assignments checkbox → phases checkbox → export button
    await page.keyboard.press('Tab');
    await expect(includePhasesCheckbox()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(exportButton()).toBeFocused();
    await expect(exportButton()).toBeEnabled();
  });

  test(`should surface loading state while export runs`, async () => {
    // Hold the export request long enough to observe the progress UI
    await page.route('**/api/import/export/scenario*', async route => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.continue();
    });

    await exportButton().click();

    // While running: button replaced by OperationProgress with its message
    await expect(page.getByText('Preparing scenario export...')).toBeVisible();
    await expect(exportButton()).toBeHidden();

    // Completion restores a success state
    await expect(page.getByText('Export completed successfully')).toBeVisible({
      timeout: 15000
    });
  });

  test(`should handle export errors gracefully`, async () => {
    await page.route('**/api/import/export/scenario*', route => route.abort('failed'));

    await exportButton().click();

    // Error surfaces in OperationProgress (no browser alert)
    await expect(
      page.getByText('No response from server. Please check your connection')
    ).toBeVisible({ timeout: 10000 });

    // Retry is offered for a failed export
    await expect(page.locator('button', { hasText: 'Retry' }).first()).toBeVisible();
  });

  test(`should work on mobile viewport`, async () => {
    await page.setViewportSize({ width: 375, height: 667 });

    await expect(page.locator('h3', { hasText: 'Export Scenario Data' })).toBeVisible();
    await expect(scenarioSelect()).toBeVisible();
    await expect(exportButton()).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    // click, not tap: the scenario-chrome context doesn't enable hasTouch,
    // and the layout adaptation is what this test is about
    await exportButton().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test(`${tags.slow} should export large datasets efficiently`, async ({ testDataHelpers }) => {
    test.setTimeout(90000);
    await testDataHelpers.createBulkTestData(testContext, {
      projects: 25,
      people: 50,
      assignments: 75
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(exportCard()).toBeVisible();

    const startTime = Date.now();
    const savedPath = await exportAndSave();
    const exportTime = Date.now() - startTime;

    const stats = await fs.stat(savedPath);
    expect(stats.size).toBeGreaterThan(5000);
    expect(exportTime).toBeLessThan(30000);
  });

  test(`should only list valid scenarios in the dropdown`, async () => {
    const options = await scenarioSelect().locator('option').all();

    // Placeholder + at least Baseline and the test branch
    expect(options.length).toBeGreaterThanOrEqual(3);

    let realOptions = 0;
    for (const option of options) {
      const text = (await option.textContent()) || '';
      // Placeholder reads "Current: {name} ({type})" — value=""
      const value = await option.getAttribute('value');
      if (!value) {
        expect(text).toContain('Current:');
        continue;
      }
      realOptions++;
      // Every scenario option carries its type in parentheses
      expect(text).toMatch(/\([^)]+\)/);
    }
    expect(realOptions).toBeGreaterThanOrEqual(2);
  });

  test(`should keep export available when switching scenarios`, async () => {
    const initialValue = await scenarioSelect().inputValue();

    // Pick the first option whose value differs from the current one
    const options = scenarioSelect().locator('option');
    const count = await options.count();
    let switched = false;
    for (let i = 0; i < count; i++) {
      const value = await options.nth(i).getAttribute('value');
      if (value && value !== initialValue) {
        await scenarioSelect().selectOption(value);
        switched = true;
        break;
      }
    }
    expect(switched, 'no alternative scenario to switch to').toBe(true);

    expect(await scenarioSelect().inputValue()).not.toBe(initialValue);
    await expect(exportButton()).toBeEnabled();
  });
});
