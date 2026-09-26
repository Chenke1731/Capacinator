/**
 * Scenario Data Isolation (modernized 2026-09-26, L4 harvest slice 5)
 *
 * The old version drove the (long-gone) modal flows through raw page
 * selectors and invented scenario ids from URLs. The product's isolation
 * contract is actually crisp and API-shaped:
 *
 * - Assignments live per scenario: scenario rows are read via
 *   GET /api/assignments with the X-Scenario-Id header, and written via
 *   POST /api/scenarios/:id/assignments (upsert into that scenario only).
 * - Reports aggregate within the scenario boundary:
 *   GET /api/reporting/demand honors the same header.
 * - A branch starts as a copy of its parent at branch time and then
 *   diverges independently.
 *
 * Setup is API-driven; one UI check (header switcher) rides on top.
 */
import { test, expect } from '../../fixtures';
import type { APIRequestContext } from '@playwright/test';

test.describe('Scenario Data Isolation', () => {
  let createdScenarioIds: string[] = [];
  let creatorId = '';
  let seedBaselineId = '';

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

    const scenariosBody = await (await apiContext.get('/api/scenarios')).json();
    const scenarioList = scenariosBody?.data || scenariosBody || [];
    // Match by NAME, not just type: sibling suites' leaked test baselines
    // also carry type 'baseline' but have zero scenario rows — branching
    // from one would copy an empty world.
    seedBaselineId = (Array.isArray(scenarioList) ? scenarioList : [])
      .find((s: any) => s.scenario_type === 'baseline' && s.name === 'Baseline')?.id || '';
    expect(seedBaselineId, 'seed baseline scenario missing').toBeTruthy();
  });

  test.afterEach(async ({ apiContext }) => {
    for (const id of createdScenarioIds) {
      await apiContext.delete(`/api/scenarios/${id}`).catch(() => {});
    }
  });

  const branchFromBaseline = async (apiContext: APIRequestContext, name: string) => {
    const res = await apiContext.post('/api/scenarios', {
      data: {
        name,
        scenario_type: 'branch',
        status: 'active',
        parent_scenario_id: seedBaselineId,
        created_by: creatorId
      }
    });
    expect(res.ok(), `branch create failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    const scenario = body?.data ?? body;
    expect(scenario?.id).toBeTruthy();
    createdScenarioIds.push(scenario.id);
    return scenario;
  };

  const assignmentsFor = async (apiContext: APIRequestContext, scenarioId: string) => {
    const res = await apiContext.get('/api/assignments', {
      headers: { 'X-Scenario-Id': scenarioId }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    return body?.data || body || [];
  };

  // A (project, person, role) triple that is free in the seed data, so the
  // upsert is a genuine ADD for the branch (recipe from scenario-comparison).
  const findFreeTriple = async (apiContext: APIRequestContext) => {
    const peopleBody = await (await apiContext.get('/api/people')).json();
    const people = peopleBody?.data || peopleBody;
    const projectsBody = await (await apiContext.get('/api/projects')).json();
    const projectId = (projectsBody?.data || [])[0]?.id;
    const rolesBody = await (await apiContext.get('/api/roles')).json();
    const roleId = (rolesBody?.data || [])[0]?.id;
    const baseAssignments = await assignmentsFor(apiContext, seedBaselineId);
    const busy = new Set(
      baseAssignments.filter((a: any) => a.project_id === projectId).map((a: any) => a.person_id)
    );
    const freePerson = (people || []).find((p: any) => !busy.has(p.id));
    return { projectId, roleId, personId: freePerson?.id };
  };

  const upsertAssignment = async (
    apiContext: APIRequestContext,
    scenarioId: string,
    triple: { projectId: string; roleId: string; personId: string },
    allocation = 25
  ) => {
    const res = await apiContext.post(`/api/scenarios/${scenarioId}/assignments`, {
      data: {
        project_id: triple.projectId,
        person_id: triple.personId,
        role_id: triple.roleId,
        allocation_percentage: allocation,
        assignment_date_mode: 'fixed',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        change_type: 'added'
      }
    });
    expect(res.ok(), `assignment upsert failed: ${res.status()}`).toBeTruthy();
    const body = await res.json();
    const assignment = body?.data ?? body;
    expect(assignment?.id).toBeTruthy();
    return assignment;
  };

  test('should isolate assignments between scenarios', async ({ apiContext }) => {
    const stamp = Date.now();
    const branch1 = await branchFromBaseline(apiContext, `Iso-A-${stamp}`);
    const branch2 = await branchFromBaseline(apiContext, `Iso-B-${stamp}`);

    const before1 = await assignmentsFor(apiContext, branch1.id);
    const before2 = await assignmentsFor(apiContext, branch2.id);
    expect(before1.length).toBe(before2.length); // same branch point → same copy

    // Add one assignment that exists ONLY in branch 1
    const triple = await findFreeTriple(apiContext);
    test.skip(!triple.projectId || !triple.personId || !triple.roleId,
      'no free person/project/role combination in seed data');
    await upsertAssignment(apiContext, branch1.id, triple);

    const after1 = await assignmentsFor(apiContext, branch1.id);
    const after2 = await assignmentsFor(apiContext, branch2.id);
    expect(after1.length).toBe(before1.length + 1);
    expect(after2.length).toBe(before2.length); // branch 2 untouched
  });

  test('should show only scenario-specific data in reports', async ({ apiContext }) => {
    const stamp = Date.now();
    const branch1 = await branchFromBaseline(apiContext, `Iso-Report-${stamp}`);
    const branch2 = await branchFromBaseline(apiContext, `Iso-Report2-${stamp}`);

    const demandFor = async (scenarioId: string) => {
      const res = await apiContext.get('/api/reporting/demand', {
        headers: { 'X-Scenario-Id': scenarioId }
      });
      expect(res.ok()).toBeTruthy();
      return await res.json();
    };

    const before = await demandFor(branch2.id);
    const triple = await findFreeTriple(apiContext);
    test.skip(!triple.projectId || !triple.personId || !triple.roleId,
      'no free person/project/role combination in seed data');
    await upsertAssignment(apiContext, branch1.id, triple, 50);

    // The report for branch 1 accounts for the extra assignment; branch 2's
    // report is unchanged (isolation in the aggregation path). Payload
    // shape: { success, data: { demandData: [{ demand_hours, … }] } }.
    const after1 = await demandFor(branch1.id);
    const after2 = await demandFor(branch2.id);
    const total = (d: any) =>
      (d?.data?.demandData || []).reduce(
        (sum: number, row: any) => sum + (Number(row.demand_hours) || 0),
        0
      );
    expect(total(after1)).toBeGreaterThan(total(after2));
    expect(total(after2)).toBe(total(before));
  });

  test('should maintain separate assignment data per scenario', async ({ apiContext }) => {
    const stamp = Date.now();
    const branch1 = await branchFromBaseline(apiContext, `Iso-W-${stamp}`);
    const branch2 = await branchFromBaseline(apiContext, `Iso-W2-${stamp}`);

    const before = await assignmentsFor(apiContext, branch1.id);
    const triple = await findFreeTriple(apiContext);
    test.skip(!triple.projectId || !triple.personId || !triple.roleId,
      'no free person/project/role combination in seed data');
    const assignment = await upsertAssignment(apiContext, branch1.id, triple);

    // The scenario row is addressable and deletable in its own scenario only
    const del = await apiContext.delete(
      `/api/scenarios/${branch1.id}/assignments/${assignment.id}`
    );
    expect(del.ok(), `assignment delete failed: ${del.status()}`).toBeTruthy();

    const after = await assignmentsFor(apiContext, branch1.id);
    expect(after.length).toBe(before.length);
    const branch2Rows = await assignmentsFor(apiContext, branch2.id);
    expect(branch2Rows.length).toBe(before.length);
  });

  test('should prevent cross-scenario data leakage', async ({ apiContext }) => {
    const stamp = Date.now();
    const branch1 = await branchFromBaseline(apiContext, `Iso-Leak-${stamp}`);

    // Baseline view before the write
    const baselineBefore = await assignmentsFor(apiContext, seedBaselineId);

    const triple = await findFreeTriple(apiContext);
    test.skip(!triple.projectId || !triple.personId || !triple.roleId,
      'no free person/project/role combination in seed data');
    await upsertAssignment(apiContext, branch1.id, triple);

    // The branch-only assignment must not leak into the baseline view
    const baselineAfter = await assignmentsFor(apiContext, seedBaselineId);
    expect(baselineAfter.length).toBe(baselineBefore.length);
    const leaked = baselineAfter.filter(
      (a: any) => a.person_id === triple.personId && a.project_id === triple.projectId
    );
    expect(leaked.length).toBe(0);
  });

  test('should aggregate data within scenario boundaries in the UI', async ({
    authenticatedPage,
    apiContext
  }) => {
    // One UI-level confirmation: switching the header selector re-scopes the
    // demand report to the selected scenario.
    const stamp = Date.now();
    const name = `Iso-UI-${stamp}`;
    await branchFromBaseline(apiContext, name);

    await authenticatedPage.goto('/');
    const selector = authenticatedPage.locator('.scenario-selector');
    await expect(selector).toBeVisible();
    await selector.locator('.scenario-button').click();
    const option = authenticatedPage.locator('.scenario-dropdown .scenario-option', { hasText: name });
    await expect(option).toBeVisible();
    await option.click();
    await expect(selector.locator('.scenario-name')).toContainText(name);

    await authenticatedPage.goto('/reports?tab=demand');
    const banner = authenticatedPage.locator('.report-content > div').first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Current Scenario:');
    await expect(banner).toContainText(name);
  });
});
