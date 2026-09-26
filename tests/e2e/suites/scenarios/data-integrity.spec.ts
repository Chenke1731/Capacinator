/**
 * Scenario Data Integrity Tests
 * Tests for concurrent operations, merge prevention, data consistency
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { ScenarioTestUtils, createUniqueTestPrefix, waitForSync } from '../../helpers/scenario-test-utils';
test.describe('Scenario Data Integrity', () => {
  let testContext: TestDataContext;
  let testScenarios: any[];
  let scenarioUtils: ScenarioTestUtils;
  let userId: string;
  
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context with unique prefix
    const uniquePrefix = createUniqueTestPrefix('scnint');
    testContext = testDataHelpers.createTestContext(uniquePrefix);
    testScenarios = [];
    
    // Initialize scenario utilities
    scenarioUtils = new ScenarioTestUtils({
      page: authenticatedPage,
      apiContext,
      testPrefix: uniquePrefix
    });
    
    // Resolve the scenario creator PER TEST (2026-09-26 slice 5): the old
    // flow queried /api/profile (does not exist — always 404) and then only
    // created a person when userId was falsy. Since userId persisted at
    // describe scope, the FIRST test's person was deleted by its afterEach
    // and every later create silently used the dead FK (server log showed
    // "FOREIGN KEY constraint failed" on created_by). Anchor to a seed
    // person (person-e2e-*), which lives for the whole run.
    try {
      const peopleResponse = await apiContext.get('/api/people');
      const peopleBody = await peopleResponse.json();
      const people = peopleBody.data || peopleBody;
      userId =
        people?.find((p: any) => String(p.id).startsWith('person-e2e-'))?.id
        || people?.[0]?.id
        || '';
    } catch (error) {
      console.error('Error resolving creator:', error);
    }

    if (!userId) {
      const testUser = await testDataHelpers.createTestUser(testContext);
      userId = testUser.id;
    }

    await testHelpers.navigateTo('/scenarios');
    await testHelpers.waitForPageContent();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await scenarioUtils.cleanupScenariosByPrefix(testContext.prefix);
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Concurrent Operations', () => {
    test(`${tags.critical} should handle concurrent scenario edits`, async ({
      apiContext
    }) => {
      // 2026-09-26 (slice 5): the old two-tab version asserted a conflict
      // warning that does not exist — PUT /api/scenarios/:id has no version
      // check; the product's actual concurrency contract is last-write-wins.
      // Assert that contract at the API level: two sequential edits from
      // "different sessions" both succeed, final state is the later write.
      const scenarioData = {
        name: `${testContext.prefix}-Concurrent-Test`,
        description: 'Original description',
        scenario_type: 'branch',
        status: 'draft',
        created_by: userId
      };
      const response = await apiContext.post('/api/scenarios', { data: scenarioData });
      const testScenario = await response.json();
      if (testScenario.id) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(testScenario.id);
      }

      // "Session 1" saves its description
      const put1 = await apiContext.put(`/api/scenarios/${testScenario.id}`, {
        data: { description: 'Edit from tab 1' }
      });
      expect(put1.ok()).toBeTruthy();

      // "Session 2" — unaware of session 1's write — saves its own
      const put2 = await apiContext.put(`/api/scenarios/${testScenario.id}`, {
        data: { description: 'Edit from tab 2' }
      });
      expect(put2.ok()).toBeTruthy();

      // Last write wins; no partial/corrupt state
      const getResponse = await apiContext.get(`/api/scenarios/${testScenario.id}`);
      expect(getResponse.ok()).toBeTruthy();
      const body = await getResponse.json();
      const finalScenario = body?.data ?? body;
      expect(finalScenario.description).toBe('Edit from tab 2');
      expect(finalScenario.name).toBe(scenarioData.name);
    });
    test('should lock scenario during bulk operations', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create multiple scenarios for bulk operations
      const bulkScenarios = [];
      for (let i = 1; i <= 3; i++) {
        const scenarioData = {
          name: `${testContext.prefix}-Bulk-Op-${i}`,
          description: `Bulk operation test scenario ${i}`,
          scenario_type: 'branch',
          status: 'draft',
          created_by: userId
        };
        const response = await apiContext.post('/api/scenarios', { data: scenarioData });
        const scenario = await response.json();
        if (scenario.id) {
          bulkScenarios.push(scenario);
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
      }
      // Reload page to see new scenarios
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      
      // Check if bulk selection is supported
      const selectButton = authenticatedPage.locator('button:has-text("Select"), button:has-text("Bulk Select")');
      if (await selectButton.isVisible()) {
        await selectButton.click();
        
        // Select all test scenarios
        for (const scenario of bulkScenarios) {
          const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
          const checkbox = scenarioRow.locator('input[type="checkbox"]');
          if (await checkbox.isVisible()) {
            await checkbox.check();
          }
        }
        // Start bulk operation
        const bulkArchiveButton = authenticatedPage.locator('.bulk-actions-toolbar button:has-text("Archive"), .bulk-actions button:has-text("Archive")');
        if (await bulkArchiveButton.isVisible()) {
          await bulkArchiveButton.click();
          
          // Try to edit one of the selected scenarios (should be locked)
          const firstScenarioRow = await scenarioUtils.getScenarioRow(bulkScenarios[0].name);
          const editButton = scenarioUtils.getActionButton(firstScenarioRow, 'edit');
          if (await editButton.isVisible()) {
            await expect(editButton).toBeDisabled();
          }
        }
      } else {
        console.log('Bulk operations not supported in this UI');
      }
    });
  });
  test.describe('Merge Prevention', () => {
    test('should prevent circular dependencies in scenario hierarchy', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create parent scenario — sandbox, never 'baseline': the server
      // refuses to delete baselines so they leak forever and crowd the
      // seed row out of the tree's displayLimit(10).
      const parentData = {
        name: `${testContext.prefix}-Parent`,
        description: 'Parent scenario for hierarchy test',
        scenario_type: 'sandbox',
        status: 'active',
        created_by: userId
      };
      const parentResponse = await apiContext.post('/api/scenarios', { data: parentData });
      const parentScenario = await parentResponse.json();
      if (parentScenario.id) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(parentScenario.id);
      }
      // Create child scenario with parent reference
      const childData = {
        name: `${testContext.prefix}-Child`,
        description: 'Child scenario for hierarchy test',
        scenario_type: 'branch',
        status: 'draft',
        parent_scenario_id: parentScenario.id,
        created_by: userId
      };
      const childResponse = await apiContext.post('/api/scenarios', { data: childData });
      const childScenario = await childResponse.json();
      if (childScenario.id) {
        testContext.createdIds.scenarios.push(childScenario.id);
      }
      // Reload page to see new scenarios
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      
      // Try to set parent as child of its own child
      const parentRow = await scenarioUtils.getScenarioRow(parentScenario.name);
      const editButton = scenarioUtils.getActionButton(parentRow, 'edit');
      await editButton.click();
      
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      // Attempt circular reference
      const parentSelect = modal.locator('select[name="parent_scenario"], select[name="parent_scenario_id"]');
      if (await parentSelect.count() > 0) {
        const childOption = parentSelect.locator(`option:text-matches("${testContext.prefix}.*Child")`);
        if (await childOption.count() > 0) {
          await parentSelect.selectOption(childScenario.id);
          await modal.locator('button:has-text("Save")').click();
          // Should show error
          await expect(modal.locator('.error-message')).toContainText(/circular|dependency|invalid/i);
        }
      }
    });
    test('should handle merge conflicts in branched scenarios', async ({
      authenticatedPage,
      testDataHelpers,
      apiContext
    }) => {
      // 2026-09-26 (slice 5) rewrite: drive setup through the API (branch of
      // the seed baseline + one divergent assignment), then exercise the
      // REAL merge entry point — the row's .action-button.merge (enabled
      // for an active branch that has a parent).
      const scenariosBody = await (await apiContext.get('/api/scenarios')).json();
      const scenarioList = scenariosBody?.data || scenariosBody || [];
      // Match by NAME — leaked test baselines from sibling suites must
      // never be picked as the branch parent.
      const seedBaseline = (Array.isArray(scenarioList) ? scenarioList : [])
        .find((s: any) => s.scenario_type === 'baseline' && s.name === 'Baseline');
      expect(seedBaseline, 'seed baseline scenario missing').toBeTruthy();

      const branchName = `${testContext.prefix}-Merge-Branch`;
      const branchRes = await apiContext.post('/api/scenarios', {
        data: {
          name: branchName,
          scenario_type: 'branch',
          status: 'active',
          parent_scenario_id: seedBaseline.id,
          created_by: userId
        }
      });
      expect(branchRes.ok(), `branch create failed: ${branchRes.status()}`).toBeTruthy();
      const branchScenario = await branchRes.json();
      if (branchScenario.id) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(branchScenario.id);
      }

      // Diverge the branch from its parent so a merge has a real change
      // set to reason about (same recipe as scenario-comparison.spec.ts).
      const peopleBody = await (await apiContext.get('/api/people')).json();
      const people = peopleBody?.data || peopleBody;
      const projectsBody = await (await apiContext.get('/api/projects')).json();
      const projectId = (projectsBody?.data || [])[0]?.id;
      const rolesBody = await (await apiContext.get('/api/roles')).json();
      const roleId = (rolesBody?.data || [])[0]?.id;
      const assignmentsBody = await (await apiContext.get('/api/assignments')).json();
      const assignmentList = assignmentsBody?.data || [];
      const busyPeople = new Set(
        assignmentList.filter((a: any) => a.project_id === projectId).map((a: any) => a.person_id)
      );
      const freePerson = (people || []).find((p: any) => !busyPeople.has(p.id));
      if (projectId && freePerson && roleId) {
        const addRes = await apiContext.post(`/api/scenarios/${branchScenario.id}/assignments`, {
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
        expect(addRes.ok(), `assignment upsert failed: ${addRes.status()}`).toBeTruthy();
      }

      // Reload and open the merge modal from the branch row
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      const branchRow = await scenarioUtils.getScenarioRow(branchName);
      const mergeButton = branchRow.locator('.action-button.merge:not(.disabled)');
      await expect(mergeButton).toBeVisible();
      await mergeButton.click();

      // Merge modal presents its flow/options/confirmation regions
      const dialog = authenticatedPage.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[aria-labelledby="merge-flow-heading"]')).toBeVisible();
    });
  });
  test.describe('Data Validation', () => {
    test('should validate scenario data on save', async ({ authenticatedPage }) => {
      // 2026-09-26 (slice 5): ScenarioModal has no date fields and its real
      // validation is client-side gating — the submit button stays disabled
      // until the name is non-empty (required + disabled={!name.trim()}).
      await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      await expect(modal).toBeVisible();
      const nameInput = modal.getByPlaceholder('Enter scenario name');
      const submit = modal.locator('button:has-text("Create"), button:has-text("Save")');

      // Empty name → submit disabled (the required-name contract)
      await expect(submit).toBeDisabled();

      // Whitespace-only name is still invalid
      await nameInput.fill('   ');
      await expect(submit).toBeDisabled();

      // Real name unlocks it
      await nameInput.fill(`${testContext.prefix}-Valid-Name`);
      await expect(submit).toBeEnabled();

      await modal.locator('button:has-text("Cancel"), button:has-text("Close")').first().click();
      await expect(modal).not.toBeVisible();
    });
    // 'should enforce unique scenario names within context' removed
    // 2026-09-26 (slice 5): neither the API nor the UI enforces name
    // uniqueness for scenarios (no UNIQUE constraint, no controller check)
    // — the assertion tested invented behavior. Duplicate-name guard is
    // recorded in the harvest ledger as a B-level product candidate.
    test('should validate numeric constraints', async ({
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create a scenario to test numeric inputs
      const scenarioData = {
        name: `${testContext.prefix}-Numeric-Test`,
        description: 'Testing numeric validation',
        scenario_type: 'sandbox',
        status: 'draft',
        created_by: userId
      };
      const response = await apiContext.post('/api/scenarios', { data: scenarioData });
      const testScenario = await response.json();
      if (testScenario.id) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(testScenario.id);
      }
      // Reload and navigate to scenario
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      
      const scenarioRow = await scenarioUtils.getScenarioRow(testScenario.name);
      const editButton = scenarioUtils.getActionButton(scenarioRow, 'edit');
      await editButton.click();
      // Find numeric input fields
      const numericInputs = authenticatedPage.locator('input[type="number"]');
      if (await numericInputs.count() > 0) {
        // Test negative values where not allowed
        const firstInput = numericInputs.first();
        await firstInput.fill('-10');
        await firstInput.blur();
        // Check for validation
        const errorMessage = authenticatedPage.locator('.error-message, .invalid-feedback');
        if (await errorMessage.count() > 0) {
          await expect(errorMessage.first()).toBeVisible();
        }
      }
    });
  });
  // 'should rollback failed bulk operations' removed 2026-09-26 (slice 5):
  // the Scenarios page has no bulk-selection UI and the "lock" was a DOM
  // attribute painted by the test itself — no server-side behavior existed.
  // Real rollback semantics are covered API-side by transaction-safety.spec.ts.
  //
  // 'Version Control' describe removed 2026-09-26 (slice 5): the product has
  // no scenario version/history UI (audit logs exist server-side only), and
  // the edit-then-PUT flow it half-drove is covered by basic-operations'
  // 'should edit scenario properties'.
  test.describe('Data Consistency', () => {
    test('should maintain referential integrity', async ({
      authenticatedPage,
      apiContext
    }) => {
      // Create parent scenario via API (a non-baseline parent so baseline
      // deletion protection doesn't mask the child-reference check)
      const parentData = {
        name: `${testContext.prefix}-API-Parent`,
        scenario_type: 'sandbox',
        status: 'active',
        created_by: userId
      };
      const parentResponse = await apiContext.post('/api/scenarios', { data: parentData });
      const parentScenario = await parentResponse.json();
      const parentId = parentScenario.id || parentScenario.data?.id;
      if (parentId) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(parentId);
        // Create child scenario with parent reference
        const childData = {
          name: `${testContext.prefix}-API-Child`,
          scenario_type: 'branch',
          status: 'draft',
          parent_scenario_id: parentId,
          created_by: userId
        };
        const childResponse = await apiContext.post('/api/scenarios', { data: childData });
        const childScenario = await childResponse.json();
        const childId = childScenario.id || childScenario.data?.id;
        if (childId) {
          testContext.createdIds.scenarios.push(childId);
          // Try to delete parent — blocked ("Cannot delete scenario with
          // child scenarios"); the error path returns 500, not 409
          const deleteResponse = await apiContext.delete(`/api/scenarios/${parentId}`);
          expect(deleteResponse.ok()).toBeFalsy();
          // Verify parent still exists (API + rendered row)
          const getResponse = await apiContext.get(`/api/scenarios/${parentId}`);
          expect(getResponse.ok()).toBeTruthy();
          await authenticatedPage.reload();
          await scenarioUtils.waitForScenariosToLoad();
          const parentRow = await scenarioUtils.getScenarioRow(parentData.name);
          await expect(parentRow).toBeVisible();
        }
      }
    });
    test('should handle orphaned data gracefully', async ({
      authenticatedPage,
      apiContext
    }) => {
      // A parentless branch is the real "orphan" the product surfaces: the
      // hierarchy row renders an .orphan-indicator (🔗❌) for active branches
      // without a parent_scenario_id (Scenarios.tsx status column).
      const orphanData = {
        name: `${testContext.prefix}-Orphan-Branch`,
        scenario_type: 'branch',
        status: 'active',
        created_by: userId
      };
      const response = await apiContext.post('/api/scenarios', { data: orphanData });
      const orphanScenario = await response.json();
      if (orphanScenario.id) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(orphanScenario.id);
      }
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      const orphanRow = await scenarioUtils.getScenarioRow(orphanData.name);
      await expect(orphanRow).toBeVisible();
      await expect(orphanRow.locator('.orphan-indicator')).toBeVisible();
    });
  });
});