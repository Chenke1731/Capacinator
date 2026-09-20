import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { Phase } from '../../hooks/usePhaseTimelineData';

interface DependencyFormData {
  predecessor_phase_timeline_id: string;
  successor_phase_timeline_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

interface AddDependencyModalProps {
  isOpen: boolean;
  formData: DependencyFormData;
  phases: Phase[];
  onFormChange: (data: Partial<DependencyFormData>) => void;
  onSubmit: () => void;
  onClose: () => void;
  isPending?: boolean;
}

export function AddDependencyModal({
  isOpen,
  formData,
  phases,
  onFormChange,
  onSubmit,
  onClose,
  isPending = false
}: AddDependencyModalProps) {
  const { t } = useTranslation();

  // Moved inside the component so labels follow the active language
  const DEPENDENCY_TYPE_LABELS = {
    'FS': t('phases:dependency.finishToStart')
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{t('phases:visual.addDependency')}</h3>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('phases:dependency.predecessorPhase')}</label>
              <select
                value={formData.predecessor_phase_timeline_id}
                onChange={(e) => onFormChange({ predecessor_phase_timeline_id: e.target.value })}
                className="form-select"
                required
              >
                <option value="">{t('phases:dependency.selectPredecessorPhase')}</option>
                {phases.map((phase: Phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.phase_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('phases:dependency.successorPhase')}</label>
              <select
                value={formData.successor_phase_timeline_id}
                onChange={(e) => onFormChange({ successor_phase_timeline_id: e.target.value })}
                className="form-select"
                required
              >
                <option value="">{t('phases:dependency.selectSuccessorPhase')}</option>
                {phases
                  .filter((phase: Phase) => phase.id !== formData.predecessor_phase_timeline_id)
                  .map((phase: Phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.phase_name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('phases:dependency.typeLabel')}</label>
                <select
                  value={formData.dependency_type}
                  onChange={(e) =>
                    onFormChange({
                      dependency_type: e.target.value as 'FS' | 'SS' | 'FF' | 'SF'
                    })
                  }
                  className="form-select"
                  disabled
                >
                  {Object.entries(DEPENDENCY_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('phases:dependency.lagDays')}</label>
                <input
                  type="number"
                  value={formData.lag_days}
                  onChange={(e) => onFormChange({ lag_days: parseInt(e.target.value, 10) || 0 })}
                  className="form-input"
                  min="0"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                {t('common:cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {t('phases:dependency.createDependency')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddDependencyModal;
