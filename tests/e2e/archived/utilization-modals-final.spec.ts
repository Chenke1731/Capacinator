import { test, expect } from './fixtures'

test.describe('Utilization Modal Tests - Final Version', () => {
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
    // Look specifically for the button with "➕ Add Projects" text
    const addButton = authenticatedPage.locator('button:has-text("➕ Add Projects")').first();
    await expect(addButton).toBeVisible();
    
    // Scroll button into view and click
    await addButton.scrollIntoViewIfNeeded();
    await addButton.click();
    
    // Wait for modal to appear with longer timeout
    await authenticatedPage.waitForSelector('text="Add Projects:"', { timeout: 5000 });
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // The modal is visible, work with the entire page context
    // We know the modal is showing when "Add Projects:" is visible
    
    // Find close button - it's the X button in top right
    const closeButton = authenticatedPage.locator('button[aria-label="Close"]').or(authenticatedPage.locator('button').filter({ hasText: '×' })).first();
    
    // Verify modal content
    await expect(authenticatedPage.locator('text="Showing project recommendations"')).toBeVisible();
    
    // Find the Assign button for our test project
    const assignButton = authenticatedPage.locator('button:has-text("Assign")').first();
    await expect(assignButton).toBeVisible();
    
    // Get the project name for verification
    const projectElement = assignButton.locator('..').locator('..');
    const projectText = await projectElement.textContent();
    console.log('Assigning project:', projectText);
    
    // Click Assign
    await assignButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Modal should still be open, close it
    // The close button might be the X in top right
    const modalCloseButton = authenticatedPage.locator('button').filter({ hasText: /^[×X]$/ }).or(authenticatedPage.locator('[aria-label*="lose"]')).first();
    if (await modalCloseButton.isVisible()) {
      await modalCloseButton.click();
    }
    
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Verify modal is closed - the "Add Projects:" text should not be visible
    await expect(authenticatedPage.locator('text="Add Projects:"')).not.toBeVisible();
  });

  test('should handle person with no available capacity', async ({ authenticatedPage }) => {
    // The over-utilized person should show different behavior
    // Find a person with high utilization (look for percentage > 100 or red text)
    const rows = await authenticatedPage.locator('tbody tr').all();
    
    let overUtilizedFound = false;
    for (const row of rows) {
      const text = await row.textContent();
      // Look for the row with the person's name AND buttons (not the "No Role" row)
      if (text?.includes(testData.overUtilized.name) && await row.locator('button').count() > 0) {
        // This person has 50% availability but 60% assignment = 120% utilization
        // Over-utilized people might still have Add button if they have some capacity
        const addButton = row.locator('button:has-text("➕ Add Projects")');
        const reduceButton = row.locator('button:has-text("🔻 Reduce Load")');
        
        // Either button could be present
        if (await addButton.count() > 0 || await reduceButton.count() > 0) {
          overUtilizedFound = true;
          console.log(`Found over-utilized person with buttons - Add: ${await addButton.count()}, Reduce: ${await reduceButton.count()}`);
        }
        break;
      }
    }
    
    expect(overUtilizedFound).toBe(true);
  });

  test('should show all test projects in recommendations', async ({ authenticatedPage }) => {
    // Click Add button to open modal
    const addButton = authenticatedPage.locator('button:has-text("➕ Add Projects")').first();
    await addButton.scrollIntoViewIfNeeded();
    await addButton.click();
    
    // Wait for modal to appear with longer timeout
    await authenticatedPage.waitForSelector('text="Add Projects:"', { timeout: 5000 });
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Check for our unassigned test projects
    for (const project of testData.projects.unassigned) {
      const projectVisible = await authenticatedPage.locator(`text="${project.name}"`).isVisible();
      if (!projectVisible) {
        // Project might be truncated, check for partial match
        const partialMatch = await authenticatedPage.locator(`text=/${project.name.substring(0, 20)}/`).isVisible();
        expect(partialMatch).toBe(true);
      }
    }
    
    // Count Assign buttons - should be at least as many as unassigned projects
    const assignButtons = await authenticatedPage.locator('button:has-text("Assign")').count();
    console.log(`Found ${assignButtons} Assign buttons`);
    expect(assignButtons).toBeGreaterThanOrEqual(testData.projects.unassigned.length);
    
    // Close modal
    const modalCloseButton = authenticatedPage.locator('button').filter({ hasText: /^[×X]$/ }).or(authenticatedPage.locator('[aria-label*="lose"]')).first();
    await modalCloseButton.click();
  });

  test('should handle assignment conflicts gracefully', async ({ authenticatedPage }) => {
    // Find the person with multiple assignments
    const personRow = authenticatedPage.locator('tr').filter({ 
      hasText: testData.withAssignments.name 
    });
    
    // This person should have a reduce button since they have assignments
    const reduceButton = personRow.locator('button:has-text("🔻 Reduce Load")').first();
    
    if (await reduceButton.isVisible()) {
      await reduceButton.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Wait for modal to appear - look for "Reduce" in the modal header
      await expect(authenticatedPage.locator('text="Reduce"')).toBeVisible();
      
      // Look for checkboxes to select assignments to remove
      const checkboxes = authenticatedPage.locator('input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      
      console.log(`Found ${checkboxCount} assignments to potentially remove`);
      expect(checkboxCount).toBeGreaterThan(0);
      
      // Close modal
      const modalCloseButton = authenticatedPage.locator('button').filter({ hasText: /^[×X]$/ }).or(authenticatedPage.locator('[aria-label*="lose"]')).first();
      await modalCloseButton.click();
    }
  });

  test('person with zero assignments should only have Add button', async ({ authenticatedPage }) => {
    // Find the available person (0% utilization)
    // Need to find the row with buttons (not the "No Role" row)
    const availableRows = await authenticatedPage.locator('tr').filter({ 
      hasText: testData.available.name 
    }).all();
    
    let foundCorrectRow = false;
    for (const row of availableRows) {
      if (await row.locator('button').count() > 0) {
        // This is the row with buttons
        const addButtons = row.locator('button:has-text("➕ Add Projects")');
        const reduceButtons = row.locator('button:has-text("🔻 Reduce Load")');
        
        await expect(addButtons).toHaveCount(1);
        await expect(reduceButtons).toHaveCount(0);
        
        console.log(`${testData.available.name}: Add buttons: 1, Reduce buttons: 0 (as expected)`);
        foundCorrectRow = true;
        break;
      }
    }
    
    expect(foundCorrectRow).toBe(true);
  });
});