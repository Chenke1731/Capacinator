import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { useScenario } from '../../contexts/ScenarioContext';
import { workloadDateOnly, type WorkloadAssignment } from '../../lib/personWorkload';
import { workloadTimeline } from '../../lib/workloadTimeline';

interface AssignmentRow extends WorkloadAssignment {
  project_id: string;
  project_name?: string;
}

interface AssignmentImpactPreviewProps {
  projectId: string;
  projectName?: string | null;
  /** 预览窗口；缺省回退到 asOf（例如 fixed 日期还没填） */
  windowStart?: string | null;
  windowEnd?: string | null;
  asOf: string;
  /** 当前人员全部场景分配，用于按预览窗口重算 */
  personAssignments: WorkloadAssignment[];
  /** 被编辑行当前值（按窗口计入）；新增传 0 */
  originalAllocation: number;
  /** 本行编辑/新增后的比例 */
  proposedAllocation: number;
  /** 编辑已有行时传行 id，用于扣除旧值；新增不传 */
  editingRowId?: string;
  availability: number | null;
}

/**
 * D-04a（前端评审）：第 4 处容量展示并入 workloadTimeline——此前这里自算
 * "窗口求和"，与泳道/弹窗/inspector 的日分段+peak 口径漂移（相邻不重叠的
 * 分配会被加成同时超载）。from=现状（含被编辑行原值），to=扣原行加提议值，
 * 均取窗口内日分段 peak。
 */
function peakLoadInWindow(
  committed: WorkloadAssignment[],
  proposed: { allocation: number; start: string; end: string } | null,
  asOf: string,
  start: string,
  end: string,
  availability: number | null
): number {
  const drafts = proposed
    ? [
        {
          id: 'impact-preview',
          draftId: 'impact-preview',
          kind: 'CREATE' as const,
          targetAssignmentId: null,
          allocationPercentage: proposed.allocation,
          startDate: proposed.start,
          endDate: proposed.end,
          submitState: 'IDLE' as const,
        },
      ]
    : [];
  const timeline = workloadTimeline(
    committed.map((row) => ({
      id: String(row.id),
      allocationPercentage: Number(row.allocation_percentage ?? 0),
      startDate: row.computed_start_date ?? row.start_date ?? null,
      endDate: row.computed_end_date ?? row.end_date ?? null,
      status: row.status ?? null,
    })),
    drafts,
    {
      asOf,
      rangeStart: start,
      rangeEnd: end,
      defaultAvailability: availability,
      granularity: 'day',
    }
  );
  return timeline.segments.reduce((max, segment) => Math.max(max, segment.load), 0);
}

export function AssignmentImpactPreview({
  projectId,
  projectName,
  windowStart,
  windowEnd,
  asOf,
  personAssignments,
  originalAllocation,
  proposedAllocation,
  editingRowId,
  availability,
}: AssignmentImpactPreviewProps) {
  const { t } = useTranslation();
  const { currentScenario } = useScenario();
  const projectQuery = useQuery<AssignmentRow[]>({
    queryKey: queryKeys.assignments.list({ project_id: projectId, limit: 200 }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.assignments.list({ project_id: projectId, limit: 200 } as never);
      return response.data.data as unknown as AssignmentRow[];
    },
    staleTime: 30_000,
  });

  const start = workloadDateOnly(windowStart) ?? asOf;
  const end = workloadDateOnly(windowEnd) ?? start;

  const personWithoutEditing = editingRowId
    ? personAssignments.filter((row) => row.id !== editingRowId)
    : personAssignments;
  const personFrom = peakLoadInWindow(personAssignments, null, asOf, start, end, availability);
  const personTo = peakLoadInWindow(
    personWithoutEditing,
    { allocation: proposedAllocation, start, end },
    asOf,
    start,
    end,
    availability
  );

  const rows = projectQuery.data ?? [];
  const projectRows = rows.filter((row) => row.project_id === projectId);
  const projectWithoutEditing = editingRowId
    ? projectRows.filter((row) => row.id !== editingRowId)
    : projectRows;
  const projectFrom = peakLoadInWindow(projectRows, null, asOf, start, end, availability);
  const projectTo = peakLoadInWindow(
    projectWithoutEditing,
    { allocation: proposedAllocation, start, end },
    asOf,
    start,
    end,
    availability
  );
  void originalAllocation; // from 值已由"现状集合"承载（含被编辑行原值）
  const relative =
    availability !== null && availability > 0 ? (personTo / availability) * 100 : null;
  const over = availability !== null && personTo > availability;

  return (
    <div className="pw-impact" data-testid="pw-impact-preview">
      <span className="pw-impact-title">{t('assignments:workload.impact.title')}</span>
      <span>
        {t('assignments:workload.impact.person', {
          from: personFrom,
          to: personTo,
          relative: relative === null ? '—' : relative.toFixed(0),
        })}
      </span>
      <span>
        {t('assignments:workload.impact.project', {
          project: projectName ?? rows.find((row) => row.project_id === projectId)?.project_name ?? projectId,
          from: projectFrom,
          to: projectTo,
        })}
      </span>
      {over ? (
        <span className="pw-impact-over">
          <AlertTriangle size={13} aria-hidden="true" />
          {t('assignments:workload.impact.over')}
        </span>
      ) : null}
      <span className="pw-impact-note">{t('assignments:workload.impact.note')}</span>
    </div>
  );
}
