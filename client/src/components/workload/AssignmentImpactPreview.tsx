import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { useScenario } from '../../contexts/ScenarioContext';
import { workloadDateOnly, type WorkloadAssignment } from '../../lib/personWorkload';

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

function overlapsWindow(row: WorkloadAssignment, start: string, end: string) {
  if (row.status === 'paused') return false;
  const rowStart = workloadDateOnly(row.computed_start_date ?? row.start_date);
  const rowEnd = workloadDateOnly(row.computed_end_date ?? row.end_date);
  if (rowStart && rowStart > end) return false;
  if (rowEnd && rowEnd < start) return false;
  return true;
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
    queryKey: queryKeys.assignments.list({ project_id: projectId, limit: 2000 }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.assignments.list({ project_id: projectId, limit: 2000 } as never);
      return response.data.data as unknown as AssignmentRow[];
    },
    staleTime: 30_000,
  });

  const start = workloadDateOnly(windowStart) ?? asOf;
  const end = workloadDateOnly(windowEnd) ?? start;
  const originalRow = editingRowId
    ? personAssignments.find((row) => row.id === editingRowId)
    : undefined;
  const originalInWindow = originalRow && overlapsWindow(originalRow, start, end);
  const personWindow = personAssignments
    .filter((row) => row.id !== editingRowId && overlapsWindow(row, start, end))
    .reduce((sum, row) => sum + Number(row.allocation_percentage ?? 0), 0);
  const personFrom = personWindow + (originalInWindow ? originalAllocation : 0);
  const personTo = personWindow + proposedAllocation;

  const rows = projectQuery.data ?? [];
  const projectWindow = rows
    .filter((row) => row.project_id === projectId && row.id !== editingRowId && overlapsWindow(row, start, end))
    .reduce((sum, row) => sum + Number(row.allocation_percentage ?? 0), 0);
  const projectFrom =
    projectWindow +
    (originalInWindow && originalRow?.project_id === projectId ? originalAllocation : 0);
  const projectTo = projectWindow + proposedAllocation;
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
