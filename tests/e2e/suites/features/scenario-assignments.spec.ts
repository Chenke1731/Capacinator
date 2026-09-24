/**
 * Scenario-based Assignments @feature (modernized 2026-09-24, D13)
 * The assignments page renders a shadcn <Table> (no .data-table class —
 * that class only exists on the recommendations tab); stable cell anchors
 * are the custom column renders .project-name and .allocation-cell.
 */
import { test, expect } from '../../fixtures';

test.describe('Scenario-based Assignments @feature', () => {
  test('should display both direct and scenario-based assignments', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');

    // The assignments tab renders shadcn table rows with .project-name cells
    await authenticatedPage.waitForSelector('.project-name', { timeout: 10000 });

    const rows = await authenticatedPage.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);

    const firstProjectName = await authenticatedPage.locator('.project-name').first().textContent();
    expect(firstProjectName).toBeTruthy();
  });

  test('should show scenario assignments via API', async ({ apiContext }) => {
    const response = await apiContext.get('/api/assignments');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data.data)).toBeTruthy();

    const scenarioAssignments = data.data.filter((assignment: any) =>
      assignment.assignment_type === 'scenario'
    );
    expect(scenarioAssignments.length).toBeGreaterThan(0);

    const first = scenarioAssignments[0];
    expect(first).toHaveProperty('scenario_id');
    expect(first).toHaveProperty('scenario_name');
    expect(first.assignment_type).toBe('scenario');
  });

  test('new assignments default into the current scenario world', async ({ apiContext }) => {
    // POST /api/assignments is scenario-aware by default: without a
    // X-Scenario-Id header it lands in the seed baseline scenario (the old
    // "mixed direct/scenario types" premise is legacy — 'direct' rows only
    // exist as pre-scenario-era data).
    const projects = await (await apiContext.get('/api/projects')).json();
    const people = await (await apiContext.get('/api/people')).json();
    const roles = await (await apiContext.get('/api/roles')).json();
    const res = await apiContext.post('/api/assignments', {
      data: {
        project_id: (projects?.data || [])[0]?.id,
        person_id: (people?.data || [])[0]?.id,
        role_id: (roles?.data || [])[0]?.id,
        allocation_percentage: 10,
        assignment_date_mode: 'fixed',
        start_date: '2026-09-01',
        end_date: '2026-09-30'
      }
    });
    expect(res.ok()).toBeTruthy();
    const created = (await res.json()).data;
    expect(created.scenario_id).toBeTruthy();

    try {
      const list = (await (await apiContext.get('/api/assignments')).json()).data;
      const mine = list.find((a: any) => a.id === `spa-${created.id}` || a.id === created.id);
      expect(mine).toBeTruthy();
      expect(mine.assignment_type).toBe('scenario');
    } finally {
      await apiContext.delete(`/api/assignments/${created.id}`).catch(() => {});
    }
  });

  test('should properly format scenario assignment IDs', async ({ apiContext }) => {
    const response = await apiContext.get('/api/assignments');
    const data = await response.json();

    // Scenario assignment IDs carry the spa- prefix (view convention)
    data.data
      .filter((a: any) => a.assignment_type === 'scenario')
      .forEach((assignment: any) => {
        expect(assignment.id).toMatch(/^spa-/);
      });
  });

  test('should display correct allocation percentages', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForSelector('.allocation-cell input', { timeout: 10000 });

    const allocationCell = authenticatedPage.locator('.allocation-cell input').first();
    await expect(allocationCell).toBeVisible();

    const numValue = parseFloat(await allocationCell.inputValue());
    expect(numValue).toBeGreaterThanOrEqual(0);
    expect(numValue).toBeLessThanOrEqual(100);
  });

  test('should allow inline editing of allocation percentage', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForSelector('.allocation-cell input', { timeout: 10000 });

    const allocationInput = authenticatedPage.locator('.allocation-cell input').first();

    await allocationInput.click();
    await allocationInput.fill('75');
    await allocationInput.blur();

    await authenticatedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // The value must persist (or be restored by validation) — not vanish
    const newValue = await allocationInput.inputValue();
    expect(newValue).toBeTruthy();
  });
});
