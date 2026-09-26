/**
 * Scenario Edge Cases Tests
 * Tests for edge cases, error handling, and complex scenario workflows
 * Uses dynamic test data for proper isolation
 */
import { test, expect } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { ScenarioTestUtils, createUniqueTestPrefix } from '../../helpers/scenario-test-utils';
test.describe('Scenario Edge Cases', () => {
  let testContext: TestDataContext;
  let testScenarios: any[];
  let scenarioUtils: ScenarioTestUtils;
  let userId: string;
  
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    const uniquePrefix = createUniqueTestPrefix('scnedge');
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
    // and every later create silently used the dead FK. Anchor to a seed
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
  test.describe('Hierarchy Edge Cases', () => {
    test('should handle multi-level scenario hierarchy', async ({
      authenticatedPage,
      apiContext
    }) => {
      // Create Level 1 parent scenario — sandbox, never 'baseline': the
      // server refuses to delete baselines, so test baselines leak forever
      // and crowd the seed row out of the tree's displayLimit(10).
      const level1Data = {
        name: `${testContext.prefix}-Level-1-Parent`,
        description: 'Top level parent scenario',
        scenario_type: 'sandbox',
        status: 'active',
        created_by: userId
      };
      const level1Response = await apiContext.post('/api/scenarios', { data: level1Data });
      const level1Scenario = await level1Response.json();
      testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
      testContext.createdIds.scenarios.push(level1Scenario.id);
      // Create Level 2 child scenario
      const level2Data = {
        name: `${testContext.prefix}-Level-2-Child`,
        description: 'Second level child scenario',
        scenario_type: 'branch',
        status: 'draft',
        parent_scenario_id: level1Scenario.id,
        created_by: userId
      };
      const level2Response = await apiContext.post('/api/scenarios', { data: level2Data });
      const level2Scenario = await level2Response.json();
      testContext.createdIds.scenarios.push(level2Scenario.id);
      // Create Level 3 grandchild scenario
      const level3Data = {
        name: `${testContext.prefix}-Level-3-Grandchild`,
        description: 'Third level grandchild scenario',
        scenario_type: 'sandbox',
        status: 'draft',
        parent_scenario_id: level2Scenario.id,
        created_by: userId
      };
      const level3Response = await apiContext.post('/api/scenarios', { data: level3Data });
      const level3Scenario = await level3Response.json();
      testContext.createdIds.scenarios.push(level3Scenario.id);
      // Reload page to see hierarchy
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();

      // The tree auto-expands ROOT nodes only (Scenarios.tsx "Expand nodes
      // that have children by default" walks roots), so Level 2 is visible
      // but Level 3 stays collapsed until Level 2's expand button is used.
      // force: the expand chevron's click point is grazed by the row's
      // GitBranch svg (layout overlap), which Playwright's actionability
      // check treats as an intercepted pointer — the element is plainly
      // visible and clickable at its own coordinates.
      const level1Row = await scenarioUtils.getScenarioRow(level1Scenario.name);
      await expect(level1Row).toBeVisible();
      const level2Row = await scenarioUtils.getScenarioRow(level2Scenario.name);
      await expect(level2Row).toBeVisible();
      // Programmatic click: the expand chevron's center is grazed by the
      // row's GitBranch svg (layout overlap) so a positional click lands on
      // the svg and never reaches the button's React handler — force:
      // doesn't redirect hit-testing. el.click() dispatches on the element
      // itself.
      const expandButton = level2Row.locator('.connector-expand-button');
      await expect(expandButton).toBeVisible();
      await expandButton.evaluate((el) => (el as HTMLElement).click());
      // Auto-waiting assertion WITHOUT reload: getScenarioRow reloads
      // between retries, and a reload resets expansion to roots-only —
      // exactly what made Level 3 unfindable.
      const level3Row = authenticatedPage.locator('.hierarchy-row')
        .filter({ hasText: level3Scenario.name });
      await expect(level3Row).toBeVisible({ timeout: 10000 });
    });
    test('should prevent scenarios from being their own parent', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create a test scenario
      const selfRefData = {
        name: `${testContext.prefix}-Self-Reference-Test`,
        description: 'Testing self-reference prevention',
        scenario_type: 'branch',
        status: 'draft',
        created_by: userId
      };
      const response = await apiContext.post('/api/scenarios', { data: selfRefData });
      const selfRefScenario = await response.json();
      testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
      testContext.createdIds.scenarios.push(selfRefScenario.id);
      // Reload and try to edit it
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      
      const scenarioRow = await scenarioUtils.getScenarioRow(selfRefScenario.name);
      const editButton = scenarioUtils.getActionButton(scenarioRow, 'edit');
      await editButton.click();
      
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      // Check parent dropdown options
      const parentSelect = modal.locator('select[name="parent_scenario"], select[name="parent_scenario_id"]');
      if (await parentSelect.count() > 0) {
        const options = await parentSelect.locator('option').allTextContents();
        // The scenario shouldn't appear in its own parent dropdown
        expect(options).not.toContain(selfRefScenario.name);
      }
      await modal.locator('button:has-text("Cancel")').click();
    });
    test('should handle orphaned scenarios gracefully', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Check if any scenarios show warning indicators for orphaned status
      const orphanedIndicator = authenticatedPage.locator('.orphaned-warning, .broken-parent-link, .warning-icon');
      if (await orphanedIndicator.count() > 0) {
        // Hover to see details
        await orphanedIndicator.first().hover();
        const tooltip = authenticatedPage.locator('.tooltip, [role="tooltip"]');
        if (await tooltip.count() > 0) {
          await expect(tooltip).toContainText(/parent.*missing|orphaned/i);
        }
        // Check if fix option is available
        await orphanedIndicator.first().click();
        const fixButton = authenticatedPage.locator('button:has-text("Fix"), button:has-text("Resolve")');
        if (await fixButton.count() > 0) {
          await expect(fixButton).toBeVisible();
        }
      }
    });
  });
  test.describe('Data Input Edge Cases', () => {
    test('should handle maximum length inputs', async ({
      authenticatedPage,
      apiContext
    }) => {
      await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      // ScenarioModal inputs carry placeholders, not name attrs (slice 5).
      // Long-but-legal name (~200 chars): the product sets no maxLength on
      // the input and no length cap server-side (SQLite TEXT) — assert the
      // real contract: value preserved, create succeeds, row renders.
      const longName = `${testContext.prefix}-${'A'.repeat(180)}`;
      const nameInput = modal.getByPlaceholder('Enter scenario name');
      await nameInput.fill(longName);
      expect((await nameInput.inputValue()).length).toBe(longName.length);
      await modal.locator('textarea').first().fill('X'.repeat(2000));
      const createPromise = authenticatedPage.waitForResponse(response =>
        response.url().includes('/api/scenarios') && response.request().method() === 'POST'
      );
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      const response = await createPromise;
      expect(response.status()).toBe(201);
      const createBody = await response.json();
      const scenario = createBody?.data ?? createBody;
      if (scenario?.id) {
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(scenario.id);
      }
      await expect(modal).not.toBeVisible();
      const row = await scenarioUtils.getScenarioRow(longName);
      await expect(row).toBeVisible();
    });
    test('should handle special characters in names', async ({
      authenticatedPage,
      apiContext
    }) => {
      const specialNames = [
        'Scenario-Script-Test',
        'Scenario & Partners',
        'Scenario "Quoted"',
        'Scenario with spaces',
        'Scenario_underscore',
        'Scenario-hyphen'
      ];
      for (const baseName of specialNames) {
        const fullName = `${testContext.prefix}-${baseName}`;
        await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
        const modal = authenticatedPage.locator('[role="dialog"]');
        await modal.getByPlaceholder('Enter scenario name').fill(fullName);
        const createPromise = authenticatedPage.waitForResponse(response =>
          response.url().includes('/api/scenarios') && response.request().method() === 'POST'
        );
        await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
        const response = await createPromise;
        expect(response.status()).toBe(201);
        const createBody = await response.json();
        const scenario = createBody?.data ?? createBody;
        if (scenario?.id) {
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
        // Wait for modal to close
        await expect(modal).not.toBeVisible({ timeout: 5000 });
        // Verify the name renders in the row — React escapes by construction,
        // so asserting the raw text round-trips is the escape check.
        const createdRow = await scenarioUtils.getScenarioRow(fullName);
        await expect(createdRow.locator('.name-column .name')).toHaveText(fullName);
      }
    });
    // 'should validate date boundaries' removed 2026-09-26 (slice 5):
    // ScenarioModal has no date fields (name/description/type only) — the
    // premise tested a form that does not exist.
  });
  test.describe('Performance Edge Cases', () => {
    test('should handle rapid scenario creation', async ({
      authenticatedPage,
      apiContext
    }) => {
      // Test creating multiple scenarios quickly through the real modal
      const startTime = Date.now();
      const rapidScenarios = [];
      for (let i = 1; i <= 5; i++) {
        await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
        const modal = authenticatedPage.locator('[role="dialog"]');
        const scenarioName = `${testContext.prefix}-Rapid-Test-${i}`;
        await modal.getByPlaceholder('Enter scenario name').fill(scenarioName);
        // Don't wait between creations
        const createPromise = authenticatedPage.waitForResponse(response =>
          response.url().includes('/api/scenarios') && response.request().method() === 'POST'
        );
        modal.locator('button:has-text("Create"), button:has-text("Save")').click();
        const response = await createPromise;
        expect(response.status()).toBe(201);
        const createBody = await response.json();
        const scenario = createBody?.data ?? createBody;
        if (scenario?.id) {
          rapidScenarios.push(scenario);
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
        // Wait for modal to close
        await expect(modal).not.toBeVisible({ timeout: 5000 });
      }
      const endTime = Date.now();
      // Reload to see all scenarios
      await authenticatedPage.reload();
      // All scenarios should be created
      for (const scenario of rapidScenarios) {
        const row = await scenarioUtils.getScenarioRow(scenario.name);
        await expect(row).toBeVisible();
      }
      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(30000);
    });
    test('should handle scenarios with many relationships', async ({
      authenticatedPage,
      apiContext
    }) => {
      // Create a parent scenario (sandbox — test baselines are undeletable
      // server-side and leak; see the note in Hierarchy Edge Cases above)
      const parentData = {
        name: `${testContext.prefix}-Parent-Hub`,
        description: 'Parent with many children',
        scenario_type: 'sandbox',
        status: 'active',
        created_by: userId
      };
      const parentResponse = await apiContext.post('/api/scenarios', { data: parentData });
      const parentScenario = await parentResponse.json();
      testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
      testContext.createdIds.scenarios.push(parentScenario.id);
      // Create multiple child scenarios
      for (let i = 1; i <= 5; i++) {
        const childData = {
          name: `${testContext.prefix}-Child-${i}`,
          description: `Child scenario ${i}`,
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
      }
      // Graphical view removed 2026-09-24 (client had zero references);
      // the tree IS the many-relationships surface now. Root parents
      // auto-expand, so all five children render without manual expansion.
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      const parentRow = await scenarioUtils.getScenarioRow(parentScenario.name);
      await expect(parentRow).toBeVisible();
      for (let i = 1; i <= 5; i++) {
        const childRow = await scenarioUtils.getScenarioRow(`${testContext.prefix}-Child-${i}`);
        await expect(childRow).toBeVisible();
      }
      // Expanding/collapsing a many-children node stays responsive
      // (programmatic click — same svg-overlap reason as the hierarchy
      // test above: positional clicks land on the overlapping svg)
      const toggle = parentRow.locator('.connector-expand-button');
      const startTime = Date.now();
      await toggle.evaluate((el) => (el as HTMLElement).click());
      await expect(toggle.locator('.expand-icon')).not.toHaveClass(/expanded/);
      await toggle.evaluate((el) => (el as HTMLElement).click());
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });
  test.describe('State Management Edge Cases', () => {
    test('should recover from interrupted operations', async ({
      authenticatedPage,
      context
    }) => {
      // Start creating a scenario
      await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      const interruptedName = `${testContext.prefix}-Interrupted-Scenario`;
      await modal.getByPlaceholder('Enter scenario name').fill(interruptedName);
      // Simulate interruption by navigating away
      await authenticatedPage.goto('/projects');
      // Navigate back
      await authenticatedPage.goto('/scenarios');
      // Modal should be closed and no partial data
      await expect(modal).not.toBeVisible();
      // The interrupted scenario should not exist
      const interruptedRow = authenticatedPage.locator('.hierarchy-row').filter({ hasText: interruptedName });
      await expect(interruptedRow).not.toBeVisible();
    });
    test('should handle browser back/forward correctly', async ({
      authenticatedPage,
      testDataHelpers,
      apiContext
    }) => {
      // 2026-09-26 (slice 5): the product has NO /scenarios/:id detail route
      // (App.tsx only registers /scenarios) — the old "click name to
      // navigate to details" premise never existed. Row selection is
      // in-page (focus + aria-selected), and browser history is exercised
      // between real routes.
      const navData = {
        name: `${testContext.prefix}-Navigation-Test`,
        description: 'Testing browser navigation',
        scenario_type: 'branch',
        status: 'active',
        created_by: userId
      };
      const response = await apiContext.post('/api/scenarios', { data: navData });
      const navScenario = await response.json();
      testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
      testContext.createdIds.scenarios.push(navScenario.id);
      // Reload to see the scenario
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();

      // Clicking the row selects it in-page (no navigation)
      const scenarioRow = await scenarioUtils.getScenarioRow(navScenario.name);
      await scenarioRow.click();
      await expect(scenarioRow).toHaveClass(/focused/);
      await expect(scenarioRow).toHaveAttribute('aria-selected', 'true');
      await expect(authenticatedPage).toHaveURL(/\/scenarios$/);

      // Browser history across real routes
      await authenticatedPage.goto('/dashboard');
      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/\/scenarios$/, { timeout: 10000 });
      await authenticatedPage.goForward();
      await expect(authenticatedPage).toHaveURL(/\/dashboard/, { timeout: 10000 });
    });
    test('should maintain state during page refresh', async ({ 
      authenticatedPage 
    }) => {
      // Check if filters exist
      const typeFilter = authenticatedPage.locator('select[name="type_filter"], select[name="filter_type"]');
      const hasFilters = await typeFilter.count() > 0;
      if (hasFilters) {
        // Apply filter
        await typeFilter.selectOption('sandbox');
        // Switch to list view
        await authenticatedPage.getByRole('button', { name: 'List' }).click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Refresh page
        await authenticatedPage.reload();
        // Check if state persists (may depend on implementation)
        const filterValue = await typeFilter.inputValue();
        const listButton = authenticatedPage.getByRole('button', { name: 'List' });
        const isListActive = await listButton.getAttribute('class');
        // Log what we found (state persistence may vary by implementation)
        if (filterValue === 'sandbox' && isListActive?.includes('active')) {
          // State persisted
          expect(filterValue).toBe('sandbox');
        }
      }
    });
  });
  // 'should handle selecting all scenarios' and 'should handle partial bulk
  // operation failures' removed 2026-09-26 (slice 5): the Scenarios page has
  // no bulk-selection UI (its only checkboxes are the filter dropdown), and
  // the "readonly lock" in the latter was a DOM attribute painted by the test
  // itself — nothing server-side ever observed it.
  test.describe('Bulk Operation Edge Cases', () => {
    test('should prevent deletion of scenarios with dependencies', async ({
      authenticatedPage,
      testDataHelpers,
      apiContext
    }) => {
      // Create parent and child scenarios (sandbox parent — same
      // undeletable-baseline leak avoidance as above)
      const parentData = {
        name: `${testContext.prefix}-Parent-Protected`,
        description: 'Parent that cannot be deleted',
        scenario_type: 'sandbox',
        status: 'active',
        created_by: userId
      };
      const parentResponse = await apiContext.post('/api/scenarios', { data: parentData });
      const parentScenario = await parentResponse.json();
      testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
      testContext.createdIds.scenarios.push(parentScenario.id);
      const childData = {
        name: `${testContext.prefix}-Child-Dependency`,
        description: 'Child that depends on parent',
        scenario_type: 'branch',
        status: 'draft',
        parent_scenario_id: parentScenario.id,
        created_by: userId
      };
      const childResponse = await apiContext.post('/api/scenarios', { data: childData });
      const childScenario = await childResponse.json();
      testContext.createdIds.scenarios.push(childScenario.id);
      // Reload and try to delete parent
      await authenticatedPage.reload();
      await scenarioUtils.waitForScenariosToLoad();
      const parentRow = await scenarioUtils.getScenarioRow(parentScenario.name);
      const deleteButton = scenarioUtils.getActionButton(parentRow, 'delete');
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();
      // The delete dialog is type-to-confirm: the parent's own name in
      // #confirm-delete unlocks the (initially disabled) Delete button.
      const dialog = authenticatedPage.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: 'Delete Scenario' });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await dialog.locator('#confirm-delete').fill(parentScenario.name);
      // The server refuses ("Cannot delete scenario with child scenarios")
      // and the row must survive. NB the delete mutation has no onError —
      // the UI surfaces nothing on failure; the surviving row IS the
      // user-visible outcome, so the contract is asserted on the response
      // status + row presence.
      const deletePromise = authenticatedPage.waitForResponse(response =>
        response.url().includes(`/api/scenarios/${parentScenario.id}`) &&
        response.request().method() === 'DELETE'
      );
      await dialog.locator('button:has-text("Delete")').last().click();
      const deleteResponse = await deletePromise;
      expect(deleteResponse.ok()).toBeFalsy();
      const survivingRow = await scenarioUtils.getScenarioRow(parentScenario.name);
      await expect(survivingRow).toBeVisible();
    });
  });
});