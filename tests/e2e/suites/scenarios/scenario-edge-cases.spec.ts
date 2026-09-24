/**
 * Scenario Edge Cases and Error Handling (modernized 2026-09-24, D13)
 * Auth via fixtures; scenario creation via ScenarioTestUtils (API).
 * Assignments page anchor is h1 "Assignments" (.assignments-page only
 * exists in CSS, never in JSX).
 */
import { test, expect } from '../../fixtures';
import { ScenarioTestUtils, createUniqueTestPrefix } from '../../helpers/scenario-test-utils';

const ASSIGNMENTS_H1 = 'h1:has-text("Assignments")';

test.describe('Scenario Edge Cases and Error Handling', () => {
  let utils: ScenarioTestUtils;
  const createdIds: string[] = [];
  let prefix = '';

  test.beforeEach(async ({ authenticatedPage, apiContext }) => {
    prefix = createUniqueTestPrefix('edge');
    utils = new ScenarioTestUtils({ page: authenticatedPage, apiContext, testPrefix: prefix });
  });

  test.afterEach(async ({ apiContext }) => {
    for (const id of createdIds) {
      await apiContext.delete(`/api/scenarios/${id}`).catch(() => {});
    }
    createdIds.length = 0;
    await utils.cleanupScenariosByPrefix(prefix).catch(() => {});
  });

  const createBranch = async (apiContext: import('@playwright/test').APIRequestContext, name: string, extra: Record<string, unknown> = {}) => {
    const people = await (await apiContext.get('/api/people')).json();
    const created_by = people?.data?.[0]?.id;
    const scenario = await utils.createScenario({
      name,
      scenario_type: 'branch',
      status: 'active',
      created_by,
      ...extra
    });
    createdIds.push(scenario.id);
    return scenario;
  };

  test('should handle invalid scenario ID in localStorage gracefully', async ({ authenticatedPage }) => {
    await authenticatedPage.evaluate(() => {
      localStorage.setItem('currentScenario', JSON.stringify({
        id: 'invalid-uuid-format',
        name: 'Invalid Scenario',
        scenario_type: 'branch'
      }));
    });

    // Pages must still render (context falls back to the baseline world)
    await authenticatedPage.goto('/assignments');
    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();

    await authenticatedPage.goto('/reports?tab=demand');
    await expect(authenticatedPage.locator('[role="tabpanel"]')).toBeVisible();

    await authenticatedPage.goto('/projects');
    await expect(authenticatedPage.locator('[data-testid="requirements-table"]')).toBeVisible();
  });

  test('should handle corrupted scenario context in localStorage', async ({ authenticatedPage }) => {
    await authenticatedPage.evaluate(() => {
      localStorage.setItem('currentScenario', '{invalid json{{{');
    });

    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');

    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();
  });

  test('should handle deleted scenario gracefully', async ({ authenticatedPage, apiContext }) => {
    const scenario = await createBranch(apiContext, 'To Be Deleted');

    // Select it, then delete it behind the UI's back
    await authenticatedPage.goto('/assignments');
    await utils.switchToScenario('To Be Deleted');
    await apiContext.delete(`/api/scenarios/${scenario.id}`);
    createdIds.length = 0; // already deleted

    // Pages must fall back gracefully to the surviving world
    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();

    // With the only non-baseline scenario gone the header selector hides
    // itself again — absence, or a chip without the deleted name, both pass
    const selectorGone = !(await authenticatedPage
      .locator('.scenario-button .scenario-name').isVisible().catch(() => false));
    if (!selectorGone) {
      const selected = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
      expect(selected).not.toContain('To Be Deleted');
    }
  });

  test('should handle scenario with no parent gracefully', async ({ authenticatedPage }) => {
    await authenticatedPage.evaluate(() => {
      localStorage.setItem('currentScenario', JSON.stringify({
        id: 'test-orphan-scenario',
        name: 'Orphan Scenario',
        scenario_type: 'branch',
        parent_scenario_id: 'non-existent-parent',
        parent_scenario_name: null
      }));
    });

    await authenticatedPage.goto('/reports?tab=demand');
    await authenticatedPage.waitForLoadState('networkidle');

    // Context line renders without crashing on the missing parent
    const contextText = await authenticatedPage
      .locator('strong:text("Current Scenario:")').locator('..').textContent();
    expect(contextText).toBeTruthy();
  });

  test('should handle API errors when fetching with scenario context', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/api/assignments*', route => {
      if (route.request().headers()['x-scenario-id']) {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Scenario not found' })
        });
      } else {
        route.continue();
      }
    });

    await authenticatedPage.evaluate(() => {
      localStorage.setItem('currentScenario', JSON.stringify({
        id: 'error-test-scenario',
        name: 'Error Test Scenario'
      }));
    });

    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');

    // The page must surface the failure (error banner), not render dead UI
    const errorMessage = authenticatedPage.locator('text=/error|failed|problem/i');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle very long scenario names gracefully', async ({ authenticatedPage, apiContext }) => {
    const longName = 'A'.repeat(200) + ' Very Long Scenario Name That Might Break UI Layout';
    await createBranch(apiContext, longName);

    await authenticatedPage.goto('/assignments');
    await utils.switchToScenario(longName);

    await authenticatedPage.goto('/reports?tab=demand');
    await authenticatedPage.waitForLoadState('networkidle');

    const contextLine = authenticatedPage.locator('strong:text("Current Scenario:")');
    await expect(contextLine).toBeVisible();

    const contextBox = await contextLine.locator('..').boundingBox();
    expect(contextBox?.width).toBeLessThan(1200); // no runaway layout
  });

  test('should handle rapid scenario switching', async ({ authenticatedPage, apiContext }) => {
    const names: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const name = `Rapid Switch ${prefix}-${i}`;
      await createBranch(apiContext, name);
      names.push(name);
    }

    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');

    // Fire switches back-to-back without settling in between
    for (let i = 0; i < 10; i++) {
      await authenticatedPage.click('.scenario-button');
      await authenticatedPage.locator('.scenario-option').filter({ hasText: names[i % names.length] }).first().click();
    }

    await authenticatedPage.waitForLoadState('networkidle');

    // Must stabilize on one of the scenarios with the page intact
    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();
    const selected = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
    expect(names.some(name => selected?.includes(name))).toBeTruthy();
  });

  test('should handle localStorage quota exceeded gracefully', async ({ authenticatedPage, apiContext }) => {
    await createBranch(apiContext, 'Quota Test Scenario');

    await authenticatedPage.evaluate(() => {
      try {
        const bigData = 'x'.repeat(1024 * 1024);
        for (let i = 0; i < 5; i++) {
          localStorage.setItem(`bigData${i}`, bigData);
        }
      } catch {
        // Quota exceeded — this is what we're testing
      }
    });

    await authenticatedPage.goto('/assignments');
    try {
      await utils.switchToScenario('Quota Test Scenario');
    } finally {
      await authenticatedPage.evaluate(() => {
        for (let i = 0; i < 5; i++) {
          localStorage.removeItem(`bigData${i}`);
        }
      });
    }

    await authenticatedPage.goto('/assignments');
    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();
  });

  test('should handle concurrent API requests with different scenarios', async ({ authenticatedPage, apiContext }) => {
    const s1 = await createBranch(apiContext, 'Concurrent Test 1');
    const s2 = await createBranch(apiContext, 'Concurrent Test 2');

    // Two parallel requests carrying different scenario contexts must both
    // succeed (fires from page origin through the same vite proxy the app uses)
    const statuses = await authenticatedPage.evaluate(async ([id1, id2]) => {
      const [r1, r2] = await Promise.all([
        fetch('/api/assignments', { headers: { 'X-Scenario-Id': id1 } }),
        fetch('/api/assignments', { headers: { 'X-Scenario-Id': id2 } })
      ]);
      return [r1.status, r2.status];
    }, [s1.id, s2.id]);

    expect(statuses).toEqual([200, 200]);
  });

  test('should handle baseline scenario edge cases', async ({ authenticatedPage }) => {
    await authenticatedPage.evaluate(() => {
      localStorage.setItem('currentScenario', JSON.stringify({
        id: 'baseline-0000-0000-0000-000000000000',
        name: 'Baseline',
        scenario_type: 'baseline'
      }));
    });

    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();

    await authenticatedPage.goto('/reports?tab=demand');
    await authenticatedPage.waitForLoadState('networkidle');

    // Baseline context must not claim a parent
    const contextText = await authenticatedPage
      .locator('strong:text("Current Scenario:")').locator('..').textContent();
    expect(contextText).not.toContain('Branch from');
  });

  // Merged from scenario-edge-cases-updated.spec.ts (2026-09-24, D13):
  // that file duplicated the first four tests of this suite; only these two
  // were unique, so they live here now and the duplicate was removed.

  test('should maintain scenario context across page refreshes', async ({ authenticatedPage }) => {
    await expect.poll(async () =>
      authenticatedPage.evaluate(() => localStorage.getItem('currentScenario'))
    ).toBeTruthy();
    const initialId = JSON.parse(
      (await authenticatedPage.evaluate(() => localStorage.getItem('currentScenario')))!
    ).id;

    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');

    const after = await authenticatedPage.evaluate(() => localStorage.getItem('currentScenario'));
    expect(after).toBeTruthy();
    expect(JSON.parse(after!).id).toBe(initialId);
  });

  test('should handle empty scenario list gracefully', async ({ authenticatedPage }) => {
    // Mock API to return an empty scenarios list
    await authenticatedPage.route('**/api/scenarios', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([])
      });
    });

    await authenticatedPage.evaluate(() => {
      localStorage.removeItem('currentScenario');
      localStorage.removeItem('capacinator-current-scenario');
    });

    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');

    await expect(authenticatedPage.locator(ASSIGNMENTS_H1)).toBeVisible();
  });
});
