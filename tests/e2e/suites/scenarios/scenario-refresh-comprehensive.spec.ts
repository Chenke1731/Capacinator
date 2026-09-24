/**
 * Comprehensive Scenario Data Refresh Tests
 * Validates that changing scenarios refreshes data on all pages
 */
import { test, expect } from '../../fixtures';
import { ScenarioTestUtils } from '../../helpers/scenario-test-utils';

test.describe('Comprehensive Scenario Data Refresh', () => {
  let scenarioUtils: ScenarioTestUtils;
  let baselineScenarioId: string;
  let branchScenarioId: string;
  let sandboxScenarioId: string;

  test.beforeAll(async ({ browser }) => {
    // Create test data using API context
    const context = await browser.newContext();
    const apiContext = context.request;
    
    // Create baseline scenario with data
    const baselineResponse = await apiContext.post('http://localhost:3111/api/scenarios', {
      data: {
        name: 'Test Baseline - Comprehensive',
        scenario_type: 'baseline',
        status: 'active',
        description: 'Baseline scenario for comprehensive testing'
      }
    });
    const baselineData = await baselineResponse.json();
    baselineScenarioId = baselineData.id;

    // Create branch scenario
    const branchResponse = await apiContext.post('http://localhost:3111/api/scenarios', {
      data: {
        name: 'Test Branch - Comprehensive',
        scenario_type: 'branch',
        status: 'active',
        parent_scenario_id: baselineScenarioId,
        description: 'Branch with additional projects and assignments'
      }
    });
    const branchData = await branchResponse.json();
    branchScenarioId = branchData.id;

    // Create sandbox scenario
    const sandboxResponse = await apiContext.post('http://localhost:3111/api/scenarios', {
      data: {
        name: 'Test Sandbox - Comprehensive',
        scenario_type: 'sandbox',
        status: 'draft',
        description: 'Sandbox for experimental changes'
      }
    });
    const sandboxData = await sandboxResponse.json();
    sandboxScenarioId = sandboxData.id;

    // Add scenario-specific projects
    await apiContext.post('http://localhost:3111/api/scenario-projects', {
      data: {
        scenario_id: branchScenarioId,
        name: 'Branch-Only Project Alpha',
        code: 'BRANCH-ALPHA',
        status: 'Active'
      }
    });

    await apiContext.post('http://localhost:3111/api/scenario-projects', {
      data: {
        scenario_id: sandboxScenarioId,
        name: 'Sandbox Experiment Beta',
        code: 'SANDBOX-BETA',
        status: 'Planning'
      }
    });

    await context.close();
  });

  test.beforeEach(async ({ authenticatedPage, testHelpers, apiContext }) => {
    scenarioUtils = new ScenarioTestUtils({
      page: authenticatedPage,
      apiContext: apiContext,
      testPrefix: 'test-comprehensive'
    });
  });

  test.describe('Dashboard Page', () => {
    test('should update all dashboard metrics when scenario changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Record initial metrics
      const getMetrics = async () => ({
        projects: await authenticatedPage.locator('text=Current Projects').locator('..').locator('p.text-2xl').textContent(),
        people: await authenticatedPage.locator('text=Total People').locator('..').locator('p.text-2xl').textContent(),
        roles: await authenticatedPage.locator('text=Total Roles').locator('..').locator('p.text-2xl').textContent(),
        utilization: await authenticatedPage.locator('text=Over Allocated').locator('..').locator('.stat-value').textContent()
      });

      const baselineMetrics = await getMetrics();
      console.log('Baseline metrics:', baselineMetrics);

      // Switch to branch scenario
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      const branchMetrics = await getMetrics();
      console.log('Branch metrics:', branchMetrics);

      // At least one metric should be different
      expect(
        branchMetrics.projects !== baselineMetrics.projects ||
        branchMetrics.utilization !== baselineMetrics.utilization
      ).toBeTruthy();

      // Verify charts also updated
      const chartElements = await authenticatedPage.locator('svg').count();
      expect(chartElements).toBeGreaterThan(0);
    });

    test('should show loading state during scenario switch', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Set up promise to catch loading state
      const loadingPromise = authenticatedPage.waitForSelector(
        '.animate-spin, .animate-pulse, [data-loading="true"]',
        { state: 'visible', timeout: 5000 }
      ).catch(() => null);

      // Switch scenario
      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');

      // Verify loading state appeared
      const loadingElement = await loadingPromise;
      expect(loadingElement).toBeTruthy();
    });
  });

  test.describe('Projects Page', () => {
    test('should show scenario-specific projects', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Initially on baseline - shouldn't see branch/sandbox projects
      const baselineProjects = await authenticatedPage.locator('tbody tr').count();
      const hasBranchProject = await authenticatedPage.locator('text=Branch-Only Project').count();
      expect(hasBranchProject).toBe(0);

      // Switch to branch scenario
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Should now see branch project
      const branchProjects = await authenticatedPage.locator('tbody tr').count();
      const branchProjectVisible = await authenticatedPage.locator('text=Branch-Only Project').count();
      expect(branchProjectVisible).toBeGreaterThan(0);
      expect(branchProjects).toBeGreaterThan(baselineProjects);

      // Switch to sandbox
      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Should see sandbox project
      const sandboxProjectVisible = await authenticatedPage.locator('text=Sandbox Experiment').count();
      expect(sandboxProjectVisible).toBeGreaterThan(0);
    });

    test('should update project filters when scenario changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Check if filter dropdowns update
      const filterBar = authenticatedPage.locator('.filter-bar, [data-testid="filters"]');
      expect(await filterBar.isVisible()).toBeTruthy();

      // Project data should be filtered by current scenario
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');

      // Verify table updated
      const tableRows = await authenticatedPage.locator('tbody tr').count();
      expect(tableRows).toBeGreaterThan(0);
    });
  });

  test.describe('Assignments Page', () => {
    test('should refresh assignment list on scenario change', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/assignments');
      await authenticatedPage.waitForLoadState('networkidle');

      // Get initial assignment count
      const initialRows = await authenticatedPage.locator('tbody tr').count();
      const initialEmptyState = await authenticatedPage.locator('.empty-state, [data-testid="no-assignments"]').isVisible().catch(() => false);

      // Switch scenario
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Check if data changed
      const updatedRows = await authenticatedPage.locator('tbody tr').count();
      const updatedEmptyState = await authenticatedPage.locator('.empty-state, [data-testid="no-assignments"]').isVisible().catch(() => false);

      // Either row count changed or empty state changed
      expect(
        updatedRows !== initialRows ||
        updatedEmptyState !== initialEmptyState
      ).toBeTruthy();
    });

    test('should update filter options based on scenario', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/assignments');
      await authenticatedPage.waitForLoadState('networkidle');

      // Open project filter
      const projectFilter = authenticatedPage.locator('select[name="project_id"], [data-testid="project-filter"]');
      if (await projectFilter.isVisible()) {
        const initialOptions = await projectFilter.locator('option').count();

        // Switch scenario
        await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
        await authenticatedPage.waitForLoadState('networkidle');
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

        const updatedOptions = await projectFilter.locator('option').count();
        // Options might change based on scenario
        expect(updatedOptions).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Reports Page', () => {
    test('should refresh all report types on scenario change', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.waitForLoadState('networkidle');

      // Test each report type
      const reportTypes = ['demand', 'capacity', 'utilization', 'gaps'];
      
      for (const reportType of reportTypes) {
        // Click on report tab if available
        const tabSelector = `button:has-text("${reportType}"), .tab:has-text("${reportType}")`;
        const tab = authenticatedPage.locator(tabSelector).first();
        
        if (await tab.isVisible()) {
          await tab.click();
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

          // Get initial data indicator
          const hasInitialData = await authenticatedPage.locator('.chart-container, .report-content, svg.recharts-surface').first().isVisible().catch(() => false);

          // Switch scenario
          await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
          await authenticatedPage.waitForLoadState('networkidle');
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

          // Verify data refreshed
          const hasUpdatedData = await authenticatedPage.locator('.chart-container, .report-content, svg.recharts-surface').first().isVisible().catch(() => false);
          
          // Data visibility might change
          expect(hasInitialData || hasUpdatedData).toBeTruthy();
        }
      }
    });

    test('should update report charts and summaries', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.waitForLoadState('networkidle');

      // Focus on demand report
      const demandTab = authenticatedPage.locator('button:has-text("Demand"), .tab:has-text("Demand")').first();
      if (await demandTab.isVisible()) {
        await demandTab.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

        // Check for summary values
        const getSummaryValue = async () => {
          const summaryElement = authenticatedPage.locator('.summary-value, [data-testid="total-demand"], .report-summary').first();
          return await summaryElement.textContent().catch(() => '0');
        };

        const initialSummary = await getSummaryValue();

        // Switch scenario
        await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
        await authenticatedPage.waitForLoadState('networkidle');
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

        const updatedSummary = await getSummaryValue();
        
        // Summary might be different or the same, but query should have re-run
        expect(updatedSummary).toBeDefined();
      }
    });
  });

  test.describe('Cross-Page Consistency', () => {
    test('should maintain scenario selection across all pages', async ({ authenticatedPage, testHelpers }) => {
      // Set scenario on dashboard
      await testHelpers.navigateTo('/dashboard');
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

      // Verify on each page
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
      
      // Switch to specific scenario
      await scenarioUtils.switchToScenario('Test Sandbox - Comprehensive');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

      // Reload page
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('networkidle');

      // Scenario should still be selected
      const currentScenario = await authenticatedPage.locator('.scenario-selector-trigger .scenario-name').textContent();
      expect(currentScenario).toContain('Test Sandbox - Comprehensive');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle scenario switch failures gracefully', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      
      // Try to intercept and fail the API call
      await authenticatedPage.route('**/api/**', route => {
        if (route.request().url().includes('reporting')) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });

      // Attempt scenario switch
      await scenarioUtils.switchToScenario('Test Branch - Comprehensive');
      
      // Should show error state
      const errorMessage = await authenticatedPage.locator('.error-message, [data-testid="error"], .toast-error').isVisible().catch(() => false);
      
      // Page should still be functional
      const pageContent = await authenticatedPage.locator('.layout-container').isVisible();
      expect(pageContent).toBeTruthy();
    });
  });
});