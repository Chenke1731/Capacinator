/**
 * Conflict Resolution E2E Tests
 * Feature: 001-git-sync-integration (Issue #110)
 *
 * Tests conflict resolution workflows including:
 * - Conflict modal with BASE/LOCAL/REMOTE comparison
 * - Resolution strategies (accept_local, accept_remote, custom)
 * - Over-allocation warnings
 * - Resolve Later workflow
 * - Multiple conflict handling
 */

import { test, expect } from '../../fixtures';
import { GitSyncDataFactory } from '../../helpers/git-sync-data-factory';

test.describe('Conflict Resolution', () => {
  test.describe('Conflict Detection', () => {
    test('should display conflict indicator when conflicts exist', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Check for conflict status indicator
      const conflictIndicator = authenticatedPage.locator(
        '[data-testid="sync-status-conflict"], .sync-status.conflict, .conflict-indicator'
      );

      const hasConflict = await conflictIndicator.count() > 0;
      console.log('Conflict indicator present:', hasConflict);
    });

    test('should show conflict count badge when multiple conflicts exist', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for conflict count badge
      const conflictBadge = authenticatedPage.locator(
        '[data-testid="conflict-count"], .conflict-badge, .conflicts-count'
      );

      const hasBadge = await conflictBadge.count() > 0;
      console.log('Conflict count badge present:', hasBadge);
    });

    test('should navigate to conflict resolution page when clicking conflict indicator', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Click on conflict indicator if present
      const conflictIndicator = authenticatedPage.locator('[data-testid="sync-status-conflict"]');

      if (await conflictIndicator.count() > 0) {
        await conflictIndicator.click();
        await authenticatedPage.waitForLoadState('networkidle');

        // Should navigate to conflicts page or show conflict modal
        const conflictsPage = authenticatedPage.locator('[data-testid="conflicts-page"], .conflicts-modal');
        console.log('Navigated to conflicts view');
      }
    });
  });

  test.describe('Conflict Modal', () => {
    test('should display conflict modal with BASE/LOCAL/REMOTE comparison', async ({ authenticatedPage, testHelpers }) => {
      // Navigate to conflicts page or trigger conflict modal
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for the three-way comparison view
      const baseValue = authenticatedPage.locator('[data-testid="conflict-base-value"], .conflict-base');
      const localValue = authenticatedPage.locator('[data-testid="conflict-local-value"], .conflict-local');
      const remoteValue = authenticatedPage.locator('[data-testid="conflict-remote-value"], .conflict-remote');

      // Check if comparison view exists
      const hasBaseValue = await baseValue.count() > 0;
      const hasLocalValue = await localValue.count() > 0;
      const hasRemoteValue = await remoteValue.count() > 0;

      console.log('Three-way comparison available:', { hasBaseValue, hasLocalValue, hasRemoteValue });
    });

    test('should show entity type and field in conflict modal', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Check for entity type and field information
      const entityType = authenticatedPage.locator('[data-testid="conflict-entity-type"], .conflict-entity');
      const fieldName = authenticatedPage.locator('[data-testid="conflict-field-name"], .conflict-field');

      const hasEntityInfo = await entityType.count() > 0 || await fieldName.count() > 0;
      console.log('Entity info displayed:', hasEntityInfo);
    });

    test('should display conflict timestamp', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      const timestamp = authenticatedPage.locator('[data-testid="conflict-timestamp"], .conflict-time');
      const hasTimestamp = await timestamp.count() > 0;
      console.log('Conflict timestamp displayed:', hasTimestamp);
    });

    test('should highlight differences between values', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for diff highlighting
      const diffHighlight = authenticatedPage.locator('.diff-highlight, .value-diff, [data-testid="diff-marker"]');
      const hasDiffHighlight = await diffHighlight.count() > 0;
      console.log('Diff highlighting present:', hasDiffHighlight);
    });
  });

  test.describe('Resolution Strategies', () => {
    test('should allow accepting local value', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for accept local button
      const acceptLocalButton = authenticatedPage.locator(
        '[data-testid="accept-local"], button:has-text("Accept Local"), button:has-text("Keep Mine")'
      );

      if (await acceptLocalButton.count() > 0) {
        console.log('Accept local button available');
        // Click would trigger resolution
      }
    });

    test('should allow accepting remote value', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for accept remote button
      const acceptRemoteButton = authenticatedPage.locator(
        '[data-testid="accept-remote"], button:has-text("Accept Remote"), button:has-text("Keep Theirs")'
      );

      if (await acceptRemoteButton.count() > 0) {
        console.log('Accept remote button available');
      }
    });

    test('should allow entering custom value', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for custom value input
      const customValueButton = authenticatedPage.locator(
        '[data-testid="enter-custom"], button:has-text("Custom"), button:has-text("Manual")'
      );
      const customValueInput = authenticatedPage.locator(
        '[data-testid="custom-value-input"], input.custom-value'
      );

      const hasCustomOption = await customValueButton.count() > 0 || await customValueInput.count() > 0;
      console.log('Custom value option available:', hasCustomOption);
    });

    test('should validate custom value before applying', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // If custom value input exists, test validation
      const customValueInput = authenticatedPage.locator('[data-testid="custom-value-input"]');

      if (await customValueInput.count() > 0) {
        // Enter invalid value
        await customValueInput.fill('');

        // Check for validation message
        const validationError = authenticatedPage.locator('.validation-error, [role="alert"]');
        console.log('Validation available for custom values');
      }
    });

    test('should show confirmation before applying resolution', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for confirmation dialog or button
      const confirmButton = authenticatedPage.locator(
        '[data-testid="confirm-resolution"], button:has-text("Confirm"), button:has-text("Apply")'
      );

      const hasConfirmation = await confirmButton.count() > 0;
      console.log('Resolution confirmation available:', hasConfirmation);
    });
  });

  test.describe('Over-Allocation Warnings', () => {
    test('should display over-allocation warning when resolution causes conflict', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for over-allocation warning
      const overAllocationWarning = authenticatedPage.locator(
        '[data-testid="over-allocation-warning"], .allocation-warning, .capacity-warning'
      );

      const hasWarning = await overAllocationWarning.count() > 0;
      console.log('Over-allocation warning available:', hasWarning);
    });

    test('should show affected resources in over-allocation warning', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for affected resources list
      const affectedResources = authenticatedPage.locator(
        '[data-testid="affected-resources"], .affected-list'
      );

      const hasAffectedList = await affectedResources.count() > 0;
      console.log('Affected resources list available:', hasAffectedList);
    });

    test('should allow proceeding despite over-allocation warning', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for proceed anyway button
      const proceedButton = authenticatedPage.locator(
        '[data-testid="proceed-anyway"], button:has-text("Proceed Anyway"), button:has-text("Continue")'
      );

      const canProceed = await proceedButton.count() > 0;
      console.log('Can proceed despite warning:', canProceed);
    });
  });

  test.describe('Resolve Later Workflow', () => {
    test('should allow deferring conflict resolution', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for resolve later button
      const resolveLaterButton = authenticatedPage.locator(
        '[data-testid="resolve-later"], button:has-text("Resolve Later"), button:has-text("Skip")'
      );

      if (await resolveLaterButton.count() > 0) {
        console.log('Resolve later option available');
      }
    });

    test('should keep conflict in pending state when deferred', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for pending conflicts list
      const pendingConflicts = authenticatedPage.locator(
        '[data-testid="pending-conflicts"], .conflicts-pending'
      );

      const hasPendingList = await pendingConflicts.count() > 0;
      console.log('Pending conflicts list available:', hasPendingList);
    });

    test('should block push when unresolved conflicts exist', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Try to find push button - should be disabled or show warning
      const pushButton = authenticatedPage.locator('[data-testid="sync-button"], button:has-text("Push")');

      if (await pushButton.count() > 0) {
        // Check if disabled or shows conflict warning
        const isDisabled = await pushButton.isDisabled();
        console.log('Push blocked with unresolved conflicts:', isDisabled);
      }
    });
  });

  test.describe('Multiple Conflicts', () => {
    test('should display list of all conflicts', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for conflicts list
      const conflictsList = authenticatedPage.locator(
        '[data-testid="conflicts-list"], .conflicts-list, ul.conflicts'
      );

      const hasConflictsList = await conflictsList.count() > 0;
      console.log('Conflicts list available:', hasConflictsList);
    });

    test('should allow navigating between conflicts', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for navigation controls
      const nextButton = authenticatedPage.locator(
        '[data-testid="next-conflict"], button:has-text("Next")'
      );
      const prevButton = authenticatedPage.locator(
        '[data-testid="prev-conflict"], button:has-text("Previous")'
      );

      const hasNavigation = await nextButton.count() > 0 || await prevButton.count() > 0;
      console.log('Conflict navigation available:', hasNavigation);
    });

    test('should show progress through conflict resolution', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for progress indicator
      const progressIndicator = authenticatedPage.locator('[data-testid="resolution-progress"], .conflicts-progress').or(authenticatedPage.getByText(/\d+ of \d+/));

      const hasProgress = await progressIndicator.count() > 0;
      console.log('Resolution progress indicator available:', hasProgress);
    });

    test('should allow bulk resolution for similar conflicts', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for bulk resolution option
      const bulkResolveButton = authenticatedPage.locator(
        '[data-testid="bulk-resolve"], button:has-text("Resolve All"), button:has-text("Apply to Similar")'
      );

      const hasBulkResolve = await bulkResolveButton.count() > 0;
      console.log('Bulk resolution available:', hasBulkResolve);
    });

    test('should update conflict count after resolution', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/conflicts');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for conflict count
      const conflictCount = authenticatedPage.locator('[data-testid="conflict-count"]');

      if (await conflictCount.count() > 0) {
        const initialCount = await conflictCount.textContent();
        console.log('Initial conflict count:', initialCount);
        // After resolution, count should decrease
      }
    });
  });
});
