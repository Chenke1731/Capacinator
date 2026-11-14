/**
 * CommittedInspector（交互优化设计 S2/§5.1，Phase A）——已提交分配的就地面板：
 * 身份列（角色/阶段/来源/版本）只读，比例与 fixed 日期可改，影响预览走
 * "该行新窗口 vs 现值"（InspectorImpact committed 变体）。
 *
 * 控制逻辑与 ghost 面板分离（评审要求）：本面板为受控表单，保存由页面
 * 统一走编辑会话（快照版本 + Saving 锁 + 409 显式刷新）；不含拖拽草稿逻辑。
 */
import { useTranslation } from 'react-i18next';
import type { KeyboardEvent } from 'react';
import { AlertTriangle, LocateFixed, Save, X } from 'lucide-react';
import { InspectorImpact, InspectorShell } from './AssignmentInspector';
import { isImeComposing } from '../../lib/ime';
import type { AvailabilityOverrideInput } from '../../lib/workloadTimeline';
import type { WorkloadAssignment } from '../../lib/personWorkload';

export interface CommittedInspectorRow {
  id: string;
  projectName: string;
  roleName: string | null;
  phaseName: string | null;
  source: 'scenario' | 'direct' | string | null;
  version: number | null;
  dateMode: string | null;
  derivedStartDate: string | null;
  derivedEndDate: string | null;
}

export interface CommittedInspectorForm {
  allocation: string;
  startDate: string;
  endDate: string;
}

export interface CommittedInspectorProps {
  row: CommittedInspectorRow;
  form: CommittedInspectorForm;
  baseline: { allocation: number; startDate: string; endDate: string };
  saving: boolean;
  error: string | null;
  /** 409 版本冲突：展示"使用最新值刷新" */
  conflict: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<CommittedInspectorForm>) => void;
  onSave: () => void;
  onRefreshLatest: () => void;
  onLocateInTable: () => void;
  onRequestClose: () => void;
  assignments: WorkloadAssignment[];
  availability: number | null;
  availabilityOverrides: AvailabilityOverrideInput[];
  asOf: string;
  rangeStart: string;
  rangeEnd: string;
}

export function CommittedInspector({
  row,
  form,
  baseline,
  saving,
  error,
  conflict,
  disabled = false,
  onChange,
  onSave,
  onRefreshLatest,
  onLocateInTable,
  onRequestClose,
  assignments,
  availability,
  availabilityOverrides,
  asOf,
  rangeStart,
  rangeEnd,
}: CommittedInspectorProps) {
  const { t } = useTranslation(['assignments']);
  const mode = (row.dateMode ?? 'fixed') as 'fixed' | 'phase' | 'project';
  const locked = disabled || saving;
  const dirty =
    Number(form.allocation) !== baseline.allocation ||
    (mode === 'fixed' && (form.startDate !== baseline.startDate || form.endDate !== baseline.endDate));

  /** §15：面板内 Enter=保存（输入法组合中不抢 Enter）。 */
  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || isImeComposing(event)) return;
    event.preventDefault();
    if (!locked && dirty) onSave();
  };

  return (
    <InspectorShell
      title={row.projectName}
      testId="pw-committed-inspector"
      ariaLabel={t('assignments:workbench.committed.title', { name: row.projectName })}
      onClose={onRequestClose}
      closeDisabled={saving}
      badge={
        <span className="pw-inspector-kind">
          {row.source === 'direct'
            ? t('assignments:workload.source.direct')
            : t('assignments:workload.source.scenario')}
          {row.version !== null ? ` · v${row.version}` : ''}
        </span>
      }
      impact={
        <InspectorImpact
          projection={{
            mode: 'committed',
            row: {
              id: row.id,
              allocationPercentage: Number(form.allocation) || 0,
              startDate: form.startDate || null,
              endDate: form.endDate || null,
              status: null,
              originalStartDate: baseline.startDate || null,
              originalEndDate: baseline.endDate || null,
            },
          }}
          assignments={assignments}
          availability={availability}
          availabilityOverrides={availabilityOverrides}
          asOf={asOf}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          testId="pw-committed-impact"
        />
      }
      actions={
        <div className="pw-inspector-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLocateInTable}>
            <LocateFixed size={14} /> {t('assignments:workbench.committed.locateInTable')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={onRequestClose}
          >
            <X size={14} /> {t('assignments:workbench.inspector.done')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={locked || !dirty}
            onClick={onSave}
            data-testid="pw-committed-save"
          >
            <Save size={14} />{' '}
            {saving ? t('assignments:workbench.committed.saving') : t('assignments:workbench.committed.save')}
          </button>
        </div>
      }
    >
      <div className="pw-inspector-grid" onKeyDown={onGridKeyDown}>
        <div className="pw-inspector-readonly">
          <span>{t('assignments:workload.picker.role')}</span>
          <strong>{row.roleName ?? t('common:na')}</strong>
        </div>
        <div className="pw-inspector-readonly">
          <span>{t('assignments:workload.columns.phase')}</span>
          <strong>{row.phaseName ?? t('common:na')}</strong>
        </div>
        <div className="pw-inspector-readonly">
          <span>{t('assignments:workload.picker.dateMode')}</span>
          <strong>{t(`assignments:workload.dateMode.${mode}`)}</strong>
        </div>

        <label>
          <span>{t('assignments:workload.edit.allocation')}</span>
          <input
            type="number"
            min={1}
            max={200}
            value={form.allocation}
            disabled={locked}
            aria-label={t('assignments:workload.edit.allocation')}
            onChange={(event) => onChange({ allocation: event.target.value })}
          />
        </label>

        {mode === 'fixed' ? (
          <>
            <label>
              <span>{t('assignments:workload.edit.startDate')}</span>
              <input
                type="date"
                value={form.startDate}
                disabled={locked}
                aria-label={t('assignments:workload.edit.startDate')}
                onChange={(event) => onChange({ startDate: event.target.value })}
              />
            </label>
            <label>
              <span>{t('assignments:workload.edit.endDate')}</span>
              <input
                type="date"
                value={form.endDate}
                disabled={locked}
                aria-label={t('assignments:workload.edit.endDate')}
                onChange={(event) => onChange({ endDate: event.target.value })}
              />
            </label>
          </>
        ) : (
          <div className="pw-inspector-derived-box">
            <span>
              {t(
                mode === 'phase'
                  ? 'assignments:workload.picker.selectPhase'
                  : 'assignments:workbench.inspector.projectWindow'
              )}
            </span>
            <strong>
              {row.derivedStartDate ?? '—'} → {row.derivedEndDate ?? '—'}
            </strong>
            <em>{t('assignments:workload.edit.derivedDatesReadonly')}</em>
          </div>
        )}
      </div>

      {error ? (
        <div className="pw-inspector-submit-error" role="alert" data-testid="pw-committed-error">
          <AlertTriangle size={13} aria-hidden="true" /> {error}
          {conflict ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saving}
              onClick={onRefreshLatest}
              data-testid="pw-committed-refresh"
            >
              {t('assignments:workbench.committed.refreshLatest')}
            </button>
          ) : null}
        </div>
      ) : null}
    </InspectorShell>
  );
}
