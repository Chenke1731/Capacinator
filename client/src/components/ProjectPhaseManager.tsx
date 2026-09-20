import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Calendar, Trash2, ArrowUp, ArrowDown, Edit2, Save, X } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { getLocale } from '../i18n';
import type { ProjectPhaseTimeline, ProjectPhase } from '../types';
import './ProjectPhaseManager.css';

// Extended type to include fields from API that aren't in base type
interface ProjectPhaseWithCustom extends ProjectPhaseTimeline {
  is_custom_phase?: number;
}

interface ProjectPhaseManagerProps {
  projectId: string;
  projectName: string;
}

interface PhaseFormData {
  phase_id: string;
  start_date: string;
  end_date: string;
}

interface CustomPhaseFormData {
  project_id?: string;
  phase_name: string;
  description: string;
  start_date: string;
  end_date: string;
  order_index: number;
}

interface DuplicatePhaseFormData {
  source_phase_id: string;
  target_phase_id: string;
  start_date: string;
  end_date: string;
  custom_name: string;
}

export const ProjectPhaseManager: React.FC<ProjectPhaseManagerProps> = ({
  projectId,
  _projectName
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [addPhaseMode, setAddPhaseMode] = useState<'existing' | 'duplicate' | 'custom'>('existing');
  const [selectedSourcePhase, setSelectedSourcePhase] = useState<string>('');
  const [placementMode, setPlacementMode] = useState<'after_phase' | 'beginning' | 'custom'>('after_phase');
  const [placementAfterPhaseId, setPlacementAfterPhaseId] = useState<string>('');
  const [adjustOverlapping, setAdjustOverlapping] = useState<boolean>(true);
  const [editingPhases, setEditingPhases] = useState<Record<string, boolean>>({});
  const [editedPhaseData, setEditedPhaseData] = useState<Record<string, { phase_name?: string; start_date: string; end_date: string }>>({});
  const [duplicatePhaseForm, setDuplicatePhaseForm] = useState<DuplicatePhaseFormData>({
    source_phase_id: '',
    target_phase_id: '',
    start_date: '',
    end_date: '',
    custom_name: ''
  });

  // Fetch project phases
  const { data: projectPhases, isLoading: phasesLoading } = useQuery({
    queryKey: queryKeys.projectPhases.byProject(projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: projectId });
      return response.data.data as ProjectPhaseWithCustom[];
    }
  });

  // Fetch available phases
  const { data: availablePhases } = useQuery({
    queryKey: queryKeys.phases.list(),
    queryFn: async () => {
      const response = await api.phases.list();
      // Handle both possible response structures
      const phases = response.data.data || response.data || [];
      return Array.isArray(phases) ? phases as ProjectPhase[] : [];
    }
  });

  // Mutations
  const addPhaseMutation = useMutation({
    mutationFn: async (data: PhaseFormData) => {
      return await api.projectPhases.create({
        project_id: projectId,
        ...data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
      setShowAddPhase(false);
    }
  });

  const createCustomPhaseMutation = useMutation({
    mutationFn: async (data: CustomPhaseFormData) => {
      return await api.projectPhases.createCustomPhase({
        project_id: projectId,
        ...data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.phases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
      setShowAddPhase(false);
      setAddPhaseMode('existing');
    },
    onError: (error: any) => {
      console.error('Error creating custom phase:', error);
      alert(t('phases:manager.errorCreatingCustomPhase', { message: error.message || t('phases:manager.unknownError') }));
    }
  });

  const duplicatePhaseMutation = useMutation({
    mutationFn: async (data: DuplicatePhaseFormData) => {
      return await api.projectPhases.duplicatePhase({
        project_id: projectId,
        ...data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
      setShowAddPhase(false);
      setSelectedSourcePhase('');
      setPlacementMode('after_phase');
      setPlacementAfterPhaseId('');
      setAdjustOverlapping(true);
      setAddPhaseMode('existing');
    },
    onError: (error: any) => {
      console.error('Error duplicating phase:', error);
      alert(t('phases:manager.errorDuplicatingPhase', { message: error.message || t('phases:manager.unknownError') }));
    }
  });

  const deletePhaseMutation = useMutation({
    mutationFn: async (phaseTimelineId: string) => {
      return await api.projectPhases.delete(phaseTimelineId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (updates: Array<{id: string, start_date: string, end_date: string}>) => {
      return await api.projectPhases.bulkUpdate({ updates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
    }
  });

  const updatePhaseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { phase_name?: string; start_date?: string; end_date?: string } }) => {
      return await api.projectPhases.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
    }
  });

  const handleAddPhase = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addPhaseMutation.mutate({
      phase_id: formData.get('phase_id') as string,
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string,
    });
  };

  const handleCreateCustomPhase = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createCustomPhaseMutation.mutate({
      phase_name: formData.get('phase_name') as string,
      description: formData.get('description') as string,
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string,
      order_index: 99, // Default order index for custom phases
    });
  };

  const handleDuplicatePhase = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const sourcePhaseId = selectedSourcePhase || formData.get('source_phase') as string;
    const sourcePhase = projectPhases?.find(p => p.phase_id === sourcePhaseId);
    if (!sourcePhase) {
      alert(t('phases:manager.selectPhaseToDuplicateAlert'));
      return;
    }
      
      // Calculate dates based on placement
      let startDate: Date;
      let endDate: Date;
      const duration = new Date(sourcePhase.end_date).getTime() - new Date(sourcePhase.start_date).getTime();
      
      if (placementMode === 'after_phase') {
        // Place after selected phase
        const afterPhaseId = formData.get('after_phase_id') as string;
        const afterPhase = projectPhases?.find(p => p.id === afterPhaseId);
        if (!afterPhase) return;
        
        startDate = new Date(afterPhase.end_date);
        startDate.setDate(startDate.getDate() + 1);
        endDate = new Date(startDate.getTime() + duration);
      } else if (placementMode === 'beginning') {
        // Place at the beginning of all phases
        const firstPhase = (projectPhases || [])
          .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())[0];
        endDate = new Date(firstPhase.start_date);
        endDate.setDate(endDate.getDate() - 1);
        startDate = new Date(endDate.getTime() - duration);
      } else {
        // Custom dates
        startDate = new Date(formData.get('start_date') as string);
        endDate = new Date(formData.get('end_date') as string);
      }
      
      // Since we're duplicating the same phase type, we need to create a custom phase
      // and then copy the allocations
      const customName = formData.get('custom_name') as string || `${sourcePhase.phase_name} (Copy)`;
      
      // Check for overlapping phases if adjustment is enabled
      const phasesToAdjust: Array<{id: string, start_date: string, end_date: string}> = [];
      
      if (adjustOverlapping && projectPhases) {
        // Find phases that need to be shifted based on placement mode
        const newStart = startDate.getTime();
        const newEnd = endDate.getTime();
        
        if (placementMode === 'after_phase') {
          // For after phase mode, only shift phases that come after the selected phase
          const afterPhase = projectPhases?.find(p => p.id === placementAfterPhaseId);
          if (afterPhase) {
            const afterPhaseEnd = new Date(afterPhase.end_date).getTime();
            projectPhases
              .filter(phase => new Date(phase.start_date).getTime() > afterPhaseEnd)
              .forEach(phase => {
                const phaseStart = new Date(phase.start_date).getTime();
                const phaseEnd = new Date(phase.end_date).getTime();
                const shiftAmount = (newEnd - newStart) + (24 * 60 * 60 * 1000); // New phase duration + 1 day gap

                phasesToAdjust.push({
                  id: phase.id,
                  start_date: new Date(phaseStart + shiftAmount).toISOString().split('T')[0],
                  end_date: new Date(phaseEnd + shiftAmount).toISOString().split('T')[0]
                });
              });
          }
        } else if (placementMode === 'beginning') {
          // For beginning mode, shift all phases
          projectPhases
            .forEach(phase => {
              const phaseStart = new Date(phase.start_date).getTime();
              const phaseEnd = new Date(phase.end_date).getTime();
              const shiftAmount = (newEnd - newStart) + (24 * 60 * 60 * 1000); // New phase duration + 1 day gap

              phasesToAdjust.push({
                id: phase.id,
                start_date: new Date(phaseStart + shiftAmount).toISOString().split('T')[0],
                end_date: new Date(phaseEnd + shiftAmount).toISOString().split('T')[0]
              });
            });
        } else if (placementMode === 'custom') {
          // For custom dates, only shift phases that actually overlap
          projectPhases.forEach(phase => {
            const phaseStart = new Date(phase.start_date).getTime();
            const phaseEnd = new Date(phase.end_date).getTime();
            
            // Check if this phase overlaps with the new phase
            if (phaseStart < newEnd && phaseEnd > newStart) {
              // This phase overlaps - shift it to after the new phase
              const duration = phaseEnd - phaseStart;
              
              phasesToAdjust.push({
                id: phase.id,
                start_date: new Date(newEnd + (24 * 60 * 60 * 1000)).toISOString().split('T')[0],
                end_date: new Date(newEnd + (24 * 60 * 60 * 1000) + duration).toISOString().split('T')[0]
              });
            }
          });
        }
      }

      // First create the custom phase
      createCustomPhaseMutation.mutate({
        project_id: projectId,
        phase_name: customName,
        description: `Duplicated from ${sourcePhase.phase_name}`,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        order_index: 99,
      }, {
        onSuccess: async (_response) => {
          try {
            // Adjust overlapping phases if needed
            if (phasesToAdjust.length > 0 && adjustOverlapping) {
              console.log(`Adjusting ${phasesToAdjust.length} overlapping phases...`);
              console.log('Phases to adjust:', phasesToAdjust);
              await bulkUpdateMutation.mutateAsync(phasesToAdjust);
              console.log('Successfully adjusted overlapping phases');
            }
          } catch (error: any) {
            console.error('Error adjusting overlapping phases:', error);
            console.error('Error response:', error.response?.data);
            const errorMessage = error.response?.data?.error || error.message || t('phases:manager.unknownError');
            alert(t('phases:manager.adjustError', { message: errorMessage }));
            // Continue anyway - the phase was created successfully
          }
          
          // After creating the custom phase, we need to copy allocations
          // This would require a new endpoint or manual copying
          // For now, we'll just show success
          queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.demands.all });
          setShowAddPhase(false);
          setSelectedSourcePhase('');
          setPlacementMode('after_phase');
          setPlacementAfterPhaseId('');
          setAdjustOverlapping(true);
          setAddPhaseMode('existing');
        }
      });
  };

  const handleDeletePhase = (phaseTimelineId: string, phaseName: string) => {
    if (confirm(t('phases:manager.deleteConfirm', { name: phaseName }))) {
      deletePhaseMutation.mutate(phaseTimelineId);
    }
  };

  const handleEditPhase = (phaseId: string, phase: any) => {
    setEditingPhases(prev => ({ ...prev, [phaseId]: true }));
    
    // Check if this is a custom phase (has is_custom_phase flag)
    const isCustomPhase = phase.is_custom_phase === 1;
    
    // Ensure we only use the date portion (YYYY-MM-DD) for the input fields
    const startDateOnly = phase.start_date.split('T')[0];
    const endDateOnly = phase.end_date.split('T')[0];
    
    setEditedPhaseData(prev => ({
      ...prev,
      [phaseId]: {
        ...(isCustomPhase ? { phase_name: phase.phase_name } : {}),
        start_date: startDateOnly,
        end_date: endDateOnly
      }
    }));
  };

  const handleSavePhase = (phaseId: string) => {
    const editedData = editedPhaseData[phaseId];
    if (!editedData) return;

    updatePhaseMutation.mutate(
      { id: phaseId, data: editedData },
      {
        onSuccess: () => {
          setEditingPhases(prev => ({ ...prev, [phaseId]: false }));
          setEditedPhaseData(prev => {
            const newData = { ...prev };
            delete newData[phaseId];
            return newData;
          });
        }
      }
    );
  };

  const handleCancelEdit = (phaseId: string) => {
    setEditingPhases(prev => ({ ...prev, [phaseId]: false }));
    setEditedPhaseData(prev => {
      const newData = { ...prev };
      delete newData[phaseId];
      return newData;
    });
  };

  const handlePhaseFieldChange = (phaseId: string, field: string, value: string) => {
    setEditedPhaseData(prev => ({
      ...prev,
      [phaseId]: {
        ...prev[phaseId],
        [field]: value
      }
    }));
  };

  const movePhase = (fromIndex: number, toIndex: number) => {
    if (!projectPhases || fromIndex === toIndex) return;
    
    const sortedPhases = [...projectPhases].sort((a, b) => 
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    
    const fromPhase = sortedPhases[fromIndex];
    const toPhase = sortedPhases[toIndex];
    
    if (!fromPhase || !toPhase) return;
    
    // Calculate new dates for the moved phase
    const fromDuration = new Date(fromPhase.end_date).getTime() - new Date(fromPhase.start_date).getTime();
    
    let newStartDate: Date;
    let newEndDate: Date;
    
    if (toIndex === 0) {
      // Moving to beginning - start before first phase
      const firstPhaseStart = new Date(toPhase.start_date);
      newEndDate = new Date(firstPhaseStart.getTime() - 24 * 60 * 60 * 1000); // Day before
      newStartDate = new Date(newEndDate.getTime() - fromDuration);
    } else if (toIndex === sortedPhases.length - 1) {
      // Moving to end - start after last phase
      const lastPhaseEnd = new Date(toPhase.end_date);
      newStartDate = new Date(lastPhaseEnd.getTime() + 24 * 60 * 60 * 1000); // Day after
      newEndDate = new Date(newStartDate.getTime() + fromDuration);
    } else {
      // Moving to middle - calculate position between phases
      const prevPhase = sortedPhases[toIndex - 1];
      const nextPhase = sortedPhases[toIndex + 1];
      const prevEnd = new Date(prevPhase.end_date).getTime();
      const nextStart = new Date(nextPhase.start_date).getTime();
      const midPoint = prevEnd + (nextStart - prevEnd) / 2;
      
      newStartDate = new Date(midPoint - fromDuration / 2);
      newEndDate = new Date(midPoint + fromDuration / 2);
    }
    
    // Update the phase with new dates
    bulkUpdateMutation.mutate([{
      id: fromPhase.id,
      start_date: newStartDate.toISOString().split('T')[0],
      end_date: newEndDate.toISOString().split('T')[0]
    }]);
  };

  const getAvailablePhases = () => {
    if (!availablePhases || !Array.isArray(availablePhases) || !projectPhases) return [];
    const usedPhaseIds = projectPhases.map(pp => pp.phase_id);
    return availablePhases.filter(phase => !usedPhaseIds.includes(phase.id));
  };

  const formatDate = (dateString: string) => {
    // Parse the date string as local date, not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(getLocale());
  };

  if (phasesLoading) {
    return <div className="loading">{t('phases:manager.loadingPhases')}</div>;
  }

  return (
    <div className="project-phase-manager">
      <div className="section-header">
        <h3>{t('phases:manager.title')}</h3>
        <div className="header-actions">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowAddPhase(true)}
          >
            <Plus size={16} />
            {t('phases:manager.addPhase')}
          </button>
        </div>
      </div>

      {/* Current Phases */}
      <div className="phases-list">
        {projectPhases && projectPhases.length > 0 ? (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>{t('phases:manager.order')}</th>
                  <th>{t('phases:manager.phaseColumn')}</th>
                  <th>{t('common:startDate')}</th>
                  <th>{t('common:endDate')}</th>
                  <th>{t('phases:manager.durationDays')}</th>
                  <th>{t('common:actions')}</th>
                </tr>
              </thead>
              <tbody>
                {projectPhases
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map((phase, index, sortedArray) => {
                    const duration = Math.ceil(
                      (new Date(phase.end_date).getTime() - new Date(phase.start_date).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    const isEditing = editingPhases[phase.id];
                    const editedData = editedPhaseData[phase.id];
                    
                    return (
                      <tr key={phase.id}>
                        <td>
                          <div className="reorder-controls">
                            <button
                              className="btn btn-icon btn-sm"
                              onClick={() => movePhase(index, index - 1)}
                              disabled={index === 0 || bulkUpdateMutation.isPending || isEditing}
                              title={t('phases:manager.moveEarlier')}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              className="btn btn-icon btn-sm"
                              onClick={() => movePhase(index, index + 1)}
                              disabled={index === sortedArray.length - 1 || bulkUpdateMutation.isPending || isEditing}
                              title={t('phases:manager.moveLater')}
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </td>
                        <td>
                          {isEditing && phase.is_custom_phase === 1 ? (
                            <input
                              type="text"
                              value={editedData?.phase_name || phase.phase_name}
                              onChange={(e) => handlePhaseFieldChange(phase.id, 'phase_name', e.target.value)}
                              className="form-input"
                              style={{ minWidth: '200px' }}
                              placeholder={t('phases:manager.customPhaseNamePlaceholder')}
                            />
                          ) : (
                            <div>
                              <strong>{phase.phase_name}</strong>
                              {phase.is_custom_phase === 1 && (
                                <small className="text-muted">{t('phases:manager.customTag')}</small>
                              )}
                            </div>
                          )}
                          {(bulkUpdateMutation.isPending || updatePhaseMutation.isPending) && (
                            <small className="text-muted">{t('phases:manager.updatingTag')}</small>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="date"
                              value={editedData?.start_date || phase.start_date.split('T')[0]}
                              onChange={(e) => handlePhaseFieldChange(phase.id, 'start_date', e.target.value)}
                              className="form-input"
                            />
                          ) : (
                            formatDate(phase.start_date)
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="date"
                              value={editedData?.end_date || phase.end_date.split('T')[0]}
                              onChange={(e) => handlePhaseFieldChange(phase.id, 'end_date', e.target.value)}
                              className="form-input"
                            />
                          ) : (
                            formatDate(phase.end_date)
                          )}
                        </td>
                        <td>{t('phases:manager.days', { count: duration })}</td>
                        <td>
                          <div className="phase-actions">
                            {isEditing ? (
                              <>
                                <button
                                  className="btn btn-icon btn-sm btn-primary"
                                  onClick={() => handleSavePhase(phase.id)}
                                  title={t('phases:manager.saveChangesTooltip')}
                                  disabled={updatePhaseMutation.isPending}
                                >
                                  <Save size={14} />
                                </button>
                                <button
                                  className="btn btn-icon btn-sm btn-secondary"
                                  onClick={() => handleCancelEdit(phase.id)}
                                  title={t('phases:manager.cancelEditing')}
                                  disabled={updatePhaseMutation.isPending}
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn btn-icon btn-sm"
                                  onClick={() => handleEditPhase(phase.id, phase)}
                                  title={t('phases:manager.editPhaseTooltip')}
                                  disabled={bulkUpdateMutation.isPending || updatePhaseMutation.isPending}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  className="btn btn-icon btn-sm btn-danger"
                                  onClick={() => handleDeletePhase(phase.id, phase.phase_name || t('phases:common.unknown'))}
                                  title={t('phases:manager.removePhaseTooltip')}
                                  disabled={bulkUpdateMutation.isPending || updatePhaseMutation.isPending}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Calendar size={48} className="text-muted" />
            <p>{t('phases:manager.noPhases')}</p>
            <p className="text-muted">{t('phases:manager.noPhasesHint')}</p>
          </div>
        )}
      </div>      {/* Consolidated Add Phase Modal */}
      {showAddPhase && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '600px' }} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <h4 id="modal-title">{t('phases:manager.addPhase')}</h4>
              <button
                className="btn btn-icon"
                onClick={() => {
                  setShowAddPhase(false);
                  setAddPhaseMode('existing');
                  setSelectedSourcePhase('');
                  setPlacementMode('after_phase');
                  setPlacementAfterPhaseId('');
                  setAdjustOverlapping(true);
                  setDuplicatePhaseForm({
                    source_phase_id: '',
                    target_phase_id: '',
                    start_date: '',
                    end_date: '',
                    custom_name: ''
                  });
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              {/* Phase Type Selection */}
              <div className="form-group">
                <label style={{ fontWeight: 500, marginBottom: '0.75rem', display: 'block' }}>
                  {t('phases:manager.addPhaseTypeQuestion')}
                </label>
                <div className="radio-group">
                  <div
                    className="selection-card"
                    data-selected={addPhaseMode === 'existing'}
                    onClick={() => setAddPhaseMode('existing')}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{t('phases:manager.modeExisting')}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                        {t('phases:manager.modeExistingDesc')}
                      </div>
                    </div>
                  </div>

                  <div
                    className="selection-card"
                    data-selected={addPhaseMode === 'duplicate'}
                    onClick={() => setAddPhaseMode('duplicate')}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>
                        {t('phases:manager.modeDuplicate')}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                        {t('phases:manager.modeDuplicateDesc')}
                      </div>
                    </div>
                  </div>

                  <div
                    className="selection-card"
                    data-selected={addPhaseMode === 'custom'}
                    onClick={() => setAddPhaseMode('custom')}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{t('phases:manager.modeCustom')}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                        {t('phases:manager.modeCustomDesc')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <hr style={{ margin: '1.5rem 0' }} />

              {/* Conditional Form Content Based on Mode */}
              {addPhaseMode === 'existing' && (
                <form onSubmit={handleAddPhase} id="addPhaseForm">
                  <div className="form-group">
                    <label htmlFor="phase_id">{t('phases:manager.selectPhaseLabel')}</label>
                    <select
                      name="phase_id"
                      id="phase_id"
                      className="form-select"
                      required
                    >
                      <option value="">{t('phases:manager.selectPhaseOption')}</option>
                      {getAvailablePhases().map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="start_date">{t('phases:manager.startDateRequired')}</label>
                    <input
                      type="date"
                      name="start_date"
                      id="start_date"
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="end_date">{t('phases:manager.endDateRequired')}</label>
                    <input
                      type="date"
                      name="end_date"
                      id="end_date"
                      className="form-input"
                      required
                    />
                  </div>
                </form>
              )}

              {addPhaseMode === 'duplicate' && (
                <form onSubmit={handleDuplicatePhase} id="duplicatePhaseForm">
                  {/* Source Phase Selection */}
                  <div className="form-group">
                    <label htmlFor="source_phase">{t('phases:manager.selectPhaseToDuplicateLabel')}</label>
                    <select
                      name="source_phase"
                      id="source_phase"
                      className="form-select"
                      value={selectedSourcePhase}
                      onChange={(e) => {
                        const phaseId = e.target.value;
                        setSelectedSourcePhase(phaseId);
                        const phase = projectPhases?.find(p => p.phase_id === phaseId);
                        if (phase) {
                          setDuplicatePhaseForm(prev => ({ 
                            ...prev, 
                            source_phase_id: phaseId,
                            custom_name: `${phase.phase_name} (Copy)` 
                          }));
                          // Set default placement to after the selected phase
                          if (!placementAfterPhaseId && placementMode === 'after_phase') {
                            setPlacementAfterPhaseId(phase.id);
                          }
                        }
                      }}
                      required
                    >
                      <option value="">{t('phases:manager.selectPhaseToDuplicateOption')}</option>
                      {projectPhases?.map((phase) => (
                        <option key={phase.id} value={phase.phase_id}>
                          {phase.phase_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Placement Section */}
                  <div className="form-group">
                    <label>{t('phases:manager.placement')}</label>
                    <div className="radio-group">
                      <div
                        className="selection-card-inline"
                        data-selected={placementMode === 'after_phase'}
                        onClick={() => setPlacementMode('after_phase')}
                      >
                        <span>{t('phases:manager.placementAfter')}</span>
                        <select
                          name="after_phase_id"
                          value={placementAfterPhaseId}
                          onChange={(e) => {
                            e.stopPropagation();
                            setPlacementAfterPhaseId(e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="form-select"
                          style={{ flex: 1 }}
                          disabled={placementMode !== 'after_phase'}
                          required={placementMode === 'after_phase'}
                        >
                          <option value="">{t('phases:manager.selectPhaseDots')}</option>
                          {projectPhases?.map(phase => (
                            <option key={phase.id} value={phase.id}>
                              {phase.phase_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div
                        className="selection-card-inline"
                        data-selected={placementMode === 'beginning'}
                        onClick={() => setPlacementMode('beginning')}
                      >
                        <span>{t('phases:manager.placementBeginning')}</span>
                      </div>

                      <div
                        className="selection-card-inline"
                        data-selected={placementMode === 'custom'}
                        onClick={() => setPlacementMode('custom')}
                      >
                        <span>{t('phases:manager.placementCustom')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Custom dates inputs */}
                  {placementMode === 'custom' && (
                    <>
                      <div className="form-group">
                        <label htmlFor="start_date">{t('phases:manager.startDateRequired')}</label>
                        <input
                          type="date"
                          name="start_date"
                          className="form-input"
                          value={duplicatePhaseForm.start_date}
                          onChange={(e) => setDuplicatePhaseForm(prev => ({ ...prev, start_date: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="end_date">{t('phases:manager.endDateRequired')}</label>
                        <input
                          type="date"
                          name="end_date"
                          className="form-input"
                          value={duplicatePhaseForm.end_date}
                          onChange={(e) => setDuplicatePhaseForm(prev => ({ ...prev, end_date: e.target.value }))}
                          required
                        />
                      </div>
                    </>
                  )}

                  {/* Name field */}
                  <div className="form-group">
                    <label htmlFor="custom_name">{t('phases:manager.nameOptional')}</label>
                    <input
                      type="text"
                      name="custom_name"
                      className="form-input"
                      value={duplicatePhaseForm.custom_name}
                      onChange={(e) => setDuplicatePhaseForm(prev => ({ ...prev, custom_name: e.target.value }))}
                      placeholder={duplicatePhaseForm.custom_name || t('phases:manager.duplicateNamePlaceholder')}
                    />
                  </div>

                  {/* Overlap adjustment checkbox */}
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={adjustOverlapping}
                        onChange={(e) => setAdjustOverlapping(e.target.checked)}
                        style={{ marginTop: '0.125rem' }}
                      />
                      <div>
                        <div>{t('phases:manager.adjustOverlapping')}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                          {t('phases:manager.adjustOverlappingDesc')}
                        </div>
                      </div>
                    </label>
                  </div>
                </form>
              )}

              {addPhaseMode === 'custom' && (
                <form onSubmit={handleCreateCustomPhase} id="customPhaseForm">
                  <div className="form-group">
                    <label htmlFor="phase_name">{t('phases:manager.phaseNameRequired')}</label>
                    <input
                      type="text"
                      name="phase_name"
                      id="phase_name"
                      className="form-input"
                      placeholder={t('phases:manager.phaseNamePlaceholder')}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="description">{t('common:description')}</label>
                    <textarea
                      name="description"
                      id="description"
                      className="form-textarea"
                      placeholder={t('phases:manager.customPhaseDescPlaceholder')}
                      rows={3}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="start_date">{t('phases:manager.startDateRequired')}</label>
                    <input
                      type="date"
                      name="start_date"
                      id="start_date"
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="end_date">{t('phases:manager.endDateRequired')}</label>
                    <input
                      type="date"
                      name="end_date"
                      id="end_date"
                      className="form-input"
                      required
                    />
                  </div>
                </form>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowAddPhase(false);
                  setAddPhaseMode('existing');
                  setSelectedSourcePhase('');
                  setPlacementMode('after_phase');
                  setPlacementAfterPhaseId('');
                  setAdjustOverlapping(true);
                  setDuplicatePhaseForm({
                    source_phase_id: '',
                    target_phase_id: '',
                    start_date: '',
                    end_date: '',
                    custom_name: ''
                  });
                }}
              >
                {t('common:cancel')}
              </button>
              <button
                type="submit"
                form={addPhaseMode === 'existing' ? 'addPhaseForm' : addPhaseMode === 'duplicate' ? 'duplicatePhaseForm' : 'customPhaseForm'}
                className="btn btn-primary"
                disabled={
                  (addPhaseMode === 'existing' && addPhaseMutation.isPending) ||
                  (addPhaseMode === 'duplicate' && duplicatePhaseMutation.isPending) ||
                  (addPhaseMode === 'custom' && createCustomPhaseMutation.isPending)
                }
              >
                {addPhaseMode === 'existing' && (addPhaseMutation.isPending ? t('phases:manager.adding') : t('phases:manager.addPhase'))}
                {addPhaseMode === 'duplicate' && (duplicatePhaseMutation.isPending ? t('phases:manager.duplicating') : t('phases:manager.duplicatePhase'))}
                {addPhaseMode === 'custom' && (createCustomPhaseMutation.isPending ? t('phases:manager.creating') : t('phases:manager.createPhase'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectPhaseManager;
