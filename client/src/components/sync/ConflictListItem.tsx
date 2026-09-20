/**
 * Conflict List Item Component
 * Feature: 001-git-sync-integration
 * Task: T056
 *
 * Displays individual conflict with entity type, field, and values
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Conflict } from '../../../../shared/types/git-entities';

interface ConflictListItemProps {
  conflict: Conflict;
  onSelect: (conflict: Conflict) => void;
  hasOverAllocationWarning?: boolean;
}

export const ConflictListItem: React.FC<ConflictListItemProps> = ({
  conflict,
  onSelect,
  hasOverAllocationWarning = false,
}) => {
  const { t } = useTranslation();

  const getEntityTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      project: 'gitSync:entityTypes.project',
      person: 'gitSync:entityTypes.person',
      assignment: 'gitSync:entityTypes.assignment',
      project_phase: 'gitSync:entityTypes.projectPhase',
    };
    const key = labels[type];
    return key ? t(key) : type;
  };

  const getEntityTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      project: 'bg-blue-100 text-blue-800',
      person: 'bg-green-100 text-green-800',
      assignment: 'bg-purple-100 text-purple-800',
      project_phase: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const truncateValue = (value: any): string => {
    const str = String(value ?? 'null');
    if (str.length > 30) {
      return str.substring(0, 30) + '...';
    }
    return str;
  };

  return (
    <div
      className="flex items-center justify-between p-4 border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={() => onSelect(conflict)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getEntityTypeColor(conflict.entityType)}`}>
            {getEntityTypeLabel(conflict.entityType)}
          </span>

          {hasOverAllocationWarning && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              ⚠ {t('gitSync:conflicts.overAllocation')}
            </span>
          )}
        </div>

        <div className="text-sm font-medium text-gray-900 truncate">
          {conflict.entityName}
        </div>

        <div className="text-sm text-gray-500">
          {t('gitSync:conflicts.field')}: <span className="font-mono text-xs">{conflict.field}</span>
        </div>

        <div className="flex gap-4 mt-2 text-xs text-gray-600">
          <div className="flex-1">
            <span className="font-medium">{t('gitSync:conflicts.local')}:</span>{' '}
            <span className="font-mono bg-gray-100 px-1 rounded">
              {truncateValue(conflict.localValue)}
            </span>
          </div>
          <div className="flex-1">
            <span className="font-medium">{t('gitSync:conflicts.remote')}:</span>{' '}
            <span className="font-mono bg-gray-100 px-1 rounded">
              {truncateValue(conflict.remoteValue)}
            </span>
          </div>
        </div>
      </div>

      <div className="ml-4 flex-shrink-0">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(conflict);
          }}
        >
          {t('gitSync:conflicts.resolve')}
        </button>
      </div>
    </div>
  );
};
