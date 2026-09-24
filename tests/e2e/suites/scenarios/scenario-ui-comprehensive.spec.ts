import { test, expect } from '../../fixtures';

test.describe('Scenario UI Comprehensive Tests', () => {
  // authenticatedPage fixture handles profile login (D11-safe); no manual handling needed

  test('should navigate to scenarios page and see list', async ({ authenticatedPage }) => {
    // Click on Scenarios in the navigation
    await authenticatedPage.click('a[href="/scenarios"]');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Wait for React to render
    
    // Check we're on the scenarios page
    await expect(authenticatedPage.locator('h1:has-text("Scenario Planning")')).toBeVisible();
    
    // Should see the hierarchy structure
    await expect(authenticatedPage.locator('.scenarios-hierarchy')).toBeVisible();
    
    // Should see the seed baseline scenario (e2e seed names it "Baseline")
    await expect(authenticatedPage.locator('.hierarchy-row:has-text("Baseline")').first()).toBeVisible();
  });

  test('should create a new scenario branch', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Click New Scenario button
    await authenticatedPage.click('button:has-text("New Scenario")');
    
    // Fill in the create scenario form (fields carry ids, not name attrs)
    await authenticatedPage.fill('#scenario-name', 'Test Branch Scenario');
    await authenticatedPage.fill('#scenario-description', 'This is a test branch scenario created by E2E tests');
    
    // Submit the form
    await authenticatedPage.click('button:has-text("Create Scenario")');
    
    // Wait for modal to close and list to update
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Verify the new scenario appears in the list
    await expect(authenticatedPage.locator('.hierarchy-row:has-text("Test Branch Scenario")')).toBeVisible();
  });

  test('should switch scenarios using header dropdown', async ({ authenticatedPage }) => {
    // Get initial scenario from localStorage
    const initialScenario = await authenticatedPage.evaluate(() => {
      return JSON.parse(localStorage.getItem('currentScenario') || '{}');
    });
    
    // Click on scenario selector in header
    await authenticatedPage.click('.scenario-selector button');
    
    // Wait for dropdown to open
    await expect(authenticatedPage.locator('.scenario-dropdown')).toBeVisible();
    
    // Check that baseline scenario is in the list
    await expect(authenticatedPage.locator('.scenario-option:has-text("Baseline")').first()).toBeVisible();
    
    // If there are other scenarios, try to select one
    const scenarioOptions = await authenticatedPage.locator('.scenario-option').count();
    if (scenarioOptions > 1) {
      // Click on a different scenario (capture its row text for the wait)
      const targetOption = authenticatedPage.locator('.scenario-option:not(.selected)').first();
      const targetName = (await targetOption.locator('.scenario-option-name').textContent())?.trim() || '';

      await targetOption.click();

      // Wait for the header chip to reflect the switch, then localStorage
      // (the ScenarioContext effect writes it after re-render)
      await expect(authenticatedPage.locator('.scenario-button .scenario-name')).toContainText(targetName);
      await expect.poll(async () =>
        authenticatedPage.evaluate(() => localStorage.getItem('currentScenario'))
      ).toContain(targetName);

      const newScenario = await authenticatedPage.evaluate(() => {
        return JSON.parse(localStorage.getItem('currentScenario') || '{}');
      });

      expect(newScenario.id).not.toBe(initialScenario.id);
    }
  });

  test('should show scenario actions in list view', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Find a scenario row
    const scenarioRow = authenticatedPage.locator('.hierarchy-row').first();
    
    // Check action buttons are present
    await expect(scenarioRow.locator('.action-button.branch')).toBeVisible();
    await expect(scenarioRow.locator('.action-button.compare')).toBeVisible();
    await expect(scenarioRow.locator('.action-button.edit')).toBeVisible();
    
    // Baseline scenario should not have delete button
    const baselineRow = authenticatedPage.locator('.hierarchy-row:has(.scenario-type.baseline)').first();
    const deleteButton = baselineRow.locator('.action-button.delete');
    await expect(deleteButton).not.toBeVisible();
  });

  test('should open edit modal when clicking edit', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Click edit on first scenario
    await authenticatedPage.locator('.action-button.edit').first().click();
    
    // Check edit modal is open
    // Radix dialog — no .modal-content anymore
    await expect(authenticatedPage.locator('[role="dialog"]:has-text("Edit Scenario")')).toBeVisible();

    // Close via Escape (Radix close button has no stable class)
    await authenticatedPage.keyboard.press('Escape');
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should filter scenarios by search', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Type in search box
    await authenticatedPage.fill('input[placeholder="Search scenarios..."]', 'Baseline');
    
    // Should only show scenarios matching search
    const visibleScenarios = await authenticatedPage.locator('.hierarchy-row:visible').count();
    const baselineScenarios = await authenticatedPage.locator('.hierarchy-row:visible:has-text("Baseline")').count();
    
    expect(baselineScenarios).toBeGreaterThan(0);
    expect(baselineScenarios).toBe(visibleScenarios);
  });

  test('should show scenario type and status badges', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Check for type badges
    await expect(authenticatedPage.locator('.scenario-type.baseline').first()).toBeVisible();
    
    // Check for status badges
    await expect(authenticatedPage.locator('.scenario-status.active').first()).toBeVisible();
  });

  test('should open compare modal when clicking compare', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Click compare on first scenario
    await authenticatedPage.locator('.action-button.compare').first().click();
    
    // Check compare modal is open
    await expect(authenticatedPage.locator('[role="dialog"]:has-text("Compare Scenarios")')).toBeVisible();

    // Should have a dropdown to select comparison target
    await expect(authenticatedPage.locator('select.scenario-select')).toBeVisible();

    // Close via Escape (Radix close button has no stable class)
    await authenticatedPage.keyboard.press('Escape');
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should create branch from existing scenario', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Click branch on baseline scenario
    await authenticatedPage.locator('.hierarchy-row:has(.scenario-type.baseline) .action-button.branch').first().click();
    
    // Check create modal is open with parent scenario pre-selected
    // Create modal title is "Create New Scenario"; parent shown as "Branching from: <name>"
    await expect(authenticatedPage.locator('[role="dialog"]:has-text("Create New Scenario")')).toBeVisible();
    await expect(authenticatedPage.locator('[role="dialog"]:has-text("Branching from:")')).toBeVisible();

    // Fill in branch details (fields carry ids, not name attrs)
    await authenticatedPage.fill('#scenario-name', 'Test Sub-Branch');
    await authenticatedPage.fill('#scenario-description', 'Branch created from baseline');
    
    // Submit
    await authenticatedPage.click('button:has-text("Create Scenario")');
    
    // Wait for creation
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Verify new branch appears
    await expect(authenticatedPage.locator('.hierarchy-row:has-text("Test Sub-Branch")')).toBeVisible();
  });

  test('should show hierarchical tree structure for scenarios', async ({ authenticatedPage }) => {
    // Navigate to scenarios page
    await authenticatedPage.goto('/scenarios');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Check for hierarchy elements
    await expect(authenticatedPage.locator('.hierarchy-header:has-text("Scenario Hierarchy")')).toBeVisible();
    await expect(authenticatedPage.locator('.hierarchy-legend')).toBeVisible();
    
    // Check column headers
    await expect(authenticatedPage.locator('.column-header.name-column')).toBeVisible();
    await expect(authenticatedPage.locator('.column-header.type-column')).toBeVisible();
    await expect(authenticatedPage.locator('.column-header.status-column')).toBeVisible();
    await expect(authenticatedPage.locator('.column-header.created-by-column')).toBeVisible();
  });
});