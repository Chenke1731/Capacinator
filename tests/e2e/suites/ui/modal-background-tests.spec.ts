/**
 * Modal Background Tests
 * Ensures all modals have solid backgrounds and consistent styling
 */
import { test, expect } from '../../fixtures';

test.describe('Modal Background Consistency Tests', () => {
  // Helper function to check modal background
  async function checkModalBackground(page: any, modalSelector: string) {
    // Check overlay/backdrop
    const overlay = page.locator(`${modalSelector}, .modal-overlay, .modal-backdrop, [role="dialog"]`).first();
    
    // Wait for modal to be visible
    await expect(overlay).toBeVisible();
    
    // Check overlay background
    const overlayBg = await overlay.evaluate((el: HTMLElement) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        backdropFilter: computed.backdropFilter,
        opacity: computed.opacity
      };
    });
    
    // Verify overlay has solid background (not transparent)
    expect(overlayBg.backgroundColor).not.toBe('transparent');
    expect(overlayBg.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    
    // Check for sufficient opacity
    if (overlayBg.backgroundColor.includes('rgba')) {
      const alphaMatch = overlayBg.backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
      if (alphaMatch) {
        const alpha = parseFloat(alphaMatch[1]);
        expect(alpha).toBeGreaterThanOrEqual(0.5); // At least 50% opaque
      }
    }
    
    // Check modal content container
    const modalContent = overlay.locator('.modal-container, .modal-content, .modal-body, [role="dialog"] > div').first();
    if (await modalContent.count() > 0) {
      const contentBg = await modalContent.evaluate((el: HTMLElement) => {
        const computed = window.getComputedStyle(el);
        return computed.backgroundColor;
      });
      
      // Modal content should have solid background
      expect(contentBg).not.toBe('transparent');
      expect(contentBg).not.toBe('rgba(0, 0, 0, 0)');
      expect(contentBg).not.toContain('rgba(255, 255, 255, 0)');
    }
  }

  test.describe('Scenario Modals', () => {
    test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/scenarios');
      await testHelpers.waitForPageContent();
    });

    test('Create Scenario Modal - should have solid background', async ({ authenticatedPage }) => {
      // Open create scenario modal
      await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
      await checkModalBackground(authenticatedPage, '[role="dialog"]');
      
      // Close modal
      await authenticatedPage.keyboard.press('Escape');
    });

    test('Edit Scenario Modal - should have solid background', async ({ authenticatedPage }) => {
      // Wait for scenarios to load
      await authenticatedPage.waitForSelector('.hierarchy-row', { timeout: 10000 });
      
      // Click edit on first scenario
      const editButton = authenticatedPage.locator('.action-button.edit, button[title*="Edit"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await checkModalBackground(authenticatedPage, '[role="dialog"]');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });

    test('Scenario Comparison Modal - should have solid background', async ({ authenticatedPage }) => {
      // Look for compare button
      const compareButton = authenticatedPage.locator('button:has-text("Compare"), .action-button.compare').first();
      if (await compareButton.isVisible()) {
        await compareButton.click();
        await checkModalBackground(authenticatedPage, '.scenario-comparison-modal');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });

    test('Scenario Merge Modal - should have solid background', async ({ authenticatedPage }) => {
      // Look for merge button
      const mergeButton = authenticatedPage.locator('.action-button.merge:not(.disabled), button[title*="Merge"]:not([disabled])').first();
      if (await mergeButton.isVisible()) {
        await mergeButton.click();
        await checkModalBackground(authenticatedPage, '.merge-modal');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });
  });

  test.describe('Project Modals', () => {
    test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForPageContent();
    });

    test('Create Project Modal - should have solid background', async ({ authenticatedPage }) => {
      await authenticatedPage.click('button:has-text("New Project"), button:has-text("Create Project")');
      await checkModalBackground(authenticatedPage, '[role="dialog"]');
      
      // Close modal
      await authenticatedPage.keyboard.press('Escape');
    });

    test('Edit Project Modal - should have solid background', async ({ authenticatedPage }) => {
      // Wait for projects to load
      await authenticatedPage.waitForSelector('.project-item, .project-card, tr[data-project-id]', { timeout: 10000 });
      
      // Click on first project
      const projectItem = authenticatedPage.locator('.requirements-row').first();
      if (await projectItem.isVisible()) {
        await projectItem.click();
        
        // Look for edit button in toolbar or project details
        const editButton = authenticatedPage.locator('button:has-text("Edit"), button[title*="Edit"]').first();
        if (await editButton.isVisible()) {
          await editButton.click();
          await checkModalBackground(authenticatedPage, '[role="dialog"]');
          
          // Close modal
          await authenticatedPage.keyboard.press('Escape');
        }
      }
    });
  });

  test.describe('Assignment Modals', () => {
    test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/assignments');
      await testHelpers.waitForPageContent();
    });

    test('Create Assignment Modal - should have solid background', async ({ authenticatedPage }) => {
      const newButton = authenticatedPage.locator('button:has-text("New Assignment"), button:has-text("Create Assignment"), button:has-text("Add Assignment")').first();
      if (await newButton.isVisible()) {
        await newButton.click();
        await checkModalBackground(authenticatedPage, '[role="dialog"]');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });

    test('Smart Assignment Modal - should have solid background', async ({ authenticatedPage }) => {
      const smartButton = authenticatedPage.locator('button:has-text("Smart Assignment"), button:has-text("Auto-assign")').first();
      if (await smartButton.isVisible()) {
        await smartButton.click();
        await checkModalBackground(authenticatedPage, '.smart-assignment-modal');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });
  });

  test.describe('People Modals', () => {
    test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForPageContent();
    });

    test('Create Person Modal - should have solid background', async ({ authenticatedPage }) => {
      await authenticatedPage.click('button:has-text("Add Person"), button:has-text("New Person")');
      await checkModalBackground(authenticatedPage, '[role="dialog"]');
      
      // Close modal
      await authenticatedPage.keyboard.press('Escape');
    });

    test('Edit Person Modal - should have solid background', async ({ authenticatedPage }) => {
      // Wait for people to load
      await authenticatedPage.waitForSelector('.person-row, .person-card, tr[data-person-id]', { timeout: 10000 });
      
      // Click on first person
      const personItem = authenticatedPage.locator('tbody tr').first();
      if (await personItem.isVisible()) {
        await personItem.click();
        
        // Look for edit button
        const editButton = authenticatedPage.locator('button:has-text("Edit"), button[title*="Edit"]').first();
        if (await editButton.isVisible()) {
          await editButton.click();
          await checkModalBackground(authenticatedPage, '[role="dialog"]');
          
          // Close modal
          await authenticatedPage.keyboard.press('Escape');
        }
      }
    });
  });

  test.describe('Settings Modals', () => {
    test('Location Modal - should have solid background', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/locations');
      await testHelpers.waitForPageContent();
      
      const addButton = authenticatedPage.locator('button:has-text("Add Location"), button:has-text("New Location")').first();
      if (await addButton.isVisible()) {
        await addButton.click();
        await checkModalBackground(authenticatedPage, '[role="dialog"]');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });

    test('Role Modal - should have solid background', async ({ authenticatedPage, testHelpers }) => {
      // Navigate to a page that has role management
      await testHelpers.navigateTo('/settings');
      await testHelpers.waitForPageContent();
      
      // Look for role management section
      const roleButton = authenticatedPage.locator('button:has-text("Add Role"), button:has-text("Manage Roles")').first();
      if (await roleButton.isVisible()) {
        await roleButton.click();
        await checkModalBackground(authenticatedPage, '[role="dialog"]');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });
  });

  test.describe('Report Modals', () => {
    test('Export Modal - should have solid background', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/reports');
      await testHelpers.waitForPageContent();
      
      const exportButton = authenticatedPage.locator('button:has-text("Export"), button[title*="Export"]').first();
      if (await exportButton.isVisible()) {
        await exportButton.click();
        // Export opens a dropdown menu (csv/excel/json), not a dialog
        const dropdown = authenticatedPage.locator('.dropdown-menu');
        await expect(dropdown).toBeVisible({ timeout: 5000 });
        await expect(dropdown.locator('button:has-text("Export as Excel")')).toBeVisible();

        // Close dropdown
        await authenticatedPage.keyboard.press('Escape');
      }
    });
  });

  test.describe('Confirmation Dialogs', () => {
    test('Delete Confirmation - should have solid background', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/scenarios');
      await testHelpers.waitForPageContent();
      
      // Wait for scenarios to load
      await authenticatedPage.waitForSelector('.hierarchy-row', { timeout: 10000 });
      
      // Look for delete button
      const deleteButton = authenticatedPage.locator('.action-button.delete, button[title*="Delete"]').first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
        
        // Check confirmation dialog
        await checkModalBackground(authenticatedPage, '[role="alertdialog"], [role="dialog"]');
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    });
  });

  // Visual regression test for modal styling
  test('Modal Visual Consistency', async ({ authenticatedPage, testHelpers }) => {
    const modalsToCheck = [
      { route: '/scenarios', buttonText: 'New Scenario', modalName: 'scenario-create' },
      { route: '/projects', buttonText: 'New Project', modalName: 'project-create' },
      { route: '/people', buttonText: 'Add Person', modalName: 'person-create' }
    ];

    for (const modalTest of modalsToCheck) {
      await testHelpers.navigateTo(modalTest.route);
      await testHelpers.waitForPageContent();
      
      const button = authenticatedPage.locator(`button:has-text("${modalTest.buttonText}")`).first();
      if (await button.isVisible()) {
        await button.click();
        
        // Wait for modal
        await authenticatedPage.waitForSelector('[role="dialog"], .modal-overlay', { state: 'visible' });
        
        // Take screenshot for visual comparison
        await authenticatedPage.screenshot({ 
          path: `test-results/modal-backgrounds/${modalTest.modalName}.png`,
          fullPage: false 
        });
        
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    }
  });
});