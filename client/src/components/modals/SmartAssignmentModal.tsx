import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle, Info, Calendar, Users,
  TrendingUp, Sparkles, Clock, BarChart3, Link2, RefreshCw, ExternalLink, Trash2
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { getLocale } from '../../i18n';
import { calculatePhaseDurationWeeks } from '../../utils/phaseDurations';
import { useAssignmentRecommendations, ProjectRecommendation } from '../../hooks/useAssignmentRecommendations';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import type { Project, Role, AssignmentDateMode } from '../../types';
import './SmartAssignmentModal.css';

// Person role from person.roles array
interface PersonRoleLink {
  role_id: string;
  is_primary?: boolean;
}

// Project phase link
interface ProjectPhaseLink {
  phase_id: string;
  phase_name: string;
  start_date: string;
  end_date: string;
}

// Phase for selection
interface FilteredPhase {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

// Role with demand
interface RoleWithDemand {
  id: string;
  name: string;
}

// Project allocation
interface ProjectAllocation {
  role_id: string;
  role_name: string;
  phase_id: string;
  allocation_percentage: number;
}

// Active assignment from utilization data
interface ActiveAssignment {
  id?: string;
  project_name?: string;
  role_name?: string;
  phase_name?: string;
  allocation_percentage?: number;
  computed_start_date?: string;
  computed_end_date?: string;
  start_date?: string;
  end_date?: string;
}

// Project with demand for selection
interface ProjectWithDemand {
  id: string;
  name: string;
}

// Assignment data for API
interface AssignmentCreateData {
  person_id: string;
  project_id: string;
  role_id: string;
  allocation_percentage: number;
  phase_id?: string;
  assignment_date_mode?: AssignmentDateMode;
  start_date?: string;
  end_date?: string;
}

// API error response
interface ApiError {
  response?: {
    data?: {
      error?: string;
      message?: string;
      details?: string;
    };
  };
  message?: string;
}

interface SmartAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  personId: string;
  personName?: string;
  projectId?: string;
  triggerContext?: 'workload_action' | 'manual_add' | 'quick_assign';
  actionType?: string;
}


export function SmartAssignmentModal({ 
  isOpen, 
  onClose, 
  personId,
  personName,
  projectId: initialProjectId,
  triggerContext = 'manual_add',
  actionType
}: SmartAssignmentModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isDarkMode = document.documentElement.classList.contains('dark');
  const [activeTab, setActiveTab] = useState(triggerContext === 'manual_add' ? 'manual' : 'recommended');
  const [selectedRecommendation, setSelectedRecommendation] = useState<ProjectRecommendation | null>(null);
  
  // Form state for manual assignment
  const [formData, setFormData] = useState({
    person_id: personId,
    project_id: initialProjectId || '',
    role_id: '',
    phase_id: '',
    allocation_percentage: 40, // Default to 40% instead of 100%
    start_date: '',
    end_date: ''
  });
  
  // Invalidate project phases cache when modal opens to ensure fresh data
  useEffect(() => {
    if (isOpen && formData.project_id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(formData.project_id) });
    }
  }, [isOpen, formData.project_id, queryClient]);

  // Fetch person details with current assignments
  const { data: person } = useQuery({
    queryKey: queryKeys.people.withAssignments(personId),
    queryFn: async () => {
      const response = await api.people.get(personId);
      // The PeopleController returns the person data directly, not wrapped in { data: ... }
      const personData = response.data;
      return personData;
    },
    enabled: !!personId
  });

  // Fetch all required data
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: async () => {
      const response = await api.projects.list();
      return response.data;
    }
  });

  // Fetch all project allocations to determine which projects have demand
  const { data: allProjectAllocations, isLoading: isLoadingAllocations } = useQuery({
    queryKey: queryKeys.projectAllocations.allProjects(),
    queryFn: async () => {
      if (!projects?.data) return [];

      // Fetch allocations for all projects in parallel
      const allocationPromises = (projects.data as Project[]).map(async (project) => {
        try {
          const response = await api.projectAllocations.get(project.id);
          return {
            projectId: project.id,
            allocations: response.data.data?.allocations || []
          };
        } catch {
          // If project has no allocations, return empty array
          return {
            projectId: project.id,
            allocations: []
          };
        }
      });

      return Promise.all(allocationPromises);
    },
    enabled: !!projects?.data
  });

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      // console.log('Roles response:', response);
      return response.data || [];
    }
  });

  // Phases data is fetched to populate phase selection dropdown
  useQuery({
    queryKey: queryKeys.phases.list(),
    queryFn: async () => {
      const response = await api.phases.list();
      return response.data;
    }
  });

  // Fetch project phases with dates
  const { data: projectPhases, refetch: refetchPhases } = useQuery({
    queryKey: queryKeys.projectPhases.byProject(formData.project_id),
    queryFn: async () => {
      if (!formData.project_id) return [];
      const response = await api.projects.getPhases(formData.project_id);
      return response.data.data || [];
    },
    enabled: !!formData.project_id
  });

  // Fetch project allocations to determine which roles and phases have demand
  const { data: projectAllocations } = useQuery({
    queryKey: queryKeys.projects.allocations(formData.project_id),
    queryFn: async () => {
      if (!formData.project_id) return [];
      const response = await api.projectAllocations.get(formData.project_id);
      return response.data.data?.allocations || [];
    },
    enabled: !!formData.project_id
  });


  // Use the extracted hook for recommendations, utilization, and projects with demand
  const { recommendations: projectRecommendations, utilizationData, projectsWithDemand } = useAssignmentRecommendations({
    person,
    projects: projects?.data,
    roles,
    allProjectAllocations,
    isLoadingAllocations,
    actionType,
  });

  // Set default role based on person's primary role
  useEffect(() => {
    if (person && !formData.role_id) {
      // Find the actual role_id from person's roles where is_primary is true
      const primaryRole = person.roles?.find((r: PersonRoleLink) => r.is_primary);
      setFormData(prev => ({
        ...prev,
        role_id: primaryRole?.role_id || ''
      }));
    }
  }, [person, formData.role_id]);

  // Update allocation percentage to not exceed remaining capacity
  useEffect(() => {
    if (utilizationData.remainingCapacity < formData.allocation_percentage) {
      setFormData(prev => ({
        ...prev,
        allocation_percentage: Math.max(utilizationData.remainingCapacity, 0)
      }));
    }
  }, [utilizationData.remainingCapacity, formData.allocation_percentage]);

  // Get selected project details (reserved for project info display)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const selectedProject = useMemo(() => {
    const projectId = selectedRecommendation?.project.id || formData.project_id;
    return (projects?.data as Project[] | undefined)?.find((p) => p.id === projectId);
  }, [projects, formData.project_id, selectedRecommendation]);

  // Get roles that have demand in the selected project
  const projectRoles = useMemo(() => {
    if (!projectAllocations || !Array.isArray(projectAllocations)) return [];
    
    // Get unique roles that have allocations > 0
    const roleMap = new Map();
    (projectAllocations as ProjectAllocation[]).forEach((allocation) => {
      if (allocation.allocation_percentage > 0 && !roleMap.has(allocation.role_id)) {
        roleMap.set(allocation.role_id, {
          id: allocation.role_id,
          name: allocation.role_name
        });
      }
    });
    
    return Array.from(roleMap.values());
  }, [projectAllocations]);

  // Filter phases based on selected project and role
  const filteredPhases = useMemo(() => {
    if (!projectPhases || !Array.isArray(projectPhases)) return [];
    if (!formData.role_id || !projectAllocations) {
      // If no role selected, return all project phases
      return (projectPhases as ProjectPhaseLink[]).map((projectPhase) => ({
        id: projectPhase.phase_id,
        name: projectPhase.phase_name,
        start_date: projectPhase.start_date,
        end_date: projectPhase.end_date
      }));
    }
    
    // Filter phases that have allocation for the selected role
    const phasesWithRole = projectAllocations
      .filter((allocation: ProjectAllocation) =>
        allocation.role_id === formData.role_id &&
        allocation.allocation_percentage > 0
      )
      .map((allocation: ProjectAllocation) => allocation.phase_id);
    
    return projectPhases
      .filter((projectPhase: ProjectPhaseLink) => phasesWithRole.includes(projectPhase.phase_id))
      .map((projectPhase: ProjectPhaseLink) => ({
        id: projectPhase.phase_id,
        name: projectPhase.phase_name,
        start_date: projectPhase.start_date,
        end_date: projectPhase.end_date
      }));
  }, [projectPhases, projectAllocations, formData.role_id]);

  // Calculate impact preview
  const impactPreview = useMemo(() => {
    const allocation = selectedRecommendation?.suggestedAllocation || formData.allocation_percentage;
    const newUtilization = utilizationData.currentUtilization + allocation;
    const utilizationPercentage = (newUtilization / utilizationData.availability) * 100;

    return {
      newUtilization,
      utilizationPercentage,
      isOverallocated: newUtilization > utilizationData.availability,
      message: newUtilization > utilizationData.availability
        ? t('assignments:smart.overallocateMessage', {
            name: person?.name || t('assignments:smart.thePerson'),
            percent: newUtilization - utilizationData.availability
          })
        : t('assignments:smart.utilizationMessage', {
            name: person?.name || t('assignments:smart.thePersonCapital'),
            percent: utilizationPercentage.toFixed(0)
          })
    };
  }, [utilizationData, formData.allocation_percentage, selectedRecommendation, person, t]);

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: AssignmentCreateData) => {
      console.log('Creating assignment with data:', data);
      return api.assignments.create(data);
    },
    onSuccess: (_response) => {
      // Invalidate all queries that might be affected by the new assignment
      const projectId = selectedRecommendation?.project.id || formData.project_id;

      // Person-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(personId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.withAssignments(personId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(personId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.assignments(personId) });

      // Project-related queries
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.assignments(projectId) });
      }

      // General queries
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });

      onClose();
    },
    onError: (error: ApiError) => {
      console.error('Failed to create assignment');
      console.error('Error details:', error.response?.data?.details);
      console.error('Error message:', error.response?.data?.error || error.response?.data?.message);

      const errorMessage = error.response?.data?.error ||
                          error.response?.data?.message ||
                          error.response?.data?.details ||
                          error.message ||
                          t('assignments:smart.errors.createAssignmentFailed');

      alert(t('assignments:smart.errors.createFailed', {
        message: errorMessage,
        details: error.response?.data?.details || t('assignments:smart.errors.unknownError')
      }));
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return api.assignments.delete(assignmentId);
    },
    onSuccess: () => {
      // Invalidate queries after deletion
      queryClient.invalidateQueries({ queryKey: queryKeys.people.detail(personId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.withAssignments(personId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.timeline(personId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
    },
    onError: (error: ApiError) => {
      console.error('Failed to delete assignment:', error);
      alert(t('assignments:smart.errors.deleteFailed'));
    }
  });

  const handleRecommendationSelect = (recommendation: ProjectRecommendation) => {
    setSelectedRecommendation(recommendation);
    
    // Calculate default end date (6 months from now if no target date)
    const startDate = new Date();
    const defaultEndDate = new Date(startDate);
    defaultEndDate.setMonth(defaultEndDate.getMonth() + 6);
    
    setFormData(prev => ({
      ...prev,
      project_id: recommendation.project.id,
      role_id: recommendation.suggestedRole.id,
      allocation_percentage: recommendation.suggestedAllocation,
      start_date: startDate.toISOString().split('T')[0],
      end_date: recommendation.project.target_end_date || defaultEndDate.toISOString().split('T')[0]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.project_id && !selectedRecommendation) {
      alert(t('assignments:smart.errors.selectProject'));
      return;
    }

    if (!formData.role_id) {
      alert(t('assignments:smart.errors.selectRole'));
      return;
    }

    // Validate role exists in database
    const rolesData = roles || [];
    const roleExists = (rolesData as Role[]).some((r) => r.id === formData.role_id);
    if (!roleExists) {
      console.error('Invalid role ID:', formData.role_id);
      console.error('Available roles:', rolesData);
      alert(t('assignments:smart.errors.invalidRole'));
      return;
    }

    // Only validate dates if not using phase mode
    if (!formData.phase_id) {
      if (!formData.start_date) {
        alert(t('assignments:smart.errors.selectStartDate'));
        return;
      }

      if (!formData.end_date) {
        alert(t('assignments:smart.errors.selectEndDate'));
        return;
      }
    }
    
    // Build assignment data
    const assignmentData: AssignmentCreateData = {
      person_id: personId,
      project_id: selectedRecommendation?.project.id || formData.project_id,
      role_id: formData.role_id,
      allocation_percentage: Number(selectedRecommendation?.suggestedAllocation || formData.allocation_percentage),
    };

    // For phase-aligned assignments, don't send explicit dates
    if (formData.phase_id) {
      assignmentData.phase_id = formData.phase_id;
      assignmentData.assignment_date_mode = 'phase';
      // Don't include start_date and end_date for phase mode
    } else {
      // For fixed-date assignments, include the dates
      assignmentData.assignment_date_mode = 'fixed';
      assignmentData.start_date = formData.start_date;
      assignmentData.end_date = formData.end_date;
    }
    
    // Log the data for debugging
    console.log('Submitting role_id:', assignmentData.role_id);
    console.log('Submitting project_id:', assignmentData.project_id);
    console.log('Full assignment data:', JSON.stringify(assignmentData, null, 2));

    createAssignmentMutation.mutate(assignmentData);
  };

  const handleFormChange = (field: string, value: string | number) => {
    if (field === 'phase_id' && value) {
      // When a phase is selected, set reasonable future dates instead of historical phase dates
      const today = new Date();
      const defaultStartDate = new Date(today);
      const defaultEndDate = new Date(today);
      
      // Set default duration based on phase using extracted utility
      const selectedPhase = (projectPhases as ProjectPhaseLink[] | undefined)?.find((phase) => phase.phase_id === value);
      if (selectedPhase) {
        // Calculate duration using utility function
        const durationWeeks = calculatePhaseDurationWeeks(selectedPhase.phase_name);
        defaultEndDate.setDate(defaultEndDate.getDate() + (durationWeeks * 7));
        
        setFormData(prev => ({
          ...prev,
          [field]: value,
          start_date: defaultStartDate.toISOString().split('T')[0],
          end_date: defaultEndDate.toISOString().split('T')[0]
        }));
        return;
      }
    }
    
    // If project changes, reset role and phase selection
    if (field === 'project_id') {
      setFormData(prev => ({ 
        ...prev, 
        [field]: value,
        role_id: '',
        phase_id: '' 
      }));
      return;
    }
    
    // If role changes, reset phase selection
    if (field === 'role_id') {
      setFormData(prev => ({ 
        ...prev, 
        [field]: value,
        phase_id: '' 
      }));
      return;
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl smart-assignment-modal bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
            <Sparkles size={20} />
            {t('assignments:smart.title', { name: personName || person?.name })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('assignments:smart.description', { name: personName || person?.name })}
          </DialogDescription>
        </DialogHeader>

        {/* Current Status Bar */}
        <div className="status-bar">
          <div className="status-item">
            <BarChart3 size={20} />
            <span>{t('assignments:smart.currentUtilization')}: <strong>{utilizationData.currentUtilization}%</strong></span>
          </div>
          <div className="status-item">
            <Users size={20} />
            <span>{t('assignments:smart.availableCapacity')}: <strong>{utilizationData.remainingCapacity}%</strong></span>
          </div>
          <div className="status-item">
            <Clock size={20} />
            <span><strong>{utilizationData.activeAssignments?.length || 0}</strong> {t('assignments:smart.activeAssignments')}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="assignment-form">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="recommended">
                <TrendingUp className="mr-2" size={16} />
                {t('assignments:smart.tab.recommended')}
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Calendar className="mr-2" size={16} />
                {t('assignments:smart.tab.manual')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recommended" className="recommendations-tab">
              {projectRecommendations.length > 0 ? (
                <div className="recommendations-list">
                  {projectRecommendations.map((rec, _index) => (
                    <div
                      key={rec.project.id}
                      className={cn(
                        "recommendation-card",
                        selectedRecommendation?.project.id === rec.project.id && "selected",
                        `fit-${rec.fitLevel}`
                      )}
                      onClick={() => handleRecommendationSelect(rec)}
                    >
                      <div className="recommendation-header">
                        <h4>{rec.project.name}</h4>
                        <span className={`fit-badge ${rec.fitLevel}`}>
                          {rec.fitLevel === 'excellent'
                            ? t('assignments:smart.fit.excellent')
                            : rec.fitLevel === 'good'
                              ? t('assignments:smart.fit.good')
                              : t('assignments:smart.fit.partial')}
                        </span>
                      </div>
                      <p className="recommendation-reason">{rec.reason}</p>
                      <div className="recommendation-details">
                        <span>{t('assignments:smart.suggestedAllocation', { allocation: rec.suggestedAllocation })}</span>
                        <span>{t('assignments:smart.priorityLabel')} {rec.project.priority}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-recommendations">
                  <Info size={48} />
                  <p>{t('assignments:smart.emptyRecommendations')}</p>
                  <p>{t('assignments:smart.emptyRecommendationsHint')}</p>
                </div>
              )}

              {/* Show selected recommendation details */}
              {selectedRecommendation && (
                <div className="selected-recommendation-info">
                  <h4>{t('assignments:smart.selectedAssignment')}</h4>
                  <div className="assignment-summary">
                    <div className="summary-item">
                      <span className="summary-label">{t('assignments:fields.project')}:</span>
                      <span className="summary-value">{selectedRecommendation.project.name}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">{t('assignments:fields.role')}:</span>
                      <span className="summary-value">{selectedRecommendation.suggestedRole.name}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">{t('common:allocation')}:</span>
                      <span className="summary-value">{selectedRecommendation.suggestedAllocation}%</span>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="manual-tab">
              {actionType === 'reduce_workload' ? (
                // Show delete interface for reducing workload
                <div className="delete-assignments-container">
                  <div style={{ 
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                    border: `1px solid ${isDarkMode ? '#dc2626' : '#fca5a5'}`,
                    borderRadius: '0.375rem',
                    color: isDarkMode ? '#fca5a5' : '#dc2626'
                  }}>
                    <strong>{t('assignments:smart.selectToRemove')}</strong>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {t('assignments:smart.removingHint', { name: personName })}
                    </p>
                  </div>
                  
                  {utilizationData.activeAssignments && utilizationData.activeAssignments.length > 0 ? (
                    <div className="assignments-list">
                      {utilizationData.activeAssignments.map((assignment: ActiveAssignment, index: number) => (
                        <div key={assignment.id || `assignment-${index}`} className="assignment-item" style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: isDarkMode ? '#374151' : '#f9fafb',
                          border: `1px solid ${isDarkMode ? '#4b5563' : '#e5e7eb'}`,
                          borderRadius: '0.375rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                              {assignment.project_name || t('assignments:smart.unknownProject')}
                              {!assignment.id && <span style={{ color: 'red', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{t('assignments:smart.noId')}</span>}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                              {assignment.role_name || t('assignments:smart.unknownRole')} • {t('assignments:smart.allocationAmount', { amount: assignment.allocation_percentage || 0 })}
                              {assignment.phase_name && ` • ${assignment.phase_name}`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: isDarkMode ? '#9ca3af' : '#6b7280', marginTop: '0.25rem' }}>
                              {new Date(assignment.computed_start_date || assignment.start_date).toLocaleDateString(getLocale())} -
                              {new Date(assignment.computed_end_date || assignment.end_date).toLocaleDateString(getLocale())}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!assignment.id) {
                                alert(t('assignments:smart.errors.missingAssignmentId'));
                                return;
                              }
                              if (confirm(t('assignments:smart.removeConfirm', { name: assignment.project_name }))) {
                                deleteAssignmentMutation.mutate(assignment.id);
                              }
                            }}
                            disabled={deleteAssignmentMutation.isPending || !assignment.id}
                            className="btn btn-danger btn-sm"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              opacity: !assignment.id ? 0.5 : 1,
                              cursor: !assignment.id ? 'not-allowed' : 'pointer'
                            }}
                            title={!assignment.id ? t('assignments:smart.cannotDeleteMissingId') : undefined}
                          >
                            <Trash2 size={16} />
                            {t('common:remove')}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: isDarkMode ? '#9ca3af' : '#6b7280'
                    }}>
                      <Info size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                      <p>{t('assignments:smart.noActiveAssignments', { name: personName })}</p>
                    </div>
                  )}
                </div>
              ) : (
                // Show add interface for adding assignments
                <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project-select">
                    {t('assignments:fields.project')} <span aria-hidden="true">*</span><span className="sr-only">{t('common:forms.requiredSrOnly')}</span>
                    {!isLoadingAllocations && projectsWithDemand.length > 0 && projectsWithDemand.length < (projects?.data?.length || 0) && (
                      <span className="text-xs text-muted-foreground font-normal ml-2">
                        {t('assignments:smart.withResourceNeeds', { count: projectsWithDemand.length })}
                      </span>
                    )}
                  </Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => handleFormChange('project_id', value)}
                    disabled={!isLoadingAllocations && projectsWithDemand.length === 0}
                  >
                    <SelectTrigger id="project-select" aria-required="true">
                      <SelectValue placeholder={
                        isLoadingAllocations
                          ? t('assignments:smart.loadingProjects')
                          : projectsWithDemand.length === 0
                            ? t('assignments:smart.noProjectDemand')
                            : t('assignments:smart.selectProjectWithNeeds')
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {projectsWithDemand.map((project: ProjectWithDemand) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role-select">
                    {t('assignments:fields.role')} <span aria-hidden="true">*</span><span className="sr-only">{t('common:forms.requiredSrOnly')}</span>
                    {formData.project_id && projectRoles.length > 0 && (
                      <span className="text-xs text-muted-foreground font-normal ml-2">
                        {t('assignments:smart.rolesNeeded', { count: projectRoles.length })}
                      </span>
                    )}
                  </Label>
                  <Select
                    value={formData.role_id}
                    onValueChange={(value) => handleFormChange('role_id', value)}
                    disabled={!formData.project_id || projectRoles.length === 0 || projectsWithDemand.length === 0}
                  >
                    <SelectTrigger id="role-select" aria-required="true">
                      <SelectValue placeholder={
                        formData.project_id && projectRoles.length === 0
                          ? t('assignments:smart.noRolesNeeded')
                          : formData.project_id
                            ? t('assignments:smart.selectRoleFromDemands')
                            : t('assignments:smart.selectProjectFirst')
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(formData.project_id ? projectRoles : roles) && (formData.project_id ? projectRoles : roles).map((role: RoleWithDemand) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="phase-select">
                      {t('assignments:fields.phase')}
                      {formData.role_id && filteredPhases.length > 0 && (
                        <span className="text-xs text-muted-foreground font-normal ml-2">
                          {t('assignments:smart.phasesWithRole', { count: filteredPhases.length })}
                        </span>
                      )}
                    </Label>
                    {formData.project_id && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => refetchPhases()}
                          title={t('assignments:smart.refreshPhaseDates')}
                          className="p-1 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <a
                          href={`/projects/${formData.project_id}?tab=timeline`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('assignments:smart.editPhaseDates')}
                          className="p-1 text-muted-foreground hover:text-primary transition-colors flex items-center"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    )}
                  </div>
                  <Select
                    value={formData.phase_id}
                    onValueChange={(value) => handleFormChange('phase_id', value)}
                    disabled={!formData.project_id || !formData.role_id || projectsWithDemand.length === 0}
                  >
                    <SelectTrigger id="phase-select">
                      <SelectValue placeholder={
                        !formData.project_id
                          ? t('assignments:smart.selectProjectFirst')
                          : !formData.role_id
                            ? t('assignments:smart.selectRoleFirst')
                            : filteredPhases.length === 0
                              ? t('assignments:smart.noPhasesNeedRole')
                              : t('assignments:smart.noSpecificPhase')
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPhases?.map((phase: FilteredPhase) => (
                        <SelectItem key={phase.id} value={phase.id}>
                          {phase.name} ({new Date(phase.start_date).toLocaleDateString(getLocale())} - {new Date(phase.end_date).toLocaleDateString(getLocale())})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.phase_id && (
                  <div className="col-span-2 p-3 bg-primary/10 border border-primary/30 rounded-md text-sm text-primary flex items-center gap-2 mb-2">
                    <Link2 size={16} className="flex-shrink-0" />
                    <div>
                      <strong>{t('assignments:smart.phaseLinkedLabel')}</strong> {t('assignments:smart.phaseLinkedDescription')}
                    </div>
                  </div>
                )}

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="allocation-slider">
                    {t('assignments:smart.allocationLabel', { allocation: formData.allocation_percentage })}
                  </Label>
                  <input
                    id="allocation-slider"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.allocation_percentage}
                    onChange={(e) => handleFormChange('allocation_percentage', parseInt(e.target.value, 10))}
                    className="allocation-slider"
                  />
                  <div className="allocation-guide">
                    <span className="guide-text">0%</span>
                    <span className="guide-text">100%</span>
                  </div>
                  <div className="allocation-available">
                    <span className="guide-text available">
                      {t('common:forms.percentAvailable', { available: utilizationData.remainingCapacity })}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start-date">
                    {t('common:startDate')} <span aria-hidden="true">*</span><span className="sr-only">{t('common:forms.requiredSrOnly')}</span>
                    {formData.phase_id && (
                      <span className="text-xs text-primary font-normal ml-2">
                        {t('assignments:smart.linkedToPhase')}
                      </span>
                    )}
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => handleFormChange('start_date', e.target.value)}
                    required
                    aria-required="true"
                    disabled={!!formData.phase_id}
                    className={formData.phase_id ? 'opacity-70 cursor-not-allowed' : ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-date">
                    {t('common:endDate')} <span aria-hidden="true">*</span><span className="sr-only">{t('common:forms.requiredSrOnly')}</span>
                    {formData.phase_id && (
                      <span className="text-xs text-primary font-normal ml-2">
                        {t('assignments:smart.linkedToPhase')}
                      </span>
                    )}
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => handleFormChange('end_date', e.target.value)}
                    min={formData.start_date}
                    required
                    aria-required="true"
                    disabled={!!formData.phase_id}
                    className={formData.phase_id ? 'opacity-70 cursor-not-allowed' : ''}
                  />
                </div>
              </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Impact Preview */}
          {actionType !== 'reduce_workload' && (selectedRecommendation || formData.project_id) && (
            <div className={cn(
              "impact-preview",
              impactPreview.isOverallocated ? "warning" : "success"
            )} role="status" aria-live="polite">
              <div className="impact-header">
                {impactPreview.isOverallocated ? (
                  <AlertTriangle size={20} aria-hidden="true" />
                ) : (
                  <CheckCircle size={20} aria-hidden="true" />
                )}
                <h4>{t('assignments:smart.impactTitle')}</h4>
              </div>
              <p>{impactPreview.message}</p>
              <div className="impact-details">
                <span>{t('assignments:smart.newTotalAllocation', { allocation: impactPreview.newUtilization })}</span>
                <span>{t('assignments:smart.utilizationLabel', { percent: impactPreview.utilizationPercentage.toFixed(0) })}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {actionType === 'reduce_workload' ? t('assignments:smart.done') : t('common:cancel')}
            </Button>
            {actionType !== 'reduce_workload' && (
              <Button
                type="submit"
                disabled={createAssignmentMutation.isPending || (!selectedRecommendation && !formData.project_id)}
              >
                {createAssignmentMutation.isPending ? t('common:creating') : t('assignments:form.create')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}