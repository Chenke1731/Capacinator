import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Eye, Calendar, AlertTriangle, Lightbulb, Play, Users, TrendingUp } from 'lucide-react';
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
  // console.log('Assignments component rendering');

  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { currentScenario } = useScenario();
  const [contextMessage, setContextMessage] = useState<string | null>(null);

  // Define assignments tabs configuration
  const assignmentTabs = useMemo(() => [
    { id: 'assignments', label: t('assignments:tabs.assignments') },
    { id: 'recommendations', label: t('assignments:tabs.recommendations') }
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
      const response = await api.assignments.list(params);
      return response.data.data as ProjectAssignment[];
    },
    enabled: !!currentScenario // Only fetch when a scenario is selected
  });

  // Fetch projects for filter - will refetch when scenario changes
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(undefined, currentScenario?.id),
    queryFn: async () => {
      const response = await api.projects.list();
      return response.data;
    },
    enabled: !!currentScenario
  });

  // Fetch people for filter
  const { data: people } = useQuery({
    queryKey: queryKeys.people.list(),
    queryFn: async () => {
      const response = await api.people.list();
      return response.data;
    }
  });

  // Fetch roles for filter
  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      return response.data as Role[];
    }
  });

  // Fetch recommendations
  const { data: recommendationsData, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useQuery({
    queryKey: queryKeys.assignments.recommendations(filters),
    queryFn: async () => {
      const params = {
        startDate: filters.date_range ? filters.date_range.split('_')[0] : undefined,
        endDate: filters.date_range ? filters.date_range.split('_')[1] : undefined,
        maxRecommendations: 15
      };
      const response = await api.recommendations.list(params);
      return response.data;
    },
    enabled: activeTab === 'recommendations'
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProjectAssignment> }) => {
      await api.assignments.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
    },
    onError: (error) => {
      logger.error('Failed to update assignment', { error });
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(getLocale());
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
                  color: 'var(--primary-dark)',
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
      sortable: true
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
              data: { role_id: newRoleId as string }
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
              backgroundColor: 'var(--danger)',
              color: 'white',
              border: '1px solid var(--danger)'
            };
          } else if (percentage >= 80) {
            return {
              backgroundColor: 'var(--warning)',
              color: 'white',
              border: '1px solid var(--warning)'
            };
          } else {
            return {
              backgroundColor: 'var(--success)',
              color: 'white',
              border: '1px solid var(--success)'
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
                      data: { allocation_percentage: newValue }
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
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
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
                  data: { start_date: e.target.value }
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
                  data: { end_date: e.target.value }
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
                data: { notes: newValue }
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
      width: '360px',
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
            <Eye size={18} />
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
            <Edit2 size={18} />
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
            <Trash2 size={18} />
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
      options: people?.data?.map(person => ({ value: person.id, label: person.name })) || []
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
        onRowClick={(row) => navigate(`/assignments/${row.id}`)}
        itemsPerPage={20}
      />
    </>
  );

  const renderRecommendationsTab = () => {
    if (recommendationsLoading) {
      return <LoadingSpinner />;
    }

    const recommendations = recommendationsData?.recommendations || [];
    const currentState = recommendationsData?.current_state;

    const priorityLabels: Record<string, string> = {
      high: t('assignments:rec.priority.high'),
      medium: t('assignments:rec.priority.medium'),
      low: t('assignments:rec.priority.low')
    };

    return (
      <div className="recommendations-container">
        {/* Current State Summary */}
        {currentState && (
          <div className="current-state-summary" style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
              <TrendingUp size={20} style={{ marginRight: '0.5rem' }} />
              {t('assignments:rec.systemState')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="state-metric">
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: currentState.summary?.overallocated_people > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {currentState.summary?.overallocated_people || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('assignments:rec.overallocatedPeople')}</div>
              </div>
              <div className="state-metric">
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: currentState.summary?.underutilized_people > 0 ? 'var(--warning)' : 'var(--success)' }}>
                  {currentState.summary?.underutilized_people || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('assignments:rec.underutilizedPeople')}</div>
              </div>
              <div className="state-metric">
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: currentState.summary?.capacity_gaps > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {currentState.summary?.capacity_gaps || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('assignments:rec.capacityGaps')}</div>
              </div>
              <div className="state-metric">
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {currentState.summary?.unassigned_projects || 0}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('assignments:rec.unassignedProjects')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Recommendations List */}
        {recommendations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Lightbulb size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <h3>{t('assignments:rec.emptyTitle')}</h3>
            <p>{t('assignments:rec.emptyDescription')}</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table recommendations-table">
              <thead>
                <tr>
                  <th style={{ width: '6%', minWidth: '80px' }}>{t('assignments:rec.headers.priority')}</th>
                  <th style={{ width: '12%', minWidth: '150px' }}>{t('assignments:columns.person')}</th>
                  <th style={{ width: '20%', minWidth: '250px' }}>{t('assignments:columns.project')}</th>
                  <th style={{ width: '10%', minWidth: '120px' }}>{t('assignments:columns.role')}</th>
                  <th style={{ width: '8%', minWidth: '80px' }}>{t('assignments:columns.allocation')}</th>
                  <th style={{ width: '12%', minWidth: '140px' }}>{t('assignments:rec.headers.period')}</th>
                  <th style={{ width: '8%', minWidth: '80px' }}>{t('assignments:rec.headers.confidence')}</th>
                  <th style={{ width: '18%' }}>{t('assignments:rec.headers.impact')}</th>
                  <th style={{ width: '6%', minWidth: '100px' }}>{t('common:actions')}</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => {
                  // For simple recommendations, extract the first action details
                  const primaryAction = rec.actions[0];
                  const startDate = primaryAction?.start_date ? new Date(primaryAction.start_date).toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' }) : '';
                  const endDate = primaryAction?.end_date ? new Date(primaryAction.end_date).toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' }) : '';
                  
                  return (
                    <tr key={rec.id}>
                      <td>
                        <span className={`priority-badge ${rec.priority}`}>
                          {priorityLabels[rec.priority] || rec.priority}
                        </span>
                      </td>
                      <td>
                        <div className="person-info">
                          <strong>{primaryAction?.person_name || t('assignments:rec.multiple')}</strong>
                          {rec.type === 'complex' && (
                            <span className="text-secondary text-sm"> {t('assignments:rec.more', { number: rec.actions.length - 1 })}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="project-info">
                          <span title={primaryAction?.project_name}>
                            {primaryAction?.project_name || t('assignments:rec.multipleProjects')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="role-badge">
                          {primaryAction?.role_name || t('assignments:rec.various')}
                        </span>
                      </td>
                      <td>
                        <div className="allocation-info">
                          <strong>{primaryAction?.new_allocation || '-'}%</strong>
                        </div>
                      </td>
                      <td>
                        <div className="period-info text-sm">
                          {startDate && endDate ? `${startDate} - ${endDate}` : t('assignments:rec.tbd')}
                        </div>
                      </td>
                      <td>
                        <span className="confidence-badge">
                          {Math.round(rec.confidence_score)}%
                        </span>
                      </td>
                      <td>
                        <div className="impact-info text-sm">
                          {rec.impact_summary}
                        </div>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={async () => {
                              const confirmed = window.confirm(
                                t('assignments:rec.executeConfirm', { title: rec.title, number: rec.actions.length })
                              );
                              
                              if (confirmed) {
                                try {
                                  await api.recommendations.execute(rec.id, rec.actions);
                                  queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
                                  refetchRecommendations();
                                } catch (error) {
                                  logger.error('Failed to execute recommendation', { error });
                                  alert(t('assignments:rec.executeFailed'));
                                }
                              }
                            }}
                            title={rec.title}
                          >
                            <Play size={14} />
                            {t('assignments:rec.execute')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

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
          {activeTab === 'recommendations' && (
            <button
              className="btn btn-secondary"
              onClick={refetchRecommendations}
            >
              <Lightbulb size={16} />
              {t('assignments:rec.refresh')}
            </button>
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
          <button
            className={`tab-button ${isActiveTab('recommendations') ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendations')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              borderBottom: `2px solid ${activeTab === 'recommendations' ? 'var(--primary-color)' : 'transparent'}`,
              color: activeTab === 'recommendations' ? 'var(--primary-color)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'recommendations' ? '600' : '400',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Lightbulb size={16} />
            {t('assignments:tabs.recommendations')} {recommendationsData?.recommendations?.length > 0 ? `(${recommendationsData.recommendations.length})` : ''}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'assignments' ? renderAssignmentsTab() : renderRecommendationsTab()}

      {/* Add Assignment Modal */}
      <AssignmentModalNew
        isOpen={isAddModalOpen}
        onClose={() => {
          // console.log('Modal close called');
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