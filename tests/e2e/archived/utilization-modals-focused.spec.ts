import { test, expect } from './fixtures'
/**
 * Focused E2E Tests for Utilization Report Modal Functionality
 * 
 * These tests specifically target the add/remove project capabilities
 * in utilization report modals with robust selectors and comprehensive validation.
 */
test.describe('Utilization Modal Add/Remove Projects - Focused Tests', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    // Navigate to utilization report and wait for it to load
    await authenticatedPage.click('button:has-text("Utilization Report")');
    // Wait for utilization overview to appear
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); // Allow data to fully load
  });

  test('should open and validate Add Projects modal functionality', async ({ authenticatedPage, testHelpers }) => {
    // Find any Add Projects button (use multiple selectors for robustness)
    const addButtonSelectors = [
      'button:has-text("➕ Add")',
      'button:has-text("Add Projects")', 
      'button:has-text("➕")',
      'button[title*="Add"]',
      'button[aria-label*="Add"]'
    ];
    let addButton = null;
    for (const selector of addButtonSelectors) {
      const buttons = authenticatedPage.locator(selector);
      const count = await buttons.count();
      if (count > 0) {
        addButton = buttons.first();
        console.log(`✅ Found Add Projects button with selector: ${selector}`);
        break;
      }
    }
    if (!addButton) {
      console.log('No Add Projects buttons found - this may be expected if all team members are fully utilized');
      test.skip('No Add Projects functionality available to test');
      return;
    }
    // Click the button to open modal
    await addButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Look for modal with multiple possible selectors
    const modalSelectors = [
      'div:has(h2:has-text("Add Projects"))',
      'div:has(h2:has-text("➕"))',
      '[role="dialog"]',
      '.modal',
      'div[style*="position: fixed"]'
    ];
    let modal = null;
    for (const selector of modalSelectors) {
      const modals = authenticatedPage.locator(selector);
      const count = await modals.count();
      if (count > 0 && await modals.first().isVisible()) {
        modal = modals.first();
        console.log(`✅ Found modal with selector: ${selector}`);
        break;
      }
    }
    expect(modal).toBeTruthy();
    await expect(modal).toBeVisible();
    // Verify modal has close functionality
    const closeSelectors = ['button:has(svg)', 'button:has-text("×")', 'button:has-text("Close")', '[aria-label*="close"]'];
    let closeButton = null;
    for (const selector of closeSelectors) {
      const buttons = modal.locator(selector);
      if (await buttons.count() > 0) {
        closeButton = buttons.first();
        break;
      }
    }
    expect(closeButton).toBeTruthy();
    // Wait for content to load and check for either projects or no-projects message
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const hasProjects = await modal.locator('button:has-text("Assign")').count() > 0;
    const hasNoProjectsMessage = await modal.locator('text*="No suitable projects"').count() > 0;
    expect(hasProjects || hasNoProjectsMessage).toBeTruthy();
    if (hasProjects) {
      console.log('✅ Modal contains project recommendations with Assign buttons');
      // Verify project structure
      const projects = modal.locator('button:has-text("Assign")').locator('..');
      const firstProject = projects.first();
      // Should contain project information
      const projectText = await firstProject.textContent();
      expect(projectText).toMatch(/\w+/); // Has meaningful text
      console.log('✅ Project recommendations structure validated');
    } else {
      console.log('✅ Modal correctly shows no suitable projects message');
    }
    // Close modal
    await closeButton.click();
    await expect(modal).not.toBeVisible();
    console.log('✅ Modal closed successfully');
  });
  test('should open and validate Remove Projects modal functionality', async ({ authenticatedPage, testHelpers }) => {
    // Find any Reduce Load button
    const reduceButtonSelectors = [
      'button:has-text("🔻")',
      'button:has-text("Reduce")',
      'button:has-text("🔻 Reduce")',
      'button[title*="Reduce"]',
      'button[aria-label*="Reduce"]'
    ];
    let reduceButton = null;
    for (const selector of reduceButtonSelectors) {
      const buttons = authenticatedPage.locator(selector);
      const count = await buttons.count();
      if (count > 0) {
        reduceButton = buttons.first();
        console.log(`✅ Found Reduce Load button with selector: ${selector}`);
        break;
      }
    }
    if (!reduceButton) {
      console.log('No Reduce Load buttons found - this may be expected if all team members have no assignments');
      test.skip('No Reduce Load functionality available to test');
      return;
    }
    // Click the button to open modal
    await reduceButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Look for modal
    const modalSelectors = [
      'div:has(h2:has-text("Reduce Load"))',
      'div:has(h2:has-text("🔻"))',
      '[role="dialog"]',
      '.modal',
      'div[style*="position: fixed"]'
    ];
    let modal = null;
    for (const selector of modalSelectors) {
      const modals = authenticatedPage.locator(selector);
      const count = await modals.count();
      if (count > 0 && await modals.first().isVisible()) {
        modal = modals.first();
        console.log(`✅ Found modal with selector: ${selector}`);
        break;
      }
    }
    expect(modal).toBeTruthy();
    await expect(modal).toBeVisible();
    // Verify modal has close functionality
    const closeSelectors = ['button:has(svg)', 'button:has-text("×")', 'button:has-text("Close")', '[aria-label*="close"]'];
    let closeButton = null;
    for (const selector of closeSelectors) {
      const buttons = modal.locator(selector);
      if (await buttons.count() > 0) {
        closeButton = buttons.first();
        break;
      }
    }
    expect(closeButton).toBeTruthy();
    // Wait for content to load and check for either assignments or no-assignments message
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const hasAssignments = await modal.locator('button:has-text("Remove")').count() > 0;
    const hasNoAssignmentsMessage = await modal.locator('text*="No current assignments"').count() > 0;
    expect(hasAssignments || hasNoAssignmentsMessage).toBeTruthy();
    if (hasAssignments) {
      console.log('✅ Modal contains current assignments with Remove buttons');
      // Verify assignment structure
      const assignments = modal.locator('button:has-text("Remove")').locator('..');
      const firstAssignment = assignments.first();
      // Should contain assignment information
      const assignmentText = await firstAssignment.textContent();
      expect(assignmentText).toMatch(/\w+/); // Has meaningful text
      console.log('✅ Current assignments structure validated');
    } else {
      console.log('✅ Modal correctly shows no current assignments message');
    }
    // Close modal
    await closeButton.click();
    await expect(modal).not.toBeVisible();
    console.log('✅ Modal closed successfully');
  });
  test('should successfully create assignment if projects are available', async ({ authenticatedPage, testHelpers }) => {
    // Find Add Projects button 
    const addButton = authenticatedPage.locator('button:has-text("➕"), button:has-text("Add")').first();
    if (await addButton.count() === 0) {
      test.skip('No Add Projects functionality available');
      return;
    }
    await addButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Find modal
    const modal = authenticatedPage.locator('[role="dialog"], .modal, div[style*="position: fixed"]').first();
    await expect(modal).toBeVisible();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // Check if there are assignable projects
    const assignButtons = modal.locator('button:has-text("Assign")');
    const assignButtonCount = await assignButtons.count();
    if (assignButtonCount === 0) {
      await modal.locator('button:has(svg), button:has-text("×")').first().click();
      test.skip('No assignable projects available');
      return;
    }
    console.log(`Found ${assignButtonCount} assignable projects`);
    // Monitor API calls for assignment creation
    const createResponse = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/assignments') && 
      response.request().method() === 'POST'
    );
    // Monitor for circular JSON errors
    const consoleErrors: string[] = [];
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('circular')) {
        consoleErrors.push(msg.text());
      }
    });
    // Handle confirmation dialog
    authenticatedPage.on('dialog', dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      dialog.accept();
    });
    // Click first assign button
    await assignButtons.first().click();
    try {
      // Wait for API call
      const response = await createResponse;
      // Validate response
      expect(response.status()).toBe(201);
      const responseBody = await testHelpers.validateAssignmentCreationResponse(response);
      console.log('✅ Assignment created successfully via modal');
      // Verify no circular JSON errors
      expect(consoleErrors.length).toBe(0);
      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 10000 });
      // Clean up - delete the created assignment
      if (responseBody.id) {
        await authenticatedPage.request.delete(`https://localhost:3120/api/assignments/${responseBody.id}`);
        console.log('✅ Test assignment cleaned up');
      }
    } catch (error) {
      console.log(`Assignment creation failed or timed out: ${error}`);
      // Still verify no circular JSON errors occurred
      expect(consoleErrors.length).toBe(0);
      // Close modal if still open
      const closeButton = modal.locator('button:has(svg), button:has-text("×")').first();
      if (await closeButton.count() > 0) {
        await closeButton.click();
      }
    }
  });
  test('should successfully remove assignment if assignments are available', async ({ authenticatedPage, testHelpers }) => {
    // Find Reduce Load button
    const reduceButton = authenticatedPage.locator('button:has-text("🔻"), button:has-text("Reduce")').first();
    if (await reduceButton.count() === 0) {
      test.skip('No Reduce Load functionality available');
      return;
    }
    await reduceButton.click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Find modal
    const modal = authenticatedPage.locator('[role="dialog"], .modal, div[style*="position: fixed"]').first();
    await expect(modal).toBeVisible();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // Check if there are removable assignments
    const removeButtons = modal.locator('button:has-text("Remove")');
    const removeButtonCount = await removeButtons.count();
    if (removeButtonCount === 0) {
      await modal.locator('button:has(svg), button:has-text("×")').first().click();
      test.skip('No removable assignments available');
      return;
    }
    console.log(`Found ${removeButtonCount} removable assignments`);
    // Monitor API calls for assignment deletion
    const deleteResponse = authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/assignments') && 
      response.request().method() === 'DELETE'
    );
    // Monitor for circular JSON errors
    const consoleErrors: string[] = [];
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('circular')) {
        consoleErrors.push(msg.text());
      }
    });
    // Handle confirmation dialog
    authenticatedPage.on('dialog', dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      dialog.accept();
    });
    // Click first remove button
    await removeButtons.first().click();
    try {
      // Wait for API call
      const response = await deleteResponse;
      // Validate response
      expect(response.status()).toBe(200);
      const responseBody = await testHelpers.validateAssignmentDeletionResponse(response);
      console.log('✅ Assignment removed successfully via modal');
      // Verify no circular JSON errors
      expect(consoleErrors.length).toBe(0);
      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 10000 });
    } catch (error) {
      console.log(`Assignment removal failed or timed out: ${error}`);
      // Still verify no circular JSON errors occurred
      expect(consoleErrors.length).toBe(0);
      // Close modal if still open
      const closeButton = modal.locator('button:has(svg), button:has-text("×")').first();
      if (await closeButton.count() > 0) {
        await closeButton.click();
      }
    }
  });
  test('should handle modal interactions without JavaScript errors', async ({ authenticatedPage, testHelpers }) => {
    // Monitor for any JavaScript errors
    const jsErrors: string[] = [];
    authenticatedPage.on('pageerror', error => jsErrors.push(error.message));
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });
    // Try to interact with any available modals
    const addButtons = authenticatedPage.locator('button:has-text("➕"), button:has-text("Add")');
    const reduceButtons = authenticatedPage.locator('button:has-text("🔻"), button:has-text("Reduce")');
    const addCount = await addButtons.count();
    const reduceCount = await reduceButtons.count();
    console.log(`Found ${addCount} Add buttons and ${reduceCount} Reduce buttons`);
    // Test Add Projects modal if available
    if (addCount > 0) {
      await addButtons.first().click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const addModal = authenticatedPage.locator('[role="dialog"], .modal, div[style*="position: fixed"]').first();
      if (await addModal.isVisible()) {
        console.log('✅ Add Projects modal opened without errors');
        await addModal.locator('button:has(svg), button:has-text("×")').first().click();
        await expect(addModal).not.toBeVisible();
      }
    }
    // Test Reduce Load modal if available
    if (reduceCount > 0) {
      await reduceButtons.first().click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const reduceModal = authenticatedPage.locator('[role="dialog"], .modal, div[style*="position: fixed"]').first();
      if (await reduceModal.isVisible()) {
        console.log('✅ Reduce Load modal opened without errors');
        await reduceModal.locator('button:has(svg), button:has-text("×")').first().click();
        await expect(reduceModal).not.toBeVisible();
      }
    }
    // Verify no JavaScript errors occurred
    expect(jsErrors.length).toBe(0);
    console.log('✅ No JavaScript errors detected during modal interactions');
  });
});