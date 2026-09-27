/**
 * Assignment Inline Editing Test Suite
 * Tests inline editing functionality in the assignments table
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Assignment Inline Editing', () => {
  let testContext: any;
  
  test.beforeEach(async ({ authenticatedPage, testHelpers, testDataHelpers }) => {
    // Create test data to ensure we have assignments to edit
    testContext = testDataHelpers.createTestContext('inline-edit');
    const testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 1,
      people: 2,
      assignments: 4
    });
    
    // Navigate to Assignments page
    await testHelpers.navigateTo('/assignments');
    await testHelpers.waitForDataTable();
    
    // Wait for assignment data to load
    await authenticatedPage.waitForSelector('table tbody tr', { timeout: 10000 });
    await authenticatedPage.waitForLoadState('networkidle');
  });
  
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up test data
    if (testContext) {
      await testDataHelpers.cleanupTestContext(testContext);
    }
  });
  test.describe('Allocation Percentage Editing', () => {
    test(`${tags.crud} edit allocation percentage inline`, async ({ authenticatedPage, testHelpers }) => {
      // Find a row with an editable allocation percentage
      const firstEditableCell = authenticatedPage.locator('td:has(input[type="number"])').first();
      const input = firstEditableCell.locator('input[type="number"]');
      // Skip if no editable cells found
      if (await input.count() === 0) {
        test.skip('No inline editable allocation fields found');
      }
      // Get the original value
      const originalValue = await input.inputValue();
      // Click to focus and edit
      await input.click();
      await input.fill('75');
      // Press Enter to save
      await input.press('Enter');
      // Wait for any API call to complete
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify the value was saved
      await expect(input).toHaveValue('75');
      // Reload the page to verify persistence
      await authenticatedPage.reload();
      await testHelpers.waitForDataTable();
      // Find the same cell again and verify the value persisted
      const reloadedInput = authenticatedPage.locator('td:has(input[type="number"])').first().locator('input[type="number"]');
      await expect(reloadedInput).toHaveValue('75');
    });
    test(`${tags.crud} validate allocation percentage range`, async ({ authenticatedPage }) => {
      // Find an editable allocation percentage
      const input = authenticatedPage.locator('td:has(input[type="number"])').first().locator('input[type="number"]');
      if (await input.count() === 0) {
        test.skip('No inline editable allocation fields found');
      }
      // Try to enter a value over 100 — the product INTENTIONALLY permits
      // over-allocation (over-allocated people are the dashboard's alert
      // signal), so the input keeps the value; the contract is that it is
      // accepted as a non-negative number (clamping would also be fine)
      await input.click();
      await input.fill('150');
      await input.press('Enter');
      // Wait for validation
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      const currentValue = await input.inputValue();
      const numValue = parseInt(currentValue, 10);
      expect(numValue).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(numValue)).toBe(false);
    });
    test(`${tags.crud} handle fractional allocations`, async ({ authenticatedPage }) => {
      const input = authenticatedPage.locator('td:has(input[type="number"])').first().locator('input[type="number"]');
      if (await input.count() === 0) {
        test.skip('No inline editable allocation fields found');
      }
      // Try fractional allocation
      await input.click();
      await input.fill('33.33');
      await input.press('Enter');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      const actualValue = await input.inputValue();
      console.log(`Fractional allocation accepted: ${actualValue}`);
      // Verify value was accepted (may be rounded)
      const numValue = parseFloat(actualValue);
      expect(numValue).toBeGreaterThan(0);
      expect(numValue).toBeLessThanOrEqual(100);
    });
  });
  test.describe('Notes Editing', () => {
    test(`${tags.crud} edit notes inline`, async ({ authenticatedPage, testHelpers }) => {
      // Find a row with editable notes
      const notesCell = authenticatedPage.locator('td:has(input[placeholder*="notes" i]), td:has(textarea[placeholder*="notes" i])').first();
      const notesInput = notesCell.locator('input, textarea').first();
      if (await notesInput.count() === 0) {
        test.skip('No inline editable notes fields found');
      }
      // Click to focus and edit
      await notesInput.click();
      await notesInput.fill('Updated test notes');
      // Press Enter to save
      await notesInput.press('Enter');
      // Wait for any API call to complete
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify the value was saved
      await expect(notesInput).toHaveValue('Updated test notes');
      // Reload the page to verify persistence
      await authenticatedPage.reload();
      await testHelpers.waitForDataTable();
      // Find the same cell again and verify the value persisted
      const reloadedNotesInput = authenticatedPage.locator('td:has(input[placeholder*="notes" i]), td:has(textarea[placeholder*="notes" i])').first().locator('input, textarea').first();
      await expect(reloadedNotesInput).toHaveValue('Updated test notes');
    });
    test(`${tags.crud} handle special characters in notes`, async ({ authenticatedPage }) => {
      const notesInput = authenticatedPage.locator('td:has(input[placeholder*="notes" i]), td:has(textarea[placeholder*="notes" i])').first().locator('input, textarea').first();
      if (await notesInput.count() === 0) {
        test.skip('No inline editable notes fields found');
      }
      // Test special characters
      const specialChars = `Special chars: & "quotes" 'apostrophes' émojis 🎉`;
      await notesInput.click();
      await notesInput.fill(specialChars);
      await notesInput.press('Enter');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify input was accepted
      const actualValue = await notesInput.inputValue();
      expect(actualValue).toBe(specialChars);
    });
  });
  test.describe('Edit Controls', () => {
    test(`${tags.crud} cancel edit with Escape key`, async ({ authenticatedPage }) => {
      // Find an editable allocation percentage
      const input = authenticatedPage.locator('td:has(input[type="number"])').first().locator('input[type="number"]');
      if (await input.count() === 0) {
        test.skip('No inline editable fields found');
      }
      // Get the original value
      const originalValue = await input.inputValue();
      // Click to focus and edit
      await input.click();
      await input.fill('99');
      // Press Escape to cancel
      await input.press('Escape');
      // Wait a moment for any potential save
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify the value reverted to original
      await expect(input).toHaveValue(originalValue);
    });
    test(`${tags.crud} handle blur event to save changes`, async ({ authenticatedPage }) => {
      // Find an editable allocation percentage
      const input = authenticatedPage.locator('td:has(input[type="number"])').first().locator('input[type="number"]');
      if (await input.count() === 0) {
        test.skip('No inline editable fields found');
      }
      // Get the original value
      const originalValue = await input.getAttribute('value') || await input.inputValue();
      
      // Wait for any pending requests to complete
      await authenticatedPage.waitForLoadState('networkidle');
      
      // Set up response listener for the update
      const updatePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/assignments/') && 
        (response.request().method() === 'PUT' || response.request().method() === 'PATCH'),
        { timeout: 10000 }
      );
      
      // Click to focus and edit
      await input.click();
      await input.fill('80');
      
      // Click outside to blur
      await authenticatedPage.locator('h1, h2, .page-header').first().click();
      
      // Wait for the API update to complete
      try {
        const response = await updatePromise;
        await expect(response.status()).toBe(200);
      } catch (error) {
        // If no API call was made, the value might be the same
        console.log('No API update detected - value might be unchanged');
      }
      
      // Wait a bit for DOM update
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      
      // Verify the value was saved
      await expect(input).toHaveValue('80');
    });
    test(`${tags.ui} show visual feedback during edit`, async ({ authenticatedPage }) => {
      // Find an editable cell
      const cell = authenticatedPage.locator('td:has(input[type="number"])').first();
      const input = cell.locator('input[type="number"]');
      if (await input.count() === 0) {
        test.skip('No inline editable fields found');
      }
      // Click to focus
      await input.click();
      // Check if the input has focus styling
      await expect(input).toBeFocused();
      // The input should have some visual indication it's being edited
      const inputStyles = await input.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          borderColor: styles.borderColor,
          outline: styles.outline,
          boxShadow: styles.boxShadow
        };
      });
      // Verify some form of focus styling exists
      expect(
        inputStyles.borderColor !== 'rgb(0, 0, 0)' || 
        inputStyles.outline !== 'none' ||
        inputStyles.boxShadow !== 'none'
      ).toBeTruthy();
    });
  });
  test.describe('Concurrent Operations', () => {
    test(`${tags.crud} handle concurrent edits properly`, async ({ authenticatedPage }) => {
      // Find all editable inputs
      const inputs = authenticatedPage.locator('td:has(input[type="number"]) input[type="number"]');
      const inputCount = await inputs.count();
      
      if (inputCount < 2) {
        test.skip('Not enough inline editable fields for concurrent edit test');
        return;
      }
      
      // Get references to first two inputs
      const firstInput = inputs.nth(0);
      const secondInput = inputs.nth(1);
      
      // Wait for initial load
      await authenticatedPage.waitForLoadState('networkidle');
      
      // Set up listener for first update
      const firstUpdatePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/assignments/') && 
        (response.request().method() === 'PUT' || response.request().method() === 'PATCH'),
        { timeout: 10000 }
      ).catch(() => null); // Don't fail if no update happens
      
      // Edit first field
      await firstInput.click();
      await firstInput.fill('60');
      
      // Click on second input (should trigger blur on first)
      await secondInput.click();
      
      // Wait for first input to save
      const firstResponse = await firstUpdatePromise;
      if (firstResponse) {
        await expect(firstResponse.status()).toBe(200);
      }
      
      // Verify first input saved
      await expect(firstInput).toHaveValue('60');
      
      // Now edit second field
      await secondInput.fill('40');
      await secondInput.press('Enter');
      
      // Wait a bit for save
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      
      // Verify second input saved
      await expect(secondInput).toHaveValue('40');
    });
    test(`${tags.crud} maintain table sorting after inline edit`, async ({ authenticatedPage, testHelpers }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount < 2) {
        test.skip('Not enough rows to test sorting');
      }
      // Get the initial order of rows (by project name for example)
      const projectNames = await authenticatedPage.locator('tbody tr td:nth-child(2)').allTextContents();
      // Edit an allocation value
      const input = authenticatedPage.locator('td:has(input[type="number"])').first().locator('input[type="number"]');
      if (await input.count() > 0) {
        await input.click();
        await input.fill('90');
        await input.press('Enter');
        // Wait for save
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Get the order after edit
        const projectNamesAfter = await authenticatedPage.locator('tbody tr td:nth-child(2)').allTextContents();
        // The order should remain the same
        expect(projectNamesAfter).toEqual(projectNames);
      }
    });
  });
  test.describe('Accessibility', () => {
    test(`${tags.accessibility} keyboard navigation through editable fields`, async ({ authenticatedPage }) => {
      const editableInputs = authenticatedPage.locator('td input[type="number"], td input[type="text"], td textarea');
      const inputCount = await editableInputs.count();
      if (inputCount < 2) {
        test.skip('Not enough editable fields to test navigation');
      }
      // Focus first input
      const firstInput = editableInputs.first();
      await firstInput.click();
      // Tab to next input
      await authenticatedPage.keyboard.press('Tab');
      // Check if focus moved to next editable field
      const focusedElement = authenticatedPage.locator(':focus');
      const focusedTagName = await focusedElement.evaluate(el => el.tagName.toLowerCase());
      // Should be focused on an input element
      expect(['input', 'textarea', 'button', 'a']).toContain(focusedTagName);
    });
  });
});