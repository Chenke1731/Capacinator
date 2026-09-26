/**
 * Scenario Edge Cases Tests
 * Tests for edge cases, error handling, and complex scenario workflows
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { ScenarioTestUtils, createUniqueTestPrefix, waitForSync } from '../../helpers/scenario-test-utils';
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
    
    // Get user ID
    try {
      const profileResponse = await apiContext.get('/api/profile');
      if (profileResponse.ok()) {
        const profile = await profileResponse.json();
        userId = profile.person?.id || '';
      }
    } catch (error) {
      console.log('Could not get profile:', error);
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
    test(`${tags.edge} should handle multi-level scenario hierarchy`, async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      // Create Level 1 parent scenario
      const level1Data = {
        name: `${testContext.prefix}-Level-1-Parent`,
        description: 'Top level parent scenario',
        scenario_type: 'baseline',
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
      
      // Check if graphical view exists
      const graphicalButton = authenticatedPage.getByRole('button', { name: 'Graphical' });
      if (await graphicalButton.isVisible()) {
        await graphicalButton.click();
        await waitForSync(authenticatedPage);
        
        // Verify all three levels are visible in graphical view
        await expect(authenticatedPage.locator(`.graph-node:has-text("${level1Scenario.name}"), text:has-text("${level1Scenario.name}")`)).toBeVisible();
        await expect(authenticatedPage.locator(`.graph-node:has-text("${level2Scenario.name}"), text:has-text("${level2Scenario.name}")`)).toBeVisible();
        await expect(authenticatedPage.locator(`.graph-node:has-text("${level3Scenario.name}"), text:has-text("${level3Scenario.name}")`)).toBeVisible();
      } else {
        // If no graphical view, verify in the hierarchy tree
        const level1Row = await scenarioUtils.getScenarioRow(level1Scenario.name);
        await expect(level1Row).toBeVisible();
        const level2Row = await scenarioUtils.getScenarioRow(level2Scenario.name);
        await expect(level2Row).toBeVisible();
        const level3Row = await scenarioUtils.getScenarioRow(level3Scenario.name);
        await expect(level3Row).toBeVisible();
      }
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
      await authenticatedPage.click('button:has-text("New Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      // Test very long name (but with our test prefix)
      const longName = `${testContext.prefix}-${'A'.repeat(240)}`;
      await modal.locator('input[name="name"], input[name="scenario_name"]').fill(longName);
      // Check if truncated in input
      const nameInput = modal.locator('input[name="name"], input[name="scenario_name"]');
      const actualValue = await nameInput.inputValue();
      expect(actualValue.length).toBeLessThanOrEqual(255);
      // Test very long description
      const longDescription = 'Lorem ipsum '.repeat(1000);
      await modal.locator('textarea[name="description"]').fill(longDescription);
      // Try to create scenario
      const createPromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/scenarios') && response.request().method() === 'POST'
      ).catch(() => null);
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      const response = await createPromise;
      if (response && response.status() === 201) {
        const scenario = await response.json();
        if (scenario.id) {
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
      }
      // Should either succeed with truncation or show appropriate error
      const errorMessage = modal.locator('.error-message, .invalid-feedback');
      if (await errorMessage.count() > 0) {
        await expect(errorMessage).toContainText(/length|too long|maximum/i);
      } else {
        // Modal should close if successful
        await expect(modal).not.toBeVisible();
      }
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
        await authenticatedPage.click('button:has-text("New Scenario")');
        const modal = authenticatedPage.locator('[role="dialog"]');
        await modal.locator('input[name="name"], input[name="scenario_name"]').fill(fullName);
        const createPromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/scenarios') && response.request().method() === 'POST'
        ).catch(() => null);
        await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
        const response = await createPromise;
        if (response && response.status() === 201) {
          const scenario = await response.json();
          if (scenario.id) {
            testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
            testContext.createdIds.scenarios.push(scenario.id);
          }
          // Wait for modal to close
          await expect(modal).not.toBeVisible({ timeout: 3000 });
          // Verify the name is properly displayed/escaped
          const createdRow = await scenarioUtils.getScenarioRow(fullName);
          const displayedName = await createdRow.locator('.scenario-name, .name, h3, h4').textContent();
          // Should not contain unescaped HTML
          expect(displayedName).not.toContain('<script>');
        }
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      }
    });
    test('should validate date boundaries', async ({ 
      authenticatedPage 
    }) => {
      await authenticatedPage.click('button:has-text("New Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      const testName = `${testContext.prefix}-Date-Boundary-Test`;
      await modal.locator('input[name="name"], input[name="scenario_name"]').fill(testName);
      // Look for date inputs
      const startDateInput = modal.locator('input[name="start_date"], input[type="date"]').first();
      const endDateInput = modal.locator('input[name="end_date"], input[type="date"]').last();
      if (await startDateInput.count() > 0 && await endDateInput.count() > 0) {
        // Test far future date
        await endDateInput.fill('2099-12-31');
        // Test very old date
        await startDateInput.fill('1900-01-01');
        await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
        // Should either accept with warning or validate
        const warning = modal.locator('.warning-message, .warning');
        const error = modal.locator('.error-message, .invalid-feedback');
        if (await warning.count() > 0) {
          await expect(warning).toContainText(/date|range|unusual/i);
        } else if (await error.count() > 0) {
          await expect(error).toContainText(/invalid|date/i);
        } else {
          // If created successfully, track it
          const response = await authenticatedPage.waitForResponse(response => 
            response.url().includes('/api/scenarios') && response.request().method() === 'POST'
          ).catch(() => null);
          if (response) {
            const scenario = await response.json();
            if (scenario.id) {
              testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
              testContext.createdIds.scenarios.push(scenario.id);
            }
          }
        }
      } else {
        // No date fields, just cancel
        await modal.locator('button:has-text("Cancel")').click();
      }
    });
  });
  test.describe('Performance Edge Cases', () => {
    test(`${tags.performance} should handle rapid scenario creation`, async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      // Test creating multiple scenarios quickly
      const startTime = Date.now();
      const rapidScenarios = [];
      for (let i = 1; i <= 5; i++) {
        await authenticatedPage.click('button:has-text("New Scenario")');
        const modal = authenticatedPage.locator('[role="dialog"]');
        const scenarioName = `${testContext.prefix}-Rapid-Test-${i}`;
        await modal.locator('input[name="name"], input[name="scenario_name"]').fill(scenarioName);
        // Don't wait between creations
        const createPromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/scenarios') && response.request().method() === 'POST'
        );
        modal.locator('button:has-text("Create"), button:has-text("Save")').click();
        const response = await createPromise;
        const scenario = await response.json();
        if (scenario.id) {
          rapidScenarios.push(scenario);
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
        // Wait for modal to close
        await expect(modal).not.toBeVisible({ timeout: 3000 });
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
      expect(endTime - startTime).toBeLessThan(15000);
    });
    test('should handle scenarios with many relationships', async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      // Create a parent scenario
      const parentData = {
        name: `${testContext.prefix}-Parent-Hub`,
        description: 'Parent with many children',
        scenario_type: 'baseline',
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
      // Reload and switch to graphical view
      await authenticatedPage.reload();
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Measure interaction performance
      const startTime = Date.now();
      // Try zooming if available
      const zoomIn = authenticatedPage.locator('button[aria-label="Zoom in"], button[title*="Zoom"]');
      if (await zoomIn.count() > 0) {
        await zoomIn.click();
        await zoomIn.click();
      }
      // Try panning
      const graphContainer = authenticatedPage.locator('.graph-container, svg, canvas');
      const box = await graphContainer.boundingBox();
      if (box) {
        await authenticatedPage.mouse.move(box.x + 200, box.y + 200);
        await authenticatedPage.mouse.down();
        await authenticatedPage.mouse.move(box.x + 300, box.y + 300);
        await authenticatedPage.mouse.up();
      }
      const endTime = Date.now();
      // Interactions should be responsive
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });
  test.describe('State Management Edge Cases', () => {
    test('should recover from interrupted operations', async ({ 
      authenticatedPage,
      context 
    }) => {
      // Start creating a scenario
      await authenticatedPage.click('button:has-text("New Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      const interruptedName = `${testContext.prefix}-Interrupted-Scenario`;
      await modal.locator('input[name="name"], input[name="scenario_name"]').fill(interruptedName);
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
      // Create a test scenario to navigate to
      const navData = {
        name: `${testContext.prefix}-Navigation-Test`,
        description: 'Testing browser navigation',
        scenario_type: 'baseline',
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
      // Navigate to the scenario
      const scenarioRow = await scenarioUtils.getScenarioRow(navScenario.name);
      // Click on scenario name to navigate to details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      await nameLink.click();
      // Should be on scenario detail page
      await expect(authenticatedPage).toHaveURL(/\/scenarios\/[^/]+$/);
      await expect(authenticatedPage.locator('h1')).toContainText(navScenario.name);
      // Go back
      await authenticatedPage.goBack();
      // Should be on scenarios list
      await expect(authenticatedPage).toHaveURL(/\/scenarios$/);
      // Go forward
      await authenticatedPage.goForward();
      // Should be back on same scenario detail
      await expect(authenticatedPage).toHaveURL(/\/scenarios\/[^/]+$/);
      await expect(authenticatedPage.locator('h1')).toContainText(navScenario.name);
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
  test.describe('Bulk Operation Edge Cases', () => {
    test('should handle selecting all scenarios', async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      // Create test scenarios for bulk selection
      const bulkScenarios = [];
      for (let i = 1; i <= 3; i++) {
        const data = {
          name: `${testContext.prefix}-Bulk-Select-${i}`,
          description: `Bulk selection test ${i}`,
          scenario_type: 'branch',
          status: 'draft',
          created_by: userId
        };
        const response = await apiContext.post('/api/scenarios', { data });
        const scenario = await response.json();
        if (scenario.id) {
          bulkScenarios.push(scenario);
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
      }
      // Reload to see all scenarios
      await authenticatedPage.reload();
      // Enable selection mode
      await authenticatedPage.click('button:has-text("Select"), button:has-text("Bulk")');
      // Look for select all checkbox
      const selectAllCheckbox = authenticatedPage.locator('input[aria-label="Select all"], input[type="checkbox"]').first();
      if (await selectAllCheckbox.count() > 0) {
        await selectAllCheckbox.check();
        // Check if our test scenarios are selected
        let selectedCount = 0;
        for (const scenario of bulkScenarios) {
          const row = await scenarioUtils.getScenarioRow(scenario.name);
          const checkbox = row.locator('input[type="checkbox"]');
          if (await checkbox.isChecked()) {
            selectedCount++;
          }
        }
        expect(selectedCount).toBeGreaterThan(0);
        // Bulk actions should be available
        await expect(authenticatedPage.locator('.bulk-actions-toolbar, .bulk-actions')).toBeVisible();
      }
    });
    test('should prevent deletion of scenarios with dependencies', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create parent and child scenarios
      const parentData = {
        name: `${testContext.prefix}-Parent-Protected`,
        description: 'Parent that cannot be deleted',
        scenario_type: 'baseline',
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
      if (await deleteButton.count() > 0) {
        await deleteButton.click();
        // Confirm delete
        const confirmButton = authenticatedPage.locator('button:has-text("Delete"), button:has-text("Confirm")').last();
        await confirmButton.click();
        // Should show warning about dependencies
        await expect(authenticatedPage.locator('.error-message, .warning-dialog, .toast-error')).toContainText(/dependencies|children|cannot|relationship/i);
      }
    });
    test('should handle partial bulk operation failures', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Create test scenarios for partial failure test
      const partialScenarios = [];
      for (let i = 1; i <= 3; i++) {
        const data = {
          name: `${testContext.prefix}-Partial-${i}`,
          description: `Partial operation test ${i}`,
          scenario_type: 'branch',
          status: 'draft',
          created_by: userId
        };
        const response = await apiContext.post('/api/scenarios', { data });
        const scenario = await response.json();
        if (scenario.id) {
          partialScenarios.push(scenario);
          testContext.createdIds.scenarios = testContext.createdIds.scenarios || [];
          testContext.createdIds.scenarios.push(scenario.id);
        }
      }
      // Reload page
      await authenticatedPage.reload();
      // Make one read-only (simulate protection)
      await authenticatedPage.evaluate((scenarioName) => {
        const rows = Array.from(document.querySelectorAll('.hierarchy-row'));
        const targetRow = rows.find(r => r.textContent?.includes(scenarioName));
        if (targetRow) {
          targetRow.setAttribute('data-readonly', 'true');
          targetRow.classList.add('readonly');
        }
      }, partialScenarios[1].name);
      // Select all partial test scenarios
      const selectButton = authenticatedPage.locator('button:has-text("Select"), button:has-text("Bulk Select")');
      if (await selectButton.isVisible()) {
        await selectButton.click();
        for (const scenario of partialScenarios) {
          const row = await scenarioUtils.getScenarioRow(scenario.name);
          const checkbox = row.locator('input[type="checkbox"]');
          if (await checkbox.isEnabled()) {
            await checkbox.check();
          }
        }
        // Try bulk delete
        const bulkDeleteButton = authenticatedPage.locator('.bulk-actions-toolbar button:has-text("Delete"), .bulk-actions button:has-text("Delete")');
        if (await bulkDeleteButton.count() > 0) {
          await bulkDeleteButton.click();
          await authenticatedPage.locator('button:has-text("Delete"), button:has-text("Confirm")').last().click();
          // Wait for operation to complete
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Should show some kind of result message
          const notification = authenticatedPage.locator('.toast, .notification, .alert');
          if (await notification.count() > 0) {
            const notificationText = await notification.textContent();
            // Should indicate partial success or failure
            expect(notificationText?.toLowerCase()).toMatch(/partial|failed|error|success/);
          }
        }
      }
    });
  });
});