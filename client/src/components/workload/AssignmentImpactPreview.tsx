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
  asOf: string;
  /** 人员当前负荷（含被编辑行原值） */
  personCurrent: number;
  /** 被编辑行当前计入值；新增传 0 */
  originalAllocation: number;
  /** 本行编辑/新增后的比例 */
  proposedAllocation: number;
  /** 编辑已有行时传行 id，用于项目侧扣除旧值；新增不传 */
  editingRowId?: string;
  availability: number | null;
}

function countsInCurrent(row: AssignmentRow, asOf: string) {
  if (row.status === 'paused') return false;
  const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
  const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
  if (start && start > asOf) return false;
  if (end && end < asOf) return false;
  return true;
}

export function AssignmentImpactPreview({
  projectId,
  projectName,
  asOf,
  personCurrent,
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

  const rows = projectQuery.data ?? [];
  const projectCurrent = rows
    .filter((row) => row.project_id === projectId && countsInCurrent(row, asOf))
    .reduce((sum, row) => sum + Number(row.allocation_percentage ?? 0), 0);
  const replaced = editingRowId
    ? rows.find((row) => row.id === editingRowId && countsInCurrent(row, asOf))
    : undefined;
  const projectOriginal = replaced ? Number(replaced.allocation_percentage ?? 0) : 0;
  const projectProjected = projectCurrent - projectOriginal + proposedAllocation;
  const personProjected = personCurrent - originalAllocation + proposedAllocation;
  const relative =
    availability !== null && availability > 0 ? (personProjected / availability) * 100 : null;
  const over = availability !== null && personProjected > availability;

  return (
    <div className="pw-impact" data-testid="pw-impact-preview">
      <span className="pw-impact-title">{t('assignments:workload.impact.title')}</span>
      <span>
        {t('assignments:workload.impact.person', {
          from: personCurrent,
          to: personProjected,
          relative: relative === null ? '—' : relative.toFixed(0),
        })}
      </span>
      <span>
        {t('assignments:workload.impact.project', {
          project: projectName ?? rows.find((row) => row.project_id === projectId)?.project_name ?? projectId,
          from: projectCurrent,
          to: projectProjected,
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
