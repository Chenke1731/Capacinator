import React from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { getDateFnsLocale } from '../../i18n';

interface PhaseData {
  phase_name: string;
  start_date: string;
  end_date: string;
  phase_description?: string;
  description?: string;
  notes?: string;
  phase_order?: number;
  order_index?: number;
  projectId?: string;
  dependencies?: unknown[];
}

interface TimelineItemTooltipProps {
  phase: PhaseData;
  mode: 'brush' | 'phase-manager' | 'roadmap';
}

export function TimelineItemTooltip({ phase, mode }: TimelineItemTooltipProps) {
  const { t } = useTranslation();
  const startDate = new Date(phase.start_date);
  const endDate = new Date(phase.end_date);
  const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const workingDays = Math.ceil(duration * 5 / 7);

  return (
    <div style={{
      backgroundColor: 'rgba(0, 0, 0, 0.92)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      minWidth: '280px',
      maxWidth: '350px',
      minHeight: '200px',
      maxHeight: '400px',
      overflow: 'visible',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      lineHeight: '1.4'
    }}>
      {/* Phase Header */}
      <div style={{
        fontWeight: 700,
        marginBottom: '8px',
        fontSize: '14px',
        color: '#ffffff',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        paddingBottom: '6px'
      }}>
        {phase.phase_name}
      </div>

      {/* Project Context */}
      {phase.projectId && (
        <div style={{
          fontSize: '11px',
          opacity: 0.8,
          marginBottom: '8px',
          fontStyle: 'italic'
        }}>
          {t('phases:tooltip.projectId', { id: phase.projectId })}
        </div>
      )}

      {/* Timeline Information */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ marginBottom: '2px' }}>
          <span style={{ opacity: 0.8 }}>{t('phases:inline.startLabel')}</span> {format(startDate, 'MMM dd, yyyy (EEE)', { locale: getDateFnsLocale() })}
        </div>
        <div style={{ marginBottom: '2px' }}>
          <span style={{ opacity: 0.8 }}>{t('phases:inline.endLabel')}</span> {format(endDate, 'MMM dd, yyyy (EEE)', { locale: getDateFnsLocale() })}
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          marginTop: '4px'
        }}>
          <span><span style={{ opacity: 0.8 }}>{t('phases:tooltip.durationLabel')}</span> {t('phases:manager.days', { count: duration })}</span>
          <span style={{ opacity: 0.7 }}>{t('phases:tooltip.workDays', { count: workingDays })}</span>
        </div>
      </div>

      {/* Phase Description */}
      {(phase.phase_description || phase.description) && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px',
            opacity: 0.8,
            fontWeight: 600,
            marginBottom: '3px'
          }}>
            {t('phases:tooltip.descriptionLabel')}
          </div>
          <div style={{
            fontSize: '12px',
            opacity: 0.9,
            fontStyle: 'italic'
          }}>
            {phase.phase_description || phase.description}
          </div>
        </div>
      )}

      {/* Phase Notes */}
      {phase.notes && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px',
            opacity: 0.8,
            fontWeight: 600,
            marginBottom: '3px'
          }}>
            {t('phases:tooltip.notesLabel')}
          </div>
          <div style={{
            fontSize: '12px',
            opacity: 0.9,
            fontStyle: 'italic'
          }}>
            {phase.notes}
          </div>
        </div>
      )}

      {/* Phase Order/Sequence */}
      {(phase.phase_order || phase.order_index) && (
        <div style={{
          fontSize: '11px',
          opacity: 0.7,
          marginBottom: '8px'
        }}>
          {t('phases:tooltip.phaseSequence', { order: phase.phase_order || phase.order_index })}
        </div>
      )}

      {/* Dependencies Info */}
      {(phase.dependencies && phase.dependencies.length > 0) && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px',
            opacity: 0.8,
            fontWeight: 600,
            marginBottom: '3px'
          }}>
            {t('phases:tooltip.dependenciesLabel')}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>
            {t('phases:tooltip.dependencyCount', { count: phase.dependencies.length })}
          </div>
        </div>
      )}

      {/* Action Hints */}
      <div style={{
        fontSize: '10px',
        opacity: 0.6,
        marginTop: '10px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        paddingTop: '6px',
        textAlign: 'center'
      }}>
        {mode === 'phase-manager' ?
          t('phases:tooltip.hintEdit') :
          t('phases:tooltip.hintView')
        }
      </div>
    </div>
  );
}

export default TimelineItemTooltip;
