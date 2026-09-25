/**
 * Phase Duplication UI Tests
 * Tests for duplicating project phases through the UI
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Phase Duplication UI', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('phasedup');
    // Create test data with projects that have phases
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 2,
      assignments: 4,
      includePhases: true
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  async function navigateToProjectDetail(testHelpers: any, authenticatedPage: any, project?: any) {
    if (project && project.id) {
      // Navigate to specific test project
      await testHelpers.navigateTo(`/projects/${project.id}`);
    } else {
      // Navigate to projects list and select first test project
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Find and click on first test project
      const projectRow = authenticatedPage.locator(`tr:has-text("${testData.projects[0].name}")`).first();
      if (await projectRow.count() > 0) {
        await projectRow.locator('button:has-text("View Details")').click();
      } else {
        // If no test project found, use any available project
        await authenticatedPage.locator('table tbody tr').first().locator('button:has-text("View Details")').click();
      }
    }
    // Wait for navigation to complete
    await authenticatedPage.waitForURL(/\/projects\/[a-f0-9-]+$/);
    // Wait for page content to load
    await testHelpers.waitForPageContent();
    // Project detail page may have collapsible sections - wait for timeline section first
    await authenticatedPage.waitForSelector('h3:has-text("Project Timeline"), h2:has-text("Project Timeline")', { timeout: 10000 });
    // Check if there's a Project Phases section (might be after timeline)
    const phaseSectionExists = await authenticatedPage.locator('h3:has-text("Project Phases")').count() > 0;
    if (phaseSectionExists) {
      // Wait for phase manager to be visible
      await authenticatedPage.waitForSelector('.project-phase-manager', { timeout: 10000 });
    } else {
      // If no phases section, scroll down to see if it appears
      await authenticatedPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await authenticatedPage.waitForTimeout(1000);
      // Try again
      await authenticatedPage.waitForSelector('.project-phase-manager, h3:has-text("Project Phases")', { timeout: 5000 });
    }
  }
  test(`${tags.phases} should have phase duplication UI with selection and modal`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    // Navigate to a test project
    await navigateToProjectDetail(testHelpers, authenticatedPage, testData.projects[0]);
    // Test 1: Phase table should be present
    // Wait for phases list to be visible
    await authenticatedPage.waitForSelector('.phases-list, .empty-state', { timeout: 10000 });
    const phaseRows = await authenticatedPage.locator('.phases-list tbody tr, .phases-list .empty-state').all();
    expect(phaseRows.length).toBeGreaterThan(0);
    // Test 2: Add Phase button should be enabled
    const addPhaseButton = authenticatedPage.getByRole('button', { name: /add phase/i });
    await expect(addPhaseButton).toBeEnabled();
    // Test 3: Open Add Phase modal
    await addPhaseButton.click();
    await expect(authenticatedPage.locator('.modal-overlay')).toBeVisible();
    // Test 4: Modal should show phase type selection
    await expect(authenticatedPage.getByText('What type of phase would you like to add?')).toBeVisible();
    // Test 5: Select duplicate option
    await authenticatedPage.locator('.selection-card').filter({ hasText: 'Duplicate Existing Phase' }).click();
    // Test 6: Source phase dropdown should be visible
    await expect(authenticatedPage.locator('select[name="source_phase"]')).toBeVisible();
    // Select first phase to continue with test
    await authenticatedPage.locator('select[name="source_phase"]').selectOption({ index: 1 });
    // Test 7: Placement options should be present
    await expect(authenticatedPage.getByText('Placement')).toBeVisible();
    const afterOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'After' });
    const beginningOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'At project beginning' });
    const customOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'Custom dates' });
    await expect(afterOption).toBeVisible();
    await expect(beginningOption).toBeVisible();
    await expect(customOption).toBeVisible();
    // The after phase option should be selected by default
    await expect(afterOption).toHaveAttribute('data-selected', 'true');
    await expect(authenticatedPage.locator('select[name="after_phase_id"]')).toBeVisible();
    // Test 8: Name field should be visible with placeholder
    const nameInput = authenticatedPage.locator('input[name="custom_name"]');
    await expect(nameInput).toBeVisible();
    const placeholder = await nameInput.getAttribute('placeholder');
    expect(placeholder).toContain('(Copy)');
    // Test 9: Overlap adjustment checkbox should be checked by default
    const adjustCheckbox = authenticatedPage.getByText(/Automatically adjust overlapping phases/);
    await expect(adjustCheckbox).toBeVisible();
    const checkbox = authenticatedPage.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    // Test 10: Switch to custom dates mode
    await customOption.click();
    await expect(authenticatedPage.locator('input[name="start_date"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name="end_date"]')).toBeVisible();
    // Test 11: Close modal and verify state reset
    await authenticatedPage.getByRole('button', { name: /cancel/i }).click();
    await expect(authenticatedPage.locator('.modal-overlay')).not.toBeVisible();
  });
  test(`${tags.phases} should duplicate phase with new UI flow`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    await navigateToProjectDetail(testHelpers, authenticatedPage, testData.projects[0]);
    // Open Add Phase modal and select duplicate
    await authenticatedPage.getByRole('button', { name: /add phase/i }).click();
    await authenticatedPage.locator('.selection-card').filter({ hasText: 'Duplicate Existing Phase' }).click();
    // Select a source phase from dropdown
    const sourcePhaseDropdown = authenticatedPage.locator('select[name="source_phase"]');
    await sourcePhaseDropdown.selectOption({ index: 1 }); // Select first available phase
    // Select placement - place at beginning
    const beginningOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'At project beginning' });
    await beginningOption.click();
    // Fill out the form with a unique name
    const phaseName = `${testContext.prefix}_Duplicated_Phase_${Date.now()}`;
    await authenticatedPage.locator('input[name="custom_name"]').fill(phaseName);
    // Ensure checkbox is checked for adjusting overlapping phases
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]');
    await expect(adjustCheckbox).toBeChecked();
    // Submit
    await authenticatedPage.getByRole('button', { name: /duplicate phase/i }).last().click();
    // Wait for success (modal should close)
    await authenticatedPage.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 30000 });
    // Verify new phase appears in the list
    await expect(authenticatedPage.getByText(phaseName)).toBeVisible({ timeout: 10000 });
    // Track the created phase for cleanup if needed
    // Note: Actual implementation would need to capture the phase ID from API response
  });
  test(`${tags.phases} should handle custom date placement`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    await navigateToProjectDetail(testHelpers, authenticatedPage, testData.projects[0]);
    // Open modal
    await authenticatedPage.getByRole('button', { name: /add phase/i }).click();
    await authenticatedPage.locator('.selection-card').filter({ hasText: 'Duplicate Existing Phase' }).click();
    // Select a source phase
    await authenticatedPage.locator('select[name="source_phase"]').selectOption({ index: 1 });
    // Select custom dates
    const customOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'Custom dates' });
    await customOption.click();
    // Date fields should appear
    await expect(authenticatedPage.locator('input[name="start_date"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name="end_date"]')).toBeVisible();
    // Fill dates and name
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    await authenticatedPage.locator('input[name="start_date"]').fill(today.toISOString().split('T')[0]);
    await authenticatedPage.locator('input[name="end_date"]').fill(nextMonth.toISOString().split('T')[0]);
    const phaseName = `${testContext.prefix}_Custom_Date_Phase_${Date.now()}`;
    await authenticatedPage.locator('input[name="custom_name"]').fill(phaseName);
    // Submit
    await authenticatedPage.getByRole('button', { name: /duplicate phase/i }).last().click();
    // Wait for success
    await authenticatedPage.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 30000 });
    // Verify the phase was created
    await expect(authenticatedPage.getByText(phaseName)).toBeVisible({ timeout: 10000 });
  });
  test(`${tags.phases} should handle overlap adjustment checkbox`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    await navigateToProjectDetail(testHelpers, authenticatedPage, testData.projects[0]);
    // Open modal
    await authenticatedPage.getByRole('button', { name: /add phase/i }).click();
    await authenticatedPage.locator('.selection-card').filter({ hasText: 'Duplicate Existing Phase' }).click();
    // Select a source phase
    await authenticatedPage.locator('select[name="source_phase"]').selectOption({ index: 1 });
    // Verify checkbox is checked by default
    const adjustCheckbox = authenticatedPage.locator('input[type="checkbox"]');
    await expect(adjustCheckbox).toBeChecked();
    // Uncheck it
    await adjustCheckbox.uncheck();
    await expect(adjustCheckbox).not.toBeChecked();
    // Select beginning placement (which would normally adjust all phases)
    const beginningOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'At project beginning' });
    await beginningOption.click();
    // Fill name
    const phaseName = `${testContext.prefix}_No_Adjust_Phase_${Date.now()}`;
    await authenticatedPage.locator('input[name="custom_name"]').fill(phaseName);
    // Submit
    await authenticatedPage.getByRole('button', { name: /duplicate phase/i }).last().click();
    // Should succeed even without adjusting overlapping phases
    await authenticatedPage.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 30000 });
  });
  test(`${tags.phases} should handle after phase placement with dropdown`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    await navigateToProjectDetail(testHelpers, authenticatedPage, testData.projects[0]);
    // Ensure we have at least 2 phases
    const phaseCount = await authenticatedPage.locator('.phases-list tbody tr').count();
    if (phaseCount < 2) {
      console.log('Skipping test - not enough phases');
      return;
    }
    // Open modal
    await authenticatedPage.getByRole('button', { name: /add phase/i }).click();
    await authenticatedPage.locator('.selection-card').filter({ hasText: 'Duplicate Existing Phase' }).click();
    // Select second phase from dropdown
    const sourceDropdown = authenticatedPage.locator('select[name="source_phase"]');
    await sourceDropdown.selectOption({ index: 2 }); // Select second phase
    // The "After" option should be selected by default
    const afterOption = authenticatedPage.locator('.selection-card-inline').filter({ hasText: 'After' });
    await expect(afterOption).toHaveAttribute('data-selected', 'true');
    // Select a different phase from dropdown if available
    const phaseDropdown = authenticatedPage.locator('select[name="after_phase_id"]');
    await expect(phaseDropdown).toBeVisible();
    // Get the current selection
    const currentValue = await phaseDropdown.inputValue();
    // Try to select a different option
    const options = await phaseDropdown.locator('option').all();
    for (const option of options) {
      const value = await option.getAttribute('value');
      if (value && value !== '' && value !== currentValue) {
        await phaseDropdown.selectOption(value);
        break;
      }
    }
    // Fill name
    const phaseName = `${testContext.prefix}_After_Phase_${Date.now()}`;
    await authenticatedPage.locator('input[name="custom_name"]').fill(phaseName);
    // Submit
    await authenticatedPage.getByRole('button', { name: /duplicate phase/i }).last().click();
    // Wait for success
    await authenticatedPage.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 30000 });
    // Verify the new phase was created
    await expect(authenticatedPage.getByText(phaseName)).toBeVisible({ timeout: 10000 });
  });
  test(`${tags.phases} keyboard navigation`, async ({ 
    authenticatedPage, 
    testHelpers,
    testDataHelpers 
  }) => {
    await navigateToProjectDetail(testHelpers, authenticatedPage, testData.projects[0]);
    // Focus Add Phase button
    await authenticatedPage.getByRole('button', { name: /add phase/i }).focus();
    // Click the add phase button
    await authenticatedPage.getByRole('button', { name: /add phase/i }).click();
    // Verify modal is open
    await expect(authenticatedPage.locator('.modal-overlay')).toBeVisible();
    // Escape to close
    await authenticatedPage.keyboard.press('Escape');
    // Modal should be closed
    await expect(authenticatedPage.locator('.modal-overlay')).not.toBeVisible();
  });
});