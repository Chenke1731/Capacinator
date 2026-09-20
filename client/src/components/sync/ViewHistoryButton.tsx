/**
 * View History Button Component
 * Feature: 001-git-sync-integration
 * Task: T087
 *
 * Button to view change history for an entity
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { ChangeHistoryPanel } from './ChangeHistoryPanel';

interface ViewHistoryButtonProps {
  entityType: 'project' | 'person' | 'assignment' | 'project_phase';
  entityId: string;
  entityName?: string;
  variant?: 'button' | 'link';
}

export const ViewHistoryButton: React.FC<ViewHistoryButtonProps> = ({
  entityType,
  entityId,
  entityName,
  variant = 'button',
}) => {
  const { t } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);

  const buttonContent = (
    <>
      <span>📜</span>
      <span>{t('gitSync:history.viewHistory')}</span>
    </>
  );

  const trigger =
    variant === 'link' ? (
      <button
        onClick={() => setShowHistory(true)}
        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
      >
        {buttonContent}
      </button>
    ) : (
      <button
        onClick={() => setShowHistory(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
      >
        {buttonContent}
      </button>
    );

  return (
    <>
      {trigger}

      <Dialog.Root open={showHistory} onOpenChange={setShowHistory}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto p-6 z-50">
            <div className="mb-4">
              <Dialog.Title className="text-xl font-semibold">
                {t('gitSync:history.changeHistory')}
                {entityName && `: ${entityName}`}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mt-1">
                {t('gitSync:history.viewAllChanges', { type: entityType.replace('_', ' ') })}
              </Dialog.Description>
            </div>

            <ChangeHistoryPanel
              entityType={entityType}
              entityId={entityId}
              maxCount={50}
            />

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowHistory(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                {t('common:close')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
