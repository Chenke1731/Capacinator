/**
 * Complex Import Scenarios E2E Tests
 * (modernized 2026-09-26, L4 harvest slice 6 — import-export self-sufficiency)
 *
 * The old suite drove UI that was never built (Analyze / conflict-analysis
 * panels, Import Anyway, cancel, batch progress, Download Error Report) and
 * asserted a >500KB threshold for a 2000-row workbook that ExcelJS
 * compresses to ~150KB. It also uploaded V1-format workbooks while the
 * "Use new template format" checkbox (V2 importer) defaults to CHECKED —
 * V2 requires a 'Roster' sheet and rejects 'Rosters' outright.
 *
 * The real contract (ImportController.uploadExcel + ExcelImporter V1):
 * - V1 files need Projects + Rosters + Standard Allocations sheets;
 *   missing Standard Allocations is a critical error → rollback
 * - import is all-or-nothing: any data error rolls back the whole
 *   transaction ("Import failed", HTTP 400, errors array)
 * - validateDuplicates defaults ON: project/person NAMES colliding with
 *   the DB (or duplicated inside the file) cancel the import before it
 *   starts ("Duplicate records found. Import cancelled …")
 * - unknown project types / locations / roles are auto-created
 *   (findOrCreate — not gated by the autoCreate settings)
 * - success → HTTP 200 { success, message, imported } where
 *   imported.projects/people are per-run counts (roles/locations/
 *   projectTypes/phases are whole-table counts — never assert exact)
 * - UI: hidden file input + "Upload and Import" button; result panel
 *   heading echoes the server message; failures render "Import failed"
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import type { APIRequestContext, Page, Response } from '@playwright/test';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProjectRow {
  name: string;
  type?: string;
  location?: string;
  priority?: number;
  description?: string;
}

interface PersonRow {
  name: string;
  email?: string;
  role?: string;
  workerType?: string;
  availability?: number;
  hoursPerDay?: number;
}

test.describe('Complex Import Scenarios', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testFilesPath: string;
  let page: Page;

  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage }) => {
    page = authenticatedPage;
    testContext = testDataHelpers.createTestContext('complex-import-scenarios');

    // Reference arrays (projectTypes/locations/roles from the seed) plus a
    // couple of existing entities for duplicate-guard testing. Import is
    // not scenario-scoped, so no scenario setup is needed.
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 2,
      assignments: 2
    });

    testFilesPath = path.join(__dirname, '../../../test-results', `complex-import-${Date.now()}`);
    await fs.mkdir(testFilesPath, { recursive: true });

    await testHelpers.navigateTo('/import');
    await expect(page.getByText('Drop Excel file here')).toBeVisible();
  });

  test.afterEach(async ({ testDataHelpers, apiContext }) => {
    await testDataHelpers.cleanupTestContext(testContext).catch(() => {});

    // Import-inserted rows are not tracked by the test context — sweep them
    // by name prefix so the shared database stays clean for sibling suites.
    await sweepImportedEntities(apiContext, testContext.prefix).catch(() => {});

    await fs.rm(testFilesPath, { recursive: true, force: true }).catch(() => {});
  });

  // ---------- V1 workbook builder (the format the V1 importer reads) ----------

  async function buildV1File(
    filename: string,
    projects: ProjectRow[],
    people: PersonRow[],
    allocations: { projectType: string; phase: string; role: string; allocation: number }[] = []
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();

    const projectsSheet = workbook.addWorksheet('Projects');
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 32 },
      { header: 'Project Type', key: 'type', width: 22 },
      { header: 'Location', key: 'location', width: 22 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Description', key: 'description', width: 40 }
    ];
    projectsSheet.addRows(projects);

    const rostersSheet = workbook.addWorksheet('Rosters');
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'role', width: 20 },
      { header: 'Worker Type', key: 'workerType', width: 14 },
      { header: 'Availability %', key: 'availability', width: 14 },
      { header: 'Hours Per Day', key: 'hoursPerDay', width: 14 }
    ];
    rostersSheet.addRows(people);

    // Required sheet — header-only is accepted, one real row here
    const allocationsSheet = workbook.addWorksheet('Standard Allocations');
    allocationsSheet.columns = [
      { header: 'Project Type', key: 'projectType', width: 22 },
      { header: 'Phase', key: 'phase', width: 18 },
      { header: 'Role', key: 'role', width: 20 },
      { header: 'Allocation %', key: 'allocation', width: 12 }
    ];
    if (allocations.length > 0) {
      allocationsSheet.addRows(allocations);
    }

    const filePath = path.join(testFilesPath, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /** Default project row bound to seed reference data. */
  const validProject = (name: string): ProjectRow => ({
    name,
    type: testData.projectTypes[0]?.name,
    location: testData.locations[0]?.name,
    priority: 2,
    description: 'Complex import test project'
  });

  /** Default person row with a unique prefixed email. */
  const validPerson = (name: string): PersonRow => ({
    name,
    email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@import.test`,
    role: testData.roles[0]?.name,
    workerType: 'FTE',
    availability: 100,
    hoursPerDay: 8
  });

  // ---------- Import via the real UI flow ----------

  const useV2Checkbox = () =>
    page.locator('.checkbox-label:has-text("Use new template format (fiscal weeks)") input');
  const fileInput = () => page.locator('input[type="file"]');
  const uploadButton = () => page.locator('button:has-text("Upload and Import")');

  async function importViaUi(filePath: string, v1: boolean): Promise<Response> {
    if (v1) {
      await useV2Checkbox().uncheck();
    }
    await fileInput().setInputFiles(filePath);
    await expect(page.locator('.file-selected h3')).toHaveText(path.basename(filePath));

    const responsePromise = page.waitForResponse(
      r => r.url().includes('/api/import/excel') && r.request().method() === 'POST'
    );
    await uploadButton().click();
    return responsePromise;
  }

  async function bodyOf(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  // ---------- Post-import database sweeps (API level) ----------

  async function listByPrefix(
    apiContext: APIRequestContext,
    endpoint: string,
    prefix: string
  ): Promise<any[]> {
    const res = await apiContext.get(`${endpoint}?limit=500`);
    const body = await res.json();
    const rows = body.data || body || [];
    return (Array.isArray(rows) ? rows : []).filter(
      (row: any) => typeof row.name === 'string' && row.name.startsWith(prefix)
    );
  }

  async function sweepImportedEntities(apiContext: APIRequestContext, prefix: string) {
    for (const row of await listByPrefix(apiContext, '/api/projects', prefix)) {
      await apiContext.delete(`/api/projects/${row.id}`).catch(() => {});
    }
    for (const row of await listByPrefix(apiContext, '/api/people', prefix)) {
      await apiContext.delete(`/api/people/${row.id}`).catch(() => {});
    }
    // Auto-created reference entities are prefixed too — delete best-effort
    // (a leftover is harmless residue, a failed delete must not fail tests)
    for (const endpoint of ['/api/project-types', '/api/locations', '/api/roles']) {
      for (const row of await listByPrefix(apiContext, endpoint, prefix)) {
        await apiContext.delete(`${endpoint}/${row.id}`).catch(() => {});
      }
    }
  }

  // ---------- Tests ----------

  test(`${tags.critical} should cancel import when duplicate names are detected`, async () => {
    const prefix = testContext.prefix;
    // Project NAME matches an entity created by beforeEach → validateDuplicates
    // (default ON) must cancel before anything is written
    const file = await buildV1File(
      'duplicate-name.xlsx',
      [
        validProject(testData.projects[0].name), // existing name — the duplicate
        validProject(`${prefix}-New-Project`)
      ],
      [validPerson(`${prefix}-New-Person`)]
    );

    const response = await importViaUi(file, true);
    expect(response.status()).toBe(400);

    const body = await bodyOf(response);
    expect(body.success).toBe(false);
    expect(body.errors.join(' ')).toContain('Duplicate records found');

    await expect(page.locator('.import-result h3')).toHaveText('Import failed');
  });

  test(`should import a valid V1 file and report exact per-run counts`, async () => {
    const prefix = testContext.prefix;
    const file = await buildV1File(
      'valid-import.xlsx',
      [1, 2, 3].map(i => validProject(`${prefix}-Imported-Project-${i}`)),
      [1, 2, 3].map(i => validPerson(`${prefix}-Imported-Person-${i}`)),
      [
        {
          projectType: testData.projectTypes[0]?.name,
          phase: 'Design',
          role: testData.roles[0]?.name,
          allocation: 50
        }
      ]
    );

    const response = await importViaUi(file, true);
    expect(response.status()).toBe(200);

    const body = await bodyOf(response);
    expect(body.success).toBe(true);
    expect(body.imported.projects).toBe(3);
    expect(body.imported.people).toBe(3);

    // Result panel echoes the server message; per-run counts are in the grid
    await expect(page.locator('.import-result h3')).toHaveText('Excel import completed successfully');
    const projectsStat = page
      .locator('.stat-item')
      .filter({ hasText: /^projects:/ })
      .locator('.stat-value');
    await expect(projectsStat).toHaveText('3');
  });

  test(`should reject a V1 file when the V2 format checkbox stays on`, async () => {
    const prefix = testContext.prefix;
    const file = await buildV1File(
      'v2-mismatch.xlsx',
      [validProject(`${prefix}-V2Mismatch-Project`)],
      [validPerson(`${prefix}-V2Mismatch-Person`)]
    );

    // Keep "Use new template format" CHECKED (the default) — the V2
    // importer requires a 'Roster' sheet and rejects the V1 'Rosters' one
    const response = await importViaUi(file, false);
    expect(response.status()).toBe(400);

    const body = await bodyOf(response);
    expect(body.success).toBe(false);
    expect(body.errors.join(' ')).toContain('Roster');

    await expect(page.locator('.import-result h3')).toHaveText('Import failed');
  });

  test(`should auto-create missing project types, locations and roles`, async ({
    apiContext
  }) => {
    const prefix = testContext.prefix;
    const newType = `${prefix}-AutoType`;
    const newLocation = `${prefix}-AutoLocation`;
    const newRole = `${prefix}-AutoRole`;

    const file = await buildV1File(
      'auto-create.xlsx',
      [
        {
          name: `${prefix}-AutoRef-Project`,
          type: newType,
          location: newLocation,
          priority: 1
        }
      ],
      [
        {
          name: `${prefix}-AutoRef-Person`,
          email: 'autoref@import.test',
          role: newRole,
          workerType: 'FTE',
          availability: 100,
          hoursPerDay: 8
        }
      ]
    );

    const response = await importViaUi(file, true);
    expect(response.status()).toBe(200);
    await expect(page.locator('.import-result h3')).toHaveText('Excel import completed successfully');

    // Reference entities materialized (V1 findOrCreate is unconditional)
    for (const [endpoint, name] of [
      ['/api/project-types', newType],
      ['/api/locations', newLocation],
      ['/api/roles', newRole]
    ] as const) {
      const rows = await listByPrefix(apiContext, endpoint, `${prefix}-Auto`);
      expect(rows.some(r => r.name === name), `${endpoint} should contain ${name}`).toBe(true);
    }
  });

  test(`should roll back the whole import when any row is invalid`, async ({ apiContext }) => {
    const prefix = testContext.prefix;
    const file = await buildV1File(
      'mixed-quality.xlsx',
      [validProject(`${prefix}-Rollback-A`), validProject(`${prefix}-Rollback-B`)],
      [
        validPerson(`${prefix}-Rollback-Person`),
        {
          name: `${prefix}-Invalid-Availability`,
          email: 'invalid-availability@import.test',
          role: testData.roles[0]?.name,
          workerType: 'FTE',
          availability: 150, // > 100 → data error → all-or-nothing rollback
          hoursPerDay: 8
        }
      ]
    );

    const response = await importViaUi(file, true);
    expect(response.status()).toBe(400);

    const body = await bodyOf(response);
    expect(body.success).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);

    await expect(page.locator('.import-result h3')).toHaveText('Import failed');

    // The two VALID projects must not survive — the transaction rolled back
    const survivors = await listByPrefix(apiContext, '/api/projects', `${prefix}-Rollback`);
    expect(survivors).toHaveLength(0);
  });

  test(`should reject invalid email format with a rollback`, async ({ apiContext }) => {
    const prefix = testContext.prefix;
    const file = await buildV1File(
      'invalid-email.xlsx',
      [validProject(`${prefix}-Email-Project`)],
      [
        {
          name: `${prefix}-BadEmail-Person`,
          email: 'not-an-email',
          role: testData.roles[0]?.name,
          workerType: 'FTE',
          availability: 100,
          hoursPerDay: 8
        }
      ]
    );

    const response = await importViaUi(file, true);
    expect(response.status()).toBe(400);

    const body = await bodyOf(response);
    expect(body.errors.join(' ')).toContain('mail');

    await expect(page.locator('.import-result h3')).toHaveText('Import failed');
    expect(await listByPrefix(apiContext, '/api/projects', `${prefix}-Email`)).toHaveLength(0);
  });

  test(`should persist imported projects and surface them on the Projects page`, async ({
    apiContext,
    testHelpers
  }) => {
    const prefix = testContext.prefix;
    const names = [1, 2, 3, 4, 5].map(i => `${prefix}-Persist-Project-${i}`);
    const file = await buildV1File(
      'persistence.xlsx',
      names.map(n => validProject(n)),
      [validPerson(`${prefix}-Persist-Person`)]
    );

    const response = await importViaUi(file, true);
    expect(response.status()).toBe(200);

    // API level: all five landed
    const persisted = await listByPrefix(apiContext, '/api/projects', `${prefix}-Persist-Project`);
    expect(persisted).toHaveLength(5);

    // UI level: they render on the Projects page (seed type carries the
    // 需求交付 category prefix, so the rows land in the default tab)
    await testHelpers.navigateTo('/projects');
    await expect(page.getByText(`${prefix}-Persist-Project-1`).first()).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText(`${prefix}-Persist-Project-5`).first()).toBeVisible();
  });

  test(`${tags.slow} should import a large dataset within the time budget`, async () => {
    test.setTimeout(180000);
    const prefix = testContext.prefix;
    const count = 1000;

    const projects: ProjectRow[] = [];
    const people: PersonRow[] = [];
    for (let i = 1; i <= count; i++) {
      projects.push({
        name: `${prefix}-Bulk-Project-${i}`,
        type: testData.projectTypes[i % testData.projectTypes.length]?.name,
        location: testData.locations[i % testData.locations.length]?.name,
        priority: (i % 3) + 1,
        description: `Large dataset row ${i}`
      });
      people.push({
        name: `${prefix}-Bulk-Person-${i}`,
        email: `bulk${i}.${prefix}@import.test`,
        role: testData.roles[i % testData.roles.length]?.name,
        workerType: i % 3 === 0 ? 'Contractor' : 'FTE',
        availability: 80,
        hoursPerDay: 8
      });
    }
    const file = await buildV1File('large-dataset.xlsx', projects, people);

    const startTime = Date.now();
    const response = await importViaUi(file, true);
    const elapsed = Date.now() - startTime;

    expect(response.status()).toBe(200);
    const body = await bodyOf(response);
    expect(body.imported.projects).toBe(count);
    expect(body.imported.people).toBe(count);
    expect(elapsed).toBeLessThan(150000);

    await expect(page.locator('.import-result h3')).toHaveText(
      'Excel import completed successfully'
    );
  });

  test(`should reset to a clean state after removing the selected file`, async () => {
    const file = await buildV1File(
      'remove-file.xlsx',
      [validProject(`${testContext.prefix}-Removed-Project`)],
      [validPerson(`${testContext.prefix}-Removed-Person`)]
    );

    await fileInput().setInputFiles(file);

    // File chip with name + size, plus the remove button
    await expect(page.locator('.file-selected h3')).toHaveText('remove-file.xlsx');
    await expect(uploadButton()).toBeVisible();

    await page.locator('.file-selected button.btn-icon').click();

    // Back to the empty upload state; no upload possible without a file
    await expect(page.getByText('Drop Excel file here')).toBeVisible();
    await expect(uploadButton()).toHaveCount(0);
  });
});
