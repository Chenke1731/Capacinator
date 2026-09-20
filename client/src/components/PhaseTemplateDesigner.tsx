import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Info
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import type { ProjectPhase } from '../types';
import './PhaseTemplateDesigner.css';

interface ProjectTypePhase {
  id: string;
  project_type_id: string;
  phase_id: string;
  order_index: number;
  is_mandatory: boolean;
  min_duration_days?: number;
  max_duration_days?: number;
  default_duration_days?: number;
  is_locked_order: boolean;
  template_description?: string;
  template_metadata?: any;
  phase_name?: string;
  phase_description?: string;
}

interface PhaseTemplateDesignerProps {
  projectTypeId: string;
  phases: ProjectPhase[];
}

export default function PhaseTemplateDesigner({ projectTypeId, phases }: PhaseTemplateDesignerProps) {
  const { t } = useTranslation();
  const [localPhases, setLocalPhases] = useState<ProjectTypePhase[]>([]);
  const [showAddPhase, setShowAddPhase] = useState(false);

  // Fetch current project type phases
  const { data: projectTypePhases, refetch } = useQuery({
    queryKey: queryKeys.projectTypes.phases(projectTypeId),
    queryFn: async () => {
      const response = await api.projectTypes.getPhases(projectTypeId);
      return response.data.data as ProjectTypePhase[];
    },
    enabled: !!projectTypeId
  });

  useEffect(() => {
    if (projectTypePhases) {
      setLocalPhases(projectTypePhases);
    }
  }, [projectTypePhases]);

  // Add phase mutation
  const addPhaseMutation = useMutation({
    mutationFn: async (phaseData: Partial<ProjectTypePhase>) => {
      return api.projectTypes.addPhase(projectTypeId, phaseData);
    },
    onSuccess: () => {
      refetch();
      setShowAddPhase(false);
    }
  });

  // Update phase mutation
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ phaseId, data }: { phaseId: string; data: Partial<ProjectTypePhase> }) => {
      return api.projectTypes.updatePhase(projectTypeId, phaseId, data);
    },
    onSuccess: () => {
      refetch();
      setEditingPhase(null);
    }
  });

  // Remove phase mutation
  const removePhaseMutation = useMutation({
    mutationFn: async (phaseId: string) => {
      return api.projectTypes.removePhase(projectTypeId, phaseId);
    },
    onSuccess: () => {
      refetch();
    }
  });

  const handleAddPhase = (phaseId: string) => {
    const newOrderIndex = Math.max(...localPhases.map(p => p.order_index), 0) + 1;
    
    addPhaseMutation.mutate({
      phase_id: phaseId,
      order_index: newOrderIndex,
      is_mandatory: false,
      is_locked_order: false,
      default_duration_days: 30
    });
  };

  const handleUpdatePhase = (phaseId: string, updates: Partial<ProjectTypePhase>) => {
    updatePhaseMutation.mutate({ phaseId, data: updates });
  };

  const handleRemovePhase = (phaseId: string) => {
    if (confirm(t('phases:template.removeConfirm'))) {
      // Find the phase to get its actual phase_id
      const phaseToRemove = localPhases.find(p => p.id === phaseId);
      if (phaseToRemove) {
        removePhaseMutation.mutate(phaseToRemove.phase_id);
      }
    }
  };

  const handleMovePhase = async (phaseId: string, direction: 'up' | 'down') => {
    const currentPhase = localPhases.find(p => p.id === phaseId);
    if (!currentPhase) return;

    const sortedPhases = [...localPhases].sort((a, b) => a.order_index - b.order_index);
    const currentIndex = sortedPhases.findIndex(p => p.id === phaseId);
    
    if (direction === 'up' && currentIndex > 0) {
      const targetPhase = sortedPhases[currentIndex - 1];
      // Use a temporary high order index to avoid constraint violation
      const tempOrderIndex = 9999;
      
      try {
        // Step 1: Move current phase to temp position
        await updatePhaseMutation.mutateAsync({ 
          phaseId: currentPhase.phase_id, 
          data: { order_index: tempOrderIndex } 
        });
        
        // Step 2: Move target phase to current position
        await updatePhaseMutation.mutateAsync({ 
          phaseId: targetPhase.phase_id, 
          data: { order_index: currentPhase.order_index } 
        });
        
        // Step 3: Move current phase to target position
        await updatePhaseMutation.mutateAsync({ 
          phaseId: currentPhase.phase_id, 
          data: { order_index: targetPhase.order_index } 
        });
      } catch (error) {
        console.error('Error moving phase up:', error);
      }
    } else if (direction === 'down' && currentIndex < sortedPhases.length - 1) {
      const targetPhase = sortedPhases[currentIndex + 1];
      // Use a temporary high order index to avoid constraint violation
      const tempOrderIndex = 9999;
      
      try {
        // Step 1: Move current phase to temp position
        await updatePhaseMutation.mutateAsync({ 
          phaseId: currentPhase.phase_id, 
          data: { order_index: tempOrderIndex } 
        });
        
        // Step 2: Move target phase to current position
        await updatePhaseMutation.mutateAsync({ 
          phaseId: targetPhase.phase_id, 
          data: { order_index: currentPhase.order_index } 
        });
        
        // Step 3: Move current phase to target position
        await updatePhaseMutation.mutateAsync({ 
          phaseId: currentPhase.phase_id, 
          data: { order_index: targetPhase.order_index } 
        });
      } catch (error) {
        console.error('Error moving phase down:', error);
      }
    }
  };

  const getAvailablePhases = () => {
    if (!Array.isArray(phases)) {
      return [];
    }
    const assignedPhaseIds = localPhases.map(p => p.phase_id);
    return phases.filter(phase => !assignedPhaseIds.includes(phase.id));
  };

  // Handle inline field updates
  const handleInlineUpdate = (phaseId: string, field: string, value: any) => {
    const updateData = { [field]: value };
    handleUpdatePhase(phaseId, updateData);
  };

  // Inline checkbox component
  const InlineCheckbox = ({ phase, field, label }: { phase: ProjectTypePhase, field: string, label: string }) => {
    const isChecked = phase[field as keyof ProjectTypePhase] as boolean;
    
    return (
      <label className="inline-checkbox" title={label}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => handleInlineUpdate(phase.phase_id, field, e.target.checked)}
          className="checkbox-input"
        />
        <span className="checkbox-mark"></span>
        <span className="sr-only">{label}</span>
      </label>
    );
  };

  // Inline duration input component
  const InlineDurationInput = ({ phase, field, placeholder }: { phase: ProjectTypePhase, field: string, placeholder: string }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(phase[field as keyof ProjectTypePhase] as number || '');
    
    const handleSave = () => {
      const numValue = value ? Number(value) : undefined;
      if (numValue !== phase[field as keyof ProjectTypePhase]) {
        handleInlineUpdate(phase.phase_id, field, numValue);
      }
      setIsEditing(false);
    };

    const handleCancel = () => {
      setValue(phase[field as keyof ProjectTypePhase] as number || '');
      setIsEditing(false);
    };

    if (isEditing) {
      return (
        <div className="inline-duration-edit">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            className="duration-input"
            placeholder={placeholder}
            min="1"
            autoFocus
          />
        </div>
      );
    }

    const displayValue = phase[field as keyof ProjectTypePhase] as number;
    return (
      <div
        className="inline-duration-display"
        onClick={() => setIsEditing(true)}
        title={t('phases:template.clickToEdit', { field: placeholder.toLowerCase() })}
      >
        {displayValue || <span className="placeholder-text">{placeholder}</span>}
      </div>
    );
  };

  const sortedPhases = [...localPhases].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="phase-template-designer">
      <div className="designer-header">
        <h3>{t('phases:template.title')}</h3>
        <p>{t('phases:template.subtitle')}</p>
      </div>

      {sortedPhases.length > 0 ? (
        <div className="phases-table-container">
          <table className="phases-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>{t('phases:manager.order')}</th>
                <th style={{ minWidth: '200px' }}>{t('phases:manager.phaseName')}</th>
                <th style={{ width: '80px', textAlign: 'center' }}>{t('phases:template.mandatory')}</th>
                <th style={{ width: '80px', textAlign: 'center' }}>{t('phases:template.locked')}</th>
                <th style={{ width: '100px', textAlign: 'center' }}>{t('phases:template.defaultDays')}</th>
                <th style={{ width: '100px', textAlign: 'center' }}>{t('phases:template.minDays')}</th>
                <th style={{ width: '100px', textAlign: 'center' }}>{t('phases:template.maxDays')}</th>
                <th style={{ width: '120px', textAlign: 'center' }}>{t('common:actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPhases.map((templatePhase, index) => {
                const phaseInfo = Array.isArray(phases) ? phases.find(p => p.id === templatePhase.phase_id) : null;
                
                return (
                  <tr key={templatePhase.id} className="phase-row">
                    <td className="order-cell">
                      <span className="order-number">#{templatePhase.order_index}</span>
                    </td>
                    <td className="phase-name-cell">
                      <div className="phase-name">
                        {phaseInfo?.name || t('phases:template.unknownPhase')}
                      </div>
                      {phaseInfo?.description && (
                        <div className="phase-description-hint">
                          {phaseInfo.description}
                        </div>
                      )}
                    </td>
                    <td className="checkbox-cell">
                      <InlineCheckbox
                        phase={templatePhase}
                        field="is_mandatory"
                        label={t('phases:template.mandatoryPhase')}
                      />
                    </td>
                    <td className="checkbox-cell">
                      <InlineCheckbox
                        phase={templatePhase}
                        field="is_locked_order"
                        label={t('phases:template.lockedOrder')}
                      />
                    </td>
                    <td className="duration-cell">
                      <InlineDurationInput
                        phase={templatePhase}
                        field="default_duration_days"
                        placeholder="30"
                      />
                    </td>
                    <td className="duration-cell">
                      <InlineDurationInput
                        phase={templatePhase}
                        field="min_duration_days"
                        placeholder={t('phases:template.min')}
                      />
                    </td>
                    <td className="duration-cell">
                      <InlineDurationInput
                        phase={templatePhase}
                        field="max_duration_days"
                        placeholder={t('phases:template.max')}
                      />
                    </td>
                    <td className="actions-cell">
                      <div className="phase-actions">
                        <button
                          onClick={() => handleMovePhase(templatePhase.id, 'up')}
                          disabled={index === 0}
                          className="btn btn-icon btn-sm"
                          title={t('phases:template.moveUp')}
                        >
                          <ArrowUp size={20} />
                        </button>
                        <button
                          onClick={() => handleMovePhase(templatePhase.id, 'down')}
                          disabled={index === sortedPhases.length - 1}
                          className="btn btn-icon btn-sm"
                          title={t('phases:template.moveDown')}
                        >
                          <ArrowDown size={20} />
                        </button>
                        <button
                          onClick={() => handleRemovePhase(templatePhase.id)}
                          className="btn btn-icon btn-sm btn-danger"
                          title={t('phases:template.removeFromTemplate')}
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {showAddPhase ? (
        <div className="add-phase-panel">
          <h4>{t('phases:template.addPhaseToTemplate')}</h4>
          <div className="available-phases">
            {getAvailablePhases().map(phase => (
              <div key={phase.id} className="available-phase">
                <div className="phase-info">
                  <h5>{phase.name}</h5>
                  <p>{phase.description}</p>
                </div>
                <button
                  onClick={() => handleAddPhase(phase.id)}
                  className="btn btn-primary"
                >
                  <Plus size={16} />
                  {t('common:add')}
                </button>
              </div>
            ))}
          </div>
          <div className="panel-actions">
            <button onClick={() => setShowAddPhase(false)} className="btn btn-secondary">
              {t('common:cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddPhase(true)}
          className="btn btn-primary add-phase-btn"
          disabled={getAvailablePhases().length === 0}
        >
          <Plus size={16} />
          {t('phases:template.addPhaseToTemplate')}
        </button>
      )}

      {localPhases.length === 0 && (
        <div className="empty-state">
          <Info size={24} />
          <h4>{t('phases:template.noTemplatePhases')}</h4>
          <p>{t('phases:template.noTemplatePhasesHint')}</p>
        </div>
      )}
    </div>
  );
}