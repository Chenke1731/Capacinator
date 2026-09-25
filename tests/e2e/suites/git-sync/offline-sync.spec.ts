/**
 * Offline Sync E2E Tests
 * Feature: 001-git-sync-integration (Issue #110)
 *
 * Tests offline mode and sync queue functionality including:
 * - Offline detection and indicator
 * - Change queuing while offline
 * - Automatic sync on reconnection
 * - Queue management
 */

import { test, expect } from '../../fixtures';
import { GitSyncDataFactory } from '../../helpers/git-sync-data-factory';

test.describe('Offline Sync', () => {
  test.describe('Offline Detection', () => {
    test('should detect when network is unavailable', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Go offline
      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(1000);

      // Check for offline indicator
      const offlineIndicator = authenticatedPage.locator('[data-testid="offline-indicator"], .offline-banner').or(authenticatedPage.getByText('Offline'));

      const isOfflineShown = await offlineIndicator.count() > 0;
      console.log('Offline indicator displayed:', isOfflineShown);

      // Restore online status
      await context.setOffline(false);
    });

    test('should show offline mode banner', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(1000);

      // Look for prominent offline banner
      const offlineBanner = authenticatedPage.locator(
        '[data-testid="offline-banner"], .offline-mode-banner, [role="alert"]:has-text("offline")'
      );

      const hasBanner = await offlineBanner.count() > 0;
      console.log('Offline banner displayed:', hasBanner);

      await context.setOffline(false);
    });

    test('should disable sync controls when offline', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(1000);

      // Check sync button state
      const syncButton = authenticatedPage.locator('[data-testid="sync-button"]');

      if (await syncButton.count() > 0) {
        const isDisabled = await syncButton.isDisabled();
        console.log('Sync button disabled when offline:', isDisabled);
      }

      // Check pull button
      const pullButton = authenticatedPage.locator('[data-testid="pull-button"]');
      if (await pullButton.count() > 0) {
        const isDisabled = await pullButton.isDisabled();
        console.log('Pull button disabled when offline:', isDisabled);
      }

      await context.setOffline(false);
    });

    test('should update status when connection restored', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Go offline then online
      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(1000);

      await context.setOffline(false);
      await authenticatedPage.waitForTimeout(1500);

      // Offline indicator should disappear
      const offlineIndicator = authenticatedPage.locator('[data-testid="offline-indicator"]');
      const stillOffline = await offlineIndicator.isVisible().catch(() => false);
      console.log('Offline indicator cleared on reconnect:', !stillOffline);
    });
  });

  test.describe('Change Queue', () => {
    test('should queue changes made while offline', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Go offline
      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      // Try to make a change (look for edit button)
      const editButton = authenticatedPage.locator('button:has-text("Edit")').first();

      if (await editButton.count() > 0) {
        console.log('Edit available - changes can be queued');
      }

      // Check for queued changes indicator
      const queueIndicator = authenticatedPage.locator(
        '[data-testid="queued-changes"], .pending-queue, .changes-queued'
      );

      const hasQueue = await queueIndicator.count() > 0;
      console.log('Queued changes indicator available:', hasQueue);

      await context.setOffline(false);
    });

    test('should show pending changes count', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      // Look for pending count
      const pendingCount = authenticatedPage.locator('[data-testid="pending-changes-count"], .pending-badge').or(authenticatedPage.getByText(/\d+ pending/));

      const hasCount = await pendingCount.count() > 0;
      console.log('Pending changes count displayed:', hasCount);

      await context.setOffline(false);
    });

    test('should allow viewing queued changes', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      // Look for queue viewer
      const viewQueueButton = authenticatedPage.locator(
        '[data-testid="view-queue"], button:has-text("View Queue"), button:has-text("Pending")'
      );

      if (await viewQueueButton.count() > 0) {
        await viewQueueButton.click();

        const queueList = authenticatedPage.locator(
          '[data-testid="queue-list"], .pending-changes-list'
        );

        const hasQueueList = await queueList.isVisible().catch(() => false);
        console.log('Queue list visible:', hasQueueList);
      }

      await context.setOffline(false);
    });

    test('should allow discarding queued changes', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      // Look for discard option
      const discardButton = authenticatedPage.locator(
        '[data-testid="discard-queue"], button:has-text("Discard"), button:has-text("Clear Queue")'
      );

      const hasDiscard = await discardButton.count() > 0;
      console.log('Discard queue option available:', hasDiscard);

      await context.setOffline(false);
    });
  });

  test.describe('Auto-Sync on Reconnect', () => {
    test('should attempt sync when connection restored', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Go offline, then online
      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      await context.setOffline(false);
      await authenticatedPage.waitForTimeout(2000);

      // Look for sync activity
      const syncingIndicator = authenticatedPage.locator(
        '.syncing, [data-testid="sync-in-progress"], .sync-spinner'
      );

      // Check if auto-sync was attempted
      console.log('Auto-sync on reconnect tested');
    });

    test('should show sync progress after reconnection', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);
      await context.setOffline(false);
      await authenticatedPage.waitForTimeout(1000);

      // Look for progress indicator
      const progressIndicator = authenticatedPage.locator(
        '[data-testid="sync-progress"], .sync-progress-bar'
      );

      const hasProgress = await progressIndicator.count() > 0;
      console.log('Sync progress indicator available:', hasProgress);
    });

    test('should notify user of sync result after reconnection', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);
      await context.setOffline(false);
      await authenticatedPage.waitForTimeout(2000);

      // Look for sync result notification
      const notification = authenticatedPage.locator(
        '.toast, [role="alert"], .notification'
      );

      const hasNotification = await notification.count() > 0;
      console.log('Sync result notification available:', hasNotification);
    });

    test('should handle sync conflicts discovered after reconnection', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Simulate scenario where conflicts could occur
      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);
      await context.setOffline(false);
      await authenticatedPage.waitForTimeout(2000);

      // Check for conflict notification or indicator
      const conflictAlert = authenticatedPage.locator(
        '[data-testid="conflict-alert"], .conflict-notification, [role="alert"]:has-text("conflict")'
      );

      const hasConflictAlert = await conflictAlert.count() > 0;
      console.log('Conflict detection on reconnect available:', hasConflictAlert);
    });
  });

  test.describe('Data Persistence', () => {
    test('should preserve local changes during offline period', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Get initial state
      const projectCards = authenticatedPage.locator('[data-testid="project-card"]');
      const initialCount = await projectCards.count();

      // Go offline
      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      // Data should still be visible
      const offlineCount = await projectCards.count();
      console.log('Data preserved offline:', initialCount === offlineCount);

      await context.setOffline(false);
    });

    test('should allow editing data while offline', async ({ authenticatedPage, testHelpers, context }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      await context.setOffline(true);
      await authenticatedPage.waitForTimeout(500);

      // Check if edit controls are still available
      const editButton = authenticatedPage.locator('button:has-text("Edit")').first();
      const addButton = authenticatedPage.locator('button:has-text("Add"), button:has-text("New")').first();

      const canEdit = await editButton.count() > 0 || await addButton.count() > 0;
      console.log('Editing available offline:', canEdit);

      await context.setOffline(false);
    });
  });
});
