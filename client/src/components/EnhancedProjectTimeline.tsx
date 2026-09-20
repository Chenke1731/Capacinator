import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Lock,
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  Info
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { getLocale } from '../i18n';

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

interface EnhancedProjectTimelineProps {
  projectId: string;
}

export default function EnhancedProjectTimeline({ projectId }: EnhancedProjectTimelineProps) {
  const { t } = useTranslation();
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [showAddCustomPhase, setShowAddCustomPhase] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
    staleTime: 5 * 60 * 1000, // 5 minutes
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

  // Update phase mutation
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

  const AddCustomPhaseForm = () => {
    const [newPhase, setNewPhase] = useState({
      name: '',
      description: '',
      durationDays: 30,
      insertIndex: 0
    });

    // Update insertIndex when timeline becomes available
    useEffect(() => {
      if (timeline && Array.isArray(timeline)) {
        setNewPhase(prev => ({ ...prev, insertIndex: timeline.length }));
      }
    }, [timeline]);

    const handleAdd = async () => {
      if (!newPhase.name.trim()) return;

      // Validate custom phase addition
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

  const sortedTimeline = (timeline && Array.isArray(timeline)) 
    ? [...timeline].sort((a, b) => a.start_date - b.start_date) 
    : [];

  return (
    <div className="enhanced-project-timeline">
      <div className="timeline-header">
        <div className="header-info">
          <h3>{t('phases:enhanced.title')}</h3>
          <p>{t('phases:enhanced.subtitle')}</p>
        </div>

        {compliance && (
          <div className="compliance-summary">
            <div className="compliance-stat">
              <label>{t('phases:enhanced.templateCompliance')}</label>
              <span className={`compliance-percentage ${compliance.compliancePercentage >= 80 ? 'good' : 'warning'}`}>
                {Math.round(compliance.compliancePercentage)}%
              </span>
            </div>
            <div className="phase-counts">
              <span className="phase-count">
                <span className="count">{compliance.templatePhases}</span> {t('phases:enhanced.countTemplate')}
              </span>
              <span className="phase-count">
                <span className="count">{compliance.customPhases}</span> {t('phases:enhanced.countCustom')}
              </span>
              <span className="phase-count">
                <span className="count">{compliance.customizedPhases}</span> {t('phases:enhanced.countModified')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="timeline-phases">
        {sortedTimeline.map((phase, index) => {
          const constraintStatus = getConstraintStatus(phase);
          const isEditing = editingPhase === phase.id;
          const isExpanded = expandedPhase === phase.id;
          
          return (
            <div key={phase.id} className={`timeline-phase ${constraintStatus} ${isExpanded ? 'expanded' : ''}`}>
              <div className="phase-header">
                <div className="phase-info">
                  <div className="phase-number">#{index + 1}</div>
                  <div className="phase-details">
                    <h4>{phase.phase_name}</h4>
                    <div className="phase-meta">
                      <span className="date-range">
                        <Calendar size={14} />
                        {formatDate(phase.start_date)} - {formatDate(phase.end_date)}
                      </span>
                      <span className="duration">
                        <Clock size={14} />
                        {t('phases:manager.days', { count: phase.duration_days })}
                      </span>
                      {getConstraintBadge(constraintStatus)}
                    </div>
                  </div>
                </div>

                <div className="phase-actions">
                  <button
                    onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                    className="btn btn-icon"
                    title={t('phases:enhanced.viewDetailsTooltip')}
                  >
                    <Info size={16} />
                  </button>
                  <button
                    onClick={() => setEditingPhase(isEditing ? null : phase.id)}
                    className="btn btn-icon"
                    title={t('phases:manager.editPhaseTooltip')}
                  >
                    <Edit2 size={16} />
                  </button>
                  {phase.is_deletable && (
                    <button
                      onClick={() => {
                        if (confirm(t('phases:manager.deletePhaseConfirm'))) {
                          deletePhaseMutation.mutate(phase.id);
                        }
                      }}
                      className="btn btn-icon btn-danger"
                      title={t('phases:manager.deletePhaseTooltip')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {!phase.is_deletable && (
                    <Lock size={16} className="phase-locked" title={t('phases:enhanced.mandatoryTemplatePhase')} />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="phase-expanded">
                  <div className="phase-constraints">
                    <h5>{t('phases:enhanced.templateConstraints')}</h5>
                    {phase.phase_source === 'template' ? (
                      <div className="constraint-info">
                        {phase.original_duration_days && (
                          <div className="constraint-item">
                            <label>{t('phases:enhanced.originalDuration')}</label>
                            <span>{t('phases:manager.days', { count: phase.original_duration_days })}</span>
                          </div>
                        )}
                        {phase.template_min_duration_days && (
                          <div className="constraint-item">
                            <label>{t('phases:enhanced.minimumDuration')}</label>
                            <span>{t('phases:manager.days', { count: phase.template_min_duration_days })}</span>
                          </div>
                        )}
                        {phase.template_max_duration_days && (
                          <div className="constraint-item">
                            <label>{t('phases:enhanced.maximumDuration')}</label>
                            <span>{t('phases:manager.days', { count: phase.template_max_duration_days })}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p>{t('phases:enhanced.noConstraints')}</p>
                    )}
                  </div>
                </div>
              )}

              {isEditing && <PhaseEditor phase={phase} />}
            </div>
          );
        })}
      </div>

      {showAddCustomPhase ? (
        <AddCustomPhaseForm />
      ) : (
        <button
          onClick={() => setShowAddCustomPhase(true)}
          className="btn btn-primary add-phase-btn"
        >
          <Plus size={16} />
          {t('phases:enhanced.addCustomPhase')}
        </button>
      )}

      {sortedTimeline.length === 0 && (
        <div className="empty-timeline">
          <Info size={24} />
          <h4>{t('phases:enhanced.noPhases')}</h4>
          <p>{t('phases:enhanced.noPhasesDesc')}</p>
        </div>
      )}
    </div>
  );
}