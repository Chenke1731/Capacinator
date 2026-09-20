/**
 * Scenario Comparison View Component
 * Feature: 001-git-sync-integration
 * Task: T082
 *
 * Shows side-by-side differences between scenario branches
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';

interface ScenarioDifference {
  entityType: 'project' | 'person' | 'assignment' | 'project_phase';
  entityId: string;
  entityName: string;
  differenceType: 'added' | 'removed' | 'modified';
  baseValue?: any;
  targetValue?: any;
  modifiedFields?: string[];
}

interface ComparisonResult {
  baseBranch: string;
  targetBranch: string;
  differences: ScenarioDifference[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    byType: Record<string, { added: number; removed: number; modified: number }>;
  };
}

interface ScenarioComparisonViewProps {
  baseBranch: string;
  targetBranch: string;
  onClose?: () => void;
}

export const ScenarioComparisonView: React.FC<ScenarioComparisonViewProps> = ({
  baseBranch,
  targetBranch,
  onClose,
}) => {
  const { t } = useTranslation();
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'added' | 'removed' | 'modified'>('all');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');

  useEffect(() => {
    loadComparison();
  }, [baseBranch, targetBranch]);

  const loadComparison = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.sync.compareBranches(baseBranch, targetBranch);
      if (result.data) {
        setComparison(result.data);
      }
    } catch (err) {
      setError((err as Error).message || t('gitSync:compare.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const filteredDifferences = comparison?.differences.filter((diff) => {
    if (filterType !== 'all' && diff.differenceType !== filterType) {
      return false;
    }
    if (selectedEntityType !== 'all' && diff.entityType !== selectedEntityType) {
      return false;
    }
    return true;
  }) || [];

  const getEntityTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      project: 'gitSync:entityTypes.projects',
      person: 'gitSync:entityTypes.people',
      assignment: 'gitSync:entityTypes.assignments',
      project_phase: 'gitSync:entityTypes.projectPhases',
    };
    const key = labels[type];
    return key ? t(key) : type;
  };

  const getDifferenceTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      added: 'bg-green-100 text-green-800 border-green-300',
      removed: 'bg-red-100 text-red-800 border-red-300',
      modified: 'bg-blue-100 text-blue-800 border-blue-300',
    };
    return colors[type] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getDifferenceTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      added: '+',
      removed: '−',
      modified: '~',
    };
    return icons[type] || '•';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('gitSync:compare.comparing')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">{t('gitSync:compare.errorTitle')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!comparison) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('gitSync:compare.title')}</h2>
          <p className="text-gray-600 mt-1">
            {t('gitSync:compare.comparingPrefix')} <strong>{baseBranch}</strong> {t('gitSync:compare.comparingMiddle')} <strong>{targetBranch}</strong>
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t('common:close')}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-green-700">{comparison.summary.added}</div>
          <div className="text-sm text-green-600 mt-1">{t('gitSync:compare.added')}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-700">{comparison.summary.modified}</div>
          <div className="text-sm text-blue-600 mt-1">{t('gitSync:compare.modified')}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-red-700">{comparison.summary.removed}</div>
          <div className="text-sm text-red-600 mt-1">{t('gitSync:compare.removed')}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center bg-gray-50 p-4 rounded-lg">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            All ({comparison.differences.length})
          </button>
          <button
            onClick={() => setFilterType('added')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filterType === 'added' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('gitSync:compare.added')} ({comparison.summary.added})
          </button>
          <button
            onClick={() => setFilterType('modified')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filterType === 'modified' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('gitSync:compare.modified')} ({comparison.summary.modified})
          </button>
          <button
            onClick={() => setFilterType('removed')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filterType === 'removed' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t('gitSync:compare.removed')} ({comparison.summary.removed})
          </button>
        </div>

        <div className="ml-auto">
          <select
            value={selectedEntityType}
            onChange={(e) => setSelectedEntityType(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="all">{t('gitSync:compare.allTypes')}</option>
            <option value="project">{t('gitSync:entityTypes.projects')}</option>
            <option value="person">{t('gitSync:entityTypes.people')}</option>
            <option value="assignment">{t('gitSync:entityTypes.assignments')}</option>
            <option value="project_phase">{t('gitSync:entityTypes.projectPhases')}</option>
          </select>
        </div>
      </div>

      {/* Differences List */}
      <div className="space-y-2">
        {filteredDifferences.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('gitSync:compare.noDifferences')}
          </div>
        ) : (
          filteredDifferences.map((diff, index) => (
            <div
              key={`${diff.entityType}-${diff.entityId}-${index}`}
              className={`border rounded-lg p-4 ${getDifferenceTypeColor(diff.differenceType)}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold">
                  {getDifferenceTypeIcon(diff.differenceType)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{diff.entityName}</span>
                    <span className="text-xs px-2 py-0.5 bg-white rounded">
                      {getEntityTypeLabel(diff.entityType)}
                    </span>
                  </div>
                  {diff.differenceType === 'modified' && diff.modifiedFields && (
                    <div className="text-sm mt-2">
                      <span className="font-medium">{t('gitSync:compare.modifiedFields')}:</span>{' '}
                      {diff.modifiedFields.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
