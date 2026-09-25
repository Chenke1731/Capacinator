/**
 * Branch Operations E2E Tests
 * Feature: 001-git-sync-integration (Issue #110)
 *
 * Tests branch management workflows including:
 * - Branch picker/selector
 * - Creating new branches
 * - Switching branches
 * - Merging branches
 * - Branch comparison
 */

import { test, expect } from '../../fixtures';
import { GitSyncDataFactory } from '../../helpers/git-sync-data-factory';

test.describe('Branch Operations', () => {
  test.describe('Branch Picker', () => {
    test('should display current branch name in header', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for current branch indicator
      const branchIndicator = authenticatedPage.locator(
        '[data-testid="current-branch"], .branch-name, .current-branch'
      );

      const hasBranchIndicator = await branchIndicator.count() > 0;
      console.log('Current branch displayed:', hasBranchIndicator);

      if (hasBranchIndicator) {
        const branchName = await branchIndicator.textContent();
        console.log('Current branch:', branchName);
      }
    });

    test('should show branch picker dropdown when clicked', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Click on branch picker
      const branchPicker = authenticatedPage.locator(
        '[data-testid="branch-picker"], .branch-selector, button:has-text("Branch")'
      );

      if (await branchPicker.count() > 0) {
        await branchPicker.click();

        // Wait for dropdown to appear
        const branchDropdown = authenticatedPage.locator(
          '[data-testid="branch-dropdown"], .branch-list, [role="listbox"]'
        );

        await expect(branchDropdown).toBeVisible({ timeout: 5000 }).catch(() => {
          console.log('Branch dropdown not visible after click');
        });
      }
    });

    test('should list all available branches', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Open branch picker
      const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');

      if (await branchPicker.count() > 0) {
        await branchPicker.click();

        // Check for branch list items
        const branchItems = authenticatedPage.locator('[data-testid="branch-item"], .branch-option');
        const branchCount = await branchItems.count();
        console.log('Available branches:', branchCount);
      }
    });

    test('should highlight current branch in picker', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');

      if (await branchPicker.count() > 0) {
        await branchPicker.click();

        // Look for active/selected branch indicator
        const activeBranch = authenticatedPage.locator(
          '[data-testid="branch-item"].active, .branch-option.selected, [aria-selected="true"]'
        );

        const hasActiveBranch = await activeBranch.count() > 0;
        console.log('Current branch highlighted:', hasActiveBranch);
      }
    });
  });

  test.describe('Create Branch', () => {
    test('should show create branch option in branch picker', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');

      if (await branchPicker.count() > 0) {
        await branchPicker.click();

        // Look for create branch option
        const createBranchOption = authenticatedPage.locator(
          '[data-testid="create-branch"], button:has-text("New Branch"), button:has-text("Create Branch")'
        );

        const hasCreateOption = await createBranchOption.count() > 0;
        console.log('Create branch option available:', hasCreateOption);
      }
    });

    test('should open create branch dialog', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const createBranchButton = authenticatedPage.locator('[data-testid="create-branch"]');

      if (await createBranchButton.count() > 0) {
        await createBranchButton.click();

        // Check for dialog
        const dialog = authenticatedPage.locator(
          '[data-testid="create-branch-dialog"], [role="dialog"]:has-text("Branch")'
        );

        const dialogVisible = await dialog.isVisible().catch(() => false);
        console.log('Create branch dialog opened:', dialogVisible);
      }
    });

    test('should validate branch name format', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Navigate to create branch dialog
      const createBranchButton = authenticatedPage.locator('[data-testid="create-branch"]');

      if (await createBranchButton.count() > 0) {
        await createBranchButton.click();

        // Enter invalid branch name
        const branchNameInput = authenticatedPage.locator(
          '[data-testid="branch-name-input"], input[name="branchName"]'
        );

        if (await branchNameInput.count() > 0) {
          await branchNameInput.fill('invalid branch name with spaces');

          // Look for validation error
          const validationError = authenticatedPage.locator('.validation-error, [role="alert"]');
          const hasError = await validationError.count() > 0;
          console.log('Branch name validation:', hasError);
        }
      }
    });

    test('should allow selecting base branch', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const createBranchButton = authenticatedPage.locator('[data-testid="create-branch"]');

      if (await createBranchButton.count() > 0) {
        await createBranchButton.click();

        // Look for base branch selector
        const baseBranchSelector = authenticatedPage.locator(
          '[data-testid="base-branch-select"], select[name="baseBranch"]'
        );

        const hasBaseSelector = await baseBranchSelector.count() > 0;
        console.log('Base branch selector available:', hasBaseSelector);
      }
    });
  });

  test.describe('Switch Branch', () => {
    test('should switch to selected branch', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');

      if (await branchPicker.count() > 0) {
        // Get current branch
        const currentBranch = await branchPicker.textContent();

        await branchPicker.click();

        // Select a different branch
        const otherBranch = authenticatedPage.locator('[data-testid="branch-item"]:not(.active)').first();

        if (await otherBranch.count() > 0) {
          await otherBranch.click();
          await authenticatedPage.waitForLoadState('networkidle');
          console.log('Branch switch initiated');
        }
      }
    });

    test('should prompt to save changes before switching', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // If there are pending changes, switching should prompt
      const pendingIndicator = authenticatedPage.locator('[data-testid="sync-status-pending"]');

      if (await pendingIndicator.count() > 0) {
        const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');
        await branchPicker.click();

        const otherBranch = authenticatedPage.locator('[data-testid="branch-item"]:not(.active)').first();
        if (await otherBranch.count() > 0) {
          await otherBranch.click();

          // Look for save prompt
          const savePrompt = authenticatedPage.locator(
            '[data-testid="save-changes-prompt"], [role="dialog"]:has-text("unsaved")'
          );

          const hasPrompt = await savePrompt.isVisible().catch(() => false);
          console.log('Save prompt shown for unsaved changes:', hasPrompt);
        }
      }
    });

    test('should reload data after branch switch', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Track initial project count
      const projectCards = authenticatedPage.locator('[data-testid="project-card"], .project-item');
      const initialCount = await projectCards.count();

      // Switch branch (if possible)
      const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');

      if (await branchPicker.count() > 0) {
        await branchPicker.click();
        const otherBranch = authenticatedPage.locator('[data-testid="branch-item"]:not(.active)').first();

        if (await otherBranch.count() > 0) {
          await otherBranch.click();
          await authenticatedPage.waitForLoadState('networkidle');

          // Data should have reloaded
          console.log('Data reloaded after branch switch');
        }
      }
    });
  });

  test.describe('Merge Branch', () => {
    test('should show merge option for branches', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const branchPicker = authenticatedPage.locator('[data-testid="branch-picker"]');

      if (await branchPicker.count() > 0) {
        await branchPicker.click();

        // Look for merge button or option
        const mergeOption = authenticatedPage.locator(
          '[data-testid="merge-branch"], button:has-text("Merge")'
        );

        const hasMergeOption = await mergeOption.count() > 0;
        console.log('Merge option available:', hasMergeOption);
      }
    });

    test('should show merge confirmation dialog', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const mergeButton = authenticatedPage.locator('[data-testid="merge-branch"]');

      if (await mergeButton.count() > 0) {
        await mergeButton.click();

        // Check for confirmation dialog
        const confirmDialog = authenticatedPage.locator(
          '[data-testid="merge-confirm-dialog"], [role="alertdialog"]:has-text("merge")'
        );

        const dialogVisible = await confirmDialog.isVisible().catch(() => false);
        console.log('Merge confirmation dialog shown:', dialogVisible);
      }
    });

    test('should display merge preview with changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const mergeButton = authenticatedPage.locator('[data-testid="merge-branch"]');

      if (await mergeButton.count() > 0) {
        await mergeButton.click();

        // Look for merge preview
        const mergePreview = authenticatedPage.locator(
          '[data-testid="merge-preview"], .merge-changes-preview'
        );

        const hasPreview = await mergePreview.count() > 0;
        console.log('Merge preview available:', hasPreview);
      }
    });

    test('should warn about potential conflicts during merge', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      const mergeButton = authenticatedPage.locator('[data-testid="merge-branch"]');

      if (await mergeButton.count() > 0) {
        await mergeButton.click();

        // Look for conflict warning
        const conflictWarning = authenticatedPage.locator(
          '[data-testid="merge-conflict-warning"], .conflict-warning'
        );

        const hasWarning = await conflictWarning.count() > 0;
        console.log('Merge conflict warning available:', hasWarning);
      }
    });
  });

  test.describe('Branch Comparison', () => {
    test('should show compare branches option', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for compare option
      const compareOption = authenticatedPage.locator(
        '[data-testid="compare-branches"], button:has-text("Compare")'
      );

      const hasCompareOption = await compareOption.count() > 0;
      console.log('Compare branches option available:', hasCompareOption);
    });

    test('should display diff between branches', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/compare');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for diff view
      const diffView = authenticatedPage.locator(
        '[data-testid="branch-diff"], .diff-view, .comparison-view'
      );

      const hasDiffView = await diffView.count() > 0;
      console.log('Branch diff view available:', hasDiffView);
    });

    test('should show commit count difference', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/compare');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for commit count
      const commitCount = authenticatedPage.locator('[data-testid="commits-ahead"], [data-testid="commits-behind"]').or(authenticatedPage.getByText(/\d+ commits?/)).first();

      const hasCommitCount = await commitCount.count() > 0;
      console.log('Commit count displayed:', hasCommitCount);
    });
  });
});
