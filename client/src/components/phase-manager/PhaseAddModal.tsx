import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Type, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { AddPhaseFormData, PhaseTemplate } from './types';

interface PhaseAddModalProps {
  isOpen: boolean;
  formData: AddPhaseFormData;
  phaseTemplates: PhaseTemplate[] | undefined;
  onFormChange: (updates: Partial<AddPhaseFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

// D-04 Stage 2（2026-11-11）：手写 modal-overlay 外壳迁 Radix dialog 原语——
// Esc/焦点圈/滚动锁/aria-modal 由原语承接；关闭钮/操作钮/44px 触控来自 dialog.css。
// G-13 收口：受控打开记住触发元素，关闭后焦点返回（ConfirmDialog 先例）。
export function PhaseAddModal({
  isOpen,
  formData,
  phaseTemplates,
  onFormChange,
  onSubmit,
  onClose
}: PhaseAddModalProps) {
  const { t } = useTranslation();

  const triggerRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (isOpen) triggerRef.current = document.activeElement as HTMLElement | null;
  }, [isOpen]);

  // Normalize phase templates - handle both { data: [...] } and [...] formats
  const templates = Array.isArray(phaseTemplates)
    ? phaseTemplates
    : (phaseTemplates as any)?.data || [];

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
          <DialogTitle>{t('phases:modal.addNewPhase')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit}>
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
              disabled={!formData.phase_id || !formData.start_date || !formData.end_date}
              className="dialog-primary-btn"
            >
              <Save size={16} />
              {t('phases:manager.addPhase')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PhaseAddModal;
