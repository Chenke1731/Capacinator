import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BriefcaseBusiness,
  ListPlus,
  Pencil,
  Pause,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useScenario } from '../contexts/ScenarioContext';
import { invalidateSchedulingReads } from '../lib/invalidateSchedulingReads';
import { fetchPersonUtilization, personUtilizationRowsFrom } from '../lib/personUtilizationData';
import { fetchAllPersonAssignments } from '../lib/personAssignments';
import { fetchApprovedAvailabilityOverrides } from '../lib/availabilityOverrides';
import {
  summarizePersonWorkload,
  workloadDateOnly,
  type ExcludedWorkloadAssignment,
  type WorkloadAssignment,
} from '../lib/personWorkload';
import { workloadTimeline, type AvailabilityOverrideInput } from '../lib/workloadTimeline';
import type { AssignmentDraft } from '../lib/assignmentDrafts';
import { useDraftAssignments } from '../hooks/useDraftAssignments';
import { toISODateString } from '../utils/dateUtils';
import { Badge } from '../components/ui/badge';
import { AssignmentImpactPreview } from '../components/workload/AssignmentImpactPreview';
import { DraftCommitBar } from '../components/workload/DraftCommitBar';
import { GhostInspector } from '../components/workload/GhostInspector';
import { ProjectStaffingPanel } from '../components/workload/ProjectStaffingPanel';
import { TaskSelectionDialog } from '../components/workload/TaskSelectionDialog';
import { WorkloadGantt } from '../components/workload/WorkloadGantt';
import './PersonWorkload.css';

interface PersonRow {
  id: string;
  name: string;
  primary_role_name?: string | null;
  default_availability_percentage?: number | null;
  roles?: Array<{ role_id?: string; role_name?: string; is_primary?: number }>;
}

interface AssignmentRow extends WorkloadAssignment {
  project_id: string;
  project_name?: string | null;
  role_name?: string | null;
  phase_name?: string | null;
  assignment_type?: 'scenario' | 'direct' | string | null;
  assignment_date_mode?: 'fixed' | 'phase' | 'project' | string | null;
  date_resolution_error?: string | null;
  version?: number;
}

interface RowDraft {
  allocation: string;
  startDate: string;
  endDate: string;
}

interface PersonOption {
  id: string;
  name: string;
}

interface HandoverDraft {
  successorId: string;
  effectiveDate: string;
  allocation: string;
}

type Row = AssignmentRow | ExcludedWorkloadAssignment<AssignmentRow>;

function isExcludedRow(row: Row): row is ExcludedWorkloadAssignment<AssignmentRow> {
  return 'assignment' in row && 'reason' in row;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  unknown: 'outline',
  unavailable: 'secondary',
  over: 'destructive',
  full: 'warning',
  partial: 'outline',
  available: 'success',
};

function shiftMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function PersonWorkload() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentScenario, scenarios, setCurrentScenario, lockScenarioSwitching, unlockScenarioSwitching } = useScenario();

  const personQuery = useQuery<PersonRow>({
    queryKey: queryKeys.people.detail(id ?? ''),
    queryFn: async () => (await api.people.get(id!)).data as unknown as PersonRow,
    enabled: !!id,
  });

  // §13.1 完整分页读取：不允许把 limit=2000 当完整集合
  const assignmentsQuery = useQuery<AssignmentRow[], Error>({
    queryKey: queryKeys.assignments.list({ person_id: id, limit: 200 }, currentScenario?.id),
    queryFn: async () => {
      const page = await fetchAllPersonAssignments(id!, currentScenario?.id);
      return page.rows as unknown as AssignmentRow[];
    },
    enabled: !!id,
  });

  const utilizationQuery = useQuery({
    queryKey: queryKeys.people.utilization(currentScenario?.id),
    queryFn: fetchPersonUtilization,
  });
  const peopleQuery = useQuery<PersonOption[]>({
    queryKey: queryKeys.people.list({ is_active: 'true' }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.people.list({ limit: 500, is_active: 'true' });
      return response.data.data as unknown as PersonOption[];
    },
    staleTime: 60_000,
  });

  const utilizationRow = personUtilizationRowsFrom(utilizationQuery.data).find(
    (row) => String(row.person_id) === id
  );
  // 参考日优先用服务端 utilization 端点返回的 as_of；旧数据没有该字段时
  // 只用于展示，不参与容量口径（selector 明确要求传入合法 asOf）。
  const asOf =
    typeof utilizationRow?.as_of === 'string' && utilizationRow.as_of
      ? utilizationRow.as_of
      : toISODateString(new Date());
  const availabilityRaw = utilizationQuery.isError
    ? null
    : utilizationRow?.current_availability_percentage;
  // 归一为 number|null：缺失=null（数据不可用），不回退 100%
  const availability =
    availabilityRaw === null || availabilityRaw === undefined || availabilityRaw === ''
      ? null
      : Number.isFinite(Number(availabilityRaw))
        ? Number(availabilityRaw)
        : null;

  const summary = useMemo(
    () =>
      summarizePersonWorkload<AssignmentRow>(assignmentsQuery.data ?? [], {
        asOf,
        availability,
      }),
    [assignmentsQuery.data, asOf, availability]
  );

  // ---- 工作台 v2：泳道时间范围（默认未来 3 个月，§20.3；mini-map 可移动窗口）----
  const [rangeEndOverride, setRangeEndOverride] = useState<string | null>(null);
  const [rangeStartOverride, setRangeStartOverride] = useState<string | null>(null);
  const rangeStart = rangeStartOverride ?? asOf;
  const defaultRangeEnd = useMemo(() => shiftMonths(asOf, 3), [asOf]);
  const rangeEnd = rangeEndOverride ?? defaultRangeEnd;

  // F3（DeepSeek P2 #3）：覆盖全集按时间轴窗口取数（approved-only）——
  // 旧实现只从 utilization 行取"今天生效"的单一窗口，未来已批准休假
  // （整周 0%）不可见，热区按默认可用率误报正常。所有容量面共用本数组。
  const overridesWindowEnd = useMemo(() => shiftMonths(asOf, 12), [asOf]);
  const overridesQuery = useQuery<AvailabilityOverrideInput[]>({
    queryKey: queryKeys.availability.list({
      person_id: id,
      is_approved: true,
      start_date: asOf,
      end_date: overridesWindowEnd,
    } as never),
    queryFn: () => fetchApprovedAvailabilityOverrides(id!, asOf, overridesWindowEnd),
    enabled: Boolean(id) && !utilizationQuery.isError,
    staleTime: 60_000,
  });
  const availabilityOverrides = useMemo<AvailabilityOverrideInput[]>(() => {
    if (overridesQuery.data) return overridesQuery.data;
    // 查询未完成/失败时的保底：utilization 行的当前生效窗口（旧口径，
    // 不丢当前信息）；查询成功后以完整集合为准
    const start = utilizationRow?.availability_start;
    const end = utilizationRow?.availability_end;
    const percentage = utilizationRow?.current_availability_percentage;
    if (!start || !end || percentage === null || percentage === undefined) return [];
    return [
      {
        start: String(start).slice(0, 10),
        end: String(end).slice(0, 10),
        percentage: Number(percentage),
        isApproved: true,
      },
    ];
  }, [overridesQuery.data, utilizationRow]);

  const defaultAvailability = personQuery.data?.default_availability_percentage ?? null;
  // C2（Codex P2#4 + D-01a）：热区默认可用率=人员档案默认值，而不是当前
  // 生效值——临时覆盖(50%)到期后必须回落 100，此前 `availability ?? 默认`
  // 让覆盖值成了全时间轴默认。utilization 行缺失/失败时热区判"数据不可用"
  //（null），不伪造。覆盖窗口本身由 availabilityOverrides 承载。
  const heatDefaultAvailability = utilizationQuery.isLoading
    ? null
    : utilizationQuery.isError || !utilizationRow
      ? null
      : defaultAvailability;

  // ---- 工作台 v2：草稿（draftStore）----
  const activeScenarioId = currentScenario?.id ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ganttCollapsed, setGanttCollapsed] = useState(false);
  const [inspectorDraftId, setInspectorDraftId] = useState<string | null>(null);
  const [staffingProject, setStaffingProject] = useState<{ id: string; name: string } | null>(null);
  const addAssignmentButtonRef = useRef<HTMLButtonElement | null>(null);
  const commitBarRef = useRef<HTMLDivElement | null>(null);

  const queryClient = useQueryClient();
  const refreshAssignments = useCallback(async () => {
    await invalidateSchedulingReads(queryClient);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.assignments.list({ person_id: id }, currentScenario?.id),
    });
  }, [queryClient, id, currentScenario?.id]);

  const draftStore = useDraftAssignments({
    personId: id ?? '',
    assignments: assignmentsQuery.data ?? [],
    onAfterCommit: refreshAssignments,
  });

  // 场景绑定（§12）：草稿绑定加入时的场景；切场景→只读+禁提交
  const draftScenarioId = draftStore.drafts[0]?.scenarioId ?? activeScenarioId;
  const draftScenarioMismatch =
    draftStore.drafts.length > 0 && draftScenarioId !== activeScenarioId;

  // CommitInFlight 锁（§12）：提交中锁定场景切换与页面离开
  useEffect(() => {
    if (draftStore.submitting) {
      lockScenarioSwitching(t('assignments:workbench.commit.lockReason'));
    } else {
      unlockScenarioSwitching();
    }
    return () => unlockScenarioSwitching();
  }, [draftStore.submitting, lockScenarioSwitching, unlockScenarioSwitching, t]);

  // 刷新/离开守卫（§16：未提交 ghost 提示丢弃）
  const hasPendingDrafts = draftStore.drafts.some((draft) => draft.submitState !== 'SUCCEEDED');
  useEffect(() => {
    if (!hasPendingDrafts) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasPendingDrafts]);

  // G-05（评审）：SPA 内导航守卫——beforeunload 只覆盖刷新/关窗，页内路由
  // （返回按钮/侧栏链接）在有未提交 ghost 时也必须确认。捕获阶段拦站内
  // <a href="/...">；浏览器返回键不在本守卫范围（BrowserRouter 无法拦截
  // popstate 而不破坏历史栈，边界已记录）。
  const hasPendingDraftsRef = useRef(false);
  hasPendingDraftsRef.current = hasPendingDrafts;
  const leaveConfirmText = t('assignments:workbench.leaveConfirm');
  const confirmLeaveIfPending = useCallback(() => {
    if (!hasPendingDraftsRef.current) return true;
    return window.confirm(leaveConfirmText);
  }, [leaveConfirmText]);
  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (!hasPendingDraftsRef.current || event.defaultPrevented) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      if (!window.confirm(leaveConfirmText)) event.preventDefault();
    };
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [leaveConfirmText]);

  // 加入泳道后焦点移到草稿摘要（§15）
  const handleAddToLane = useCallback(
    (drafts: AssignmentDraft[]) => {
      draftStore.addDrafts(drafts);
      setDialogOpen(false);
      window.requestAnimationFrame(() => commitBarRef.current?.focus());
    },
    [draftStore]
  );

  const handleDialogEditExisting = useCallback(
    (existingId: string) => {
      setDialogOpen(false);
      const row = (assignmentsQuery.data ?? []).find((candidate) => String(candidate.id) === existingId);
      if (row) {
        beginEditRef.current?.(row);
      }
    },
    [assignmentsQuery.data]
  );

  // beginEdit 在表格渲染闭包里定义较晚，用 ref 转发（dialog 从表格外部调用）
  const beginEditRef = useRef<((row: AssignmentRow) => void) | null>(null);

  // 泳道 timeline：committed + ghost（三处容量展示共用，§9）。
  // D-02a：场景失配时草稿只读且不进入热区投影（A 场景草稿叠加 B 场景
  // committed 的"预计值"没有业务含义）——泳道 bar 层仍显示 ghost。
  const projectedDrafts = draftScenarioMismatch ? [] : draftStore.drafts;
  const timeline = useMemo(
    () =>
      workloadTimeline(
        (assignmentsQuery.data ?? []).map((row) => ({
          id: String(row.id),
          allocationPercentage: Number(row.allocation_percentage ?? 0),
          startDate: row.computed_start_date ?? row.start_date ?? null,
          endDate: row.computed_end_date ?? row.end_date ?? null,
          status: row.status ?? null,
        })),
        projectedDrafts.map((draft) => ({
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
          defaultAvailability: heatDefaultAvailability,
          availabilityOverrides,
          granularity: 'week',
        }
      ),
    [assignmentsQuery.data, projectedDrafts, asOf, rangeStart, rangeEnd, heatDefaultAvailability, availabilityOverrides]
  );

  const inspectorDraft = draftStore.drafts.find((draft) => draft.draftId === inspectorDraftId) ?? null;

  /** §15：关闭 inspector 后焦点回原 ghost；ghost 已移除则回草稿摘要，
   * 草稿清空后回"添加分配"（N-06：焦点不落 body） */
  const focusGhostOrCommitBar = useCallback((draftId: string) => {
    window.requestAnimationFrame(() => {
      const ghost = document.querySelector<HTMLElement>(
        `[data-testid="pw-ghost-bar"][data-draft-id="${draftId}"]`
      );
      (ghost ?? commitBarRef.current ?? addAssignmentButtonRef.current)?.focus?.();
    });
  }, []);

  // Phase 3 mini-map：12 个月月桶总览（含 ghost 投影），点击月桶移动观察窗
  const minimapTimeline = useMemo(
    () =>
      workloadTimeline(
        (assignmentsQuery.data ?? []).map((row) => ({
          id: String(row.id),
          allocationPercentage: Number(row.allocation_percentage ?? 0),
          startDate: row.computed_start_date ?? row.start_date ?? null,
          endDate: row.computed_end_date ?? row.end_date ?? null,
          status: row.status ?? null,
        })),
        projectedDrafts.map((draft) => ({
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
          rangeStart: asOf,
          rangeEnd: shiftMonths(asOf, 12),
          defaultAvailability: heatDefaultAvailability,
          availabilityOverrides,
          granularity: 'month',
        }
      ),
    [assignmentsQuery.data, projectedDrafts, asOf, heatDefaultAvailability, availabilityOverrides]
  );

  // Phase 2：拖动/缩放落点（钳制 start<=end、至少 1 天、且不早于参考日——
  // G-08：泳道左界=asOf，ghost 拖/改到过去会永久不可见且定位空转）
  const handleGhostDatesChange = useCallback(
    (draftId: string, next: { startDate: string; endDate: string }) => {
      if (!next.startDate || !next.endDate) return;
      const floor = asOf;
      const rawStart = next.startDate <= next.endDate ? next.startDate : next.endDate;
      const rawEnd = next.startDate <= next.endDate ? next.endDate : next.startDate;
      const start = rawStart < floor ? floor : rawStart;
      const end = rawEnd < start ? start : rawEnd;
      draftStore.updateDraft(draftId, { startDate: start, endDate: end });
    },
    [draftStore, asOf]
  );

  // Phase 3 批量编辑：统一参数套用到全部可编辑 ghost（未在途、未成功、未锁定）
  const editableDrafts = draftStore.drafts.filter(
    (draft) => draft.submitState === 'IDLE' || draft.submitState === 'FAILED'
  );
  const handleBatchApply = useCallback(
    (value: { allocation: string; dateMode: string; startDate: string; endDate: string }) => {
      const allocation = Number(value.allocation);
      for (const draft of editableDrafts) {
        const patch: Partial<AssignmentDraft> = {};
        if (Number.isFinite(allocation) && allocation > 0 && allocation <= 200) {
          patch.allocationPercentage = allocation;
        }
        if (value.dateMode === 'fixed' && value.startDate && value.endDate && value.startDate <= value.endDate) {
          patch.assignmentDateMode = 'fixed';
          patch.startDate = value.startDate;
          patch.endDate = value.endDate;
          patch.phaseId = null;
        } else if (value.dateMode === 'project') {
          patch.assignmentDateMode = 'project';
          patch.startDate = draft.taskContext.aspirationStart;
          patch.endDate = draft.taskContext.aspirationFinish;
          patch.phaseId = null;
        }
        if (Object.keys(patch).length > 0) draftStore.updateDraft(draft.draftId, patch);
      }
    },
    [editableDrafts, draftStore]
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft>({ allocation: '', startDate: '', endDate: '' });
  /** B8（Codex P1#2）：编辑开始时的行快照（版本+字段基线）——保存只发相对
   * 快照改过的字段并用快照版本做乐观锁；后台刷新拿到新 version 也不允许
   * 旧表单值借着新令牌覆盖他人修改。 */
  const [editBaseline, setEditBaseline] = useState<{
    version?: number;
    allocation: number;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [handoverRowId, setHandoverRowId] = useState<string | null>(null);
  const [handoverDraft, setHandoverDraft] = useState<HandoverDraft>({
    successorId: '',
    effectiveDate: '',
    allocation: '',
  });
  const [handoverMessage, setHandoverMessage] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({});
  /** 批量编辑开始时的快照：只发用户改过的行 + 行自己的快照版本 */
  const [batchBaselines, setBatchBaselines] = useState<Record<string, { version?: number; allocation: number }>>({});
  const [batchMessage, setBatchMessage] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const scenarioMismatch = Boolean(editingId && editScenarioId && editScenarioId !== activeScenarioId);

  const beginEdit = (row: AssignmentRow) => {
    setEditingId(row.id);
    setEditScenarioId(activeScenarioId || null);
    setRowError(null);
    const startDate = workloadDateOnly(row.start_date) ?? '';
    const endDate = workloadDateOnly(row.end_date) ?? '';
    setDraft({
      allocation: String(Number(row.allocation_percentage ?? 0)),
      startDate,
      endDate,
    });
    setEditBaseline({
      version: row.version,
      allocation: Number(row.allocation_percentage ?? 0),
      startDate,
      endDate,
    });
  };
  beginEditRef.current = beginEdit;

  const cancelEdit = () => {
    setEditingId(null);
    setEditScenarioId(null);
    setRowError(null);
    setEditBaseline(null);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ row, draft: next, scenarioId }: { row: AssignmentRow; draft: RowDraft; scenarioId: string }) => {
      const payload: Record<string, unknown> = {};
      const allocation = Number(next.allocation);
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
        throw new Error(t('assignments:workload.edit.invalidAllocation'));
      }
      // 与编辑时快照比较（而非最新行）：后台刷新后的行值不是用户所见基线
      const baseline = editBaseline ?? {
        version: row.version,
        allocation: Number(row.allocation_percentage ?? 0),
        startDate: workloadDateOnly(row.start_date) ?? '',
        endDate: workloadDateOnly(row.end_date) ?? '',
      };
      if (allocation !== baseline.allocation) {
        payload.allocation_percentage = allocation;
      }

      const mode = row.assignment_date_mode ?? 'fixed';
      if (mode === 'fixed') {
        if (!next.startDate || !next.endDate) {
          throw new Error(t('assignments:workload.edit.invalidDates'));
        }
        if (next.startDate > next.endDate) {
          throw new Error(t('assignments:workload.edit.invalidDateOrder'));
        }
        if (next.startDate !== baseline.startDate) {
          payload.start_date = next.startDate;
        }
        if (next.endDate !== baseline.endDate) {
          payload.end_date = next.endDate;
        }
      }

      if (Object.keys(payload).length === 0) {
        return { noop: true, row };
      }
      // 乐观锁令牌取编辑时快照的版本——他人已改则 409，不借新令牌写旧值
      if (baseline.version !== undefined) payload.expected_version = baseline.version;
      const response = await api.assignments.update(row.id, payload as never, { scenarioId });
      return response.data;
    },
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: (_data, { row }) => {
      setSavingId(null);
      setEditingId(null);
      setEditScenarioId(null);
      setRowError(null);
      setEditBaseline(null);
      void invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      const status = error?.response?.status;
      const message =
        status === 409
          ? t('assignments:workload.edit.versionConflict')
          : String(
              error?.response?.data?.error ??
                error?.response?.data?.message ??
                error?.message ??
                t('assignments:workload.edit.saveFailed')
            );
      setRowError({ id: row.id, message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ row, scenarioId }: { row: AssignmentRow; scenarioId: string; focusIndex?: number }) =>
      api.assignments.delete(
        row.id,
        row.version !== undefined ? { expected_version: row.version } : undefined,
        { scenarioId }
      ),
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: async (_data, { row, focusIndex }) => {
      setSavingId(null);
      setRowError(null);
      await invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
      window.requestAnimationFrame(() => {
        const buttons = document.querySelectorAll<HTMLElement>(
          '.person-workload-page [data-testid="pw-edit-row"]'
        );
        if (buttons.length === 0) return;
        const index = focusIndex === undefined ? 0 : Math.min(Math.max(focusIndex, 0), buttons.length - 1);
        buttons[index]?.focus();
      });
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      setRowError({
        id: row.id,
        message: String(
          error?.response?.data?.error ??
            error?.response?.data?.message ??
            error?.message ??
            t('assignments:workload.edit.deleteFailed')
        ),
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ row, status, scenarioId }: { row: AssignmentRow; status: 'active' | 'paused'; scenarioId: string }) =>
      api.assignments.update(
        row.id,
        {
          status,
          ...(row.version !== undefined ? { expected_version: row.version } : {}),
        } as never,
        { scenarioId }
      ),
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: (_data, { row }) => {
      setSavingId(null);
      setRowError(null);
      void invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      setRowError({
        id: row.id,
        message: String(
          error?.response?.data?.error ??
            error?.response?.data?.message ??
            error?.message ??
            t('assignments:workload.edit.saveFailed')
        ),
      });
    },
  });

  const toggleStatus = (row: AssignmentRow) => {
    const nextStatus = row.status === 'paused' ? 'active' : 'paused';
    if (row.assignment_type === 'direct') {
      const message = t(
        nextStatus === 'paused'
          ? 'assignments:workload.edit.pauseDirectConfirm'
          : 'assignments:workload.edit.resumeDirectConfirm'
      );
      if (!window.confirm(message)) return;
    }
    statusMutation.mutate({ row, status: nextStatus, scenarioId: activeScenarioId });
  };

  const canHandover = (row: AssignmentRow) =>
    row.assignment_type !== 'direct' &&
    row.status === 'active' &&
    (row.assignment_date_mode ?? 'fixed') === 'fixed' &&
    Boolean(workloadDateOnly(row.start_date) && workloadDateOnly(row.end_date));

  const beginHandover = (row: AssignmentRow) => {
    const start = workloadDateOnly(row.start_date);
    const end = workloadDateOnly(row.end_date);
    let effectiveDate = asOf;
    if (!start || effectiveDate <= start) {
      effectiveDate = shiftDays(start ?? asOf, 1);
    }
    if (end && effectiveDate > end) effectiveDate = end;
    setHandoverRowId(row.id);
    setHandoverMessage(null);
    setHandoverDraft({
      successorId: peopleQuery.data?.find((candidate) => candidate.id !== id)?.id ?? '',
      effectiveDate,
      allocation: String(Number(row.allocation_percentage ?? 0)),
    });
  };

  const handoverMutation = useMutation({
    mutationFn: async ({
      row,
      draft: next,
      scenarioId,
    }: {
      row: AssignmentRow;
      draft: HandoverDraft;
      scenarioId: string;
    }) => {
      if (!next.successorId) throw new Error(t('assignments:workload.handover.selectSuccessor'));
      if (!next.effectiveDate) throw new Error(t('assignments:workload.handover.invalidDate'));
      const allocation = Number(next.allocation);
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
        throw new Error(t('assignments:workload.edit.invalidAllocation'));
      }
      const response = await api.assignments.handover(
        row.id,
        {
          successor_person_id: next.successorId,
          effective_date: next.effectiveDate,
          allocation_percentage: allocation,
          expected_version: row.version ?? 1,
        },
        { scenarioId }
      );
      return response.data.data;
    },
    onMutate: ({ row }) => setSavingId(row.id),
    onSuccess: (data, { row }) => {
      setSavingId(null);
      setHandoverRowId(null);
      setHandoverMessage({
        tone: data.warning ? 'warning' : 'success',
        text: data.warning
          ? `${t('assignments:workload.handover.success')} ${data.warning}`
          : t('assignments:workload.handover.success'),
      });
      void invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      setHandoverMessage({
        tone: 'error',
        text: String(
          error?.response?.data?.message ??
            error?.response?.data?.error ??
            error?.message ??
            t('assignments:workload.handover.failed')
        ),
      });
      setRowError({ id: row.id, message: String(error?.message ?? t('assignments:workload.handover.failed')) });
    },
  });

  const allWorkloadRows = (): AssignmentRow[] => [
    ...summary.current,
    ...summary.excluded.map((excludedRow) => excludedRow.assignment),
  ];

  const startBatch = () => {
    const drafts: Record<string, string> = {};
    const baselines: Record<string, { version?: number; allocation: number }> = {};
    for (const row of allWorkloadRows()) {
      drafts[row.id] = String(Number(row.allocation_percentage ?? 0));
      baselines[row.id] = { version: row.version, allocation: Number(row.allocation_percentage ?? 0) };
    }
    setBatchDrafts(drafts);
    setBatchBaselines(baselines);
    setBatchMessage(null);
    setBatchMode(true);
    setEditingId(null);
    setEditScenarioId(null);
    setHandoverRowId(null);
    setHandoverMessage(null);
  };

  const batchSaveMutation = useMutation({
    mutationFn: async () => {
      // B8（Codex P1#2/#7）：只发用户相对"开始批量时快照"实际改过的行，
      // 乐观锁用各行的快照版本——后台刷新既不会把未编辑行卷进保存，
      // 也不会借新版本令牌覆盖他人修改。
      const updates = allWorkloadRows()
        .map((row) => ({ row, value: batchDrafts[row.id], baseline: batchBaselines[row.id] }))
        .filter(
          ({ value, baseline }) =>
            value !== undefined &&
            baseline !== undefined &&
            value !== String(baseline.allocation)
        );
      if (updates.length === 0) return { saved: 0, failed: 0, noChanges: true };

      let saved = 0;
      let failed = 0;
      const savedIds: string[] = [];
      for (const { row, value, baseline } of updates) {
        const allocation = Number(value);
        if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
          failed += 1;
          continue;
        }
        try {
          await api.assignments.update(
            row.id,
            {
              allocation_percentage: allocation,
              ...(baseline.version !== undefined ? { expected_version: baseline.version } : {}),
            } as never,
            { scenarioId: activeScenarioId }
          );
          saved += 1;
          savedIds.push(row.id);
        } catch {
          failed += 1;
        }
      }
      return { saved, failed, noChanges: false, savedIds };
    },
    onSuccess: ({ saved, failed, noChanges, savedIds }) => {
      if (noChanges) {
        setBatchMessage({ tone: 'warning', text: t('assignments:workload.batch.noChanges') });
        return;
      }
      if (failed > 0) {
        // Codex P2#7：部分失败保留批量草稿——失败行（及其余未保存行）的
        // 输入不清空，用户可改值重试；只移除已保存成功的行
        setBatchDrafts((prev) => {
          const next = { ...prev };
          for (const id of savedIds ?? []) delete next[id];
          return next;
        });
        setBatchMessage({
          tone: 'warning',
          text: t('assignments:workload.batch.partial', { saved, failed }),
        });
      } else {
        setBatchMode(false);
        setBatchDrafts({});
        setBatchBaselines({});
        setBatchMessage({ tone: 'success', text: t('assignments:workload.batch.saved', { count: saved }) });
      }
      void invalidateSchedulingReads(queryClient);
    },
    onError: (error: any) => {
      setBatchMessage({
        tone: 'error',
        text: String(error?.message ?? t('assignments:workload.batch.failed')),
      });
    },
  });

  const confirmDelete = (row: AssignmentRow) => {
    const message =
      row.assignment_type === 'direct'
        ? t('assignments:workload.edit.deleteDirectConfirm')
        : t('assignments:workload.edit.deleteConfirm');
    if (window.confirm(message)) {
      const allRows = [
        ...summary.current,
        ...summary.excluded.map((excludedRow) => excludedRow.assignment),
      ];
      const focusIndex = allRows.findIndex((candidate) => candidate.id === row.id);
      deleteMutation.mutate({
        row,
        scenarioId: activeScenarioId,
        focusIndex: focusIndex >= 0 ? focusIndex : 0,
      });
    }
  };

  if (!id) return null;

  if (personQuery.isLoading) {
    return (
      <div className="page-container person-workload-page">
        <div className="pw-state" role="status">{t('assignments:workload.states.loading')}</div>
      </div>
    );
  }

  if (personQuery.isError || !personQuery.data) {
    return (
      <div className="page-container person-workload-page">
        <button className="btn btn-ghost pw-back" onClick={() => navigate('/people')}>
          <ArrowLeft size={16} /> {t('assignments:workload.back')}
        </button>
        <div className="pw-empty" role="alert">
          <AlertTriangle size={32} />
          <h1>{t('assignments:workload.states.personNotFound')}</h1>
          <button className="btn btn-primary" onClick={() => navigate('/people')}>
            {t('assignments:workload.back')}
          </button>
        </div>
      </div>
    );
  }

  const person = personQuery.data;
  const scenarioName =
    currentScenario?.name ?? t('assignments:workload.source.scenario');
  const relativeLabel =
    utilizationQuery.isLoading || summary.availability === null || summary.availability === 0
      ? '—'
      : `${summary.relativeUtilization?.toFixed(0)}%`;
  const availabilityLabel =
    utilizationQuery.isLoading || summary.availability === null
      ? '—'
      : `${summary.availability}%`;
  const remainingLabel =
    summary.remainingCapacity === null ? '—' : `${summary.remainingCapacity}%`;

  const primaryRole = (person.roles ?? []).find((role) => role.is_primary) ?? (person.roles ?? [])[0];
  const projectedOverload =
    timeline.projectedRelativeUtilization !== null && timeline.projectedRelativeUtilization > 100;

  const renderTable = (rows: Row[], excluded: boolean) => (
    <div className="pw-table-wrap">
      <table className="pw-table">
        <caption className="sr-only">
          {excluded
            ? t('assignments:workload.sections.excludedTitle')
            : t('assignments:workload.sections.currentTitle')}
        </caption>
        <thead>
          <tr>
            <th className="pw-col-project">{t('assignments:workload.columns.project')}</th>
            <th className="pw-col-role">{t('assignments:workload.columns.role')}</th>
            <th className="pw-col-phase">{t('assignments:workload.columns.phase')}</th>
            <th className="pw-col-source">{t('assignments:workload.columns.source')}</th>
            <th className="pw-col-dates">{t('assignments:workload.columns.dates')}</th>
            <th className="pw-num pw-col-allocation">{t('assignments:workload.columns.allocation')}</th>
            <th className="pw-col-status">{t('assignments:workload.columns.status')}</th>
            <th className="pw-actions-col">{t('assignments:workload.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const item = isExcludedRow(row) ? row.assignment : row;
            const reason = isExcludedRow(row) ? row.reason : null;
            const mode = item.assignment_date_mode ?? 'fixed';
            const start = workloadDateOnly(item.computed_start_date ?? item.start_date);
            const end = workloadDateOnly(item.computed_end_date ?? item.end_date);
            const derived = mode === 'phase' || mode === 'project';
            const direct = item.assignment_type === 'direct';
            const unresolved = Boolean(item.date_resolution_error) || !start || !end;
            const allocation = Number(item.allocation_percentage ?? 0);
            const endDisplay =
              start && end && start.slice(0, 4) === end.slice(0, 4) ? end.slice(5) : end;
            const editing = editingId === item.id;
            const saving = savingId === item.id;
            const error = rowError?.id === item.id ? rowError.message : null;

            return (
              <React.Fragment key={item.id}>
                <tr
                  className={excluded ? 'pw-row--excluded' : undefined}
                  data-assignment-id={item.id}
                >
                  <td className="pw-col-project">
                    <div className="pw-project">
                      <BriefcaseBusiness size={15} aria-hidden="true" />
                      <span>{item.project_name || t('common:na')}</span>
                    </div>
                    <span className="pw-project-meta">
                      {item.role_name || t('common:na')} · {item.phase_name || t('common:na')}
                    </span>
                  </td>
                  <td className="pw-col-role">{item.role_name || t('common:na')}</td>
                  <td className="pw-col-phase">{item.phase_name || t('common:na')}</td>
                  <td className="pw-col-source">
                    <Badge variant={direct ? 'secondary' : 'outline'}>
                      {direct
                        ? t('assignments:workload.source.direct')
                        : t('assignments:workload.source.scenario')}
                    </Badge>
                  </td>
                  <td className="pw-col-dates">
                    {editing && mode === 'fixed' ? (
                      <div className="pw-date-inputs">
                        <input
                          type="date"
                          aria-label={t('assignments:workload.edit.startDate')}
                          value={draft.startDate}
                          onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                        />
                        <span aria-hidden="true">→</span>
                        <input
                          type="date"
                          aria-label={t('assignments:workload.edit.endDate')}
                          value={draft.endDate}
                          onChange={(event) => setDraft((prev) => ({ ...prev, endDate: event.target.value }))}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="pw-dates">
                          <span>{start || '—'}</span>
                          <span className="pw-date-separator" aria-hidden="true">→</span>
                          <span>{endDisplay || '—'}</span>
                        </div>
                        {derived ? (
                          <span className="pw-date-mode">
                            {t(`assignments:workload.dateMode.${mode}`)}
                          </span>
                        ) : null}
                        {unresolved ? (
                          <span className="pw-date-warning">
                            <AlertTriangle size={13} aria-hidden="true" />
                            {t('assignments:workload.states.missingDates')}
                          </span>
                        ) : null}
                        {editing && derived ? (
                          <span className="pw-date-mode">
                            {t('assignments:workload.edit.derivedDatesReadonly')}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="pw-num pw-col-allocation">
                    {batchMode ? (
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="pw-allocation-input"
                        aria-label={t('assignments:workload.edit.allocation')}
                        value={batchDrafts[item.id] ?? String(allocation)}
                        onChange={(event) =>
                          setBatchDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                    ) : editing ? (
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="pw-allocation-input"
                        aria-label={t('assignments:workload.edit.allocation')}
                        value={draft.allocation}
                        onChange={(event) => setDraft((prev) => ({ ...prev, allocation: event.target.value }))}
                      />
                    ) : (
                      `${allocation}%`
                    )}
                  </td>
                  <td className="pw-col-status">
                    {reason ? (
                      <Badge variant="warning">{t(`assignments:workload.exclusion.${reason}`)}</Badge>
                    ) : (
                      <Badge variant="success">{t('assignments:workload.included')}</Badge>
                    )}
                  </td>
                  <td className="pw-actions-col">
                    {batchMode ? null : editing ? (
                      <div className="pw-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          aria-label={t('assignments:workload.actions.save')}
                          disabled={saving || scenarioMismatch}
                          onClick={() => saveMutation.mutate({
                            row: item,
                            draft,
                            scenarioId: editScenarioId ?? activeScenarioId
                          })}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={t('assignments:workload.actions.cancel')}
                          disabled={saving}
                          onClick={cancelEdit}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="pw-row-actions">
                        {canHandover(item) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={t('assignments:workload.actions.handover')}
                            disabled={saving}
                            onClick={() => beginHandover(item)}
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={
                            item.status === 'paused'
                              ? t('assignments:workload.actions.resume')
                              : t('assignments:workload.actions.pause')
                          }
                          disabled={saving}
                          onClick={() => toggleStatus(item)}
                        >
                          {item.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="pw-edit-row"
                          aria-label={t('assignments:workload.actions.edit')}
                          onClick={() => beginEdit(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm pw-delete-btn"
                          aria-label={t('assignments:workload.actions.delete')}
                          disabled={saving}
                          onClick={() => confirmDelete(item)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {editing ? (
                  <tr className="pw-impact-row">
                    <td colSpan={8}>
                      <AssignmentImpactPreview
                        projectId={String(item.project_id)}
                        projectName={item.project_name}
                        windowStart={mode === 'fixed' ? draft.startDate : start}
                        windowEnd={mode === 'fixed' ? draft.endDate : end}
                        asOf={summary.asOf}
                        personAssignments={assignmentsQuery.data ?? []}
                        originalAllocation={allocation}
                        proposedAllocation={Number(draft.allocation) || 0}
                        editingRowId={item.id}
                        availability={summary.availability}
                      />
                    </td>
                  </tr>
                ) : null}
                {error ? (
                  <tr className="pw-row-error">
                    <td colSpan={8} role="alert">{error}</td>
                  </tr>
                ) : null}
                {handoverRowId === item.id ? (
                  <tr className="pw-handover-row">
                    <td colSpan={8}>
                      <form
                        className="pw-handover-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handoverMutation.mutate({
                            row: item,
                            draft: handoverDraft,
                            scenarioId: activeScenarioId,
                          });
                        }}
                      >
                        <strong>{t('assignments:workload.handover.title')}</strong>
                        <label>
                          {t('assignments:workload.handover.successor')}
                          <select
                            aria-label={t('assignments:workload.handover.successor')}
                            value={handoverDraft.successorId}
                            onChange={(event) =>
                              setHandoverDraft((prev) => ({ ...prev, successorId: event.target.value }))
                            }
                          >
                            <option value="">{t('assignments:workload.handover.selectSuccessor')}</option>
                            {(peopleQuery.data ?? [])
                              .filter((candidate) => candidate.id !== id)
                              .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          {t('assignments:workload.handover.effectiveDate')}
                          <input
                            type="date"
                            aria-label={t('assignments:workload.handover.effectiveDate')}
                            value={handoverDraft.effectiveDate}
                            onChange={(event) =>
                              setHandoverDraft((prev) => ({ ...prev, effectiveDate: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          {t('assignments:workload.edit.allocation')}
                          <input
                            type="number"
                            min={1}
                            max={200}
                            aria-label={t('assignments:workload.edit.allocation')}
                            value={handoverDraft.allocation}
                            onChange={(event) =>
                              setHandoverDraft((prev) => ({ ...prev, allocation: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <div className="pw-handover-actions">
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                          >
                            {t('assignments:workload.handover.confirm')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setHandoverRowId(null);
                              setHandoverMessage(null);
                            }}
                          >
                            {t('assignments:workload.actions.cancel')}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page-container person-workload-page">
      <button
        className="btn btn-ghost pw-back"
        data-testid="pw-back"
        onClick={() => {
          if (confirmLeaveIfPending()) navigate(`/people/${person.id}`);
        }}
      >
        <ArrowLeft size={16} /> {t('assignments:workload.back')}
      </button>

      <header className="pw-header">
        <div>
          <h1>{t('assignments:workload.title')}</h1>
          <p className="pw-subtitle">
            {t('assignments:workload.subtitle', {
              name: person.name,
              scenario: scenarioName,
            })}
          </p>
        </div>
        <div className="pw-header-actions">
          <span className="pw-asof">{t('assignments:workload.asOf', { date: summary.asOf })}</span>
          <button
            type="button"
            ref={addAssignmentButtonRef}
            className="btn btn-primary"
            onClick={() => setDialogOpen(true)}
            data-testid="pw-add-assignment"
          >
            <ListPlus size={16} /> {t('assignments:workbench.addAssignment')}
          </button>
        </div>
      </header>

      {utilizationQuery.isError ? (
        <div className="pw-alert" role="alert">
          <span>{t('assignments:workload.states.utilizationError')}</span>
          <button className="btn btn-secondary" onClick={() => utilizationQuery.refetch()}>
            <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : null}

      <section className="pw-capacity" aria-label={t('assignments:workload.metrics.current')}>
        <div className="pw-capacity-head">
          <Badge variant={statusVariant[summary.status]}>
            {t(`assignments:workload.status.${summary.status}`)}
          </Badge>
          <span className="pw-scenario">{t('assignments:workload.scenarioLabel', { name: scenarioName })}</span>
        </div>
        <div className="pw-metrics">
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.current')}</span>
            <strong data-testid="pw-total">{summary.totalAllocation}%</strong>
          </div>
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.availability')}</span>
            <strong data-testid="pw-availability">{availabilityLabel}</strong>
          </div>
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.relative')}</span>
            <strong data-testid="pw-relative">{relativeLabel}</strong>
          </div>
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.remaining')}</span>
            <strong
              data-testid="pw-remaining"
              className={summary.remainingCapacity !== null && summary.remainingCapacity < 0 ? 'pw-negative' : undefined}
            >
              {remainingLabel}
            </strong>
          </div>
          <div className="pw-metric pw-metric--muted">
            <span>{t('assignments:workload.metrics.excluded')}</span>
            <strong data-testid="pw-excluded">{summary.excluded.length} · {summary.excludedAllocation}%</strong>
          </div>
        </div>
        <p className="pw-help">{t('assignments:workload.metricHelp.current')}</p>
        {utilizationQuery.isLoading ? (
          <p className="pw-help" role="status">
            {t('assignments:workload.states.utilizationLoading')}
          </p>
        ) : null}
        {summary.excluded.length > 0 ? (
          <p className="pw-help">
            {t('assignments:workload.metricHelp.excluded', {
              count: summary.excluded.length,
              allocation: summary.excludedAllocation,
            })}
          </p>
        ) : null}
        {summary.status === 'over' ? (
          <p className="pw-warning" role="status">
            <AlertTriangle size={16} aria-hidden="true" /> {t('assignments:workload.warning.over')}
          </p>
        ) : null}
        {summary.status === 'unavailable' ? (
          <p className="pw-warning" role="status">
            <AlertTriangle size={16} aria-hidden="true" /> {t('assignments:workload.warning.unavailable')}
          </p>
        ) : null}
        {!utilizationQuery.isLoading && !utilizationQuery.isError && !utilizationRow ? (
          <p className="pw-help">{t('assignments:workload.states.noUtilization')}</p>
        ) : null}
      </section>

      {draftScenarioMismatch ? (
        <div className="pw-scenario-banner" role="alert" data-testid="pw-draft-scenario-mismatch">
          <div>
            <strong>{t('assignments:workbench.mismatch.title')}</strong>
            <p>
              {t('assignments:workbench.mismatch.body', {
                count: draftStore.drafts.length,
              })}
            </p>
          </div>
          <div className="pw-scenario-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={draftStore.clearDrafts}>
              {t('assignments:workbench.mismatch.discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const original = scenarios.find((scenario) => scenario.id === draftScenarioId);
                if (original) setCurrentScenario(original);
              }}
            >
              {t('assignments:workbench.mismatch.back')}
            </button>
          </div>
        </div>
      ) : null}

      <main className="pw-main">
      {scenarioMismatch ? (
        <div className="pw-scenario-banner" role="alert">
          <div>
            <strong>{t('assignments:workload.scenarioMismatch.title')}</strong>
            <p>{t('assignments:workload.scenarioMismatch.body')}</p>
          </div>
          <div className="pw-scenario-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>
              {t('assignments:workload.scenarioMismatch.discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const original = scenarios.find((scenario) => scenario.id === editScenarioId);
                if (original) setCurrentScenario(original);
              }}
            >
              {t('assignments:workload.scenarioMismatch.back')}
            </button>
          </div>
        </div>
      ) : null}
      {handoverMessage ? (
        <div
          className={`pw-handover-flash pw-handover-flash--${handoverMessage.tone}`}
          role={handoverMessage.tone === 'error' ? 'alert' : 'status'}
        >
          {handoverMessage.text}
        </div>
      ) : null}

      <WorkloadGantt
        timeline={timeline}
        committedRows={allWorkloadRows()}
        drafts={draftStore.drafts}
        collapsed={ganttCollapsed}
        onToggleCollapse={() => setGanttCollapsed((prev) => !prev)}
        onGhostClick={(draftId) => setInspectorDraftId(draftId)}
        onBarClick={(assignmentId) => {
          // Phase 2：已有 bar 点击直接进入行编辑并定位（§17）
          const row = allWorkloadRows().find((candidate) => String(candidate.id) === assignmentId);
          if (row) beginEditRef.current?.(row);
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(`[data-assignment-id="${assignmentId}"]`)
              ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          });
        }}
        onLocateGhost={(draftId) => {
          const draft = draftStore.drafts.find((entry) => entry.draftId === draftId);
          if (!draft) return;
          setGanttCollapsed(false);
          if (draft.startDate && draft.startDate < rangeStart) {
            setRangeEndOverride((prev) => {
              const neededEnd = draft.endDate && draft.endDate > (prev ?? defaultRangeEnd) ? draft.endDate : prev;
              return neededEnd ?? prev;
            });
          } else if (draft.endDate) {
            setRangeEndOverride((prev) => (draft.endDate! > (prev ?? defaultRangeEnd) ? draft.endDate : prev));
          }
          setInspectorDraftId(draftId);
        }}
        onGhostDatesChange={handleGhostDatesChange}
        minimapBuckets={minimapTimeline.buckets}
        onNavigateRange={(monthStart) => {
          setRangeStartOverride(monthStart >= asOf ? monthStart : asOf);
          setRangeEndOverride(shiftMonths(monthStart >= asOf ? monthStart : asOf, 3));
        }}
        onProjectLaneClick={(projectId, projectName) => setStaffingProject({ id: projectId, name: projectName })}
      />

      {staffingProject ? (
        <ProjectStaffingPanel
          projectId={staffingProject.id}
          projectName={staffingProject.name}
          scenarioId={activeScenarioId}
          onClose={() => setStaffingProject(null)}
        />
      ) : null}

      <DraftCommitBar
        ref={commitBarRef}
        total={draftStore.counts.total}
        submittable={draftStore.counts.submittable}
        invalid={draftStore.counts.invalid}
        conflict={draftStore.counts.conflict}
        unknown={draftStore.counts.unknown}
        submitting={draftStore.submitting}
        confirmDisabled={draftScenarioMismatch}
        confirmDisabledReason={t('assignments:workbench.mismatch.submitDisabled')}
        overload={projectedOverload}
        onContinueSelect={() => {
          setDialogOpen(true);
        }}
        continueDisabled={draftScenarioMismatch}
        onConfirm={() => void draftStore.submit()}
        onClear={() => {
          // N-02（评审）：清空是破坏性操作——已调参的草稿需二次确认
          if (draftStore.drafts.length > 0 && window.confirm(t('assignments:workbench.clearConfirm'))) {
            draftStore.clearDrafts();
          }
        }}
        lastSummary={draftStore.lastSummary}
        onRetryFailed={() => void draftStore.submit({ retryFailedOnly: true })}
        onUndoCreate={() => void draftStore.undoLastCreate()}
        lastCreatedCount={draftStore.lastCreatedCount}
        undoing={draftStore.undoing}
        undoDisabled={draftStore.undoBlocked}
        undoDisabledReason={t('assignments:workbench.commit.undoBlocked')}
        undoError={draftStore.undoError}
        onReconcile={() => void draftStore.reconcileUnknown()}
        reconciling={draftStore.reconciling}
        reconcileError={draftStore.reconcileError}
        onBatchApply={handleBatchApply}
        editableDrafts={editableDrafts}
      />

      {inspectorDraft ? (
        <GhostInspector
          draft={inspectorDraft}
          assignments={assignmentsQuery.data ?? []}
          availability={heatDefaultAvailability}
          availabilityOverrides={availabilityOverrides}
          asOf={asOf}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onUpdate={draftStore.updateDraft}
          onRemove={(draftId) => {
            draftStore.removeDraft(draftId);
            setInspectorDraftId(null);
            focusGhostOrCommitBar(draftId);
          }}
          onClose={() => {
            const draftId = inspectorDraft.draftId;
            setInspectorDraftId(null);
            focusGhostOrCommitBar(draftId);
          }}
          disabled={
            draftStore.submitting ||
            inspectorDraft.submitState === 'SUBMITTING' ||
            inspectorDraft.submitState === 'UNKNOWN' ||
            draftScenarioMismatch // D-02a：失配期草稿只读（§12）
          }
        />
      ) : null}

      <div className="pw-batch-bar">
        {batchMode ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={batchSaveMutation.isPending}
              onClick={() => batchSaveMutation.mutate()}
            >
              {t('assignments:workload.batch.save')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={batchSaveMutation.isPending}
              onClick={() => {
                setBatchMode(false);
                setBatchDrafts({});
                setBatchMessage(null);
              }}
            >
              {t('assignments:workload.batch.cancel')}
            </button>
            <span className="pw-batch-hint">{t('assignments:workload.batch.hint')}</span>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={Boolean(editingId || handoverRowId)}
            onClick={startBatch}
          >
            {t('assignments:workload.batch.edit')}
          </button>
        )}
        {batchMessage ? (
          <span className={`pw-batch-message pw-batch-message--${batchMessage.tone}`} role="status">
            {batchMessage.text}
          </span>
        ) : null}
      </div>
      {assignmentsQuery.isError ? (
        <div className="pw-alert" role="alert">
          <span>{t('assignments:workload.states.assignmentsError')}</span>
          <button className="btn btn-secondary" onClick={() => assignmentsQuery.refetch()}>
            <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : null}

      <section className="pw-section" aria-labelledby="pw-current-title">
        <div className="pw-section-head">
          <div>
            <h2 id="pw-current-title">{t('assignments:workload.sections.currentTitle')}</h2>
            <p>{t('assignments:workload.sections.currentDescription')}</p>
          </div>
          <span className="pw-section-total">{summary.totalAllocation}%</span>
        </div>
        {summary.current.length === 0 ? (
          <div className="pw-empty-row">{t('assignments:workload.states.emptyCurrent')}</div>
        ) : (
          renderTable(summary.current, false)
        )}
      </section>

      <section className="pw-section" aria-labelledby="pw-excluded-title">
        <div className="pw-section-head">
          <div>
            <h2 id="pw-excluded-title">{t('assignments:workload.sections.excludedTitle')}</h2>
            <p>{t('assignments:workload.sections.excludedDescription')}</p>
          </div>
          <span className="pw-section-total pw-section-total--muted">
            {summary.excluded.length} · {summary.excludedAllocation}%
          </span>
        </div>
        {summary.excluded.length === 0 ? (
          <div className="pw-empty-row">{t('assignments:workload.states.emptyExcluded')}</div>
        ) : (
          renderTable(summary.excluded, true)
        )}
      </section>

      <p className="pw-note">{t('assignments:workload.note')}</p>
      </main>

      <TaskSelectionDialog
        open={dialogOpen}
        personId={person.id}
        personName={person.name}
        personPrimaryRoleId={primaryRole?.role_id ?? null}
        personPrimaryRoleName={primaryRole?.role_name ?? null}
        scenarioId={activeScenarioId}
        assignments={assignmentsQuery.data ?? []}
        laneDrafts={draftStore.drafts}
        asOf={asOf}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        availability={heatDefaultAvailability}
        availabilityOverrides={availabilityOverrides}
        onAddToLane={handleAddToLane}
        onEditExisting={handleDialogEditExisting}
        onClose={() => {
          setDialogOpen(false);
          window.requestAnimationFrame(() => {
            (addAssignmentButtonRef.current ?? commitBarRef.current)?.focus();
          });
        }}
      />
    </div>
  );
}
