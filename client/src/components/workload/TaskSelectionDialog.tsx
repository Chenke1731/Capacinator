/**
 * TaskSelectionDialog（工作台 v2 §6）——按需弹出的真实任务选择界面。
 *
 * 形态：顶部对齐的居中大弹窗（min(1280px,92vw) × 80–85vh，顶部 24–40px；
 * 矮屏不降级底部弹层，只收窄顶部距离）。内部独立滚动。
 *
 * 数据：GET /projects?selection=1（§13.1），跨页勾选由 selectedTaskIds 维护；
 * 迷你容量热区 = workloadTimeline(committed, ghosts + 临时勾选投影)，三处
 * 容量展示共用同一纯函数。
 *
 * 状态机（§11）：pickerState 只管本弹窗 loading/ready/error 与临时勾选；
 * 关闭/ESC/取消丢弃临时勾选，不清空 draftStore。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import {
  classifySelection,
  createDraftFromTask,
  type AssignmentDraft,
  type SelectionTask,
} from '../../lib/assignmentDrafts';
import {
  workloadTimeline,
  type AvailabilityOverrideInput,
} from '../../lib/workloadTimeline';
import type { WorkloadAssignment } from '../../lib/personWorkload';
import { CapacityHeatStrip } from './CapacityHeatStrip';
import { SelectionComposer, type ComposerValue } from './SelectionComposer';
import { TaskSelectionBoard, type BoardRowAction } from './TaskSelectionBoard';

const PAGE_SIZE = 50;
const RECENT_KEY = 'workbench-recent-tasks';
const RECENT_MAX = 8;

/** Phase 3 最近选择：加泳道时记录任务快照，重开弹窗可一键再选（命令式快速添加） */
function loadRecentTasks(): SelectionTask[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as SelectionTask[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecentTasks(tasks: SelectionTask[]): void {
  try {
    const deduped: SelectionTask[] = [];
    for (const task of tasks) {
      if (!deduped.some((entry) => entry.id === task.id)) deduped.push(task);
    }
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(deduped.slice(0, RECENT_MAX)));
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为会话内不可用
  }
}

export interface TaskSelectionDialogProps {
  open: boolean;
  personId: string;
  personName: string;
  personPrimaryRoleId?: string | null;
  personPrimaryRoleName?: string | null;
  scenarioId: string;
  assignments: WorkloadAssignment[];
  /** 已在泳道的 ghost（迷你热区并入预计） */
  laneDrafts: AssignmentDraft[];
  asOf: string;
  rangeStart: string;
  rangeEnd: string;
  availability: number | null;
  availabilityOverrides: AvailabilityOverrideInput[];
  onAddToLane: (drafts: AssignmentDraft[]) => void;
  onEditExisting: (existingId: string) => void;
  onClose: () => void;
}

export function TaskSelectionDialog(props: TaskSelectionDialogProps) {
  const {
    open,
    personId,
    personName,
    personPrimaryRoleId,
    personPrimaryRoleName,
    scenarioId,
    assignments,
    laneDrafts,
    asOf,
    rangeStart,
    rangeEnd,
    availability,
    availabilityOverrides,
    onAddToLane,
    onEditExisting,
    onClose,
  } = props;
  const { t } = useTranslation(['assignments']);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'demand' | 'all'>('demand');
  const [page, setPage] = useState(1);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<SelectionTask[]>([]);
  const [composer, setComposer] = useState<ComposerValue>({
    roleId: null,
    allocation: '20',
    dateMode: '',
    startDate: '',
    endDate: '',
  });
  const [flash, setFlash] = useState<string | null>(null);
  const [recentTasks, setRecentTasks] = useState<SelectionTask[]>([]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  // G-04（评审）：onClose 入 ref——父组件 inline 箭头函数每次渲染换身份，
  // 若入 effect deps，弹窗打开期间任一父级重渲染都会执行 cleanup 把焦点
  // 夺回遮罩后的按钮，focus trap 可逃逸。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 打开时重置临时勾选（pickerState 与 draftStore 分离，§11）
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      setSelectedTaskIds(new Set());
      setSelectedTasks([]);
      setFlash(null);
      setRecentTasks(loadRecentTasks());
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  // focus trap + ESC（§15）——仅依赖 open 翻转；焦点归还发生在真正关闭时
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const opener = openerRef.current as HTMLElement | null;
      opener?.focus?.();
    };
  }, [open]);

  const rowsQuery = useQuery({
    queryKey: queryKeys.projects.list(
      { selection: '1', search, scope, page, limit: PAGE_SIZE, include_ancestors: search ? '1' : '' } as never,
      scenarioId
    ),
    queryFn: async () => {
      const params: Record<string, unknown> = {
        selection: '1',
        scope,
        page,
        limit: PAGE_SIZE,
      };
      if (search) {
        params.search = search;
        params.include_ancestors = '1';
      }
      const response = await api.projects.list(params as never);
      const payload = response.data as unknown as {
        data?: SelectionTask[];
        pagination?: { page: number; total: number; totalPages: number; has_more?: boolean };
      };
      return {
        rows: (payload.data ?? []).map((row) => ({ ...row, child_count: Number(row.child_count ?? 0) })),
        pagination: payload.pagination ?? { page: 1, total: 0, totalPages: 1 },
      };
    },
    enabled: open,
    staleTime: 30_000,
  });

  const rows = rowsQuery.data?.rows ?? [];
  const pagination = rowsQuery.data?.pagination ?? { page: 1, total: 0, totalPages: 1 };

  const toggleTask = useCallback((task: SelectionTask, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
    setSelectedTasks((prev) => {
      if (checked) return prev.some((row) => row.id === task.id) ? prev : [...prev, task];
      return prev.filter((row) => row.id !== task.id);
    });
  }, []);

  // composer 统一角色覆盖时，同步分类用的角色名
  const composerRoleName = useMemo(() => {
    if (!composer.roleId) return null;
    const fromTask = selectedTasks
      .flatMap((task) => task.role_demands)
      .find((demand) => demand.role_id === composer.roleId);
    return fromTask?.role_name ?? (composer.roleId === personPrimaryRoleId ? personPrimaryRoleName ?? null : null);
  }, [composer.roleId, selectedTasks, personPrimaryRoleId, personPrimaryRoleName]);

  const composerRoleOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ role_id: string; role_name: string; required_headcount: number | null }> = [];
    for (const task of selectedTasks) {
      for (const demand of task.role_demands) {
        if (seen.has(demand.role_id)) continue;
        seen.add(demand.role_id);
        options.push({ role_id: demand.role_id, role_name: demand.role_name, required_headcount: demand.required_headcount });
      }
    }
    if (personPrimaryRoleId && !seen.has(personPrimaryRoleId)) {
      options.push({ role_id: personPrimaryRoleId, role_name: personPrimaryRoleName ?? '', required_headcount: null });
    }
    return options;
  }, [selectedTasks, personPrimaryRoleId, personPrimaryRoleName]);

  /** composer 统一参数变化后，勾选时合法、现在不可 CREATE 的任务必须退出勾选
   *（分类按完整业务键，参数变了键就变了——§6.4/§7.1 重新分类） */
  useEffect(() => {
    if (selectedTasks.length === 0) return;
    const eligible = new Set(
      selectedTasks
        .filter((task) => {
          const demand = task.role_demands[0] ?? null;
          const roleId = composer.roleId ?? demand?.role_id ?? personPrimaryRoleId ?? null;
          const roleName =
            composer.roleId !== null
              ? composerRoleName
              : demand?.role_name ?? personPrimaryRoleName ?? null;
          const phaseId =
            composer.dateMode === 'fixed' || composer.dateMode === 'project'
              ? null
              : demand?.phase_id ?? null;
          return classifySelection(task, { personId, roleId, roleName, phaseId, assignments }).kind === 'CREATE';
        })
        .map((task) => task.id)
    );
    setSelectedTaskIds((prev) => {
      const next = new Set([...prev].filter((id) => eligible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setSelectedTasks((prev) => {
      const next = prev.filter((task) => eligible.has(task.id));
      return next.length === prev.length ? prev : next;
    });
  }, [composer.roleId, composer.dateMode, composerRoleName, personId, personPrimaryRoleId, personPrimaryRoleName, assignments, selectedTasks]);

  // 临时勾选的容量投影（§9.2.4：临时勾选只进弹窗迷你热区，与已加入 ghost 并列）
  const tempDrafts = useMemo(
    () =>
      selectedTasks.map((task) =>
        createDraftFromTask(task, {
          personId,
          personPrimaryRoleId,
          personPrimaryRoleName,
          scenarioId,
          assignments,
          overrides: {
            roleId: composer.roleId,
            allocationPercentage: Number(composer.allocation) || 20,
            ...(composer.dateMode === 'fixed'
              ? { assignmentDateMode: 'fixed' as const, startDate: composer.startDate || null, endDate: composer.endDate || null }
              : composer.dateMode
                ? { assignmentDateMode: composer.dateMode }
                : {}),
          },
        })
      ),
    [selectedTasks, personId, personPrimaryRoleId, personPrimaryRoleName, scenarioId, assignments, composer]
  );

  const miniTimeline = useMemo(
    () =>
      workloadTimeline(
        assignments.map((row) => ({
          id: String(row.id),
          allocationPercentage: Number(row.allocation_percentage ?? 0),
          startDate: row.computed_start_date ?? row.start_date ?? null,
          endDate: row.computed_end_date ?? row.end_date ?? null,
          status: row.status ?? null,
        })),
        [...laneDrafts, ...(tempDrafts.filter(Boolean) as AssignmentDraft[])].map((draft) => ({
          id: draft.draftId,
          draftId: draft.draftId,
          kind: draft.kind,
          targetAssignmentId: draft.targetAssignmentId,
          allocationPercentage: draft.allocationPercentage,
          startDate: draft.startDate,
          endDate: draft.endDate,
          submitState: draft.submitState,
        })),
        {
          asOf,
          rangeStart,
          rangeEnd,
          defaultAvailability: availability,
          availabilityOverrides,
          granularity: 'week',
        }
      ),
    [assignments, laneDrafts, tempDrafts, asOf, rangeStart, rangeEnd, availability, availabilityOverrides]
  );

  const addSelectedToLane = useCallback(() => {
    const drafts = (tempDrafts.filter(Boolean) as AssignmentDraft[]).filter(
      (draft) => draft.kind === 'CREATE' || draft.kind === 'REPLACE'
    );
    if (drafts.length === 0) return;
    onAddToLane(drafts);
    saveRecentTasks([...selectedTasks, ...loadRecentTasks()]);
    setRecentTasks(loadRecentTasks());
    setSelectedTaskIds(new Set());
    setSelectedTasks([]);
    setFlash(t('assignments:workbench.dialog.addedToLane', { count: drafts.length }));
  }, [tempDrafts, onAddToLane, t, selectedTasks]);

  /** Phase 3 命令式快速添加：最近任务一键入泳道，不经过勾选 */
  const quickAddRecent = useCallback(
    (task: SelectionTask) => {
      const draft = createDraftFromTask(task, {
        personId,
        personPrimaryRoleId,
        personPrimaryRoleName,
        scenarioId,
        assignments,
      });
      if (!draft) return;
      onAddToLane([draft]);
      saveRecentTasks([task, ...loadRecentTasks().filter((entry) => entry.id !== task.id)]);
      setRecentTasks(loadRecentTasks());
      setFlash(t('assignments:workbench.dialog.quickAdded', { name: task.name }));
    },
    [personId, personPrimaryRoleId, personPrimaryRoleName, scenarioId, assignments, onAddToLane, t]
  );

  const handleRowAction = useCallback(
    (task: SelectionTask, action: BoardRowAction, payload?: { existingId?: string; slot?: SelectionTask['single_person_slots'][number] }) => {
      if (action === 'edit-existing') {
        if (payload?.existingId) onEditExisting(payload.existingId);
        return;
      }
      if (action === 'replace-slot' && payload?.slot) {
        // 显式替换入口：直接按槽位角色生成 REPLACE ghost（加入泳道，待确认）
        const draft = createDraftFromTask(task, {
          personId,
          personPrimaryRoleId,
          personPrimaryRoleName,
          scenarioId,
          assignments,
          overrides: { roleId: payload.slot.role_id },
        });
        if (draft && draft.kind === 'REPLACE') {
          onAddToLane([draft]);
          setFlash(
            t('assignments:workbench.dialog.replaceAdded', {
              incumbent: payload.slot.incumbent_person_name,
              role: payload.slot.role_name,
            })
          );
        }
      }
    },
    [personId, personPrimaryRoleId, personPrimaryRoleName, scenarioId, assignments, onAddToLane, onEditExisting, t]
  );

  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  if (!open) return null;

  const projectedLabel =
    miniTimeline.projectedRelativeUtilization === null
      ? '—'
      : `${Math.round(miniTimeline.projectedRelativeUtilization)}%`;
  const currentLabel =
    miniTimeline.currentRelativeUtilization === null
      ? '—'
      : `${Math.round(miniTimeline.currentRelativeUtilization)}%`;
  const overload =
    miniTimeline.projectedRelativeUtilization !== null && miniTimeline.projectedRelativeUtilization > 100
      ? Math.round(miniTimeline.projectedRelativeUtilization - 100)
      : null;

  return (
    <div className="pw-dialog-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="pw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-dialog-title"
        data-testid="pw-task-dialog"
      >
        <header className="pw-dialog-head">
          <div className="pw-dialog-title-row">
            <h2 id="pw-dialog-title">
              {t('assignments:workbench.dialog.title', { name: personName })}
            </h2>
            <span className="pw-dialog-selected-count" data-testid="pw-dialog-count">
              {t('assignments:workbench.dialog.selectedCount', { count: selectedTaskIds.size })}
            </span>
            <button type="button" className="btn btn-ghost btn-sm pw-dialog-close" aria-label={t('assignments:workbench.dialog.close')} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          <div className="pw-dialog-heat-row">
            <span className="pw-dialog-heat-label">
              {t('assignments:workbench.dialog.heatCurrent', { value: currentLabel })} →{' '}
              {t('assignments:workbench.dialog.heatProjected', { value: projectedLabel })}
              {overload !== null ? (
                <span className="pw-dialog-heat-over">
                  {t('assignments:workbench.dialog.heatOver', { value: overload })}
                </span>
              ) : null}
            </span>
            <CapacityHeatStrip buckets={miniTimeline.buckets} compact data-testid="pw-mini-heat" />
          </div>
        </header>

        <div className="pw-dialog-toolbar">
          <form
            className="pw-dialog-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              placeholder={t('assignments:workbench.dialog.searchPlaceholder')}
              aria-label={t('assignments:workbench.dialog.searchPlaceholder')}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              {t('assignments:workbench.dialog.search')}
            </button>
          </form>
          <label className="pw-dialog-scope">
            <span>{t('assignments:workload.picker.scopeLabel')}</span>
            <select
              value={scope}
              aria-label={t('assignments:workload.picker.scopeLabel')}
              onChange={(event) => {
                setScope(event.target.value as 'demand' | 'all');
                setPage(1);
              }}
            >
              <option value="demand">{t('assignments:workload.picker.scopeDemand')}</option>
              <option value="all">{t('assignments:workload.picker.scopeAll')}</option>
            </select>
          </label>
        </div>

        <div className="pw-dialog-body">
          {recentTasks.length > 0 ? (
            <div className="pw-dialog-recent" data-testid="pw-recent-tasks">
              <span className="pw-dialog-recent-label">{t('assignments:workbench.dialog.recent')}</span>
              {recentTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="pw-chip pw-chip--quick"
                  onClick={() => quickAddRecent(task)}
                  aria-label={t('assignments:workbench.dialog.quickAdd', { name: task.name })}
                >
                  + {task.name}
                </button>
              ))}
            </div>
          ) : null}
          {rowsQuery.isError ? (
            <div className="pw-board pw-board--error" role="alert">
              <span>{t('assignments:workbench.board.loadFailed')}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => rowsQuery.refetch()}>
                <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
              </button>
            </div>
          ) : (
            <TaskSelectionBoard
              rows={rows}
              personId={personId}
              assignments={assignments}
              unifiedRoleId={composer.roleId}
              unifiedRoleName={composerRoleName}
              unifiedDateMode={composer.dateMode}
              primaryRoleId={personPrimaryRoleId ?? null}
              primaryRoleName={personPrimaryRoleName ?? null}
              selectedTaskIds={selectedTaskIds}
              onToggle={toggleTask}
              onRowAction={handleRowAction}
              loading={rowsQuery.isLoading}
            />
          )}
        </div>

        <footer className="pw-dialog-foot">
          <div className="pw-dialog-pagination">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page <= 1 || rowsQuery.isFetching}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              aria-label={t('assignments:workbench.dialog.prevPage')}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              {t('assignments:workbench.dialog.pageOf', {
                page,
                pages: Math.max(1, pagination.totalPages ?? 1),
                total: pagination.total ?? 0,
              })}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page >= (pagination.totalPages ?? 1) || rowsQuery.isFetching}
              onClick={() => setPage((prev) => prev + 1)}
              aria-label={t('assignments:workbench.dialog.nextPage')}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {selectedTaskIds.size > 0 ? (
            <div className="pw-dialog-chips" data-testid="pw-dialog-chips">
              {selectedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="pw-chip"
                  onClick={() => toggleTask(task, false)}
                  aria-label={t('assignments:workbench.dialog.removeChip', { name: task.name })}
                >
                  {task.name}
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}

          <SelectionComposer
            value={composer}
            onChange={setComposer}
            roleOptions={composerRoleOptions}
            selectedTasks={selectedTasks}
          />

          {flash ? (
            <div className="pw-dialog-flash" role="status">{flash}</div>
          ) : null}

          <div className="pw-dialog-actions">
            <span className="pw-dialog-impact" data-testid="pw-dialog-impact">
              {t('assignments:workbench.dialog.impact', { current: currentLabel, projected: projectedLabel })}
            </span>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('assignments:workbench.dialog.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selectedTaskIds.size === 0}
              onClick={addSelectedToLane}
              data-testid="pw-add-to-lane"
            >
              {t('assignments:workbench.dialog.addToLane', { count: selectedTaskIds.size })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
