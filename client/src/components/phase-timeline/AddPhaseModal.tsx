import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface PhaseFormData {
  phase_name: string;
  start_date: string;
  end_date: string;
}

interface AddPhaseModalProps {
  isOpen: boolean;
  formData: PhaseFormData;
  onFormChange: (data: Partial<PhaseFormData>) => void;
  onSubmit: () => void;
  onClose: () => void;
  isPending?: boolean;
}

export function AddPhaseModal({
  isOpen,
  formData,
  onFormChange,
  onSubmit,
  onClose,
  isPending = false
}: AddPhaseModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{t('phases:modal.addNewPhase')}</h3>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('phases:manager.phaseName')}</label>
              <input
                type="text"
                value={formData.phase_name}
                onChange={(e) => onFormChange({ phase_name: e.target.value })}
                className="form-input"
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t('common:startDate')}</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => onFormChange({ start_date: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common:endDate')}</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => onFormChange({ end_date: e.target.value })}
                  className="form-input"
                  min={formData.start_date}
                  required
                />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                {t('common:cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {t('phases:manager.createPhase')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddPhaseModal;
