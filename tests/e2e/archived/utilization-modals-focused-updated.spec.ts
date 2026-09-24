import { test, expect } from './fixtures'
/**
 * Focused E2E Tests for Utilization Report Modal Functionality
 * 
 * Updated to use E2ETestDataBuilder to ensure consistent test data
 * and eliminate conditional skips.
 */
test.describe('Utilization Modal Add/Remove Projects - Focused Tests', () => {
  let testData: any;
  
  test.beforeEach(async ({ authenticatedPage, testHelpers, e2eTestDataBuilder }) => {
    // Create comprehensive test data scenario
    testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    await authenticatedPage.click('button:has-text("Utilization Report")');
    
    // Wait for utilization overview to appear
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); // Allow data to fully load
  });

  test('should open and validate Add Projects modal functionality', async ({ authenticatedPage, testHelpers }) => {
    // We now have guaranteed under-utilized people from test data
    // Find the under-utilized person's row in the utilization table (which has the action buttons)
    // Look for a row that contains the person name AND has action buttons
    const underUtilizedRow = authenticatedPage.locator('tbody tr')
      .filter({ hasText: testData.underUtilized.name })
      .filter({ has: authenticatedPage.locator('button') })
      .first();
    await expect(underUtilizedRow).toBeVisible();
    
    // Find Add Projects button in that row
    const addButton = underUtilizedRow.locator('button:has-text("➕ Add"), button:has-text("Add Projects"), button:has-text("➕")').first();
    await expect(addButton).toBeVisible();
    
    // Click the button to open modal
    await addButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Look for modal - wait for it to appear as it may take time
    let modal = null;
    
    // First, wait for any modal overlay to appear
    try {
      await authenticatedPage.waitForSelector('[class*="modal"], [role="dialog"], .overlay', { 
        state: 'visible',
        timeout: 5000 
      });
    } catch {
      // If no modal found by class/role, try other selectors
    }
    
    // Now look for the specific modal
    const modalSelectors = [
      '[class*="modal"]:visible',
      '[role="dialog"]:visible',
      '.overlay:visible',
      'div[class*="modal"]:has-text("Add Projects")',
      'div[class*="dialog"]:has-text("Add Projects")'
    ];
    
    for (const selector of modalSelectors) {
      try {
        const element = authenticatedPage.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          modal = element;
          break;
        }
      } catch {
        // Try next selector
      }
    }
    
    // If no modal found, check if content appeared inline on the page
    if (!modal) {
      // Look for the add projects section that appeared after clicking the button
      const addProjectsSection = authenticatedPage.locator('text="Add Projects"').locator('..');
      if (await addProjectsSection.isVisible()) {
        modal = addProjectsSection;
      }
    }
    
    expect(modal).toBeTruthy();
    await expect(modal).toBeVisible();
    
    // Check modal/section content - we have guaranteed unassigned projects
    // The projects might be in a table or list
    await expect(authenticatedPage.locator(`text="${testData.projects.unassigned[0].name}"`)).toBeVisible({ timeout: 10000 });
    
    // Test selection
    const firstProject = modal.locator(`tr:has-text("${testData.projects.unassigned[0].name}")`);
    const checkbox = firstProject.locator('input[type="checkbox"]');
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    
    // Close modal
    const closeButton = modal.locator('button:has(svg), button:has-text("×")').first();
    await closeButton.click();
    await expect(modal).not.toBeVisible();
  });

  test('should open and validate Remove Load modal functionality', async ({ authenticatedPage, testHelpers }) => {
    // We now have guaranteed over-utilized people from test data
    // Find the over-utilized person's row in the utilization table (which has the action buttons)
    const overUtilizedRow = authenticatedPage.locator('tbody tr')
      .filter({ hasText: testData.overUtilized.name })
      .filter({ has: authenticatedPage.locator('button') })
      .first();
    await expect(overUtilizedRow).toBeVisible();
    
    // Find Reduce Load button in that row
    const reduceButton = overUtilizedRow.locator('button:has-text("⚡ Reduce"), button:has-text("Reduce Load"), button:has-text("⚡")').first();
    await expect(reduceButton).toBeVisible();
    
    // Click the button to open modal
    await reduceButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Look for modal
    const modalSelectors = [
      'div:has(h2:has-text("Reduce"))',
      'div:has(h2:has-text("⚡"))',
      'div:has(h2:has-text("Remove"))',
      '.modal, [role="dialog"]',
      'div[class*="modal"]'
    ];
    
    let modal = null;
    for (const selector of modalSelectors) {
      const element = authenticatedPage.locator(selector);
      if (await element.count() > 0 && await element.isVisible()) {
        modal = element.first();
        break;
      }
    }
    
    expect(modal).toBeTruthy();
    await expect(modal).toBeVisible();
    
    // Check modal content - we know this person has assignments
    // The person should have assignments to Project A and Project B
    await expect(modal.locator('text=/Project.*60%/')).toBeVisible();
    await expect(modal.locator('text=/Project.*50%/')).toBeVisible();
    
    // Test selection
    const firstAssignment = modal.locator('tr').filter({ hasText: '60%' }).first();
    const checkbox = firstAssignment.locator('input[type="checkbox"]');
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    
    // Close modal
    const closeButton = modal.locator('button:has(svg), button:has-text("×")').first();
    await closeButton.click();
    await expect(modal).not.toBeVisible();
  });

  test('should successfully add a project to under-utilized person', async ({ authenticatedPage, testHelpers }) => {
    // Find under-utilized person row
    const underUtilizedRow = authenticatedPage.locator(`tr:has-text("${testData.underUtilized.name}")`);
    const addButton = underUtilizedRow.locator('button:has-text("➕ Add"), button:has-text("Add Projects"), button:has-text("➕")').first();
    
    // Open modal
    await addButton.click();
    const modal = await testHelpers.waitForModal();
    
    // Select first unassigned project
    const projectRow = modal.locator(`tr:has-text("${testData.projects.unassigned[0].name}")`);
    const checkbox = projectRow.locator('input[type="checkbox"]');
    await checkbox.click();
    
    // Fill allocation
    const allocationInput = projectRow.locator('input[type="number"]');
    await allocationInput.fill('30');
    
    // Submit
    const submitButton = modal.locator('button').filter({ hasText: /Add|Assign|Submit/i }).last();
    await submitButton.click();
    
    // Verify modal closes
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    
    // Verify utilization updated (was 60%, now should be 90%)
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const utilizationCell = underUtilizedRow.locator('td').filter({ hasText: /\d+%/ });
    await expect(utilizationCell).toContainText('90%');
  });

  test('should successfully remove assignment from over-utilized person', async ({ authenticatedPage, testHelpers }) => {
    // Find over-utilized person row
    const overUtilizedRow = authenticatedPage.locator(`tr:has-text("${testData.overUtilized.name}")`);
    const reduceButton = overUtilizedRow.locator('button:has-text("⚡ Reduce"), button:has-text("Reduce Load"), button:has-text("⚡")').first();
    
    // Get initial utilization
    const utilizationCell = overUtilizedRow.locator('td').filter({ hasText: /\d+%/ });
    const initialUtilization = await utilizationCell.textContent();
    expect(initialUtilization).toContain('110%');
    
    // Open modal
    await reduceButton.click();
    const modal = await testHelpers.waitForModal();
    
    // Select the 50% assignment
    const assignmentRow = modal.locator('tr').filter({ hasText: '50%' });
    const checkbox = assignmentRow.locator('input[type="checkbox"]');
    await checkbox.click();
    
    // Submit
    const submitButton = modal.locator('button').filter({ hasText: /Remove|Delete|Submit/i }).last();
    await submitButton.click();
    
    // Verify modal closes
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    
    // Verify utilization updated (was 110%, now should be 60%)
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await expect(utilizationCell).toContainText('60%');
  });

  test('should handle keyboard navigation in modals', async ({ authenticatedPage, testHelpers }) => {
    // Find any action button
    const underUtilizedRow = authenticatedPage.locator(`tr:has-text("${testData.underUtilized.name}")`);
    const addButton = underUtilizedRow.locator('button:has-text("➕ Add"), button:has-text("Add Projects"), button:has-text("➕")').first();
    
    // Open modal
    await addButton.click();
    const modal = await testHelpers.waitForModal();
    
    // Test Tab navigation
    await authenticatedPage.keyboard.press('Tab');
    const firstCheckbox = modal.locator('input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeFocused();
    
    // Test space to check
    await authenticatedPage.keyboard.press('Space');
    await expect(firstCheckbox).toBeChecked();
    
    // Test Escape to close
    await authenticatedPage.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('should handle available person with no assignments', async ({ authenticatedPage, testHelpers }) => {
    // Find available person row (0% utilization)
    const availableRow = authenticatedPage.locator(`tr:has-text("${testData.available.name}")`);
    await expect(availableRow).toBeVisible();
    
    // Should have Add Projects button
    const addButton = availableRow.locator('button:has-text("➕ Add"), button:has-text("Add Projects"), button:has-text("➕")').first();
    await expect(addButton).toBeVisible();
    
    // Should NOT have Reduce Load button
    const reduceButton = availableRow.locator('button:has-text("⚡ Reduce"), button:has-text("Reduce Load"), button:has-text("⚡")');
    await expect(reduceButton).toHaveCount(0);
  });

  test('should handle person with multiple assignments', async ({ authenticatedPage, testHelpers }) => {
    // Find person with multiple assignments
    const multiAssignRow = authenticatedPage.locator(`tr:has-text("${testData.withAssignments.name}")`);
    await expect(multiAssignRow).toBeVisible();
    
    // Open reduce load modal
    const reduceButton = multiAssignRow.locator('button:has-text("⚡ Reduce"), button:has-text("Reduce Load"), button:has-text("⚡")').first();
    await reduceButton.click();
    
    const modal = await testHelpers.waitForModal();
    
    // Should show all 3 assignments
    const assignmentRows = modal.locator('tbody tr');
    await expect(assignmentRows).toHaveCount(3);
    
    // Select multiple assignments
    const checkboxes = modal.locator('input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    
    // Both should be checked
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
    
    // Close modal
    await authenticatedPage.keyboard.press('Escape');
  });

  test('should persist changes after page refresh', async ({ authenticatedPage, testHelpers }) => {
    // Make a change first
    const underUtilizedRow = authenticatedPage.locator(`tr:has-text("${testData.underUtilized.name}")`);
    const addButton = underUtilizedRow.locator('button:has-text("➕ Add"), button:has-text("Add Projects"), button:has-text("➕")').first();
    
    await addButton.click();
    const modal = await testHelpers.waitForModal();
    
    // Add a project
    const projectRow = modal.locator(`tr:has-text("${testData.projects.unassigned[0].name}")`);
    await projectRow.locator('input[type="checkbox"]').click();
    await projectRow.locator('input[type="number"]').fill('25');
    
    const submitButton = modal.locator('button').filter({ hasText: /Add|Assign|Submit/i }).last();
    await submitButton.click();
    
    await expect(modal).not.toBeVisible();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Refresh page
    await authenticatedPage.reload();
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    
    // Find the person again
    const refreshedRow = authenticatedPage.locator(`tr:has-text("${testData.underUtilized.name}")`);
    const utilizationCell = refreshedRow.locator('td').filter({ hasText: /\d+%/ });
    
    // Should show updated utilization (60% + 25% = 85%)
    await expect(utilizationCell).toContainText('85%');
  });
});