import React, { useState, useEffect, useMemo } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { isBeforeSafe, isAfterSafe } from '../utils/date';
import { usePhaseTimelineData, Phase, Dependency } from '../hooks/usePhaseTimelineData';
import { usePhaseValidation } from '../hooks/usePhaseValidation';
import {
  PhaseTimelineTable,
  AddPhaseModal,
  AddDependencyModal,
  PhaseTimelineStyles
} from './phase-timeline';

interface PhaseTimelineProps {
  projectId: string;
  projectName: string;
}

export function PhaseTimeline({ projectId }: PhaseTimelineProps) {
  // Modal states
  const [showAddPhaseModal, setShowAddPhaseModal] = useState(false);
  const [showAddDependencyModal, setShowAddDependencyModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  // Form states
  const [phaseForm, setPhaseForm] = useState({
    phase_name: '',
    start_date: '',
    end_date: ''
  });

  const [dependencyForm, setDependencyForm] = useState({
    predecessor_phase_timeline_id: '',
    successor_phase_timeline_id: '',
    dependency_type: 'FS' as 'FS' | 'SS' | 'FF' | 'SF',
    lag_days: 0
  });

  // Use data hook
  const {
    phasesData,
    dependenciesData,
    phasesLoading,
    updatePhaseMutation,
    createPhaseMutation,
    deletePhaseMutation,
    createDependencyMutation,
    deleteDependencyMutation,
    applyBulkCorrectionsMutation
  } = usePhaseTimelineData({
    projectId,
    onPhaseUpdateError: (errors) => {
      alert('Dependency validation failed:\n' + errors.join('\n'));
    }
  });

  // Get clean phases (filtered and sorted)
  const phases = useMemo(() => {
    if (!phasesData) return [];

    return phasesData
      .filter((phase) => {
        const phaseName = (phase.phase_name || '').toLowerCase();
        // Filter out test/garbage phases
        if (phaseName.includes('test phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
        if (phaseName.includes('no adjust phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
        if (phaseName.includes('duplicated phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
        if (phaseName.includes('custom date phase') && (phaseName.includes('1753') || phaseName.includes('1754'))) return false;
        return true;
      })
      .sort((a, b) => {
        if (isBeforeSafe(a.start_date, b.start_date)) return -1;
        if (isAfterSafe(a.start_date, b.start_date)) return 1;
        return 0;
      });
  }, [phasesData]);

  const dependencies: Dependency[] = dependenciesData || [];

  // Use validation hook
  const { validatePhaseDate, calculateCorrectedDates, calculateBulkCorrections } = usePhaseValidation({
    phases,
    dependencies
  });

  // Validate all phases on load and when dependencies change
  useEffect(() => {
    if (phases.length > 0 && dependencies.length > 0) {
      const newValidationErrors: Record<string, string[]> = {};

      for (const phase of phases) {
        const errors = validatePhaseDate(phase.id, phase.start_date, phase.end_date);
        if (errors.length > 0) {
          newValidationErrors[phase.id] = errors;
        }
      }

      setValidationErrors(newValidationErrors);
    }
  }, [phases, dependencies, validatePhaseDate]);

  // Handlers
  const handleUpdatePhase = (phaseId: string, updates: Partial<Phase>) => {
    updatePhaseMutation.mutate({ phaseId, updates }, {
      onSuccess: () => {
        // Clear validation errors for this phase after successful update
        setValidationErrors(prev => {
          const updated = { ...prev };
          delete updated[phaseId];
          return updated;
        });
      }
    });
  };

  const handleCreatePhase = () => {
    createPhaseMutation.mutate(phaseForm as Omit<Phase, 'id'>, {
      onSuccess: () => {
        setShowAddPhaseModal(false);
        setPhaseForm({ phase_name: '', start_date: '', end_date: '' });
      }
    });
  };

  const handleDeletePhase = (phaseId: string) => {
    deletePhaseMutation.mutate(phaseId);
  };

  const handleCreateDependency = () => {
    createDependencyMutation.mutate(dependencyForm as Omit<Dependency, 'id'>, {
      onSuccess: async (newDependency) => {
        // Check if the new dependency creates date conflicts and auto-correct if needed
        setTimeout(async () => {
          const successorPhase = phases.find(p => p.id === newDependency.successor_phase_timeline_id);
          if (successorPhase) {
            const validation = validatePhaseDate(successorPhase.id, successorPhase.start_date, successorPhase.end_date);
            if (validation.length > 0) {
              const correction = calculateCorrectedDates(successorPhase.id, successorPhase.start_date, successorPhase.end_date);
              if (!correction.isValid) {
                await updatePhaseMutation.mutateAsync({
                  phaseId: successorPhase.id,
                  updates: {
                    start_date: correction.startDate,
                    end_date: correction.endDate
                  }
                });
              }
            }
          }
        }, 100);

        setShowAddDependencyModal(false);
        setDependencyForm({
          predecessor_phase_timeline_id: '',
          successor_phase_timeline_id: '',
          dependency_type: 'FS',
          lag_days: 0
        });
      }
    });
  };

  const handleDeleteDependency = (dependencyId: string) => {
    deleteDependencyMutation.mutate(dependencyId);
  };

  const handleAddDependencyClick = (phaseId: string) => {
    setDependencyForm(prev => ({
      ...prev,
      successor_phase_timeline_id: phaseId
    }));
    setShowAddDependencyModal(true);
  };

  const handleFixAll = async () => {
    try {
      const corrections = calculateBulkCorrections(validationErrors);

      if (corrections.length > 0) {
        await applyBulkCorrectionsMutation.mutateAsync(corrections);
      }
    } catch (error) {
      console.error('Fix All failed:', error);
    }
  };

  if (phasesLoading) return <div>Loading phases...</div>;

  return (
    <div className="phase-timeline">
      <div className="phase-timeline-header">
        <h3>Project Timeline</h3>
        <div className="header-actions">
          {Object.keys(validationErrors).length > 0 && (
            <button
              className="btn btn-warning btn-sm"
              onClick={handleFixAll}
              disabled={updatePhaseMutation.isPending || applyBulkCorrectionsMutation.isPending}
            >
              <AlertTriangle size={16} />
              Fix All ({Object.keys(validationErrors).length})
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddPhaseModal(true)}
          >
            <Plus size={16} />
            Add Phase
          </button>
        </div>
      </div>

      <PhaseTimelineTable
        phases={phases}
        dependencies={dependencies}
        validationErrors={validationErrors}
        onUpdatePhase={handleUpdatePhase}
        onDeletePhase={handleDeletePhase}
        onDeleteDependency={handleDeleteDependency}
        onAddDependencyClick={handleAddDependencyClick}
        onValidate={validatePhaseDate}
        onCalculateCorrection={calculateCorrectedDates}
      />

      <AddPhaseModal
        isOpen={showAddPhaseModal}
        formData={phaseForm}
        onFormChange={(data) => setPhaseForm(prev => ({ ...prev, ...data }))}
        onSubmit={handleCreatePhase}
        onClose={() => setShowAddPhaseModal(false)}
        isPending={createPhaseMutation.isPending}
      />

      <AddDependencyModal
        isOpen={showAddDependencyModal}
        formData={dependencyForm}
        phases={phases}
        onFormChange={(data) => setDependencyForm(prev => ({ ...prev, ...data }))}
        onSubmit={handleCreateDependency}
        onClose={() => setShowAddDependencyModal(false)}
        isPending={createDependencyMutation.isPending}
      />

      <PhaseTimelineStyles />
    </div>
  );
}

export default PhaseTimeline;
