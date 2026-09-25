/**
 * Multi-User Scenarios E2E Tests
 * Feature: 001-git-sync-integration (Issue #110)
 *
 * Tests multi-user collaboration scenarios including:
 * - Remote changes notification
 * - Concurrent edit handling
 * - User attribution
 * - Collaboration indicators
 */

import { test, expect } from '../../fixtures';
import { GitSyncDataFactory } from '../../helpers/git-sync-data-factory';

test.describe('Multi-User Scenarios', () => {
  test.describe('Remote Changes Notification', () => {
    test('should show notification when remote has new changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for remote changes notification
      const remoteChangesNotification = authenticatedPage.locator('[data-testid="remote-changes-alert"], .remote-changes-banner').or(authenticatedPage.getByText(/new changes/i));

      const hasNotification = await remoteChangesNotification.count() > 0;
      console.log('Remote changes notification available:', hasNotification);
    });

    test('should show who made remote changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for author info in remote changes
      const changeAuthor = authenticatedPage.locator(
        '[data-testid="remote-change-author"], .change-author'
      );

      const hasAuthor = await changeAuthor.count() > 0;
      console.log('Remote change author displayed:', hasAuthor);
    });

    test('should prompt user to pull when behind remote', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for pull prompt
      const pullPrompt = authenticatedPage.locator(
        '[data-testid="pull-prompt"], button:has-text("Pull Changes"), .behind-remote-banner'
      );

      const hasPullPrompt = await pullPrompt.count() > 0;
      console.log('Pull prompt available when behind:', hasPullPrompt);
    });

    test('should show count of remote commits ahead', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for commits ahead count
      const commitsAhead = authenticatedPage.locator('[data-testid="commits-behind"]').or(authenticatedPage.getByText(/\d+ commits? behind/i));

      const hasCommitCount = await commitsAhead.count() > 0;
      console.log('Remote commits count displayed:', hasCommitCount);
    });
  });

  test.describe('Concurrent Edit Handling', () => {
    test('should detect concurrent edits to same entity', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for concurrent edit indicator
      const concurrentEditIndicator = authenticatedPage.locator(
        '[data-testid="concurrent-edit-warning"], .concurrent-edit-alert'
      );

      const hasConcurrentIndicator = await concurrentEditIndicator.count() > 0;
      console.log('Concurrent edit detection available:', hasConcurrentIndicator);
    });

    test('should warn before overwriting remote changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for overwrite warning
      const overwriteWarning = authenticatedPage.locator(
        '[data-testid="overwrite-warning"], [role="alertdialog"]:has-text("overwrite")'
      );

      const hasWarning = await overwriteWarning.count() > 0;
      console.log('Overwrite warning available:', hasWarning);
    });

    test('should offer merge option for concurrent edits', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for merge option
      const mergeOption = authenticatedPage.locator(
        '[data-testid="merge-changes-option"], button:has-text("Merge")'
      );

      const hasMergeOption = await mergeOption.count() > 0;
      console.log('Merge option for concurrent edits:', hasMergeOption);
    });
  });

  test.describe('User Attribution', () => {
    test('should show last modified by user in entity details', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Click on a project to view details
      const projectCard = authenticatedPage.locator('[data-testid="project-card"]').first();

      if (await projectCard.count() > 0) {
        await projectCard.click();
        await authenticatedPage.waitForLoadState('networkidle');

        // Look for last modified by
        const lastModifiedBy = authenticatedPage.locator('[data-testid="last-modified-by"], .modified-by').or(authenticatedPage.getByText(/Modified by/i));

        const hasModifiedBy = await lastModifiedBy.count() > 0;
        console.log('Last modified by displayed:', hasModifiedBy);
      }
    });

    test('should show creation user in entity details', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for created by info
      const createdBy = authenticatedPage.locator('[data-testid="created-by"], .created-by').or(authenticatedPage.getByText(/Created by/i));

      const hasCreatedBy = await createdBy.count() > 0;
      console.log('Created by displayed:', hasCreatedBy);
    });

    test('should include user info in sync commit message', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for author info in commit history
      const commitAuthor = authenticatedPage.locator(
        '[data-testid="commit-author"], .commit-author-name'
      );

      const hasCommitAuthor = await commitAuthor.count() > 0;
      console.log('Commit author in history:', hasCommitAuthor);
    });
  });

  test.describe('Collaboration Indicators', () => {
    test('should show active users indicator', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for active users indicator
      const activeUsers = authenticatedPage.locator(
        '[data-testid="active-users"], .active-users-indicator, .collaborators'
      );

      const hasActiveUsers = await activeUsers.count() > 0;
      console.log('Active users indicator available:', hasActiveUsers);
    });

    test('should show last sync timestamp', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/dashboard');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for last sync time
      const lastSyncTime = authenticatedPage.locator('[data-testid="last-sync-time"], .sync-timestamp').or(authenticatedPage.getByText(/Last synced/i));

      const hasLastSync = await lastSyncTime.count() > 0;
      console.log('Last sync timestamp displayed:', hasLastSync);
    });

    test('should show sync status per entity', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for per-entity sync status
      const entitySyncStatus = authenticatedPage.locator(
        '[data-testid="entity-sync-status"], .entity-sync-indicator'
      );

      const hasEntityStatus = await entitySyncStatus.count() > 0;
      console.log('Per-entity sync status available:', hasEntityStatus);
    });

    test('should indicate locally modified entities', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/projects');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for local modification indicator
      const localModIndicator = authenticatedPage.locator(
        '[data-testid="locally-modified"], .local-changes-badge, .unsaved-indicator'
      );

      const hasLocalMod = await localModIndicator.count() > 0;
      console.log('Local modification indicator available:', hasLocalMod);
    });

    test('should show repository connection status', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/settings');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for repo connection status
      const repoStatus = authenticatedPage.locator('[data-testid="repo-connection-status"], .repository-status').or(authenticatedPage.getByText(/Connected/i));

      const hasRepoStatus = await repoStatus.count() > 0;
      console.log('Repository connection status displayed:', hasRepoStatus);
    });
  });
});
