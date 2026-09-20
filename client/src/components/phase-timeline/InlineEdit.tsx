import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Edit2 } from 'lucide-react';
import { formatDateDisplaySafe } from '../../utils/date';

interface CorrectionSuggestion {
  startDate: string;
  endDate: string;
  isValid: boolean;
}

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  type?: 'text' | 'date';
  className?: string;
  placeholder?: string;
  phaseId?: string;
  dateType?: 'start' | 'end';
  onValidate?: (phaseId: string, startDate: string, endDate: string) => string[];
  onCalculateCorrection?: (phaseId: string, startDate: string, endDate: string) => CorrectionSuggestion;
  onAutoCorrect?: (phaseId: string, correction: CorrectionSuggestion) => void;
  getCurrentDates?: (phaseId: string) => { start_date: string; end_date: string } | undefined;
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  className = '',
  placeholder = '',
  phaseId,
  dateType,
  onValidate,
  onCalculateCorrection,
  onAutoCorrect,
  getCurrentDates
}: InlineEditProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [showValidation, setShowValidation] = useState(false);
  const [correctionSuggestion, setCorrectionSuggestion] = useState<CorrectionSuggestion | null>(null);

  const formatDateForDisplay = (dateString: string) => {
    return formatDateDisplaySafe(dateString);
  };

  const handleSave = () => {
    if (editValue !== value) {
      // For date fields, validate and potentially auto-correct
      if (type === 'date' && phaseId && dateType && onValidate && onCalculateCorrection) {
        const currentDates = getCurrentDates?.(phaseId);
        if (currentDates) {
          const newStartDate = dateType === 'start' ? editValue : currentDates.start_date;
          const newEndDate = dateType === 'end' ? editValue : currentDates.end_date;

          const validation = onValidate(phaseId, newStartDate, newEndDate);

          if (validation.length > 0) {
            // Calculate corrected dates
            const correction = onCalculateCorrection(phaseId, newStartDate, newEndDate);
            if (!correction.isValid) {
              setCorrectionSuggestion(correction);
              setShowValidation(true);
              return;
            }
          }
        }
      }

      onSave(editValue);
    }
    setIsEditing(false);
    setShowValidation(false);
    setCorrectionSuggestion(null);
  };

  const handleAutoCorrect = () => {
    if (correctionSuggestion && phaseId && onAutoCorrect) {
      onAutoCorrect(phaseId, correctionSuggestion);
      setIsEditing(false);
      setShowValidation(false);
      setCorrectionSuggestion(null);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
    setShowValidation(false);
    setCorrectionSuggestion(null);
  };

  if (isEditing) {
    return (
      <div className="inline-edit-container">
        <input
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className={`form-input ${className}`}
          placeholder={placeholder}
          autoFocus
        />

        {/* Validation popup */}
        {showValidation && correctionSuggestion && (
          <div className="validation-popup">
            <div className="validation-header">
              <AlertTriangle size={16} />
              <span>{t('phases:inline.dateConflict')}</span>
            </div>
            <p>{t('phases:inline.dateConflictDesc')}</p>
            <div className="correction-suggestion">
              <p><strong>{t('phases:inline.suggestedCorrection')}</strong></p>
              <p>{t('phases:inline.startLabel')} {formatDateForDisplay(correctionSuggestion.startDate)}</p>
              <p>{t('phases:inline.endLabel')} {formatDateForDisplay(correctionSuggestion.endDate)}</p>
            </div>
            <div className="validation-actions">
              <button className="btn btn-primary btn-sm" onClick={handleAutoCorrect}>
                {t('phases:inline.applyCorrection')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleCancel}>
                {t('common:cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const displayValue = type === 'date' ? formatDateForDisplay(value) : value;

  return (
    <div
      className={`inline-editable ${className}`}
      onClick={() => setIsEditing(true)}
      style={{ cursor: 'pointer' }}
    >
      {displayValue}
      <Edit2 size={14} className="edit-icon" style={{ marginLeft: '8px', opacity: 0.5 }} />
    </div>
  );
}

export default InlineEdit;
