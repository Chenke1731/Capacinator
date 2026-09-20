import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { InlineEdit } from './InlineEdit';
import type { Phase, Dependency } from '../../hooks/usePhaseTimelineData';

// Phase colors for visual distinction
const PHASE_COLORS: Record<string, string> = {
  'business planning': '#3b82f6',
  'development': '#10b981',
  'system integration testing': '#f59e0b',
  'user acceptance testing': '#8b5cf6',
  'validation': '#ec4899',
  'cutover': '#ef4444',
  'hypercare': '#06b6d4',
  'support': '#84cc16',
  'custom': '#6b7280'
};

export const getPhaseColor = (phaseName: string): string => {
  const normalizedName = phaseName.toLowerCase();
  return PHASE_COLORS[normalizedName] || PHASE_COLORS['custom'];
};

interface PhaseTimelineTableProps {
  phases: Phase[];
  dependencies: Dependency[];
  validationErrors: Record<string, string[]>;
  onUpdatePhase: (phaseId: string, updates: Partial<Phase>) => void;
  onDeletePhase: (phaseId: string) => void;
  onDeleteDependency: (dependencyId: string) => void;
  onAddDependencyClick: (phaseId: string) => void;
  onValidate: (phaseId: string, startDate: string, endDate: string) => string[];
  onCalculateCorrection: (phaseId: string, startDate: string, endDate: string) => {
    startDate: string;
    endDate: string;
    isValid: boolean;
  };
}

export function PhaseTimelineTable({
  phases,
  dependencies,
  validationErrors,
  onUpdatePhase,
  onDeletePhase,
  onDeleteDependency,
  onAddDependencyClick,
  onValidate,
  onCalculateCorrection
}: PhaseTimelineTableProps) {
  const { t } = useTranslation();

  const getDependenciesForPhase = (phaseId: string) => {
    return dependencies.filter((dep: Dependency) => dep.successor_phase_timeline_id === phaseId);
  };

  const getCurrentDates = (phaseId: string) => {
    const phase = phases.find(p => p.id === phaseId);
    return phase ? { start_date: phase.start_date, end_date: phase.end_date } : undefined;
  };

  const handleAutoCorrect = (phaseId: string, correction: { startDate: string; endDate: string }) => {
    onUpdatePhase(phaseId, {
      start_date: correction.startDate,
      end_date: correction.endDate
    });
  };

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('phases:manager.phaseColumn')}</th>
            <th>{t('common:startDate')}</th>
            <th>{t('common:endDate')}</th>
            <th>{t('phases:table.dependencies')}</th>
            <th width="100">{t('common:actions')}</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((phase: Phase) => {
            const phaseDependencies = getDependenciesForPhase(phase.id);
            const phaseColor = getPhaseColor(phase.phase_name);

            return (
              <tr key={phase.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: phaseColor,
                        flexShrink: 0
                      }}
                    />
                    <InlineEdit
                      value={phase.phase_name}
                      onSave={(value) => onUpdatePhase(phase.id, { phase_name: value })}
                      className="font-medium"
                    />
                  </div>
                </td>
                <td>
                  <div className="date-field-container">
                    <InlineEdit
                      value={phase.start_date}
                      type="date"
                      phaseId={phase.id}
                      dateType="start"
                      onSave={(value) => onUpdatePhase(phase.id, { start_date: value })}
                      onValidate={onValidate}
                      onCalculateCorrection={onCalculateCorrection}
                      onAutoCorrect={handleAutoCorrect}
                      getCurrentDates={getCurrentDates}
                    />
                    {validationErrors[phase.id] && (
                      <div className="validation-error">
                        <AlertTriangle size={12} />
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div className="date-field-container">
                    <InlineEdit
                      value={phase.end_date}
                      type="date"
                      phaseId={phase.id}
                      dateType="end"
                      onSave={(value) => onUpdatePhase(phase.id, { end_date: value })}
                      onValidate={onValidate}
                      onCalculateCorrection={onCalculateCorrection}
                      onAutoCorrect={handleAutoCorrect}
                      getCurrentDates={getCurrentDates}
                    />
                    {validationErrors[phase.id] && (
                      <div className="validation-error">
                        <AlertTriangle size={12} />
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div
                    className="dependencies-cell clickable-dependencies"
                    onClick={() => onAddDependencyClick(phase.id)}
                    title={t('phases:table.clickToAddDependency')}
                  >
                    {phaseDependencies.length > 0 ? (
                      <div className="dependencies-list">
                        {phaseDependencies.map((dep: Dependency) => {
                          const predecessorPhase = phases.find(
                            (p: Phase) => p.id === dep.predecessor_phase_timeline_id
                          );
                          return (
                            <div key={dep.id} className="dependency-item">
                              <span className="dependency-phase">{predecessorPhase?.phase_name}</span>
                              <ArrowRight size={12} />
                              <span className="dependency-type">{dep.dependency_type}</span>
                              {dep.lag_days ? (
                                <span className="dependency-lag">+{dep.lag_days}d</span>
                              ) : null}
                              <button
                                className="btn-icon btn-danger btn-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteDependency(dep.id);
                                }}
                                title={t('phases:table.removeDependency')}
                              >
                                <X size={10} />
                              </button>
                            </div>
                          );
                        })}
                        <div className="add-dependency-hint">
                          <Plus size={12} />
                          <span>{t('phases:table.addDependency')}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-dependencies">
                        <Plus size={14} />
                        <span>{t('phases:table.addDependency')}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="btn-icon btn-danger btn-sm"
                      onClick={() => {
                        if (confirm(t('phases:manager.deletePhaseConfirm'))) {
                          onDeletePhase(phase.id);
                        }
                      }}
                      title={t('phases:manager.deletePhaseTooltip')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default PhaseTimelineTable;
