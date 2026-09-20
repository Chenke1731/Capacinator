import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge, AlertTriangle, CheckCircle, ArrowRight, RefreshCw, Eye } from 'lucide-react';
import { api } from '../../lib/api-client';
import { Scenario } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import './ScenarioMergeModal.css';

interface MergeConflict {
  type: string;
  entity_id: string;
  conflict_description: string;
  source_data: any;
  target_data: any;
}

interface MergeResponse {
  success: boolean;
  message: string;
  conflicts?: number;
  conflict_details?: MergeConflict[];
}

interface ScenarioMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: Scenario;
  onMergeComplete: () => void;
}

export const ScenarioMergeModal: React.FC<ScenarioMergeModalProps> = ({
  isOpen,
  onClose,
  scenario,
  onMergeComplete
}) => {
  const { t } = useTranslation();
  const [mergeStrategy, setMergeStrategy] = useState<'manual' | 'use_source' | 'use_target'>('manual');
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, any>>({});
  const [currentStep, setCurrentStep] = useState<'setup' | 'conflicts' | 'preview' | 'executing' | 'complete'>('setup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeResult, setMergeResult] = useState<any>(null);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMergeStrategy('manual');
      setConflicts([]);
      setConflictResolutions({});
      setCurrentStep('setup');
      setLoading(false);
      setError(null);
      setMergeResult(null);
      setCurrentConflictIndex(0);
    }
  }, [isOpen]);

  const initiateMerge = async () => {
    if (!scenario.parent_scenario_id) {
      setError(t('scenarios:merge.noParentError'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post(`/scenarios/${scenario.id}/merge`, {
        resolve_conflicts_as: mergeStrategy
      });

      const mergeResponse: MergeResponse = response.data;

      if (!mergeResponse.success && mergeResponse.conflict_details) {
        // Conflicts detected, need manual resolution
        setConflicts(mergeResponse.conflict_details);
        setCurrentStep('conflicts');
      } else if (mergeResponse.success) {
        // Merge completed successfully
        setMergeResult(mergeResponse);
        setCurrentStep('complete');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || t('scenarios:merge.initiateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const resolveConflict = (conflictId: string, resolution: 'source' | 'target' | 'custom', customData?: any) => {
    const conflict = conflicts.find(c => c.entity_id === conflictId);
    if (!conflict) return;

    let resolvedData;
    if (resolution === 'source') {
      resolvedData = conflict.source_data;
    } else if (resolution === 'target') {
      resolvedData = conflict.target_data;
    } else {
      resolvedData = customData;
    }

    setConflictResolutions({
      ...conflictResolutions,
      [conflictId]: {
        resolution,
        data: resolvedData
      }
    });
  };

  const proceedToPreview = () => {
    setCurrentStep('preview');
  };

  const executeMerge = async () => {
    setCurrentStep('executing');
    setLoading(true);

    try {
      // Submit conflict resolutions and execute merge
      const response = await api.post(`/scenarios/${scenario.id}/merge`, {
        resolve_conflicts_as: 'resolved',
        conflict_resolutions: conflictResolutions
      });

      setMergeResult(response.data);
      setCurrentStep('complete');
      
      // Notify parent component
      onMergeComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || t('scenarios:merge.executeFailed'));
      setCurrentStep('conflicts');
    } finally {
      setLoading(false);
    }
  };

  const renderSetupStep = () => (
    <div className="p-6">
      <div className="mb-8">
        <h3 className="flex items-center gap-2 text-2xl font-semibold text-foreground mb-3">
          <GitMerge size={20} />
          {t('scenarios:merge.scenarioName')}: {scenario.name}
        </h3>
        <p className="text-base text-muted-foreground leading-relaxed">
          {t('scenarios:merge.setupDescription', { name: scenario.name })}
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-base font-semibold" id="merge-strategy-label">{t('scenarios:merge.strategy')}</Label>
        <RadioGroup value={mergeStrategy} onValueChange={(value) => setMergeStrategy(value as any)} aria-labelledby="merge-strategy-label">
          <div className="space-y-3">
            <Label
              htmlFor="strategy-manual"
              className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                mergeStrategy === 'manual'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value="manual" id="strategy-manual" className="mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-foreground">{t('scenarios:merge.manualResolution')}</span>
                <span className="text-sm text-muted-foreground">{t('scenarios:merge.manualResolutionDescription')}</span>
              </div>
            </Label>

            <Label
              htmlFor="strategy-source"
              className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                mergeStrategy === 'use_source'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value="use_source" id="strategy-source" className="mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-foreground">{t('scenarios:merge.sourcePriority')}</span>
                <span className="text-sm text-muted-foreground">{t('scenarios:merge.sourcePriorityDescription')}</span>
              </div>
            </Label>

            <Label
              htmlFor="strategy-target"
              className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                mergeStrategy === 'use_target'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value="use_target" id="strategy-target" className="mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-foreground">{t('scenarios:merge.targetPriority')}</span>
                <span className="text-sm text-muted-foreground">{t('scenarios:merge.targetPriorityDescription')}</span>
              </div>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="flex justify-between gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button onClick={initiateMerge} disabled={loading}>
          {loading ? t('scenarios:merge.analyzing') : t('scenarios:merge.analyzeConflicts')}
        </Button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
    </div>
  );

  const renderConflictsStep = () => {
    const currentConflict = conflicts[currentConflictIndex];
    const resolvedCount = Object.keys(conflictResolutions).length;
    const canProceed = resolvedCount === conflicts.length;

    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6 pb-4 border-b">
          <h3 className="flex items-center gap-2 text-xl font-semibold text-destructive m-0">
            <AlertTriangle size={20} />
            {t('scenarios:merge.resolveConflicts')} ({resolvedCount}/{conflicts.length})
          </h3>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentConflictIndex(Math.max(0, currentConflictIndex - 1))}
              disabled={currentConflictIndex === 0}
            >
              {t('common:previous')}
            </Button>
            <span className="text-sm text-muted-foreground font-medium px-2">
              {t('scenarios:merge.conflictOf', { current: currentConflictIndex + 1, total: conflicts.length })}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentConflictIndex(Math.min(conflicts.length - 1, currentConflictIndex + 1))}
              disabled={currentConflictIndex === conflicts.length - 1}
            >
              {t('common:next')}
            </Button>
          </div>
        </div>

        {currentConflict && (
          <div className="bg-muted border rounded-lg p-5 mb-6">
            <div className="mb-5">
              <h4 className="text-lg font-semibold text-foreground mb-2">
                {t('scenarios:merge.conflict')}: {currentConflict.type.replace('_', ' ').toUpperCase()}
              </h4>
              <p className="text-muted-foreground mb-2">{currentConflict.conflict_description}</p>
              <div className="text-xs text-muted-foreground font-mono">
                {t('scenarios:merge.entityId')}: {currentConflict.entity_id}
              </div>
            </div>

            <div className="flex gap-6 mb-5">
              <div className="flex-1 bg-background border rounded-md p-4">
                <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('scenarios:merge.sourceThisScenario')}
                </h5>
                <div className="bg-muted/50 border rounded p-3 mb-3 min-h-[100px]">
                  {renderConflictData(currentConflict.source_data)}
                </div>
                <Button
                  variant={conflictResolutions[currentConflict.entity_id]?.resolution === 'source' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => resolveConflict(currentConflict.entity_id, 'source')}
                >
                  {t('scenarios:merge.useSource')}
                </Button>
              </div>

              <div className="flex items-center justify-center text-muted-foreground">
                <ArrowRight size={20} />
              </div>

              <div className="flex-1 bg-background border rounded-md p-4">
                <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('scenarios:merge.targetParentScenario')}
                </h5>
                <div className="bg-muted/50 border rounded p-3 mb-3 min-h-[100px]">
                  {renderConflictData(currentConflict.target_data)}
                </div>
                <Button
                  variant={conflictResolutions[currentConflict.entity_id]?.resolution === 'target' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => resolveConflict(currentConflict.entity_id, 'target')}
                >
                  {t('scenarios:merge.useTarget')}
                </Button>
              </div>
            </div>

            {conflictResolutions[currentConflict.entity_id] && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-950/50 p-2 rounded">
                <CheckCircle size={16} />
                {conflictResolutions[currentConflict.entity_id].resolution === 'target'
                  ? t('scenarios:merge.resolvedUsingTarget')
                  : t('scenarios:merge.resolvedUsingSource')}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between gap-3 mt-6">
          <Button variant="outline" onClick={() => setCurrentStep('setup')}>
            {t('scenarios:merge.backToSetup')}
          </Button>
          <Button onClick={proceedToPreview} disabled={!canProceed}>
            {canProceed ? t('scenarios:merge.previewMerge') : t('scenarios:merge.resolveMore', { count: conflicts.length - resolvedCount })}
          </Button>
        </div>
      </div>
    );
  };

  const renderPreviewStep = () => (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground mb-2">
          <Eye size={20} />
          {t('scenarios:merge.preview')}
        </h3>
        <p className="text-muted-foreground">{t('scenarios:merge.previewDescription')}</p>
      </div>

      <div className="flex flex-col gap-6 mb-8">
        <div className="bg-muted border rounded-lg p-5">
          <h4 className="text-base font-semibold text-muted-foreground mb-4">
            {t('scenarios:merge.conflictResolutions')} ({Object.keys(conflictResolutions).length})
          </h4>
          <div className="flex flex-col gap-2">
            {Object.entries(conflictResolutions).map(([entityId, resolution]) => (
              <div key={entityId} className="flex justify-between items-center p-2 bg-background border rounded">
                <div className="font-mono text-xs text-muted-foreground">{entityId}</div>
                <div className="text-green-600 dark:text-green-400 font-medium text-sm">
                  {resolution.resolution === 'target'
                    ? t('scenarios:merge.usingTargetData')
                    : t('scenarios:merge.usingSourceData')}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted border rounded-lg p-5">
          <h4 className="text-base font-semibold text-muted-foreground mb-4">{t('scenarios:merge.impactSummary')}</h4>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-muted-foreground font-medium">{t('scenarios:merge.assignmentsAffected')}</span>
              <span className="text-foreground font-semibold font-mono">
                {conflicts.filter(c => c.type === 'assignment').length}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-muted-foreground font-medium">{t('scenarios:merge.phaseTimelinesAffected')}</span>
              <span className="text-foreground font-semibold font-mono">
                {conflicts.filter(c => c.type === 'phase_timeline').length}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-muted-foreground font-medium">{t('scenarios:merge.projectDetailsAffected')}</span>
              <span className="text-foreground font-semibold font-mono">
                {conflicts.filter(c => c.type === 'project_details').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-3 mt-6">
        <Button variant="outline" onClick={() => setCurrentStep('conflicts')}>
          {t('scenarios:merge.backToConflicts')}
        </Button>
        <Button variant="destructive" onClick={executeMerge} disabled={loading}>
          {loading ? t('scenarios:merge.executing') : t('scenarios:merge.executeMerge')}
        </Button>
      </div>
    </div>
  );

  const renderExecutingStep = () => (
    <div className="py-16 px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <RefreshCw size={48} className="animate-spin text-primary" />
        <h3 className="text-2xl font-semibold text-foreground">{t('scenarios:merge.executingTitle')}</h3>
        <p className="text-base text-muted-foreground">{t('scenarios:merge.executingDescription')}</p>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="py-10 px-6 text-center">
      <div className="mb-8">
        <CheckCircle size={48} className="text-green-600 dark:text-green-400 mb-4 inline-block" />
        <h3 className="text-2xl font-semibold text-foreground mb-2">{t('scenarios:merge.completedTitle')}</h3>
        <p className="text-base text-muted-foreground">{t('scenarios:merge.completedDescription')}</p>
      </div>

      {mergeResult && (
        <div className="bg-primary/10 border border-primary rounded-lg p-5 mb-8 text-left">
          <h4 className="text-base font-semibold text-primary mb-4">{t('scenarios:merge.summary')}</h4>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-primary font-medium">{t('scenarios:sourceScenario')}:</span>
              <span className="text-primary font-semibold">{scenario.name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-primary font-medium">{t('scenarios:merge.conflictsResolved')}</span>
              <span className="text-primary font-semibold">{Object.keys(conflictResolutions).length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b last:border-b-0">
              <span className="text-primary font-medium">{t('common:status')}:</span>
              <span className="text-green-600 dark:text-green-400 font-semibold">{t('scenarios:merge.mergedSuccessfully')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center mt-6">
        <Button onClick={onClose}>
          {t('common:close')}
        </Button>
      </div>
    </div>
  );

  const renderConflictData = (data: any) => {
    if (!data) return <div className="text-muted-foreground italic text-center py-5">{t('scenarios:merge.noData')}</div>;

    return (
      <div className="flex flex-col gap-1.5">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-[13px]">
            <span className="text-muted-foreground font-medium min-w-[120px]">{key}:</span>
            <span className="text-foreground font-mono">{String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const handleClose = () => {
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="scenario-merge-modal max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge size={20} aria-hidden="true" />
            {t('scenarios:merge.title')}
          </DialogTitle>
          <DialogDescription>
            {t('scenarios:merge.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="modal-body">
          {currentStep === 'setup' && renderSetupStep()}
          {currentStep === 'conflicts' && renderConflictsStep()}
          {currentStep === 'preview' && renderPreviewStep()}
          {currentStep === 'executing' && renderExecutingStep()}
          {currentStep === 'complete' && renderCompleteStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { ScenarioMergeModal };