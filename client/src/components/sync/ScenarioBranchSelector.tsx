/**
 * Scenario Branch Selector Component
 * Feature: 001-git-sync-integration
 * Task: T079
 *
 * Dropdown for switching between scenario branches
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Select from '@radix-ui/react-select';
import { api } from '../../lib/api-client';

interface Branch {
  name: string;
  description: string;
  createdAt: string | null;
  createdBy: string | null;
  baseBranch: string;
  isActive: boolean;
}

interface ScenarioBranchSelectorProps {
  currentBranch?: string;
  onBranchChange: (branchName: string) => void;
  onCreateBranch?: () => void;
}

export const ScenarioBranchSelector: React.FC<ScenarioBranchSelectorProps> = ({
  currentBranch = 'main',
  onBranchChange,
  onCreateBranch,
}) => {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const result = await api.sync.listBranches();
      if (result.data) {
        setBranches(result.data);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBranchChange = async (branchName: string) => {
    try {
      setLoading(true);
      await api.sync.checkoutBranch(branchName);
      onBranchChange(branchName);
    } catch (error) {
      console.error('Failed to switch branch:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select.Root value={currentBranch} onValueChange={handleBranchChange} disabled={loading}>
        <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]">
          <div className="flex items-center gap-2">
            <span className="text-sm">📂</span>
            <Select.Value placeholder={t('common:selectScenario')} />
          </div>
          <Select.Icon className="text-gray-400">
            ▼
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className="bg-white border border-gray-300 rounded-md shadow-lg overflow-hidden z-50">
            <Select.Viewport className="p-1">
              {branches.map((branch) => (
                <Select.Item
                  key={branch.name}
                  value={branch.name}
                  className="relative flex items-center px-8 py-2 text-sm rounded cursor-pointer hover:bg-blue-50 focus:bg-blue-100 outline-none"
                >
                  <Select.ItemText>
                    <div>
                      <div className="font-medium">{branch.name}</div>
                      {branch.description && (
                        <div className="text-xs text-gray-500">{branch.description}</div>
                      )}
                    </div>
                  </Select.ItemText>
                  <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                    ✓
                  </Select.ItemIndicator>
                </Select.Item>
              ))}

              {branches.length === 0 && (
                <div className="px-8 py-2 text-sm text-gray-500">
                  {t('gitSync:branches.noneFound')}
                </div>
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {onCreateBranch && (
        <button
          onClick={onCreateBranch}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + {t('gitSync:branches.newScenario')}
        </button>
      )}
    </div>
  );
};
