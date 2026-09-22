import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';

/**
 * 实投入月帐(详情页"投入履历"): 计划 vs 实际的闭环。
 * 计划列=服务端按当月有效分配实时算(与事项台月窗口同口径);
 * 实际=月末快照默认值,主管可改写(manual 恒不被快照覆盖),偏差即排产反馈。
 */
export function ActualInvestmentsPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { data: payload, isLoading } = useQuery({
    queryKey: ['actual-investments', projectId],
    queryFn: async () => ((await api.actualInvestments.list(projectId)).data as any)?.data?.data ?? []
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['actual-investments', projectId] });

  const rows = payload ?? [];
  const byMonth = useMemo(() => new Map(rows.map((r: any) => [r.month, r])), [rows]);

  // 展示窗口: 已有记录的月份 + 最近 6 个月(含当月), 倒序
  const months = useMemo(() => {
    const set = new Set<string>(rows.map((r: any) => r.month));
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      set.add(`${now.getFullYear()}-${String(now.getMonth() - i + 1).padStart(2, '0').replace('-0-', '-')}`);
    }
    // 规范化(负月回退上一年)
    const norm = new Set<string>();
    for (const m of set) {
      const [y, mm] = m.split('-').map(Number);
      const d = new Date(y, mm - 1, 1);
      norm.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return [...norm].sort().reverse();
  }, [rows]);

  const plannedByMonth = (month: string) => byMonth.get(month)?.planned_fte ?? null;

  const snapshot = async (month: string) => {
    setBusy(true);
    try {
      await api.actualInvestments.snapshot(projectId, month);
      await invalidate();
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async (month: string, raw: string) => {
    setEditing(null);
    const v = raw.trim();
    if (v === '') return;
    const fte = Number(v);
    if (!Number.isFinite(fte) || fte < 0) return;
    setBusy(true);
    try {
      await api.actualInvestments.setManual(projectId, month, Math.round(fte * 100) / 100);
      await invalidate();
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (month: string) => {
    setBusy(true);
    try {
      await api.actualInvestments.remove(projectId, month);
      await invalidate();
    } finally {
      setBusy(false);
    }
  };

  const thisMonth = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();
  const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));

  if (isLoading) return <div className="text-sm text-muted">{t('common:loading')}</div>;

  return (
    <div className="actuals-panel">
      <div className="actuals-toolbar">
        <button
          className="board-ghost-btn"
          disabled={busy}
          onClick={() => snapshot(thisMonth)}
          title={t('projects:actuals.snapshotHint')}
        >
          <Camera size={14} />
          {t('projects:actuals.snapshotThis')}
        </button>
        <span className="actuals-hint">{t('projects:actuals.hint')}</span>
      </div>
      <div className="actuals-table" data-testid="actuals-table">
        <div className="actuals-thead">
          <span>{t('projects:actuals.colMonth')}</span>
          <span className="col-c">{t('projects:actuals.colPlanned')}</span>
          <span className="col-c">{t('projects:actuals.colActual')}</span>
          <span className="col-c">{t('projects:actuals.colDeviation')}</span>
          <span className="col-c">{t('projects:actuals.colSource')}</span>
          <span />
        </div>
        {months.map((month) => {
          const row = byMonth.get(month);
          const planned = row?.planned_fte ?? null;
          const deviation =
            row && planned && planned > 0
              ? Math.round(((Number(row.fte) - planned) / planned) * 100)
              : null;
          return (
            <div className="actuals-row" key={month}>
              <span className="actuals-month">{month}</span>
              <span className="col-c actuals-num">{fmt(planned)}</span>
              <span className="col-c" onClick={(e) => e.stopPropagation()}>
                {editing === month ? (
                  <input
                    className="inline-edit-input"
                    style={{ width: 72 }}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => saveManual(month, draft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="req-editable actuals-num actuals-edit"
                    title={t('projects:actuals.editHint')}
                    onClick={() => {
                      setDraft(row ? String(row.fte) : String(planned ?? ''));
                      setEditing(month);
                    }}
                  >
                    {row ? Number(row.fte).toFixed(2) : <span className="text-muted">—</span>}
                  </button>
                )}
              </span>
              <span className={`col-c actuals-dev ${deviation == null ? '' : deviation > 15 ? 'is-over' : deviation < -15 ? 'is-under' : ''}`}>
                {deviation == null ? '—' : `${deviation > 0 ? '+' : ''}${deviation}%`}
              </span>
              <span className="col-c actuals-source">
                {row ? t(`projects:actuals.source.${row.source}`) : ''}
              </span>
              <span className="col-c">
                {row && (
                  <button
                    type="button"
                    className="req-icon-btn actuals-del"
                    disabled={busy}
                    title={t('common:delete')}
                    onClick={() => removeRow(month)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
