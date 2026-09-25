/**
 * Add Phase Test Suite
 * Tests for creating blank custom phases and duplicating phases
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Add Phase Functionality', () => {
  let testContext: TestDataContext;
  let testProject: any;
  let existingPhases: any[];
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('addphase');
    // Create test project
    testProject = await testDataHelpers.createTestProject(testContext, {
      name: `${testContext.prefix}-Add-Phase-Project`
    });
    // Create existing phases for duplication tests
    existingPhases = [];
    // Create a standard phase
    const standardPhaseData = {
      project_id: testProject.id,
      name: `${testContext.prefix}-Standard-Phase`,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      color: '#FF6B6B',
      order_index: 0,
      is_custom_phase: false
    };
    const standardResponse = await apiContext.post('/api/project-phases', { data: standardPhaseData });
    const standardPhase = await standardResponse.json();
    if (standardPhase.id) {
      existingPhases.push(standardPhase);
      testContext.createdIds.projectPhases.push(standardPhase.id);
    }
    // Create a custom phase
    const customPhaseData = {
      project_id: testProject.id,
      name: `${testContext.prefix}-Custom-Phase`,
      description: 'This is a custom phase',
      start_date: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      color: '#4ECDC4',
      order_index: 1,
      is_custom_phase: true
    };
    const customResponse = await apiContext.post('/api/project-phases', { data: customPhaseData });
    const customPhase = await customResponse.json();
    if (customPhase.id) {
      existingPhases.push(customPhase);
      testContext.createdIds.projectPhases.push(customPhase.id);
    }
    // Navigate to test project detail
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.smoke} should create a blank custom phase`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Wait for phase manager to load
    const phaseManager = authenticatedPage.locator('.project-phase-manager, .phase-manager, [data-testid="phase-manager"]');
    await expect(phaseManager).toBeVisible();
    // Click Add Phase button
    const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase"), button[title*="Add"]');
    await expect(addPhaseButton).toBeEnabled();
    await addPhaseButton.click();
    // Modal should appear with phase type selection
    const modal = authenticatedPage.locator('[role="dialog"], .modal-overlay, .modal-content');
    await expect(modal).toBeVisible();
    await expect(authenticatedPage.locator('text=/What type|Choose phase|Select phase type/i')).toBeVisible();
    // Select blank custom phase option
    const customPhaseOption = authenticatedPage.locator('.selection-card:has-text("Blank Custom"), button:has-text("Custom Phase"), label:has-text("Create Custom")');
    await customPhaseOption.click();
    // Form fields should be visible
    await expect(authenticatedPage.locator('input[name*="name"]')).toBeVisible();
    await expect(authenticatedPage.locator('textarea[name*="description"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name*="start"][type="date"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name*="end"][type="date"]')).toBeVisible();
    // Fill out the form
    const phaseName = `${testContext.prefix}-Client-Review-Phase`;
    const phaseDescription = 'Phase for client feedback and review';
    const startDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await authenticatedPage.locator('input[name*="name"]').fill(phaseName);
    await authenticatedPage.locator('textarea[name*="description"]').fill(phaseDescription);
    await authenticatedPage.locator('input[name*="start"][type="date"]').fill(startDate);
    await authenticatedPage.locator('input[name*="end"][type="date"]').fill(endDate);
    // Submit the form
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await authenticatedPage.locator('button:has-text("Create"), button:has-text("Add Phase"), button[type="submit"]').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    // Track new phase
    const newPhase = await response.json();
    if (newPhase.id) {
      testContext.createdIds.projectPhases.push(newPhase.id);
    }
    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    // Verify the new phase appears
    const newPhaseElement = await testDataHelpers.findByTestData(
      '.phase-item, [data-testid*="phase"]',
      phaseName
    );
    await expect(newPhaseElement).toBeVisible();
  });
  test('should duplicate a standard phase', async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Open Add Phase modal
    const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase")');
    await addPhaseButton.click();
    // Select duplicate existing phase option
    const duplicateOption = authenticatedPage.locator('.selection-card:has-text("Duplicate"), button:has-text("Copy Existing")');
    await duplicateOption.click();
    // Source phase dropdown should be visible
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    await expect(sourceDropdown).toBeVisible();
    // Select our standard phase
    const options = await sourceDropdown.locator('option').all();
    for (let i = 0; i < options.length; i++) {
      const text = await options[i].textContent();
      if (text?.includes(existingPhases[0].name)) {
        await sourceDropdown.selectOption({ index: i });
        break;
      }
    }
    // Verify placement options are visible
    await expect(authenticatedPage.locator('text=Placement')).toBeVisible();
    // After option should be default
    const afterOption = authenticatedPage.locator('.selection-card-inline:has-text("After"), label:has-text("After")');
    await expect(afterOption).toBeVisible();
    // Verify name field has placeholder
    const nameInput = authenticatedPage.locator('input[name*="name"]');
    await expect(nameInput).toBeVisible();
    const placeholder = await nameInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/copy|duplicate/i);
    // Fill custom name
    const duplicateName = `${testContext.prefix}-Standard-Duplicate`;
    await nameInput.clear();
    await nameInput.fill(duplicateName);
    // Verify overlap adjustment checkbox is checked
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]').filter({ 
      hasText: /adjust|overlap|cascade/i 
    });
    if (await adjustCheckbox.count() > 0) {
      await expect(adjustCheckbox.first()).toBeChecked();
    }
    // Submit
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await authenticatedPage.locator('button:has-text("Duplicate"), button:has-text("Create")').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    // Track new phase
    const newPhase = await response.json();
    if (newPhase.id) {
      testContext.createdIds.projectPhases.push(newPhase.id);
    }
    // Wait for modal to close
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });
    // Verify the new phase appears
    const newPhaseElement = await testDataHelpers.findByTestData(
      '.phase-item, [data-testid*="phase"]',
      duplicateName
    );
    await expect(newPhaseElement).toBeVisible();
  });
  test('should duplicate a custom phase with custom dates', async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Open Add Phase modal
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select duplicate option
    await authenticatedPage.locator('.selection-card:has-text("Duplicate")').click();
    // Select our custom phase
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    const options = await sourceDropdown.locator('option').all();
    for (let i = 0; i < options.length; i++) {
      const text = await options[i].textContent();
      if (text?.includes(existingPhases[1].name)) { // Custom phase is at index 1
        await sourceDropdown.selectOption({ index: i });
        break;
      }
    }
    // Select custom dates placement
    const customDatesOption = authenticatedPage.locator('.selection-card-inline:has-text("Custom"), label:has-text("Specific dates")');
    await customDatesOption.click();
    // Date fields should appear
    const startDateInput = authenticatedPage.locator('input[name*="start"][type="date"]');
    const endDateInput = authenticatedPage.locator('input[name*="end"][type="date"]');
    await expect(startDateInput).toBeVisible();
    await expect(endDateInput).toBeVisible();
    // Fill custom dates
    const startDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 105 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await startDateInput.fill(startDate);
    await endDateInput.fill(endDate);
    // Fill custom name
    const duplicateName = `${testContext.prefix}-Custom-Duplicate`;
    await authenticatedPage.locator('input[name*="name"]').fill(duplicateName);
    // Uncheck overlap adjustment
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]').first();
    if (await adjustCheckbox.isChecked()) {
      await adjustCheckbox.uncheck();
    }
    // Submit
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await authenticatedPage.locator('button:has-text("Duplicate"), button:has-text("Create")').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    }).click();
    await responsePromise;
    // Wait for modal to close
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });
    // Verify both phases appear
    await expect(authenticatedPage.locator(`text="${existingPhases[1].name}"`)).toBeVisible();
    await expect(authenticatedPage.locator(`text="${duplicateName}"`)).toBeVisible();
  });
  test('should handle validation errors', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Click Add Phase button
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select blank custom phase
    await authenticatedPage.locator('.selection-card:has-text("Blank Custom"), .selection-card:has-text("Custom Phase")').click();
    // Try to submit without filling required fields
    const submitButton = authenticatedPage.locator('button:has-text("Create"), button[type="submit"]').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    });
    await submitButton.click();
    // Should see validation errors
    const errorMessage = authenticatedPage.locator('.error-message, .field-error, [role="alert"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/required|name/i);
    // Fill only phase name
    await authenticatedPage.locator('input[name*="name"]').fill('Test Phase');
    // Try to submit with invalid dates (end before start)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    await authenticatedPage.locator('input[name*="start"][type="date"]').fill(today.toISOString().split('T')[0]);
    await authenticatedPage.locator('input[name*="end"][type="date"]').fill(yesterday.toISOString().split('T')[0]);
    await submitButton.click();
    // Should see date validation error
    const dateError = authenticatedPage.locator('.error-message, [role="alert"]');
    await expect(dateError).toContainText(/date|end.*before.*start|invalid/i);
  });
  test('should handle phase type switching', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Click Add Phase button
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Start with duplicate phase
    const duplicateOption = authenticatedPage.locator('.selection-card:has-text("Duplicate")');
    await duplicateOption.click();
    await expect(authenticatedPage.locator('select[name*="source"]')).toBeVisible();
    // Switch to blank custom phase
    const customOption = authenticatedPage.locator('.selection-card:has-text("Blank Custom"), .selection-card:has-text("Custom Phase")');
    await customOption.click();
    await expect(authenticatedPage.locator('select[name*="source"]')).not.toBeVisible();
    await expect(authenticatedPage.locator('input[name*="name"]')).toBeVisible();
    await expect(authenticatedPage.locator('textarea[name*="description"]')).toBeVisible();
    // Switch back to duplicate
    await duplicateOption.click();
    await expect(authenticatedPage.locator('select[name*="source"]')).toBeVisible();
    await expect(authenticatedPage.locator('textarea[name*="description"]')).not.toBeVisible();
    // Cancel
    await authenticatedPage.locator('button:has-text("Cancel")').click();
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible();
  });
  test('should handle phase placement options correctly', async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Open Add Phase modal
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select duplicate
    await authenticatedPage.locator('.selection-card:has-text("Duplicate")').click();
    // Select source phase
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    await sourceDropdown.selectOption({ index: 1 });
    // Test "At project beginning" placement
    const beginningOption = authenticatedPage.locator('.selection-card-inline:has-text("beginning"), label:has-text("Start")');
    await beginningOption.click();
    // After phase dropdown should not be visible
    const afterDropdown = authenticatedPage.locator('select[name*="after"]');
    await expect(afterDropdown).not.toBeVisible();
    // Test "After" placement
    const afterOption = authenticatedPage.locator('.selection-card-inline:has-text("After")');
    await afterOption.click();
    // After phase dropdown should be visible
    await expect(afterDropdown).toBeVisible();
    // Test "Custom dates" placement
    const customOption = authenticatedPage.locator('.selection-card-inline:has-text("Custom")');
    await customOption.click();
    // Date inputs should be visible
    await expect(authenticatedPage.locator('input[name*="start"][type="date"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name*="end"][type="date"]')).toBeVisible();
    // After dropdown should not be visible
    await expect(afterDropdown).not.toBeVisible();
  });
});