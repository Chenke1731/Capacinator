import React from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { DependencyFormData, DependencyType, PhaseDependency } from './types';
import { TimelineItem } from '../InteractiveTimeline';

interface DependencyModalProps {
  isOpen: boolean;
  editingDependency: PhaseDependency | null;
  formData: DependencyFormData;
  timelineItems: TimelineItem[];
  onFormChange: (updates: Partial<DependencyFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

// D-04 Stage 2（2026-11-11）：手写 modal 外壳迁 Radix；G-13 收口焦点返回。
export function DependencyModal({
  isOpen,
  editingDependency,
  formData,
  timelineItems,
  onFormChange,
  onSubmit,
  onClose
}: DependencyModalProps) {
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
          <DialogTitle>
            {editingDependency ? t('phases:dependency.modalTitleEdit') : t('phases:dependency.modalTitleAdd')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label">
              {t('phases:dependency.predecessorLabel')}
            </label>
            <select
              value={formData.predecessor_phase_timeline_id}
              onChange={(e) => onFormChange({ predecessor_phase_timeline_id: e.target.value })}
              required
              className="form-select"
            >
              <option value="">{t('phases:dependency.selectPredecessor')}</option>
              {timelineItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('phases:dependency.successorLabel')}
            </label>
            <select
              value={formData.successor_phase_timeline_id}
              onChange={(e) => onFormChange({ successor_phase_timeline_id: e.target.value })}
              required
              className="form-select"
            >
              <option value="">{t('phases:dependency.selectSuccessor')}</option>
              {timelineItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('phases:dependency.typeLabel')}
            </label>
            <select
              value={formData.dependency_type}
              onChange={(e) => onFormChange({ dependency_type: e.target.value as DependencyType })}
              className="form-select"
              disabled
            >
              <option value="FS">{t('phases:dependency.finishToStartFS')}</option>
            </select>
            <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginTop: '4px' }}>
              {t('phases:dependency.fsHint')}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('phases:dependency.lagLabel')}
            </label>
            <input
              type="number"
              value={formData.lag_days}
              onChange={(e) => onFormChange({ lag_days: parseInt(e.target.value, 10) || 0 })}
              min="-365"
              max="365"
              className="form-input"
            />
            <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginTop: '4px' }}>
              {t('phases:dependency.lagHint')}
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <button type="button" onClick={onClose} className="dialog-secondary-btn">
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              disabled={!formData.predecessor_phase_timeline_id || !formData.successor_phase_timeline_id}
              className="dialog-primary-btn"
            >
              <Save size={16} />
              {editingDependency ? t('phases:dependency.updateDependency') : t('phases:dependency.createDependency')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default DependencyModal;
