import { ImeSafeForm } from '../ui/ime-safe-form';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Type, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { EditPhaseFormData, ProjectPhaseTimeline } from './types';

interface PhaseEditModalProps {
  isOpen: boolean;
  editingPhase: ProjectPhaseTimeline | null;
  formData: EditPhaseFormData;
  onFormChange: (updates: Partial<EditPhaseFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

// D-04 Stage 2（2026-11-11）：手写 modal 外壳迁 Radix；G-13 收口焦点返回。
export function PhaseEditModal({
  isOpen,
  editingPhase,
  formData,
  onFormChange,
  onSubmit,
  onClose
}: PhaseEditModalProps) {
  const { t } = useTranslation();

  const triggerRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (isOpen) triggerRef.current = document.activeElement as HTMLElement | null;
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="max-w-md"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-color)',
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('phases:modal.editPhaseTitle', { name: editingPhase?.phase_name })}</DialogTitle>
        </DialogHeader>

        <ImeSafeForm onSubmit={onSubmit}>
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

          <div className="form-group grid grid-cols-2 gap-4">
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

          <DialogFooter className="mt-2 gap-2">
            <button type="button" onClick={onClose} className="dialog-secondary-btn">
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              disabled={!formData.start_date || !formData.end_date}
              className="dialog-primary-btn"
            >
              <Save size={16} />
              {t('phases:common.saveChanges')}
            </button>
          </DialogFooter>
        </ImeSafeForm>
      </DialogContent>
    </Dialog>
  );
}

export default PhaseEditModal;
