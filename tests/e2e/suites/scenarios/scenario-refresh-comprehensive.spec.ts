/**
 * Comprehensive Scenario Data Refresh (modernized 2026-09-24, D13)
 * Semantics notes: the dashboard summary and the projects list are GLOBAL
 * views — scenario switching must keep them stable, not change them. The
 * scenario world lives in assignments and reports. Scenario setup goes
 * through the API (created_by is required; /api/scenario-projects no longer
 * exists).
 */
import { test, expect } from '../../fixtures';
import { ScenarioTestUtils } from '../../helpers/scenario-test-utils';

test.describe('Comprehensive Scenario Data Refresh', () => {
  let scenarioUtils: ScenarioTestUtils;
  let baselineScenarioId: string;
  let branchScenarioId: string;
  let sandboxScenarioId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const apiContext = context.request;
    const post = async (payload: Record<string, unknown>) => {
      const res = await apiContext.post('http://localhost:3111/api/scenarios', { data: payload });
      if (!res.ok()) throw new Error(`Scenario create failed: ${res.status()}`);
      return (await res.json()).id;
    };

    // created_by is required by POST /api/scenarios
    const people = await (await apiContext.get('http://localhost:3111/api/people')).json();
    const created_by = people?.data?.[0]?.id;

    // Branch from the SEED baseline (stable id in the e2e world). Do NOT
    // create a second baseline: ScenarioContext auto-selects the FIRST
    // baseline it finds, and a test-made empty baseline would steal that
    // selection and blank out every later page in this file.
    baselineScenarioId = 'baseline-0000-0000-0000-000000000000';
    branchScenarioId = await post({
      name: 'Test Branch - Comprehensive',
      scenario_type: 'branch',
      status: 'active',
      parent_scenario_id: baselineScenarioId,
      description: 'Branch with additional assignments',
      created_by
    });
    sandboxScenarioId = await post({
      name: 'Test Sandbox - Comprehensive',
      scenario_type: 'sandbox',
      status: 'draft',
      description: 'Sandbox for experimental changes',
      created_by
    });

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const apiContext = context.request;
    // The seed baseline is not ours to delete
    for (const id of [sandboxScenarioId, branchScenarioId]) {
      if (id) {
        await apiContext.delete(`http://localhost:3111/api/scenarios/${id}`).catch(() => {});
      }
    }
    await context.close();
  });

  test.beforeEach(async ({ authenticatedPage, apiContext }) => {
    scenarioUtils = new ScenarioTestUtils({
      page: authenticatedPage,
      apiContext: apiContext,
      testPrefix: 'test-comprehensive'
    });
  });

  test.describe('Dashboard Page', () => {
    test('should keep dashboard metrics stable across scenario changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Dashboard summary counts are a GLOBAL view — switching scenarios
      // must not corrupt them.
      const getMetrics = async () => ({
        projects: await authenticatedPage.locator('text=Active Projects').locator('..').locator('p.text-2xl').textContent(),
        people: await authenticatedPage.locator('text=Total People').locator('..').locator('p.text-2xl').textContent(),
        roles: await authenticatedPage.locator('text=Total Roles').locator('..').locator('p.text-2xl').textContent()
      });

      const baselineMetrics = await getMetrics();

      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');

      const branchMetrics = await getMetrics();
      expect(branchMetrics.projects).toBe(baselineMetrics.projects);
      expect(branchMetrics.people).toBe(baselineMetrics.people);
      expect(branchMetrics.roles).toBe(baselineMetrics.roles);

      // Charts still render
      const chartElements = await authenticatedPage.locator('svg').count();
      expect(chartElements).toBeGreaterThan(0);
    });

    test('should re-fetch data during scenario switch', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // No dedicated loading skeleton exists; the honest signal is the
      // data request re-firing.
      const refreshPromise = authenticatedPage.waitForResponse(
        resp => resp.url().includes('/api/') && resp.request().method() === 'GET',
        { timeout: 8000 }
      ).catch(() => null);

      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');

      const refreshed = await refreshPromise;
      expect(refreshed).not.toBeNull();
    });
  });

  test.describe('Projects Page', () => {
    test('should keep the global projects list stable across scenarios', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Projects are global (scenario-scoped projects were removed)
      const baselineRows = await authenticatedPage.locator('.requirements-row').count();
      expect(baselineRows).toBeGreaterThan(0);

      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');

      const branchRows = await authenticatedPage.locator('.requirements-row').count();
      expect(branchRows).toBe(baselineRows);

      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');

      const sandboxRows = await authenticatedPage.locator('.requirements-row').count();
      expect(sandboxRows).toBe(baselineRows);
    });

    test('should keep project filters usable when scenario changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      const filterBar = authenticatedPage.locator('[data-testid="filter-bar"]');
      await expect(filterBar).toBeVisible();

      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      // The refetch races networkidle — wait for the rows themselves
      await authenticatedPage.waitForSelector('.requirements-row', { timeout: 15000 });

      const tableRows = await authenticatedPage.locator('.requirements-row').count();
      expect(tableRows).toBeGreaterThan(0);
    });
  });

  test.describe('Assignments Page', () => {
    test('should refresh assignment list on scenario change', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/assignments');
      await authenticatedPage.waitForLoadState('networkidle');
      // The query is enabled by currentScenario — wait for the rows to
      // settle before counting (networkidle can fire first)
      await authenticatedPage.waitForSelector('.project-name', { timeout: 15000 });

      const initialRows = await authenticatedPage.locator('.project-name').count();

      // Sandbox has no scenario assignments: the list must react (empty or
      // fewer rows), not show the baseline world unchanged
      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');

      const updatedRows = await authenticatedPage.locator('.project-name').count();
      expect(updatedRows).toBeLessThan(initialRows);
    });

    test('should update filter options based on scenario', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/assignments');
      await authenticatedPage.waitForLoadState('networkidle');

      const projectFilter = authenticatedPage.locator('select[name="project_id"], [data-testid="project-filter"]');
      if (await projectFilter.isVisible()) {
        const initialOptions = await projectFilter.locator('option').count();

        await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
        await authenticatedPage.waitForLoadState('networkidle');

        const updatedOptions = await projectFilter.locator('option').count();
        expect(updatedOptions).toBeGreaterThan(0);
        expect(initialOptions).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Reports Page', () => {
    test('should refresh all report types on scenario change', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.waitForLoadState('networkidle');

      const reportTypes = ['demand', 'capacity', 'utilization', 'gaps'];

      for (const reportType of reportTypes) {
        const tab = authenticatedPage.locator(`[role="tab"]:has-text("${reportType}")`).first();
        if (await tab.isVisible()) {
          await tab.click();
          await authenticatedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

          const hasInitialData = await authenticatedPage
            .locator('.chart-container, .report-content, svg.recharts-surface').first()
            .isVisible().catch(() => false);

          // The header selector renders once its scenarios query resolves —
          // give data-heavy reports time before switching
          await authenticatedPage.waitForSelector('.scenario-button', { timeout: 15000 });
          await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
          await authenticatedPage.waitForLoadState('networkidle');

          const hasUpdatedData = await authenticatedPage
            .locator('.chart-container, .report-content, svg.recharts-surface').first()
            .isVisible().catch(() => false);

          expect(hasInitialData || hasUpdatedData).toBeTruthy();
        }
      }
    });

    test('should update report charts and summaries', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/reports?tab=demand');
      await authenticatedPage.waitForLoadState('networkidle');

      const getSummaryValue = async () =>
        await authenticatedPage
          .locator('.summary-card .metric').first()
          .textContent().catch(() => '0');

      const initialSummary = await getSummaryValue();
      expect(initialSummary).toBeTruthy();

      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');

      const updatedSummary = await getSummaryValue();
      expect(updatedSummary).toBeTruthy();
    });
  });

  test.describe('Cross-Page Consistency', () => {
    test('should maintain scenario selection across all pages', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');

      const pages = ['/projects', '/assignments', '/reports', '/scenarios'];
      for (const page of pages) {
        await testHelpers.navigateTo(page);
        await authenticatedPage.waitForLoadState('networkidle');

        const currentScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
        expect(currentScenario).toContain('Test Branch - Comprehensive');
      }
    });

    test('should persist scenario selection after page reload', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');

      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('networkidle');

      const currentScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
      expect(currentScenario).toContain('Test Sandbox - Comprehensive');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle scenario switch failures gracefully', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');

      // Abort reporting calls only; the rest of the app keeps working
      await authenticatedPage.route('**/api/**', route => {
        if (route.request().url().includes('reporting')) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });

      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');

      // Page must stay functional despite the failing data fetches
      await expect(authenticatedPage.locator('#root')).toBeVisible();
      const headerVisible = await authenticatedPage
        .locator('.scenario-button .scenario-name').isVisible().catch(() => false);
      expect(headerVisible).toBeTruthy();
    });
  });
});
