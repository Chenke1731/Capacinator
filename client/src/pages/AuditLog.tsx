import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui/CustomCard';
import { DataTable } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { apiClient } from '../lib/api-client';
import { getLocale } from '../i18n';
import './AuditLog.css';

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | null | undefined;
  changed_by: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  changed_fields: string[] | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  comment: string | null;
  changed_at: string;
}

interface AuditStats {
  totalEntries: number;
  entriesByAction: Record<string, number>;
  entriesByTable: Record<string, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export function AuditLog() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    tableName: '',
    recordId: '',
    changedBy: '',
    action: '',
    fromDate: '',
    toDate: '',
    limit: 50,
    offset: 0
  });
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [undoingEntry, setUndoingEntry] = useState<string | null>(null);

  useEffect(() => {
    loadAuditData();
    loadStats();
  }, [filters]);

  const loadAuditData = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== 0) {
          queryParams.append(key, value.toString());
        }
      });

      const response = await apiClient.get(`/audit/search?${queryParams}`);
      setEntries(response.data.data || []);
      setError(null);
    } catch (err) {
      setError(t('auditLog:loadFailed'));
      console.error('Error loading audit data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/audit/stats');
      setStats(response.data.data);
    } catch (err) {
      console.error('Error loading audit stats:', err);
    }
  };

  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, offset: 0 }));
  };

  const handleUndoChange = async (tableName: string, recordId: string, comment?: string) => {
    if (!confirm(t('auditLog:undoConfirm'))) {
      return;
    }

    try {
      setUndoingEntry(`${tableName}:${recordId}`);
      await apiClient.post(`/audit/undo/${tableName}/${recordId}`, { comment });
      await loadAuditData();
      alert(t('auditLog:undoSuccess'));
    } catch (err) {
      alert(t('auditLog:undoFailed', { message: (err as any).response?.data?.error || t('auditLog:unknownError') }));
    } finally {
      setUndoingEntry(null);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const formatDate = (dateValue: string | number): string => {
    // Handle both string dates and timestamp numbers
    const date = typeof dateValue === 'number' ? new Date(dateValue) : new Date(dateValue);
    if (isNaN(date.getTime())) return t('auditLog:invalidDate');
    return date.toLocaleString(getLocale());
  };


  const columns = [
    {
      key: 'changed_at',
      header: t('auditLog:columns.dateTime'),
      render: (value: any, _entry: AuditEntry) => {
        if (value === undefined || value === null) return t('common:na');
        return formatDate(value);
      }
    },
    {
      key: 'table_name',
      header: t('auditLog:columns.table'),
      render: (value: any, _entry: AuditEntry) => {
        if (!value) return t('common:na');
        return value;
      }
    },
    {
      key: 'action',
      header: t('auditLog:columns.action'),
      render: (value: any, _entry: AuditEntry) => {
        if (!value) return t('auditLog:actions.UNKNOWN');
        return (
          <span className={`audit-action audit-action--${value.toLowerCase()}`}>
            {t(`auditLog:actions.${value}`)}
          </span>
        );
      }
    },
    {
      key: 'changed_by',
      header: t('auditLog:columns.changedBy'),
      render: (value: any, _entry: AuditEntry) => {
        return value || t('auditLog:system');
      }
    },
    {
      key: 'changed_fields',
      header: t('auditLog:columns.fieldsChanged'),
      render: (value: any, _entry: AuditEntry) => {
        if (!value || value.length === 0) return t('common:na');
        return value.join(', ');
      }
    },
    {
      key: 'actions',
      header: t('common:actions'),
      render: (value: any, entry: AuditEntry) => {
        if (!entry || !entry.id) return null;
        return (
          <div className="audit-actions">
            <button
              onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
              className="btn btn--small btn--secondary"
            >
              {expandedEntry === entry.id ? t('auditLog:hide') : t('auditLog:details')}
            </button>
            {entry.action && entry.action !== 'DELETE' && entry.table_name && entry.record_id && (
              <button
                onClick={() => handleUndoChange(entry.table_name, entry.record_id)}
                disabled={undoingEntry === `${entry.table_name}:${entry.record_id}`}
                className="btn btn--small btn--danger"
              >
                {undoingEntry === `${entry.table_name}:${entry.record_id}` ? t('auditLog:undoing') : t('auditLog:undo')}
              </button>
            )}
          </div>
        );
      }
    }
  ];

  const filterOptions = [
    {
      name: 'tableName',
      label: t('auditLog:columns.table'),
      type: 'select' as const,
      options: [
        { value: '', label: t('auditLog:filters.allTables') },
        { value: 'people', label: t('enums:resources.person') },
        { value: 'projects', label: t('enums:resources.project') },
        { value: 'roles', label: t('enums:resources.role') },
        { value: 'assignments', label: t('enums:resources.assignment') },
        { value: 'availability', label: t('enums:resources.resource') }
      ]
    },
    {
      name: 'action',
      label: t('auditLog:columns.action'),
      type: 'select' as const,
      options: [
        { value: '', label: t('auditLog:filters.allActions') },
        { value: 'CREATE', label: t('auditLog:filters.create') },
        { value: 'UPDATE', label: t('auditLog:filters.update') },
        { value: 'DELETE', label: t('auditLog:filters.delete') }
      ]
    },
    {
      name: 'changedBy',
      label: t('auditLog:filters.changedBy'),
      type: 'search' as const,
      placeholder: t('auditLog:filters.userId')
    },
    {
      name: 'recordId',
      label: t('auditLog:filters.recordId'),
      type: 'search' as const,
      placeholder: t('auditLog:filters.recordId')
    }
  ];

  if (loading && entries.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="page-container">
      <header className="page-header" role="banner">
        <div>
          <h1>{t('auditLog:title')}</h1>
          <p className="page-subtitle">{t('auditLog:subtitle')}</p>
        </div>
      </header>

      {stats && (
        <div className="audit-stats">
          <Card>
            <h3>{t('auditLog:stats.title')}</h3>
            <div className="audit-stats__grid">
              <div className="audit-stat">
                <span className="audit-stat__label">{t('auditLog:stats.totalEntries')}</span>
                <span className="audit-stat__value">{stats.totalEntries.toLocaleString(getLocale())}</span>
              </div>
              <div className="audit-stat">
                <span className="audit-stat__label">{t('auditLog:stats.dateRange')}</span>
                <span className="audit-stat__value">
                  {stats.oldestEntry && stats.newestEntry ?
                    `${formatDate(stats.oldestEntry)} - ${formatDate(stats.newestEntry)}` :
                    t('common:na')
                  }
                </span>
              </div>
            </div>
            <div className="audit-stats__breakdown">
              <div className="audit-breakdown">
                <h4>{t('auditLog:stats.byAction')}</h4>
                {Object.entries(stats.entriesByAction).map(([action, count]) => (
                  <div key={action} className="audit-breakdown__item">
                    <span className={`audit-action audit-action--${action.toLowerCase()}`}>
                      {t(`auditLog:actions.${action}`, { defaultValue: action })}
                    </span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
              <div className="audit-breakdown">
                <h4>{t('auditLog:stats.byTable')}</h4>
                {Object.entries(stats.entriesByTable).map(([table, count]) => (
                  <div key={table} className="audit-breakdown__item">
                    <span>{table}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <FilterBar
          filters={filterOptions}
          values={filters}
          onChange={(name: string, value: string) => handleFilterChange({ [name]: value })}
        />
        
        {error && <ErrorMessage message={error} />}
        
        <DataTable
          data={entries}
          columns={columns}
          loading={loading}
          emptyMessage={t('auditLog:emptyMessage')}
        />

        {entries.map(entry => (
          expandedEntry === entry.id && (
            <div key={`expanded-${entry.id}`} className="audit-details">
              <Card>
                <h4>{t('auditLog:detailsTitle')}</h4>
                <div className="audit-details__grid">
                  <div className="audit-detail">
                    <strong>{t('auditLog:detailFields.id')}</strong> {entry.id}
                  </div>
                  <div className="audit-detail">
                    <strong>{t('auditLog:detailFields.requestId')}</strong> {entry.request_id || t('common:na')}
                  </div>
                  <div className="audit-detail">
                    <strong>{t('auditLog:detailFields.ipAddress')}</strong> {entry.ip_address || t('common:na')}
                  </div>
                  <div className="audit-detail">
                    <strong>{t('auditLog:detailFields.userAgent')}</strong> {entry.user_agent || t('common:na')}
                  </div>
                  {entry.comment && (
                    <div className="audit-detail audit-detail--full">
                      <strong>{t('auditLog:detailFields.comment')}</strong> {entry.comment}
                    </div>
                  )}
                </div>

                {entry.old_values && (
                  <div className="audit-values">
                    <h5>{t('auditLog:oldValues')}</h5>
                    <pre className="audit-values__json">
                      {formatValue(entry.old_values)}
                    </pre>
                  </div>
                )}

                {entry.new_values && (
                  <div className="audit-values">
                    <h5>{t('auditLog:newValues')}</h5>
                    <pre className="audit-values__json">
                      {formatValue(entry.new_values)}
                    </pre>
                  </div>
                )}
              </Card>
            </div>
          )
        ))}
        
        <div className="audit-pagination">
          <button
            onClick={() => handleFilterChange({ offset: Math.max(0, filters.offset - filters.limit) })}
            disabled={filters.offset === 0 || loading}
            className="btn btn--secondary"
          >
            {t('common:previous')}
          </button>
          <span className="audit-pagination__info">
            {t('auditLog:paginationInfo', {
              from: filters.offset + 1,
              to: Math.min(filters.offset + filters.limit, filters.offset + entries.length),
            })}
          </span>
          <button
            onClick={() => handleFilterChange({ offset: filters.offset + filters.limit })}
            disabled={entries.length < filters.limit || loading}
            className="btn btn--secondary"
          >
            {t('common:next')}
          </button>
        </div>
      </Card>
    </div>
  );
}