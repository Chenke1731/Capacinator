import React, { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  Settings,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import InteractiveTimeline, { TimelineItem, TimelineViewport } from './InteractiveTimeline';
import { getLocale } from '../i18n';
import './EnhancedProjectTimeline.css';

interface ProjectPhaseTimeline {
  id: string;
  project_id: string;
  phase_id: string;
  start_date: number;
  end_date: number;
  duration_days: number;
  phase_source: 'template' | 'custom';
  template_phase_id?: string;
  is_deletable: boolean;
  original_duration_days?: number;
  template_min_duration_days?: number;
  template_max_duration_days?: number;
  is_duration_customized: boolean;
  is_name_customized: boolean;
  template_compliance_data?: string;
  phase_name?: string;
  phase_description?: string;
}

interface ValidationResult {
  isValid: boolean;
  violations: Array<{
    type: string;
    phaseId: string;
    phaseName: string;
    message: string;
  }>;
  warnings: string[];
}

interface UnifiedProjectTimelineProps {
  projectId: string;
  hideHeader?: boolean;
}

// Phase colors matching the system
const PHASE_COLORS: Record<string, string> = {
  'business planning': '#3b82f6',
  'development': '#10b981',
  'system integration testing': '#f59e0b',
  'user acceptance testing': '#8b5cf6',
  'validation': '#ec4899',
  'cutover': '#ef4444',
  'hypercare': '#06b6d4',
  'support': '#84cc16',
  'custom': '#6b7280'
};

const getPhaseColor = (phaseName: string, source: string): string => {
  if (source === 'custom') return PHASE_COLORS['custom'];
  const normalizedName = phaseName.toLowerCase();
  return PHASE_COLORS[normalizedName] || PHASE_COLORS['custom'];
};

export default function UnifiedProjectTimeline({ projectId, hideHeader = false }: UnifiedProjectTimelineProps) {
  const { t } = useTranslation();
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [showAddCustomPhase, setShowAddCustomPhase] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [expandedControls, setExpandedControls] = useState(false);
  const queryClient = useQueryClient();

  // Timeline viewport state
  const calculateInitialViewport = useCallback(() => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 10, 0);
    
    return {
      startDate,
      endDate,
      pixelsPerDay: 3
    };
  }, []);

  const [viewport, setViewport] = useState<TimelineViewport>(calculateInitialViewport());

  // Fetch project timeline
  const { data: timeline, refetch: refetchTimeline } = useQuery({
    queryKey: queryKeys.projects.timeline(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/timeline`);
      if (!response.ok) throw new Error(t('phases:enhanced.fetchError'));
      const result = await response.json();
      const timelineData = result.data || result || [];
      
      if (!Array.isArray(timelineData)) {
        console.error('Timeline response is not an array:', timelineData);
        return [];
      }
      
      return timelineData as ProjectPhaseTimeline[];
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  // Fetch template compliance
  const { data: compliance } = useQuery({
    queryKey: queryKeys.projects.templateCompliance(projectId),
    queryFn: async () => {
      const response = await api.projects.getTemplateCompliance(projectId);
      return response.data;
    },
    enabled: !!projectId
  });

  // Convert project phases to timeline items
  const convertPhasesToTimelineItems = useCallback((phases: ProjectPhaseTimeline[]): TimelineItem[] => {
    return phases.map(phase => ({
      id: phase.id,
      name: phase.phase_name || t('phases:unified.phaseFallback', { id: phase.phase_id }),
      startDate: new Date(phase.start_date),
      endDate: new Date(phase.end_date),
      color: getPhaseColor(phase.phase_name || '', phase.phase_source),
      data: phase
    }));
  }, [t]);

  // Update phase mutation with optimistic updates
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ phaseTimelineId, data }: { phaseTimelineId: string; data: any }) => {
      const response = await api.projects.updateProjectPhase(projectId, phaseTimelineId, data);
      return response.data;
    },
    onSuccess: () => {
      refetchTimeline();
      setEditingPhase(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.templateCompliance(projectId) });
    }
  });

  // Add custom phase mutation
  const addCustomPhaseMutation = useMutation({
    mutationFn: async (phaseData: any) => {
      const response = await api.projects.addCustomPhase(projectId, phaseData);
      return response.data;
    },
    onSuccess: () => {
      refetchTimeline();
      setShowAddCustomPhase(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.templateCompliance(projectId) });
    }
  });

  // Delete phase mutation
  const deletePhaseMutation = useMutation({
    mutationFn: async (phaseTimelineId: string) => {
      const response = await api.projects.deleteProjectPhase(projectId, phaseTimelineId);
      return response.data;
    },
    onSuccess: () => {
      refetchTimeline();
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.templateCompliance(projectId) });
    }
  });

  // Handle phase move/resize from InteractiveTimeline
  const handlePhaseMove = useCallback((itemId: string, newStartDate: Date, newEndDate: Date) => {
    const phase = timeline?.find(p => p.id === itemId);
    if (!phase) return;

    // Calculate new duration
    const newDurationDays = Math.round((newEndDate.getTime() - newStartDate.getTime()) / (24 * 60 * 60 * 1000));

    // Optimistic update
    queryClient.setQueryData(queryKeys.projects.timeline(projectId), (oldData: ProjectPhaseTimeline[] | undefined) => {
      if (!oldData) return oldData;
      
      return oldData.map(p => {
        if (p.id === itemId) {
          return {
            ...p,
            start_date: newStartDate.getTime(),
            end_date: newEndDate.getTime(),
            duration_days: newDurationDays
          };
        }
        return p;
      });
    });

    // Update in backend
    updatePhaseMutation.mutate({
      phaseTimelineId: itemId,
      data: {
        startDate: newStartDate,
        durationDays: newDurationDays
      }
    });
  }, [timeline, queryClient, projectId, updatePhaseMutation]);

  // Handle phase edit
  const handlePhaseEdit = useCallback((itemId: string) => {
    setEditingPhase(itemId);
  }, []);

  // Handle phase deletion
  const handlePhaseDelete = useCallback((itemId: string) => {
    const phase = timeline?.find(p => p.id === itemId);
    if (!phase) return;

    if (phase.is_deletable && confirm(t('phases:unified.deleteConfirm', { name: phase.phase_name }))) {
      deletePhaseMutation.mutate(itemId);
    } else if (!phase.is_deletable) {
      alert(t('phases:unified.cannotDelete'));
    }
  }, [timeline, deletePhaseMutation, t]);

  // Handle zoom
  const handleZoom = (direction: 'in' | 'out') => {
    setViewport(prev => ({
      ...prev,
      pixelsPerDay: direction === 'in' 
        ? Math.min(prev.pixelsPerDay * 1.5, 10)
        : Math.max(prev.pixelsPerDay / 1.5, 0.5)
    }));
  };

  // Validate updates
  const validateUpdates = async (updates: any[]) => {
    try {
      const response = await api.projects.validatePhaseUpdates(projectId, { updates });
      setValidationResult(response.data);
      return response.data;
    } catch (error) {
      console.error('Validation failed:', error);
      return null;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(getLocale());
  };

  const getConstraintStatus = (phase: ProjectPhaseTimeline) => {
    if (phase.phase_source === 'custom') return 'custom';
    
    const duration = phase.duration_days;
    const minDuration = phase.template_min_duration_days;
    const maxDuration = phase.template_max_duration_days;
    
    if (minDuration && duration < minDuration) return 'violation-min';
    if (maxDuration && duration > maxDuration) return 'violation-max';
    if (phase.is_duration_customized) return 'customized';
    
    return 'compliant';
  };

  const getConstraintBadge = (status: string) => {
    switch (status) {
      case 'compliant':
        return <span className="badge badge-success"><CheckCircle size={12} /> {t('phases:enhanced.badgeTemplate')}</span>;
      case 'customized':
        return <span className="badge badge-warning"><Edit2 size={12} /> {t('phases:enhanced.badgeCustomized')}</span>;
      case 'custom':
        return <span className="badge badge-info"><Plus size={12} /> {t('phases:enhanced.badgeCustom')}</span>;
      case 'violation-min':
      case 'violation-max':
        return <span className="badge badge-danger"><AlertTriangle size={12} /> {t('phases:enhanced.badgeViolation')}</span>;
      default:
        return null;
    }
  };

  // Phase Editor Component
  const PhaseEditor = ({ phase }: { phase: ProjectPhaseTimeline }) => {
    const [editData, setEditData] = useState({
      start_date: formatDate(phase.start_date),
      duration_days: phase.duration_days,
      name: phase.phase_name || ''
    });

    const handleSave = async () => {
      const updates = [{
        phaseId: phase.phase_id,
        newDurationDays: editData.duration_days,
        newStartDate: new Date(editData.start_date).getTime(),
        newName: editData.name !== phase.phase_name ? editData.name : undefined
      }];

      const validation = await validateUpdates(updates);
      
      if (validation?.isValid) {
        updatePhaseMutation.mutate({
          phaseTimelineId: phase.id,
          data: {
            durationDays: editData.duration_days,
            startDate: new Date(editData.start_date),
            name: editData.name !== phase.phase_name ? editData.name : undefined
          }
        });
      }
    };

    return (
      <div className="phase-editor">
        <div className="editor-fields">
          <div className="field-group">
            <label>{t('common:startDate')}</label>
            <input
              type="date"
              value={editData.start_date}
              onChange={(e) => setEditData(prev => ({ ...prev, start_date: e.target.value }))}
              className="form-input"
            />
          </div>

          <div className="field-group">
            <label>{t('phases:enhanced.durationDays')}</label>
            <input
              type="number"
              value={editData.duration_days}
              onChange={(e) => setEditData(prev => ({ ...prev, duration_days: Number(e.target.value) }))}
              min={phase.template_min_duration_days || 1}
              max={phase.template_max_duration_days || undefined}
              className="form-input"
            />
            {phase.template_min_duration_days && (
              <small>{t('phases:enhanced.minDays', { count: phase.template_min_duration_days })}</small>
            )}
            {phase.template_max_duration_days && (
              <small>{t('phases:enhanced.maxDays', { count: phase.template_max_duration_days })}</small>
            )}
          </div>

          {phase.phase_source === 'custom' && (
            <div className="field-group">
              <label>{t('phases:manager.phaseName')}</label>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                className="form-input"
              />
            </div>
          )}
        </div>

        <div className="editor-actions">
          <button onClick={handleSave} className="btn btn-primary">
            <Save size={16} />
            {t('phases:common.saveChanges')}
          </button>
          <button onClick={() => setEditingPhase(null)} className="btn btn-secondary">
            <X size={16} />
            {t('common:cancel')}
          </button>
        </div>

        {validationResult && !validationResult.isValid && (
          <div className="validation-errors">
            <h5>{t('phases:enhanced.validationErrors')}</h5>
            {validationResult.violations.map((violation, index) => (
              <div key={index} className="error-item">
                <AlertTriangle size={14} />
                {violation.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Add Custom Phase Form
  const AddCustomPhaseForm = () => {
    const [newPhase, setNewPhase] = useState({
      name: '',
      description: '',
      durationDays: 30,
      insertIndex: 0
    });

    useEffect(() => {
      if (timeline && Array.isArray(timeline)) {
        setNewPhase(prev => ({ ...prev, insertIndex: timeline.length }));
      }
    }, [timeline]);

    const handleAdd = async () => {
      if (!newPhase.name.trim()) return;

      const response = await api.projects.validateCustomPhase(projectId, {
        phaseName: newPhase.name,
        insertIndex: newPhase.insertIndex
      });

      if (response.data.isValid) {
        addCustomPhaseMutation.mutate({
          name: newPhase.name,
          description: newPhase.description,
          durationDays: newPhase.durationDays,
          insertIndex: newPhase.insertIndex
        });
      }
    };

    return (
      <div className="add-phase-form">
        <h4>{t('phases:enhanced.addCustomPhase')}</h4>

        <div className="form-fields">
          <div className="field-group">
            <label>{t('phases:manager.phaseNameRequired')}</label>
            <input
              type="text"
              value={newPhase.name}
              onChange={(e) => setNewPhase(prev => ({ ...prev, name: e.target.value }))}
              className="form-input"
              placeholder={t('phases:enhanced.enterPhaseName')}
            />
          </div>

          <div className="field-group">
            <label>{t('common:description')}</label>
            <textarea
              value={newPhase.description}
              onChange={(e) => setNewPhase(prev => ({ ...prev, description: e.target.value }))}
              className="form-textarea"
              placeholder={t('phases:enhanced.describePhase')}
            />
          </div>

          <div className="field-group">
            <label>{t('phases:enhanced.durationDays')}</label>
            <input
              type="number"
              value={newPhase.durationDays}
              onChange={(e) => setNewPhase(prev => ({ ...prev, durationDays: Number(e.target.value) }))}
              min="1"
              className="form-input"
            />
          </div>

          <div className="field-group">
            <label>{t('phases:enhanced.insertPosition')}</label>
            <select
              value={newPhase.insertIndex}
              onChange={(e) => setNewPhase(prev => ({ ...prev, insertIndex: Number(e.target.value) }))}
              className="form-input"
            >
              {(timeline && Array.isArray(timeline)) && timeline.map((phase, index) => (
                <option key={index} value={index}>
                  {t('phases:enhanced.beforePhase', { name: phase.phase_name })}
                </option>
              ))}
              <option value={(timeline && Array.isArray(timeline)) ? timeline.length : 0}>{t('phases:enhanced.atTheEnd')}</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button onClick={handleAdd} className="btn btn-primary">
            <Plus size={16} />
            {t('phases:manager.addPhase')}
          </button>
          <button onClick={() => setShowAddCustomPhase(false)} className="btn btn-secondary">
            {t('common:cancel')}
          </button>
        </div>
      </div>
    );
  };

  const timelineItems = timeline ? convertPhasesToTimelineItems(timeline) : [];

  return (
    <div className="unified-project-timeline">
      {/* Timeline Header with Controls */}
      {!hideHeader && (
        <div className="timeline-header">
          <div className="header-main">
            <div className="header-info">
              <h3>
                <Calendar size={20} />
                {t('phases:enhanced.title')}
              </h3>
              <p>{t('phases:unified.subtitle')}</p>
            </div>

            <div className="timeline-controls">
              <button
                onClick={() => setExpandedControls(!expandedControls)}
                className="btn btn-secondary"
                title={t('phases:unified.toggleControls')}
              >
                <Settings size={16} />
              </button>

              <div className="zoom-controls">
                <button onClick={() => handleZoom('out')} className="btn btn-sm" title={t('phases:timeline.zoomOut')}>
                  <ZoomOut size={16} />
                </button>
                <span className="zoom-level">{Math.round(viewport.pixelsPerDay * 33)}%</span>
                <button onClick={() => handleZoom('in')} className="btn btn-sm" title={t('phases:timeline.zoomIn')}>
                  <ZoomIn size={16} />
                </button>
              </div>

              <button
                onClick={() => setShowAddCustomPhase(true)}
                className="btn btn-primary"
                title={t('phases:unified.addCustomPhaseTooltip')}
              >
                <Plus size={16} />
                {t('phases:manager.addPhase')}
              </button>
            </div>
          </div>

          {/* Compliance Summary */}
          {compliance && (
            <div className="compliance-summary">
              <div className="compliance-stat">
                <label>{t('phases:enhanced.templateCompliance')}</label>
                <span className={`compliance-percentage ${compliance.compliancePercentage >= 80 ? 'good' : 'warning'}`}>
                  {Math.round(compliance.compliancePercentage)}%
                </span>
              </div>
              <div className="compliance-details">
                <span className="compliant-count">{t('phases:unified.compliantCount', { count: compliance.compliantPhases })}</span>
                <span className="violations-count">{t('phases:unified.violationsCount', { count: compliance.violations })}</span>
              </div>
            </div>
          )}

          {/* Expanded Controls */}
          {expandedControls && (
            <div className="expanded-controls">
              <div className="viewport-controls">
                <label>{t('phases:unified.timelineRange')}</label>
                <span>{viewport.startDate.toLocaleDateString(getLocale())} - {viewport.endDate.toLocaleDateString(getLocale())}</span>
              </div>
              <div className="phase-summary">
                <span>{t('phases:visual.phaseCount', { count: timeline?.length || 0 })}</span>
                <span>{t('phases:unified.customCount', { count: timeline?.filter(p => p.phase_source === 'custom').length || 0 })}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Timeline */}
      <div className="timeline-container">
        <InteractiveTimeline
          items={timelineItems}
          viewport={viewport}
          mode="phase-manager"
          height={Math.max(200, (timelineItems.length * 60) + 100)}
          onItemMove={handlePhaseMove}
          onItemResize={handlePhaseMove}
          onItemEdit={handlePhaseEdit}
          onItemDelete={handlePhaseDelete}
          showGrid={true}
          showToday={true}
          allowOverlap={false}
          minItemDuration={1}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#ffffff'
          }}
        />
      </div>

      {/* Phase Details Panel */}
      {timeline && timeline.length > 0 && (
        <div className="phase-details-panel">
          <h4>{t('phases:unified.phaseDetails')}</h4>
          <div className="phase-list">
            {timeline.map((phase, _index) => (
              <div key={phase.id} className={`phase-item ${editingPhase === phase.id ? 'editing' : ''}`}>
                <div className="phase-header">
                  <div className="phase-info">
                    <div className="phase-name">
                      {phase.phase_name}
                      {getConstraintBadge(getConstraintStatus(phase))}
                    </div>
                    <div className="phase-meta">
                      {formatDate(phase.start_date)} - {formatDate(phase.end_date)} ({t('phases:manager.days', { count: phase.duration_days })})
                    </div>
                  </div>
                  <div className="phase-actions">
                    <button 
                      onClick={() => setEditingPhase(editingPhase === phase.id ? null : phase.id)}
                      className="btn btn-sm"
                      title={t('phases:manager.editPhaseTooltip')}
                    >
                      <Edit2 size={14} />
                    </button>
                    {phase.is_deletable && (
                      <button 
                        onClick={() => handlePhaseDelete(phase.id)}
                        className="btn btn-sm btn-danger"
                        title={t('phases:manager.deletePhaseTooltip')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                
                {editingPhase === phase.id && (
                  <PhaseEditor phase={phase} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Phase Modal */}
      {showAddCustomPhase && (
        <div className="modal-overlay">
          <div className="modal-content">
            <AddCustomPhaseForm />
          </div>
        </div>
      )}

      {/* Loading State */}
      {!timeline && (
        <div className="timeline-loading">
          <Clock size={24} />
          <p>{t('phases:unified.loading')}</p>
        </div>
      )}
    </div>
  );
}