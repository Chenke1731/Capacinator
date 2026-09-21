import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Users, Briefcase, Clock,
  MapPin, Target, AlertTriangle, AlertCircle,
  CheckCircle, XCircle, Circle, RefreshCw, Edit2, Trash2, Save,
  Calculator
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { formatDate } from '../utils/date';
import { ProjectDemandChart } from '../components/ProjectDemandChart';
import { InlineEdit } from '../components/ui/InlineEdit';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { EstimationPanel } from '../components/estimation/EstimationPanel';
import { LifecycleBanner } from '../components/lifecycle/LifecycleBanner';
import { StaffingSection } from '../components/staffing/StaffingSection';
import './ProjectDetail.css';

interface ProjectDetail {
  id: string;
  name: string;
  project_type_id?: string;
  project_type_name?: string;
  project_type?: {
    id: string;
    name: string;
    color_code?: string;
  };
  location_id?: string;
  location_name?: string;
  priority: number;
  description?: string | null;
  data_restrictions?: string | null;
  include_in_demand: number;
  aspiration_start?: string | null;
  aspiration_finish?: string | null;
  external_id?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  created_at: number;
  updated_at: number;
  phases: Array<{
    id: string;
    project_id: string;
    phase_id: string;
    phase_name: string;
    phase_description: string;
    start_date: number;
    end_date: number;
    created_at: number;
    updated_at: number;
  }>;
  assignments: Array<{
    id: string;
    project_id: string;
    person_id: string;
    person_name: string;
    role_id: string;
    role_name: string;
    phase_id?: string | null;
    start_date: number;
    end_date: number;
    allocation_percentage: number;
    created_at: number;
    updated_at: number;
  }>;
  planners: Array<any>;
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    demand: true,
    assignments: true,
    estimation: false,
    history: false
  });

  // Assignment modal state
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [isEditingAssignment, setIsEditingAssignment] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    allocation_percentage: 0,
    start_date: '',
    end_date: ''
  });

  // Check user permissions
  const canEdit = localStorage.getItem('userRole') !== 'viewer';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future delete-permission gating
  const canDelete = localStorage.getItem('userRole') === 'admin';

  // Fetch project details
  const { data: project, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.detail(id!),
    queryFn: async () => {
      const response = await api.projects.get(id!);
      return response.data.data as ProjectDetail;
    },
    enabled: !!id
  });

  // Fetch project types for dropdown
  const { data: projectTypes } = useQuery({
    queryKey: queryKeys.projectTypes.list(),
    queryFn: async () => {
      const response = await api.projectTypes.list();
      return response.data.data || response.data;
    }
  });

  // Fetch locations for dropdown
  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: async () => {
      const response = await api.locations.list();
      return response.data.data;
    }
  });

  // Individual field update mutations
  const updateProjectFieldMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      const response = await api.projects.update(id!, { [field]: value });
      return response.data.data || response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id!) });
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.assignments.delete(assignmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id!) });
    }
  });

  // Update assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ assignmentId, updates }: { assignmentId: string; updates: any }) => {
      const response = await api.assignments.update(assignmentId, updates);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id!) });
      setSelectedAssignment(null);
      setIsEditingAssignment(false);
    }
  });

  // Handle individual field updates
  const handleFieldUpdate = (field: string, value: any) => {
    updateProjectFieldMutation.mutate({ field, value });
  };

  // Handle assignment card click
  const handleAssignmentClick = (assignment: any) => {
    setSelectedAssignment(assignment);
    setAssignmentForm({
      allocation_percentage: assignment.allocation_percentage,
      start_date: new Date(assignment.start_date).toISOString().split('T')[0],
      end_date: new Date(assignment.end_date).toISOString().split('T')[0]
    });
  };

  // Handle assignment form submission
  const handleAssignmentSubmit = () => {
    if (!selectedAssignment) return;
    
    updateAssignmentMutation.mutate({
      assignmentId: selectedAssignment.id,
      updates: {
        allocation_percentage: parseInt(assignmentForm.allocation_percentage.toString(), 10),
        start_date: new Date(assignmentForm.start_date).getTime(),
        end_date: new Date(assignmentForm.end_date).getTime()
      }
    });
  };

  // Handle assignment deletion
  const handleAssignmentDelete = () => {
    if (!selectedAssignment) return;

    if (confirm(t('projects:deleteAssignmentConfirm'))) {
      deleteAssignmentMutation.mutate(selectedAssignment.id);
      setSelectedAssignment(null);
    }
  };

  // Handle field updates with proper type conversion
  const createFieldHandler = (field: string) => (value: string | number | boolean) => {
    if (field === 'include_in_demand') {
      handleFieldUpdate(field, value ? 1 : 0);
    } else if (typeof value === 'string' && ['priority'].includes(field)) {
      handleFieldUpdate(field, parseInt(value, 10));
    } else {
      handleFieldUpdate(field, value);
    }
  };


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'red';
      case 2: return 'orange';
      case 3: return 'yellow';
      case 4: return 'green';
      default: return 'gray';
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return t('projects:priorityLevel.critical');
      case 2: return t('projects:priorityLevel.high');
      case 3: return t('projects:priorityLevel.medium');
      case 4: return t('projects:priorityLevel.low');
      default: return t('projects:priorityLevel.unknown');
    }
  };

  const getPriorityVariant = (priority: number) => {
    switch (priority) {
      case 1: return 'destructive';
      case 2: return 'warning';
      case 3: return 'secondary';
      case 4: return 'success';
      default: return 'outline';
    }
  };

  const getPriorityIcon = (priority: number) => {
    switch (priority) {
      case 1: return AlertTriangle; // Critical
      case 2: return AlertCircle;   // High
      case 3: return Circle;        // Medium
      case 4: return CheckCircle;   // Low
      default: return Circle;
    }
  };

  // Enhanced loading state with skeleton
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-8 w-64" />
                </div>
              </div>
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </CardHeader>
        </Card>
        
        <div className="space-y-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-6 w-32" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Enhanced error state
  if (error || !project) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{t('projects:loadErrorTitle')}</AlertTitle>
          <AlertDescription className="mt-2">
            {t('projects:loadErrorDetail')}
          </AlertDescription>
          <div className="mt-4 flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common:retry')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('projects:backToProjects')}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                className="page-back-btn"
                onClick={() => navigate('/projects')}
                title={t('projects:backToProjects')}
                aria-label={t('projects:backToProjects')}
              >
                <ArrowLeft size={22} />
              </button>
              <div className="flex items-center space-x-3">
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.project_type?.color_code || '#6b7280' }}
                />
                <CardTitle className="text-2xl font-bold">{project.name}</CardTitle>
                {(project as any).tags?.length > 0 && (
                  <span className="flex items-center gap-1.5 ml-2">
                    {(project as any).tags.map((tag: any) => (
                      <span
                        key={tag.id}
                        className="tag-badge"
                        style={{ backgroundColor: tag.color || 'var(--text-tertiary)' }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <Badge
              variant={getPriorityVariant(project.priority) as any}
              className="text-sm px-3 py-1 flex items-center gap-1"
            >
              {(() => {
                const PriorityIcon = getPriorityIcon(project.priority);
                return <PriorityIcon size={14} className="mr-1" />;
              })()}
              {getPriorityLabel(project.priority)}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Lifecycle banner: single state axis driving the whole page (零弹窗推进) */}
      <LifecycleBanner project={project} />

      <div className="space-y-6">
        {/* Basic Information Section */}
        <CollapsibleSection
          title={t('projects:projectInformation')}
          icon={Target}
          expanded={expandedSections.basic}
          onToggle={(expanded) => setExpandedSections(prev => ({ ...prev, basic: expanded }))}
        >
          <div className="info-grid">
            <div className="info-item">
              <label>{t('projects:projectType')}</label>
              <InlineEdit
                value={project.project_type_id || ''}
                onSave={createFieldHandler('project_type_id')}
                type="select"
                options={Array.isArray(projectTypes) ? projectTypes.map((type: any) => ({
                  value: type.id,
                  label: type.name
                })) : []}
                placeholder={t('projects:placeholder.selectProjectType')}
                disabled={!canEdit}
              />
            </div>

            <div className="info-item">
              <label>{t('projects:location')}</label>
              <InlineEdit
                value={project.location_id || ''}
                onSave={createFieldHandler('location_id')}
                type="select"
                options={Array.isArray(locations) ? locations.map((loc: any) => ({
                  value: loc.id,
                  label: loc.name
                })) : []}
                placeholder={t('projects:placeholder.selectLocation')}
                icon={MapPin}
                disabled={!canEdit}
              />
            </div>

            <div className="info-item">
              <label>{t('projects:priority')}</label>
              <InlineEdit
                value={project.priority || ''}
                onSave={createFieldHandler('priority')}
                type="select"
                options={[
                  { value: 1, label: t('projects:priorityLevel.critical') },
                  { value: 2, label: t('projects:priorityLevel.high') },
                  { value: 3, label: t('projects:priorityLevel.medium') },
                  { value: 4, label: t('projects:priorityLevel.low') }
                ]}
                placeholder={t('projects:placeholder.selectPriority')}
                disabled={!canEdit}
              />
            </div>

            <div className="info-item">
              <label>{t('projects:owner')}</label>
              <div className="info-value">{project.owner_name || t('projects:notAssigned')}</div>
            </div>

            <div className="info-item">
              <label>{t('projects:externalId')}</label>
              <InlineEdit
                value={project.external_id || ''}
                onSave={createFieldHandler('external_id')}
                placeholder={t('projects:placeholder.enterExternalId')}
                disabled={!canEdit}
              />
            </div>

            <div className="info-item">
              <label>{t('projects:includeInDemand')}</label>
              <InlineEdit
                value={project.include_in_demand === 1}
                onSave={createFieldHandler('include_in_demand')}
                type="checkbox"
                disabled={!canEdit}
              />
            </div>

            <div className="info-item info-item-full">
              <label>{t('common:description')}</label>
              <InlineEdit
                value={project.description || ''}
                onSave={createFieldHandler('description')}
                type="textarea"
                placeholder={t('projects:placeholder.enterProjectDescription')}
                disabled={!canEdit}
              />
            </div>

            <div className="info-item info-item-full">
              <label>{t('projects:dataRestrictions')}</label>
              <InlineEdit
                value={project.data_restrictions || ''}
                onSave={createFieldHandler('data_restrictions')}
                type="textarea"
                placeholder={t('projects:placeholder.enterDataRestrictions')}
                disabled={!canEdit}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Resource Demand Section */}
        <CollapsibleSection
          title={t('projects:resourceDemand')}
          icon={Briefcase}
          expanded={expandedSections.demand}
          onToggle={(expanded) => setExpandedSections(prev => ({ ...prev, demand: expanded }))}
        >
          <ProjectDemandChart projectId={project.id} projectName={project.name} />
        </CollapsibleSection>

        {/* Current Assignments Section: mixed named + pool rows with side summary */}
        <CollapsibleSection
          title={t('projects:teamAssignments')}
          icon={Users}
          expanded={expandedSections.assignments}
          onToggle={(expanded) => setExpandedSections(prev => ({ ...prev, assignments: expanded }))}
        >
          <StaffingSection
            project={project}
            canEdit={canEdit}
            onAssignmentClick={handleAssignmentClick}
            onDeleteAssignment={(assignment) => deleteAssignmentMutation.mutate(assignment.id)}
          />
        </CollapsibleSection>

        {/* Estimation Section: design rough estimate while designing, LOC after admit */}
        <CollapsibleSection
          title={t('projects:estimation.title')}
          icon={Calculator}
          expanded={expandedSections.estimation}
          onToggle={(expanded) => setExpandedSections(prev => ({ ...prev, estimation: expanded }))}
        >
          <EstimationPanel projectId={project.id} lifecycleState={project.lifecycle_state ?? null} designDeadline={project.design_deadline ?? null} />
        </CollapsibleSection>

        {/* History Section */}
        <CollapsibleSection
          title={t('projects:history')}
          icon={Clock}
          expanded={expandedSections.history}
          onToggle={(expanded) => setExpandedSections(prev => ({ ...prev, history: expanded }))}
        >
          <div className="history-timeline">
            <div className="timeline-item">
              <div className="timeline-date">{formatDate(new Date(project.created_at).toISOString())}</div>
              <div className="timeline-content">
                <strong>{t('projects:historyProjectCreated')}</strong>
              </div>
            </div>
            <div className="timeline-item">
              <div className="timeline-date">{formatDate(new Date(project.updated_at).toISOString())}</div>
              <div className="timeline-content">
                <strong>{t('projects:historyLastUpdated')}</strong>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Assignment Modal */}
        <Dialog 
          open={!!selectedAssignment} 
          onOpenChange={(open) => {
            if (!open) {
              setSelectedAssignment(null);
              setIsEditingAssignment(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {isEditingAssignment ? t('projects:editAssignment') : t('projects:assignmentDetails')}
              </DialogTitle>
              <DialogDescription>
                {isEditingAssignment ? t('projects:updateAssignmentDetails') : t('projects:viewAssignmentInfo')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {selectedAssignment && (
                <>
                <div className="assignment-modal-info">
                  <div className="info-item">
                    <label>{t('projects:person')}</label>
                    <div className="info-value">{selectedAssignment.person_name}</div>
                  </div>
                  <div className="info-item">
                    <label>{t('projects:role')}</label>
                    <div className="info-value">{selectedAssignment.role_name}</div>
                  </div>
                </div>

                {isEditingAssignment ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleAssignmentSubmit(); }}>
                    <div className="form-group">
                      <label className="form-label">{t('projects:allocationPercentage')}</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={assignmentForm.allocation_percentage}
                        onChange={(e) => setAssignmentForm(prev => ({
                          ...prev,
                          allocation_percentage: parseInt(e.target.value, 10) || 0
                        }))}
                        className="form-input"
                        required
                      />
                    </div>
                    
                    <div className="form-group grid">
                      <div>
                        <label className="form-label">{t('common:startDate')}</label>
                        <input
                          type="date"
                          value={assignmentForm.start_date}
                          onChange={(e) => setAssignmentForm(prev => ({
                            ...prev,
                            start_date: e.target.value
                          }))}
                          className="form-input"
                          required
                        />
                      </div>
                      <div>
                        <label className="form-label">{t('common:endDate')}</label>
                        <input
                          type="date"
                          value={assignmentForm.end_date}
                          onChange={(e) => setAssignmentForm(prev => ({
                            ...prev,
                            end_date: e.target.value
                          }))}
                          className="form-input"
                          min={assignmentForm.start_date}
                          required
                        />
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditingAssignment(false)}
                      >
                        {t('common:cancel')}
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateAssignmentMutation.isPending}
                      >
                        <Save size={16} />
                        {t('projects:saveChanges')}
                      </Button>
                    </DialogFooter>
                  </form>
                ) : (
                  <div>
                    <div className="assignment-modal-details">
                      <div className="info-item">
                        <label>{t('projects:allocation')}</label>
                        <div className="info-value">{selectedAssignment.allocation_percentage}%</div>
                      </div>
                      <div className="info-item">
                        <label>{t('common:startDate')}</label>
                        <div className="info-value">
                          {formatDate(new Date(selectedAssignment.start_date).toISOString())}
                        </div>
                      </div>
                      <div className="info-item">
                        <label>{t('common:endDate')}</label>
                        <div className="info-value">
                          {formatDate(new Date(selectedAssignment.end_date).toISOString())}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedAssignment(null)}
                      >
                        {t('common:close')}
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            onClick={() => setIsEditingAssignment(true)}
                          >
                            <Edit2 size={16} />
                            {t('common:edit')}
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={handleAssignmentDelete}
                          >
                            <Trash2 size={16} />
                            {t('common:delete')}
                          </Button>
                        </>
                      )}
                    </DialogFooter>
                  </div>
                )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}