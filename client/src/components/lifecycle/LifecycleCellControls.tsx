import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { api } from '../../lib/api-client';
import { useLifecycleTransition } from './useLifecycleTransition';
import { stateLabelKey } from './LifecycleBanner';

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

/** Secondary transitions surfaced in the badge popover */
const SECONDARY: Record<string, string[]> = {
  pending_rat: ['nok', 'cancelled'],
  nok: ['pending_rat', 'cancelled'],
  designing: ['nok', 'cancelled'],
  backlog: ['designing', 'cancelled'],
  scheduled: ['designing', 'cancelled'],
  in_iteration: ['designing', 'cancelled'],
  delivered: [],
  cancelled: []
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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
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
  const devRole = (roles as any[] | undefined)?.find((r) => r.name === '开发');
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
    setConfirmingCancel(false);
    setError(null);
  }

  function openPopover(next: PopoverMode) {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 270;
      const estHeight = 340; // schedule form is the tallest
      // Flip above the anchor when the popover would overflow the viewport
      // (bottom rows of the table) — otherwise it renders out of reach
      const top =
        rect.bottom + 6 + estHeight > window.innerHeight
          ? Math.max(8, rect.top - estHeight - 6)
          : rect.bottom + 6;
      setPos({
        top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 12))
      });
    }
    setConfirmingCancel(false);
    setError(null);
    setMode(next);
  }

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
  const secondary = SECONDARY[state] ?? [];
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
          title={t('projects:lifecycle.quick.more')}
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

      {inDesign && deadline && (
        <span className={overdue ? 'lifecycle-deadline lifecycle-deadline--overdue' : 'lifecycle-deadline'}>
          {t('projects:lifecycle.deadlineShort', { date: deadline })}
        </span>
      )}
      {!inDesign && project.iteration_label && (
        <span className="lifecycle-deadline">{project.iteration_label}</span>
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
                    {(roles as any[] | undefined)?.map((r) => (
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

          {/* ---- all secondary transitions ---- */}
          {mode === 'actions' && secondary.length > 0 && (
            <div className="lc-popover-column">
              {secondary.map((to) => {
                if (to === 'cancelled') {
                  return (
                    <button
                      key="cancel"
                      type="button"
                      className={confirmingCancel ? 'lifecycle-btn lifecycle-btn-danger lifecycle-btn--confirming' : 'lifecycle-btn lifecycle-btn-danger'}
                      disabled={transition.isPending}
                      onClick={() => {
                        if (!confirmingCancel) {
                          setConfirmingCancel(true);
                          setTimeout(() => setConfirmingCancel(false), 3000);
                          return;
                        }
                        doTransition('cancelled');
                      }}
                    >
                      {confirmingCancel
                        ? t('projects:lifecycle.action.confirmCancel')
                        : t('projects:lifecycle.action.cancel')}
                    </button>
                  );
                }
                if (to === 'designing') {
                  return (
                    <button key="reopen" type="button" className={btn}
                            onClick={() => setMode('reopen')}>
                      {t('projects:lifecycle.action.reopen')}…
                    </button>
                  );
                }
                return (
                  <button key={to} type="button" className={btn} disabled={transition.isPending}
                          onClick={() => doTransition(to)}>
                    {to === 'nok' && t('projects:lifecycle.action.markNok')}
                    {to === 'pending_rat' && t('projects:lifecycle.action.backToPendingRat')}
                  </button>
                );
              })}
            </div>
          )}
          {mode === 'actions' && secondary.length === 0 && (
            <div className="lc-popover-hint">{t('projects:lifecycle.quick.terminal')}</div>
          )}

          {error && <div className="lc-popover-error">{error}</div>}
        </div>
      )}
    </span>
  );
}
