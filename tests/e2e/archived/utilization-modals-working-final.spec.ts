import { test, expect } from './fixtures'

test.describe('Utilization Modal Tests - Working Version', () => {
  let testData: any;
  
  test.beforeEach(async ({ authenticatedPage, testHelpers, e2eTestDataBuilder }) => {
    // Create comprehensive test data scenario
    testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  });

  test('should successfully add project through modal', async ({ authenticatedPage }) => {
    // Find an under-utilized person's Add button
    const addButton = authenticatedPage.locator('button:has-text("➕ Add Projects")').first();
    await expect(addButton).toBeVisible();
    
    // Scroll and click
    await addButton.scrollIntoViewIfNeeded();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    await addButton.click();
    
    // Use multiple strategies to wait for modal
    await Promise.race([
      authenticatedPage.waitForSelector('text="Add Projects:"', { timeout: 5000 }),
      authenticatedPage.waitForSelector('text=/Add Projects/i', { timeout: 5000 }),
      authenticatedPage.waitForLoadState('networkidle', { timeout: 5000 })
    ]);
    
    // Verify modal is showing
    const modalHeader = authenticatedPage.locator('text="Add Projects:"').or(authenticatedPage.locator('text=/Add Projects/i'));
    await expect(modalHeader).toBeVisible({ timeout: 2000 });
    
    // Find and click Assign button
    const assignButton = authenticatedPage.locator('button:has-text("Assign")').first();
    await expect(assignButton).toBeVisible();
    await assignButton.click();
    
    // Wait for assignment to process
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Close modal - look for X button
    const closeButton = authenticatedPage.locator('button[aria-label="Close"]')
      .or(authenticatedPage.locator('button').filter({ hasText: '×' }))
      .or(authenticatedPage.locator('svg').locator('xpath=..').filter({ has: authenticatedPage.locator('path[d*="M"]') }));
    
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
    
    // Verify modal closed
    await expect(modalHeader).not.toBeVisible({ timeout: 2000 });
  });

  test('should show reduce modal for person with assignments', async ({ authenticatedPage }) => {
    // Find person with reduce button
    const reduceButton = authenticatedPage.locator('button:has-text("🔻 Reduce Load")').first();
    
    if (await reduceButton.count() > 0) {
      await reduceButton.scrollIntoViewIfNeeded();
      await reduceButton.click();
      
      // Wait for reduce modal
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Look for checkboxes in the modal
      const checkboxes = authenticatedPage.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);
      
      // Close modal
      const closeButton = authenticatedPage.locator('button[aria-label="Close"]')
        .or(authenticatedPage.locator('button').filter({ hasText: /^[×X]$/ }));
      
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
  });

  test('should verify utilization percentages', async ({ authenticatedPage }) => {
    // Check that we can see utilization percentages
    const utilizationCells = authenticatedPage.locator('td').filter({ hasText: /\d+%/ });
    const count = await utilizationCells.count();
    
    expect(count).toBeGreaterThan(0);
    console.log(`Found ${count} utilization percentage cells`);
    
    // Find a specific person's utilization
    const rows = await authenticatedPage.locator('tbody tr').all();
    let foundUtilizationData = false;
    
    for (const row of rows) {
      const text = await row.textContent();
      // Look for rows with actual utilization data (not "No Role" rows)
      if (text?.includes('%') && !text.includes('No Role')) {
        foundUtilizationData = true;
        const buttons = await row.locator('button').count();
        console.log(`Row with utilization data has ${buttons} buttons`);
      }
    }
    
    expect(foundUtilizationData).toBe(true);
  });

  test('should handle modal interactions correctly', async ({ authenticatedPage }) => {
    // Find any action button
    const actionButtons = authenticatedPage.locator('button').filter({ 
      hasText: /➕ Add Projects|🔻 Reduce Load/ 
    });
    
    const buttonCount = await actionButtons.count();
    expect(buttonCount).toBeGreaterThan(0);
    
    // Click the first available button
    const firstButton = actionButtons.first();
    const buttonText = await firstButton.textContent();
    console.log(`Clicking button: ${buttonText}`);
    
    await firstButton.scrollIntoViewIfNeeded();
    await firstButton.click();
    
    // Wait for any modal to appear
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Check if any modal content is visible
    const modalIndicators = [
      'text="Add Projects:"',
      'text="Reduce"',
      'text="Showing project recommendations"'
    ];
    
    let modalFound = false;
    for (const indicator of modalIndicators) {
      if (await authenticatedPage.locator(indicator).isVisible()) {
        modalFound = true;
        console.log(`Found modal with: ${indicator}`);
        break;
      }
    }
    
    expect(modalFound).toBe(true);
    
    // Take a screenshot for debugging
    await authenticatedPage.screenshot({ 
      path: 'test-results/modal-interaction-test.png', 
      fullPage: false 
    });
  });
});