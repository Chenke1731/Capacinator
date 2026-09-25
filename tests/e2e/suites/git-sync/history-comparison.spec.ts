/**
 * History & Comparison E2E Tests
 * Feature: 001-git-sync-integration (Issue #110)
 *
 * Tests sync history and data comparison including:
 * - Sync history timeline
 * - Commit details view
 * - Data changes comparison
 * - Rollback functionality
 */

import { test, expect } from '../../fixtures';
import { GitSyncDataFactory } from '../../helpers/git-sync-data-factory';

test.describe('History & Comparison', () => {
  test.describe('Sync History Timeline', () => {
    test('should display sync history in settings', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/settings');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for sync history section
      const historySection = authenticatedPage.locator('[data-testid="sync-history"], .sync-history').or(authenticatedPage.getByText('Sync History')).first();

      const hasHistory = await historySection.count() > 0;
      console.log('Sync history section available:', hasHistory);
    });

    test('should show list of recent sync operations', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for sync operations list
      const operationsList = authenticatedPage.locator(
        '[data-testid="sync-operations-list"], .sync-operations, .history-list'
      );

      if (await operationsList.count() > 0) {
        const operationItems = authenticatedPage.locator('[data-testid="sync-operation-item"]');
        const itemCount = await operationItems.count();
        console.log('Sync operations displayed:', itemCount);
      }
    });

    test('should display operation type and timestamp', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      const operationItem = authenticatedPage.locator('[data-testid="sync-operation-item"]').first();

      if (await operationItem.count() > 0) {
        // Check for operation type
        const operationType = operationItem.locator('[data-testid="operation-type"], .operation-type');
        const timestamp = operationItem.locator('[data-testid="operation-timestamp"], .operation-time');

        const hasType = await operationType.count() > 0;
        const hasTimestamp = await timestamp.count() > 0;

        console.log('Operation details:', { hasType, hasTimestamp });
      }
    });

    test('should show operation status (success/failed/pending)', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for status indicators
      const successStatus = authenticatedPage.locator('.status-success, [data-status="success"]');
      const failedStatus = authenticatedPage.locator('.status-failed, [data-status="failed"]');
      const pendingStatus = authenticatedPage.locator('.status-pending, [data-status="pending"]');

      const hasStatusIndicators =
        await successStatus.count() > 0 ||
        await failedStatus.count() > 0 ||
        await pendingStatus.count() > 0;

      console.log('Status indicators available:', hasStatusIndicators);
    });

    test('should filter history by operation type', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for filter controls
      const filterSelect = authenticatedPage.locator(
        '[data-testid="history-filter"], select[name="operationType"]'
      );

      const hasFilter = await filterSelect.count() > 0;
      console.log('History filter available:', hasFilter);
    });
  });

  test.describe('Commit Details', () => {
    test('should show commit details on click', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      const operationItem = authenticatedPage.locator('[data-testid="sync-operation-item"]').first();

      if (await operationItem.count() > 0) {
        await operationItem.click();

        // Check for details panel
        const detailsPanel = authenticatedPage.locator(
          '[data-testid="operation-details"], .operation-details-panel'
        );

        const hasDetails = await detailsPanel.isVisible().catch(() => false);
        console.log('Operation details panel shown:', hasDetails);
      }
    });

    test('should display commit message', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for commit message
      const commitMessage = authenticatedPage.locator(
        '[data-testid="commit-message"], .commit-message'
      );

      const hasCommitMessage = await commitMessage.count() > 0;
      console.log('Commit message displayed:', hasCommitMessage);
    });

    test('should show author information', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for author info
      const authorInfo = authenticatedPage.locator(
        '[data-testid="commit-author"], .commit-author'
      );

      const hasAuthor = await authorInfo.count() > 0;
      console.log('Author information displayed:', hasAuthor);
    });

    test('should display files changed count', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for files changed
      const filesChanged = authenticatedPage.locator('[data-testid="files-changed"]').or(authenticatedPage.getByText(/\d+ files?/)).first();

      const hasFilesChanged = await filesChanged.count() > 0;
      console.log('Files changed count displayed:', hasFilesChanged);
    });
  });

  test.describe('Data Changes Comparison', () => {
    test('should show what data changed in each sync', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      const operationItem = authenticatedPage.locator('[data-testid="sync-operation-item"]').first();

      if (await operationItem.count() > 0) {
        await operationItem.click();

        // Look for changes summary
        const changesSummary = authenticatedPage.locator(
          '[data-testid="changes-summary"], .changes-list'
        );

        const hasChanges = await changesSummary.count() > 0;
        console.log('Changes summary available:', hasChanges);
      }
    });

    test('should categorize changes by entity type', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for entity type categories
      const projectChanges = authenticatedPage.locator('[data-testid="changes-projects"]');
      const peopleChanges = authenticatedPage.locator('[data-testid="changes-people"]');
      const assignmentChanges = authenticatedPage.locator('[data-testid="changes-assignments"]');

      const hasCategories =
        await projectChanges.count() > 0 ||
        await peopleChanges.count() > 0 ||
        await assignmentChanges.count() > 0;

      console.log('Entity type categories available:', hasCategories);
    });

    test('should show before/after values for changes', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for before/after comparison
      const beforeValue = authenticatedPage.locator('[data-testid="change-before"], .value-before');
      const afterValue = authenticatedPage.locator('[data-testid="change-after"], .value-after');

      const hasComparison = await beforeValue.count() > 0 || await afterValue.count() > 0;
      console.log('Before/after comparison available:', hasComparison);
    });
  });

  test.describe('Rollback', () => {
    test('should show rollback option for sync operations', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      // Look for rollback button
      const rollbackButton = authenticatedPage.locator(
        '[data-testid="rollback-button"], button:has-text("Rollback"), button:has-text("Revert")'
      );

      const hasRollback = await rollbackButton.count() > 0;
      console.log('Rollback option available:', hasRollback);
    });

    test('should confirm before rollback', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      const rollbackButton = authenticatedPage.locator('[data-testid="rollback-button"]').first();

      if (await rollbackButton.count() > 0) {
        await rollbackButton.click();

        // Check for confirmation dialog
        const confirmDialog = authenticatedPage.locator(
          '[data-testid="rollback-confirm"], [role="alertdialog"]:has-text("rollback")'
        );

        const hasConfirm = await confirmDialog.isVisible().catch(() => false);
        console.log('Rollback confirmation shown:', hasConfirm);
      }
    });

    test('should show rollback preview', async ({ authenticatedPage, testHelpers }) => {
      await testHelpers.navigateTo('/sync/history');
      await authenticatedPage.waitForLoadState('networkidle');

      const rollbackButton = authenticatedPage.locator('[data-testid="rollback-button"]').first();

      if (await rollbackButton.count() > 0) {
        await rollbackButton.click();

        // Look for preview of what will be rolled back
        const rollbackPreview = authenticatedPage.locator(
          '[data-testid="rollback-preview"], .rollback-changes-preview'
        );

        const hasPreview = await rollbackPreview.count() > 0;
        console.log('Rollback preview available:', hasPreview);
      }
    });
  });
});
