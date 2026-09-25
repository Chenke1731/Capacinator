/**
 * Settings User Permissions Table Tests
 * Tests for the user permissions table functionality in Settings page
 */
import { test, expect, tags, patterns } from '../../fixtures';
test.describe('Settings User Permissions Table', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    // Navigate to settings
    await testHelpers.navigateTo('/settings');
    // Click on User Permissions tab
    await authenticatedPage.locator('button:has-text("User Permissions")').click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Verify we're on the permissions tab
    await expect(authenticatedPage.locator('.settings-section h2, h2:has-text("User Permissions")')).toBeVisible();
  });
  test.describe('Permissions Table Display', () => {
    test(`${tags.smoke} should display user permissions table`, async ({ 
      authenticatedPage 
    }) => {
      // Look for permissions table or grid
      const table = authenticatedPage.locator('table').first();
      const permissionsGrid = authenticatedPage.locator('.permissions-grid, .permissions-table');
      const hasTable = await table.isVisible() || await permissionsGrid.isVisible();
      expect(hasTable).toBeTruthy();
      // If table exists, check headers
      if (await table.isVisible()) {
        // Expected headers for a permissions table
        const expectedHeaders = ['User', 'Role', 'Permissions', 'Status', 'Actions'];
        for (const header of expectedHeaders) {
          const headerElement = table.locator(`th:has-text("${header}")`);
          if (await headerElement.count() > 0) {
            await expect(headerElement.first()).toBeVisible();
          }
        }
      }
    });
    test('should display user data with roles', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();
        if (rowCount > 0) {
          // Check first row structure
          const firstRow = rows.first();
          const cells = firstRow.locator('td');
          // User name/email
          const userCell = cells.nth(0);
          const userName = await userCell.textContent();
          expect(userName?.trim()).toBeTruthy();
          // Role
          const roleCell = cells.nth(1);
          const roleName = await roleCell.textContent();
          expect(roleName).toMatch(/Admin|Manager|User|Viewer|Editor/i);
          // Status
          const statusCell = cells.nth(3);
          if (await statusCell.isVisible()) {
            const status = await statusCell.textContent();
            expect(status).toMatch(/Active|Inactive|Suspended|Enabled|Disabled/i);
          }
        }
      }
    });
    test('should display permission badges or checkboxes', async ({ 
      authenticatedPage 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const rows = table.locator('tbody tr');
        const rowCount = await rows.count();
        if (rowCount > 0) {
          const firstRow = rows.first();
          // Look for permission indicators
          const badges = firstRow.locator('.badge, .chip, .tag, [class*="permission"]');
          const checkboxes = firstRow.locator('input[type="checkbox"]');
          const icons = firstRow.locator('svg[class*="check"], .icon-check');
          const hasPermissionIndicators = 
            await badges.count() > 0 ||
            await checkboxes.count() > 0 ||
            await icons.count() > 0;
          expect(hasPermissionIndicators).toBeTruthy();
        }
      }
    });
  });
  test.describe('Role Management', () => {
    test('should display role cards or summary', async ({ 
      authenticatedPage 
    }) => {
      // Check for roles section
      const rolesSection = authenticatedPage.locator('h3:has-text("User Roles"), h3:has-text("Roles")');
      await expect(rolesSection).toBeVisible();
      // Check for role cards
      const roleCards = authenticatedPage.locator('.role-card, .role-item');
      const roleCount = await roleCards.count();
      if (roleCount > 0) {
        // Check first role card
        const firstRole = roleCards.first();
        await expect(firstRole).toBeVisible();
        // Should have role name
        const roleName = firstRole.locator('h4, .role-name');
        await expect(roleName).toBeVisible();
        // Should have description
        const description = firstRole.locator('p, .role-description');
        if (await description.isVisible()) {
          const descText = await description.textContent();
          expect(descText?.trim()).toBeTruthy();
        }
        // Should have priority or level
        const priority = firstRole.locator('.priority, .role-level');
        if (await priority.isVisible()) {
          const priorityText = await priority.textContent();
          expect(priorityText).toMatch(/Priority|Level|Tier/i);
        }
      }
    });
    test('should allow editing user roles', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const firstRow = table.locator('tbody tr').first();
        const editButton = firstRow.locator('button:has-text("Edit"), button[aria-label*="edit"]');
        if (await editButton.isVisible()) {
          await editButton.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Check for edit modal or inline edit
          const modal = authenticatedPage.locator('[role="dialog"]');
          const roleSelect = authenticatedPage.locator('select[name*="role"]');
          if (await modal.isVisible()) {
            // Modal edit flow
            await expect(modal.locator('h2, h3')).toContainText(/Edit|Update|Modify/i);
            // Should have role dropdown
            const modalRoleSelect = modal.locator('select[name*="role"]');
            await expect(modalRoleSelect).toBeVisible();
            // Cancel for now
            await modal.locator('button:has-text("Cancel")').click();
          } else if (await roleSelect.isVisible()) {
            // Inline edit flow
            const options = await roleSelect.locator('option').all();
            expect(options.length).toBeGreaterThan(1);
            // Don't save changes
            await authenticatedPage.keyboard.press('Escape');
          }
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test(`${tags.crud} should handle adding new user permissions`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for Add User button
      const addButton = authenticatedPage.locator('button:has-text("Add User"), button:has-text("New User")');
      if (await addButton.isVisible()) {
        await addButton.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Check for add user modal
        const modal = authenticatedPage.locator('[role="dialog"]');
        await expect(modal).toBeVisible();
        // Fill user details
        const emailInput = modal.locator('input[name*="email"], input[type="email"]');
        if (await emailInput.isVisible()) {
          await emailInput.fill('testuser@example.com');
        }
        const nameInput = modal.locator('input[name*="name"]');
        if (await nameInput.isVisible()) {
          await nameInput.fill('Test User');
        }
        // Select role
        const roleSelect = modal.locator('select[name*="role"]');
        if (await roleSelect.isVisible()) {
          const options = await roleSelect.locator('option').all();
          if (options.length > 1) {
            await roleSelect.selectOption({ index: 1 });
          }
        }
        // Cancel for now (to avoid modifying test data)
        await modal.locator('button:has-text("Cancel")').click();
        await testHelpers.verifyNoErrors();
      }
    });
  });
  test.describe('Permission Management', () => {
    test('should display detailed permissions list', async ({ 
      authenticatedPage 
    }) => {
      // Check for permissions section
      const permissionsSection = authenticatedPage.locator('h3:has-text("System Permissions"), h3:has-text("Permissions")');
      if (await permissionsSection.isVisible()) {
        // Look for permissions list
        const permissionsList = authenticatedPage.locator('.permissions-list, .permissions-grid');
        if (await permissionsList.isVisible()) {
          // Check for permission items
          const permissionItems = permissionsList.locator('.permission-item, .permission-card');
          const itemCount = await permissionItems.count();
          if (itemCount > 0) {
            // Check first permission
            const firstPermission = permissionItems.first();
            // Should have permission name
            const permName = await firstPermission.textContent();
            expect(permName).toMatch(/read|write|delete|create|view|edit|admin/i);
          }
        }
      }
    });
    test('should allow toggling individual permissions', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const firstRow = table.locator('tbody tr').first();
        const permissionToggles = firstRow.locator('input[type="checkbox"], .toggle, .switch');
        if (await permissionToggles.count() > 0) {
          const firstToggle = permissionToggles.first();
          const initialState = await firstToggle.isChecked();
          // Toggle permission
          await firstToggle.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Verify state changed
          const newState = await firstToggle.isChecked();
          expect(newState).toBe(!initialState);
          // Toggle back
          await firstToggle.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test('should show permission dependencies', async ({ 
      authenticatedPage 
    }) => {
      // Some permissions might have dependencies
      const permissionItems = authenticatedPage.locator('.permission-item, tbody tr');
      if (await permissionItems.count() > 0) {
        // Hover over a permission to see dependencies
        await permissionItems.first().hover();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Check for tooltip or info
        const tooltip = authenticatedPage.locator('[role="tooltip"], .tooltip');
        const infoIcon = authenticatedPage.locator('svg[class*="info"], .info-icon');
        if (await tooltip.isVisible()) {
          const tooltipText = await tooltip.textContent();
          // Might show dependencies
          if (tooltipText?.includes('requires') || tooltipText?.includes('depends')) {
            expect(tooltipText).toBeTruthy();
          }
        }
      }
    });
  });
  test.describe('Filtering and Search', () => {
    test('should filter users by role', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for role filter
      const roleFilter = authenticatedPage.locator('select:has(option:text-is("All Roles")), button:has-text("Filter by Role")');
      if (await roleFilter.isVisible()) {
        const table = authenticatedPage.locator('table').first();
        const initialRowCount = await table.locator('tbody tr').count();
        if (await roleFilter.evaluate(el => el.tagName) === 'SELECT') {
          // Select specific role
          await roleFilter.selectOption({ index: 1 });
        } else {
          // Button dropdown
          await roleFilter.click();
          const roleOption = authenticatedPage.locator('[role="menuitem"]').first();
          await roleOption.click();
        }
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        const filteredRowCount = await table.locator('tbody tr').count();
        expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);
        await testHelpers.verifyNoErrors();
      }
    });
    test('should search users by name or email', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const searchInput = authenticatedPage.locator('input[placeholder*="Search"], input[type="search"]');
      if (await searchInput.isVisible()) {
        const table = authenticatedPage.locator('table').first();
        const initialRowCount = await table.locator('tbody tr').count();
        // Search for a term
        await searchInput.fill('admin');
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        const searchedRowCount = await table.locator('tbody tr').count();
        expect(searchedRowCount).toBeLessThanOrEqual(initialRowCount);
        // Clear search
        await searchInput.clear();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        await testHelpers.verifyNoErrors();
      }
    });
  });
  test.describe('Bulk Operations', () => {
    test('should allow bulk role assignment', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const checkboxes = table.locator('tbody tr input[type="checkbox"]');
        if (await checkboxes.count() > 1) {
          // Select multiple users
          await checkboxes.nth(0).check();
          await checkboxes.nth(1).check();
          // Look for bulk actions
          const bulkActions = authenticatedPage.locator('button:has-text("Bulk Actions"), button:has-text("Actions")');
          if (await bulkActions.isVisible()) {
            await bulkActions.click();
            // Look for role assignment option
            const assignRole = authenticatedPage.getByText('Assign Role').or(authenticatedPage.getByText('Change Role'));
            if (await assignRole.isVisible()) {
              await assignRole.click();
              // Should show role selection
              const roleModal = authenticatedPage.locator('[role="dialog"]');
              if (await roleModal.isVisible()) {
                await expect(roleModal.locator('select, [role="combobox"]')).toBeVisible();
                // Cancel
                await roleModal.locator('button:has-text("Cancel")').click();
              }
            }
          }
          // Uncheck
          await checkboxes.nth(0).uncheck();
          await checkboxes.nth(1).uncheck();
        }
      }
    });
  });
  test.describe('Status Management', () => {
    test('should display user status indicators', async ({ 
      authenticatedPage 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const statusCells = table.locator('tbody tr td:has-text("Active"), tbody tr td:has-text("Inactive")');
        if (await statusCells.count() > 0) {
          // Check for color coding
          const activeStatus = table.locator('[class*="success"], [class*="green"], .status-active');
          const inactiveStatus = table.locator('[class*="danger"], [class*="red"], .status-inactive');
          const hasStatusStyling = 
            await activeStatus.count() > 0 ||
            await inactiveStatus.count() > 0;
          expect(hasStatusStyling).toBeTruthy();
        }
      }
    });
    test('should allow changing user status', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        const firstRow = table.locator('tbody tr').first();
        // Look for status toggle or dropdown
        const statusToggle = firstRow.locator('.status-toggle, input[type="checkbox"][name*="status"]');
        const statusDropdown = firstRow.locator('select[name*="status"]');
        const statusButton = firstRow.locator('button:has-text("Active"), button:has-text("Inactive")');
        if (await statusToggle.isVisible()) {
          // Toggle status
          await statusToggle.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          await testHelpers.verifyNoErrors();
          // Toggle back
          await statusToggle.click();
        } else if (await statusDropdown.isVisible()) {
          // Change via dropdown
          const currentValue = await statusDropdown.inputValue();
          const newValue = currentValue === 'active' ? 'inactive' : 'active';
          await statusDropdown.selectOption(newValue);
          // Change back
          await statusDropdown.selectOption(currentValue);
        } else if (await statusButton.isVisible()) {
          // Click status button
          await statusButton.click();
          // Might show confirmation
          const confirm = authenticatedPage.locator('button:has-text("Confirm")');
          if (await confirm.isVisible()) {
            await authenticatedPage.locator('button:has-text("Cancel")').click();
          }
        }
      }
    });
  });
  test.describe('Accessibility', () => {
    test('should have proper table accessibility', async ({ 
      authenticatedPage 
    }) => {
      const table = authenticatedPage.locator('table').first();
      if (await table.isVisible()) {
        // Check for table caption or aria-label
        const caption = await table.locator('caption').textContent();
        const ariaLabel = await table.getAttribute('aria-label');
        const hasAccessibleLabel = caption || ariaLabel;
        expect(hasAccessibleLabel).toBeTruthy();
        // Check for proper header associations
        const headers = await table.locator('th').all();
        for (const header of headers) {
          const scope = await header.getAttribute('scope');
          expect(scope).toBe('col');
        }
      }
    });
    test('should announce permission changes', async ({ 
      authenticatedPage 
    }) => {
      // Look for ARIA live regions
      const liveRegion = authenticatedPage.locator('[aria-live="polite"], [aria-live="assertive"]');
      if (await liveRegion.count() > 0) {
        // Perform a permission change
        const toggle = authenticatedPage.locator('input[type="checkbox"]').first();
        if (await toggle.isVisible()) {
          await toggle.click();
          // Check if live region updated
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          const announcement = await liveRegion.textContent();
          if (announcement) {
            expect(announcement).toMatch(/updated|changed|saved/i);
          }
        }
      }
    });
  });
});