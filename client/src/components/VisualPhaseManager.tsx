import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import InteractiveTimeline, { TimelineItem, TimelineViewport } from './InteractiveTimeline';
import './InteractiveTimeline.css';
import { addDays, format } from 'date-fns';
import { Calendar, Plus } from 'lucide-react';
import { getLocale, getDateFnsLocale } from '../i18n';

// Import extracted components
import {
  PhaseAddModal,
  PhaseEditModal,
  DependencyModal,
  PhaseContextMenu,
  ProjectPhaseTimeline,
  AddPhaseFormData,
  EditPhaseFormData,
  DependencyFormData,
  ContextMenuPosition,
  PhaseDependency,
  getPhaseColor
} from './phase-manager';

interface VisualPhaseManagerProps {
  projectId: string;
  projectName: string;
  onPhasesChange?: () => void;
  compact?: boolean; // For integration with other charts
  externalViewport?: TimelineViewport; // For shared viewport control
  onViewportChange?: (viewport: TimelineViewport) => void; // Notify parent of viewport changes
  alignmentDimensions?: { // For precise alignment with charts
    left: number;
    width: number;
  };
  chartTimeData?: Array<{ date: string; [key: string]: any }>; // Chart data for time axis alignment
}

export function VisualPhaseManager({ projectId, projectName: _projectName, onPhasesChange, compact = false, externalViewport, onViewportChange, alignmentDimensions, chartTimeData }: VisualPhaseManagerProps) {
  const { t } = useTranslation();
  // Debug alignment dimensions
  React.useEffect(() => {
    if (alignmentDimensions) {
      console.log('📈 VisualPhaseManager received alignment dimensions:', alignmentDimensions);
    } else {
      console.log('⚠️ VisualPhaseManager: No alignment dimensions provided');
    }
  }, [alignmentDimensions]);

  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ProjectPhaseTimeline | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [isModalActive, setIsModalActive] = useState(false);
  const [addPhaseForm, setAddPhaseForm] = useState<AddPhaseFormData>({
    phase_id: '',
    start_date: '',
    end_date: '',
    phase_order: 1
  });
  const [editPhaseForm, setEditPhaseForm] = useState<EditPhaseFormData>({
    phase_name: '',
    start_date: '',
    end_date: '',
    phase_order: 1
  });

  // Dependency-related state
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const [editingDependency, setEditingDependency] = useState<PhaseDependency | null>(null);
  const [dependencyForm, setDependencyForm] = useState<DependencyFormData>({
    predecessor_phase_timeline_id: '',
    successor_phase_timeline_id: '',
    dependency_type: 'FS',
    lag_days: 0
  });

  // Fetch project phases
  const { data: phasesData, isLoading } = useQuery({
    queryKey: queryKeys.projectPhases.byProject(projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: projectId });
      return response.data;
    }
  });

  // Fetch available phase templates for adding new phases
  const { data: phaseTemplates } = useQuery({
    queryKey: queryKeys.phases.templates(),
    queryFn: async () => {
      const response = await api.phases.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch project phase dependencies
  const { data: dependenciesData, refetch: refetchDependencies } = useQuery({
    queryKey: queryKeys.projectPhases.dependencies(projectId),
    queryFn: async () => {
      const response = await api.projectPhaseDependencies.list({ project_id: projectId });
      return response.data;
    }
  });

  // Convert phases to timeline items (filter out garbage/test phases)
  const timelineItems: TimelineItem[] = React.useMemo(() => {
    if (!phasesData?.data) return [];

    // Filter out test/garbage phases based on common patterns
    const cleanPhases = phasesData.data.filter((phase: ProjectPhaseTimeline) => {
      const phaseName = phase.phase_name.toLowerCase();

      // Filter out obvious test/garbage phases
      if (phaseName.includes('test phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
      if (phaseName.includes('no adjust phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
      if (phaseName.includes('duplicated phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
      if (phaseName.includes('custom date phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;

      // Keep standard phases and clean custom phases
      return true;
    });

    // Sort by start date
    const sortedPhases = cleanPhases.sort((a: ProjectPhaseTimeline, b: ProjectPhaseTimeline) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    return sortedPhases.map((phase: ProjectPhaseTimeline) => ({
      id: phase.id,
      name: phase.phase_name,
      startDate: new Date(phase.start_date),
      endDate: new Date(phase.end_date),
      color: getPhaseColor(phase.phase_name),
      data: phase
    }));
  }, [phasesData]);

  // Create timeline viewport - use external if provided, otherwise calculate from data
  const timelineViewport = React.useMemo((): TimelineViewport => {
    // Validate external viewport has proper Date objects (not empty objects {})
    const isValidViewport = (viewport: TimelineViewport | undefined): boolean => {
      if (!viewport) return false;
      if (!viewport.startDate || !viewport.endDate) return false;
      // Check if dates are actually Date objects with valid time values
      if (!(viewport.startDate instanceof Date) || isNaN(viewport.startDate.getTime())) return false;
      if (!(viewport.endDate instanceof Date) || isNaN(viewport.endDate.getTime())) return false;
      return true;
    };

    // If we have external viewport AND alignment constraints, adjust pixelsPerDay to fit
    if (externalViewport && alignmentDimensions && compact && isValidViewport(externalViewport)) {
      const totalDays = (externalViewport.endDate.getTime() - externalViewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
      const availableWidth = alignmentDimensions.width;
      const fittedPixelsPerDay = Math.max(0.5, availableWidth / totalDays); // Ensure it fits exactly

      const adjustedViewport = {
        ...externalViewport,
        pixelsPerDay: fittedPixelsPerDay
      };

      console.log('📈 VisualPhaseManager adjusted viewport for alignment:', {
        original: externalViewport,
        adjusted: adjustedViewport,
        totalDays,
        availableWidth,
        fittedPixelsPerDay
      });

      return adjustedViewport;
    }

    // ALWAYS use external viewport if provided (for shared timeline control) - but only if valid
    if (externalViewport && isValidViewport(externalViewport)) {
      console.log('📈 VisualPhaseManager using external viewport:', externalViewport);
      return externalViewport;
    }

    // If external viewport is invalid, log warning
    if (externalViewport && !isValidViewport(externalViewport)) {
      console.warn('⚠️ VisualPhaseManager received invalid external viewport (empty date objects), falling back to internal calculation:', externalViewport);
    }

    // Only calculate own viewport if no external control AND not in compact mode
    // In compact mode (integrated with resource chart), we should wait for external viewport
    if (compact) {
      // Return a default viewport while waiting for external control
      const today = new Date();
      return {
        startDate: new Date(today.getFullYear(), 0, 1),
        endDate: new Date(today.getFullYear() + 1, 11, 31),
        pixelsPerDay: 2
      };
    }

    // Calculate own viewport only for standalone mode
    if (timelineItems.length === 0) {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), 0, 1); // Start of current year
      const endDate = new Date(today.getFullYear() + 1, 11, 31); // End of next year
      const viewport = {
        startDate,
        endDate,
        pixelsPerDay: 2
      };

      // Only notify parent in standalone mode
      if (!compact) {
        onViewportChange?.(viewport);
      }
      return viewport;
    }

    // Calculate date range from actual phase data - only in standalone mode
    const allDates = timelineItems.flatMap(item => [item.startDate, item.endDate]);
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // Add padding
    const paddingDays = Math.max(30, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) * 0.05));
    const startDate = addDays(minDate, -paddingDays);
    const endDate = addDays(maxDate, paddingDays);

    // Calculate appropriate zoom level for full page width
    const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    // Target wider viewport - use more pixels per day to utilize full width
    const pixelsPerDay = Math.max(2, Math.min(12, 1400 / totalDays)); // Target ~1400px width

    const viewport = {
      startDate,
      endDate,
      pixelsPerDay
    };

    // Only notify parent in standalone mode
    if (!compact) {
      onViewportChange?.(viewport);
    }

    return viewport;
  }, [timelineItems, externalViewport, onViewportChange, compact, alignmentDimensions]);

  // Update phase mutation
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ phaseId, updates }: { phaseId: string; updates: Partial<ProjectPhaseTimeline> }) => {
      const response = await api.projectPhases.update(phaseId, updates);
      return response.data;
    },
    onMutate: async ({ phaseId, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });

      // Snapshot the previous value
      const previousPhases = queryClient.getQueryData(queryKeys.projectPhases.byProject(projectId));

      // Optimistically update to the new value
      queryClient.setQueryData(queryKeys.projectPhases.byProject(projectId), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((phase: ProjectPhaseTimeline) =>
            phase.id === phaseId
              ? { ...phase, ...updates }
              : phase
          )
        };
      });

      // Return a context object with the snapshotted value
      return { previousPhases };
    },
    onError: (err: any, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousPhases) {
        queryClient.setQueryData(queryKeys.projectPhases.byProject(projectId), context.previousPhases);
      }

      // Show validation errors to user
      if (err?.response?.data?.validation_errors) {
        const errors = err.response.data.validation_errors;
        console.error('Phase update validation failed:', errors);
        alert(t('phases:visual.dependencyValidationFailed') + '\n' + errors.join('\n'));
      } else {
        console.error('Phase update failed:', err);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      onPhasesChange?.();
    }
  });

  // Delete phase mutation
  const deletePhaseMutation = useMutation({
    mutationFn: async (phaseId: string) => {
      await api.projectPhases.delete(phaseId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      onPhasesChange?.();
    }
  });

  // Add phase mutation
  const addPhaseMutation = useMutation({
    mutationFn: async (phaseData: Omit<ProjectPhaseTimeline, 'id'>) => {
      const response = await api.projectPhases.create(phaseData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      onPhasesChange?.();
    }
  });

  // Handle phase movement/resizing
  const handlePhaseMove = useCallback((itemId: string, newStartDate: Date, newEndDate: Date) => {
    updatePhaseMutation.mutate({
      phaseId: itemId,
      updates: {
        start_date: format(newStartDate, 'yyyy-MM-dd'),
        end_date: format(newEndDate, 'yyyy-MM-dd')
      }
    });
  }, [updatePhaseMutation]);

  const handlePhaseResize = useCallback((itemId: string, newStartDate: Date, newEndDate: Date) => {
    updatePhaseMutation.mutate({
      phaseId: itemId,
      updates: {
        start_date: format(newStartDate, 'yyyy-MM-dd'),
        end_date: format(newEndDate, 'yyyy-MM-dd')
      }
    });
  }, [updatePhaseMutation]);

  // Handle phase editing
  const handlePhaseEdit = useCallback((itemId: string) => {
    const phase = phasesData?.data.find((p: ProjectPhaseTimeline) => p.id === itemId);
    if (phase) {
      setShowAddModal(false); // Ensure add modal is closed
      setIsModalActive(true);
      setEditingPhase(phase);
      setEditPhaseForm({
        phase_name: phase.phase_name,
        start_date: phase.start_date,
        end_date: phase.end_date,
        phase_order: phase.phase_order
      });
    }
  }, [phasesData]);

  // Handle phase deletion
  const handlePhaseDelete = useCallback((itemId: string) => {
    if (confirm(t('phases:manager.deletePhaseConfirmPermanent'))) {
      deletePhaseMutation.mutate(itemId);
    }
  }, [deletePhaseMutation, t]);

  // Handle adding new phase
  const handleAddPhase = useCallback((afterItemId?: string, position?: { x: number, date: Date }) => {
    // Don't open add modal if any modal is active
    if (isModalActive) return;

    // Pre-populate form with suggested dates if position is provided
    if (position?.date) {
      const startDate = format(position.date, 'yyyy-MM-dd');
      const endDate = format(addDays(position.date, 30), 'yyyy-MM-dd'); // Default 30-day duration
      setAddPhaseForm(prev => ({
        ...prev,
        start_date: startDate,
        end_date: endDate,
        phase_order: timelineItems.length + 1
      }));
    } else {
      // Auto-calculate next phase start date
      const lastPhase = timelineItems.sort((a, b) => (b.data as ProjectPhaseTimeline).phase_order - (a.data as ProjectPhaseTimeline).phase_order)[0];
      const suggestedStart = lastPhase ? addDays(lastPhase.endDate, 1) : new Date();
      setAddPhaseForm(prev => ({
        ...prev,
        start_date: format(suggestedStart, 'yyyy-MM-dd'),
        end_date: format(addDays(suggestedStart, 30), 'yyyy-MM-dd'),
        phase_order: timelineItems.length + 1
      }));
    }
    setIsModalActive(true);
    setShowAddModal(true);
  }, [timelineItems, isModalActive]);

  // Handle phase duplication (from context menu)
  const handlePhaseDuplicate = useCallback((phase: ProjectPhaseTimeline) => {
    const duplicateStartDate = addDays(new Date(phase.end_date), 1);
    const duplicateEndDate = addDays(duplicateStartDate,
      (new Date(phase.end_date).getTime() - new Date(phase.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    setAddPhaseForm({
      phase_id: phase.phase_id,
      start_date: format(duplicateStartDate, 'yyyy-MM-dd'),
      end_date: format(duplicateEndDate, 'yyyy-MM-dd'),
      phase_order: phase.phase_order + 1
    });
    setShowAddModal(true);
  }, []);

  // Dependency handlers
  const handleEditDependency = useCallback((dependency: PhaseDependency) => {
    setEditingDependency(dependency);
    setDependencyForm({
      predecessor_phase_timeline_id: dependency.predecessor_phase_timeline_id,
      successor_phase_timeline_id: dependency.successor_phase_timeline_id,
      dependency_type: dependency.dependency_type,
      lag_days: dependency.lag_days || 0
    });
    setShowDependencyModal(true);
  }, []);

  const handleDeleteDependency = useCallback(async (dependencyId: string) => {
    if (window.confirm(t('phases:visual.deleteDependencyConfirm'))) {
      try {
        await api.projectPhaseDependencies.delete(dependencyId);
        refetchDependencies();
      } catch (error) {
        console.error('Failed to delete dependency:', error);
      }
    }
  }, [refetchDependencies, t]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Track modal state
  useEffect(() => {
    setIsModalActive(showAddModal || editingPhase !== null || showDependencyModal);
  }, [showAddModal, editingPhase, showDependencyModal]);

  // Modal handlers
  const handleAddModalClose = useCallback(() => {
    setShowAddModal(false);
    setIsModalActive(false);
  }, []);

  const handleAddModalSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const selectedPhase = (phaseTemplates as any)?.data?.find((p: any) => p.id === addPhaseForm.phase_id)
      || (Array.isArray(phaseTemplates) ? phaseTemplates.find((p: any) => p.id === addPhaseForm.phase_id) : null);
    addPhaseMutation.mutate({
      project_id: projectId,
      phase_id: addPhaseForm.phase_id,
      phase_name: selectedPhase?.name || 'Unknown Phase',
      start_date: addPhaseForm.start_date,
      end_date: addPhaseForm.end_date,
      phase_order: addPhaseForm.phase_order
    });
    setShowAddModal(false);
    setIsModalActive(false);
    setAddPhaseForm({ phase_id: '', start_date: '', end_date: '', phase_order: 1 });
  }, [addPhaseForm, phaseTemplates, projectId, addPhaseMutation]);

  const handleEditModalClose = useCallback(() => {
    setEditingPhase(null);
    setIsModalActive(false);
    setEditPhaseForm({ phase_name: '', start_date: '', end_date: '', phase_order: 1 });
  }, []);

  const handleEditModalSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhase) return;
    updatePhaseMutation.mutate({
      phaseId: editingPhase.id,
      updates: {
        start_date: editPhaseForm.start_date,
        end_date: editPhaseForm.end_date,
        phase_order: editPhaseForm.phase_order
      }
    });
    setEditingPhase(null);
    setIsModalActive(false);
    setEditPhaseForm({ phase_name: '', start_date: '', end_date: '', phase_order: 1 });
  }, [editingPhase, editPhaseForm, updatePhaseMutation]);

  const handleDependencyModalClose = useCallback(() => {
    setShowDependencyModal(false);
    setEditingDependency(null);
    setDependencyForm({
      predecessor_phase_timeline_id: '',
      successor_phase_timeline_id: '',
      dependency_type: 'FS',
      lag_days: 0
    });
  }, []);

  const handleDependencyModalSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        project_id: projectId,
        ...dependencyForm
      };

      if (editingDependency) {
        await api.projectPhaseDependencies.update(editingDependency.id, data);
      } else {
        await api.projectPhaseDependencies.create(data);
      }

      refetchDependencies();
      handleDependencyModalClose();
    } catch (error) {
      console.error('Failed to save dependency:', error);
    }
  }, [projectId, dependencyForm, editingDependency, refetchDependencies, handleDependencyModalClose]);

  if (isLoading) {
    return (
      <div className="visual-phase-manager">
        <div className="loading">{t('phases:manager.loadingPhases')}</div>
      </div>
    );
  }

  return (
    <div className="visual-phase-manager" style={compact ? {
      width: '100%',
      maxWidth: 'none'
    } : {
      width: '100vw',
      maxWidth: 'none',
      position: 'relative',
      left: '50%',
      transform: 'translateX(-50%)',
      paddingLeft: '2rem',
      paddingRight: '2rem'
    }}>
      {/* Header */}
      {!compact && (
        <div className="phase-manager-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ fontSize: '14px', color: 'hsl(var(--foreground) / 0.75)',  /* muted-foreground 在 muted 底上不足 4.5:1(2026-09-22 全站清零) */ marginBottom: '8px' }}>
              <span>{t('phases:visual.dragHint')}</span>
            </div>
          </div>

          {/* Timeline controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: 'hsl(var(--foreground) / 0.75)',  /* muted-foreground 在 muted 底上不足 4.5:1(2026-09-22 全站清零) */ marginRight: '8px' }}>
              {t('phases:visual.phaseCount', { count: timelineItems.length })}
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '6px 16px',
                border: '1px solid hsl(var(--primary))',
                borderRadius: '6px',
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--background))',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}
            >
              {t('phases:visual.addPhase')}
            </button>
          </div>
        </div>
      )}

      {compact && (
        <div className="phase-manager-header-compact" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h4 style={{ margin: '0', fontSize: '14px', color: 'hsl(var(--foreground) / 0.75)',  /* muted-foreground 在 muted 底上不足 4.5:1(2026-09-22 全站清零) */ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} />
            {t('phases:visual.compactTitle', { count: timelineItems.length })}
          </h4>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '4px 12px',
              border: '1px solid hsl(var(--primary))',
              borderRadius: '4px',
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500
            }}
          >
            {t('phases:visual.addPhase')}
          </button>
        </div>
      )}

      {/* Interactive Timeline */}
      <div style={{
        marginBottom: compact ? '12px' : '24px',
        minHeight: compact ? '160px' : '220px',
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
      }}>
        {/* Timeline container with precise alignment */}
        <div style={{
          position: 'relative',
          ...(alignmentDimensions && compact ? {
            marginLeft: `${alignmentDimensions.left}px`,
            width: `${alignmentDimensions.width}px`,
            maxWidth: `${alignmentDimensions.width}px`,
            overflow: 'hidden'
          } : {
            width: '100%',
            overflow: 'hidden'
          })
        }}>
        {timelineItems.length > 0 ? (
          <div>
            {/* Phase Timeline */}
            <InteractiveTimeline
              items={timelineItems.map(item => ({
                ...item,
                color: getPhaseColor((item.data as ProjectPhaseTimeline)?.phase_name || '')
              }))}
              viewport={timelineViewport}
              mode="phase-manager"
              height={170}
              width={alignmentDimensions?.width}
              dependencies={dependenciesData?.data?.map((dep: any) => ({
                id: dep.id,
                predecessorId: dep.predecessor_phase_timeline_id,
                successorId: dep.successor_phase_timeline_id,
                dependencyType: dep.dependency_type,
                lagDays: dep.lag_days
              })) || []}
              onItemAdd={handleAddPhase}
              onItemEdit={(itemId) => {
                handlePhaseEdit(itemId);
              }}
              onItemDelete={handlePhaseDelete}
              onItemMove={handlePhaseMove}
              onItemResize={handlePhaseResize}
              showGrid={true}
              showToday={true}
              allowOverlap={false}
              minItemDuration={1}
              className="project-phase-timeline"
              chartTimeData={chartTimeData}
              style={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px 8px 0 0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
            />

            {/* Date Timeline Reference */}
            <div style={{
              height: '40px',
              position: 'relative',
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              overflow: 'hidden'
            }}>
              {/* Month markers */}
              {(() => {
                const markers = [];
                const startDate = new Date(timelineViewport.startDate);
                const endDate = new Date(timelineViewport.endDate);
                const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

                while (current <= endDate) {
                  const monthStart = new Date(current);
                  const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
                  const actualStart = monthStart > startDate ? monthStart : startDate;
                  const actualEnd = monthEnd < endDate ? monthEnd : endDate;

                  const leftPos = ((actualStart.getTime() - timelineViewport.startDate.getTime()) / (1000 * 60 * 60 * 24)) * timelineViewport.pixelsPerDay;
                  const width = ((actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24)) * timelineViewport.pixelsPerDay;

                  const monthName = current.toLocaleDateString(getLocale(), { month: 'short', year: '2-digit' });
                  const isCurrentMonth = new Date().getMonth() === current.getMonth() && new Date().getFullYear() === current.getFullYear();

                  markers.push(
                    <div
                      key={current.getTime()}
                      style={{
                        position: 'absolute',
                        left: leftPos,
                        width: Math.max(width, 0),
                        height: '40px',
                        borderRight: '1px solid hsl(var(--border))',
                        backgroundColor: isCurrentMonth ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: isCurrentMonth ? '600' : '400',
                        color: isCurrentMonth ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {width > 50 ? monthName : (width > 30 ? current.toLocaleDateString(getLocale(), { month: 'short' }) : '')}
                    </div>
                  );

                  current.setMonth(current.getMonth() + 1);
                }

                return markers;
              })()}

              {/* Today indicator line */}
              {(() => {
                const today = new Date();
                const todayPos = ((today.getTime() - timelineViewport.startDate.getTime()) / (1000 * 60 * 60 * 24)) * timelineViewport.pixelsPerDay;

                if (todayPos >= 0 && todayPos <= ((timelineViewport.endDate.getTime() - timelineViewport.startDate.getTime()) / (1000 * 60 * 60 * 24)) * timelineViewport.pixelsPerDay) {
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: todayPos,
                        top: 0,
                        bottom: 0,
                        width: '2px',
                        backgroundColor: 'hsl(var(--destructive))',
                        zIndex: 10,
                        opacity: 0.8
                      }}
                    />
                  );
                }
                return null;
              })()}
            </div>
          </div>
        ) : (
          <div style={{
            height: '180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'hsl(var(--muted))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            color: 'hsl(var(--foreground) / 0.75)',  /* muted-foreground 在 muted 底上不足 4.5:1(2026-09-22 全站清零) */
            fontSize: '14px'
          }}>
            {isLoading ? t('phases:manager.loadingPhases') : t('phases:visual.noPhases')}
          </div>
        )}

        {/* Phase Dependencies Section */}
        {!compact && timelineItems.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              padding: '0 4px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                {t('phases:visual.dependenciesTitle')}
              </h3>
              <button
                onClick={() => setShowDependencyModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--background))',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                {t('phases:visual.addDependency')}
              </button>
            </div>

            {/* Dependencies List */}
            <div style={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              {dependenciesData?.data?.length > 0 ? (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {dependenciesData.data.map((dep: any) => (
                    <div
                      key={dep.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: '1px solid hsl(var(--border))'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: 'hsl(var(--foreground))', marginBottom: '4px' }}>
                          {dep.predecessor_phase_name} → {dep.successor_phase_name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                          {dep.dependency_type} {dep.lag_days > 0 && t('phases:visual.lagDays', { count: dep.lag_days })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleEditDependency(dep)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {t('common:edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteDependency(dep.id)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'hsl(var(--destructive))',
                            color: 'hsl(var(--background))',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {t('common:delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'hsl(var(--foreground) / 0.75)',  /* muted-foreground 在 muted 底上不足 4.5:1(2026-09-22 全站清零) */
                  fontSize: '14px'
                }}>
                  {t('phases:visual.noDependencies')}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>


      {/* Phase Statistics */}
      {!compact && (
        <div className="phase-statistics" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
        <div style={{
          padding: '16px',
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {timelineItems.length}
          </div>
          <div style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
            {t('phases:visual.totalPhases')}
          </div>
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {timelineItems.length > 0 ? Math.ceil(
              (timelineItems[timelineItems.length - 1].endDate.getTime() -
               timelineItems[0].startDate.getTime()) / (1000 * 60 * 60 * 24)
            ) : 0}
          </div>
          <div style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
            {t('phases:visual.projectDurationDays')}
          </div>
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {timelineItems.length > 0 ? format(timelineItems[0].startDate, 'MMM yyyy', { locale: getDateFnsLocale() }) : '-'}
          </div>
          <div style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
            {t('phases:visual.projectStart')}
          </div>
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {timelineItems.length > 0 ? format(timelineItems[timelineItems.length - 1].endDate, 'MMM yyyy', { locale: getDateFnsLocale() }) : '-'}
          </div>
          <div style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
            {t('phases:visual.projectEnd')}
          </div>
        </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <PhaseContextMenu
          contextMenu={contextMenu}
          phases={phasesData?.data || []}
          onEdit={handlePhaseEdit}
          onDuplicate={handlePhaseDuplicate}
          onDelete={handlePhaseDelete}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Add Phase Modal */}
      <PhaseAddModal
        isOpen={showAddModal}
        formData={addPhaseForm}
        phaseTemplates={phaseTemplates}
        onFormChange={(updates) => setAddPhaseForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleAddModalSubmit}
        onClose={handleAddModalClose}
      />

      {/* Edit Phase Modal */}
      <PhaseEditModal
        isOpen={!!editingPhase}
        editingPhase={editingPhase}
        formData={editPhaseForm}
        onFormChange={(updates) => setEditPhaseForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleEditModalSubmit}
        onClose={handleEditModalClose}
      />

      {/* Add/Edit Dependency Modal */}
      <DependencyModal
        isOpen={showDependencyModal}
        editingDependency={editingDependency}
        formData={dependencyForm}
        timelineItems={timelineItems}
        onFormChange={(updates) => setDependencyForm(prev => ({ ...prev, ...updates }))}
        onSubmit={handleDependencyModalSubmit}
        onClose={handleDependencyModalClose}
      />
    </div>
  );
}

export default VisualPhaseManager;
