import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  Plus,
  Edit3,
  Trash2,
  Merge,
  ArrowRightLeft,
  Users,
  Calendar,
  Search,
  ChevronDown,
  ArrowRight,
  Filter,
  List,
  AlertTriangle,
  X
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { Scenario } from '../types';
import { getLocale } from '../i18n';
import { scenarioTypeLabel, scenarioStatusLabel } from '../lib/enum-labels';
import { CreateScenarioModal, EditScenarioModal, DeleteConfirmationModal } from '../components/modals/ScenarioModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import './Scenarios.css';

// Tree node type for hierarchical display
interface ScenarioTreeNode extends Scenario {
  children: ScenarioTreeNode[];
}

interface ScenarioCardProps {
  scenario: Scenario;
  onEdit: (scenario: Scenario) => void;
  onDelete: (scenario: Scenario) => void;
  onBranch: (scenario: Scenario) => void;
  onMerge: (scenario: Scenario) => void;
  onCompare: (scenario: Scenario) => void;
}

// Enhanced timeline utility functions
const getTimelineDetails = (createdAt: string, t: TFunction) => {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let timeAgo = '';
  let urgencyLevel = 'fresh';

  if (diffMinutes < 60) {
    timeAgo = diffMinutes <= 1 ? t('scenarios:timeline.justNow') : t('scenarios:timeline.minutesAgo', { count: diffMinutes });
    urgencyLevel = 'fresh';
  } else if (diffHours < 24) {
    timeAgo = t('scenarios:timeline.hoursAgo', { count: diffHours });
    urgencyLevel = 'recent';
  } else if (diffDays < 7) {
    timeAgo = diffDays === 1 ? t('scenarios:timeline.yesterday') : t('scenarios:timeline.daysAgo', { count: diffDays });
    urgencyLevel = 'recent';
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    timeAgo = weeks === 1 ? t('scenarios:timeline.oneWeekAgo') : t('scenarios:timeline.weeksAgo', { count: weeks });
    urgencyLevel = 'aging';
  } else if (diffDays < 90) {
    const months = Math.floor(diffDays / 30);
    timeAgo = months === 1 ? t('scenarios:timeline.oneMonthAgo') : t('scenarios:timeline.monthsAgo', { count: months });
    urgencyLevel = 'aging';
  } else {
    const months = Math.floor(diffDays / 30);
    timeAgo = t('scenarios:timeline.monthsAgo', { count: months });
    urgencyLevel = 'old';
  }

  return {
    timeAgo,
    urgencyLevel,
    daysSinceCreated: diffDays,
    absoluteDate: created.toLocaleDateString(getLocale()),
    relativeDate: created.toLocaleDateString(getLocale(), {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined
    })
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ScenarioCard: React.FC<ScenarioCardProps> = ({
  scenario,
  onEdit,
  onDelete,
  onBranch,
  onMerge,
  onCompare
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const isBaseline = scenario.scenario_type === 'baseline';
  const canMerge = scenario.parent_scenario_id && scenario.status === 'active';
  const timelineInfo = getTimelineDetails(scenario.created_at, t);

  return (
    <div className={`scenario-card ${scenario.scenario_type} ${isExpanded ? 'expanded' : ''}`}>
      <div className="scenario-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="scenario-icon">
          <GitBranch size={20} />
        </div>
        <div className="scenario-info">
          <h3 className="scenario-name">{scenario.name}</h3>
          <div className="scenario-meta">
            <span className={`scenario-type ${scenario.scenario_type}`}>
              {scenarioTypeLabel(scenario.scenario_type)}
            </span>
            <span className={`scenario-status ${scenario.status}`}>
              {scenarioStatusLabel(scenario.status)}
            </span>
            <span className={`timeline-age ${timelineInfo.urgencyLevel}`}>
              {timelineInfo.timeAgo}
            </span>
          </div>
        </div>
        <div className="expand-toggle">
          {isExpanded ? <ChevronDown size={20} /> : <ArrowRight size={20} />}
        </div>
      </div>

      {isExpanded && (
        <div className="scenario-expandable-content">
          {scenario.description && (
            <p className="scenario-description">{scenario.description}</p>
          )}

          <div className="scenario-details">
            <div className="scenario-detail">
              <Users size={14} />
              <span>{t('scenarios:card.createdByName', { name: scenario.created_by_name })}</span>
            </div>
            <div className="scenario-detail timeline-info">
              <Calendar size={14} />
              <span className="timeline-date">{timelineInfo.relativeDate}</span>
            </div>
            {scenario.branch_point && (
              <div className="scenario-detail">
                <GitBranch size={14} />
                <span>{t('scenarios:card.branchedOn', { date: new Date(scenario.branch_point).toLocaleDateString(getLocale()) })}</span>
              </div>
            )}
            {scenario.parent_scenario_name && (
              <div className="scenario-detail parent-connection">
                <div className="parent-indicator">
                  <GitBranch size={14} />
                  <span className="connection-label">{t('scenarios:card.branchedFrom')}</span>
                </div>
                <div className="parent-name">
                  <span className="parent-scenario-name">{scenario.parent_scenario_name}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="scenario-actions"
           onMouseEnter={() => setShowActions(true)}
           onMouseLeave={() => setShowActions(false)}>
        <div className={`actions-content ${showActions || isExpanded ? 'visible' : ''}`}>
        <button
          onClick={() => onBranch(scenario)}
          className="action-button branch"
          title={t('scenarios:actions.createBranchTitle')}
        >
          <GitBranch size={16} />
          {t('scenarios:actions.branch')}
        </button>

        <button
          onClick={() => onCompare(scenario)}
          className="action-button compare"
          title={t('scenarios:actions.compareTitle')}
        >
          <ArrowRightLeft size={16} />
          {t('scenarios:actions.compare')}
        </button>

        {canMerge && (
          <button
            onClick={() => onMerge(scenario)}
            className="action-button merge"
            title={t('scenarios:actions.mergeToParentTitle')}
          >
            <Merge size={16} />
            {t('scenarios:actions.merge')}
          </button>
        )}

        <button
          onClick={() => onEdit(scenario)}
          className="action-button edit"
          title={t('scenarios:actions.editTitle')}
        >
          <Edit3 size={16} />
        </button>

        {!isBaseline && (
          <button
            onClick={() => onDelete(scenario)}
            className="action-button delete"
            title={t('scenarios:actions.deleteTitle')}
          >
            <Trash2 size={16} />
          </button>
        )}
        </div>
      </div>
    </div>
  );
};

// Interfaces reserved for modal prop types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type CreateScenarioModalPropsType = { isOpen: boolean; onClose: () => void; parentScenario?: Scenario; };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type EditScenarioModalPropsType = { isOpen: boolean; onClose: () => void; scenario: Scenario; };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type DeleteConfirmationModalPropsType = { isOpen: boolean; onClose: () => void; scenario: Scenario; };

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: Scenario;
}

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: Scenario;
  scenarios: Scenario[];
}

// CreateScenarioModal, EditScenarioModal, and DeleteConfirmationModal have been moved to ScenarioModal.tsx

const MergeModal: React.FC<MergeModalProps> = ({
  isOpen,
  onClose,
  scenario
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mergeStrategy, setMergeStrategy] = useState<'favor_source' | 'favor_target' | 'manual'>('favor_source');
  const [confirmMerge, setConfirmMerge] = useState(false);

  const mergeMutation = useMutation({
    mutationFn: (data: any) => api.scenarios.merge(scenario.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scenarios.all });
      handleClose();
      setConfirmMerge(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmMerge) return;

    mergeMutation.mutate({
      merge_strategy: mergeStrategy,
      resolve_conflicts_as: mergeStrategy
    });
  };

  const handleClose = () => {
    // Reset form state
    setConfirmMerge(false);
    setMergeStrategy('favor_source');
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('scenarios:mergeModal.title')}</DialogTitle>
          <DialogDescription>
            {t('scenarios:mergeModal.description', {
              source: scenario.name,
              target: scenario.parent_scenario_name || t('scenarios:mergeModal.theParentScenario')
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Screen reader status announcements */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            id="merge-status"
          >
            {mergeMutation.isPending
              ? t('scenarios:mergeModal.mergeInProgressSr')
              : confirmMerge
                ? t('scenarios:mergeModal.readyToMergeSr')
                : t('scenarios:mergeModal.completeFormSr')
            }
          </div>

          <div className="space-y-6 py-4">
            {/* Merge flow visualization */}
            <div className="merge-info" role="region" aria-labelledby="merge-flow-heading">
              <h3 id="merge-flow-heading" className="text-lg font-medium mb-4">{t('scenarios:mergeModal.overview')}</h3>
              <div className="merge-flow">
                <div className="merge-source">
                  <h4 className="text-sm font-medium mb-2">{t('scenarios:sourceScenario')}</h4>
                  <div className="scenario-card-mini">
                    <div className="scenario-name">{scenario.name}</div>
                    <div className="scenario-meta">
                      <span className={`scenario-type ${scenario.scenario_type}`}>
                        {scenarioTypeLabel(scenario.scenario_type)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="merge-arrow" aria-hidden="true">
                  <ArrowRightLeft size={24} />
                </div>

                <div className="merge-target">
                  <h4 className="text-sm font-medium mb-2">{t('scenarios:targetScenario')}</h4>
                  <div className="scenario-card-mini">
                    <div className="scenario-name">{scenario.parent_scenario_name}</div>
                    <div className="scenario-meta">
                      <span className="scenario-type baseline">
                        {scenario.parent_scenario_id ? t('scenarios:mergeModal.parentLabel') : t('scenarios:mergeModal.baselineLabel')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Conflict resolution strategy */}
            <div className="merge-options" role="region" aria-labelledby="strategy-heading">
              <Label id="strategy-heading" className="text-sm font-medium mb-3 block">
                {t('scenarios:mergeModal.strategyTitle')}
              </Label>
              <fieldset
                className="space-y-3"
                aria-describedby="strategy-help"
              >
                <legend className="sr-only">{t('scenarios:mergeModal.strategyLegend')}</legend>

                <div className="strategy-option">
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="favor_source"
                      name="merge-strategy"
                      value="favor_source"
                      checked={mergeStrategy === 'favor_source'}
                      onChange={(e) => setMergeStrategy(e.target.value as 'favor_source' | 'favor_target' | 'manual')}
                      className="mt-1"
                    />
                    <Label htmlFor="favor_source" className="flex-1 cursor-pointer">
                      <div className="strategy-content">
                        <div className="strategy-title font-medium">{t('scenarios:mergeModal.favorSource')}</div>
                        <div className="strategy-description text-sm text-muted-foreground">
                          {t('scenarios:mergeModal.favorSourceDescription', { name: scenario.name })}
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>

                <div className="strategy-option">
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="favor_target"
                      name="merge-strategy"
                      value="favor_target"
                      checked={mergeStrategy === 'favor_target'}
                      onChange={(e) => setMergeStrategy(e.target.value as 'favor_source' | 'favor_target' | 'manual')}
                      className="mt-1"
                    />
                    <Label htmlFor="favor_target" className="flex-1 cursor-pointer">
                      <div className="strategy-content">
                        <div className="strategy-title font-medium">{t('scenarios:mergeModal.favorTarget')}</div>
                        <div className="strategy-description text-sm text-muted-foreground">
                          {t('scenarios:mergeModal.favorTargetDescription')}
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>

                <div className="strategy-option">
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="manual"
                      name="merge-strategy"
                      value="manual"
                      checked={mergeStrategy === 'manual'}
                      onChange={(e) => setMergeStrategy(e.target.value as 'favor_source' | 'favor_target' | 'manual')}
                      className="mt-1"
                    />
                    <Label htmlFor="manual" className="flex-1 cursor-pointer">
                      <div className="strategy-content">
                        <div className="strategy-title font-medium">{t('scenarios:mergeModal.manualResolution')}</div>
                        <div className="strategy-description text-sm text-muted-foreground">
                          {t('scenarios:mergeModal.manualResolutionDescription')}
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>
              </fieldset>
              <p id="strategy-help" className="text-xs text-muted-foreground mt-2">
                {t('scenarios:mergeModal.strategyHelp')}
              </p>
            </div>

            {/* Confirmation checkbox */}
            <div className="merge-confirmation" role="region" aria-labelledby="confirmation-heading">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="confirm-merge"
                  checked={confirmMerge}
                  onCheckedChange={setConfirmMerge}
                  aria-describedby="confirm-help"
                />
                <div className="flex-1">
                  <Label htmlFor="confirm-merge" className="text-sm font-medium cursor-pointer">
                    {t('scenarios:mergeModal.confirmMergeLabel', {
                      source: scenario.name,
                      target: scenario.parent_scenario_name
                    })}
                  </Label>
                  <p id="confirm-help" className="text-xs text-muted-foreground mt-1">
                    {t('scenarios:mergeModal.confirmMergeHelp')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common:cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!confirmMerge || mergeMutation.isPending}
            >
              {mergeMutation.isPending ? t('scenarios:mergeModal.merging') : t('scenarios:mergeModal.mergeScenario')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const CompareModal: React.FC<CompareModalProps> = ({
  isOpen,
  onClose,
  scenario,
  scenarios
}) => {
  const { t } = useTranslation();
  const [compareToScenario, setCompareToScenario] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const availableScenarios = scenarios.filter(s => s.id !== scenario.id);
  const selectedScenario = availableScenarios.find(s => s.id === compareToScenario);

  const handleCompare = async () => {
    if (!compareToScenario) return;
    
    setIsLoading(true);
    try {
      const response = await api.scenarios.compare(scenario.id, compareToScenario);
      setComparisonResults(response.data);
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setComparisonResults(null);
    setCompareToScenario('');
  };

  const handleClose = () => {
    // Reset state
    setComparisonResults(null);
    setCompareToScenario('');
    setIsLoading(false);
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {comparisonResults
              ? t('scenarios:compare.comparingTitle', {
                  source: scenario.name,
                  target: selectedScenario?.name || ''
                })
              : t('scenarios:compare.title')
            }
          </DialogTitle>
          <DialogDescription>
            {comparisonResults
              ? t('scenarios:compare.resultsDescription')
              : t('scenarios:compare.setupDescription')
            }
          </DialogDescription>
        </DialogHeader>

        {/* Screen reader status announcements for comparison */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          id="comparison-announcements"
        >
          {isLoading
            ? t('scenarios:compare.comparingSr')
            : comparisonResults
              ? t('scenarios:compare.completedSr', {
                  count: (comparisonResults?.differences?.assignments?.added?.length || 0) +
                    (comparisonResults?.differences?.assignments?.modified?.length || 0) +
                    (comparisonResults?.differences?.assignments?.removed?.length || 0)
                })
              : compareToScenario
                ? t('scenarios:compare.selectedSr')
                : t('scenarios:compare.selectTargetSr')
          }
        </div>

        <div className="scenarios-comparison-content" style={{ paddingTop: '1rem' }}>
          {!comparisonResults ? (
            <div className="comparison-setup">
              <div className="comparison-scenarios">
                <div className="scenario-selector">
                  <h4>{t('scenarios:sourceScenario')}</h4>
                  <div className="scenario-card-mini selected">
                    <div className="scenario-name">{scenario.name}</div>
                    <div className="scenario-meta">
                      <span className={`scenario-type ${scenario.scenario_type}`}>
                        {scenarioTypeLabel(scenario.scenario_type)}
                      </span>
                      <span className={`scenario-status ${scenario.status}`}>
                        {scenarioStatusLabel(scenario.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="comparison-arrow">
                  <ArrowRightLeft size={24} />
                </div>

                <div className="scenario-selector">
                  <Label htmlFor="compare-scenario-select">{t('scenarios:compare.compareTo')}</Label>
                  <select
                    id="compare-scenario-select"
                    value={compareToScenario}
                    onChange={(e) => setCompareToScenario(e.target.value)}
                    className="scenario-select"
                    aria-describedby="compare-scenario-help"
                    aria-required="true"
                  >
                    <option value="">{t('scenarios:compare.selectPlaceholder')}</option>
                    {availableScenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({scenarioTypeLabel(s.scenario_type)})
                      </option>
                    ))}
                  </select>
                  <div id="compare-scenario-help" className="help-text" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {t('scenarios:compare.chooseAgainstHelp', { name: scenario.name })}
                  </div>

                  {selectedScenario && (
                    <div className="scenario-card-mini">
                      <div className="scenario-name">{selectedScenario.name}</div>
                      <div className="scenario-meta">
                        <span className={`scenario-type ${selectedScenario.scenario_type}`}>
                          {scenarioTypeLabel(selectedScenario.scenario_type)}
                        </span>
                        <span className={`scenario-status ${selectedScenario.status}`}>
                          {scenarioStatusLabel(selectedScenario.status)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="comparison-actions">
                <Button
                  onClick={handleCompare}
                  disabled={!compareToScenario || isLoading}
                  aria-describedby="comparison-status"
                >
                  {isLoading ? t('scenarios:compare.comparing') : t('scenarios:compare.runComparison')}
                </Button>
                <div id="comparison-status" className="sr-only" aria-live="polite">
                  {isLoading
                    ? t('scenarios:compare.inProgressSr')
                    : !compareToScenario
                      ? t('scenarios:compare.selectToEnableSr')
                      : t('scenarios:compare.readySr')}
                </div>
              </div>
            </div>
          ) : (
            <div className="comparison-results" role="region" aria-labelledby="results-heading">
              <div className="results-header">
                <h4 id="results-heading">{t('scenarios:compare.results')}</h4>
                <Button onClick={handleReset} variant="outline" size="sm">
                  {t('scenarios:compare.newComparison')}
                </Button>
              </div>

              <div className="comparison-summary" role="group" aria-labelledby="summary-heading">
                <h5 id="summary-heading" className="sr-only">{t('scenarios:compare.summarySr')}</h5>
                <div className="summary-item">
                  <div className="summary-label">{t('scenarios:compare.assignmentsAdded')}</div>
                  <div className="summary-value" aria-label={t('scenarios:compare.assignmentsAddedAria', { count: comparisonResults?.differences?.assignments?.added?.length || 0 })}>
                    {comparisonResults?.differences?.assignments?.added?.length || 0}
                  </div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">{t('scenarios:compare.assignmentsModified')}</div>
                  <div className="summary-value" aria-label={t('scenarios:compare.assignmentsModifiedAria', { count: comparisonResults?.differences?.assignments?.modified?.length || 0 })}>
                    {comparisonResults?.differences?.assignments?.modified?.length || 0}
                  </div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">{t('scenarios:compare.assignmentsRemoved')}</div>
                  <div className="summary-value" aria-label={t('scenarios:compare.assignmentsRemovedAria', { count: comparisonResults?.differences?.assignments?.removed?.length || 0 })}>
                    {comparisonResults?.differences?.assignments?.removed?.length || 0}
                  </div>
                </div>
              </div>

              <div className="comparison-details">
                <div className="details-section" role="region" aria-labelledby="differences-heading">
                  <h5 id="differences-heading">{t('scenarios:compare.differences')}</h5>
                  <div className="differences-list">
                    {comparisonResults?.differences?.assignments?.added?.length > 0 && (
                      <div className="difference-group">
                        <h6 style={{color: '#10b981'}}>+ {t('scenarios:compare.added')} ({comparisonResults.differences.assignments.added.length})</h6>
                        {comparisonResults.differences.assignments.added.slice(0, 5).map((item: any, index: number) => (
                          <div key={`added-${index}`} className="difference-item">
                            <div className="difference-description">{item.details || `${item.person_name} → ${item.project_name}`}</div>
                          </div>
                        ))}
                        {comparisonResults.differences.assignments.added.length > 5 && (
                          <div className="difference-item">
                            <div className="difference-description">{t('scenarios:compare.andMore', { count: comparisonResults.differences.assignments.added.length - 5 })}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {comparisonResults?.differences?.assignments?.modified?.length > 0 && (
                      <div className="difference-group">
                        <h6 style={{color: '#3b82f6'}}>≈ {t('scenarios:compare.modified')} ({comparisonResults.differences.assignments.modified.length})</h6>
                        {comparisonResults.differences.assignments.modified.slice(0, 5).map((item: any, index: number) => (
                          <div key={`modified-${index}`} className="difference-item">
                            <div className="difference-description">{item.details}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {comparisonResults?.differences?.assignments?.removed?.length > 0 && (
                      <div className="difference-group">
                        <h6 style={{color: '#ef4444'}}>- {t('scenarios:compare.removed')} ({comparisonResults.differences.assignments.removed.length})</h6>
                        {comparisonResults.differences.assignments.removed.slice(0, 5).map((item: any, index: number) => (
                          <div key={`removed-${index}`} className="difference-item">
                            <div className="difference-description">{item.details || `${item.person_name} → ${item.project_name}`}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {(!comparisonResults?.differences?.assignments?.added?.length &&
                      !comparisonResults?.differences?.assignments?.modified?.length &&
                      !comparisonResults?.differences?.assignments?.removed?.length) && (
                      <div className="no-differences">{t('scenarios:compare.noDifferences')}</div>
                    )}
                  </div>
                </div>

                <div className="details-section" role="region" aria-labelledby="impact-heading">
                  <h5 id="impact-heading">{t('scenarios:compare.impactAnalysis')}</h5>
                  <div className="impact-metrics" role="group" aria-labelledby="impact-heading">
                    <div className="metric">
                      <span className="metric-label">{t('scenarios:compare.totalAllocationChange')}</span>
                      <span className="metric-value">
                        {comparisonResults?.metrics?.utilization_impact?.total_allocation_change > 0 ? '+' : ''}
                        {comparisonResults?.metrics?.utilization_impact?.total_allocation_change || 0}%
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">{t('scenarios:compare.netAssignmentChange')}</span>
                      <span className="metric-value">
                        {comparisonResults?.metrics?.capacity_impact?.net_change > 0 ? '+' : ''}
                        {comparisonResults?.metrics?.capacity_impact?.net_change || 0}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">{t('scenarios:compare.projectsAffected')}</span>
                      <span className="metric-value">
                        {comparisonResults?.metrics?.timeline_impact?.projects_affected || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {comparisonResults ? t('common:close') : t('common:cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const Scenarios: React.FC = () => {
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedParentScenario, setSelectedParentScenario] = useState<Scenario | undefined>();
  // Removed view mode selection - now only using list view
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingScenario, setDeletingScenario] = useState<Scenario | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergingScenario, setMergingScenario] = useState<Scenario | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparingScenario, setComparingScenario] = useState<Scenario | null>(null);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    types: string[];
    statuses: string[];
    creators: string[];
  }>({
    types: [],
    statuses: [],
    creators: []
  });
  
  // List view state (reserved for pagination feature)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showAllScenarios, setShowAllScenarios] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [displayLimit, setDisplayLimit] = useState(10);
  const [hideMergedScenarios, setHideMergedScenarios] = useState(false);
  
  // Accessibility and keyboard navigation state
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [treeNodes, setTreeNodes] = useState<ScenarioTreeNode[]>([]);
  const treeRef = useRef<HTMLDivElement>(null);
  
  // Focus restoration system for modals
  const focusReturnRef = useRef<HTMLElement | null>(null);
  
  // Removed toggleSection function - no longer needed
  
  // Removed renderGroupedScenarios function - no longer needed
  
  const queryClient = useQueryClient();

  // Keyboard navigation helper functions
  const getAllVisibleNodes = useCallback((nodes: ScenarioTreeNode[]): ScenarioTreeNode[] => {
    const visibleNodes: ScenarioTreeNode[] = [];
    
    const traverse = (nodeList: ScenarioTreeNode[]) => {
      nodeList.forEach(node => {
        visibleNodes.push(node);
        if (expandedNodes.has(node.id) && node.children.length > 0) {
          traverse(node.children);
        }
      });
    };
    
    traverse(nodes);
    return visibleNodes;
  }, [expandedNodes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!focusedNodeId || treeNodes.length === 0) return;

    const visibleNodes = getAllVisibleNodes(treeNodes);
    const currentIndex = visibleNodes.findIndex(node => node.id === focusedNodeId);
    const currentNode = visibleNodes[currentIndex];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < visibleNodes.length - 1) {
          setFocusedNodeId(visibleNodes[currentIndex + 1].id);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          setFocusedNodeId(visibleNodes[currentIndex - 1].id);
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (currentNode?.children.length > 0) {
          if (!expandedNodes.has(currentNode.id)) {
            setExpandedNodes(prev => new Set([...prev, currentNode.id]));
          } else {
            // Move to first child if expanded
            setFocusedNodeId(currentNode.children[0].id);
          }
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (expandedNodes.has(currentNode.id) && currentNode.children.length > 0) {
          // Collapse if expanded
          setExpandedNodes(prev => {
            const newSet = new Set(prev);
            newSet.delete(currentNode.id);
            return newSet;
          });
        } else {
          // Move to parent
          const parent = findParentNode(currentNode.id, treeNodes);
          if (parent) {
            setFocusedNodeId(parent.id);
          }
        }
        break;

      case 'Home':
        e.preventDefault();
        if (visibleNodes.length > 0) {
          setFocusedNodeId(visibleNodes[0].id);
        }
        break;

      case 'End':
        e.preventDefault();
        if (visibleNodes.length > 0) {
          setFocusedNodeId(visibleNodes[visibleNodes.length - 1].id);
        }
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        // Toggle expansion or trigger action
        if (currentNode?.children.length > 0) {
          setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(currentNode.id)) {
              newSet.delete(currentNode.id);
            } else {
              newSet.add(currentNode.id);
            }
            return newSet;
          });
        }
        break;
    }
  }, [focusedNodeId, treeNodes, expandedNodes, getAllVisibleNodes]);

  const findParentNode = useCallback((nodeId: string, nodes: ScenarioTreeNode[]): ScenarioTreeNode | null => {
    for (const node of nodes) {
      if (node.children.some(child => child.id === nodeId)) {
        return node;
      }
      const found = findParentNode(nodeId, node.children);
      if (found) return found;
    }
    return null;
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (scenarioId: string) => api.scenarios.delete(scenarioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scenarios.all });
      handleCloseDeleteModal();
    },
  });

  const { data: scenarios, isLoading, error } = useQuery({
    queryKey: queryKeys.scenarios.list(),
    queryFn: async () => {
      const response = await api.scenarios.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    },
  });

  // Filter and search logic
  const filteredScenarios = React.useMemo(() => {
    if (!scenarios) return [];
    
    const filtered = scenarios.filter(scenario => {
      // Search filter
      const searchMatch = !searchTerm || 
        scenario.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scenario.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        scenario.created_by_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Type filter
      const typeMatch = activeFilters.types.length === 0 || 
        activeFilters.types.includes(scenario.scenario_type);
      
      // Status filter
      const statusMatch = activeFilters.statuses.length === 0 || 
        activeFilters.statuses.includes(scenario.status);
      
      // Creator filter
      const creatorMatch = activeFilters.creators.length === 0 || 
        activeFilters.creators.includes(scenario.created_by_name || '');
      
      // Merged scenarios filter
      const mergedMatch = !hideMergedScenarios || scenario.status !== 'merged';
      
      return searchMatch && typeMatch && statusMatch && creatorMatch && mergedMatch;
    });

    // Sort by creation date (most recent first) for better organization
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return filtered;
  }, [scenarios, searchTerm, activeFilters, hideMergedScenarios]);

  // Update tree nodes when filtered scenarios change
  useEffect(() => {
    if (filteredScenarios.length > 0) {
      const displayedScenarios = showAllScenarios ? filteredScenarios : filteredScenarios.slice(0, displayLimit);
      
      // Build hierarchical tree structure
      const scenarioMap = new Map<string, ScenarioTreeNode>(
        displayedScenarios.map(s => [s.id, { ...s, children: [] as ScenarioTreeNode[] }])
      );
      const roots: ScenarioTreeNode[] = [];

      displayedScenarios.forEach(scenario => {
        const scenarioNode = scenarioMap.get(scenario.id)!;
        if (scenario.parent_scenario_id && scenarioMap.has(scenario.parent_scenario_id)) {
          const parent = scenarioMap.get(scenario.parent_scenario_id)!;
          parent.children.push(scenarioNode);
        } else {
          roots.push(scenarioNode);
        }
      });

      setTreeNodes(roots);
      
      // Set initial focus if no node is focused
      if (!focusedNodeId && roots.length > 0) {
        setFocusedNodeId(roots[0].id);
      }
      
      // Expand nodes that have children by default
      const newExpandedNodes = new Set<string>();
      roots.forEach(node => {
        if (node.children.length > 0) {
          newExpandedNodes.add(node.id);
        }
      });
      setExpandedNodes(newExpandedNodes);
    }
  }, [filteredScenarios, showAllScenarios, displayLimit, focusedNodeId]);

  // Get unique values for filter options
  const filterOptions = React.useMemo(() => {
    if (!scenarios) return { types: [], statuses: [], creators: [] };
    
    return {
      types: [...new Set(scenarios.map(s => s.scenario_type))],
      statuses: [...new Set(scenarios.map(s => s.status))],
      creators: [...new Set(scenarios.map(s => s.created_by_name).filter((name): name is string => Boolean(name)))]
    };
  }, [scenarios]);

  // Filter management functions
  const toggleFilter = (category: 'types' | 'statuses' | 'creators', value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(v => v !== value)
        : [...prev[category], value]
    }));
  };

  const removeFilter = (category: 'types' | 'statuses' | 'creators', value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [category]: prev[category].filter(v => v !== value)
    }));
  };

  const clearAllFilters = () => {
    setActiveFilters({ types: [], statuses: [], creators: [] });
    setSearchTerm('');
  };


  const hasActiveFilters = searchTerm || 
    activeFilters.types.length > 0 || 
    activeFilters.statuses.length > 0 || 
    activeFilters.creators.length > 0;
    
  const totalScenariosCount = scenarios?.length || 0;
  
  // Apply display limit based on view mode and filters
  const displayedScenarios = React.useMemo(() => {
    if (!filteredScenarios) return [];
    
    // Apply display limit unless showing all scenarios or there are active filters
    if (!showAllScenarios && !hasActiveFilters) {
      return filteredScenarios.slice(0, displayLimit);
    }
    
    return filteredScenarios;
  }, [filteredScenarios, showAllScenarios, hasActiveFilters, displayLimit]);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isLimitedView = !showAllScenarios && !hasActiveFilters && displayedScenarios.length < totalScenariosCount;

  // Click outside handler for filter dropdown
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleBranch = (scenario: Scenario) => {
    setSelectedParentScenario(scenario);
    setShowCreateModal(true);
  };

  const handleEdit = (scenario: Scenario, event?: React.MouseEvent) => {
    focusReturnRef.current = event?.currentTarget as HTMLElement || document.activeElement as HTMLElement;
    setEditingScenario(scenario);
    setShowEditModal(true);
  };

  const handleDelete = (scenario: Scenario, event?: React.MouseEvent) => {
    focusReturnRef.current = event?.currentTarget as HTMLElement || document.activeElement as HTMLElement;
    setDeletingScenario(scenario);
    setShowDeleteModal(true);
  };

  const handleMerge = (scenario: Scenario, event?: React.MouseEvent) => {
    focusReturnRef.current = event?.currentTarget as HTMLElement || document.activeElement as HTMLElement;
    setMergingScenario(scenario);
    setShowMergeModal(true);
  };

  const handleCompare = (scenario: Scenario, event?: React.MouseEvent) => {
    focusReturnRef.current = event?.currentTarget as HTMLElement || document.activeElement as HTMLElement;
    setComparingScenario(scenario);
    setShowCompareModal(true);
  };

  const handleCreateNew = (event?: React.MouseEvent) => {
    focusReturnRef.current = event?.currentTarget as HTMLElement || document.activeElement as HTMLElement;
    setSelectedParentScenario(undefined);
    setShowCreateModal(true);
  };

  const restoreFocus = useCallback(() => {
    if (focusReturnRef.current && focusReturnRef.current.isConnected) {
      // Use setTimeout to ensure the modal has fully closed before restoring focus
      setTimeout(() => {
        focusReturnRef.current?.focus();
        focusReturnRef.current = null;
      }, 100);
    }
  }, []);

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setSelectedParentScenario(undefined);
    restoreFocus();
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingScenario(null);
    restoreFocus();
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setDeletingScenario(null);
    restoreFocus();
  };

  const handleCloseMergeModal = () => {
    setShowMergeModal(false);
    setMergingScenario(null);
    restoreFocus();
  };

  const handleCloseCompareModal = () => {
    setShowCompareModal(false);
    setComparingScenario(null);
    restoreFocus();
  };

  const renderListView = () => {
    if (!displayedScenarios || displayedScenarios.length === 0) {
      return <div className="no-scenarios">
        {hasActiveFilters ? t('scenarios:noScenariosMatchFilters') : t('scenarios:noScenariosFound')}
      </div>;
    }

    // Build hierarchical tree structure
    const buildScenarioTree = () => {
      const scenarioMap = new Map<string, ScenarioTreeNode>(
        displayedScenarios.map(s => [s.id, { ...s, children: [] as ScenarioTreeNode[] }])
      );
      const roots: ScenarioTreeNode[] = [];

      displayedScenarios.forEach(scenario => {
        const scenarioNode = scenarioMap.get(scenario.id)!;
        if (scenario.parent_scenario_id && scenarioMap.has(scenario.parent_scenario_id)) {
          const parent = scenarioMap.get(scenario.parent_scenario_id)!;
          parent.children.push(scenarioNode);
        } else {
          roots.push(scenarioNode);
        }
      });

      return roots;
    };

     
    const renderScenarioNode = (scenario: ScenarioTreeNode, level: number = 0, isLast: boolean = true, parentLines: boolean[] = []): React.ReactNode => {
      const indent = level * 24;
      const hasChildren = scenario.children && scenario.children.length > 0;
      const isExpanded = expandedNodes.has(scenario.id);
      const isFocused = focusedNodeId === scenario.id;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const isBaseline = scenario.scenario_type === 'baseline';
      
      return (
        <div key={scenario.id}>
          <div
            className={`hierarchy-row ${scenario.scenario_type} ${isFocused ? 'focused' : ''}`}
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-level={level + 1}
            aria-selected={isFocused}
            aria-label={hasChildren
              ? t('scenarios:hierarchy.nodeAriaLabelWithChildren', {
                  name: scenario.name,
                  type: scenarioTypeLabel(scenario.scenario_type),
                  status: scenarioStatusLabel(scenario.status),
                  count: scenario.children.length
                })
              : t('scenarios:hierarchy.nodeAriaLabel', {
                  name: scenario.name,
                  type: scenarioTypeLabel(scenario.scenario_type),
                  status: scenarioStatusLabel(scenario.status)
                })}
            tabIndex={isFocused ? 0 : -1}
            onFocus={() => setFocusedNodeId(scenario.id)}
            onClick={() => setFocusedNodeId(scenario.id)}
            onKeyDown={handleKeyDown}
          >
            {/* Name Column with Tree Structure */}
            <div className="hierarchy-cell name-column">
              <div className="hierarchy-indent" style={{ paddingLeft: `${indent}px` }}>
                <div className="hierarchy-lines">
                  {/* Draw parent connection lines */}
                  {parentLines.map((showLine, index) => (
                    <div
                      key={index}
                      className={`parent-line ${showLine ? 'visible' : ''}`}
                      style={{ left: `${index * 24 + 12}px` }}
                      aria-hidden="true"
                    />
                  ))}
                  
                  {/* Current level connector */}
                  {level > 0 && (
                    <>
                      <div 
                        className="branch-line horizontal" 
                        style={{ left: `${(level - 1) * 24 + 12}px` }}
                        aria-hidden="true"
                      />
                      <div 
                        className={`branch-line vertical ${isLast ? 'last' : ''}`}
                        style={{ left: `${(level - 1) * 24 + 12}px` }}
                        aria-hidden="true"
                      />
                    </>
                  )}
                  
                  {/* Node connector with expand/collapse button for nodes with children */}
                  <div className="node-connector" style={{ left: `${level * 24 + 12}px` }}>
                    {hasChildren ? (
                      <button
                        className={`connector-expand-button ${scenario.scenario_type}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedNodes(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(scenario.id)) {
                              newSet.delete(scenario.id);
                            } else {
                              newSet.add(scenario.id);
                            }
                            return newSet;
                          });
                        }}
                        aria-label={t(
                          isExpanded
                            ? 'scenarios:hierarchy.collapseAriaLabel'
                            : 'scenarios:hierarchy.expandAriaLabel',
                          { name: scenario.name }
                        )}
                        tabIndex={-1}
                      >
                        <ChevronDown 
                          size={12} 
                          className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <div className={`connector-dot ${scenario.scenario_type}`} aria-hidden="true"></div>
                    )}
                  </div>
                </div>
                
                <div className="hierarchy-content">
                  <div className="scenario-name-cell">
                    <GitBranch size={16} aria-hidden="true" />
                    <div className="scenario-info">
                      <div className="name">{scenario.name}</div>
                      {scenario.description && (
                        <div className="description">{scenario.description}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Type Column */}
            <div className="hierarchy-cell type-column">
              <span className={`scenario-type ${scenario.scenario_type}`}>
                {scenarioTypeLabel(scenario.scenario_type)}
              </span>
            </div>

            {/* Status Column */}
            <div className="hierarchy-cell status-column">
              <span className={`scenario-status ${scenario.status}`}>
                {scenarioStatusLabel(scenario.status)}
                {scenario.status === 'merged' && (
                  <span className="merge-indicator" title={t('scenarios:hierarchy.mergedIndicatorTitle')}>
                    ✅
                  </span>
                )}
                {scenario.status === 'active' && !scenario.parent_scenario_id && scenario.scenario_type === 'branch' && (
                  <span className="orphan-indicator" title={t('scenarios:hierarchy.orphanIndicatorTitle')}>
                    🔗❌
                  </span>
                )}
              </span>
            </div>

            {/* Created By Column */}
            <div className="hierarchy-cell created-by-column">
              <span className="created-by">{scenario.created_by_name}</span>
            </div>

            {/* Created Date Column */}
            <div className="hierarchy-cell created-date-column">
              <span className="created-date">{new Date(scenario.created_at).toLocaleDateString(getLocale())}</span>
            </div>

            {/* Actions Column */}
            <div className="hierarchy-cell actions-column">
              <div className="hierarchy-actions">
                <button
                  onClick={() => handleBranch(scenario)}
                  className="action-button branch"
                  title={t('scenarios:actions.createBranchTitle')}
                >
                  <GitBranch size={14} />
                </button>
                <button
                  onClick={(e) => handleCompare(scenario, e)}
                  className="action-button compare"
                  title={t('scenarios:actions.compareTitle')}
                >
                  <ArrowRightLeft size={14} />
                </button>
                {scenario.parent_scenario_id && scenario.status === 'active' ? (
                  <button
                    onClick={(e) => handleMerge(scenario, e)}
                    className="action-button merge"
                    title={t('scenarios:actions.mergeToTitle', { name: scenario.parent_scenario_name })}
                  >
                    <Merge size={14} />
                  </button>
                ) : (
                  <div
                    className="action-button merge disabled"
                    title={
                      scenario.status === 'merged'
                        ? t('scenarios:hierarchy.alreadyMergedTitle')
                        : scenario.status === 'archived'
                        ? t('scenarios:hierarchy.cannotMergeArchivedTitle')
                        : !scenario.parent_scenario_id && scenario.scenario_type === 'branch'
                        ? t('scenarios:hierarchy.cannotMergeNoParentTitle')
                        : scenario.scenario_type === 'baseline'
                        ? t('scenarios:hierarchy.cannotMergeBaselineTitle')
                        : t('scenarios:hierarchy.cannotMergeTitle')
                    }
                  >
                    <Merge size={14} />
                  </div>
                )}
                <button
                  onClick={(e) => handleEdit(scenario, e)}
                  className="action-button edit"
                  title={t('scenarios:actions.editTitle')}
                >
                  <Edit3 size={14} />
                </button>
                {scenario.scenario_type !== 'baseline' && (
                  <button
                    onClick={(e) => handleDelete(scenario, e)}
                    className="action-button delete"
                    title={t('scenarios:actions.deleteTitle')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Render children with proper accessibility */}
          {hasChildren && isExpanded && (
            <div role="group" aria-label={t('scenarios:hierarchy.childScenariosOf', { name: scenario.name })}>
              {scenario.children.map((child: ScenarioTreeNode, index: number) => {
                const isLastChild = index === scenario.children.length - 1;
                const newParentLines = [...parentLines, !isLastChild];
                return renderScenarioNode(child, level + 1, isLastChild, newParentLines);
              })}
            </div>
          )}
        </div>
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const scenarioTree = buildScenarioTree();

    return (
      <div className="scenarios-hierarchy">
        <div className="hierarchy-header">
          <div className="hierarchy-title">{t('scenarios:hierarchy.title')}</div>
          <div className="hierarchy-legend">
            <div className="legend-item">
              <div className="legend-dot baseline"></div>
              <span>{scenarioTypeLabel('baseline')}</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot branch"></div>
              <span>{scenarioTypeLabel('branch')}</span>
            </div>
            <div className="legend-item">
              <div className="legend-dot sandbox"></div>
              <span>{scenarioTypeLabel('sandbox')}</span>
            </div>
          </div>
        </div>

        {/* Column Headers */}
        <div className="hierarchy-column-headers">
          <div className="column-header name-column">{t('common:name')}</div>
          <div className="column-header type-column">{t('scenarios:hierarchy.typeColumn')}</div>
          <div className="column-header status-column">{t('common:status')}</div>
          <div className="column-header created-by-column">{t('scenarios:hierarchy.createdByColumn')}</div>
          <div className="column-header created-date-column">{t('common:created')}</div>
          <div className="column-header actions-column">{t('common:actions')}</div>
        </div>

        <div
          className="hierarchy-content"
          role="tree"
          aria-label={t('scenarios:hierarchy.treeAriaLabel')}
          aria-describedby="tree-instructions"
          ref={treeRef}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <div id="tree-instructions" className="sr-only">
            {t('scenarios:hierarchy.instructions')}
          </div>
          {treeNodes.map((rootScenario, index) =>
            renderScenarioNode(rootScenario, 0, index === treeNodes.length - 1, [])
          )}
        </div>
      </div>
    );
  };


  if (isLoading) {
    return (
      <div className="scenarios-page">
        <div className="page-loading">{t('common:loadingScenarios')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="scenarios-page">
        <div className="page-error">
          <AlertTriangle size={24} />
          <h3>{t('scenarios:loadFailedTitle')}</h3>
          <p>{t('scenarios:loadFailedDetail')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scenarios-page">
      <div className="page-header">
        <div className="header-content">
          <h1>{t('scenarios:title')}</h1>
          <p>{t('scenarios:subtitle')}</p>
        </div>
        <button onClick={(e) => handleCreateNew(e)} className="btn-primary">
          <Plus size={16} />
          {t('scenarios:newScenario')}
        </button>
      </div>

      <div className="view-controls">
        <div className="search-and-filters">
          <div className="search-input">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder={t('scenarios:searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-dropdown" ref={filterDropdownRef}>
            <button
              className={`filter-button ${hasActiveFilters ? 'active' : ''}`}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <Filter size={16} />
              {t('common:filters')}
              <ChevronDown size={14} />
            </button>

            {showFilterDropdown && (
              <div className="filter-dropdown-content">
                <div className="filter-section">
                  <div className="filter-section-title">{t('scenarios:filters.type')}</div>
                  {filterOptions.types.map(type => (
                    <div key={type} className="filter-option">
                      <input
                        type="checkbox"
                        checked={activeFilters.types.includes(type)}
                        onChange={() => toggleFilter('types', type)}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{scenarioTypeLabel(type)}</span>
                    </div>
                  ))}
                </div>

                <div className="filter-section">
                  <div className="filter-section-title">{t('common:status')}</div>
                  {filterOptions.statuses.map(status => (
                    <div key={status} className="filter-option">
                      <input
                        type="checkbox"
                        checked={activeFilters.statuses.includes(status)}
                        onChange={() => toggleFilter('statuses', status)}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{scenarioStatusLabel(status)}</span>
                    </div>
                  ))}
                </div>

                <div className="filter-section">
                  <div className="filter-section-title">{t('scenarios:filters.creator')}</div>
                  {filterOptions.creators.map(creator => (
                    <div key={creator} className="filter-option">
                      <input
                        type="checkbox"
                        checked={activeFilters.creators.includes(creator)}
                        onChange={() => toggleFilter('creators', creator)}
                      />
                      <span>{creator}</span>
                    </div>
                  ))}
                </div>

                {hasActiveFilters && (
                  <div className="filter-actions">
                    <button
                      onClick={clearAllFilters}
                      className="btn btn-sm btn-secondary"
                    >
                      {t('scenarios:filters.clearAll')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <div className="active-filters">
              {activeFilters.types.map(type => (
                <div key={`type-${type}`} className="filter-tag">
                  <span>{t('scenarios:filters.typeTag', { value: scenarioTypeLabel(type) })}</span>
                  <button onClick={() => removeFilter('types', type)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {activeFilters.statuses.map(status => (
                <div key={`status-${status}`} className="filter-tag">
                  <span>{t('scenarios:filters.statusTag', { value: scenarioStatusLabel(status) })}</span>
                  <button onClick={() => removeFilter('statuses', status)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {activeFilters.creators.map(creator => (
                <div key={`creator-${creator}`} className="filter-tag">
                  <span>{t('scenarios:filters.creatorTag', { value: creator })}</span>
                  <button onClick={() => removeFilter('creators', creator)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="view-controls">
          <div className="quick-filters">
            <button
              className={`quick-filter-btn ${hideMergedScenarios ? 'active' : ''}`}
              onClick={() => setHideMergedScenarios(!hideMergedScenarios)}
              title={hideMergedScenarios ? t('scenarios:filters.showMergedTitle') : t('scenarios:filters.hideMergedTitle')}
            >
              {hideMergedScenarios ? t('scenarios:filters.showMerged') : t('scenarios:filters.hideMerged')}
            </button>
          </div>

          <div className="view-info">
            <span className="view-label">
              <List size={14} />
              {t('scenarios:listView')}
            </span>
          </div>
        </div>
      </div>

      <div className="scenarios-content">
        {renderListView()}
      </div>

      <CreateScenarioModal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
        parentScenario={selectedParentScenario}
      />
      
      {editingScenario && (
        <EditScenarioModal
          isOpen={showEditModal}
          onClose={handleCloseEditModal}
          scenario={editingScenario}
        />
      )}
      
      {deletingScenario && (
        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          onClose={handleCloseDeleteModal}
          scenario={deletingScenario}
          onConfirm={() => {
            deleteMutation.mutate(deletingScenario.id);
          }}
        />
      )}
      
      {mergingScenario && (
        <MergeModal
          isOpen={showMergeModal}
          onClose={handleCloseMergeModal}
          scenario={mergingScenario}
        />
      )}
      
      {comparingScenario && scenarios && (
        <CompareModal
          isOpen={showCompareModal}
          onClose={handleCloseCompareModal}
          scenario={comparingScenario}
          scenarios={scenarios}
        />
      )}
    </div>
  );
};