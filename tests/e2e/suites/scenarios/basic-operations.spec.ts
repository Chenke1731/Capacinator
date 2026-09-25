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
    
    // Get current user ID from the profile (hoisted to describe scope)
    try {
      // Get the current profile
      const profileResponse = await apiContext.get('/api/profile');
      if (profileResponse.ok()) {
        const profile = await profileResponse.json();
        userId = profile.person?.id || '';
        console.log('Using profile person ID:', userId);
      }
      
      // If no user ID from profile, try to get from people list
      if (!userId) {
        const peopleResponse = await apiContext.get('/api/people');
        if (peopleResponse.ok()) {
          const people = await peopleResponse.json();
          if (people.length > 0) {
            userId = people[0].id;
            console.log('Using first person ID:', userId);
          }
        }
      }
    } catch (error) {
      console.error('Error getting user ID:', error);
    }
    
    // If still no user ID, create a test user
    if (!userId) {
      const testUser = await testDataHelpers.createTestUser(testContext);
      userId = testUser.id;
      console.log('Created test user with ID:', userId);
    }
    
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
      // Fill form
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      const newScenarioName = `${testContext.prefix}-New-Test-Scenario`;
      await modal.locator('input[name="name"], input[name="scenario_name"]').fill(newScenarioName);
      await modal.locator('textarea[name="description"]').fill('A new scenario for testing');
      const typeSelect = modal.locator('select[name="scenario_type"], select[name="type"]');
      if (await typeSelect.isVisible()) {
        await typeSelect.selectOption('sandbox');
      }
      // Listen for API response
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/scenarios') && response.request().method() === 'POST'
      );
      // Submit
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const newScenario = await response.json();
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
      const scenarioToDelete = await createResponse.json();
      testContext.createdIds.scenarios.push(scenarioToDelete.id);
      // Reload page to see new scenario
      await authenticatedPage.reload();
      // Find and delete it
      await scenarioUtils.waitForScenariosToLoad();
      const scenarioRow = await scenarioUtils.getScenarioRow(scenarioToDelete.name);
      await expect(scenarioRow).toBeVisible();
      
      const deleteButton = scenarioUtils.getActionButton(scenarioRow, 'delete');
      await deleteButton.click();
      // Listen for API response
      const deletePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes(`/api/scenarios/${scenarioToDelete.id}`) && 
        response.request().method() === 'DELETE'
      );
      // Confirm deletion - wait for confirmation dialog
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      const confirmButton = authenticatedPage.locator('button').filter({ hasText: /^Delete$|^Confirm$/ }).last();
      await confirmButton.click();
      const deleteResponse = await deletePromise;
      expect(deleteResponse.status()).toBe(200);
      // Verify removed
      await expect(scenarioRow).not.toBeVisible();
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
      const scenarioTypes = [
        { type: 'branch', label: 'Branch' },
        { type: 'baseline', label: 'Baseline' },
        { type: 'sandbox', label: 'Sandbox' }
      ];
      for (const scenarioType of scenarioTypes) {
        // Create scenario of specific type
        await authenticatedPage.click('button:has-text("New Scenario")');
        const modal = authenticatedPage.locator('[role="dialog"]');
        const scenarioName = `${testContext.prefix}-${scenarioType.label}-Test`;
        await modal.locator('input[name="name"], input[name="scenario_name"]').fill(scenarioName);
        await modal.locator('select[name="scenario_type"], select[name="type"]').selectOption(scenarioType.type);
        const responsePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/scenarios') && response.request().method() === 'POST'
        );
        await modal.locator('button:has-text("Create")').click();
        const response = await responsePromise;
        const newScenario = await response.json();
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
      // Apply filter for branch type (we know we have one from test data)
      const filterButton = authenticatedPage.locator('button:has-text("Filters")');
      await filterButton.click();
      
      // Wait for filter dropdown to be visible
      await authenticatedPage.waitForSelector('.filter-dropdown-content', { state: 'visible' });
      
      // Find and check the branch type filter
      const branchFilterCheckbox = authenticatedPage.locator('.filter-dropdown-content input[type="checkbox"]')
        .filter({ has: authenticatedPage.locator('xpath=../span[contains(text(), "branch")]') });
      await branchFilterCheckbox.check();
      // Wait for filter to apply
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Click outside to close filter dropdown
      await authenticatedPage.click('h1');
      
      // Wait for filter to apply
      await authenticatedPage.waitForLoadState('networkidle');
      
      // Verify only branch scenarios shown
      const visibleRows = authenticatedPage.locator('.hierarchy-row').filter({ 
        has: authenticatedPage.locator('.scenario-type')
      });
      const rowCount = await visibleRows.count();
      expect(rowCount).toBeGreaterThan(0);
      
      // Check each visible scenario has BRANCH type
      for (let i = 0; i < rowCount; i++) {
        const row = visibleRows.nth(i);
        const typeBadge = scenarioUtils.getBadge(row, 'type');
        await expect(typeBadge).toContainText('branch', { ignoreCase: true });
      }
    });
    test('should search scenarios by name', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Search for our test prefix
      const searchInput = authenticatedPage.locator('input[placeholder*="Search"]');
      await searchInput.fill(testContext.prefix);
      // Wait for search to apply
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify filtered results
      const visibleRows = authenticatedPage.locator('.hierarchy-row').filter({ hasText: testContext.prefix });
      const rowCount = await visibleRows.count();
      // Should show all our test scenarios
      expect(rowCount).toBeGreaterThanOrEqual(testScenarios.length);
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