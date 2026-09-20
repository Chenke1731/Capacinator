/**
 * Conflict Resolution Modal Component
 * Feature: 001-git-sync-integration
 * Task: T055, T058, T059, T060
 *
 * Side-by-side comparison view for resolving merge conflicts
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import type { Conflict } from '../../../../shared/types/git-entities';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: Conflict | null;
  onResolve: (conflictId: string, resolution: 'accept_local' | 'accept_remote' | 'custom', customValue?: any) => Promise<void>;
  onResolveLater?: () => void;
  overAllocationWarning?: {
    personName: string;
    totalAllocation: number;
    affectedAssignments: Array<{ projectName: string; allocation: number }>;
  } | null;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  conflict,
  onResolve,
  onResolveLater,
  overAllocationWarning,
}) => {
  const { t } = useTranslation();
  const [selectedResolution, setSelectedResolution] = useState<'accept_local' | 'accept_remote' | 'custom'>('accept_local');
  const [customValue, setCustomValue] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const handleResolve = async () => {
    if (!conflict) return;

    setIsResolving(true);
    try {
      await onResolve(
        conflict.id,
        selectedResolution,
        selectedResolution === 'custom' ? customValue : undefined
      );
      onClose();
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setIsResolving(false);
    }
  };

  const handleCancel = () => {
    setSelectedResolution('accept_local');
    setCustomValue('');
    onClose();
  };

  if (!conflict) {
    return null;
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
          <div className="p-6">
            <Dialog.Title className="text-xl font-semibold mb-4">
              {t('gitSync:conflicts.resolveTitle')}
            </Dialog.Title>

            {/* Entity Info */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">{t('gitSync:conflicts.entity')}</div>
              <div className="font-medium">{conflict.entityName}</div>
              <div className="text-sm text-gray-500 mt-1">
                {conflict.entityType} · {t('gitSync:conflicts.field')}: <span className="font-mono">{conflict.field}</span>
              </div>
            </div>

            {/* Over-allocation Warning (Task: T060) */}
            {overAllocationWarning && (
              <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-600 text-xl">⚠</span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      {t('gitSync:conflicts.overAllocationWarning')}
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        {t('gitSync:conflicts.overAllocationDetail', {
                          name: overAllocationWarning.personName,
                          total: overAllocationWarning.totalAllocation,
                        })}
                      </p>
                      <div className="mt-2">
                        <p className="font-medium">{t('gitSync:conflicts.affectedAssignments')}:</p>
                        <ul className="mt-1 list-disc list-inside">
                          {overAllocationWarning.affectedAssignments.map((a, idx) => (
                            <li key={idx}>
                              {a.projectName} ({a.allocation}%)
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Side-by-side Comparison (Task: T055) */}
            <div className="mb-6">
              <div className="grid grid-cols-3 gap-4">
                {/* BASE */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('gitSync:conflicts.base')}
                  </label>
                  <div className="p-3 bg-gray-100 rounded border border-gray-300 min-h-[100px] font-mono text-sm whitespace-pre-wrap break-all">
                    {String(conflict.baseValue ?? 'null')}
                  </div>
                </div>

                {/* LOCAL */}
                <div>
                  <label className="flex items-center text-sm font-medium mb-2">
                    <input
                      type="radio"
                      name="resolution"
                      value="accept_local"
                      checked={selectedResolution === 'accept_local'}
                      onChange={() => setSelectedResolution('accept_local')}
                      className="mr-2"
                    />
                    <span className="text-blue-700">{t('gitSync:conflicts.localVersion')}</span>
                  </label>
                  <div
                    className={`p-3 rounded border min-h-[100px] font-mono text-sm whitespace-pre-wrap break-all cursor-pointer transition-colors ${
                      selectedResolution === 'accept_local'
                        ? 'bg-blue-50 border-blue-500 border-2'
                        : 'bg-gray-100 border-gray-300'
                    }`}
                    onClick={() => setSelectedResolution('accept_local')}
                  >
                    {String(conflict.localValue ?? 'null')}
                  </div>
                </div>

                {/* REMOTE */}
                <div>
                  <label className="flex items-center text-sm font-medium mb-2">
                    <input
                      type="radio"
                      name="resolution"
                      value="accept_remote"
                      checked={selectedResolution === 'accept_remote'}
                      onChange={() => setSelectedResolution('accept_remote')}
                      className="mr-2"
                    />
                    <span className="text-green-700">{t('gitSync:conflicts.remoteVersion')}</span>
                  </label>
                  <div
                    className={`p-3 rounded border min-h-[100px] font-mono text-sm whitespace-pre-wrap break-all cursor-pointer transition-colors ${
                      selectedResolution === 'accept_remote'
                        ? 'bg-green-50 border-green-500 border-2'
                        : 'bg-gray-100 border-gray-300'
                    }`}
                    onClick={() => setSelectedResolution('accept_remote')}
                  >
                    {String(conflict.remoteValue ?? 'null')}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Resolution */}
            <div className="mb-6">
              <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <input
                  type="radio"
                  name="resolution"
                  value="custom"
                  checked={selectedResolution === 'custom'}
                  onChange={() => setSelectedResolution('custom')}
                  className="mr-2"
                />
                <span>{t('gitSync:conflicts.customValue')}</span>
              </label>
              <input
                type="text"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setSelectedResolution('custom');
                }}
                onFocus={() => setSelectedResolution('custom')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder={t('gitSync:conflicts.customPlaceholder')}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              {/* Resolve Later (Task: T059) */}
              {onResolveLater && (
                <button
                  onClick={() => {
                    onResolveLater();
                    handleCancel();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  {t('gitSync:conflicts.resolveLater')}
                </button>
              )}

              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t('common:cancel')}
              </button>

              <button
                onClick={handleResolve}
                disabled={isResolving || (selectedResolution === 'custom' && !customValue.trim())}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isResolving ? t('gitSync:conflicts.resolving') : t('gitSync:conflicts.applyResolution')}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
