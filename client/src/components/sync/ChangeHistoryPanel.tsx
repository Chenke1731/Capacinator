/**
 * Change History Panel Component
 * Feature: 001-git-sync-integration
 * Task: T081
 *
 * Displays commit log as a timeline
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';
import { getLocale } from '../../i18n';

interface Commit {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

interface ChangeHistoryPanelProps {
  entityType?: 'project' | 'person' | 'assignment' | 'project_phase';
  entityId?: string;
  maxCount?: number;
}

export const ChangeHistoryPanel: React.FC<ChangeHistoryPanelProps> = ({
  entityType,
  entityId,
  maxCount = 20,
}) => {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [entityType, entityId, maxCount]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const params: any = { limit: maxCount };
      if (entityType && entityId) {
        params.entityType = entityType;
        params.entityId = entityId;
      }

      const result = await api.sync.getHistory(params);
      if (result.data) {
        setCommits(result.data);
      }
    } catch (err) {
      setError((err as Error).message || t('gitSync:history.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return t('gitSync:history.todayAt', { time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    } else if (diffDays === 1) {
      return t('gitSync:history.yesterdayAt', { time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    } else if (diffDays < 7) {
      return t('gitSync:history.daysAgo', { count: diffDays });
    } else {
      return date.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">{t('gitSync:history.errorTitle')}</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">📜</div>
        <p>{t('gitSync:history.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('gitSync:history.changeHistory')}</h3>
        <button
          onClick={loadHistory}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          {loading ? t('gitSync:history.refreshing') : `↻ ${t('common:refresh')}`}
        </button>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* Timeline items */}
        <div className="space-y-6">
          {commits.map((commit, _index) => (
            <div key={commit.hash} className="relative flex gap-4">
              {/* Timeline dot */}
              <div className="relative z-10 flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm">
                  {getInitials(commit.author_name)}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{commit.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                      <span>{commit.author_name}</span>
                      <span>•</span>
                      <span>{formatDate(commit.date)}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <span className="inline-block px-2 py-1 text-xs font-mono bg-gray-100 text-gray-600 rounded">
                      {commit.hash.substring(0, 7)}
                    </span>
                  </div>
                </div>

                {/* Show commit author email on hover */}
                <div className="text-xs text-gray-500">
                  {commit.author_email}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {commits.length >= maxCount && (
        <div className="text-center pt-4 text-sm text-gray-500">
          {t('gitSync:history.showingLatest', { count: maxCount })}
        </div>
      )}
    </div>
  );
};
