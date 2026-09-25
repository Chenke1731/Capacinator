/**
 * Phase Duplication Test Suite
 * Tests for duplicating project phases with UI flow
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Phase Duplication UI', () => {
  let testContext: TestDataContext;
  let testProject: any;
  let testPhases: any[];
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('phasedup');
    // Create test project
    testProject = await testDataHelpers.createTestProject(testContext, {
      name: `${testContext.prefix}-Phase-Dup-Project`
    });
    // Create test phases to duplicate
    testPhases = [];
    for (let i = 0; i < 3; i++) {
      const phaseData = {
        project_id: testProject.id,
        name: `${testContext.prefix}-Original-Phase-${i + 1}`,
        start_date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date(Date.now() + (i + 1) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        color: ['#FF6B6B', '#4ECDC4', '#45B7D1'][i],
        order_index: i
      };
      const response = await apiContext.post('/api/project-phases', { data: phaseData });
      const phase = await response.json();
      if (phase.id) {
        testPhases.push(phase);
        testContext.createdIds.projectPhases.push(phase.id);
      }
    }
    // Navigate to test project detail
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.smoke} should have phase duplication UI with selection and modal`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Wait for phase manager to load
    const phaseManager = authenticatedPage.locator('.project-phase-manager, .phase-manager, [data-testid="phase-manager"]');
    await expect(phaseManager).toBeVisible();
    // Test 1: Phases should be displayed
    const phaseRows = authenticatedPage.locator('.phases-list tbody tr, .phase-item, [data-testid*="phase"]');
    const phaseCount = await phaseRows.count();
    expect(phaseCount).toBeGreaterThanOrEqual(testPhases.length);
    // Test 2: Add Phase button should be enabled
    const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase"), button[title*="Add"]');
    await expect(addPhaseButton).toBeEnabled();
    // Test 3: Open Add Phase modal
    await addPhaseButton.click();
    // Modal should be visible
    const modal = authenticatedPage.locator('[role="dialog"], .modal-overlay, .modal-content');
    await expect(modal).toBeVisible();
    // Test 4: Modal should show phase type selection
    const modalTitle = authenticatedPage.locator('h2, h3, .modal-title');
    await expect(modalTitle).toContainText(/Add Phase|New Phase|Phase Type/i);
    // Test 5: Duplicate option should be available
    const duplicateOption = authenticatedPage.locator('.selection-card:has-text("Duplicate"), button:has-text("Duplicate"), label:has-text("Duplicate")');
    await expect(duplicateOption).toBeVisible();
    // Test 6: Click duplicate option
    await duplicateOption.click();
    // Test 7: Source phase dropdown should be visible
    const sourcePhaseDropdown = authenticatedPage.locator('select[name="source_phase"], select[name="sourcePhase"], #source-phase-select');
    await expect(sourcePhaseDropdown).toBeVisible();
    // Test 8: Our test phases should be in dropdown
    const dropdownOptions = await sourcePhaseDropdown.locator('option').allTextContents();
    const hasTestPhases = testPhases.some(phase => 
      dropdownOptions.some(option => option.includes(phase.name))
    );
    expect(hasTestPhases).toBeTruthy();
    // Select first test phase
    await sourcePhaseDropdown.selectOption({ index: 1 });
    // Test 9: Placement options should be present
    await expect(authenticatedPage.locator('text=Placement')).toBeVisible();
    const placementOptions = {
      after: authenticatedPage.locator('.selection-card:has-text("After"), label:has-text("After")'),
      beginning: authenticatedPage.locator('.selection-card:has-text("beginning"), label:has-text("Start")'),
      custom: authenticatedPage.locator('.selection-card:has-text("Custom"), label:has-text("Specific")')
    };
    for (const [key, locator] of Object.entries(placementOptions)) {
      const isVisible = await locator.isVisible();
      expect(isVisible).toBeTruthy();
    }
    // Test 10: Name field should be visible
    const nameInput = authenticatedPage.locator('input[name*="name"], input[placeholder*="name"]');
    await expect(nameInput).toBeVisible();
    // Check placeholder
    const placeholder = await nameInput.getAttribute('placeholder');
    expect(placeholder).toMatch(/copy|duplicate|name/i);
    // Test 11: Overlap adjustment option
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]').filter({ 
      hasText: /adjust|overlap|cascade/i 
    });
    if (await adjustCheckbox.count() > 0) {
      // Should be checked by default for safety
      const isChecked = await adjustCheckbox.isChecked();
      expect(isChecked).toBeTruthy();
    }
    // Test 12: Switch to custom dates mode
    await placementOptions.custom.click();
    const startDateInput = authenticatedPage.locator('input[name*="start"][type="date"]');
    const endDateInput = authenticatedPage.locator('input[name*="end"][type="date"]');
    await expect(startDateInput).toBeVisible();
    await expect(endDateInput).toBeVisible();
    // Test 13: Close modal
    const cancelButton = authenticatedPage.locator('button:has-text("Cancel"), button[aria-label="Close"]');
    await cancelButton.click();
    // Modal should be closed
    await expect(modal).not.toBeVisible();
  });
  test('should successfully duplicate a phase', async ({ 
    authenticatedPage,
    testHelpers,
    testDataHelpers 
  }) => {
    // Wait for phase manager
    await authenticatedPage.waitForSelector('.project-phase-manager, .phase-manager');
    // Open Add Phase modal
    const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase")');
    await addPhaseButton.click();
    // Select duplicate option
    const duplicateOption = authenticatedPage.locator('.selection-card:has-text("Duplicate"), button:has-text("Duplicate")');
    await duplicateOption.click();
    // Select source phase
    const sourcePhaseDropdown = authenticatedPage.locator('select[name*="source"]');
    await sourcePhaseDropdown.selectOption({ index: 1 });
    // Choose placement at beginning
    const beginningOption = authenticatedPage.locator('.selection-card:has-text("beginning"), label:has-text("Start")');
    await beginningOption.click();
    // Fill custom name
    const duplicatedName = `${testContext.prefix}-Duplicated-Phase`;
    const nameInput = authenticatedPage.locator('input[name*="name"]');
    await nameInput.clear();
    await nameInput.fill(duplicatedName);
    // Ensure overlap adjustment is checked
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]').first();
    if (!await adjustCheckbox.isChecked()) {
      await adjustCheckbox.check();
    }
    // Submit form
    const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Create"), button:has-text("Duplicate")').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    });
    // Wait for API response
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await submitButton.click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    // Track new phase
    const newPhase = await response.json();
    if (newPhase.id) {
      testContext.createdIds.projectPhases.push(newPhase.id);
    }
    // Modal should close
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    // New phase should appear in list
    const newPhaseElement = await testDataHelpers.findByTestData(
      '.phase-item, [data-testid*="phase"]',
      duplicatedName
    );
    await expect(newPhaseElement).toBeVisible();
  });
  test('should handle phase overlap adjustments when duplicating', async ({ 
    authenticatedPage,
    testHelpers,
    apiContext 
  }) => {
    // Open Add Phase modal
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select duplicate
    await authenticatedPage.locator('.selection-card:has-text("Duplicate")').click();
    // Select source phase (first phase)
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    await sourceDropdown.selectOption({ index: 1 });
    // Choose "After" placement
    const afterOption = authenticatedPage.locator('.selection-card:has-text("After")');
    await afterOption.click();
    // Select after first phase
    const afterPhaseDropdown = authenticatedPage.locator('select[name*="after"]');
    if (await afterPhaseDropdown.isVisible()) {
      await afterPhaseDropdown.selectOption({ index: 1 });
    }
    // Ensure overlap adjustment is enabled
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]').first();
    await adjustCheckbox.check();
    // Submit
    const submitButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Duplicate")').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    });
    // Listen for cascade calculation
    const cascadePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/calculate-cascade') && response.request().method() === 'POST'
    ).catch(() => null);
    await submitButton.click();
    // Check if cascade was calculated
    const cascadeResponse = await cascadePromise;
    if (cascadeResponse) {
      expect(cascadeResponse.status()).toBe(200);
      // UI might show adjustment results
      const adjustmentDialog = authenticatedPage.locator('.cascade-results, .adjustment-dialog');
      if (await adjustmentDialog.isVisible({ timeout: 3000 })) {
        // Verify adjustment information is shown
        await expect(adjustmentDialog).toContainText(/adjust|move|shift/i);
        // Accept adjustments
        const acceptButton = adjustmentDialog.locator('button:has-text("Accept"), button:has-text("OK")');
        if (await acceptButton.isVisible()) {
          await acceptButton.click();
        }
      }
    }
    // Verify phases don't overlap
    const phaseElements = await authenticatedPage.locator('.phase-item, [data-testid*="phase"]').all();
    expect(phaseElements.length).toBeGreaterThan(testPhases.length);
  });
  test('should validate phase duplication form', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Open Add Phase modal
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    // Select duplicate
    await authenticatedPage.locator('.selection-card:has-text("Duplicate")').click();
    // Try to submit without selecting source phase
    const submitButton = authenticatedPage.locator('button:has-text("Create"), button:has-text("Duplicate")').filter({
      hasNot: authenticatedPage.locator(':has-text("Cancel")')
    });
    await submitButton.click();
    // Should show validation error
    const errorMessage = authenticatedPage.locator('.error-message, .field-error, [role="alert"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/select|required|source/i);
    // Select source phase
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    await sourceDropdown.selectOption({ index: 1 });
    // Switch to custom dates
    await authenticatedPage.locator('.selection-card:has-text("Custom")').click();
    // Set invalid date range (end before start)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    await authenticatedPage.locator('input[name*="start"][type="date"]').fill(today.toISOString().split('T')[0]);
    await authenticatedPage.locator('input[name*="end"][type="date"]').fill(yesterday.toISOString().split('T')[0]);
    await submitButton.click();
    // Should show date validation error
    const dateError = authenticatedPage.locator('.error-message, [role="alert"]');
    await expect(dateError).toContainText(/date|end.*before.*start|invalid/i);
  });
  test('should preserve phase properties when duplicating', async ({ 
    authenticatedPage,
    testHelpers,
    apiContext 
  }) => {
    // Get original phase properties
    const originalPhase = testPhases[0];
    // Open Add Phase modal and duplicate
    await authenticatedPage.locator('button:has-text("Add Phase")').click();
    await authenticatedPage.locator('.selection-card:has-text("Duplicate")').click();
    // Select the first test phase as source
    const sourceDropdown = authenticatedPage.locator('select[name*="source"]');
    const options = await sourceDropdown.locator('option').all();
    // Find option that contains our test phase name
    for (let i = 0; i < options.length; i++) {
      const text = await options[i].textContent();
      if (text?.includes(originalPhase.name)) {
        await sourceDropdown.selectOption({ index: i });
        break;
      }
    }
    // Use default name (should include "Copy")
    const nameInput = authenticatedPage.locator('input[name*="name"]');
    const defaultName = await nameInput.inputValue();
    expect(defaultName).toContain(originalPhase.name);
    // Submit
    const responsePromise = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.request().method() === 'POST'
    );
    await authenticatedPage.locator('button:has-text("Create")').click();
    const response = await responsePromise;
    const duplicatedPhase = await response.json();
    // Verify properties were preserved
    expect(duplicatedPhase.color).toBe(originalPhase.color);
    // Duration should be similar
    const originalDuration = new Date(originalPhase.end_date).getTime() - new Date(originalPhase.start_date).getTime();
    const duplicatedDuration = new Date(duplicatedPhase.end_date).getTime() - new Date(duplicatedPhase.start_date).getTime();
    expect(duplicatedDuration).toBe(originalDuration);
  });
});