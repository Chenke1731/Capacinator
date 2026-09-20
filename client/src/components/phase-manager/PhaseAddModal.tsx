import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar, Type, Save } from 'lucide-react';
import { AddPhaseFormData, PhaseTemplate } from './types';

interface PhaseAddModalProps {
  isOpen: boolean;
  formData: AddPhaseFormData;
  phaseTemplates: PhaseTemplate[] | undefined;
  onFormChange: (updates: Partial<AddPhaseFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function PhaseAddModal({
  isOpen,
  formData,
  phaseTemplates,
  onFormChange,
  onSubmit,
  onClose
}: PhaseAddModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  // Normalize phase templates - handle both { data: [...] } and [...] formats
  const templates = Array.isArray(phaseTemplates)
    ? phaseTemplates
    : (phaseTemplates as any)?.data || [];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">
            {t('phases:modal.addNewPhase')}
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
              {t('phases:modal.phaseType')}
            </label>
            <select
              value={formData.phase_id}
              onChange={(e) => onFormChange({ phase_id: e.target.value })}
              required
              className="form-select"
            >
              <option value="">{t('phases:modal.selectPhaseType')}</option>
              {templates.map((template: PhaseTemplate) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
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
              disabled={!formData.phase_id || !formData.start_date || !formData.end_date}
              className="btn btn-primary"
            >
              <Save size={16} />
              {t('phases:manager.addPhase')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PhaseAddModal;
