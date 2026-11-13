/**
 * DraftCommitBar（工作台 v2 §5.2C/§10）——待提交操作条：
 * 有 ghost 时显示 [继续选择] [确认分配] [清空] + 状态摘要；无 ghost 隐藏。
 * 确认只发 status=NORMAL 的草稿；INVALID/CONFLICT/UNKNOWN 显示计数。
 * 容量超载只提醒（附 warning），不禁用确认（§2.1 目标 6）。
 */
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCheck, ListPlus, Trash2 } from 'lucide-react';

export interface DraftCommitBarProps {
  total: number;
  submittable: number;
  invalid: number;
  conflict: number;
  unknown: number;
  submitting: boolean;
  /** 场景不匹配/提交中→禁用确认（§12） */
  confirmDisabled: boolean;
  confirmDisabledReason?: string | null;
  overload: boolean;
  onContinueSelect: () => void;
  onConfirm: () => void;
  onClear: () => void;
  lastSummary?: { succeeded: number; failed: number; unknown: number } | null;
}

export const DraftCommitBar = forwardRef<HTMLDivElement, DraftCommitBarProps>(
  function DraftCommitBar(
    {
      total,
      submittable,
      invalid,
      conflict,
      unknown,
      submitting,
      confirmDisabled,
      confirmDisabledReason,
      overload,
      onContinueSelect,
      onConfirm,
      onClear,
      lastSummary,
    },
    ref
  ) {
    const { t } = useTranslation(['assignments']);
    if (total === 0) return null;

    return (
      <div className="pw-commit-bar" ref={ref} data-testid="pw-commit-bar" tabIndex={-1}>
        <span className="pw-commit-count" data-testid="pw-commit-count">
          {t('assignments:workbench.commit.pending', { count: total })}
        </span>
        {invalid > 0 ? (
          <span className="pw-commit-flag pw-commit-flag--invalid">
            {t('assignments:workbench.commit.invalid', { count: invalid })}
          </span>
        ) : null}
        {conflict > 0 ? (
          <span className="pw-commit-flag pw-commit-flag--conflict">
            {t('assignments:workbench.commit.conflict', { count: conflict })}
          </span>
        ) : null}
        {unknown > 0 ? (
          <span className="pw-commit-flag pw-commit-flag--unknown">
            {t('assignments:workbench.commit.unknown', { count: unknown })}
          </span>
        ) : null}
        {overload ? (
          <span className="pw-commit-flag pw-commit-flag--overload" role="status">
            <AlertTriangle size={13} aria-hidden="true" />
            {t('assignments:workbench.commit.overloadWarn')}
          </span>
        ) : null}
        {lastSummary ? (
          <span className="pw-commit-summary" role="status">
            {t('assignments:workbench.commit.summary', lastSummary)}
          </span>
        ) : null}
        <div className="pw-commit-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={submitting}
            onClick={onContinueSelect}
          >
            <ListPlus size={14} /> {t('assignments:workbench.commit.continue')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={confirmDisabled || submitting || submittable === 0}
            title={confirmDisabled ? confirmDisabledReason ?? undefined : undefined}
            onClick={onConfirm}
            data-testid="pw-confirm-assign"
          >
            <CheckCheck size={14} />{' '}
            {submitting
              ? t('assignments:workbench.commit.submitting')
              : t('assignments:workbench.commit.confirm', { count: submittable })}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={submitting}
            onClick={onClear}
          >
            <Trash2 size={14} /> {t('assignments:workbench.commit.clear')}
          </button>
        </div>
      </div>
    );
  }
);
