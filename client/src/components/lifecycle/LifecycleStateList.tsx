import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';
import { stateLabelKey } from './LifecycleBanner';

/**
 * LifecycleStateList — 全量状态选择器 (2026-09-21 用户裁决: 状态选择不受
 * 流程约束, 任意跳转; 不合理之处由服务端告警提示, 不拦截).
 *
 * 特殊交互:
 *  - 当前态高亮不可点
 *  - 从开发侧跳"设计中" → 就地展开 暂停/释放/保留 三选
 *  - "裁决取消" → 行内二次点击确认
 */
const ALL_STATES = [
  'pending_rat',
  'nok',
  'designing',
  'backlog',
  'scheduled',
  'in_iteration',
  'delivered',
  'cancelled'
] as const;

const DESIGN_SIDE = new Set(['pending_rat', 'nok', 'designing']);

export function LifecycleStateList({
  current,
  isPending,
  onTransition,
  onReopen
}: {
  current: string;
  isPending: boolean;
  onTransition: (to: string) => void;
  /** dev-side → designing: parent switches to the reopen drill */
  onReopen: () => void;
}) {
  const { t } = useTranslation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const fromDevSide = !DESIGN_SIDE.has(current);

  return (
    <div className="lc-state-list" data-testid="lc-state-list">
      <div className="lc-popover-title">{t('projects:lifecycle.selectorTitle')}</div>
      <div className="lc-popover-column">
        {ALL_STATES.map((s) => {
          const isCurrent = s === current;
          const isReopen = s === 'designing' && fromDevSide;
          const isCancel = s === 'cancelled';

          if (isCurrent) {
            return (
              <div key={s} className="lc-state-row lc-state-row--current">
                <Check size={13} />
                {t(stateLabelKey(s))}
                <span className="lc-state-current-tag">{t('projects:lifecycle.currentLabel')}</span>
              </div>
            );
          }
          if (isReopen) {
            return (
              <button key={s} type="button" className="lifecycle-btn lc-state-row" disabled={isPending} onClick={onReopen}>
                {t(stateLabelKey(s))}
                <ChevronRight size={13} className="ml-auto opacity-50" />
              </button>
            );
          }
          if (isCancel) {
            return (
              <button
                key={s}
                type="button"
                className={`lifecycle-btn lc-state-row lc-state-row--danger ${confirmingCancel ? 'lifecycle-btn--confirming' : ''}`}
                disabled={isPending}
                onClick={() => {
                  if (!confirmingCancel) {
                    setConfirmingCancel(true);
                    setTimeout(() => setConfirmingCancel(false), 3000);
                    return;
                  }
                  onTransition('cancelled');
                }}
              >
                {confirmingCancel ? t('projects:lifecycle.action.confirmCancel') : t(stateLabelKey(s))}
              </button>
            );
          }
          return (
            <button
              key={s}
              type="button"
              className="lifecycle-btn lc-state-row"
              disabled={isPending}
              onClick={() => onTransition(s)}
            >
              {t(stateLabelKey(s))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
