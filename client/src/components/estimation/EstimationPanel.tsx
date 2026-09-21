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
import type {
  ProjectEstimation,
  EstimationCheckResponse,
  EstimationDeviation,
  EstimationSideCheck
} from '../../types';
import { DesignEstimationPanel } from './DesignEstimationPanel';

interface EstimationFormState {
  estimated_loc: string;
  loc_rate_per_pm: string;
  design_share_pct: string;
  deviation_low_pct: string;
  deviation_high_pct: string;
  expected_delivery_date: string;
  review_notes: string;
}

const EMPTY_FORM: EstimationFormState = {
  estimated_loc: '',
  loc_rate_per_pm: '500',
  design_share_pct: '15',
  deviation_low_pct: '20',
  deviation_high_pct: '50',
  expected_delivery_date: '',
  review_notes: ''
};

/** Client-side mirror of the server conversion formula (display preview only). */
function computePreview(form: EstimationFormState) {
  const loc = Number(form.estimated_loc) || 0;
  const rate = Number(form.loc_rate_per_pm) || 500;
  const share = Number(form.design_share_pct) || 0;
  const lowFactor = 1 - (Number(form.deviation_low_pct) || 0) / 100;
  const highFactor = 1 + (Number(form.deviation_high_pct) || 0) / 100;
  const mid = rate > 0 ? loc / rate : 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    total: { low: r1(mid * lowFactor), mid: r1(mid), high: r1(mid * highFactor) },
    design: { low: r1(mid * lowFactor * share / 100), mid: r1(mid * share / 100), high: r1(mid * highFactor * share / 100) },
    dev: { low: r1(mid * lowFactor * (1 - share / 100)), mid: r1(mid * (1 - share / 100)), high: r1(mid * highFactor * (1 - share / 100)) }
  };
}

export const VERDICT_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  feasible: 'secondary',
  tight: 'outline',
  infeasible: 'destructive'
};

export function SideCheckRow({ side, data }: { side: EstimationSideCheck; data: EstimationSideCheck }) {
  const { t } = useTranslation();
  const sideLabel = side.side === 'design' ? t('projects:estimation.designSide') : t('projects:estimation.devSide');
  return (
    <tr>
      <td>{sideLabel}<span className="text-muted"> ({data.teamSize}{t('projects:estimation.personCount')})</span></td>
      <td>{data.demand.low} ~ {data.demand.high}</td>
      <td>{data.supplyPm}</td>
      <td>
        {data.gapPm > 0 ? `-${data.gapPm}` : data.slackPm > 0 ? `+${data.slackPm}` : '—'}
      </td>
      <td><Badge variant={VERDICT_VARIANT[data.verdict]}>{t(`projects:estimation.verdict.${data.verdict}`)}</Badge></td>
    </tr>
  );
}

/**
 * State-aware estimation surface: while the item sits on the design side of
 * the lifecycle (待RAT/NOK/设计中) there is no LOC yet — the rough design
 * person-month form is shown. After admit (and for items without a
 * lifecycle) the LOC panel stays in charge. No tabs to mis-click.
 */
const DESIGN_SIDE_STATES = ['pending_rat', 'nok', 'designing'];

export function EstimationPanel({
  projectId,
  lifecycleState = null,
  designDeadline = null
}: {
  projectId: string;
  lifecycleState?: string | null;
  designDeadline?: string | null;
}) {
  if (lifecycleState && DESIGN_SIDE_STATES.includes(lifecycleState)) {
    return <DesignEstimationPanel projectId={projectId} designDeadline={designDeadline} />;
  }

  return <LocEstimationPanel projectId={projectId} />;
}

function LocEstimationPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: estimationData, isLoading } = useQuery({
    queryKey: queryKeys.projects.estimation(projectId),
    queryFn: async () => {
      const response = await api.estimations.listByProject(projectId);
      return response.data;
    }
  });

  const estimations: ProjectEstimation[] = estimationData?.data ?? [];
  const current = estimations.find((e) => e.is_current);

  const [form, setForm] = useState<EstimationFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<EstimationCheckResponse | null>(null);
  const [backfillForm, setBackfillForm] = useState({ actual_loc: '', actual_design_pm: '', actual_dev_pm: '', actual_delivery_date: '' });
  const [deviation, setDeviation] = useState<EstimationDeviation | null>(null);

  const preview = useMemo(() => computePreview(form), [form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.estimation(projectId) });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        estimated_loc: Number(form.estimated_loc),
        loc_rate_per_pm: Number(form.loc_rate_per_pm) || 500,
        design_share_pct: Number(form.design_share_pct) || 15,
        deviation_low_pct: Number(form.deviation_low_pct) || 20,
        deviation_high_pct: Number(form.deviation_high_pct) || 50,
        expected_delivery_date: form.expected_delivery_date || null,
        review_notes: form.review_notes || null
      };
      const response = await api.estimations.create(projectId, payload);
      return response.data;
    },
    onSuccess: () => {
      setFormError(null);
      setCheckResult(null);
      setDeviation(null);
      invalidate();
    },
    onError: (error: any) => {
      setFormError(error?.response?.data?.message || error.message);
    }
  });

  const checkMutation = useMutation({
    mutationFn: async (deadline?: string) => {
      if (!current) throw new Error(t('projects:estimation.checkNeedSave'));
      const response = await api.estimations.check(current.id, deadline ? { deadline } : {});
      return response.data;
    },
    onSuccess: (data) => setCheckResult(data.data ?? (data as any)),
    onError: (error: any) => setFormError(error?.response?.data?.message || error.message)
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      if (!current) return null;
      const response = await api.estimations.backfill(current.id, {
        actual_loc: backfillForm.actual_loc === '' ? null : Number(backfillForm.actual_loc),
        actual_design_pm: backfillForm.actual_design_pm === '' ? null : Number(backfillForm.actual_design_pm),
        actual_dev_pm: backfillForm.actual_dev_pm === '' ? null : Number(backfillForm.actual_dev_pm),
        actual_delivery_date: backfillForm.actual_delivery_date || null
      });
      return response.data;
    },
    onSuccess: (data: any) => {
      setDeviation(data?.deviation ?? null);
      invalidate();
    },
    onError: (error: any) => setFormError(error?.response?.data?.message || error.message)
  });

  const set = (field: keyof EstimationFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (isLoading) {
    return <p className="text-muted">{t('common:loading')}</p>;
  }

  return (
    <div className="estimation-panel">
      {/* Current estimate summary */}
      {current ? (
        <div className="estimation-current">
          <div className="estimation-current-header">
            <Calculator size={16} />
            <strong>{t('projects:estimation.currentEstimate')}</strong>
            <span className="text-muted">
              {current.estimated_loc.toLocaleString()} {t('projects:estimation.locUnit')} · {formatDate(current.created_at)}
            </span>
            {current.backfilled_at && <Badge variant="secondary">{t('projects:estimation.backfilled')}</Badge>}
          </div>
          {current.review_notes && <p className="estimation-notes">{current.review_notes}</p>}
        </div>
      ) : (
        <p className="text-muted">{t('projects:estimation.noEstimate')}</p>
      )}

      {/* Input form */}
      <div className="estimation-form">
        <div className="estimation-form-grid">
          <div className="form-group">
            <Label htmlFor="est-loc">{t('projects:estimation.estimatedLoc')}</Label>
            <Input id="est-loc" type="number" min="1" value={form.estimated_loc} onChange={set('estimated_loc')} placeholder={t('projects:estimation.locHint')} />
          </div>
          <div className="form-group">
            <Label htmlFor="est-rate">{t('projects:estimation.locRate')}</Label>
            <Input id="est-rate" type="number" min="1" value={form.loc_rate_per_pm} onChange={set('loc_rate_per_pm')} />
          </div>
          <div className="form-group">
            <Label htmlFor="est-share">{t('projects:estimation.designShare')}</Label>
            <Input id="est-share" type="number" min="0" max="100" value={form.design_share_pct} onChange={set('design_share_pct')} />
          </div>
          <div className="form-group">
            <Label htmlFor="est-low">{t('projects:estimation.deviationLow')}</Label>
            <Input id="est-low" type="number" min="0" max="99" value={form.deviation_low_pct} onChange={set('deviation_low_pct')} />
          </div>
          <div className="form-group">
            <Label htmlFor="est-high">{t('projects:estimation.deviationHigh')}</Label>
            <Input id="est-high" type="number" min="0" max="300" value={form.deviation_high_pct} onChange={set('deviation_high_pct')} />
          </div>
          <div className="form-group">
            <Label htmlFor="est-delivery">{t('projects:estimation.expectedDelivery')}</Label>
            <Input id="est-delivery" type="date" value={form.expected_delivery_date} onChange={set('expected_delivery_date')} />
          </div>
        </div>
        <div className="form-group">
          <Label htmlFor="est-notes">{t('projects:estimation.reviewNotes')}</Label>
          <Textarea id="est-notes" rows={2} value={form.review_notes} onChange={set('review_notes')} />
        </div>

        {/* Live conversion preview */}
        {form.estimated_loc !== '' && (
          <div className="estimation-preview">
            <Gauge size={16} />
            <span>{t('projects:estimation.preview')}:</span>
            <span>
              {t('projects:estimation.totalPm')} <strong>{preview.total.low} ~ {preview.total.high}</strong>
            </span>
            <span>
              {t('projects:estimation.designPm')} <strong>{preview.design.low} ~ {preview.design.high}</strong>
            </span>
            <span>
              {t('projects:estimation.devPm')} <strong>{preview.dev.low} ~ {preview.dev.high}</strong>
            </span>
          </div>
        )}

        {formError && <p className="text-danger">{formError}</p>}

        <div className="estimation-actions">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || form.estimated_loc === ''}>
            <Save size={16} />
            {saveMutation.isPending ? t('projects:estimation.saving') : t('projects:estimation.save')}
          </Button>
          <Button
            variant="outline"
            onClick={() => checkMutation.mutate(form.expected_delivery_date || undefined)}
            disabled={!current || checkMutation.isPending}
            title={!current ? t('projects:estimation.checkNeedSave') : undefined}
          >
            <Gauge size={16} />
            {checkMutation.isPending ? t('projects:estimation.checking') : t('projects:estimation.checkDeadline')}
          </Button>
        </div>
      </div>

      {/* Deadline check result */}
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
              <SideCheckRow side={checkResult.dev} data={checkResult.dev} />
            </tbody>
          </table>
          <p className="text-muted estimation-assumptions">
            {t('projects:estimation.capacityNote')}
          </p>
        </div>
      )}

      {/* Post-delivery backfill */}
      {current && !current.backfilled_at && (
        <div className="estimation-backfill">
          <div className="estimation-current-header">
            <ClipboardCheck size={16} />
            <strong>{t('projects:estimation.backfill')}</strong>
          </div>
          <div className="estimation-form-grid">
            <div className="form-group">
              <Label htmlFor="bf-loc">{t('projects:estimation.actualLoc')}</Label>
              <Input id="bf-loc" type="number" value={backfillForm.actual_loc} onChange={(e) => setBackfillForm((p) => ({ ...p, actual_loc: e.target.value }))} />
            </div>
            <div className="form-group">
              <Label htmlFor="bf-design">{t('projects:estimation.actualDesignPm')}</Label>
              <Input id="bf-design" type="number" value={backfillForm.actual_design_pm} onChange={(e) => setBackfillForm((p) => ({ ...p, actual_design_pm: e.target.value }))} />
            </div>
            <div className="form-group">
              <Label htmlFor="bf-dev">{t('projects:estimation.actualDevPm')}</Label>
              <Input id="bf-dev" type="number" value={backfillForm.actual_dev_pm} onChange={(e) => setBackfillForm((p) => ({ ...p, actual_dev_pm: e.target.value }))} />
            </div>
            <div className="form-group">
              <Label htmlFor="bf-date">{t('projects:estimation.actualDeliveryDate')}</Label>
              <Input id="bf-date" type="date" value={backfillForm.actual_delivery_date} onChange={(e) => setBackfillForm((p) => ({ ...p, actual_delivery_date: e.target.value }))} />
            </div>
          </div>
          <Button variant="outline" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
            {t('projects:estimation.backfillSave')}
          </Button>
        </div>
      )}

      {/* Deviation display after backfill */}
      {deviation && (
        <div className="estimation-deviation">
          <strong>{t('projects:estimation.deviation')}:</strong>
          {deviation.loc != null && <span>{t('projects:estimation.estimatedLoc')} {deviation.loc > 0 ? '+' : ''}{deviation.loc}%</span>}
          {deviation.design_pm != null && <span>{t('projects:estimation.designPm')} {deviation.design_pm > 0 ? '+' : ''}{deviation.design_pm}%</span>}
          {deviation.dev_pm != null && <span>{t('projects:estimation.devPm')} {deviation.dev_pm > 0 ? '+' : ''}{deviation.dev_pm}%</span>}
          {deviation.days_late != null && <span>{t('projects:estimation.daysLate')} {deviation.days_late}</span>}
        </div>
      )}

      {/* History */}
      {estimations.length > 1 && (
        <div className="estimation-history">
          <strong>{t('projects:estimation.history')}</strong>
          <table className="table">
            <thead>
              <tr>
                <th>{t('common:date')}</th>
                <th>{t('projects:estimation.estimatedLoc')}</th>
                <th>{t('projects:estimation.expectedDelivery')}</th>
                <th>{t('projects:estimation.status')}</th>
              </tr>
            </thead>
            <tbody>
              {estimations.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.created_at)}</td>
                  <td>{e.estimated_loc.toLocaleString()}</td>
                  <td>{e.expected_delivery_date ? formatDate(e.expected_delivery_date) : '—'}</td>
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
