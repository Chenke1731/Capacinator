import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Edit2, Eye, Users, UserPlus, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import i18n from '../i18n';
import { DataTable, Column } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import PersonModal from '../components/modals/PersonModal';
import { SmartAssignmentModal } from '../components/modals/SmartAssignmentModal';
import { useModal } from '../hooks/useModal';
import type { Person, Role, Location } from '../types';
import './People.css';

export default function People() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    primary_role_id: '', // API filter name still uses this for backwards compatibility
    worker_type: '',
    location: ''
  });
  
  const addPersonModal = useModal();
  const editPersonModal = useModal();
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  
  // Smart assignment modal state
  const [smartAssignmentModalOpen, setSmartAssignmentModalOpen] = useState(false);
  const [assignmentPersonId, setAssignmentPersonId] = useState<string | undefined>();
  const [assignmentTriggerContext, setAssignmentTriggerContext] = useState<'workload_action' | 'manual_add' | 'quick_assign'>('quick_assign');
  const [assignmentActionType, setAssignmentActionType] = useState('');

  // Fetch people
  const { data: people, isLoading: peopleLoading, error: peopleError } = useQuery({
    queryKey: queryKeys.people.list(filters),
    queryFn: async () => {
      const params = Object.entries(filters)
        .filter(([_, value]) => value)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      const response = await api.people.list(params);
      return response.data.data as Person[];
    }
  });

  // Fetch utilization data for actionable insights.
  // The endpoint returns a bare array; normalize to { personUtilization } so
  // downstream consumers always see one shape.
  const { data: utilizationData } = useQuery({
    queryKey: queryKeys.people.utilization(),
    queryFn: async () => {
      const response = await api.people.getUtilization();
      const payload = response.data;
      if (Array.isArray(payload)) {
        return { personUtilization: payload };
      }
      return payload;
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

  // Fetch locations for filter
  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: async () => {
      const response = await api.locations.list();
      return response.data.data as Location[];
    }
  });

  // Delete person mutation (reserved for future delete functionality)
   
  const deletePersonMutation = useMutation({
    mutationFn: async (personId: string) => {
      await api.people.delete(personId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeletePerson = (personId: string, personName: string) => {
    if (confirm(t('people:deleteConfirmation', { name: personName }))) {
      deletePersonMutation.mutate(personId);
    }
  };

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    editPersonModal.open();
  };

  const handlePersonSuccess = () => {
    // Both modals will close automatically via onClose
    setEditingPerson(null);
  };

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      primary_role_id: '', // API filter name still uses this for backwards compatibility
      worker_type: '',
      location: ''
    });
  };

  const getWorkerTypeBadgeClass = (workerType: string) => {
    switch (workerType) {
      case 'FTE': return 'badge badge-success';
      case 'Contractor': return 'badge badge-warning';
      case 'Consultant': return 'badge badge-primary';
      default: return 'badge';
    }
  };

  // Localized display label for a worker type value, falling back to the raw value
  const workerTypeLabel = (workerType: string) => {
    const key = `people:workerTypes.${workerType}`;
    return i18n.exists(key) ? t(key) : workerType;
  };

  const getAvailabilityColor = (availability: number) => {
    if (availability >= 90) return 'text-success';
    if (availability >= 70) return 'text-warning';
    return 'text-danger';
  };

  // Enhanced logic for actionable insights
  const getPersonInsights = (personId: string) => {
    const utilization = utilizationData?.personUtilization?.find(
      (u: any) => u.person_id === personId
    );
    
    if (!utilization) {
      return {
        status: 'unknown',
        color: 'gray',
        icon: Eye,
        action: t('common:viewDetails'),
        actionType: 'view'
      };
    }

    const allocation = utilization.total_allocation_percentage ?? utilization.total_allocation ?? 0;
    const availability = utilization.current_availability_percentage;
    const utilizationPercentage = availability > 0 ? (allocation / availability) * 100 : 0;

    if (utilizationPercentage > 100) {
      return {
        status: 'over_allocated',
        color: 'danger',
        icon: AlertTriangle,
        action: t('people:quickActions.reduceLoad'),
        actionType: 'reduce_workload',
        percentage: utilizationPercentage
      };
    } else if (utilizationPercentage >= 80) {
      return {
        status: 'fully_allocated',
        color: 'warning',
        icon: TrendingUp,
        action: t('people:quickActions.monitor'),
        actionType: 'monitor',
        percentage: utilizationPercentage
      };
    } else if (utilizationPercentage >= 40) {
      return {
        status: 'under_allocated',
        color: 'info',
        icon: UserPlus,
        action: t('people:quickActions.assignMore'),
        actionType: 'assign_more',
        percentage: utilizationPercentage
      };
    } else {
      return {
        status: 'available',
        color: 'success',
        icon: CheckCircle,
        action: t('people:quickActions.assignProject'),
        actionType: 'assign_project',
        percentage: utilizationPercentage
      };
    }
  };

  const handleQuickAction = (actionType: string, personId: string) => {
    switch (actionType) {
      case 'reduce_workload':
        navigate(`/assignments?person=${personId}&action=reduce`);
        break;
      case 'assign_more':
      case 'assign_project':
        setAssignmentPersonId(personId);
        setAssignmentTriggerContext('quick_assign');
        setAssignmentActionType(actionType);
        setSmartAssignmentModalOpen(true);
        break;
      case 'monitor':
        navigate(`/reports?type=utilization&person=${personId}`);
        break;
      case 'view':
      default:
        navigate(`/people/${personId}`);
        break;
    }
  };

  // Summary insights for the page header
  const teamInsights = useMemo(() => {
    if (!utilizationData?.personUtilization || !people) {
      return { overAllocated: 0, available: 0, total: people?.length || 0 };
    }
    
    const overAllocated = utilizationData.personUtilization.filter(
      (u: any) => u.allocation_status === 'OVER_ALLOCATED'
    ).length;
    
    const available = utilizationData.personUtilization.filter(
      (u: any) => u.allocation_status === 'UNDER_ALLOCATED' || (u.total_allocation_percentage ?? u.total_allocation ?? 0) < 40
    ).length;
    
    return {
      overAllocated,
      available,
      total: people.length
    };
  }, [utilizationData, people]);

  const columns: Column<Person>[] = [
    {
      key: 'name',
      header: t('common:name'),
      sortable: true,
      render: (value, row) => (
        <div className="person-name">
          <Link to={`/people/${row.id}`} className="name">
            {value}
          </Link>
          {row.email && <span className="email text-muted">{row.email}</span>}
        </div>
      )
    },
    {
      key: 'primary_role_name',
      header: t('people:columns.primaryRole'),
      sortable: true
    },
    {
      key: 'worker_type',
      header: t('people:columns.type'),
      sortable: true,
      render: (value) => (
        <span className={getWorkerTypeBadgeClass(value)}>
          {workerTypeLabel(value)}
        </span>
      )
    },
    {
      key: 'location_name',
      header: t('people:columns.location'),
      sortable: true,
      render: (value) => value || '-'
    },
    {
      key: 'default_availability_percentage',
      header: t('people:columns.availability'),
      sortable: true,
      render: (value) => (
        <span className={getAvailabilityColor(value)}>
          {value}%
        </span>
      )
    },
    {
      key: 'default_hours_per_day',
      header: t('people:columns.hoursPerDay'),
      sortable: true,
      render: (value) => `${value}h`
    },
    {
      key: 'utilization',
      header: t('people:columns.workload'),
      width: '140px',
      render: (_, row) => {
        const insights = getPersonInsights(row.id);
        const IconComponent = insights.icon;

        return (
          <div className="workload-status">
            <div className={`status-indicator status-${insights.color}`}>
              <IconComponent size={20} />
              {insights.percentage !== undefined && (
                <span className="status-percentage">
                  {Math.round(insights.percentage)}%
                </span>
              )}
            </div>
            <span className={`status-label text-${insights.color}`}>
              {t(`people:workloadStatus.${insights.status}`)}
            </span>
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: t('people:columns.quickActions'),
      width: '300px',
      render: (_, row) => {
        const insights = getPersonInsights(row.id);
        const ActionIcon = insights.icon;
        // rows without utilization data have no meaningful quick action —
        // only show the standard 详情/编辑 pair instead of a duplicate button
        const hasQuickAction = insights.status !== 'unknown';

        return (
          <div className="table-actions">
            {hasQuickAction && (
              <button
                className={`btn btn-sm btn-${insights.color} quick-action-btn`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickAction(insights.actionType, row.id);
                }}
                title={insights.action}
              >
                <ActionIcon size={18} />
                {insights.action}
              </button>
            )}
            <button
              className="btn btn-outline btn-sm quick-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/people/${row.id}`);
              }}
              title={t('common:viewDetails')}
            >
              <Eye size={18} />
              {t('common:viewDetails')}
            </button>
            <button
              className="btn btn-outline btn-sm quick-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleEditPerson(row);
              }}
              title={t('common:edit')}
            >
              <Edit2 size={18} />
              {t('common:edit')}
            </button>
          </div>
        );
      }
    }
  ];

  const filterConfig = [
    {
      name: 'search',
      label: t('common:search'),
      type: 'search' as const,
      placeholder: t('people:searchPlaceholder')
    },
    {
      name: 'primary_role_id',
      label: t('people:columns.primaryRole'),
      type: 'select' as const,
      options: Array.isArray(roles) ? roles.map(role => ({ value: role.id, label: role.name })) : []
    },
    {
      name: 'worker_type',
      label: t('people:workerType'),
      type: 'select' as const,
      options: [
        { value: 'FTE', label: t('people:workerTypeOptions.fullTimeEmployee') },
        { value: 'Contractor', label: t('people:workerTypeOptions.contractor') },
        { value: 'Consultant', label: t('people:workerTypeOptions.consultant') }
      ]
    },
    {
      name: 'location',
      label: t('people:columns.location'),
      type: 'select' as const,
      options: locations?.map(location => ({ value: location.id, label: location.name })) || []
    }
  ];

  if (peopleLoading) {
    return <LoadingSpinner />;
  }

  if (peopleError) {
    return <ErrorMessage message={t('people:failedToLoad')} details={peopleError.message} />;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('people:title')}</h1>
          <p className="text-muted">{t('people:subtitle')}</p>
          {teamInsights.total > 0 && (
            <div className="team-insights">
              <div className="insight-summary">
                <span className="insight-item text-danger">
                  <AlertTriangle size={16} />
                  {t('people:insights.overAllocated', { count: teamInsights.overAllocated })}
                </span>
                <span className="insight-item text-success">
                  <CheckCircle size={16} />
                  {t('people:insights.available', { count: teamInsights.available })}
                </span>
                <span className="insight-item text-muted">
                  {t('people:insights.totalPeople', { count: teamInsights.total })}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={addPersonModal.open}
          >
            <Plus size={16} />
            {t('people:addPerson')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/assignments')}
          >
            <Users size={16} />
            {t('people:viewAssignments')}
          </button>
        </div>
      </div>

      <FilterBar
        filters={filterConfig}
        values={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      <DataTable
        data={people || []}
        columns={columns}
        onRowClick={(row) => navigate(`/people/${row.id}`)}
        itemsPerPage={20}
      />

      {/* Add Person Modal */}
      <PersonModal
        isOpen={addPersonModal.isOpen}
        onClose={addPersonModal.close}
        onSuccess={handlePersonSuccess}
      />

      {/* Edit Person Modal */}
      <PersonModal
        isOpen={editPersonModal.isOpen}
        onClose={() => {
          editPersonModal.close();
          setEditingPerson(null);
        }}
        onSuccess={handlePersonSuccess}
        editingPerson={editingPerson}
      />

      {/* Smart Assignment Modal */}
      <SmartAssignmentModal
        isOpen={smartAssignmentModalOpen}
        onClose={() => {
          setSmartAssignmentModalOpen(false);
          setAssignmentPersonId(undefined);
        }}
        personId={assignmentPersonId || ''}
        triggerContext={assignmentTriggerContext}
        actionType={assignmentActionType}
      />
    </div>
  );
}