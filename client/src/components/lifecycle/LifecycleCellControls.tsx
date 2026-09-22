import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { api } from '../../lib/api-client';
import { useLifecycleTransition } from './useLifecycleTransition';
import { stateLabelKey } from './LifecycleBanner';
import { LifecycleStateList } from './LifecycleStateList';

/**
 * LifecycleCellControls — 列表页就地推进生命周期 (2026-09-21 用户裁决:
 * 状态流转必须在列表页直接可操作, 不进详情).
 *
 * 交互分层:
 *  - 主路径一键推进: 徽章旁常驻当前态的下一步按钮 (进入设计/准入/排序/
 *    启动迭代/交付) — 80% 场景一次点击
 *  - 徽章点开 = 全量转换气泡 (非模态, fixed 定位不被表格裁剪): NOK、
 *    退回三选(暂停/释放/保留)、取消(二次点击确认)
 *  - 排序需要建池输入: 气泡内 3 字段小表单, 日期留空=项目周期
 */

/** Primary forward action per state; null = terminal / needs the form */
const PRIMARY_NEXT: Record<string, { to: string; labelKey: string } | null> = {
  pending_rat: { to: 'designing', labelKey: 'projects:lifecycle.action.toDesigning' },
  nok: { to: 'designing', labelKey: 'projects:lifecycle.action.toDesigning' },
  designing: { to: 'backlog', labelKey: 'projects:lifecycle.quick.admit' },
  backlog: { to: 'scheduled', labelKey: 'projects:lifecycle.quick.schedule' }, // opens form
  scheduled: { to: 'in_iteration', labelKey: 'projects:lifecycle.quick.start' },
  in_iteration: { to: 'delivered', labelKey: 'projects:lifecycle.quick.deliver' },
  delivered: null,
  cancelled: null
};

function daysFromToday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000);
}

type PopoverMode = 'actions' | 'reopen' | 'cancel' | 'schedule';

export function LifecycleCellControls({ project }: { project: any }) {
  const { t } = useTranslation();
  const state: string = project.lifecycle_state;
  const transition = useLifecycleTransition(project.id);

  const [mode, setMode] = useState<PopoverMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Pool form state (schedule popover)
  const [poolForm, setPoolForm] = useState({ role_id: '', headcount: '2', start_date: '', end_date: '' });

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    },
    enabled: mode === 'schedule'
  });
  const roleList = Array.isArray(roles) ? (roles as any[]) : ((roles as any)?.data ?? []);
  const devRole = roleList.find((r) => r.name === '开发');
  useEffect(() => {
    if (devRole && !poolForm.role_id) setPoolForm((f) => ({ ...f, role_id: devRole.id }));
  }, [devRole?.id]);

  // Close on outside pointer-down / Escape
  useEffect(() => {
    if (!mode) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      closePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [mode]);

  function closePopover() {
    setMode(null);
    setError(null);
  }

  function openPopover(next: PopoverMode) {
    anchorRectRef.current = anchorRef.current?.getBoundingClientRect() ?? null;
    setError(null);
    setMode(next);
  }

  // Position the popover against its REAL rendered height (same frame, no
  // flicker). Strategy: below the anchor → above if below doesn't fit → the
  // roomier side clamped into the viewport when neither fits. The popover
  // never detaches from its anchor and never leaves the screen.
  useLayoutEffect(() => {
    if (!mode) return;
    const rect = anchorRectRef.current;
    const el = popRef.current;
    if (!rect || !el) return;

    const width = 270;
    const h = el.offsetHeight;
    const margin = 6;
    const spaceBelow = window.innerHeight - rect.bottom - margin - 8;
    const spaceAbove = rect.top - margin - 8;

    let top: number;
    if (h <= spaceBelow) {
      top = rect.bottom + margin;
    } else if (h <= spaceAbove) {
      top = rect.top - h - margin;
    } else {
      top = spaceBelow >= spaceAbove ? rect.bottom + margin : rect.top - h - margin;
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    }

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 12));
    setPos({ top, left });
  }, [mode]);

  const doTransition = (to: string, extra: Record<string, unknown> = {}) => {
    setError(null);
    transition.mutate(
      { to, ...extra },
      {
        onSuccess: closePopover,
        onError: (err: any) =>
          setError(err?.response?.data?.error || err?.message || t('projects:lifecycle.transitionFailed'))
      }
    );
  };

  const primary = PRIMARY_NEXT[state] ?? null;
  const warnings: string[] = Array.isArray(project.lifecycle_warnings) ? project.lifecycle_warnings : [];
  const inDesign = ['pending_rat', 'nok', 'designing'].includes(state);
  const deadline: string | null = project.design_deadline ? String(project.design_deadline).slice(0, 10) : null;
  const overdue = inDesign && deadline && daysFromToday(deadline) < 0;

  const btn = 'lifecycle-btn';
  const btnPrimary = 'lifecycle-btn lifecycle-btn-primary';

  return (
    <span
      ref={anchorRef}
      className="lifecycle-cell"
      onClick={(e) => e.stopPropagation()} // row click must not fire from the controls
    >
      <span className="lifecycle-cell-badges">
        <button
          type="button"
          className={`lifecycle-state-badge lifecycle-state-badge--${state} lifecycle-badge-btn`}
          onClick={() => (mode ? closePopover() : openPopover('actions'))}
          title={
            warnings.length > 0
              ? `${t('projects:lifecycle.warningDot')}: ${warnings.map((w) => t(`projects:lifecycle.warnings.${w}`)).join('；')}`
              : t('projects:lifecycle.quick.more')
          }
        >
          {t(stateLabelKey(state))}
          <ChevronDown size={11} className="inline ml-0.5 opacity-60" />
        </button>

        {primary && state !== 'backlog' && (
          <button
            type="button"
            className="lifecycle-btn lifecycle-btn-primary lifecycle-quick-btn"
            disabled={transition.isPending}
            onClick={() => doTransition(primary.to)}
          >
            {t(primary.labelKey)}
          </button>
        )}
        {state === 'backlog' && (
          <button
            type="button"
            className="lifecycle-btn lifecycle-btn-primary lifecycle-quick-btn"
            disabled={transition.isPending}
            onClick={() => (mode === 'schedule' ? closePopover() : openPopover('schedule'))}
          >
            {t('projects:lifecycle.quick.schedule')}
          </button>
        )}
      </span>

      {/* 死线内联在徽章行内(行高统一 40px 的关键); 短格式 MM-DD, tooltip 带全年份 */}
      {inDesign && deadline && (
        <span
          className={overdue ? 'lifecycle-deadline--inline lifecycle-deadline--overdue' : 'lifecycle-deadline--inline'}
          title={deadline}
        >
          {deadline.slice(5)}
        </span>
      )}

      {mode && (
        <div ref={popRef} className="lc-popover" style={{ top: pos.top, left: pos.left }}>
          {/* ---- schedule form (排序即建池) ---- */}
          {mode === 'schedule' && (
            <>
              <div className="lc-popover-title">{t('projects:lifecycle.scheduleForm.title')}</div>
              <div className="lc-popover-form">
                <label>
                  {t('projects:lifecycle.scheduleForm.role')}
                  <select value={poolForm.role_id} onChange={(e) => setPoolForm({ ...poolForm, role_id: e.target.value })}>
                    <option value="">{t('projects:staffing.selectRole')}</option>
                    {roleList.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('projects:lifecycle.scheduleForm.headcount')}
                  <input
                    type="number" min="0.5" max="10" step="0.5"
                    value={poolForm.headcount}
                    onChange={(e) => setPoolForm({ ...poolForm, headcount: e.target.value })}
                  />
                </label>
                <div className="lc-popover-dates">
                  <label>
                    {t('common:startDate')}
                    <input type="date" value={poolForm.start_date}
                           placeholder={t('projects:lifecycle.quick.dateAuto')}
                           onChange={(e) => setPoolForm({ ...poolForm, start_date: e.target.value })} />
                  </label>
                  <label>
                    {t('common:endDate')}
                    <input type="date" value={poolForm.end_date}
                           onChange={(e) => setPoolForm({ ...poolForm, end_date: e.target.value })} />
                  </label>
                </div>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={transition.isPending || !poolForm.role_id}
                  onClick={() =>
                    doTransition('scheduled', {
                      pool: {
                        role_id: poolForm.role_id,
                        headcount: Number(poolForm.headcount),
                        start_date: poolForm.start_date || null,
                        end_date: poolForm.end_date || null
                      }
                    })
                  }
                >
                  {t('projects:lifecycle.scheduleForm.confirm')}
                </button>
                <div className="lc-popover-hint">{t('projects:lifecycle.quick.dateAutoHint')}</div>
              </div>
            </>
          )}

          {/* ---- reopen options (退回三选) ---- */}
          {mode === 'reopen' && (
            <>
              <div className="lc-popover-title">{t('projects:lifecycle.reopenForm.title')}</div>
              <div className="lc-popover-column">
                <button type="button" className={btn} disabled={transition.isPending}
                        onClick={() => doTransition('designing', { dev_assignments_action: 'pause' })}>
                  {t('projects:lifecycle.reopenForm.pauseDev')}
                </button>
                <button type="button" className="lifecycle-btn lifecycle-btn-danger" disabled={transition.isPending}
                        onClick={() => doTransition('designing', { dev_assignments_action: 'release' })}>
                  {t('projects:lifecycle.reopenForm.releaseDev')}
                </button>
                <button type="button" className={btn} disabled={transition.isPending}
                        onClick={() => doTransition('designing', { dev_assignments_action: 'keep' })}>
                  {t('projects:lifecycle.reopenForm.keepDev')}
                </button>
              </div>
              <div className="lc-popover-hint">{t('projects:lifecycle.reopenForm.hint')}</div>
            </>
          )}

          {/* ---- full state selector (flow-free, warnings advise) ---- */}
          {mode === 'actions' && (
            <LifecycleStateList
              current={state}
              isPending={transition.isPending}
              onTransition={(to) => doTransition(to)}
              onReopen={() => setMode('reopen')}
            />
          )}

          {error && <div className="lc-popover-error">{error}</div>}
        </div>
      )}
    </span>
  );
}
