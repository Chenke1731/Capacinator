import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '../../lib/api-client';
import { LifecycleStateList } from './LifecycleStateList';
import { queryKeys } from '../../lib/queryKeys';

/**
 * LifecycleBanner — 事项生命周期步进条 (2026-09-21 契约).
 *
 * 单一状态轴驱动整个页面: 设计侧(待RAT/NOK/设计中) → [准入] →
 * 开发侧(待排序/已排序/已启动迭代/已交付), 终态 裁决取消.
 *
 * 交互原则 (用户裁决): 流程推进零弹窗 — 全部就地展开 + 二次点击确认.
 *  - 准入 = 一步按钮, AR 为可选内联输入
 *  - 排序 = 就地展开池需求小表单 (排序即建池)
 *  - 退回 = 就地展开三选 (暂停/释放/保留开发分配)
 *  - 取消 = 按钮变"确认取消?"再点一次, 3 秒超时回退
 */

const DESIGN_STATES = ['pending_rat', 'nok', 'designing'] as const;
const DEV_STATES = ['backlog', 'scheduled', 'in_iteration', 'delivered'] as const;
const STEPPER_ORDER = [...DESIGN_STATES, ...DEV_STATES] as const;

export function stateLabelKey(state: string): string {
  return `projects:lifecycle.state.${state}`;
}

function daysFromToday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function LifecycleBanner({ project }: { project: any }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state: string | null = project.lifecycle_state ?? null;

  const [arDraft, setArDraft] = useState(project.ar_number ?? '');
  const [expanded, setExpanded] = useState<null | 'schedule' | 'reopen' | 'start'>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poolForm, setPoolForm] = useState({ role_id: '', headcount: '2', start_date: '', end_date: '' });
  const [iterDraft, setIterDraft] = useState('');
  const [stateMenu, setStateMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: -9999, left: -9999 });
  const stateBadgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => setArDraft(project.ar_number ?? ''), [project.ar_number]);

  // Dismiss the free-state selector popover
  useEffect(() => {
    if (!stateMenu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (stateBadgeRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.lc-popover')) return;
      setStateMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStateMenu(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [stateMenu]);

  // Roles for the scheduling pool form (dev side preselected)
  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });
  // Defensive: the shared ['roles'] cache has historically held raw envelopes
  const roleList = Array.isArray(roles) ? (roles as any[]) : ((roles as any)?.data ?? []);
  const devRole = roleList.find((r) => r.name === '开发');
  useEffect(() => {
    if (devRole && !poolForm.role_id) {
      setPoolForm((f) => ({ ...f, role_id: devRole.id }));
    }
  }, [devRole?.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const warnings: string[] = Array.isArray(project.lifecycle_warnings)
    ? project.lifecycle_warnings
    : [];

  const toggleStateMenu = () => {
    if (stateMenu) {
      setStateMenu(false);
      return;
    }
    const rect = stateBadgeRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({
        top: Math.min(rect.bottom + 6, window.innerHeight - 380),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 282))
      });
    }
    setStateMenu(true);
  };

  const transitionMutation = useMutation({
    mutationFn: (data: any) => api.lifecycle.transition(project.id, data),
    onSuccess: () => {
      setError(null);
      setExpanded(null);
      setConfirmingCancel(false);
      invalidate();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || err?.message || 'transition failed');
    }
  });

  const saveArMutation = useMutation({
    mutationFn: (ar_number: string) => api.lifecycle.updateFields(project.id, { ar_number }),
    onSuccess: invalidate,
    onError: (err: any) => setError(err?.response?.data?.error || 'save failed')
  });

  // Standing items (问题单支持/项目事务) have no lifecycle — render nothing
  if (!state) return null;

  const doTransition = (to: string, extra: Record<string, unknown> = {}) =>
    transitionMutation.mutate({ to, ...extra });

  const twoClickCancel = () => {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      setTimeout(() => setConfirmingCancel(false), 3000);
      return;
    }
    doTransition('cancelled');
  };

  const designDeadline: string | null = project.design_deadline ?? null;
  const deadlineDays = designDeadline ? daysFromToday(designDeadline) : null;
  const inDesignSide = (DESIGN_STATES as readonly string[]).includes(state);
  const isTerminal = state === 'delivered' || state === 'cancelled';
  const currentIndex = STEPPER_ORDER.indexOf(state as any);

  const btn = 'lifecycle-btn';
  const btnPrimary = 'lifecycle-btn lifecycle-btn-primary';
  const btnDanger = 'lifecycle-btn lifecycle-btn-danger';

  return (
    <div className={`lifecycle-banner ${state === 'cancelled' ? 'lifecycle-banner--cancelled' : ''}`}>
      {/* Row 1: current state + context + actions */}
      <div className="lifecycle-banner-top">
        <div className="lifecycle-context">
          <span ref={stateBadgeRef} style={{ display: 'inline-flex' }}>
            <button
              type="button"
              className={`lifecycle-state-badge lifecycle-state-badge--${state} lifecycle-badge-btn`}
              onClick={toggleStateMenu}
              title={
                warnings.length > 0
                  ? `${t('projects:lifecycle.warningDot')}: ${warnings.map((w) => t(`projects:lifecycle.warnings.${w}`)).join('；')}`
                  : t('projects:lifecycle.selectorTitle')
              }
            >
              {warnings.length > 0 && (
                <span className="lifecycle-warning-dot" title={t('projects:lifecycle.warningDot')} />
              )}
              {t(stateLabelKey(state))}
              <ChevronDown size={11} className="inline ml-0.5 opacity-60" />
            </button>
          </span>

          {inDesignSide && designDeadline && deadlineDays !== null && (
            <span className={deadlineDays < 0 ? 'lifecycle-deadline lifecycle-deadline--overdue' : 'lifecycle-deadline'}>
              {deadlineDays < 0
                ? t('projects:lifecycle.deadlineOverdue', { date: designDeadline, days: Math.abs(deadlineDays) })
                : t('projects:lifecycle.deadlineRemaining', { date: designDeadline, days: deadlineDays })}
            </span>
          )}

          {!inDesignSide && project.ar_number && (
            <span className="lifecycle-ar-chip" title={t('projects:lifecycle.arNumber')}>
              AR {project.ar_number}
            </span>
          )}
          {state === 'in_iteration' && project.iteration_label && (
            <span className="lifecycle-ar-chip">{project.iteration_label}</span>
          )}
        </div>

        <div className="lifecycle-actions">
          {state === 'pending_rat' && (
            <>
              <button className={btnPrimary} onClick={() => doTransition('designing')} disabled={transitionMutation.isPending}>
                {t('projects:lifecycle.action.toDesigning')}
              </button>
              <button className={btn} onClick={() => doTransition('nok')} disabled={transitionMutation.isPending}>
                {t('projects:lifecycle.action.markNok')}
              </button>
            </>
          )}

          {state === 'nok' && (
            <>
              <button className={btnPrimary} onClick={() => doTransition('designing')} disabled={transitionMutation.isPending}>
                {t('projects:lifecycle.action.toDesigning')}
              </button>
              <button className={btn} onClick={() => doTransition('pending_rat')} disabled={transitionMutation.isPending}>
                {t('projects:lifecycle.action.backToPendingRat')}
              </button>
            </>
          )}

          {state === 'designing' && (
            <>
              <button className={btnPrimary} onClick={() => doTransition('backlog', { ar_number: arDraft || null })} disabled={transitionMutation.isPending}>
                {t('projects:lifecycle.action.admit')}
              </button>
              <button className={btn} onClick={() => doTransition('nok')} disabled={transitionMutation.isPending}>
                {t('projects:lifecycle.action.markNok')}
              </button>
            </>
          )}

          {state === 'backlog' && (
            <button className={btnPrimary} onClick={() => setExpanded(expanded === 'schedule' ? null : 'schedule')}>
              {t('projects:lifecycle.action.schedule')}
            </button>
          )}

          {state === 'scheduled' && (
            <button className={btnPrimary} onClick={() => setExpanded(expanded === 'start' ? null : 'start')}>
              {t('projects:lifecycle.action.startIteration')}
            </button>
          )}

          {state === 'in_iteration' && (
            <button className={btnPrimary} onClick={() => doTransition('delivered')} disabled={transitionMutation.isPending}>
              {t('projects:lifecycle.action.deliver')}
            </button>
          )}

          {(state === 'backlog' || state === 'scheduled' || state === 'in_iteration') && (
            <button className={btn} onClick={() => setExpanded(expanded === 'reopen' ? null : 'reopen')}>
              {t('projects:lifecycle.action.reopen')}
            </button>
          )}

          {!isTerminal && (
            <button
              className={confirmingCancel ? 'lifecycle-btn lifecycle-btn-danger lifecycle-btn--confirming' : btnDanger}
              onClick={twoClickCancel}
              disabled={transitionMutation.isPending}
            >
              {confirmingCancel ? t('projects:lifecycle.action.confirmCancel') : t('projects:lifecycle.action.cancel')}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: stepper */}
      <div className="lifecycle-stepper">
        {STEPPER_ORDER.map((s, i) => {
          const passed = i < currentIndex;
          const current = i === currentIndex;
          return (
            <span key={s} style={{ display: 'contents' }}>
              {i === DESIGN_STATES.length && (
                <span className="lifecycle-gate" title={t('projects:lifecycle.gateTitle')}>
                  {t('projects:lifecycle.gate')}
                </span>
              )}
              <span
                className={`lifecycle-step ${current ? 'lifecycle-step--current' : ''} ${passed ? 'lifecycle-step--passed' : ''}`}
              >
                <span className="lifecycle-step-dot">
                  {passed ? <Check size={11} strokeWidth={3} /> : current && state === 'nok' ? <AlertTriangle size={11} /> : null}
                </span>
                <span className="lifecycle-step-label">{t(stateLabelKey(s))}</span>
              </span>
              {i < STEPPER_ORDER.length - 1 && <ChevronRight size={14} className="lifecycle-step-arrow" />}
            </span>
          );
        })}
      </div>

      {/* Advisory warnings (状态告警) — the system flags, the human decides */}
      {warnings.length > 0 && (
        <div className="lifecycle-warning-strip">
          <AlertTriangle size={13} className="flex-shrink-0" />
          <span className="lifecycle-warning-title">{t('projects:lifecycle.warningsTitle')}</span>
          <span className="lifecycle-warning-items">
            {warnings.map((w) => t(`projects:lifecycle.warnings.${w}`)).join('；')}
          </span>
        </div>
      )}

      {/* Free-state selector popover (badge click) */}
      {stateMenu && (
        <div className="lc-popover" style={{ top: menuPos.top, left: menuPos.left }}>
          <LifecycleStateList
            current={state}
            isPending={transitionMutation.isPending}
            onTransition={(to) =>
              transitionMutation.mutate({ to }, { onSuccess: () => setStateMenu(false) })
            }
            onReopen={() => {
              setStateMenu(false);
              setExpanded('reopen');
            }}
          />
        </div>
      )}

      {/* Inline: AR number input (design side) */}
      {inDesignSide && (
        <div className="lifecycle-inline-row">
          <label className="lifecycle-inline-label">{t('projects:lifecycle.arNumber')}</label>
          <input
            className="lifecycle-ar-input"
            value={arDraft}
            placeholder={t('projects:lifecycle.arPlaceholder')}
            onChange={(e) => setArDraft(e.target.value)}
            onBlur={() => {
              if ((project.ar_number ?? '') !== (arDraft.trim() || '')) {
                saveArMutation.mutate(arDraft.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
      )}

      {/* Inline expansion: scheduling pool form (排序即建池) */}
      {expanded === 'schedule' && (
        <div className="lifecycle-expand">
          <div className="lifecycle-expand-title">{t('projects:lifecycle.scheduleForm.title')}</div>
          <div className="lifecycle-expand-form">
            <label>
              {t('projects:lifecycle.scheduleForm.role')}
              <select
                value={poolForm.role_id}
                onChange={(e) => setPoolForm({ ...poolForm, role_id: e.target.value })}
              >
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
            <label>
              {t('projects:lifecycle.scheduleForm.startDate')}
              <input
                type="date"
                value={poolForm.start_date}
                onChange={(e) => setPoolForm({ ...poolForm, start_date: e.target.value })}
              />
            </label>
            <label>
              {t('projects:lifecycle.scheduleForm.endDate')}
              <input
                type="date"
                value={poolForm.end_date}
                onChange={(e) => setPoolForm({ ...poolForm, end_date: e.target.value })}
              />
            </label>
            <button
              className={btnPrimary}
              disabled={transitionMutation.isPending || !poolForm.role_id}
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
          </div>
          <div className="lifecycle-expand-hint">{t('projects:lifecycle.scheduleForm.hint')}</div>
        </div>
      )}

      {/* Inline expansion: reopen options (退回设计) */}
      {expanded === 'reopen' && (
        <div className="lifecycle-expand">
          <div className="lifecycle-expand-title">{t('projects:lifecycle.reopenForm.title')}</div>
          <div className="lifecycle-expand-options">
            <button className={btn} onClick={() => doTransition('designing', { dev_assignments_action: 'pause' })} disabled={transitionMutation.isPending}>
              {t('projects:lifecycle.reopenForm.pauseDev')}
            </button>
            <button className={btnDanger} onClick={() => doTransition('designing', { dev_assignments_action: 'release' })} disabled={transitionMutation.isPending}>
              {t('projects:lifecycle.reopenForm.releaseDev')}
            </button>
            <button className={btn} onClick={() => doTransition('designing', { dev_assignments_action: 'keep' })} disabled={transitionMutation.isPending}>
              {t('projects:lifecycle.reopenForm.keepDev')}
            </button>
          </div>
          <div className="lifecycle-expand-hint">{t('projects:lifecycle.reopenForm.hint')}</div>
        </div>
      )}

      {/* Inline expansion: iteration label (启动迭代) */}
      {expanded === 'start' && (
        <div className="lifecycle-expand">
          <div className="lifecycle-expand-title">{t('projects:lifecycle.startForm.title')}</div>
          <div className="lifecycle-expand-form">
            <label>
              {t('projects:lifecycle.startForm.iterationLabel')}
              <input
                value={iterDraft}
                placeholder={t('projects:lifecycle.startForm.iterationPlaceholder')}
                onChange={(e) => setIterDraft(e.target.value)}
              />
            </label>
            <button
              className={btnPrimary}
              disabled={transitionMutation.isPending}
              onClick={() => doTransition('in_iteration', { iteration_label: iterDraft || null })}
            >
              {t('projects:lifecycle.startForm.confirm')}
            </button>
          </div>
        </div>
      )}

      {error && <div className="lifecycle-error">{error}</div>}
    </div>
  );
}
