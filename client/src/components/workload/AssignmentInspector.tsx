/**
 * AssignmentInspector 共享件（交互优化设计 S2/§5.1，评审要求"共享布局、
 * 不共享控制逻辑"）：
 * - InspectorShell：头部/字段区/影响区/操作区的唯一布局；
 * - InspectorImpact：draft 与 committed(EDIT) 两种投影的影响预览，
 *   全部走共享 workloadTimeline（§9 口径）；
 * ghost 面板与已提交行面板各自维护控制逻辑，但视觉与预览口径只有一份。
 */
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import {
  workloadTimeline,
  type AvailabilityOverrideInput,
  type DraftTimelineRow,
} from '../../lib/workloadTimeline';
import { workloadDateOnly, type WorkloadAssignment } from '../../lib/personWorkload';

export interface InspectorShellProps {
  title: string;
  badge?: ReactNode;
  testId: string;
  ariaLabel: string;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
  extraTop?: ReactNode;
  children: ReactNode;
  impact: ReactNode;
  actions: ReactNode;
}

export function InspectorShell({
  title,
  badge,
  testId,
  ariaLabel,
  onClose,
  closeDisabled = false,
  className,
  extraTop,
  children,
  impact,
  actions,
}: InspectorShellProps) {
  const { t } = useTranslation(['assignments']);
  return (
    <div
      className={`pw-inspector${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={(event) => {
        // §15：Esc 关闭当前编辑面（committed 有未保存值时由页面转确认框）
        if (event.key === 'Escape' && !closeDisabled) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="pw-inspector-head">
        <strong>{title}</strong>
        {badge}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={t('assignments:workbench.inspector.close')}
          disabled={closeDisabled}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {extraTop}
      {children}
      {impact}
      {actions}
    </div>
  );
}

export type InspectorProjection =
  | {
      mode: 'draft';
      draft: {
        draftId: string;
        kind: 'CREATE' | 'EDIT' | 'REPLACE';
        targetAssignmentId: string | null;
        allocationPercentage: number;
        startDate: string | null;
        endDate: string | null;
        submitState: DraftTimelineRow['submitState'];
      };
    }
  | {
      mode: 'committed';
      row: {
        id: string;
        allocationPercentage: number;
        startDate: string | null;
        endDate: string | null;
        status: string | null;
        /** 原窗口（用于"该行新窗口 vs 现值"的 committed 预览） */
        originalStartDate: string | null;
        originalEndDate: string | null;
      };
    };

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

export interface InspectorImpactProps {
  projection: InspectorProjection;
  assignments: WorkloadAssignment[];
  availability: number | null;
  availabilityOverrides: AvailabilityOverrideInput[];
  asOf: string;
  rangeStart: string;
  rangeEnd: string;
  testId: string;
}

export function InspectorImpact({
  projection,
  assignments,
  availability,
  availabilityOverrides,
  asOf,
  rangeStart,
  rangeEnd,
  testId,
}: InspectorImpactProps) {
  const { t } = useTranslation(['assignments']);

  const impact = useMemo(() => {
    const committed = assignments.map((row) => ({
      id: String(row.id),
      allocationPercentage: Number(row.allocation_percentage ?? 0),
      startDate: row.computed_start_date ?? row.start_date ?? null,
      endDate: row.computed_end_date ?? row.end_date ?? null,
      status: row.status ?? null,
    }));
    const baseOptions = {
      asOf,
      defaultAvailability: availability,
      availabilityOverrides,
    };

    if (projection.mode === 'draft') {
      const draft = projection.draft;
      const options = { ...baseOptions, rangeStart, rangeEnd, granularity: 'week' as const };
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
      return {
        variant: 'point' as const,
        before: pct(before.currentRelativeUtilization),
        after: pct(after.projectedRelativeUtilization),
        overloadCount: after.overloadSegments.length,
      };
    }

    // committed：在"原窗口 ∪ 新窗口"上取峰值，避免只看 asOf 当天把未来调整显示成 0→0
    const row = projection.row;
    const origStart = workloadDateOnly(row.originalStartDate);
    const origEnd = workloadDateOnly(row.originalEndDate);
    const newStart = workloadDateOnly(row.startDate);
    const newEnd = workloadDateOnly(row.endDate);
    const starts = [origStart, newStart].filter(Boolean) as string[];
    const ends = [origEnd, newEnd].filter(Boolean) as string[];
    const windowStart = starts.length > 0 ? starts.sort()[0] : rangeStart;
    const windowEnd = ends.length > 0 ? ends.sort().at(-1) as string : rangeEnd;
    const options = { ...baseOptions, rangeStart: windowStart, rangeEnd: windowEnd, granularity: 'day' as const };
    const before = workloadTimeline(committed, [], options);
    const after = workloadTimeline(
      committed,
      [
        {
          id: 'committed-preview',
          draftId: 'committed-preview',
          kind: 'EDIT',
          targetAssignmentId: row.id,
          allocationPercentage: row.allocationPercentage,
          // 保留原状态：paused 行不得被预览算成有负载（评审 Claude 盯点 1）
          status: row.status,
          startDate: row.startDate,
          endDate: row.endDate,
          submitState: 'IDLE' as const,
        },
      ],
      options
    );
    const peak = (timeline: { segments: Array<{ relativeUtilization: number | null }> }) =>
      timeline.segments.reduce<number | null>((max, segment) => {
        if (segment.relativeUtilization === null) return max;
        return max === null ? segment.relativeUtilization : Math.max(max, segment.relativeUtilization);
      }, null);
    return {
      variant: 'window' as const,
      before: pct(peak(before)),
      after: pct(peak(after)),
      overloadCount: after.overloadSegments.length,
    };
  }, [projection, assignments, availability, availabilityOverrides, asOf, rangeStart, rangeEnd]);

  return (
    <div className="pw-inspector-impact" data-testid={testId}>
      <span>
        {impact.variant === 'point'
          ? t('assignments:workbench.inspector.impact', {
              before: impact.before,
              after: impact.after,
            })
          : t('assignments:workbench.inspector.impactWindow', {
              before: impact.before,
              after: impact.after,
            })}
      </span>
      {impact.overloadCount > 0 ? (
        <span className="pw-inspector-impact-over">
          <AlertTriangle size={13} aria-hidden="true" />
          {t('assignments:workbench.inspector.overloadWarn', { count: impact.overloadCount })}
        </span>
      ) : null}
    </div>
  );
}
