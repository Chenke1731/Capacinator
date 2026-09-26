/**
 * Scenario Comparison (modernized 2026-09-24, D13)
 * The comparison modal is a Radix dialog on the Scenarios page (list view):
 * open via a row's .action-button.compare, pick the target in
 * #compare-scenario-select, run with "Run Comparison". Results are a flat
 * layout (summary items + difference groups + impact metrics) — no tabs.
 */
import { test, expect, type Page } from '../../fixtures';

test.describe('Scenario Comparison', () => {
  let targetScenarioId = '';
  let targetScenarioName = '';

  // Open compare from the seed baseline row, pick the target, run it.
  // The tree caps at displayLimit(10) newest-first rows — the seed Baseline
  // (oldest row in a busy shared e2e DB) can fall outside that window.
  // Searching first applies a filter, and filtered views bypass the slice
  // (Scenarios.tsx: `!showAllScenarios && !hasActiveFilters`).
  const runComparison = async (page: Page, targetId: string) => {
    const search = page.locator('input[placeholder*="Search"]');
    await search.fill('Baseline');
    const baselineRow = page.locator('.hierarchy-row')
      .filter({ has: page.locator('.name', { hasText: /^Baseline$/ }) })
      .first();
    await baselineRow.locator('.action-button.compare').click();
    await page.waitForSelector('[role="dialog"]');
    await page.selectOption('#compare-scenario-select', targetId);
    await page.click('button:has-text("Run Comparison")');
    await page.waitForSelector('.comparison-results', { timeout: 10000 });
  };

  test.beforeEach(async ({ authenticatedPage, apiContext }) => {
    const people = await (await apiContext.get('/api/people')).json();
    const created_by = people?.data?.[0]?.id;
    if (!created_by) throw new Error('No people available for test setup');

    // Branch of the seed baseline copies all assignments, then we add one
    // extra assignment so the comparison has a real difference (added = 1).
    const scenarios = await (await apiContext.get('/api/scenarios')).json();
    const scenarioList = Array.isArray(scenarios) ? scenarios : scenarios?.data || [];
    const seedBaseline = scenarioList.find((s: any) => s.scenario_type === 'baseline');
    if (!seedBaseline) throw new Error('Seed baseline scenario missing');

    targetScenarioName = `Compare Target ${Date.now()}`;
    const branchRes = await apiContext.post('/api/scenarios', {
      data: {
        name: targetScenarioName,
        scenario_type: 'branch',
        status: 'active',
        parent_scenario_id: seedBaseline.id,
        created_by
      }
    });
    if (!branchRes.ok()) throw new Error(`Branch create failed: ${branchRes.status()}`);
    targetScenarioId = (await branchRes.json()).id;

    // One assignment that exists ONLY in the branch: a person not already
    // assigned to the first project.
    const assignments = await (await apiContext.get('/api/assignments')).json();
    const assignmentList = assignments?.data || [];
    const projects = await (await apiContext.get('/api/projects')).json();
    const projectId = (projects?.data || [])[0]?.id;
    const busyPeople = new Set(
      assignmentList.filter((a: any) => a.project_id === projectId).map((a: any) => a.person_id)
    );
    const freePerson = (people?.data || []).find((p: any) => !busyPeople.has(p.id));
    const roles = await (await apiContext.get('/api/roles')).json();
    // NB: person.primary_person_role_id is a person_roles join id, NOT a
    // roles-table id — using it as assignment role_id FK-violates (500).
    const roleId = roles?.data?.[0]?.id;
    if (!projectId || !freePerson || !roleId) {
      throw new Error('No free person/project/role combination for test setup');
    }

    const addRes = await apiContext.post(`/api/scenarios/${targetScenarioId}/assignments`, {
      data: {
        project_id: projectId,
        person_id: freePerson.id,
        role_id: roleId,
        allocation_percentage: 25,
        assignment_date_mode: 'fixed',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        change_type: 'added'
      }
    });
    if (!addRes.ok()) throw new Error(`Assignment upsert failed: ${addRes.status()}`);

    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForSelector('.hierarchy-row');
  });

  test.afterEach(async ({ apiContext }) => {
    if (targetScenarioId) {
      await apiContext.delete(`/api/scenarios/${targetScenarioId}`).catch(() => {});
      targetScenarioId = '';
    }
  });

  test('should show updated modal title when comparing scenarios', async ({ authenticatedPage }) => {
    await runComparison(authenticatedPage, targetScenarioId);

    // DialogTitle becomes "Comparing: <source> vs <target>". Auto-retrying
    // assertion (not one-shot textContent): the title flips in the same
    // render that mounts .comparison-results, and a one-shot read raced it
    // in the 2026-09-26 full run.
    const title = authenticatedPage.locator('[role="dialog"] h2');
    await expect(title).toContainText('Comparing:');
    await expect(title).toContainText('Baseline');
    await expect(title).toContainText(targetScenarioName);
  });

  test('should show differences between scenarios', async ({ authenticatedPage }) => {
    await runComparison(authenticatedPage, targetScenarioId);

    // Summary: exactly the one assignment added by the branch
    const added = await authenticatedPage
      .locator('.summary-item', { hasText: 'Assignments Added' })
      .locator('.summary-value').textContent();
    expect(added?.trim()).toBe('1');

    // Differences list shows the added group
    await expect(
      authenticatedPage.locator('.difference-group').filter({ hasText: 'Added' }).first()
    ).toBeVisible();

    // Impact metrics render
    await expect(authenticatedPage.locator('.impact-metrics .metric').first()).toBeVisible();
    await expect(authenticatedPage.locator('text=Total Allocation Change:')).toBeVisible();
  });

  test('should handle API errors gracefully', async ({ authenticatedPage }) => {
    // Mock a failing comparison endpoint
    await authenticatedPage.route('**/api/scenarios/*/compare*', (route) =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Failed to compare scenarios' })
      })
    );

    await authenticatedPage.locator('.hierarchy-row').filter({ hasText: 'Baseline' }).first()
      .locator('.action-button.compare').click();
    await authenticatedPage.waitForSelector('[role="dialog"]');
    await authenticatedPage.selectOption('#compare-scenario-select', targetScenarioId);
    await authenticatedPage.click('button:has-text("Run Comparison")');

    // The failure must surface in the dialog, not die in the console
    // (the Alert renders with role="alert"; shadcn's destructive variant
    // carries no literal .alert-destructive class)
    await expect(
      authenticatedPage.locator('[role="dialog"] [role="alert"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should close modal and reset state', async ({ authenticatedPage }) => {
    await authenticatedPage.locator('.hierarchy-row').filter({ hasText: 'Baseline' }).first()
      .locator('.action-button.compare').click();
    await authenticatedPage.waitForSelector('[role="dialog"]');

    await authenticatedPage.keyboard.press('Escape');
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible();

    // Reopen: back to the setup view (state resets on close)
    await authenticatedPage.locator('.hierarchy-row').filter({ hasText: 'Baseline' }).first()
      .locator('.action-button.compare').click();
    await expect(authenticatedPage.locator('[role="dialog"] h2')).toHaveText('Compare Scenarios');
  });

  test('should allow switching to new comparison after results', async ({ authenticatedPage }) => {
    await runComparison(authenticatedPage, targetScenarioId);

    await authenticatedPage.click('button:has-text("New Comparison")');

    // Back to the selection view
    await expect(authenticatedPage.locator('#compare-scenario-select')).toBeVisible();
    await expect(authenticatedPage.locator('[role="dialog"] h2')).toHaveText('Compare Scenarios');
  });
});
