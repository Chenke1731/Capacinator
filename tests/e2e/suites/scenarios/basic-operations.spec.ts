/**
 * Scenario Basic Operations Tests
 * Tests for CRUD operations, view modes, and basic scenario functionality
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { ScenarioTestUtils, createUniqueTestPrefix, waitForSync } from '../../helpers/scenario-test-utils';

// We'll create scenario table helpers dynamically in tests now
test.describe('Scenario Basic Operations', () => {
  let testContext: TestDataContext;
  let testScenarios: any[];
  let scenarioUtils: ScenarioTestUtils;
  let userId = '';
  
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context with unique prefix
    const uniquePrefix = createUniqueTestPrefix('scnbasic');
    testContext = testDataHelpers.createTestContext(uniquePrefix);
    
    // Initialize scenario utilities
    scenarioUtils = new ScenarioTestUtils({
      page: authenticatedPage,
      apiContext,
      testPrefix: uniquePrefix
    });
    
    // Ensure we're on the scenarios page before starting
    await testHelpers.navigateTo('/scenarios');
    await testHelpers.waitForPageContent();
    
    // Resolve the scenario creator PER TEST. Never persist across tests:
    // the module-level userId held the FIRST test's created person, whose
    // afterEach deletion poisoned every later create with a dead FK —
    // and /api/profile does not exist (always 404'd into that path).
    // Anchor to a seed person (person-e2e-*), which lives for the whole run.
    let creatorId = '';
    try {
      const peopleResponse = await apiContext.get('/api/people');
      const peopleBody = await peopleResponse.json();
      const people = peopleBody.data || peopleBody;
      creatorId =
        people?.find((p: any) => String(p.id).startsWith('person-e2e-'))?.id
        || people?.[0]?.id
        || '';
    } catch (error) {
      console.error('Error resolving creator:', error);
    }

    if (!creatorId) {
      const testUser = await testDataHelpers.createTestUser(testContext);
      creatorId = testUser.id;
    }
    userId = creatorId;
    
    // Create test scenarios
    testScenarios = [];
    const scenarioTypes = ['branch', 'baseline', 'sandbox'];
    const statuses = ['draft', 'active', 'archived'];
    for (let i = 0; i < 3; i++) {
      const scenarioData = {
        name: `${testContext.prefix}-Scenario-${i + 1}`,
        description: `Test scenario ${i + 1} for basic operations`,
        scenario_type: scenarioTypes[i],
        status: statuses[i],
        created_by: userId
      };
      try {
        const response = await apiContext.post('/api/scenarios', { data: scenarioData });
        if (!response.ok()) {
          const errorText = await response.text();
          console.error(`Failed to create scenario ${i + 1}:`, {
            status: response.status(),
            statusText: response.statusText(),
            error: errorText,
            data: scenarioData
          });
          throw new Error(`Failed to create scenario: ${errorText}`);
        }
        const scenario = await response.json();
        if (!scenario.id) {
          throw new Error('Created scenario has no ID');
        }
        testScenarios.push(scenario);
        testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
        testContext.createdIds.scenarios.push(scenario.id);
        console.log(`✅ Created test scenario: ${scenario.name} (${scenario.scenario_type}/${scenario.status})`);
      } catch (error) {
        console.error(`❌ Error creating scenario ${i + 1}:`, error);
        throw error; // Fail the test if we can't create test data
      }
    }
    // Wait for scenarios to be created and visible
    await waitForSync(authenticatedPage);
    
    // Verify scenarios are available via API before proceeding
    const scenarioNames = testScenarios.map(s => s.name);
    const verified = await scenarioUtils.verifyScenariosViaAPI(scenarioNames);
    if (!verified) {
      console.warn('Some scenarios not visible via API, refreshing...');
      await authenticatedPage.reload();
    }
    
    // Wait for hierarchy container to be ready
    await authenticatedPage.waitForSelector('.scenarios-hierarchy', { timeout: 15000 });
  });
  test.afterEach(async ({ testDataHelpers, apiContext }) => {
    // Clean up all test data
    console.log('🧹 Cleaning up test scenarios...');
    
    // Use utility cleanup method
    await scenarioUtils.cleanupScenariosByPrefix(testContext.prefix);
    
    // Standard test context cleanup
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Scenario Display', () => {
    test(`${tags.smoke} should display scenarios in list view`, async ({ authenticatedPage }) => {
      // Wait for scenarios page to load completely
      await authenticatedPage.waitForSelector('h1:has-text("Scenario Planning")', { timeout: 10000 });
      
      // Check if there are any scenarios or empty state
      const hasScenarios = await authenticatedPage.locator('.scenario-card, .scenario-tree-item, .empty-state').count() > 0;
      
      // Wait for the table to be populated
      await authenticatedPage.waitForLoadState('networkidle');
      
      // Check that scenarios are visible - we should see some scenarios in the table
      // Don't check for exact count as other tests might have created scenarios
      const allScenarioRows = authenticatedPage.locator('tr, [role="row"]').filter({ 
        hasText: /ACTIVE|DRAFT|ARCHIVED/ 
      });
      
      // Use utility to wait for scenarios
      const rowCount = await scenarioUtils.waitForScenariosToLoad(testScenarios.length);
      console.log(`Found ${rowCount} scenario rows in the table`);
      expect(rowCount).toBeGreaterThanOrEqual(testScenarios.length);
      
      // Verify our specific test scenarios are displayed
      for (const scenario of testScenarios) {
        const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
        await expect(scenarioRow).toBeVisible();
        
        // Verify the scenario has correct type and status
        const typeBadge = scenarioUtils.getBadge(scenarioRow, 'type');
        await expect(typeBadge).toBeVisible();
        await expect(typeBadge).toHaveText(scenario.scenario_type, { ignoreCase: true });
      }
    });
    
    test('should show scenario hierarchy', async ({ authenticatedPage }) => {
      // Check that scenarios are displayed in hierarchy view
      const hierarchyTitle = authenticatedPage.locator('.hierarchy-title:has-text("Scenario Hierarchy")');
      await expect(hierarchyTitle).toBeVisible();
      
      // Wait for scenario data to be visible
      await scenarioUtils.waitForScenariosToLoad();
      
      // Count all visible scenario rows
      const hierarchyRows = authenticatedPage.locator('.hierarchy-row');
      const rowCount = await hierarchyRows.count();
      console.log(`Found ${rowCount} scenario rows in hierarchy`);
      expect(rowCount).toBeGreaterThan(0);
      
      // Verify hierarchy columns are present
      const firstRow = hierarchyRows.first();
      await expect(firstRow.locator('.name-column')).toBeVisible();
      await expect(firstRow.locator('.type-column')).toBeVisible();
      await expect(firstRow.locator('.status-column')).toBeVisible();
    });
  });
  test.describe('CRUD Operations', () => {
    test(`${tags.crud} should create a new scenario`, async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      // Click create button
      await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
      // Fill form — the ScenarioModal inputs carry placeholders, not name attrs
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      await expect(modal).toBeVisible({ timeout: 10000 });
      const newScenarioName = `${testContext.prefix}-New-Test-Scenario`;
      await modal.getByPlaceholder('Enter scenario name').fill(newScenarioName);
      await modal.locator('textarea').first().fill('A new scenario for testing');
      // Listen for API response
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/scenarios') && response.request().method() === 'POST'
      );
      // Submit
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const createBody = await response.json();
      const newScenario = createBody?.data ?? createBody;
      if (newScenario.id) {
        testContext.createdIds.scenarios.push(newScenario.id);
      }
      // Verify scenario appears
      await waitForSync(authenticatedPage);
      const newRow = await scenarioUtils.getScenarioRow(newScenarioName);
      await expect(newRow).toBeVisible();
    });
    test('should view scenario details', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use first test scenario
      const testScenario = testScenarios[0];
      
      // Wait for scenarios to be loaded
      await scenarioUtils.waitForScenariosToLoad();
      
      const scenarioRow = await scenarioUtils.getScenarioRow(testScenario.name);
      
      // Click on the scenario name in the table
      await scenarioRow.locator(`text="${testScenario.name}"`).click();
      
      // Verify we navigated to details page
      await expect(authenticatedPage).toHaveURL(/\/scenarios\/[^/]+$/);
      
      // Wait for details to load
      await authenticatedPage.waitForLoadState('networkidle');
      
      // Verify scenario details are displayed
      await expect(authenticatedPage.locator('h1, h2').filter({ hasText: testScenario.name })).toBeVisible();
    });
    test('should edit scenario properties', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use second test scenario
      const testScenario = testScenarios[1];
      
      // Wait for scenarios to be loaded
      await scenarioUtils.waitForScenariosToLoad();
      
      const scenarioRow = await scenarioUtils.getScenarioRow(testScenario.name);
      
      // Click edit button in the row
      const editButton = scenarioUtils.getActionButton(scenarioRow, 'edit');
      await editButton.click();
      
      // Wait for modal to appear
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      await expect(modal).toBeVisible();
      
      // Update fields
      const updatedName = `${testContext.prefix}-Updated-Scenario`;
      const nameInput = modal.locator('input[name="name"], input[name="scenario_name"]');
      await nameInput.clear();
      await nameInput.fill(updatedName);
      
      const descriptionInput = modal.locator('textarea[name="description"]');
      await descriptionInput.clear();
      await descriptionInput.fill('Updated description for testing');
      
      // Listen for API response
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes(`/api/scenarios/${testScenario.id}`) && 
        (response.request().method() === 'PUT' || response.request().method() === 'PATCH')
      );
      
      // Save changes
      await modal.locator('button:has-text("Save"), button:has-text("Update")').click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      
      // Wait for modal to close and table to update
      await expect(modal).not.toBeVisible();
      
      // Verify the scenario name was updated in the table
      await waitForSync(authenticatedPage);
      const updatedRow = await scenarioUtils.getScenarioRow(updatedName);
      await expect(updatedRow).toBeVisible();
    });
    test('should delete a scenario', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create a scenario specifically for deletion
      const deleteScenarioData = {
        name: `${testContext.prefix}-Delete-Me`,
        description: 'Scenario to be deleted',
        scenario_type: 'sandbox',
        status: 'draft',
        created_by: userId
      };
      const createResponse = await apiContext.post('/api/scenarios', { data: deleteScenarioData });
      expect(createResponse.ok()).toBe(true);
      const createBody = await createResponse.json();
      const scenarioToDelete = createBody?.data ?? createBody;
      testContext.createdIds.scenarios.push(scenarioToDelete.id);
      // Reload page to see new scenario
      await authenticatedPage.reload();
      // Find and delete it
      await scenarioUtils.waitForScenariosToLoad();
      const scenarioRow = await scenarioUtils.getScenarioRow(scenarioToDelete.name);
      await expect(scenarioRow).toBeVisible();

      const deleteButton = scenarioUtils.getActionButton(scenarioRow, 'delete');
      await deleteButton.click();
      // The delete dialog is type-to-confirm: the scenario's own name in
      // the textbox unlocks the (initially disabled) Delete button
      const dialog = authenticatedPage.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: 'Delete Scenario' });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await dialog.locator('input[type="text"], textarea').fill(scenarioToDelete.name);
      const deletePromise = authenticatedPage.waitForResponse(response =>
        response.url().includes(`/api/scenarios/${scenarioToDelete.id}`) &&
        response.request().method() === 'DELETE'
      );
      await dialog.locator('button:has-text("Delete")').last().click();
      const deleteResponse = await deletePromise;
      expect(deleteResponse.status()).toBe(200);
      // Verify removed
      await expect(scenarioRow).not.toBeVisible({ timeout: 10000 });
      // Row is gone — stop cleanup from 404ing on it
      testContext.createdIds.scenarios = testContext.createdIds.scenarios.filter(
        (id: string) => id !== scenarioToDelete.id
      );
    });
  });
  test.describe('Scenario Types', () => {
    test('should display different scenario types correctly', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Verify each test scenario type is displayed correctly
      for (let i = 0; i < testScenarios.length; i++) {
        const scenario = testScenarios[i];
        const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
        await expect(scenarioRow).toBeVisible();
        
        const typeElement = scenarioUtils.getBadge(scenarioRow, 'type');
        await expect(typeElement).toBeVisible();
        
        // Verify the type matches what we created
        await expect(typeElement).toHaveText(scenario.scenario_type, { ignoreCase: true });
      }
    });
    test('should create scenarios of different types', async ({
      authenticatedPage,
      apiContext
    }) => {
      // The modal offers branch | sandbox (baseline is seed-reserved)
      const scenarioTypes = [
        { type: 'branch', label: 'Branch' },
        { type: 'sandbox', label: 'Sandbox' }
      ];
      for (const scenarioType of scenarioTypes) {
        await authenticatedPage.click('button:has-text("New Scenario")');
        const modal = authenticatedPage.locator('[role="dialog"]');
        await expect(modal).toBeVisible({ timeout: 10000 });
        const scenarioName = `${testContext.prefix}-${scenarioType.label}-Test`;
        await modal.getByPlaceholder('Enter scenario name').fill(scenarioName);
        // shadcn Select for the type
        await modal.locator('#scenario-type').click();
        await authenticatedPage.locator('[role="option"]').filter({ hasText: scenarioType.label }).first().click();
        const responsePromise = authenticatedPage.waitForResponse(response =>
          response.url().includes('/api/scenarios') && response.request().method() === 'POST'
        );
        await modal.locator('button:has-text("Create")').click();
        const response = await responsePromise;
        expect(response.status()).toBe(201);
        const createBody = await response.json();
        const newScenario = createBody?.data ?? createBody;
        if (newScenario.id) {
          testContext.createdIds.scenarios.push(newScenario.id);
        }
        // Verify type is displayed
        await waitForSync(authenticatedPage);
        const row = await scenarioUtils.getScenarioRow(scenarioName);
        const typeBadge = scenarioUtils.getBadge(row, 'type');
        await expect(typeBadge).toContainText(scenarioType.type, { ignoreCase: true });
      }
    });
  });
  test.describe('Filtering and Search', () => {
    test('should filter scenarios by type', async ({ authenticatedPage }) => {
      // Same stale-list cure as getScenarioRow: reload so the list (and the
      // filter options derived from it) reflect the API-created scenarios
      await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
      await authenticatedPage.waitForSelector('.scenarios-hierarchy', { timeout: 15000 });

      // Open the filter dropdown (skip if already open)
      const filterContent = authenticatedPage.locator('.filter-dropdown-content');
      if (!(await filterContent.isVisible().catch(() => false))) {
        await authenticatedPage.locator('button.filter-button').click();
      }
      await expect(filterContent).toBeVisible({ timeout: 5000 });

      // Check the Branch type option (label-anchored, not positional)
      await filterContent
        .locator('.filter-option:has(span:text-is("Branch")) input[type="checkbox"]')
        .check();

      // Click outside to close
      await authenticatedPage.locator('h1').click();

      // Rows carry their scenario_type as a class — every visible row
      // must be a branch row
      await expect
        .poll(async () => authenticatedPage.locator('.hierarchy-row').count(), { timeout: 10000 })
        .toBeGreaterThan(0);
      const total = await authenticatedPage.locator('.hierarchy-row').count();
      const branchCount = await authenticatedPage.locator('.hierarchy-row.branch').count();
      expect(branchCount).toBe(total);
      expect(branchCount).toBeGreaterThan(0);
    });
    test('should search scenarios by name', async ({
      authenticatedPage,
      testDataHelpers
    }) => {
      // Same stale-list cure as getScenarioRow: reload once so the tree
      // reflects the API-created scenarios before asserting on it
      await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
      await authenticatedPage.waitForSelector('.scenarios-hierarchy', { timeout: 15000 });

      // Search for our test prefix
      const searchInput = authenticatedPage.locator('input[placeholder*="Search"]');
      await searchInput.fill(testContext.prefix);
      // The client-side filter applies on state change — poll for the
      // full set instead of counting once
      await expect
        .poll(async () => authenticatedPage.locator('.hierarchy-row').filter({ hasText: testContext.prefix }).count(), { timeout: 10000 })
        .toBeGreaterThanOrEqual(testScenarios.length);
    });
  });
  test.describe('Scenario States', () => {
    test('should show scenario status indicators', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Check each test scenario has correct status
      for (const scenario of testScenarios) {
        const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
        await expect(scenarioRow).toBeVisible();
        
        const statusBadge = scenarioUtils.getBadge(scenarioRow, 'status');
        await expect(statusBadge).toBeVisible();
        
        // Verify status matches what we created
        await expect(statusBadge).toContainText(scenario.status, { ignoreCase: true });
      }
    });
    test('should activate a draft scenario', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Find our draft scenario (first one in test data)
      const draftScenario = testScenarios.find(s => s.status === 'draft');
      if (!draftScenario) {
        test.skip();
        return;
      }
      const scenarioRow = await scenarioUtils.getScenarioRow(draftScenario.name);
      
      // Look for activate button in the row
      const activateButton = scenarioRow.locator('button:has-text("Activate"), button[title*="Activate"]');
      if (await activateButton.isVisible()) {
        const responsePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes(`/api/scenarios/${draftScenario.id}`) && 
          (response.request().method() === 'PUT' || response.request().method() === 'PATCH')
        );
        await activateButton.click();
        await responsePromise;
        
        // Verify status changes
        await waitForSync(authenticatedPage);
        const statusBadge = scenarioUtils.getBadge(scenarioRow, 'status');
        await expect(statusBadge).toContainText('active', { ignoreCase: true });
      }
    });
  });
  test.describe('Bulk Operations', () => {
    test('should support bulk scenario selection', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Check if table supports bulk operations
      const selectButton = authenticatedPage.locator('button:has-text("Select"), button:has-text("Bulk Select")');
      
      if (await selectButton.isVisible()) {
        // Enable selection mode
        await selectButton.click();
        
        // Select our test scenarios
        for (let i = 0; i < Math.min(testScenarios.length, 2); i++) {
          const scenarioRow = await scenarioUtils.getScenarioRow(testScenarios[i].name);
          const checkbox = scenarioRow.locator('input[type="checkbox"]');
          if (await checkbox.isVisible()) {
            await checkbox.check();
          }
        }
        
        // Verify bulk action toolbar appears
        const bulkToolbar = authenticatedPage.locator('.bulk-actions-toolbar, .bulk-actions');
        await expect(bulkToolbar).toBeVisible();
        await expect(bulkToolbar).toContainText('2 selected');
      } else {
        test.skip();
      }
    });
    test('should perform bulk delete', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create scenarios specifically for bulk delete
      const bulkDeleteScenarios = [];
      for (let i = 1; i <= 2; i++) {
        const scenarioData = {
          name: `${testContext.prefix}-Bulk-Delete-${i}`,
          description: 'To be bulk deleted',
          scenario_type: 'sandbox',
          status: 'draft',
          created_by: userId
        };
        const response = await apiContext.post('/api/scenarios', { data: scenarioData });
        const scenario = await response.json();
        bulkDeleteScenarios.push(scenario);
        testContext.createdIds.scenarios.push(scenario.id);
      }
      // Reload page to see new scenarios
      await authenticatedPage.reload();
      // Check if bulk operations are supported
      const selectButton = authenticatedPage.locator('button:has-text("Select")');
      if (await selectButton.isVisible()) {
        // Enable selection and select them
        await selectButton.click();
        
        for (const scenario of bulkDeleteScenarios) {
          const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
          const checkbox = scenarioRow.locator('input[type="checkbox"]');
          if (await checkbox.isVisible()) {
            await checkbox.check();
          }
        }
        
        // Bulk delete
        const bulkDeleteButton = authenticatedPage.locator('.bulk-actions-toolbar button:has-text("Delete"), .bulk-actions button:has-text("Delete")');
        if (await bulkDeleteButton.isVisible()) {
          await bulkDeleteButton.click();
          
          // Confirm deletion
          const confirmButton = authenticatedPage.locator('button:has-text("Delete"), button:has-text("Confirm")').last();
          await confirmButton.click();
          
          // Wait for deletions to complete
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          
          // Verify removed
          for (const scenario of bulkDeleteScenarios) {
            const scenarioRow = authenticatedPage.locator(`tr:has-text("${scenario.name}")`);
            await expect(scenarioRow).not.toBeVisible();
          }
        }
      } else {
        test.skip();
      }
    });
  });
});