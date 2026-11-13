/**
 * GhostInspector（工作台 v2 §8）——ghost 参数面板：
 * 角色/比例/日期模式/fixed 起止/phase 阶段选择/project 派生窗口只读/
 * 影响预览/移除草稿。REPLACE 额外显示占用者摘要 + 显式确认替换（未确认
 * 不参与提交，§10.3）。关闭后焦点回原 ghost（§15）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import type { AssignmentDraft } from '../../lib/assignmentDrafts';
import {
  workloadTimeline,
  type AvailabilityOverrideInput,
} from '../../lib/workloadTimeline';
import type { WorkloadAssignment } from '../../lib/personWorkload';

interface PhaseOption {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface GhostInspectorProps {
  draft: AssignmentDraft;
  assignments: WorkloadAssignment[];
  availability: number | null;
  availabilityOverrides: AvailabilityOverrideInput[];
  asOf: string;
  rangeStart: string;
  rangeEnd: string;
  onUpdate: (draftId: string, patch: Partial<AssignmentDraft>) => void;
  onRemove: (draftId: string) => void;
  onClose: () => void;
  disabled?: boolean;
}

export function GhostInspector({
  draft,
  assignments,
  availability,
  availabilityOverrides,
  asOf,
  rangeStart,
  rangeEnd,
  onUpdate,
  onRemove,
  onClose,
  disabled = false,
}: GhostInspectorProps) {
  const { t } = useTranslation(['assignments']);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstControlRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    firstControlRef.current?.focus();
  }, [draft.draftId]);

  const phasesQuery = useQuery<PhaseOption[]>({
    queryKey: queryKeys.projects.phases(draft.projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: draft.projectId, limit: 200 });
      const payload = response.data as unknown as { data?: Array<Record<string, any>> };
      return (payload.data ?? []).map((row) => ({
        id: String(row.phase_id ?? row.id),
        name: String(row.phase_name ?? row.name ?? row.phase_id ?? ''),
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
      }));
    },
    enabled: draft.assignmentDateMode === 'phase',
    staleTime: 60_000,
  });
  const phaseOptions = phasesQuery.data ?? [];
  const selectedPhase = phaseOptions.find((phase) => phase.id === draft.phaseId);

  // 影响预览：单条 ghost 的 before → after（共用 workloadTimeline，§9）
  const impact = useMemo(() => {
    const committed = assignments.map((row) => ({
      id: String(row.id),
      allocationPercentage: Number(row.allocation_percentage ?? 0),
      startDate: row.computed_start_date ?? row.start_date ?? null,
      endDate: row.computed_end_date ?? row.end_date ?? null,
      status: row.status ?? null,
    }));
    const options = {
      asOf,
      rangeStart,
      rangeEnd,
      defaultAvailability: availability,
      availabilityOverrides,
      granularity: 'week' as const,
    };
    const before = workloadTimeline(committed, [], options);
    const after = workloadTimeline(
      committed,
      [
        {
          id: draft.draftId,
          draftId: draft.draftId,
          kind: draft.kind,
          targetAssignmentId: draft.targetAssignmentId,
          allocationPercentage: draft.allocationPercentage,
          startDate: draft.startDate,
          endDate: draft.endDate,
          submitState: draft.submitState,
        },
      ],
      options
    );
    return { before, after };
  }, [assignments, draft, asOf, rangeStart, rangeEnd, availability, availabilityOverrides]);

  const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);
  const errorCodes = new Set(draft.errors);
  const errorText = (code: string) => t(`assignments:workbench.errors.${code}`);

  return (
    <div
      ref={panelRef}
      className="pw-inspector"
      role="group"
      aria-label={t('assignments:workbench.inspector.title', { name: draft.projectName })}
      data-testid="pw-ghost-inspector"
    >
      <div className="pw-inspector-head">
        <strong>{draft.projectName}</strong>
        <span className={`pw-inspector-kind pw-inspector-kind--${draft.kind.toLowerCase()}`}>
          {t(`assignments:workbench.kind.${draft.kind}`)}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={t('assignments:workbench.inspector.close')}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      {draft.kind === 'REPLACE' && draft.incumbent ? (
        <div className="pw-inspector-incumbent" data-testid="pw-replace-incumbent">
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <strong>
              {t('assignments:workbench.inspector.incumbent', {
                name: draft.incumbent.personName,
                role: draft.incumbent.roleName,
              })}
            </strong>
            <span>
              {draft.incumbent.startDate ?? '—'} → {draft.incumbent.endDate ?? '—'} · v
              {draft.incumbent.version}
            </span>
            <em>{t('assignments:workbench.inspector.replaceWarning')}</em>
            <label className="pw-inspector-confirm">
              <input
                type="checkbox"
                checked={draft.replaceConfirmed}
                disabled={disabled}
                onChange={(event) => onUpdate(draft.draftId, { replaceConfirmed: event.target.checked })}
                aria-label={t('assignments:workbench.inspector.confirmReplace')}
              />
              {t('assignments:workbench.inspector.confirmReplace')}
            </label>
          </div>
        </div>
      ) : null}

      <div className="pw-inspector-grid">
        <label>
          <span>{t('assignments:workload.picker.role')}</span>
          <select
            ref={firstControlRef}
            value={draft.roleId ?? ''}
            disabled={disabled}
            aria-label={t('assignments:workload.picker.role')}
            onChange={(event) => {
              const roleId = event.target.value || null;
              const roleName = draft.roleOptions.find((option) => option.role_id === roleId)?.role_name ?? null;
              onUpdate(draft.draftId, { roleId, roleName });
            }}
          >
            {draft.roleOptions.length === 0 ? (
              <option value="">{t('assignments:workbench.inspector.noRoles')}</option>
            ) : null}
            {draft.roleOptions.map((option) => (
              <option key={option.role_id} value={option.role_id}>
                {option.role_name}
                {option.required_headcount !== null ? ` ×${option.required_headcount}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('assignments:workload.edit.allocation')}</span>
          <input
            type="number"
            min={1}
            max={200}
            value={draft.allocationPercentage}
            disabled={disabled}
            aria-label={t('assignments:workload.edit.allocation')}
            onChange={(event) =>
              onUpdate(draft.draftId, { allocationPercentage: Number(event.target.value) })
            }
          />
        </label>

        <label>
          <span>{t('assignments:workload.picker.dateMode')}</span>
          <select
            value={draft.assignmentDateMode}
            disabled={disabled}
            aria-label={t('assignments:workload.picker.dateMode')}
            onChange={(event) =>
              onUpdate(draft.draftId, {
                assignmentDateMode: event.target.value as AssignmentDraft['assignmentDateMode'],
                // 切模式时重置派生窗口
                startDate: null,
                endDate: null,
              })
            }
          >
            <option value="phase">{t('assignments:workload.dateMode.phase')}</option>
            <option value="project">{t('assignments:workload.dateMode.project')}</option>
            <option value="fixed">{t('assignments:workload.dateMode.fixed')}</option>
          </select>
        </label>

        {draft.assignmentDateMode === 'fixed' ? (
          <>
            <label>
              <span>{t('assignments:workload.edit.startDate')}</span>
              <input
                type="date"
                value={draft.startDate ?? ''}
                disabled={disabled}
                aria-label={t('assignments:workload.edit.startDate')}
                onChange={(event) => onUpdate(draft.draftId, { startDate: event.target.value || null })}
              />
            </label>
            <label>
              <span>{t('assignments:workload.edit.endDate')}</span>
              <input
                type="date"
                value={draft.endDate ?? ''}
                disabled={disabled}
                aria-label={t('assignments:workload.edit.endDate')}
                onChange={(event) => onUpdate(draft.draftId, { endDate: event.target.value || null })}
              />
            </label>
          </>
        ) : draft.assignmentDateMode === 'phase' ? (
          <label>
            <span>{t('assignments:workload.picker.selectPhase')}</span>
            <select
              value={draft.phaseId ?? ''}
              disabled={disabled || phasesQuery.isLoading}
              aria-label={t('assignments:workload.picker.selectPhase')}
              onChange={(event) => {
                const phase = phaseOptions.find((option) => option.id === event.target.value);
                onUpdate(draft.draftId, {
                  phaseId: event.target.value || null,
                  startDate: phase?.start_date ?? null,
                  endDate: phase?.end_date ?? null,
                });
              }}
            >
              <option value="">{t('assignments:workload.picker.selectPhase')}</option>
              {phaseOptions.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.name}
                </option>
              ))}
            </select>
            {selectedPhase ? (
              <span className="pw-inspector-derived">
                {selectedPhase.start_date ?? '—'} → {selectedPhase.end_date ?? '—'}
              </span>
            ) : null}
          </label>
        ) : (
          <div className="pw-inspector-derived-box">
            <span>{t('assignments:workbench.inspector.projectWindow')}</span>
            <strong>
              {draft.taskContext.aspirationStart ?? '—'} → {draft.taskContext.aspirationFinish ?? '—'}
            </strong>
          </div>
        )}
      </div>

      {draft.errors.length > 0 ? (
        <ul className="pw-inspector-errors" role="alert">
          {[...errorCodes].map((code) => (
            <li key={code} className={code === 'duplicate_key' || code === 'slot_unconfirmed' || code === 'duplicate_in_drafts' || code === 'version_conflict' ? 'pw-error--conflict' : 'pw-error--invalid'}>
              {errorText(code)}
            </li>
          ))}
        </ul>
      ) : null}
      {draft.submitState === 'FAILED' && draft.submitError ? (
        <p className="pw-inspector-submit-error" role="alert">{draft.submitError}</p>
      ) : null}
      {draft.submitState === 'UNKNOWN' ? (
        <p className="pw-inspector-unknown" role="status">{t('assignments:workbench.inspector.unknown')}</p>
      ) : null}

      <div className="pw-inspector-impact" data-testid="pw-ghost-impact">
        <span>
          {t('assignments:workbench.inspector.impact', {
            before: pct(impact.before.currentRelativeUtilization),
            after: pct(impact.after.projectedRelativeUtilization),
          })}
        </span>
        {impact.after.overloadSegments.length > 0 ? (
          <span className="pw-inspector-impact-over">
            <AlertTriangle size={13} aria-hidden="true" />
            {t('assignments:workbench.inspector.overloadWarn', {
              count: impact.after.overloadSegments.length,
            })}
          </span>
        ) : null}
      </div>

      <div className="pw-inspector-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => onRemove(draft.draftId)}
        >
          <Trash2 size={14} /> {t('assignments:workbench.inspector.remove')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t('assignments:workbench.inspector.done')}
        </button>
      </div>
    </div>
  );
}
