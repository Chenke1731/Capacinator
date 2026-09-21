import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Calendar, Briefcase, Users, Clock,
  Mail, Phone, MapPin, AlertCircle, History,
  Plus, ChevronDown, ChevronUp, UserPlus, UserMinus,
  TrendingUp, Target, Zap, Shield, Award, Edit2, Save, X, Search
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { formatDate } from '../utils/date';
import { PersonAllocationChart } from '../components/PersonAllocationChart';
import PersonRoleModal from '../components/modals/PersonRoleModal';
import { SmartAssignmentModal } from '../components/modals/SmartAssignmentModal';
import { DetailTable, DetailTableColumn } from '../components/ui/DetailTable';
import { Badge } from '../components/ui/badge';
import './PersonDetails.css';
import '../components/Charts.css';

interface PersonDetails {
  id: string;
  name: string;
  email: string | null;
  phone?: string;
  title?: string;
  department?: string;
  location_id?: string;
  location_name?: string;
  primary_person_role_id?: string;
  primary_role_name?: string;
  supervisor_id?: string | null;
  supervisor_name?: string | null;
  worker_type: string;
  default_availability_percentage: number;
  default_hours_per_day: number;
  start_date?: string;
  end_date?: string;
  status?: string;
  working_hours?: number;
  vacation_days?: number;
  utilization_target?: number;
  created_at: number;
  updated_at: number;
  roles: Array<{
    id: string;
    person_id: string;
    role_id: string;
    role_name: string;
    role_description?: string;
    start_date?: string;
    end_date?: string;
    proficiency_level: string;
    is_primary: number;
  }>;
  assignments: Array<{
    id: string;
    project_id: string;
    project_name: string;
    role_id: string;
    role_name: string;
    start_date: string;
    end_date: string;
    allocation_percentage: number;
    billable: boolean;
  }>;
  availabilityOverrides: Array<{
    id: string;
    person_id: string;
    start_date: number;
    end_date: number;
    availability_percentage: number;
    hours_per_day: number | null;
    reason?: string;
    override_type: string;
    is_approved: number;
    approved_by?: string | null;
    approved_at: number;
    created_by?: string | null;
    created_at: number;
    updated_at: number;
  }>;
}

export default function PersonDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    roles: true,
    assignments: true,
    allocation: true,
    availability: true,
    history: false
  });
  
  // Role management modal state
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);

  // Time off editing state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [editingTimeOff, setEditingTimeOff] = useState<string | null>(null);
  const [editingTimeOffData, setEditingTimeOffData] = useState<any>(null);
  
  // New time off creation state
  const [isCreatingTimeOff, setIsCreatingTimeOff] = useState<boolean>(false);
  const [newTimeOffData, setNewTimeOffData] = useState<any>(null);

  // Smart assignment modal state
  const [smartAssignmentModalOpen, setSmartAssignmentModalOpen] = useState(false);
  const [assignmentTriggerContext, setAssignmentTriggerContext] = useState<'workload_action' | 'manual_add' | 'quick_assign'>('manual_add');
  const [assignmentActionType, setAssignmentActionType] = useState('');

  // TODO: Replace with proper auth context when authentication is implemented
  // For now, check localStorage or default to allowing edits
  const canEdit = localStorage.getItem('userRole') !== 'viewer';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canDelete = localStorage.getItem('userRole') === 'admin';

  // Define table columns for each section
  const timeOffColumns: DetailTableColumn<any>[] = [
    {
      key: 'dates',
      header: t('people:details.dates'),
      render: (item) => (
        <span>{formatDate(item.start_date)} - {formatDate(item.end_date)}</span>
      ),
      width: '200px'
    },
    {
      key: 'type',
      header: t('people:columns.type'),
      render: (item) => (
        <Badge variant={item.override_type === 'pto' ? 'default' : 'secondary'}>
          {item.override_type === 'pto'
            ? t('people:availability.overrideType.pto')
            : item.override_type === 'sick'
              ? t('people:availability.overrideType.sick')
              : t('people:availability.overrideType.other')}
        </Badge>
      ),
      width: '120px'
    },
    {
      key: 'availability',
      header: t('people:columns.availability'),
      render: (item) => `${item.availability_percentage}%`,
      width: '100px'
    },
    {
      key: 'reason',
      header: t('people:details.reason'),
      render: (item) => item.reason || '-'
    }
  ];

  const rolesColumns: DetailTableColumn<any>[] = [
    {
      key: 'role',
      header: t('common:role'),
      render: (item) => (
        <div>
          <div className="font-medium">{item.role_name}</div>
          {item.role_description && (
            <div className="text-sm text-muted-foreground">{item.role_description}</div>
          )}
        </div>
      )
    },
    {
      key: 'proficiency',
      header: t('people:details.proficiency'),
      render: (item) => (
        <Badge variant="outline">{t('people:details.level', { level: item.proficiency_level })}</Badge>
      ),
      width: '120px'
    },
    {
      key: 'primary',
      header: t('people:details.primary'),
      render: (item) => (
        item.is_primary ? <Badge variant="success">{t('people:details.primary')}</Badge> : null
      ),
      width: '100px'
    },
    {
      key: 'since',
      header: t('people:details.since'),
      render: (item) => item.start_date ? formatDate(item.start_date) : '-',
      width: '120px'
    }
  ];

  const assignmentsColumns: DetailTableColumn<any>[] = [
    {
      key: 'project',
      header: t('common:assignmentsCol.project'),
      render: (item) => (
        <Link to={`/projects/${item.project_id}`} className="text-primary hover:underline">
          {item.project_name}
        </Link>
      )
    },
    {
      key: 'role',
      header: t('common:role'),
      render: (item) => item.role_name,
      width: '150px'
    },
    {
      key: 'allocation',
      header: t('common:assignmentsCol.allocation'),
      render: (item) => `${item.allocation_percentage}%`,
      width: '100px'
    },
    {
      key: 'billable',
      header: t('people:columns.type'),
      render: (item) => (
        <Badge variant={item.billable ? 'success' : 'secondary'}>
          {item.billable ? t('people:details.billable') : t('people:details.nonBillable')}
        </Badge>
      ),
      width: '120px'
    },
    {
      key: 'period',
      header: t('people:details.period'),
      render: (item) => (
        <span className="text-sm">
          {formatDate(item.computed_start_date || item.start_date)} - {formatDate(item.computed_end_date || item.end_date)}
        </span>
      ),
      width: '200px'
    }
  ];

  // Fetch person details
  const { data: person, isLoading, error } = useQuery({
    queryKey: queryKeys.people.detail(id!),
    queryFn: async () => {
      const response = await api.people.get(id!);
      return response.data as PersonDetails;
    },
    enabled: !!id
  });

  // Fetch locations for dropdown
  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: async () => {
      const response = await api.locations.list();
      return response.data.data;
    }
  });

  // Fetch roles for dropdown
  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch all people for supervisor dropdown
  const { data: allPeople } = useQuery({
    queryKey: queryKeys.people.list(),
    queryFn: async () => {
      const response = await api.people.list();
      return response.data.data;
    }
  });

  // Standardized time range for all charts on this page
  const currentDate = new Date();
  const startDate = new Date(currentDate.getFullYear() - 1, 0, 1); // Start of previous year
  const endDate = new Date(currentDate.getFullYear() + 1, 11, 31); // End of next year
  const standardStartDate = startDate.toISOString().split('T')[0];
  const standardEndDate = endDate.toISOString().split('T')[0];

  // Utilization timeline query (reserved for future timeline display)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: utilizationTimeline } = useQuery({
    queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate),
    queryFn: async () => {
      const response = await fetch(`/api/people/${id}/utilization-timeline?startDate=${standardStartDate}&endDate=${standardEndDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch utilization timeline');
      }
      return response.json();
    },
    enabled: !!id
  });

  // Individual field update mutations
  const updatePersonFieldMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      const response = await api.people.update(id!, { [field]: value });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.assignments.delete(assignmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
    }
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await api.people.removeRole(id!, roleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
    }
  });

  // Availability override mutations
  const updateOverrideMutation = useMutation({
    mutationFn: async (override: any) => {
      const response = await fetch(`/api/availability/${override.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(override)
      });
      if (!response.ok) throw new Error('Failed to update availability override');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
      setEditingTimeOff(null);
      setEditingTimeOffData(null);
    }
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const response = await fetch(`/api/availability/${overrideId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete availability override');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
    }
  });

  const createOverrideMutation = useMutation({
    mutationFn: async (overrideData: any) => {
      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrideData)
      });
      if (!response.ok) throw new Error('Failed to create availability override');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
      setIsCreatingTimeOff(false);
      setNewTimeOffData(null);
    }
  });

  // Handle individual field updates
  const handleFieldUpdate = (field: string, value: any) => {
    updatePersonFieldMutation.mutate({ field, value });
  };

  // Inline editing component
  const InlineEdit = ({ 
    field, 
    value, 
    type = 'text', 
    options = [], 
    placeholder = '',
    icon = null
  }: {
    field: string;
    value: any;
    type?: 'text' | 'email' | 'tel' | 'number' | 'select';
    options?: Array<{ value: any; label: string }>;
    placeholder?: string;
    icon?: any;
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);

    const handleSave = () => {
      if (editValue !== value) {
        handleFieldUpdate(field, type === 'number' ? parseInt(editValue, 10) : editValue);
      }
      setIsEditing(false);
    };

    const handleCancel = () => {
      setEditValue(value);
      setIsEditing(false);
    };

    if (isEditing) {
      return (
        <div className="inline-edit-container">
          {type === 'select' ? (
            <select
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value)}
              className="form-select"
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              autoFocus
            >
              <option value="">{placeholder || t('people:details.selectPlaceholder')}</option>
              {options.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value)}
              className="form-input"
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              placeholder={placeholder}
              autoFocus
            />
          )}
        </div>
      );
    }

    // For display, show the label if it's a select, otherwise show the value
    const displayValue = type === 'select' 
      ? options.find(opt => opt.value === value)?.label || placeholder || t('people:details.notProvided')
      : value || placeholder || t('people:details.notProvided');

    return (
      <div className="info-value inline-editable" onClick={() => canEdit && setIsEditing(true)}>
        {icon && React.createElement(icon, { size: 16 })}
        <span>{displayValue}</span>
        {canEdit && <Edit2 size={14} className="edit-icon" />}
      </div>
    );
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Role management handlers
  const handleAddRole = () => {
    setEditingRole(null);
    setRoleModalOpen(true);
  };

  const handleEditRole = (role: any) => {
    setEditingRole(role);
    setRoleModalOpen(true);
  };

  const handleRoleModalSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(id!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(id!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.people.utilizationTimeline(id!, standardStartDate, standardEndDate) });
    setRoleModalOpen(false);
    setEditingRole(null);
  };

  const handleRoleModalClose = () => {
    setRoleModalOpen(false);
    setEditingRole(null);
  };

  // Time off management handlers
  const handleEditTimeOff = (override: any) => {
    setEditingTimeOff(override.id);
    setEditingTimeOffData({
      ...override,
      start_date: new Date(override.start_date).toISOString().split('T')[0],
      end_date: new Date(override.end_date).toISOString().split('T')[0]
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSaveTimeOff = () => {
    if (editingTimeOffData) {
      updateOverrideMutation.mutate({
        ...editingTimeOffData,
        start_date: new Date(editingTimeOffData.start_date).getTime(),
        end_date: new Date(editingTimeOffData.end_date).getTime()
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCancelTimeOffEdit = () => {
    setEditingTimeOff(null);
    setEditingTimeOffData(null);
  };

  const handleDeleteTimeOff = (overrideId: string) => {
    if (confirm(t('people:details.deleteTimeOffConfirm'))) {
      deleteOverrideMutation.mutate(overrideId);
    }
  };

  // New time off creation handlers
  const handleAddTimeOff = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    setNewTimeOffData({
      person_id: person?.id,
      start_date: today.toISOString().split('T')[0],
      end_date: tomorrow.toISOString().split('T')[0],
      override_type: 'vacation',
      availability_percentage: 0,
      reason: '',
      created_by: 'current-user' // TODO: Replace with actual user ID when auth is implemented
    });
    setIsCreatingTimeOff(true);
  };

  const handleSaveNewTimeOff = () => {
    if (newTimeOffData) {
      createOverrideMutation.mutate({
        ...newTimeOffData,
        start_date: new Date(newTimeOffData.start_date).toISOString().split('T')[0],
        end_date: new Date(newTimeOffData.end_date).toISOString().split('T')[0]
      });
    }
  };

  const handleCancelNewTimeOff = () => {
    setIsCreatingTimeOff(false);
    setNewTimeOffData(null);
  };

  // Assignment handlers
  const handleAddAssignment = () => {
    setAssignmentTriggerContext('manual_add');
    setAssignmentActionType('');
    setSmartAssignmentModalOpen(true);
  };

  const handleDeleteAssignment = (assignment: any) => {
    if (window.confirm(t('common:deleteAssignmentConfirm'))) {
      deleteAssignmentMutation.mutate(assignment.id);
    }
  };

  // Calculate allocation insights (moved before conditional returns to fix React hooks order)
  // Helper function to get CSS class names based on status color
  const getStatusClassName = (colorType: string) => {
    switch (colorType) {
      case 'danger': return 'text-danger';
      case 'warning': return 'text-warning';
      case 'info': return 'text-info';
      case 'success': return 'text-success';
      default: return 'text-gray';
    }
  };

  const getBadgeClassName = (colorType: string) => {
    switch (colorType) {
      case 'danger': return 'badge-danger';
      case 'warning': return 'badge-warning';
      case 'info': return 'badge-info';
      case 'success': return 'badge-success';
      default: return 'badge-gray';
    }
  };

  const allocationInsights = useMemo(() => {
    if (!person) return null;
    
    // Only include assignments that are currently active (overlapping with today)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const activeAssignments = person.assignments.filter(assignment => {
      const startDate = assignment.computed_start_date || assignment.start_date;
      const endDate = assignment.computed_end_date || assignment.end_date;
      return startDate <= today && endDate >= today;
    });
    
    const totalAllocation = activeAssignments.reduce((sum, assignment) => {
      return sum + assignment.allocation_percentage;
    }, 0);
    
    const availability = person.default_availability_percentage;
    const utilizationPercentage = availability > 0 ? (totalAllocation / availability) * 100 : 0;
    
    let status: 'over_allocated' | 'fully_allocated' | 'under_allocated' | 'available';
    let statusColor: string;
    let actions: Array<{ label: string; action: string; icon: any; variant: string }> = [];
    
    if (utilizationPercentage > 100) {
      status = 'over_allocated';
      statusColor = 'danger';
      actions = [
        { label: t('people:details.actions.reduceWorkload'), action: 'reduce_workload', icon: UserMinus, variant: 'danger' },
        { label: t('people:details.actions.findCoverage'), action: 'find_coverage', icon: Search, variant: 'warning' },
        { label: t('people:details.actions.extendTimeline'), action: 'extend_timeline', icon: Calendar, variant: 'secondary' }
      ];
    } else if (utilizationPercentage >= 80) {
      status = 'fully_allocated';
      statusColor = 'warning';
      actions = [
        { label: t('people:details.actions.monitorLoad'), action: 'monitor_load', icon: TrendingUp, variant: 'warning' },
        { label: t('people:details.actions.planAhead'), action: 'plan_ahead', icon: Target, variant: 'secondary' }
      ];
    } else if (utilizationPercentage >= 40) {
      status = 'under_allocated';
      statusColor = 'info';
      actions = [
        { label: t('people:details.actions.assignMoreWork'), action: 'assign_more', icon: UserPlus, variant: 'primary' },
        { label: t('people:details.actions.findProjects'), action: 'find_projects', icon: Search, variant: 'info' }
      ];
    } else {
      status = 'available';
      statusColor = 'success';
      actions = [
        { label: t('people:details.actions.assignToProject'), action: 'assign_project', icon: Plus, variant: 'success' },
        { label: t('people:details.actions.viewOpportunities'), action: 'view_opportunities', icon: Zap, variant: 'primary' }
      ];
    }
    
    return {
      totalAllocation,
      availability,
      utilizationPercentage,
      status,
      statusColor,
      actions,
      hasUpcomingTimeOff: person.availabilityOverrides.some(override => 
        new Date(override.start_date) > new Date()
      ),
      currentProjects: activeAssignments.length,
      skillsCount: person.roles.length
    };
  }, [person, t]);

  if (isLoading) return <div className="loading">{t('people:details.loading')}</div>;
  if (error || !person) return <div className="error">{t('people:details.failedToLoad')}</div>;


  const handleActionClick = (action: string) => {
    switch (action) {
      case 'reduce_workload':
      case 'find_coverage':
      case 'extend_timeline':
        // These actions still use WorkloadAdjustmentModal features (to be integrated later)
        setAssignmentTriggerContext('workload_action');
        setAssignmentActionType(action);
        setSmartAssignmentModalOpen(true);
        break;
      case 'assign_more':
      case 'assign_project':
        setAssignmentTriggerContext('workload_action');
        setAssignmentActionType(action);
        setSmartAssignmentModalOpen(true);
        break;
      case 'find_projects':
      case 'view_opportunities':
        navigate(`/projects?needs_role=${person.primary_person_role_id}&status=active`);
        break;
      case 'monitor_load':
        navigate(`/reports?type=utilization&person=${person.id}`);
        break;
      case 'plan_ahead':
        navigate(`/assignments?person=${person.id}&view=timeline`);
        break;
      default:
        console.log('Action not implemented:', action);
    }
  };

  return (
    <div className="page-container person-details">
      <div className="page-header">
        <div className="header-left">
          <button className="btn btn-icon" onClick={() => navigate('/people')}>
            <ArrowLeft size={20} />
          </button>
          <h1>{person.name}</h1>
          <span className={`badge badge-${person.status === 'active' ? 'success' : 'gray'}`}>
            {person.status || t('people:personStatus.active')}
          </span>
        </div>
      </div>

      <div className="person-details-content">
        {/* Allocation Insights & Quick Actions */}
        <div className="detail-section insights-section">
          <div className="section-header">
            <h2>
              <TrendingUp size={20} />
              {t('people:details.workloadInsights')}
            </h2>
          </div>

          <div className="section-content">
            <div className="insights-grid">
              <div className="insight-card">
                <div className="insight-header">
                  <div className="insight-value">
                    {allocationInsights?.totalAllocation.toFixed(0) ?? 0}%
                  </div>
                  <div className="insight-label">{t('people:details.totalAllocation')}</div>
                </div>
                <div className="insight-comparison">
                  {t('people:details.vsAvailable', { availability: allocationInsights?.availability ?? 0 })}
                </div>
              </div>

              <div className="insight-card">
                <div className="insight-header">
                  <div className={`insight-value ${getStatusClassName(allocationInsights?.statusColor ?? 'gray')}`}>
                    {allocationInsights?.utilizationPercentage.toFixed(0) ?? 0}%
                  </div>
                  <div className="insight-label">{t('people:details.utilization')}</div>
                </div>
                <div className={`insight-status ${getBadgeClassName(allocationInsights?.statusColor ?? 'gray')}`}>
                  {(allocationInsights
                    ? t(`people:workloadStatus.${allocationInsights.status}`)
                    : t('people:workloadStatus.unknown')).toUpperCase()}
                </div>
              </div>

              <div className="insight-card">
                <div className="insight-header">
                  <div className="insight-value">
                    {allocationInsights?.currentProjects ?? 0}
                  </div>
                  <div className="insight-label">{t('people:details.activeProjects')}</div>
                </div>
                <div className="insight-comparison">
                  {t('people:details.skillsCount', { count: allocationInsights?.skillsCount ?? 0 })}
                </div>
              </div>

              {allocationInsights?.hasUpcomingTimeOff && (
                <div className="insight-card alert-card">
                  <div className="insight-header">
                    <AlertCircle size={16} className="text-warning" />
                    <div className="insight-label">{t('people:details.upcomingTimeOff')}</div>
                  </div>
                  <div className="insight-comparison text-warning">
                    {t('people:details.planCoverageNeeded')}
                  </div>
                </div>
              )}
            </div>

            <div className="quick-actions">
              <h4>{t('people:details.recommendedActions')}</h4>
              <div className="actions-grid">
                {allocationInsights?.actions?.map((action, index) => {
                  const IconComponent = action.icon;
                  return (
                    <button
                      key={index}
                      className={`btn btn-${action.variant} action-btn`}
                      onClick={() => handleActionClick(action.action)}
                    >
                      <IconComponent size={16} />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Basic Information Section */}
        <div className="detail-section">
          <div className="section-header" onClick={() => toggleSection('basic')}>
            <h2>
              <Users size={20} />
              {t('people:basicInformation')}
            </h2>
            {expandedSections.basic ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>

          {expandedSections.basic && (
            <div className="section-content">
              <div className="info-grid">
                <div className="info-item">
                  <label>{t('people:fields.email')}</label>
                  <InlineEdit
                    field="email"
                    value={person.email}
                    type="email"
                    placeholder={t('people:details.placeholderEmail')}
                    icon={Mail}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.phone')}</label>
                  <InlineEdit
                    field="phone"
                    value={person.phone}
                    type="tel"
                    placeholder={t('people:placeholders.phone')}
                    icon={Phone}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.title')}</label>
                  <InlineEdit
                    field="title"
                    value={person.title}
                    placeholder={t('people:placeholders.title')}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.department')}</label>
                  <InlineEdit
                    field="department"
                    value={person.department}
                    placeholder={t('people:placeholders.department')}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.location')}</label>
                  <InlineEdit
                    field="location_id"
                    value={person.location_id}
                    type="select"
                    options={Array.isArray(locations) ? locations.map((location: any) => ({
                      value: location.id,
                      label: location.name
                    })) : []}
                    placeholder={t('people:placeholders.selectLocation')}
                    icon={MapPin}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.primaryRole')}</label>
                  <InlineEdit
                    field="primary_person_role_id"
                    value={person.roles.find((role: any) => role.is_primary)?.role_id}
                    type="select"
                    options={Array.isArray(roles) ? roles.map((role: any) => ({
                      value: role.id,
                      label: role.name
                    })) : []}
                    placeholder={t('people:placeholders.selectPrimaryRole')}
                    icon={Shield}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.supervisor')}</label>
                  <InlineEdit
                    field="supervisor_id"
                    value={person.supervisor_id}
                    type="select"
                    options={Array.isArray(allPeople) ? allPeople.filter((p: any) => p.id !== id).map((supervisor: any) => ({
                      value: supervisor.id,
                      label: supervisor.name
                    })) : []}
                    placeholder={t('people:select.noSupervisor')}
                    icon={Users}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:fields.workerType')}</label>
                  <InlineEdit
                    field="worker_type"
                    value={person.worker_type}
                    type="select"
                    options={[
                      { value: 'FTE', label: t('people:workerTypeOptions.fullTimeEmployeeTitle') },
                      { value: 'CONTRACT', label: t('people:workerTypeOptions.contractor') },
                      { value: 'INTERN', label: t('people:workerTypeOptions.intern') }
                    ]}
                    placeholder={t('people:workerTypeOptions.fullTimeEmployeeTitle')}
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:details.hoursPerDay')}</label>
                  <InlineEdit
                    field="default_hours_per_day"
                    value={person.default_hours_per_day}
                    type="number"
                    placeholder="8"
                  />
                </div>

                <div className="info-item">
                  <label>{t('people:details.defaultAvailability')}</label>
                  <InlineEdit
                    field="default_availability_percentage"
                    value={person.default_availability_percentage}
                    type="number"
                    placeholder="100"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Availability & Time Off Section */}
        <div className="detail-section">
          <div className="section-header" onClick={() => toggleSection('availability')}>
            <h2>
              <Calendar size={20} />
              {t('people:details.availabilityTimeOff')}
            </h2>
            {expandedSections.availability ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>

          {expandedSections.availability && (
            <div className="section-content">
              <div className="availability-summary mb-4">
                <div className="summary-item">
                  <label>{t('people:details.defaultAvailability')}</label>
                  <div className="summary-value">{person.default_availability_percentage}%</div>
                </div>
                <div className="summary-item">
                  <label>{t('people:details.defaultHoursPerDay')}</label>
                  <div className="summary-value">{t('people:details.hours', { count: person.default_hours_per_day })}</div>
                </div>
              </div>

              <DetailTable
                data={person.availabilityOverrides || []}
                columns={timeOffColumns}
                onAdd={handleAddTimeOff}
                onEdit={handleEditTimeOff}
                onDelete={(item) => handleDeleteTimeOff(item.id)}
                addButtonText={t('people:details.addTimeOff')}
                emptyMessage={t('people:details.noTimeOff')}
                canEdit={canEdit}
              />

              {/* New time off creation form */}
              {canEdit && isCreatingTimeOff && (
                <div className="override-item mt-3">
                  <div className="override-edit-form">
                    <h5>{t('people:details.newTimeOffEntry')}</h5>
                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('common:startDate')}</label>
                        <input
                          type="date"
                          value={newTimeOffData?.start_date || ''}
                          onChange={(e) => setNewTimeOffData({ ...newTimeOffData, start_date: e.target.value })}
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('common:endDate')}</label>
                        <input
                          type="date"
                          value={newTimeOffData?.end_date || ''}
                          onChange={(e) => setNewTimeOffData({ ...newTimeOffData, end_date: e.target.value })}
                          className="form-input"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('people:columns.type')}</label>
                        <select
                          value={newTimeOffData?.override_type || ''}
                          onChange={(e) => setNewTimeOffData({ ...newTimeOffData, override_type: e.target.value })}
                          className="form-select"
                        >
                          <option value="vacation">{t('people:availability.overrideType.vacation')}</option>
                          <option value="sick">{t('people:availability.overrideType.sick')}</option>
                          <option value="training">{t('people:availability.overrideType.training')}</option>
                          <option value="conference">{t('people:availability.overrideType.conference')}</option>
                          <option value="other">{t('people:availability.overrideType.other')}</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('people:details.availabilityPercent')}</label>
                        <input
                          type="number"
                          value={newTimeOffData?.availability_percentage || ''}
                          onChange={(e) => setNewTimeOffData({ ...newTimeOffData, availability_percentage: parseInt(e.target.value, 10) })}
                          className="form-input"
                          min="0"
                          max="100"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>{t('people:details.reasonOptional')}</label>
                      <input
                        type="text"
                        value={newTimeOffData?.reason || ''}
                        onChange={(e) => setNewTimeOffData({ ...newTimeOffData, reason: e.target.value })}
                        className="form-input"
                        placeholder={t('people:details.reasonPlaceholder')}
                      />
                    </div>
                    <div className="form-actions">
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveNewTimeOff}
                        disabled={createOverrideMutation.isPending}
                      >
                        <Save size={16} />
                        {createOverrideMutation.isPending ? t('people:creating') : t('common:create')}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={handleCancelNewTimeOff}
                      >
                        <X size={16} />
                        {t('common:cancel')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Roles & Skills Section */}
        <div className="detail-section">
          <div className="section-header" onClick={() => toggleSection('roles')}>
            <h2>
              <Award size={20} />
              {t('people:details.rolesSkills')}
            </h2>
            {expandedSections.roles ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>

          {expandedSections.roles && (
            <div className="section-content">
              <DetailTable
                data={person.roles || []}
                columns={rolesColumns}
                onAdd={handleAddRole}
                onEdit={handleEditRole}
                onDelete={(item) => removeRoleMutation.mutate(item.role_id)}
                addButtonText={t('people:details.addRole')}
                emptyMessage={t('people:details.noRoles')}
                canEdit={canEdit}
              />
            </div>
          )}
        </div>

        {/* Current Assignments Section */}
        <div className="detail-section">
          <div className="section-header" onClick={() => toggleSection('assignments')}>
            <h2>
              <Briefcase size={20} />
              {t('people:details.currentAssignments')}
            </h2>
            {expandedSections.assignments ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>

          {expandedSections.assignments && (
            <div className="section-content">
              <DetailTable
                data={person.assignments?.filter(assignment => {
                  const today = new Date().toISOString().split('T')[0];
                  const startDate = assignment.computed_start_date || assignment.start_date;
                  const endDate = assignment.computed_end_date || assignment.end_date;
                  return startDate <= today && endDate >= today;
                }) || []}
                columns={assignmentsColumns}
                onAdd={canEdit ? handleAddAssignment : undefined}
                onDelete={canEdit ? handleDeleteAssignment : undefined}
                addButtonText={t('common:addAssignment')}
                emptyMessage={t('people:details.noAssignments')}
                canEdit={canEdit}
              />
            </div>
          )}
        </div>

        {/* Allocation vs Availability Section */}
        <div className="detail-section">
          <div className="section-header" onClick={() => toggleSection('allocation')}>
            <h2>
              <Clock size={20} />
              {t('people:details.allocationVsAvailability')}
            </h2>
            {expandedSections.allocation ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          
          {expandedSections.allocation && (
            <div className="section-content">
              <PersonAllocationChart 
                personId={person.id} 
                personName={person.name}
                startDate={standardStartDate}
                endDate={standardEndDate}
              />
              
            </div>
          )}
        </div>


        {/* History Section */}
        <div className="detail-section">
          <div className="section-header" onClick={() => toggleSection('history')}>
            <h2>
              <History size={20} />
              {t('people:details.history')}
            </h2>
            {expandedSections.history ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>

          {expandedSections.history && (
            <div className="section-content">
              <div className="history-timeline">
                <div className="timeline-item">
                  <div className="timeline-date">{formatDate(new Date(person.created_at).toISOString())}</div>
                  <div className="timeline-content">
                    <strong>{t('people:details.profileCreated')}</strong>
                  </div>
                </div>
                <div className="timeline-item">
                  <div className="timeline-date">{formatDate(new Date(person.updated_at).toISOString())}</div>
                  <div className="timeline-content">
                    <strong>{t('people:details.lastUpdated')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Role Management Modal */}
      <PersonRoleModal
        isOpen={roleModalOpen}
        onClose={handleRoleModalClose}
        onSuccess={handleRoleModalSuccess}
        personId={id!}
        editingRole={editingRole}
      />
      
      {/* Smart Assignment Modal */}
      <SmartAssignmentModal
        isOpen={smartAssignmentModalOpen}
        onClose={() => setSmartAssignmentModalOpen(false)}
        personId={person.id}
        personName={person.name}
        triggerContext={assignmentTriggerContext}
        actionType={assignmentActionType}
      />
    </div>
  );
}

function _getOverrideTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'vacation': return 'blue';
    case 'sick': return 'orange';
    case 'training': return 'purple';
    case 'conference': return 'green';
    default: return 'gray';
  }
}

// Export to prevent unused function warnings (intended for future use)
export { _getOverrideTypeColor as getOverrideTypeColor };