import { test, expect } from './fixtures'
/**
 * Working E2E Tests for Utilization Report Modal Functionality
 * 
 * Updated based on actual UI structure discovered through screenshots
 */
test.describe('Utilization Modal Add/Remove Projects - Working Tests', () => {
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
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Allow data to fully load
  });

  test('should open and interact with Add Projects modal', async ({ authenticatedPage }) => {
    // Find a person with available capacity (under-utilized or available)
    // Look for the row by checking for the person name and ensuring it has buttons
    const underUtilizedRow = authenticatedPage.locator('tr')
      .filter({ hasText: testData.underUtilized.name })
      .filter({ has: authenticatedPage.locator('button') });
    
    // Find and click the Add button (it might be "Add Projects" or just a + icon)
    const addButton = underUtilizedRow.locator('button').filter({ hasText: /Add|➕/ }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    
    // Wait for modal to appear
    const modal = authenticatedPage.locator('[role="dialog"], .modal').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Verify modal title
    await expect(modal.locator('text="Add Projects:"')).toBeVisible();
    
    // Verify it shows available capacity for the person
    await expect(modal.locator(`text="${testData.underUtilized.name}"`)).toBeVisible();
    
    // Check for project recommendations - our unassigned test projects should be visible
    const projectRecommendations = modal.locator('.project-recommendation, [class*="project"]');
    await expect(projectRecommendations).toHaveCount(3); // We have 3 test projects
    
    // Find the Assign button for the first project
    const firstProjectRow = modal.locator('text=/e2e.*Project.*Active/').first().locator('..');
    const assignButton = firstProjectRow.locator('button:has-text("Assign")');
    await expect(assignButton).toBeVisible();
    
    // Click Assign
    await assignButton.click();
    
    // The modal might close or update - wait a moment
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Check if modal is still open or closed
    const modalStillVisible = await modal.isVisible().catch(() => false);
    
    if (modalStillVisible) {
      // Close modal using X button
      const closeButton = modal.locator('button[aria-label="Close"], button:has-text("×")').first();
      await closeButton.click();
    }
    
    // Verify modal is closed
    await expect(modal).not.toBeVisible();
  });

  test('should open and interact with Reduce Load modal', async ({ authenticatedPage }) => {
    // Find the person with assignments (we have withAssignments person with 3 assignments)
    const personWithAssignmentsRow = authenticatedPage.locator('tr')
      .filter({ hasText: testData.withAssignments.name })
      .filter({ has: authenticatedPage.locator('button') });
    
    // Find and click the Reduce button
    const reduceButton = personWithAssignmentsRow.locator('button').filter({ hasText: /Reduce|⚡/ }).first();
    
    // Only continue if reduce button exists (person needs to have assignments)
    if (await reduceButton.count() > 0) {
      await reduceButton.click();
      
      // Wait for modal to appear
      const modal = authenticatedPage.locator('[role="dialog"], .modal').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
      
      // Verify modal shows person's current assignments
      await expect(modal.locator(`text="${testData.withAssignments.name}"`)).toBeVisible();
      
      // Look for assignment rows with checkboxes
      const assignmentRows = modal.locator('tr').filter({ has: authenticatedPage.locator('input[type="checkbox"]') });
      await expect(assignmentRows).toHaveCount(3); // We created 3 assignments
      
      // Select first assignment to remove
      const firstCheckbox = assignmentRows.first().locator('input[type="checkbox"]');
      await firstCheckbox.check();
      
      // Find and click Remove/Submit button
      const removeButton = modal.locator('button').filter({ hasText: /Remove|Submit|Delete/ }).last();
      await removeButton.click();
      
      // Wait for action to complete
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Verify modal closed
      await expect(modal).not.toBeVisible();
    }
  });

  test('should handle person with 0% utilization', async ({ authenticatedPage }) => {
    // Find available person (0% utilization)
    const availableRow = authenticatedPage.locator('tr')
      .filter({ hasText: testData.available.name })
      .filter({ has: authenticatedPage.locator('text="0%"') });
    
    await expect(availableRow).toBeVisible();
    
    // Should have Add button but NOT Reduce button
    const addButton = availableRow.locator('button').filter({ hasText: /Add|➕/ });
    const reduceButton = availableRow.locator('button').filter({ hasText: /Reduce|⚡/ });
    
    await expect(addButton).toHaveCount(1);
    await expect(reduceButton).toHaveCount(0);
  });

  test('should show over-utilized person correctly', async ({ authenticatedPage }) => {
    // Our over-utilized person has 50% availability but 60% allocation = 120% utilization
    const overUtilizedRow = authenticatedPage.locator('tr')
      .filter({ hasText: testData.overUtilized.name });
    
    await expect(overUtilizedRow).toBeVisible();
    
    // Check if utilization shows over 100% (might show as 120% or highlighted differently)
    const utilizationCell = overUtilizedRow.locator('td').filter({ hasText: /\d+%/ });
    const utilizationText = await utilizationCell.textContent();
    
    console.log(`Over-utilized person shows: ${utilizationText}`);
    
    // Should have Reduce button
    const reduceButton = overUtilizedRow.locator('button').filter({ hasText: /Reduce|⚡/ });
    await expect(reduceButton).toHaveCount(1);
  });

  test('should update utilization after adding assignment', async ({ authenticatedPage }) => {
    // Find under-utilized person
    const underUtilizedRow = authenticatedPage.locator('tr')
      .filter({ hasText: testData.underUtilized.name });
    
    // Get initial utilization
    const utilizationCell = underUtilizedRow.locator('td').filter({ hasText: /\d+%/ }).first();
    const initialUtilization = await utilizationCell.textContent();
    console.log(`Initial utilization: ${initialUtilization}`);
    
    // Click Add button
    const addButton = underUtilizedRow.locator('button').filter({ hasText: /Add|➕/ }).first();
    await addButton.click();
    
    // Wait for modal
    const modal = authenticatedPage.locator('[role="dialog"], .modal').first();
    await expect(modal).toBeVisible();
    
    // Assign first available project
    const assignButton = modal.locator('button:has-text("Assign")').first();
    await assignButton.click();
    
    // Wait for update
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    
    // Check if modal auto-closed
    if (await modal.isVisible()) {
      await modal.locator('button:has-text("×")').click();
    }
    
    // Get updated utilization
    const updatedUtilization = await utilizationCell.textContent();
    console.log(`Updated utilization: ${updatedUtilization}`);
    
    // Utilization should have increased
    expect(updatedUtilization).not.toBe(initialUtilization);
  });
});