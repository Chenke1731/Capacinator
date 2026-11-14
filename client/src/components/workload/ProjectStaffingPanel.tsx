/**
 * ProjectStaffingPanel（工作台 v2 Phase 3 项目泳道模式）：
 * 从人员泳道点击项目名 → 查看该项目在当前场景下的全员配置（谁在做什么、
 * 比例、日期、状态），不离开人员页。数据走 assignments 列表接口的
 * project_id 过滤（场景绑定），只读。
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { workloadDateOnly } from '../../lib/personWorkload';

interface StaffingRow {
  id: string;
  person_id: string;
  person_name?: string | null;
  role_name?: string | null;
  phase_name?: string | null;
  allocation_percentage?: number | string | null;
  status?: string | null;
  start_date?: string | number | null;
  end_date?: string | number | null;
  computed_start_date?: string | number | null;
  computed_end_date?: string | number | null;
}

export interface ProjectStaffingPanelProps {
  projectId: string;
  projectName: string;
  scenarioId: string;
  /** 参考日：状态列判断"是否计入当前"，与人员页口径一致 */
  asOf: string;
  /** S5：跳转必须经页面守卫（未保存 ghost/面板修改时拒绝）；面板只在允许后关闭 */
  onNavigateToPerson: (personId: string, assignmentId: string) => void;
  onClose: () => void;
}

export function ProjectStaffingPanel({
  projectId,
  projectName,
  scenarioId,
  asOf,
  onNavigateToPerson,
  onClose,
}: ProjectStaffingPanelProps) {
  const { t } = useTranslation(['assignments']);
  const staffingQuery = useQuery<StaffingRow[]>({
    queryKey: queryKeys.assignments.list({ project_id: projectId, limit: 200 }, scenarioId),
    queryFn: async () => {
      const response = await api.assignments.list(
        { project_id: projectId, limit: 200 } as never,
        { scenarioId }
      );
      const payload = response.data as unknown as { data?: StaffingRow[] };
      return payload.data ?? [];
    },
    staleTime: 30_000,
  });

  const inclusionLabel = (row: StaffingRow) => {
    if (row.status === 'paused') return t('assignments:workload.exclusion.paused');
    const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
    const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
    if (start && start > asOf) return t('assignments:workload.exclusion.future');
    if (end && end < asOf) return t('assignments:workload.exclusion.ended');
    return t('assignments:workload.included');
  };

  const rows = (staffingQuery.data ?? []).slice().sort((a, b) => {
    const statusRank = (row: StaffingRow) => (row.status === 'active' ? 0 : 1);
    if (statusRank(a) !== statusRank(b)) return statusRank(a) - statusRank(b);
    return String(a.person_name ?? '').localeCompare(String(b.person_name ?? ''));
  });

  return (
    <div className="pw-project-staffing" data-testid="pw-project-staffing">
      <div className="pw-project-staffing-head">
        <strong>{t('assignments:workbench.staffing.title', { name: projectName })}</strong>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label={t('assignments:workbench.staffing.close')}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {staffingQuery.isLoading ? (
        <div role="status">{t('assignments:workbench.staffing.loading')}</div>
      ) : staffingQuery.isError ? (
        <div role="alert">
          {t('assignments:workbench.staffing.error')}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => staffingQuery.refetch()}>
            {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div>{t('assignments:workbench.staffing.empty')}</div>
      ) : (
        <>
          {(staffingQuery.data ?? []).length >= 200 ? (
            <div className="pw-staffing-truncated" role="status">
              {t('assignments:workbench.staffing.truncated')}
            </div>
          ) : null}
        <table className="pw-board-table">
          <caption className="sr-only">{t('assignments:workbench.staffing.title', { name: projectName })}</caption>
          <thead>
            <tr>
              <th>{t('assignments:workbench.staffing.person')}</th>
              <th>{t('assignments:workload.columns.role')}</th>
              <th>{t('assignments:workload.columns.phase')}</th>
              <th>{t('assignments:workload.columns.dates')}</th>
              <th>{t('assignments:workload.columns.allocation')}</th>
              <th>{t('assignments:workload.columns.status')}</th>
              <th>{t('assignments:workload.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
              const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
              return (
                <tr key={row.id} className={row.status === 'paused' ? 'pw-staffing-row--paused' : undefined}>
                  <td>{row.person_name ?? t('common:na')}</td>
                  <td>{row.role_name ?? t('common:na')}</td>
                  <td>{row.phase_name ?? t('common:na')}</td>
                  <td>{start ?? '—'} → {end ?? '—'}</td>
                  <td>{Number(row.allocation_percentage ?? 0)}%</td>
                  <td>{inclusionLabel(row)}</td>
                  <td>
                    {/* C（affordance 整改）：跨人员编辑的正路是去那个人的工作负载页 */}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-testid={`pw-staffing-adjust-${row.person_id}`}
                      aria-label={`${t('assignments:workbench.staffing.adjustPerson')} ${row.person_name ?? ''}`}
                      onClick={() => onNavigateToPerson(row.person_id, row.id)}
                    >
                      {t('assignments:workbench.staffing.adjustPerson')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}
