/**
 * TaskSelectionBoard（工作台 v2 §6.3）——真实任务数据的选择模式投影表。
 * 只保留：复选框/项目任务/状态/角色需求/日期/人力/已分配；其他列隐藏。
 *
 * 勾选规则（§6.4）：父行与 SR 祖先行只导航；终态任务禁用并显示原因；
 * 分类按完整业务键（classifySelection）——EDIT/REPLACE 时复选框禁用并给
 * 行内入口。跨页勾选由 selectedTaskIds 维护，服务端只负责当前页。
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import {
  classifySelection,
  type SelectionTask,
} from '../../lib/assignmentDrafts';
import type { WorkloadAssignment } from '../../lib/personWorkload';

export type BoardRowAction = 'edit-existing' | 'replace-slot';

export interface TaskSelectionBoardProps {
  rows: SelectionTask[];
  personId: string;
  assignments: WorkloadAssignment[];
  /** composer 统一角色覆盖（null=未统一，用各任务默认角色分类） */
  unifiedRoleId: string | null;
  unifiedRoleName: string | null;
  selectedTaskIds: Set<string>;
  onToggle: (task: SelectionTask, checked: boolean) => void;
  onRowAction: (task: SelectionTask, action: BoardRowAction, payload?: { existingId?: string; slot?: SelectionTask['single_person_slots'][number] }) => void;
  loading?: boolean;
}

function isTerminal(task: SelectionTask): boolean {
  return task.lifecycle_state === 'delivered' || task.lifecycle_state === 'cancelled';
}

function demandLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  task: SelectionTask
): string {
  if (task.role_demands.length === 0) return t('assignments:workbench.demand.unconfigured');
  return task.role_demands
    .map((demand) => {
      const headcount =
        demand.required_headcount === null
          ? t('assignments:workbench.demand.unconfigured')
          : String(demand.required_headcount);
      return `${demand.role_name} ${headcount}`;
    })
    .join(' / ');
}

function staffingLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  task: SelectionTask
): string {
  const byRole = new Map<string, { required: number | null; assigned: number }>();
  for (const demand of task.role_demands) {
    byRole.set(demand.role_id, { required: demand.required_headcount, assigned: 0 });
  }
  for (const row of task.assigned_summary) {
    if (row.status !== 'active') continue;
    const entry = byRole.get(row.role_id);
    if (entry) entry.assigned += row.allocation_percentage / 100;
    else byRole.set(row.role_id, { required: null, assigned: row.allocation_percentage / 100 });
  }
  if (byRole.size === 0) return '—';
  return [...byRole.entries()]
    .map(([roleId, entry]) => {
      const name = task.role_demands.find((demand) => demand.role_id === roleId)?.role_name ?? roleId.slice(0, 6);
      const required = entry.required === null ? '?' : String(entry.required);
      const round = Math.round(entry.assigned * 10) / 10;
      const gap = entry.required !== null && round < entry.required ? ` ${t('assignments:workbench.demand.gap', { count: Math.ceil(entry.required - round) })}` : '';
      return `${name} ${round}/${required}${gap}`;
    })
    .join(' / ');
}

function dateLabel(task: SelectionTask): string {
  const start = task.timeline_start ?? task.aspiration_start;
  const end = task.timeline_end ?? task.aspiration_finish;
  if (!start && !end) return '—';
  const short = (value: string | null) => (value ? value.slice(0, 7) : '—');
  return `${short(start)}~${short(end)}`;
}

export function TaskSelectionBoard({
  rows,
  personId,
  assignments,
  unifiedRoleId,
  unifiedRoleName,
  selectedTaskIds,
  onToggle,
  onRowAction,
  loading = false,
}: TaskSelectionBoardProps) {
  const { t } = useTranslation(['assignments']);

  const annotated = useMemo(() => {
    return rows.map((task) => {
      const defaultDemand = task.role_demands[0] ?? null;
      const roleId = unifiedRoleId ?? defaultDemand?.role_id ?? null;
      const roleName =
        unifiedRoleId !== null ? unifiedRoleName : defaultDemand?.role_name ?? null;
      const phaseId = defaultDemand?.phase_id ?? null;
      const classification = classifySelection(task, {
        personId,
        roleId,
        roleName,
        phaseId,
        assignments,
      });
      const terminal = isTerminal(task);
      const selectable = !task.is_ancestor && !task.has_children && !terminal && classification.kind === 'CREATE';
      return { task, classification, terminal, selectable };
    });
  }, [rows, personId, assignments, unifiedRoleId, unifiedRoleName]);

  if (loading) {
    return (
      <div className="pw-board pw-board--loading" role="status">
        {t('assignments:workbench.board.loading')}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="pw-board pw-board--empty" role="status">
        {t('assignments:workbench.board.empty')}
      </div>
    );
  }

  return (
    <div className="pw-board-wrap">
      <table className="pw-board-table" data-testid="pw-task-board">
        <caption className="sr-only">{t('assignments:workbench.board.caption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="pw-board-check">{t('assignments:workbench.board.select')}</th>
            <th scope="col" className="pw-board-task">{t('assignments:workbench.board.task')}</th>
            <th scope="col" className="pw-board-state">{t('assignments:workbench.board.state')}</th>
            <th scope="col" className="pw-board-demand">{t('assignments:workbench.board.demand')}</th>
            <th scope="col" className="pw-board-dates">{t('assignments:workbench.board.dates')}</th>
            <th scope="col" className="pw-board-staffing">{t('assignments:workbench.board.staffing')}</th>
            <th scope="col" className="pw-board-actions">{t('assignments:workbench.board.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {annotated.map(({ task, classification, terminal, selectable }) => {
            const checked = selectedTaskIds.has(task.id);
            const parent = task.is_ancestor || task.has_children;
            const reason = terminal
              ? t('assignments:workbench.board.terminal')
              : parent
                ? t('assignments:workbench.board.parentOnly')
                : classification.kind === 'EDIT'
                  ? t('assignments:workbench.board.alreadyAssigned')
                  : classification.kind === 'REPLACE'
                    ? t('assignments:workbench.board.slotOccupied', {
                        name: classification.slot.incumbent_person_name,
                      })
                    : null;
            return (
              <tr
                key={task.id}
                className={[
                  parent ? 'pw-board-row--parent' : '',
                  task.parent_id && !task.is_ancestor ? 'pw-board-row--child' : '',
                  terminal ? 'pw-board-row--terminal' : '',
                  checked ? 'pw-board-row--checked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-task-id={task.id}
              >
                <td className="pw-board-check">
                  {parent || terminal || classification.kind !== 'CREATE' ? (
                    <span className="pw-board-lock" title={reason ?? undefined}>
                      <Lock size={13} aria-hidden="true" />
                      <span className="sr-only">{reason}</span>
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onToggle(task, event.target.checked)}
                      aria-label={t('assignments:workbench.board.selectTask', { name: task.name })}
                      data-testid={`pw-select-task-${task.id}`}
                    />
                  )}
                </td>
                <td className="pw-board-task">
                  <span className="pw-board-name">{task.name}</span>
                  {task.project_sub_type_name ? (
                    <span className="pw-board-subtype">{task.project_sub_type_name}</span>
                  ) : null}
                </td>
                <td className="pw-board-state">
                  <span className={`pw-board-state-chip pw-board-state--${task.lifecycle_state ?? 'none'}`}>
                    {task.lifecycle_state ?? t('assignments:workbench.board.stateNone')}
                  </span>
                </td>
                <td className="pw-board-demand">{demandLabel(t, task)}</td>
                <td className="pw-board-dates">{dateLabel(task)}</td>
                <td className="pw-board-staffing">{staffingLabel(t, task)}</td>
                <td className="pw-board-actions">
                  {classification.kind === 'EDIT' && !terminal ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onRowAction(task, 'edit-existing', { existingId: classification.existingId })}
                    >
                      {t('assignments:workbench.board.editExisting')}
                    </button>
                  ) : null}
                  {classification.kind === 'REPLACE' && !terminal ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onRowAction(task, 'replace-slot', { slot: classification.slot })}
                    >
                      {t('assignments:workbench.board.replaceOccupant', { name: classification.slot.incumbent_person_name })}
                    </button>
                  ) : null}
                  {reason && classification.kind === 'CREATE' && !selectable ? (
                    <span className="pw-board-reason">{reason}</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
