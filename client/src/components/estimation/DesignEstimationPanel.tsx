import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Calculator, Save, Gauge, ClipboardCheck } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { formatDate } from '../../utils/date';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { SideCheckRow, VERDICT_VARIANT } from './EstimationPanel';
import type { EstimationSideCheck } from '../../types';

/**
 * DesignEstimationPanel — 设计侧粗估 (设计阶段: LOC 不存在, 按人月粗估).
 *
 * 与 LOC 面板同一套模式: 追加式历史 + 实时预览区间 + 设计侧死线校验
 * (死线默认取项目 设计 阶段结束日) + 完工回填算偏差%.
 */

interface DesignFormState {
  estimated_design_pm: string;
  deviation_low_pct: string;
  deviation_high_pct: string;
  notes: string;
}

const EMPTY_FORM: DesignFormState = {
  estimated_design_pm: '',
  deviation_low_pct: '20',
  deviation_high_pct: '50',
  notes: ''
};

interface DesignCheckResult {
  window: { start: string; deadline: string; months: number };
  design: EstimationSideCheck;
  overall: { verdict: 'feasible' | 'tight' | 'infeasible' };
  assumptions: { deviation_low_pct: number; deviation_high_pct: number; capacity_note: string };
}

export function DesignEstimationPanel({
  projectId,
  designDeadline
}: {
  projectId: string;
  designDeadline: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: estimationData, isLoading } = useQuery({
    queryKey: queryKeys.projects.designEstimation(projectId),
    queryFn: async () => {
      const response = await api.designEstimations.listByProject(projectId);
      return response.data;
    }
  });

  const estimations: any[] = estimationData?.data ?? [];
  const current = estimations.find((e) => e.is_current);

  const [form, setForm] = useState<DesignFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<DesignCheckResult | null>(null);
  const [backfillForm, setBackfillForm] = useState({ actual_design_pm: '' });
  const [deviation, setDeviation] = useState<number | null>(null);

  const preview = useMemo(() => {
    const pm = Number(form.estimated_design_pm) || 0;
    const lowFactor = 1 - (Number(form.deviation_low_pct) || 0) / 100;
    const highFactor = 1 + (Number(form.deviation_high_pct) || 0) / 100;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return { low: r1(pm * lowFactor), mid: r1(pm), high: r1(pm * highFactor) };
  }, [form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.designEstimation(projectId) });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await api.designEstimations.create(projectId, {
        estimated_design_pm: Number(form.estimated_design_pm),
        deviation_low_pct: Number(form.deviation_low_pct) || 20,
        deviation_high_pct: Number(form.deviation_high_pct) || 50,
        notes: form.notes || null
      });
      return response.data;
    },
    onSuccess: () => {
      setFormError(null);
      setCheckResult(null);
      setDeviation(null);
      invalidate();
    },
    onError: (error: any) => setFormError(error?.response?.data?.message || error.message)
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error(t('projects:estimation.checkNeedSave'));
      const response = await api.designEstimations.check(current.id, {});
      return response.data;
    },
    onSuccess: (data) => setCheckResult(data.data ?? (data as any)),
    onError: (error: any) => setFormError(error?.response?.data?.message || error.message)
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      if (!current) return null;
      const response = await api.designEstimations.backfill(current.id, {
        actual_design_pm: backfillForm.actual_design_pm === '' ? null : Number(backfillForm.actual_design_pm)
      });
      return response.data;
    },
    onSuccess: (data: any) => {
      setDeviation(data?.deviation?.design_pm ?? null);
      invalidate();
    },
    onError: (error: any) => setFormError(error?.response?.data?.message || error.message)
  });

  const set = (field: keyof DesignFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (isLoading) {
    return <p className="text-muted">{t('common:loading')}</p>;
  }

  return (
    <div className="estimation-panel">
      {current ? (
        <div className="estimation-current">
          <div className="estimation-current-header">
            <Calculator size={16} />
            <strong>{t('projects:designEstimation.currentEstimate')}</strong>
            <span className="text-muted">
              {current.estimated_design_pm} {t('projects:designEstimation.pmUnit')} · {formatDate(current.created_at)}
            </span>
            {current.backfilled_at && <Badge variant="secondary">{t('projects:estimation.backfilled')}</Badge>}
          </div>
          {current.notes && <p className="estimation-notes">{current.notes}</p>}
        </div>
      ) : (
        <p className="text-muted">{t('projects:designEstimation.noEstimate')}</p>
      )}

      <div className="estimation-form">
        <div className="estimation-form-grid">
          <div className="form-group">
            <Label htmlFor="de-pm">{t('projects:designEstimation.estimatedPm')}</Label>
            <Input id="de-pm" type="number" min="0.5" step="0.5" value={form.estimated_design_pm}
                   onChange={set('estimated_design_pm')} placeholder={t('projects:designEstimation.pmHint')} />
          </div>
          <div className="form-group">
            <Label htmlFor="de-low">{t('projects:estimation.deviationLow')}</Label>
            <Input id="de-low" type="number" min="0" max="99" value={form.deviation_low_pct} onChange={set('deviation_low_pct')} />
          </div>
          <div className="form-group">
            <Label htmlFor="de-high">{t('projects:estimation.deviationHigh')}</Label>
            <Input id="de-high" type="number" min="0" max="300" value={form.deviation_high_pct} onChange={set('deviation_high_pct')} />
          </div>
        </div>
        <div className="form-group">
          <Label htmlFor="de-notes">{t('projects:estimation.reviewNotes')}</Label>
          <Textarea id="de-notes" rows={2} value={form.notes} onChange={set('notes')} />
        </div>

        {form.estimated_design_pm !== '' && (
          <div className="estimation-preview">
            <Gauge size={16} />
            <span>{t('projects:estimation.preview')}:</span>
            <span>
              {t('projects:designEstimation.designDemand')} <strong>{preview.low} ~ {preview.high}</strong> {t('projects:designEstimation.pmUnit')}
            </span>
          </div>
        )}

        {formError && <p className="text-danger">{formError}</p>}

        <div className="estimation-actions">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || form.estimated_design_pm === ''}>
            <Save size={16} />
            {saveMutation.isPending ? t('projects:estimation.saving') : t('projects:estimation.save')}
          </Button>
          <Button
            variant="outline"
            onClick={() => checkMutation.mutate()}
            disabled={!current || checkMutation.isPending}
            title={designDeadline ? t('projects:designEstimation.deadlineFrom', { date: designDeadline.slice(0, 10) }) : t('projects:designEstimation.noPhaseDeadline')}
          >
            <Gauge size={16} />
            {checkMutation.isPending ? t('projects:estimation.checking') : t('projects:designEstimation.checkDeadline')}
          </Button>
        </div>
      </div>

      {checkResult && (
        <div className="estimation-check-result">
          <div className="estimation-check-header">
            <strong>{t('projects:estimation.checkResult')}</strong>
            <span className="text-muted">
              {checkResult.window.start} → {checkResult.window.deadline}（{checkResult.window.months} {t('projects:estimation.months')}）
            </span>
            <Badge variant={VERDICT_VARIANT[checkResult.overall.verdict]}>
              {t('projects:estimation.overall')}: {t(`projects:estimation.verdict.${checkResult.overall.verdict}`)}
            </Badge>
          </div>
          <table className="table estimation-check-table">
            <thead>
              <tr>
                <th>{t('projects:estimation.side')}</th>
                <th>{t('projects:estimation.demand')}</th>
                <th>{t('projects:estimation.supply')}</th>
                <th>{t('projects:estimation.gapSlack')}</th>
                <th>{t('projects:estimation.verdictLabel')}</th>
              </tr>
            </thead>
            <tbody>
              <SideCheckRow side={checkResult.design} data={checkResult.design} />
            </tbody>
          </table>
          <p className="text-muted estimation-assumptions">
            {t('projects:designEstimation.capacityNote')}
          </p>
        </div>
      )}

      {current && !current.backfilled_at && (
        <div className="estimation-backfill">
          <div className="estimation-current-header">
            <ClipboardCheck size={16} />
            <strong>{t('projects:designEstimation.backfill')}</strong>
          </div>
          <div className="estimation-form-grid">
            <div className="form-group">
              <Label htmlFor="de-bf-pm">{t('projects:designEstimation.actualPm')}</Label>
              <Input id="de-bf-pm" type="number" min="0" step="0.5" value={backfillForm.actual_design_pm}
                     onChange={(e) => setBackfillForm({ actual_design_pm: e.target.value })} />
            </div>
          </div>
          <Button variant="outline" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
            {t('projects:estimation.backfillSave')}
          </Button>
        </div>
      )}

      {deviation != null && (
        <div className="estimation-deviation">
          <strong>{t('projects:estimation.deviation')}:</strong>
          <span>{t('projects:designEstimation.designPm')} {deviation > 0 ? '+' : ''}{deviation}%</span>
        </div>
      )}

      {estimations.length > 1 && (
        <div className="estimation-history">
          <strong>{t('projects:estimation.history')}</strong>
          <table className="table">
            <thead>
              <tr>
                <th>{t('common:date')}</th>
                <th>{t('projects:designEstimation.estimatedPm')}</th>
                <th>{t('projects:estimation.status')}</th>
              </tr>
            </thead>
            <tbody>
              {estimations.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.created_at)}</td>
                  <td>{e.estimated_design_pm}</td>
                  <td>{e.backfilled_at ? t('projects:estimation.backfilled') : e.is_current ? t('projects:estimation.currentBadge') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
