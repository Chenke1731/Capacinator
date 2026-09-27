/**
 * Demand Report - Assignment Based
 * (modernized 2026-09-27, L4 harvest slice 7)
 *
 * The old version crashed on `undefined.id`: it read list envelopes
 * without unwrapping (`(await get('/api/project-types').json())[0]` on a
 * `{data: [...]}` body), posted to a non-existent `/api/scenario-projects`
 * endpoint, and created baseline scenarios the server refuses to delete
 * (leak). Real contracts used instead:
 *
 * - scenario rows are written via POST /api/scenarios/:id/assignments
 *   (same endpoint the scenario suites use); projects join a scenario by
 *   having an assignment there
 * - demand is read via GET /api/reporting/demand with X-Scenario-Id
 *   (shape: { data: { demandData: [{ demand_hours, ... }] } })
 * - list endpoints answer with the { data } envelope — always unwrap
 * - test scenarios are sandbox type (deletable; baseline is seed-only)
 */
import { test, expect, tags } from '../../fixtures';
import type { APIRequestContext } from '@playwright/test';

const unwrap = (body: any): any[] =>
  Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];

test.describe('Demand Report - Assignment Based', () => {
  test(`${tags.critical} should show demand data when using actual assignments (no resource templates)`, async ({
    apiContext,
    authenticatedPage
  }) => {
    const prefix = `demand-asgn-${Date.now()}`;

    // Seed baseline id (exact-name match — leaked test baselines carry zero rows)
    const scenarios = unwrap(await (await apiContext.get('/api/scenarios')).json());
    const baselineId = scenarios.find(
      (s: any) => s.scenario_type === 'baseline' && s.name === 'Baseline'
    )?.id;
    expect(baselineId, 'seed Baseline missing').toBeTruthy();

    // Reference data (enveloped lists). NOTE: /api/project-sub-types
    // answers grouped by project type ({data: [{sub_types: [...]}]}) —
    // flatten and pick one that actually belongs to types[0], otherwise
    // the projects POST fails the sub-type FK
    const types = unwrap(await (await apiContext.get('/api/project-types')).json());
    const subTypesBody = await (await apiContext.get('/api/project-sub-types')).json();
    const subTypesFlat = Array.isArray(subTypesBody?.data)
      ? subTypesBody.data.flatMap((g: any) => g.sub_types || g || [])
      : [];
    const locations = unwrap(await (await apiContext.get('/api/locations')).json());
    const people = unwrap(await (await apiContext.get('/api/people')).json());
    const roles = unwrap(await (await apiContext.get('/api/roles')).json());

    const subType = subTypesFlat.find((st: any) => st.project_type_id === types[0].id);
    expect(subType, 'no sub-type for the first project type').toBeTruthy();

    // Sandbox scenario (deletable) + project + direct assignment.
    // created_by is a required FK — anchor to a seed person
    const creatorId = people.find((p: any) => String(p.id).startsWith('person-e2e-'))?.id || people[0].id;
    const scenarioRes = await apiContext.post('/api/scenarios', {
      data: {
        name: `${prefix}-scenario`,
        scenario_type: 'sandbox',
        status: 'active',
        created_by: creatorId
      }
    });
    expect(scenarioRes.ok()).toBe(true);
    // POST /api/scenarios answers with a bare object (no {data} envelope —
    // the family of shape drift documented in the harvest ledger)
    const scenarioBody = await scenarioRes.json();
    const scenario = scenarioBody.data || scenarioBody;
    expect(scenario?.id, 'scenario create returned no id').toBeTruthy();

    const projectRes = await apiContext.post('/api/projects', {
      data: {
        name: `${prefix}-project`,
        project_type_id: types[0].id,
        project_sub_type_id: subType.id,
        location_id: locations[0].id,
        priority: 1,
        include_in_demand: true,
        aspiration_start: new Date().toISOString().split('T')[0],
        aspiration_finish: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
      }
    });
    expect(projectRes.ok()).toBe(true);
    const project = (await projectRes.json()).data;

    // Fail fast with a clear message if the people or roles lists come
    // back empty (transient windows while parallel suites clean up) — an
    // undefined .id here used to die as an opaque TypeError
    expect(people.length, 'people list empty — seed population missing').toBeGreaterThan(0);
    expect(roles.length, 'roles list empty — seed population missing').toBeGreaterThan(0);
    const person = people.find((p: any) => String(p.id).startsWith('person-e2e-')) || people[0];
    const role = roles[0];
    const asgnRes = await apiContext.post(`/api/scenarios/${scenario.id}/assignments`, {
      data: {
        project_id: project.id,
        person_id: person.id,
        role_id: role.id,
        allocation_percentage: 100,
        assignment_date_mode: 'fixed',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
      }
    });
    expect(asgnRes.ok()).toBe(true);

    try {
      // API level: the scenario's demand report reflects the assignment
      const demandRes = await apiContext.get('/api/reporting/demand', {
        headers: { 'X-Scenario-Id': scenario.id }
      });
      expect(demandRes.ok()).toBe(true);
      const demandBody = (await demandRes.json()).data || {};
      const demandRows = demandBody.demandData || [];
      const row = demandRows.find((d: any) => d.project_name === project.name);
      expect(row, `demand row for ${project.name} missing`).toBeTruthy();
      expect(Number(row.demand_hours)).toBeGreaterThan(0);

      // UI level: /reports renders the CURRENT scenario's demand — switch
      // the header scenario to the sandbox first, then the project surfaces.
      // The header switcher is the button labelled with the current
      // scenario name (snapshot-verified anchor, banner area)
      await authenticatedPage.goto('/reports', { waitUntil: 'domcontentloaded' });
      await authenticatedPage.waitForLoadState('networkidle').catch(() => {});
      const scenarioSwitcher = authenticatedPage
        .locator('header button', { hasText: 'Baseline' })
        .first();
      if (await scenarioSwitcher.isVisible().catch(() => false)) {
        await scenarioSwitcher.click();
        // The menu is plain divs: .scenario-dropdown > .scenario-option
        const option = authenticatedPage
          .locator('.scenario-option', { hasText: scenario.name })
          .first();
        await option.waitFor({ state: 'visible', timeout: 10000 });
        await option.click();
      }
      await expect(
        authenticatedPage.getByText(project.name).first()
      ).toBeVisible({ timeout: 20000 });
    } finally {
      await apiContext.delete(`/api/scenarios/${scenario.id}`).catch(() => {});
      await apiContext.delete(`/api/projects/${project.id}`).catch(() => {});
    }
  });

  test(`${tags.critical} should show seed demand on the baseline scenario`, async ({
    apiContext
  }) => {
    // The seed world (3 projects with materialized allocations on Baseline)
    // must produce a non-empty demand report — a regression here is the
    // "demand board shows 0 rows" failure mode seen before the e2e seed
    // got project_type_id fixed.
    const scenarios = unwrap(await (await apiContext.get('/api/scenarios')).json());
    const baselineId = scenarios.find(
      (s: any) => s.scenario_type === 'baseline' && s.name === 'Baseline'
    )?.id;
    expect(baselineId, 'seed Baseline missing').toBeTruthy();

    const demandRes = await apiContext.get('/api/reporting/demand', {
      headers: { 'X-Scenario-Id': baselineId }
    });
    expect(demandRes.ok()).toBe(true);

    const demandBody = (await demandRes.json()).data || {};
    const demandRows = demandBody.demandData || [];
    expect(demandRows.length).toBeGreaterThan(0);
    for (const row of demandRows) {
      expect(Number(row.demand_hours)).toBeGreaterThanOrEqual(0);
    }
  });
});
