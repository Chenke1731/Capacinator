/**
 * Compare Branch Button Component
 * Feature: 001-git-sync-integration
 * Task: T086
 *
 * Button to compare current branch to main scenario
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { ScenarioComparisonView } from './ScenarioComparisonView';
import { useGitSync } from '../../contexts/GitSyncContext';

export const CompareBranchButton: React.FC = () => {
  const { t } = useTranslation();
  const { currentBranch } = useGitSync();
  const [showComparison, setShowComparison] = useState(false);

  // Only show button if not on main branch
  if (currentBranch === 'main') {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowComparison(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
      >
        <span>↔</span>
        <span>{t('gitSync:compare.button')}</span>
      </button>

      <Dialog.Root open={showComparison} onOpenChange={setShowComparison}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto p-6 z-50">
            <ScenarioComparisonView
              baseBranch="main"
              targetBranch={currentBranch}
              onClose={() => setShowComparison(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
