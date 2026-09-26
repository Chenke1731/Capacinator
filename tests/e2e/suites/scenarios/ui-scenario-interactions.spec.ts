/**
 * Scenario UI Interactions (modernized 2026-09-26, L4 harvest slice 5)
 *
 * Product contract this suite drives:
 * - The header scenario switcher (AppHeader) renders ONLY when at least one
 *   non-baseline scenario exists — with just the seed Baseline it is hidden
 *   by design (a read-only "Baseline" dropdown is noise).
 * - Trigger: button.scenario-button inside .scenario-selector; current name
 *   in span.scenario-name. Dropdown: .scenario-dropdown (NOT -menu) with
 *   button.scenario-option / .scenario-option-name entries.
 * - Selection persists via localStorage keys 'currentScenario' (full JSON)
 *   and 'capacinator-current-scenario' (id).
 * - Demand report shows a scenario-context banner (first child of
 * .report-content) whose background differs for baseline vs non-baseline.
 * - Assignments page tags scenario-typed rows with .scenario-badge.
 *
 * Data setup is API-driven (modal flow is covered by basic-operations).
 */
import { test, expect } from '../../fixtures';
import type { APIRequestContext } from '@playwright/test';

test.describe('Scenario UI Interactions', () => {
  let createdScenarioIds: string[] = [];
  let creatorId = '';

  test.beforeEach(async ({ apiContext }) => {
    createdScenarioIds = [];
    // Anchor the creator to a seed person (person-e2e-*), which lives for
    // the whole run — never a per-test person that afterEach deletes.
    const peopleBody = await (await apiContext.get('/api/people')).json();
    const people = peopleBody.data || peopleBody;
    creatorId =
      people?.find((p: any) => String(p.id).startsWith('person-e2e-'))?.id
      || people?.[0]?.id
      || '';
  });

  test.afterEach(async ({ apiContext }) => {
    for (const id of createdScenarioIds) {
      await apiContext.delete(`/api/scenarios/${id}`).catch(() => {});
    }
  });

  const createScenario = async (
    apiContext: APIRequestContext,
    name: string,
    scenario_type: 'branch' | 'sandbox' = 'sandbox'
  ) => {
    const res = await apiContext.post('/api/scenarios', {
      data: { name, scenario_type, status: 'active', created_by: creatorId }
    });
    expect(res.ok(), `scenario create failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    const scenario = body?.data ?? body;
    expect(scenario?.id, 'created scenario missing id').toBeTruthy();
    createdScenarioIds.push(scenario.id);
    return scenario;
  };

  // The seed baseline row is NAMED 'Baseline'; sibling suites' leaked test
  // baselines (scnedge-*/scnint-* parents) also carry scenario_type
  // 'baseline' but zero scenario rows — never pick those as a branch parent.
  const seedBaselineFrom = (list: any[]) =>
    (Array.isArray(list) ? list : []).find(
      (s: any) => s.scenario_type === 'baseline' && s.name === 'Baseline'
    );

  const switchToScenario = async (page: any, scenarioName: string) => {
    await page.locator('.scenario-selector .scenario-button').click();
    const option = page.locator('.scenario-dropdown .scenario-option', {
      hasText: scenarioName
    });
    await expect(option).toBeVisible();
    await option.click();
    // The trigger now carries the selected name
    await expect(page.locator('.scenario-selector .scenario-name')).toContainText(scenarioName);
  };

  test('should display scenario dropdown in header', async ({ authenticatedPage, apiContext }) => {
    const name = `UI Header Test ${Date.now()}`;
    await createScenario(apiContext, name);

    // Selector appears once a non-baseline scenario exists
    await authenticatedPage.goto('/');
    const selector = authenticatedPage.locator('.scenario-selector');
    await expect(selector).toBeVisible();

    // Open the dropdown
    await selector.locator('.scenario-button').click();
    const dropdown = authenticatedPage.locator('.scenario-dropdown');
    await expect(dropdown).toBeVisible();

    // Baseline and the new scenario are both listed (exact name match —
    // substring 'Baseline' also hits baseline-typed options whose type
    // badge renders the word)
    await expect(dropdown.locator('.scenario-option-name', { hasText: /^Baseline$/ })).toBeVisible();
    await expect(dropdown.locator('.scenario-option-name', { hasText: new RegExp(`^${name}$`) })).toBeVisible();
  });

  test('should switch scenarios from header dropdown', async ({ authenticatedPage, apiContext }) => {
    const name = `UI Switch Test ${Date.now()}`;
    await createScenario(apiContext, name);

    await authenticatedPage.goto('/');
    await switchToScenario(authenticatedPage, name);

    // localStorage 'currentScenario' carries the full selected scenario
    const stored = await authenticatedPage.evaluate(() => localStorage.getItem('currentScenario'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.name).toBe(name);
    expect(parsed.id).toBeTruthy();
  });

  test('should show scenario badges in assignments table', async ({ authenticatedPage, apiContext }) => {
    // A branch of the seed baseline inherits its assignments; viewing the
    // branch renders those rows as scenario-typed, tagged .scenario-badge.
    const scenariosBody = await (await apiContext.get('/api/scenarios')).json();
    const seedBaseline = seedBaselineFrom(scenariosBody?.data || scenariosBody);
    expect(seedBaseline, 'seed baseline missing').toBeTruthy();

    const name = `UI Badge Branch ${Date.now()}`;
    const res = await apiContext.post('/api/scenarios', {
      data: {
        name,
        scenario_type: 'branch',
        status: 'active',
        parent_scenario_id: seedBaseline.id,
        created_by: creatorId
      }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const branch = body?.data ?? body;
    createdScenarioIds.push(branch.id);

    await authenticatedPage.goto('/');
    await switchToScenario(authenticatedPage, name);

    await authenticatedPage.goto('/assignments');
    const badge = authenticatedPage.locator('.scenario-badge').first();
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText(name);
    // Inline style carries the badge colors
    const style = await badge.getAttribute('style');
    expect(style).toContain('background');
    expect(style).toContain('color');
  });

  test('should display scenario context in demand report', async ({ authenticatedPage, apiContext }) => {
    const name = `UI Report Context ${Date.now()}`;
    const description = 'Testing report context display';
    const scenario = await createScenario(apiContext, name);
    // Give it a description so the banner's description line renders
    await apiContext.put(`/api/scenarios/${scenario.id}`, { data: { description } });

    await authenticatedPage.goto('/');
    await switchToScenario(authenticatedPage, name);

    await authenticatedPage.goto('/reports?tab=demand');
    // The scenario-context banner is the first child of .report-content
    const banner = authenticatedPage.locator('.report-content > div').first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Current Scenario:');
    await expect(banner).toContainText(name);
    await expect(banner).toContainText(description);
  });

  test('should style baseline vs branch scenarios differently', async ({ authenticatedPage, apiContext }) => {
    const name = `UI Style Branch ${Date.now()}`;
    const scenariosBody = await (await apiContext.get('/api/scenarios')).json();
    const seedBaseline = seedBaselineFrom(scenariosBody?.data || scenariosBody);
    expect(seedBaseline, 'seed baseline missing').toBeTruthy();
    const res = await apiContext.post('/api/scenarios', {
      data: {
        name,
        scenario_type: 'branch',
        status: 'active',
        parent_scenario_id: seedBaseline.id,
        created_by: creatorId
      }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    createdScenarioIds.push((body?.data ?? body).id);

    // Baseline banner
    await authenticatedPage.goto('/reports?tab=demand');
    const banner = authenticatedPage.locator('.report-content > div').first();
    await expect(banner).toBeVisible();
    const baselineBg = await banner.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Branch banner
    await authenticatedPage.goto('/');
    await switchToScenario(authenticatedPage, name);
    await authenticatedPage.goto('/reports?tab=demand');
    await expect(banner).toBeVisible();
    const branchBg = await banner.evaluate((el) => getComputedStyle(el).backgroundColor);

    // var(--bg-secondary) vs var(--primary-light) resolve to different colors
    expect(baselineBg).not.toBe(branchBg);
  });

  test('should persist scenario selection on page reload', async ({ authenticatedPage, apiContext }) => {
    const name = `UI Persist Test ${Date.now()}`;
    await createScenario(apiContext, name);

    await authenticatedPage.goto('/');
    await switchToScenario(authenticatedPage, name);

    // Reload — selection survives via localStorage
    await authenticatedPage.reload();
    const selector = authenticatedPage.locator('.scenario-selector');
    await expect(selector).toBeVisible();
    await expect(selector.locator('.scenario-name')).toContainText(name);

    const stored = await authenticatedPage.evaluate(() => localStorage.getItem('currentScenario'));
    const parsed = JSON.parse(stored!);
    expect(parsed.name).toBe(name);
  });

  test('should update assignment date mode badges correctly', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/assignments');

    // Date mode badges show one of the known modes where present
    const modeBadges = authenticatedPage.locator('.assignment-mode-badge');
    const badgeCount = await modeBadges.count();

    if (badgeCount > 0) {
      const badgeTexts = await modeBadges.allTextContents();
      for (const text of badgeTexts) {
        expect(['Fixed', 'Project', 'Phase']).toContain(text);
      }
    }
  });

  test('should handle scenario dropdown with many scenarios', async ({ authenticatedPage, apiContext }) => {
    // Create multiple scenarios to exercise dropdown population/scroll
    const scenarioNames: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const name = `UI Many Test ${Date.now()}-${i}`;
      await createScenario(apiContext, name);
      scenarioNames.push(name);
    }

    await authenticatedPage.goto('/');
    await authenticatedPage.locator('.scenario-selector .scenario-button').click();
    const dropdown = authenticatedPage.locator('.scenario-dropdown');
    await expect(dropdown).toBeVisible();

    for (const name of scenarioNames) {
      await expect(dropdown.locator('.scenario-option', { hasText: name })).toBeVisible();
    }

    // If the menu overflows, it must be scrollable
    const menuHeight = await dropdown.evaluate((el) => el.scrollHeight);
    const visibleHeight = await dropdown.evaluate((el) => el.clientHeight);
    if (menuHeight > visibleHeight) {
      const overflow = await dropdown.evaluate((el) => window.getComputedStyle(el).overflowY);
      expect(['scroll', 'auto']).toContain(overflow);
    }
  });
});
