import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save } from 'lucide-react';
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">
            {editingDependency ? t('phases:dependency.modalTitleEdit') : t('phases:dependency.modalTitleAdd')}
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
              disabled={!formData.predecessor_phase_timeline_id || !formData.successor_phase_timeline_id}
              className="btn btn-primary"
            >
              <Save size={16} />
              {editingDependency ? t('phases:dependency.updateDependency') : t('phases:dependency.createDependency')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DependencyModal;
