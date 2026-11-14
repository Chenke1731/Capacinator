/**
 * DraftCommitBar（工作台 v2 §5.2C/§10 + Phase 2/3）——待提交操作条：
 * [继续选择] [确认分配] [清空] + 状态摘要 + [重试失败]（Phase 2 重试优化，
 * 只重发明确失败行）+ [批量编辑]（统一参数套用到全部可编辑 ghost）+
 * [撤销创建]（Phase 3：删除本会话刚创建的行）。
 * 容量超载只提醒（附 warning），不禁用确认（§2.1 目标 6）。
 */
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCheck, ListPlus, PencilLine, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { AssignmentDraft } from '../../lib/assignmentDrafts';

export interface BatchEditValue {
  allocation: string;
  dateMode: 'fixed' | 'phase' | 'project' | '';
  startDate: string;
  endDate: string;
}

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
  /** D-02a：场景失配期禁"继续选择"——新弹窗会绑定新场景造成双场景草稿 */
  continueDisabled?: boolean;
  lastSummary?: { succeeded: number; failed: number; unknown: number } | null;
  /** Phase 2：只重试上一轮明确失败的行 */
  onRetryFailed?: () => void;
  /** Phase 3：删除本会话刚成功创建的分配行 */
  onUndoCreate?: () => void;
  lastCreatedCount?: number;
  undoing?: boolean;
  /** 含不可恢复的 REPLACE 行（旧槽位快照缺字段）时禁用撤销（不丢数据） */
  undoDisabled?: boolean;
  undoDisabledReason?: string | null;
  /** 撤销失败原因（失败行保留在撤销记录中可重试，不静默清空） */
  undoError?: string | null;
  /** Phase 3 批量编辑：统一参数套用到全部可编辑 ghost */
  onBatchApply?: (value: BatchEditValue) => void;
  editableDrafts?: AssignmentDraft[];
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
      continueDisabled,
      confirmDisabledReason,
      overload,
      onContinueSelect,
      onConfirm,
      onClear,
      lastSummary,
      onRetryFailed,
      onUndoCreate,
      lastCreatedCount = 0,
      undoing = false,
      undoDisabled = false,
      undoDisabledReason,
      undoError,
      onBatchApply,
      editableDrafts = [],
    },
    ref
  ) {
    const { t } = useTranslation(['assignments']);
    const [batchOpen, setBatchOpen] = useState(false);
    const [batch, setBatch] = useState<BatchEditValue>({ allocation: '', dateMode: '', startDate: '', endDate: '' });

    if (total === 0) {
      // Phase 3：无草稿但可撤销刚创建的行
      if (lastCreatedCount > 0 && onUndoCreate) {
        return (
          <div className="pw-commit-bar pw-commit-bar--undo" ref={ref} data-testid="pw-commit-bar" tabIndex={-1}>
            <span className="pw-commit-summary">{t('assignments:workbench.commit.createdCount', { count: lastCreatedCount })}</span>
            {undoError ? (
              <span className="pw-commit-flag pw-commit-flag--conflict" role="alert" data-testid="pw-undo-error">
                {t('assignments:workbench.commit.undoFailed')}
              </span>
            ) : null}
            <div className="pw-commit-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={undoing || undoDisabled}
                title={undoDisabled ? undoDisabledReason ?? undefined : undefined}
                onClick={onUndoCreate}
                data-testid="pw-undo-create"
              >
                <Undo2 size={14} /> {undoing ? t('assignments:workbench.commit.undoing') : t('assignments:workbench.commit.undoCreate')}
              </button>
            </div>
          </div>
        );
      }
      return null;
    }

    const failedCount = lastSummary?.failed ?? 0;

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
        {batchOpen && onBatchApply ? (
          <div className="pw-commit-batch" data-testid="pw-batch-edit-form">
            <input
              type="number"
              min={1}
              max={200}
              placeholder={t('assignments:workbench.commit.batchAllocation')}
              aria-label={t('assignments:workbench.commit.batchAllocation')}
              value={batch.allocation}
              onChange={(event) => setBatch((prev) => ({ ...prev, allocation: event.target.value }))}
            />
            <select
              aria-label={t('assignments:workload.picker.dateMode')}
              value={batch.dateMode}
              onChange={(event) => setBatch((prev) => ({ ...prev, dateMode: event.target.value as BatchEditValue['dateMode'] }))}
            >
              <option value="">{t('assignments:workbench.composer.modePerTask')}</option>
              <option value="fixed">{t('assignments:workload.dateMode.fixed')}</option>
              <option value="project">{t('assignments:workload.dateMode.project')}</option>
            </select>
            {batch.dateMode === 'fixed' ? (
              <>
                <input
                  type="date"
                  aria-label={t('assignments:workload.edit.startDate')}
                  value={batch.startDate}
                  onChange={(event) => setBatch((prev) => ({ ...prev, startDate: event.target.value }))}
                />
                <input
                  type="date"
                  aria-label={t('assignments:workload.edit.endDate')}
                  value={batch.endDate}
                  onChange={(event) => setBatch((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onBatchApply(batch);
                setBatchOpen(false);
              }}
            >
              {t('assignments:workbench.commit.batchApply', { count: editableDrafts.length })}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBatchOpen(false)}>
              {t('assignments:workload.actions.cancel')}
            </button>
          </div>
        ) : null}
        <div className="pw-commit-actions">
          {onRetryFailed && failedCount > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={submitting}
              onClick={onRetryFailed}
              data-testid="pw-retry-failed"
            >
              <RotateCcw size={14} /> {t('assignments:workbench.commit.retryFailed', { count: failedCount })}
            </button>
          ) : null}
          {onBatchApply && editableDrafts.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={submitting}
              onClick={() => setBatchOpen((prev) => !prev)}
              data-testid="pw-batch-edit"
            >
              <PencilLine size={14} /> {t('assignments:workbench.commit.batchEdit')}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={submitting || continueDisabled}
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
