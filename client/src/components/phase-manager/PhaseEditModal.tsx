import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar, Type, Save } from 'lucide-react';
import { EditPhaseFormData, ProjectPhaseTimeline } from './types';

interface PhaseEditModalProps {
  isOpen: boolean;
  editingPhase: ProjectPhaseTimeline | null;
  formData: EditPhaseFormData;
  onFormChange: (updates: Partial<EditPhaseFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function PhaseEditModal({
  isOpen,
  editingPhase,
  formData,
  onFormChange,
  onSubmit,
  onClose
}: PhaseEditModalProps) {
  const { t } = useTranslation();

  if (!isOpen || !editingPhase) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">
            {t('phases:modal.editPhaseTitle', { name: editingPhase.phase_name })}
          </h3>
          <button
            onClick={onClose}
            className="modal-close"
          >
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label">
              <Type size={16} />
              {t('phases:modal.phaseTypeReadOnly')}
            </label>
            <input
              type="text"
              value={formData.phase_name}
              disabled
              className="form-input"
            />
          </div>

          <div className="form-group grid">
            <div>
              <label className="form-label">
                <Calendar size={16} />
                {t('common:startDate')}
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => onFormChange({ start_date: e.target.value })}
                required
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">
                <Calendar size={16} />
                {t('common:endDate')}
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => onFormChange({ end_date: e.target.value })}
                required
                min={formData.start_date}
                className="form-input"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              disabled={!formData.start_date || !formData.end_date}
              className="btn btn-primary"
            >
              <Save size={16} />
              {t('phases:common.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PhaseEditModal;
