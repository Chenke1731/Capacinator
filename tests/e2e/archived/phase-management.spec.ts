/**
 * Phase Management Test Suite
 * Tests for comprehensive phase management including creation, duplication, reordering, and deletion
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Phase Management', () => {
  let testContext: TestDataContext;
  let testProject: any;
  let testPeople: any[];
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('phasemgmt');
    // Create test people for assignments
    testPeople = [];
    for (let i = 0; i < 2; i++) {
      const person = await testDataHelpers.createTestPerson(testContext, {
        firstName: `${testContext.prefix}-Test`,
        lastName: `Person-${i + 1}`
      });
      testPeople.push(person);
    }
    // Create test project
    testProject = await testDataHelpers.createTestProject(testContext, {
      name: `${testContext.prefix}-Phase-Mgmt-Project`
    });
    // Navigate to test project detail
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.smoke} should create custom phase with resource allocation`, async ({ 
    authenticatedPage,
    testDataHelpers,
    apiContext
  }) => {
    // Wait for phase section
    const phaseSection = authenticatedPage.locator('h2:has-text("Project Timeline"), h2:has-text("Phases"), h2:has-text("Schedule")');
    await expect(phaseSection).toBeVisible();
    // Open phase manager if collapsed
    const phaseContent = authenticatedPage.locator('.project-phase-manager, .phase-manager, [data-testid="phase-manager"]');
    if (!await phaseContent.isVisible()) {
      await phaseSection.click();
    }
    await expect(phaseContent).toBeVisible();
    // Click Add Phase button
    const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase"), button:has-text("Create Phase")');
    await addPhaseButton.click();
    // Modal should open
    const modal = authenticatedPage.locator('[role="dialog"], .modal-overlay');
    await expect(modal).toBeVisible();
    // Select custom phase option
    const customOption = authenticatedPage.locator('.selection-card:has-text("Blank Custom"), .selection-card:has-text("Custom Phase")');
    await customOption.click();
    // Fill phase details
    const phaseName = `${testContext.prefix}-Custom-Review-Phase`;
    const phaseDescription = 'Custom phase for client feedback cycles';
    const startDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await authenticatedPage.locator('input[name*="name"]').fill(phaseName);
    await authenticatedPage.locator('textarea[name*="description"]').fill(phaseDescription);
    await authenticatedPage.locator('input[name*="order"], input[name*="index"]').fill('15');
    await authenticatedPage.locator('input[name*="start"][type="date"]').fill(startDate);
    await authenticatedPage.locator('input[name*="end"][type="date"]').fill(endDate);
    // Submit
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await authenticatedPage.locator('button:has-text("Create"), button[type="submit"]').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const newPhase = await response.json();
    if (newPhase.id) {
      testContext.createdIds.projectPhases.push(newPhase.id);
    }
    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    // Verify phase appears in table
    const phaseRow = authenticatedPage.locator(`tr:has-text("${phaseName}")`);
    await expect(phaseRow).toBeVisible();
    await expect(phaseRow.locator('td').nth(2)).toContainText(startDate.split('-')[1]); // Month
    await expect(phaseRow.locator('td').nth(3)).toContainText(endDate.split('-')[1]); // Month
    await expect(phaseRow.locator('td').nth(4)).toContainText('15 days'); // Duration
  });
  test('should duplicate phase with resource allocations', async ({ 
    authenticatedPage,
    testDataHelpers,
    apiContext
  }) => {
    // First create a phase with resource allocation to duplicate
    const sourcePhaseData = {
      project_id: testProject.id,
      name: `${testContext.prefix}-Source-Development-Phase`,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      color: '#FF6B6B',
      order_index: 0
    };
    const phaseResponse = await apiContext.post('/api/project-phases', { data: sourcePhaseData });
    const sourcePhase = await phaseResponse.json();
    testContext.createdIds.projectPhases.push(sourcePhase.id);
    // Add resource allocation to source phase
    const allocationData = {
      phase_id: sourcePhase.id,
      person_id: testPeople[0].id,
      allocation_percentage: 75,
      hours_per_week: 30
    };
    await apiContext.post('/api/phase-resource-allocations', { data: allocationData });
    // Reload page to see new phase
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Open phase manager
    const phaseSection = authenticatedPage.locator('h2:has-text("Project Timeline"), h2:has-text("Phases")');
    const phaseContent = authenticatedPage.locator('.project-phase-manager, .phase-manager');
    if (!await phaseContent.isVisible()) {
      await phaseSection.click();
    }
    // Open Add Phase modal
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select duplicate option
    await authenticatedPage.locator('.selection-card:has-text("Duplicate")').click();
    // Select source phase
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    await sourceDropdown.selectOption({ label: sourcePhase.name });
    // Select placement after source phase
    await authenticatedPage.locator('.selection-card-inline:has-text("After")').click();
    const afterDropdown = authenticatedPage.locator('select[name*="after"]');
    if (await afterDropdown.isVisible()) {
      await afterDropdown.selectOption({ label: sourcePhase.name });
    }
    // Custom name
    const duplicateName = `${testContext.prefix}-Duplicated-Development`;
    await authenticatedPage.locator('input[name*="name"]').fill(duplicateName);
    // Submit
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await authenticatedPage.locator('button:has-text("Duplicate"), button:has-text("Create")').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const duplicatedPhase = await response.json();
    testContext.createdIds.projectPhases.push(duplicatedPhase.id);
    // Wait for modal to close
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });
    // Verify duplicated phase appears
    await expect(authenticatedPage.locator(`text="${duplicateName}"`)).toBeVisible();
    // Verify resource allocation was copied (check via API)
    const allocationsResponse = await apiContext.get(`/api/phase-resource-allocations?phase_id=${duplicatedPhase.id}`);
    const allocations = await allocationsResponse.json();
    expect(allocations.length).toBeGreaterThan(0);
    expect(allocations[0].allocation_percentage).toBe(75);
  });
  test('should reorder phases using arrow controls', async ({ 
    authenticatedPage,
    testDataHelpers,
    apiContext
  }) => {
    // Create multiple phases in order
    const phases = [];
    for (let i = 0; i < 3; i++) {
      const phaseData = {
        project_id: testProject.id,
        name: `${testContext.prefix}-Phase-${String.fromCharCode(65 + i)}`, // A, B, C
        start_date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date(Date.now() + (i + 1) * 30 * 24 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        color: ['#FF6B6B', '#4ECDC4', '#45B7D1'][i],
        order_index: i
      };
      const response = await apiContext.post('/api/project-phases', { data: phaseData });
      const phase = await response.json();
      phases.push(phase);
      testContext.createdIds.projectPhases.push(phase.id);
    }
    // Reload to see phases
    await authenticatedPage.reload();
    // Open phase manager
    const phaseContent = authenticatedPage.locator('.project-phase-manager, .phase-manager');
    if (!await phaseContent.isVisible()) {
      await authenticatedPage.locator('h2:has-text("Phases")').click();
    }
    // Verify initial order
    const tableRows = authenticatedPage.locator('tbody tr');
    await expect(tableRows.nth(0)).toContainText('Phase-A');
    await expect(tableRows.nth(1)).toContainText('Phase-B');
    await expect(tableRows.nth(2)).toContainText('Phase-C');
    // Move Phase-B up (should swap with Phase-A)
    const phaseBRow = authenticatedPage.locator(`tr:has-text("Phase-B")`);
    const moveUpButton = phaseBRow.locator('button[title*="Move earlier"], button[title*="Move up"], button:has([data-icon="arrow-up"])');
    // Listen for API call
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && 
      (response.request().method() === 'PUT' || response.request().method() === 'PATCH')
    );
    await moveUpButton.click();
    await responsePromise;
    // Wait for UI update
    await authenticatedPage.waitForTimeout(1000);
    // Reload to verify persistence
    await authenticatedPage.reload();
    // Verify new order - Phase-B should now be first
    const updatedRows = authenticatedPage.locator('tbody tr');
    await expect(updatedRows.nth(0)).toContainText('Phase-B');
    await expect(updatedRows.nth(1)).toContainText('Phase-A');
    await expect(updatedRows.nth(2)).toContainText('Phase-C');
  });
  test('should delete phase and clean up resources', async ({ 
    authenticatedPage,
    testDataHelpers,
    apiContext
  }) => {
    // Create a phase to delete
    const phaseData = {
      project_id: testProject.id,
      name: `${testContext.prefix}-Phase-To-Delete`,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      color: '#FF6B6B',
      order_index: 0
    };
    const response = await apiContext.post('/api/project-phases', { data: phaseData });
    const phase = await response.json();
    testContext.createdIds.projectPhases.push(phase.id);
    // Add resource allocation
    const allocationData = {
      phase_id: phase.id,
      person_id: testPeople[0].id,
      allocation_percentage: 50
    };
    await apiContext.post('/api/phase-resource-allocations', { data: allocationData });
    // Reload page
    await authenticatedPage.reload();
    // Open phase manager
    const phaseContent = authenticatedPage.locator('.project-phase-manager');
    if (!await phaseContent.isVisible()) {
      await authenticatedPage.locator('h2:has-text("Phases")').click();
    }
    // Verify phase exists
    const phaseRow = authenticatedPage.locator(`tr:has-text("${phase.name}")`);
    await expect(phaseRow).toBeVisible();
    // Handle confirmation dialog
    authenticatedPage.on('dialog', async dialog => {
      expect(dialog.message()).toContain(phase.name);
      await dialog.accept();
    });
    // Click delete button
    const deleteButton = phaseRow.locator('button[title*="Remove"], button[title*="Delete"], button:has([data-icon="trash"])');
    const deletePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes(`/api/project-phases/${phase.id}`) && 
      response.request().method() === 'DELETE'
    );
    await deleteButton.click();
    const deleteResponse = await deletePromise;
    expect(deleteResponse.status()).toBe(200);
    // Verify phase is removed
    await expect(phaseRow).not.toBeVisible({ timeout: 5000 });
    // Verify allocations were cleaned up via API
    const allocationsResponse = await apiContext.get(`/api/phase-resource-allocations?phase_id=${phase.id}`);
    const allocations = await allocationsResponse.json();
    expect(allocations).toHaveLength(0);
  });
  test('should add existing phase from master list', async ({ 
    authenticatedPage,
    testHelpers,
    apiContext
  }) => {
    // Get available phases from master list
    const phasesResponse = await apiContext.get('/api/phases');
    const masterPhases = await phasesResponse.json();
    expect(masterPhases.length).toBeGreaterThan(0);
    // Open phase manager
    const phaseContent = authenticatedPage.locator('.project-phase-manager');
    if (!await phaseContent.isVisible()) {
      await authenticatedPage.locator('h2:has-text("Phases")').click();
    }
    // Click "Add Existing Phase" button (if available)
    const addExistingButton = authenticatedPage.locator('button:has-text("Add Existing"), button:has-text("From Library")');
    if (await addExistingButton.isVisible()) {
      await addExistingButton.click();
    } else {
      // Use regular Add Phase flow
      await authenticatedPage.locator('button:has-text("Add Phase")').click();
      // Look for "From Library" option
      const libraryOption = authenticatedPage.locator('.selection-card:has-text("From Library"), .selection-card:has-text("Existing Phase")');
      if (await libraryOption.isVisible()) {
        await libraryOption.click();
      }
    }
    // Select phase from dropdown
    const phaseDropdown = authenticatedPage.locator('select[name*="phase"]');
    if (await phaseDropdown.isVisible()) {
      // Select a phase that hasn't been added yet
      await phaseDropdown.selectOption({ index: 1 });
      // Set dates
      const startDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await authenticatedPage.locator('input[name*="start"][type="date"]').fill(startDate);
      await authenticatedPage.locator('input[name*="end"][type="date"]').fill(endDate);
      // Submit
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/project-phases') && response.request().method() === 'POST'
      );
      await authenticatedPage.locator('button:has-text("Add"), button[type="submit"]').filter({
        hasNot: authenticatedPage.locator(':has-text("Cancel")')
      }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const newPhase = await response.json();
      testContext.createdIds.projectPhases.push(newPhase.id);
      // Verify phase appears
      await expect(authenticatedPage.locator(`text="${newPhase.name}"`)).toBeVisible({ timeout: 5000 });
    }
  });
  test('should handle validation errors gracefully', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Open phase manager
    const phaseContent = authenticatedPage.locator('.project-phase-manager');
    if (!await phaseContent.isVisible()) {
      await authenticatedPage.locator('h2:has-text("Phases")').click();
    }
    // Open Add Phase modal
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select custom phase
    await authenticatedPage.locator('.selection-card:has-text("Custom")').click();
    // Try to submit without required fields
    const submitButton = authenticatedPage.locator('button:has-text("Create"), button[type="submit"]').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    });
    await submitButton.click();
    // Should show validation errors
    const errors = authenticatedPage.locator('.error-message, .field-error, [role="alert"], input:invalid');
    await expect(errors.first()).toBeVisible();
    // Fill name only
    await authenticatedPage.locator('input[name*="name"]').fill('Test Phase');
    // Try invalid date range (end before start)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    await authenticatedPage.locator('input[name*="start"][type="date"]').fill(today.toISOString().split('T')[0]);
    await authenticatedPage.locator('input[name*="end"][type="date"]').fill(yesterday.toISOString().split('T')[0]);
    await submitButton.click();
    // Should show date validation error
    const dateError = authenticatedPage.locator('.error-message, [role="alert"], input[name*="end"]:invalid');
    await expect(dateError.first()).toBeVisible();
    // Cancel
    await authenticatedPage.locator('button:has-text("Cancel")').click();
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible();
  });
  test('should display phases chronologically', async ({ 
    authenticatedPage,
    apiContext 
  }) => {
    // Create phases in non-chronological order
    const phasesData = [
      {
        name: `${testContext.prefix}-Late-Phase`,
        start_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      {
        name: `${testContext.prefix}-Early-Phase`,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      {
        name: `${testContext.prefix}-Middle-Phase`,
        start_date: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    ];
    for (const data of phasesData) {
      const response = await apiContext.post('/api/project-phases', { 
        data: { ...data, project_id: testProject.id, color: '#FF6B6B', order_index: 0 }
      });
      const phase = await response.json();
      testContext.createdIds.projectPhases.push(phase.id);
    }
    // Reload page
    await authenticatedPage.reload();
    // Open phase manager
    const phaseContent = authenticatedPage.locator('.project-phase-manager');
    if (!await phaseContent.isVisible()) {
      await authenticatedPage.locator('h2:has-text("Phases")').click();
    }
    // Verify phases are in chronological order
    const tableRows = authenticatedPage.locator('tbody tr');
    await expect(tableRows.nth(0)).toContainText('Early-Phase');
    await expect(tableRows.nth(1)).toContainText('Middle-Phase');
    await expect(tableRows.nth(2)).toContainText('Late-Phase');
  });
});