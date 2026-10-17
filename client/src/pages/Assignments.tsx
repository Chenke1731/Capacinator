import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Eye, Calendar, AlertTriangle, Users } from 'lucide-react';
import { useBookmarkableTabs } from '../hooks/useBookmarkableTabs';
import { getLocale } from '../i18n';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { DataTable, Column } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { AssignmentModalNew } from '../components/modals/AssignmentModalNew';
import { InlineEdit } from '../components/ui/InlineEdit';
import { useScenario } from '../contexts/ScenarioContext';
import { logger } from '../services/logger';
import type { ProjectAssignment, Role } from '../types';
import './Assignments.css';


export default function Assignments() {

  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { currentScenario } = useScenario();
  const [contextMessage, setContextMessage] = useState<string | null>(null);

  // Define assignments tabs configuration。
  // 2026-10-16 缺口④: recommendations tab 整体移除——组合级推荐引擎从未
  // 实装(后端恒空+假执行成功),假 UI 不得留着诱发下一个占位后端;
  // ?tab=recommendations 旧书签经 useBookmarkableTabs 回落默认 tab。
  // 真实推荐引擎(含 UI 重设计)归 IP-09/自动排程后续包
  const assignmentTabs = useMemo(() => [
    { id: 'assignments', label: t('assignments:tabs.assignments') }
  ], [t]);

  // Use bookmarkable tabs for assignments
  const { activeTab, setActiveTab, isActiveTab } = useBookmarkableTabs({
    tabs: assignmentTabs,
    defaultTab: 'assignments'
  });
  const [filters, setFilters] = useState({
    search: '',
    project_id: '',
    person_id: '',
    role_id: '',
    date_range: ''
  });
  
  // Use state directly instead of useModal hook to avoid re-render issues
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ProjectAssignment | null>(null);

  // Handle contextual messages from URL parameters
  useEffect(() => {
    const action = searchParams.get('action');
    const from = searchParams.get('from');
    const personName = searchParams.get('personName');
    const roleName = searchParams.get('roleName');
    const status = searchParams.get('status');

    // U03: person=ID 自动应用为列表过滤(减负/指派/容量报表跳转带上下文)
    const personId = searchParams.get('person');
    if (personId) {
      setFilters((prev) => (prev.person_id === personId ? prev : { ...prev, person_id: personId }));
    }

    if (action && from) {
      let message = '';

      if (action === 'assign' && personName) {
        message = t('assignments:contextMessage.assign', { name: personName, status: status || t('assignments:contextMessage.underutilized') });
      } else if (action === 'reduce-load' && personName) {
        message = t('assignments:contextMessage.reduceLoad', { name: personName, status: status || t('assignments:contextMessage.overutilized') });
      } else if (action === 'hire' && roleName) {
        message = t('assignments:contextMessage.hire', { role: roleName });
      } else if (action === 'add-resources') {
        message = t('assignments:contextMessage.addResources');
      }
      
      if (message) {
        setContextMessage(message);
        // Auto-clear the message after 5 seconds
        setTimeout(() => setContextMessage(null), 5000);
      }
    }
  }, [searchParams]);

  // Fetch assignments - will refetch when scenario changes
  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError } = useQuery({
    queryKey: queryKeys.assignments.list(filters, currentScenario?.id),
    queryFn: async () => {
      const params = Object.entries(filters)
        .filter(([_, value]) => value)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      const response = await api.assignments.list({ ...params, limit: 2000 });
      return response.data.data as ProjectAssignment[];
    },
    enabled: !!currentScenario // Only fetch when a scenario is selected
  });

  // Fetch projects for filter - will refetch when scenario changes
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(undefined, currentScenario?.id),
    queryFn: async () => {
      const response = await api.projects.list({ limit: 500 });
      return response.data;
    },
    enabled: !!currentScenario
  });

  // Fetch people for filter
  const { data: people } = useQuery({
    queryKey: queryKeys.people.list(),
    queryFn: async () => {
      const response = await api.people.list({ limit: 500 });
      const payload = response.data as any;
      // Shared ['people'] cache must always hold an array
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch roles for filter
  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      // Shared ['roles'] cache must always hold an array — raw envelopes here
      // have crashed other consumers (roles?.find is not a function)
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.assignments.delete(assignmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
    }
  });

  // Update assignment mutation for inline editing
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProjectAssignment> & { expected_version?: number } }) => {
      await api.assignments.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
    },
    onError: (error) => {
      logger.error('Failed to update assignment', { error });
      // IP-07c: 409=他人已改(载荷含当前值),草稿保留在编辑器里待用户重审
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        const current = (error as { response?: { data?: { current?: { allocation_percentage?: number } } } })
          ?.response?.data?.current?.allocation_percentage;
        alert(t('assignments:errors.versionConflict', { current: current ?? '?' }));
        return;
      }
      alert(t('assignments:errors.updateFailed'));
    }
  });

  const handleDeleteAssignment = (assignmentId: string, assignmentInfo: string) => {
    if (confirm(t('assignments:deleteConfirm', { name: assignmentInfo }))) {
      deleteAssignmentMutation.mutate(assignmentId);
    }
  };

  const handleEditAssignment = (assignment: ProjectAssignment) => {
    setEditingAssignment(assignment);
    setIsEditModalOpen(true);
  };

  const handleAssignmentSuccess = () => {
    // Both modals will close automatically via onClose
    setEditingAssignment(null);
  };

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      project_id: '',
      person_id: '',
      role_id: '',
      date_range: ''
    });
  };

  const formatDate = (date?: string) => {
    return date ? new Date(date).toLocaleDateString(getLocale()) : '—';
  };

  const getDateModeLabel = (mode?: string) =>
    mode === 'phase' ? t('assignments:dateMode.phase')
    : mode === 'project' ? t('assignments:dateMode.project')
    : t('assignments:dateMode.fixed');

  // Raw (lowercase in English) date-mode value used inside the computed-date tooltip
  const getComputedDateModeLabel = (mode?: string) =>
    mode === 'phase' ? t('assignments:computedDateMode.phase')
    : mode === 'project' ? t('assignments:computedDateMode.project')
    : t('assignments:computedDateMode.fixed');

  const columns: Column<ProjectAssignment>[] = [
    {
      key: 'project_name',
      header: t('assignments:columns.project'),
      sortable: true,
      render: (value, row) => {
        const startDate = row.computed_start_date || row.start_date;
        const endDate = row.computed_end_date || row.end_date;
        const modeLabel = getDateModeLabel(row.assignment_date_mode);

        return (
          <div className="project-info" style={{ minWidth: '200px' }}>
            <div className="project-name" style={{
              fontWeight: '500',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap'
            }}>
              <span>{value}</span>
              {row.assignment_type === 'scenario' && (
                <span className="scenario-badge" style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary-text)',
                  fontWeight: '500',
                  whiteSpace: 'nowrap'
                }}>
                  {row.scenario_name || t('assignments:scenario')}
                </span>
              )}
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap'
            }}>
              <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
              <span className="assignment-mode-badge">{modeLabel}</span>
            </div>
          </div>
        );
      }
    },
    {
      key: 'person_name',
      header: t('assignments:columns.person'),
      sortable: true,
      render: (value, row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {value}
          {(row as any).status === 'paused' && (
            <span className="lifecycle-state-badge lifecycle-state-badge--nok">
              {t('people:details.paused')}
            </span>
          )}
        </span>
      )
    },
    {
      key: 'role_name',
      header: t('assignments:columns.role'),
      sortable: true,
      render: (value, row) => (
        <InlineEdit
          value={row.role_id}
          onSave={(newRoleId) => {
            updateAssignmentMutation.mutate({
              id: row.id,
              data: { role_id: newRoleId as string, expected_version: row.version }
            });
          }}
          type="select"
          options={Array.isArray(roles) ? roles.map((role: Role) => ({
            value: role.id,
            label: role.name
          })) : []}
          renderValue={() => value}
        />
      )
    },
    {
      key: 'allocation_percentage',
      header: t('assignments:columns.allocation'),
      sortable: true,
      render: (value, row) => {
        const getBadgeStyle = (percentage: number) => {
          if (percentage > 100) {
            return {
              backgroundColor: 'var(--status-danger-solid)',
              color: 'var(--solid-foreground)',
              border: '1px solid var(--status-danger-border)'
            };
          } else if (percentage >= 80) {
            return {
              backgroundColor: 'var(--status-warning-solid)',
              color: 'var(--solid-foreground)',
              border: '1px solid var(--status-warning-solid)'
            };
          } else {
            return {
              backgroundColor: 'var(--status-success-solid)',
              color: 'var(--solid-foreground)',
              border: '1px solid var(--status-success-solid)'
            };
          }
        };

        return (
          <div className="allocation-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '0.875rem',
              minWidth: '80px',
              justifyContent: 'center',
              ...getBadgeStyle(value)
            }}>
              <input
                type="number"
                defaultValue={value}
                onChange={(e) => {
                  const newValue = Number(e.target.value);
                  if (newValue < 0) e.target.value = '0';
                  if (newValue > 200) e.target.value = '200';
                }}
                onBlur={(e) => {
                  const newValue = Number(e.target.value);
                  if (newValue !== value && newValue >= 0 && newValue <= 200) {
                    updateAssignmentMutation.mutate({
                      id: row.id,
                      data: { allocation_percentage: newValue, expected_version: row.version }
                    });
                  }
                  e.target.style.borderColor = 'transparent';
                  e.target.style.background = 'transparent';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    e.currentTarget.value = value.toString();
                    e.currentTarget.blur();
                  }
                }}
                min={0}
                max={200}
                className="inline-edit-input"
                style={{
                  width: '45px',
                  padding: '0',
                  border: 'none',
                  borderRadius: '4px',
                  background: 'transparent',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontWeight: 'inherit',
                  fontSize: 'inherit'
                }}
                onFocus={(e) => {
                  e.target.style.background = 'color-mix(in srgb, var(--solid-foreground) 20%, transparent)';
                  e.target.select();
                }}
              />
              <span>%</span>
            </div>
            {value > 100 && <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />}
          </div>
        );
      }
    },
    {
      key: 'start_date',
      header: t('common:startDate'),
      sortable: true,
      render: (value, row) => {
        const dateValue = row.computed_start_date || value;
        const isComputed = row.assignment_date_mode !== 'fixed';
        return (
          <input
            type="date"
            defaultValue={dateValue}
            onBlur={(e) => {
              if (!isComputed && e.target.value !== dateValue) {
                updateAssignmentMutation.mutate({
                  id: row.id,
                  data: { start_date: e.target.value, expected_version: row.version }
                });
              }
              e.target.style.borderColor = 'transparent';
              e.target.style.background = 'transparent';
            }}
            disabled={isComputed}
            className="inline-edit-input"
            style={{
              width: '140px',
              padding: '4px 8px',
              border: '1px solid transparent',
              borderRadius: '4px',
              background: 'transparent',
              transition: 'all 0.2s',
              cursor: isComputed ? 'not-allowed' : 'pointer',
              opacity: isComputed ? 0.7 : 1
            }}
            onFocus={(e) => {
              if (!isComputed) {
                e.target.style.borderColor = 'var(--primary-color)';
                e.target.style.background = 'var(--bg-secondary)';
              }
            }}
            title={isComputed ? t('assignments:computedDateTitle', { mode: getComputedDateModeLabel(row.assignment_date_mode) }) : t('assignments:clickToEdit')}
          />
        );
      }
    },
    {
      key: 'end_date',
      header: t('common:endDate'),
      sortable: true,
      render: (value, row) => {
        const dateValue = row.computed_end_date || value;
        const isComputed = row.assignment_date_mode !== 'fixed';
        return (
          <input
            type="date"
            defaultValue={dateValue}
            onBlur={(e) => {
              if (!isComputed && e.target.value !== dateValue) {
                updateAssignmentMutation.mutate({
                  id: row.id,
                  data: { end_date: e.target.value, expected_version: row.version }
                });
              }
              e.target.style.borderColor = 'transparent';
              e.target.style.background = 'transparent';
            }}
            disabled={isComputed}
            className="inline-edit-input"
            style={{
              width: '140px',
              padding: '4px 8px',
              border: '1px solid transparent',
              borderRadius: '4px',
              background: 'transparent',
              transition: 'all 0.2s',
              cursor: isComputed ? 'not-allowed' : 'pointer',
              opacity: isComputed ? 0.7 : 1
            }}
            onFocus={(e) => {
              if (!isComputed) {
                e.target.style.borderColor = 'var(--primary-color)';
                e.target.style.background = 'var(--bg-secondary)';
              }
            }}
            title={isComputed ? t('assignments:computedDateTitle', { mode: getComputedDateModeLabel(row.assignment_date_mode) }) : t('assignments:clickToEdit')}
          />
        );
      }
    },
    {
      key: 'duration',
      header: t('assignments:columns.duration'),
      render: (_, row) => {
        const startDate = row.computed_start_date || row.start_date;
        const endDate = row.computed_end_date || row.end_date;
        if (!startDate || !endDate) return '—';
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const weeks = Math.round(days / 7);
        return weeks > 0 ? t('assignments:durationWeeks', { weeks }) : t('assignments:durationDays', { days });
      }
    },
    {
      key: 'notes',
      header: t('assignments:columns.notes'),
      render: (value, row) => (
        <input
          type="text"
          defaultValue={value || ''}
          placeholder={t('assignments:notesPlaceholder')}
          onBlur={(e) => {
            const newValue = e.target.value;
            if (newValue !== (value || '')) {
              updateAssignmentMutation.mutate({
                id: row.id,
                data: { notes: newValue, expected_version: row.version }
              });
            }
            e.target.style.borderColor = 'transparent';
            e.target.style.background = 'transparent';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.currentTarget.value = value || '';
              e.currentTarget.blur();
            }
          }}
          className="inline-edit-input"
          style={{
            width: '100%',
            padding: '4px 8px',
            border: '1px solid transparent',
            borderRadius: '4px',
            background: 'transparent',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--primary-color)';
            e.target.style.background = 'var(--bg-secondary)';
          }}
        />
      )
    },
    {
      key: 'actions',
      header: t('common:actions'),
      width: '290px',
      render: (_, row) => (
        <div className="table-actions">
          <button
            className="btn table-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/projects/${row.project_id}`);
            }}
            title={t('assignments:viewProject')}
          >
            <Eye size={14} />
            {t('assignments:viewProject')}
          </button>
          <button
            className="btn table-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleEditAssignment(row);
            }}
            title={t('common:edit')}
          >
            <Edit2 size={14} />
            {t('common:edit')}
          </button>
          <button
            className="btn table-action-btn btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteAssignment(row.id, `${row.person_name} - ${row.project_name}`);
            }}
            title={t('common:delete')}
          >
            <Trash2 size={14} />
            {t('common:delete')}
          </button>
        </div>
      )
    }
  ];

  const filterConfig = [
    {
      name: 'search',
      label: t('common:search'),
      type: 'search' as const,
      placeholder: t('assignments:searchPlaceholder')
    },
    {
      name: 'project_id',
      label: t('assignments:fields.project'),
      type: 'select' as const,
      options: projects?.data?.map(project => ({ value: project.id, label: project.name })) || []
    },
    {
      name: 'person_id',
      label: t('assignments:fields.person'),
      type: 'select' as const,
      options: (Array.isArray(people) ? people : (people as any)?.data)?.map((person: any) => ({ value: person.id, label: person.name })) || []
    },
    {
      name: 'role_id',
      label: t('assignments:fields.role'),
      type: 'select' as const,
      options: Array.isArray(roles) ? roles.map(role => ({ value: role.id, label: role.name })) : []
    },
    {
      name: 'date_range',
      label: t('assignments:filters.dateRange'),
      type: 'select' as const,
      options: [
        { value: 'current', label: t('assignments:filters.current') },
        { value: 'upcoming', label: t('assignments:filters.upcoming') },
        { value: 'past', label: t('assignments:filters.past') },
        { value: 'this_month', label: t('assignments:filters.thisMonth') },
        { value: 'next_month', label: t('assignments:filters.nextMonth') }
      ]
    }
  ];

  if (assignmentsLoading) {
    return <LoadingSpinner />;
  }

  if (assignmentsError) {
    return <ErrorMessage message={t('assignments:errors.loadFailed')} details={assignmentsError.message} />;
  }

  const renderAssignmentsTab = () => (
    <>
      <FilterBar
        filters={filterConfig}
        values={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      <DataTable
        data={assignments || []}
        columns={columns}
        // clicking a row opens the edit dialog — /assignments/:id is a redirect-only
        // route, so navigating there was a pointless round trip
        onRowClick={handleEditAssignment}
        itemsPerPage={20}
        // paused rows stay visible (resumable) but greyed — they left capacity math
        rowClassName={(row) => (row as any).status === 'paused' ? 'opacity-55' : undefined}
      />
    </>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('assignments:title')}</h1>
          <p className="text-muted">{t('assignments:subtitle')}</p>
          {contextMessage && (
            <div className="context-message">
              <AlertTriangle size={16} />
              {contextMessage}
            </div>
          )}
        </div>
        <div className="header-actions">
          {activeTab === 'assignments' && (
            <>
              <button
                className="btn btn-primary"
                onClick={() => setIsAddModalOpen(true)}
              >
                <Plus size={16} />
                {t('assignments:newAssignment')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/assignments/calendar')}
              >
                <Calendar size={16} />
                {t('assignments:calendarView')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation" style={{
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`tab-button ${isActiveTab('assignments') ? 'active' : ''}`}
            onClick={() => setActiveTab('assignments')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              borderBottom: `2px solid ${activeTab === 'assignments' ? 'var(--primary-color)' : 'transparent'}`,
              color: activeTab === 'assignments' ? 'var(--primary-color)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'assignments' ? '600' : '400',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Users size={16} />
            {t('assignments:tabs.assignmentsCount', { number: assignments?.length || 0 })}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {renderAssignmentsTab()}

      {/* Add Assignment Modal */}
      <AssignmentModalNew
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
        }}
        onSuccess={handleAssignmentSuccess}
      />

      {/* Edit Assignment Modal */}
      <AssignmentModalNew
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingAssignment(null);
        }}
        onSuccess={handleAssignmentSuccess}
        editingAssignment={editingAssignment}
      />
      
      {/* Add spinner animation styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
