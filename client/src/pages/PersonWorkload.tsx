import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import {
  batchShiftDirectCount,
  batchShiftSkipTotal,
  planBatchShift,
  shiftIsoDate,
  shiftIsoMonths,
  type BatchShiftPlan,
  type BatchShiftUnit,
} from '../lib/batchShift';
import type { AssignmentDraft } from '../lib/assignmentDrafts';
import { useDraftAssignments } from '../hooks/useDraftAssignments';
import { toISODateString } from '../utils/dateUtils';
import { Badge } from '../components/ui/badge';
import { IsoDateInput, isIsoCalendarDate } from '../components/ui/iso-date-input';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ToastAction } from '../components/ui/toast';
import { useToast } from '../hooks/use-toast';
import { AssignmentImpactPreview } from '../components/workload/AssignmentImpactPreview';
import { CommittedInspector, type CommittedInspectorForm } from '../components/workload/CommittedInspector';
import { DraftCommitBar } from '../components/workload/DraftCommitBar';
import { GhostInspector } from '../components/workload/GhostInspector';
import { ProjectStaffingPanel } from '../components/workload/ProjectStaffingPanel';
import { TaskSelectionDialog } from '../components/workload/TaskSelectionDialog';
import { WorkloadGantt, type CommittedDatePreview } from '../components/workload/WorkloadGantt';
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
  role_id?: string | null;
  role_name?: string | null;
  phase_id?: string | null;
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

export default function PersonWorkload() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  const allWorkloadRows = (): AssignmentRow[] => [
    ...summary.current,
    ...summary.excluded.map((excludedRow) => excludedRow.assignment),
  ];

  // ---- 工作台 v2：泳道时间范围（S8 自适应；mini-map 可移动窗口）----
  const [rangeEndOverride, setRangeEndOverride] = useState<string | null>(null);
  const [rangeStartOverride, setRangeStartOverride] = useState<string | null>(null);
  // 用户反馈（2026-11-14）：已开始行的 start < asOf，若左界固定 asOf，bar 被
  // 裁剪到 0%，整块拖动前 N 天只拉伸右缘、左缘不动（越过 asOf 才跳）。
  // 修复：左界包含"跨参考日的进行中分配"的最早 start（最多回看 3 个月），
  // 让左缘真实对应日期；更早的历史仍裁剪，避免压缩未来视图。
  const historyRangeStart = useMemo(() => {
    let earliest = '';
    for (const row of assignmentsQuery.data ?? []) {
      const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
      const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
      if (!start || !end) continue;
      if (end < asOf || start >= asOf) continue;
      if (!earliest || start < earliest) earliest = start;
    }
    if (!earliest) return asOf;
    const floor = shiftIsoMonths(asOf, -3);
    return earliest < floor ? floor : earliest;
  }, [assignmentsQuery.data, asOf]);
  const rangeStart = rangeStartOverride ?? historyRangeStart;

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
  // S5（§8）：来自项目配置的深链（?project=&assignment=）
  const [deepLinkHint, setDeepLinkHint] = useState(false);
  const [deepLinkNotice, setDeepLinkNotice] = useState<'located' | 'missing' | null>(null);
  const [deepLinkHighlightId, setDeepLinkHighlightId] = useState<string | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const lastPersonIdRef = useRef(id);
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

  // S8（§11）：默认窗口 = clamp(最远 committed/ghost 结束日, asOf+3 月, asOf+12 月)。
  // 不无限放大：多年后的结束日留在"范围外"入口，定位时才显式扩展。
  const defaultRangeEnd = useMemo(() => {
    const minimum = shiftIsoMonths(asOf, 3);
    const maximum = shiftIsoMonths(asOf, 12);
    let furthest = '';
    for (const row of assignmentsQuery.data ?? []) {
      const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
      if (end && end > furthest) furthest = end;
    }
    for (const draft of draftStore.drafts) {
      if (draft.submitState === 'SUCCEEDED' || draft.submitState === 'UNKNOWN') continue;
      if (draft.endDate && draft.endDate > furthest) furthest = draft.endDate;
    }
    if (!furthest || furthest < minimum) return minimum;
    return furthest > maximum ? maximum : furthest;
  }, [assignmentsQuery.data, draftStore.drafts, asOf]);
  const rangeEnd = rangeEndOverride ?? defaultRangeEnd;

  // F3（DeepSeek P2 #3）：覆盖全集按时间轴窗口取数（approved-only）——
  // 旧实现只从 utilization 行取"今天生效"的单一窗口，未来已批准休假
  // （整周 0%）不可见，热区按默认可用率误报正常。所有容量面共用本数组。
  // S8：窗口经"范围外"定位扩展超过 12 个月时，覆盖查询同步扩展。
  const overridesWindowEnd = useMemo(() => {
    const standard = shiftIsoMonths(asOf, 12);
    return rangeEnd > standard ? rangeEnd : standard;
  }, [asOf, rangeEnd]);
  const overridesQuery = useQuery<AvailabilityOverrideInput[]>({
    queryKey: queryKeys.availability.list({
      person_id: id,
      is_approved: true,
      start_date: asOf,
      end_date: overridesWindowEnd,
    } as never),
    queryFn: () => fetchApprovedAvailabilityOverrides(id!, asOf, overridesWindowEnd),
    // asOf 来自 utilization 的 as_of：必须等它落定后再取覆盖窗口，
    // 否则先用"今天"发一轮再换键重发（多一轮请求+夹具/缓存额外键）
    enabled: Boolean(id) && utilizationQuery.isSuccess,
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

  // 场景绑定（§12）：草稿绑定加入时的场景；切场景→只读+禁提交
  const draftScenarioId = draftStore.drafts[0]?.scenarioId ?? activeScenarioId;
  const draftScenarioMismatch =
    draftStore.drafts.length > 0 && draftScenarioId !== activeScenarioId;

  // ---- S1/S2 Phase A：已提交分配的就地编辑会话状态（§4.5）----
  // 声明前置于锁/守卫 effect（依赖 committedSaving/committedRowDirty）。
  const [committedPreview, setCommittedPreview] = useState<CommittedDatePreview | null>(null);
  const [committedSession, setCommittedSession] = useState<{
    row: AssignmentRow;
    scenarioId: string;
    baseline: { version?: number; allocation: number; startDate: string; endDate: string };
    source: 'drag' | 'click';
  } | null>(null);
  const [committedForm, setCommittedForm] = useState<CommittedInspectorForm>({
    allocation: '',
    startDate: '',
    endDate: '',
  });
  const [committedSaving, setCommittedSaving] = useState(false);
  const [committedConverting, setCommittedConverting] = useState(false);
  const [committedError, setCommittedError] = useState<string | null>(null);
  const [committedConflict, setCommittedConflict] = useState(false);
  const [committedConfirmOpen, setCommittedConfirmOpen] = useState(false);
  /** S7：统一动作确认（删除/清空/离页/direct 暂停恢复/丢弃行编辑） */
  const [actionConfirm, setActionConfirm] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  } | null>(null);
  /** 面板关闭后焦点回到原 bar（§5.2/§15）；被行编辑/批量接管时不抢焦点。 */
  const committedReturnFocusRef = useRef<string | null>(null);
  const committedRowDirty = Boolean(
    committedSession &&
      (Number(committedForm.allocation) !== committedSession.baseline.allocation ||
        (((committedSession.row.assignment_date_mode ?? 'fixed') === 'fixed') &&
          (committedForm.startDate !== committedSession.baseline.startDate ||
            committedForm.endDate !== committedSession.baseline.endDate)))
  );
  const committedScenarioMismatch = Boolean(
    committedSession && committedSession.scenarioId !== activeScenarioId
  );

  // CommitInFlight / 面板保存锁（§12/§4.5）：在途写请求期间锁定场景切换
  useEffect(() => {
    if (draftStore.submitting || committedSaving || committedConverting) {
      lockScenarioSwitching(t('assignments:workbench.commit.lockReason'));
    } else {
      unlockScenarioSwitching();
    }
    return () => unlockScenarioSwitching();
  }, [draftStore.submitting, committedSaving, committedConverting, lockScenarioSwitching, unlockScenarioSwitching, t]);

  // 刷新/离开守卫（§16 + §4.5 + S7）：脏来源 = ghost / committed 面板 /
  // 行编辑 / 批量 / 交接 / 在途转换，任一成立都需确认（评审 G-02）。
  const hasPendingDrafts = draftStore.drafts.some((draft) => draft.submitState !== 'SUCCEEDED');
  const hasUnsavedCommitted = Boolean(committedSession && committedRowDirty);
  const unsavedWorkRef = useRef({ drafts: false, committed: false, other: false });
  const leaveConfirmText = t('assignments:workbench.leaveConfirm');
  const leaveMessage = useCallback(() => {
    const { drafts, committed, other } = unsavedWorkRef.current;
    if (drafts && (committed || other)) return t('assignments:workbench.leaveBoth');
    if (drafts) return t('assignments:workbench.leaveDrafts');
    if (committed) return t('assignments:workbench.leaveCommitted');
    if (other) return t('assignments:workbench.leaveOther');
    return leaveConfirmText;
  }, [leaveConfirmText, t]);
  /** S7/§10：离页守卫的异步确认——确认后才显式执行导航动作。 */
  const guardLeave = useCallback(
    (action: () => void) => {
      const { drafts, committed, other } = unsavedWorkRef.current;
      if (!drafts && !committed && !other) {
        action();
        return;
      }
      setActionConfirm({
        title: t('assignments:workbench.leaveTitle'),
        message: leaveMessage(),
        confirmText: t('assignments:workbench.leaveConfirmAction'),
        variant: 'danger',
        onConfirm: () => {
          setActionConfirm(null);
          action();
        },
      });
    },
    [leaveMessage, t]
  );
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { drafts, committed, other } = unsavedWorkRef.current;
      if (!drafts && !committed && !other) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      const { drafts, committed, other } = unsavedWorkRef.current;
      if ((!drafts && !committed && !other) || event.defaultPrevented) return;
      // 只接管未修饰的主键导航；新标签/新窗口语义保持浏览器默认
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      if (anchor.getAttribute('target') && anchor.getAttribute('target') !== '_self') return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      // capture 阶段不能 await：先阻止默认跳转，确认后再显式 navigate
      event.preventDefault();
      guardLeave(() => navigate(href));
    };
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [guardLeave, navigate]);

  // S5（§8）：同一路由组件从 A 人员切到 B 人员时，上一人员的编辑会话/
  // ghost/批量/深链状态必须清掉，否则残留会话会指向他人的分配。
  const clearDrafts = draftStore.clearDrafts;
  useEffect(() => {
    if (lastPersonIdRef.current === id) return;
    lastPersonIdRef.current = id;
    setEditingId(null);
    setEditScenarioId(null);
    setEditBaseline(null);
    setRowError(null);
    setHandoverRowId(null);
    setHandoverMessage(null);
    setCommittedSession(null);
    setCommittedForm({ allocation: '', startDate: '', endDate: '' });
    setCommittedPreview(null);
    setCommittedError(null);
    setCommittedConflict(false);
    setCommittedConfirmOpen(false);
    setCommittedConverting(false);
    committedReturnFocusRef.current = null;
    setBatchMode(false);
    setBatchDrafts({});
    setBatchBaselines({});
    setBatchMessage(null);
    setBatchShiftOpen(false);
    setBatchShiftPlan(null);
    setBatchShiftError(null);
    setBatchStatusConfirm(null);
    setActionConfirm(null);
    setInspectorDraftId(null);
    setDialogOpen(false);
    setStaffingProject(null);
    setDeepLinkHint(false);
    setDeepLinkNotice(null);
    setDeepLinkHighlightId(null);
    setRangeEndOverride(null);
    setRangeStartOverride(null);
    deepLinkHandledRef.current = null;
    clearDrafts();
  }, [id, clearDrafts]);

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

  // W-05：面板表单是当前可见值的一部分——固定日期会话打开时，bar/表格/
  // 拖动基准统一读表单，而不是服务端原始行。
  const visibleCommittedPreview = useMemo(() => {
    const session = committedSession;
    if (!session) return committedPreview;
    if ((session.row.assignment_date_mode ?? 'fixed') !== 'fixed') return committedPreview;
    if (!isIsoCalendarDate(committedForm.startDate) || !isIsoCalendarDate(committedForm.endDate)) {
      return committedPreview;
    }
    return {
      assignmentId: String(session.row.id),
      startDate: committedForm.startDate,
      endDate: committedForm.endDate,
    };
  }, [committedSession, committedForm, committedPreview]);

  // 已提交行投影：拖动/面板未保存期用预览日期（保留原 status——paused 行
  // 预览不得计入负载，评审 Claude 盯点 1）。
  const committedTimelineRows = useMemo(
    () =>
      (assignmentsQuery.data ?? []).map((row) => {
        const sessionRow =
          committedSession && String(committedSession.row.id) === String(row.id);
        const preview =
          !sessionRow && committedPreview && committedPreview.assignmentId === String(row.id)
            ? committedPreview
            : null;
        const formPreview =
          sessionRow && (committedSession?.row.assignment_date_mode ?? 'fixed') === 'fixed'
            ? visibleCommittedPreview
            : null;
        return {
          id: String(row.id),
          allocationPercentage: sessionRow
            ? Number(committedForm.allocation) || 0
            : Number(row.allocation_percentage ?? 0),
          startDate:
            formPreview?.startDate ??
            preview?.startDate ??
            row.computed_start_date ??
            row.start_date ??
            null,
          endDate:
            formPreview?.endDate ??
            preview?.endDate ??
            row.computed_end_date ??
            row.end_date ??
            null,
          status: row.status ?? null,
        };
      }),
    [assignmentsQuery.data, committedPreview, committedSession, committedForm, visibleCommittedPreview]
  );

  // 泳道 timeline：committed + ghost（三处容量展示共用，§9）。
  // D-02a：场景失配时草稿只读且不进入热区投影（A 场景草稿叠加 B 场景
  // committed 的"预计值"没有业务含义）——泳道 bar 层仍显示 ghost。
  const projectedDrafts = draftScenarioMismatch ? [] : draftStore.drafts;
  // S8：窗口 > 6 个月时热区展示粒度切到月（只换展示桶，计算口径不变）
  const windowDays = useMemo(
    () =>
      Math.round(
        (Date.parse(`${rangeEnd}T00:00:00Z`) - Date.parse(`${rangeStart}T00:00:00Z`)) /
          86_400_000
      ),
    [rangeStart, rangeEnd]
  );
  const timeline = useMemo(
    () =>
      workloadTimeline(
        committedTimelineRows,
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
          granularity: windowDays > 183 ? 'month' : 'week',
        }
      ),
    [committedTimelineRows, projectedDrafts, asOf, rangeStart, rangeEnd, heatDefaultAvailability, availabilityOverrides, windowDays]
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

  // Phase 3 mini-map：`max(12 个月, 当前窗口跨度)` 月桶总览（S8），
  // 点击月桶移动观察窗
  const minimapRangeEnd = useMemo(() => {
    const standard = shiftIsoMonths(asOf, 12);
    return rangeEnd > standard ? rangeEnd : standard;
  }, [asOf, rangeEnd]);
  const minimapTimeline = useMemo(
    () =>
      workloadTimeline(
        committedTimelineRows,
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
          rangeEnd: minimapRangeEnd,
          defaultAvailability: heatDefaultAvailability,
          availabilityOverrides,
          granularity: 'month',
        }
      ),
    [committedTimelineRows, projectedDrafts, asOf, minimapRangeEnd, heatDefaultAvailability, availabilityOverrides]
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
  // S3（§6）：批量工具条——整体平移（预览冻结）与批量暂停/恢复（统一确认）
  const [batchShiftOpen, setBatchShiftOpen] = useState(false);
  const [batchShiftForm, setBatchShiftForm] = useState<{
    direction: 'earlier' | 'later';
    amount: string;
    unit: BatchShiftUnit;
  }>({ direction: 'later', amount: '1', unit: 'day' });
  const [batchShiftPlan, setBatchShiftPlan] = useState<BatchShiftPlan | null>(null);
  const [batchShiftError, setBatchShiftError] = useState<string | null>(null);
  const [batchStatusConfirm, setBatchStatusConfirm] = useState<{
    action: 'pause' | 'resume';
    rows: AssignmentRow[];
  } | null>(null);
  const scenarioMismatch = Boolean(editingId && editScenarioId && editScenarioId !== activeScenarioId);

  /** 批量里是否还有未保存比例改动（平移全部成功后决定是否收起平移表单）。 */
  const batchDraftsDirty = () =>
    allWorkloadRows().some(
      (row) =>
        batchDrafts[row.id] !== undefined &&
        batchBaselines[row.id] !== undefined &&
        batchDrafts[row.id] !== String(batchBaselines[row.id].allocation)
    );

  const rowEditDirty = Boolean(
    editingId &&
      editBaseline &&
      (Number(draft.allocation) !== editBaseline.allocation ||
        draft.startDate !== editBaseline.startDate ||
        draft.endDate !== editBaseline.endDate)
  );
  // 离页守卫的统一脏集合（每渲染同步到 ref，供同步 capture 事件读取）
  const hasUnsavedHandover = Boolean(
    handoverRowId &&
      (handoverDraft.successorId || handoverDraft.effectiveDate || handoverDraft.allocation)
  );
  unsavedWorkRef.current = {
    drafts: hasPendingDrafts,
    committed: hasUnsavedCommitted,
    other:
      Boolean(editingId && rowEditDirty) ||
      hasUnsavedHandover ||
      Boolean(batchMode && (batchShiftPlan || batchDraftsDirty())) ||
      committedConverting,
  };

  const startRowEdit = (row: AssignmentRow) => {
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
    // W-09：行编辑开始后滚动到行并聚焦首个输入（含从任务弹窗进入的路径）
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const rowElement = document.querySelector<HTMLElement>(
          `tr[data-assignment-id="${row.id}"]`
        );
        rowElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        rowElement
          ?.querySelector<HTMLElement>('.pw-allocation-input')
          ?.focus?.();
      });
    });
  };

  const beginEdit = (row: AssignmentRow) => {
    // W-22：交接/草稿面板/批量与行编辑同属互斥矩阵，不允许并存
    if (handoverRowId) {
      setBatchMessage({
        tone: 'warning',
        text: t('assignments:workload.batch.finishHandoverFirst'),
      });
      jumpToVisible(`[data-assignment-id="${handoverRowId}"]`);
      return;
    }
    if (inspectorDraftId) {
      setBatchMessage({
        tone: 'warning',
        text: t('assignments:workload.batch.finishGhostFirst'),
      });
      jumpToVisible('[data-testid="pw-ghost-inspector"]');
      return;
    }
    if (batchMode) {
      setBatchMessage({
        tone: 'warning',
        text: t('assignments:workbench.committed.finishBatchFirst'),
      });
      return;
    }
    // §4.5 互斥：committed 面板未结束时不并存第二个编辑器
    if (committedSession) {
      if (committedSaving || committedConverting) {
        setBatchMessage({ tone: 'warning', text: t('assignments:workbench.committed.finishPanelFirst') });
        jumpToVisible('[data-testid="pw-committed-save"]');
        return;
      }
      if (committedRowDirty) {
        setBatchMessage({ tone: 'warning', text: t('assignments:workbench.committed.finishPanelFirst') });
        jumpToVisible('[data-testid="pw-committed-save"]');
        return;
      }
      closeCommittedSession(false);
    }
    // S7：切换编辑对象前，上一行有未保存修改 → 统一确认
    if (editingId && editingId !== row.id && rowEditDirty) {
      setActionConfirm({
        title: t('assignments:workload.edit.discardEditTitle'),
        message: t('assignments:workload.edit.discardEditBody'),
        confirmText: t('assignments:workbench.committed.discardConfirm'),
        variant: 'danger',
        onConfirm: () => {
          setActionConfirm(null);
          startRowEdit(row);
        },
      });
      return;
    }
    startRowEdit(row);
  };
  beginEditRef.current = beginEdit;

  const clearEdit = () => {
    setEditingId(null);
    setEditScenarioId(null);
    setRowError(null);
    setEditBaseline(null);
  };

  /** S7：行编辑有未保存修改时，取消/切走先经统一确认。 */
  const cancelEdit = () => {
    if (!rowEditDirty) {
      clearEdit();
      return;
    }
    setActionConfirm({
      title: t('assignments:workload.edit.discardEditTitle'),
      message: t('assignments:workload.edit.discardEditBody'),
      confirmText: t('assignments:workbench.committed.discardConfirm'),
      variant: 'danger',
      onConfirm: () => {
        setActionConfirm(null);
        clearEdit();
      },
    });
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      row,
      draft: next,
      scenarioId,
    }: {
      row: AssignmentRow;
      draft: RowDraft;
      scenarioId: string;
    }): Promise<{
      noop: boolean;
      undo?: {
        id: string;
        scenarioId: string;
        inverse: Record<string, unknown>;
        savedVersion: number;
      };
    }> => {
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
        if (!isIsoCalendarDate(next.startDate) || !isIsoCalendarDate(next.endDate)) {
          throw new Error(t('assignments:workload.edit.dateFormat'));
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
        return { noop: true };
      }
      // 乐观锁令牌取编辑时快照的版本——他人已改则 409，不借新令牌写旧值
      if (baseline.version !== undefined) payload.expected_version = baseline.version;
      const response = await api.assignments.update(row.id, payload as never, { scenarioId });
      // S6：单行表格保存同样给一次撤销（只含实际改动字段的逆补丁 + 响应版本）
      const inverse: Record<string, unknown> = {};
      if ('allocation_percentage' in payload) {
        inverse.allocation_percentage = baseline.allocation;
      }
      if ('start_date' in payload || 'end_date' in payload) {
        inverse.start_date = baseline.startDate;
        inverse.end_date = baseline.endDate;
      }
      const savedRow = (response.data as any)?.data;
      return {
        noop: false,
        undo:
          typeof savedRow?.version === 'number' && Object.keys(inverse).length > 0
            ? { id: row.id, scenarioId, inverse, savedVersion: savedRow.version }
            : undefined,
      };
    },
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: (data, { row }) => {
      setSavingId(null);
      setEditingId(null);
      setEditScenarioId(null);
      setRowError(null);
      setEditBaseline(null);
      if (data.undo) {
        const undo = data.undo;
        toast({
          title: t('assignments:workbench.committed.savedToast'),
          duration: 5000,
          action: (
            <ToastAction
              altText={t('assignments:workbench.committed.undo')}
              onClick={() => void performUndoCommitted(undo)}
            >
              {t('assignments:workbench.committed.undo')}
            </ToastAction>
          ),
        });
      }
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
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-assignment-id="${row.id}"] .pw-allocation-input`)
          ?.focus?.();
      });
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
    const apply = () =>
      statusMutation.mutate({ row, status: nextStatus, scenarioId: activeScenarioId });
    if (row.assignment_type === 'direct') {
      setActionConfirm({
        title: t(
          nextStatus === 'paused'
            ? 'assignments:workload.edit.pauseDirectTitle'
            : 'assignments:workload.edit.resumeDirectTitle'
        ),
        message: t(
          nextStatus === 'paused'
            ? 'assignments:workload.edit.pauseDirectConfirm'
            : 'assignments:workload.edit.resumeDirectConfirm'
        ),
        confirmText: t(
          nextStatus === 'paused'
            ? 'assignments:workload.actions.pause'
            : 'assignments:workload.actions.resume'
        ),
        variant: nextStatus === 'paused' ? 'danger' : 'default',
        onConfirm: () => {
          setActionConfirm(null);
          apply();
        },
      });
      return;
    }
    apply();
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
      effectiveDate = shiftIsoDate(start ?? asOf, 1, 'day', 'later');
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
      if (!isIsoCalendarDate(next.effectiveDate)) {
        throw new Error(t('assignments:workload.edit.dateFormat'));
      }
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

  const deepLinkProject = searchParams.get('project');
  const deepLinkAssignment = searchParams.get('assignment');

  // S5（§8）：等目标人员分配数据加载完成后定位——assignment 优先，其次
  // project（泳道或该项目的首行）；目标不存在只提示不报错。
  useEffect(() => {
    if (!id || !assignmentsQuery.isSuccess) return;
    if (!deepLinkProject && !deepLinkAssignment) return;
    const key = `${id}|${deepLinkProject ?? ''}|${deepLinkAssignment ?? ''}`;
    if (deepLinkHandledRef.current === key) return;
    deepLinkHandledRef.current = key;
    setDeepLinkHint(true);
    const rows = allWorkloadRows();
    const target = deepLinkAssignment
      ? rows.find((row) => String(row.id) === deepLinkAssignment)
      : undefined;

    if (target) {
      setDeepLinkNotice('located');
      setDeepLinkHighlightId(String(target.id));
      window.requestAnimationFrame(() => {
        const rowElement = document.querySelector<HTMLElement>(
          `tr[data-assignment-id="${target.id}"]`
        );
        rowElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        rowElement?.querySelector<HTMLElement>('[data-testid="pw-edit-row"]')?.focus?.();
      });
      window.setTimeout(() => setDeepLinkHighlightId(null), 2000);
      return;
    }

    if (deepLinkProject) {
      const lane = document.querySelector<HTMLElement>(
        `[data-lane-project="${deepLinkProject}"]`
      );
      lane?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      const firstRow = rows.find((row) => String(row.project_id) === deepLinkProject);
      if (firstRow) {
        setDeepLinkHighlightId(String(firstRow.id));
        window.setTimeout(() => setDeepLinkHighlightId(null), 2000);
      }
    }
    if (deepLinkAssignment || !document.querySelector(`[data-lane-project="${deepLinkProject}"]`)) {
      setDeepLinkNotice('missing');
    }
    // summary 代表当前人员已加载的完整行集合；allWorkloadRows 是从它派生的纯读取
  }, [id, assignmentsQuery.isSuccess, summary, deepLinkProject, deepLinkAssignment]);

  // 无深链参数（浏览器返回）时收起"来自项目配置"提示
  useEffect(() => {
    if (deepLinkProject || deepLinkAssignment) return;
    setDeepLinkHint(false);
    setDeepLinkNotice(null);
  }, [deepLinkProject, deepLinkAssignment]);

  /**
   * S5：staffing 面板的程序化跳转必须经过页面守卫（Codex P1——capture 阶段
   * 的 <a> 守卫拦不到 navigate）。S7：确认改为 ConfirmDialog；拒绝时保留源面板。
   */
  const performStaffingNavigate = (personId: string, assignmentId: string) => {
    const projectId = staffingProject?.id;
    setStaffingProject(null);
    const query = new URLSearchParams();
    if (projectId) query.set('project', projectId);
    query.set('assignment', assignmentId);
    navigate(`/people/${personId}/workload?${query.toString()}`);
  };

  const handleStaffingNavigate = (personId: string, assignmentId: string) => {
    guardLeave(() => performStaffingNavigate(personId, assignmentId));
  };

  /** §12：staffing 面板与 committed 面板互斥；committed 有未保存值时不静默切换。 */
  const openStaffingProject = (projectId: string, projectName: string) => {
    if (committedSession) {
      if (committedSaving || committedConverting || committedRowDirty) {
        setBatchMessage({
          tone: 'warning',
          text: t('assignments:workbench.committed.finishPanelFirst'),
        });
        jumpToVisible('[data-testid="pw-committed-save"]');
        return;
      }
      closeCommittedSession(false);
    }
    setStaffingProject({ id: projectId, name: projectName });
  };

  // ---------------------------------------------------------------------
  // S1/S2 Phase A：已提交分配的就地编辑会话（§4.5）
  // 共享布局（CommittedInspector）但控制逻辑独立：暂存值 + 显式保存 +
  // 编辑时快照版本；未保存关闭必须确认；409 保留用户值、显式刷新才换版本。
  // ---------------------------------------------------------------------
  const { toast, dismiss } = useToast();
  const findWorkloadRow = (assignmentId: string): AssignmentRow | undefined =>
    allWorkloadRows().find((row) => String(row.id) === String(assignmentId));

  const closeCommittedSession = (restoreFocus = true) => {
    const returnId = committedReturnFocusRef.current;
    committedReturnFocusRef.current = null;
    setCommittedSession(null);
    setCommittedPreview(null);
    setCommittedError(null);
    setCommittedConflict(false);
    setCommittedConverting(false);
    if (restoreFocus && returnId) {
      window.requestAnimationFrame(() => {
        const bar = document.querySelector<HTMLElement>(
          `[data-testid="pw-gantt-bar"][data-assignment-id="${returnId}"]`
        );
        const row = document.querySelector<HTMLElement>(`[data-assignment-id="${returnId}"]`);
        (bar ?? row ?? addAssignmentButtonRef.current)?.focus?.();
      });
    }
  };

  const jumpToVisible = (selector: string) => {
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      target?.focus?.();
    });
  };

  /**
   * 打开已提交分配面板。互斥矩阵（§4.5）：同一时刻仅一个编辑面；行编辑/
   * 交接/批量未结束时给出明确原因并跳到那个表单（不静默吞掉）。
   */
  const openCommittedSession = (
    row: AssignmentRow,
    source: 'drag' | 'click',
    preview?: CommittedDatePreview | null
  ) => {
    if (draftStore.submitting || committedSaving || committedConverting) return;
    if (batchMode) {
      setBatchMessage({ tone: 'warning', text: t('assignments:workbench.committed.finishBatchFirst') });
      jumpToVisible('.person-workload-page .pw-allocation-input');
      return;
    }
    if (editingId) {
      setBatchMessage({ tone: 'warning', text: t('assignments:workload.batch.finishEditFirst') });
      jumpToVisible(`[data-assignment-id="${editingId}"] .pw-allocation-input`);
      return;
    }
    if (handoverRowId) {
      setBatchMessage({ tone: 'warning', text: t('assignments:workload.batch.finishHandoverFirst') });
      jumpToVisible(`[data-assignment-id="${handoverRowId}"]`);
      return;
    }
    // G-07：面板写请求在途时不得被另一条 bar 替换（错误会归因错行）
    if (committedSession) {
      if (committedSaving || committedConverting) return;
      if (String(committedSession.row.id) === String(row.id)) return;
      if (committedRowDirty) {
        setBatchMessage({ tone: 'warning', text: t('assignments:workbench.committed.finishPanelFirst') });
        jumpToVisible('[data-testid="pw-committed-save"]');
        return;
      }
      closeCommittedSession(false);
    }
    // §12 互斥：committed 面板与 project staffing 面板不同时占据编辑区
    if (staffingProject) setStaffingProject(null);
    // 同一时刻只开一个面板；ghost 草稿仍保存在 draftStore，不丢
    if (inspectorDraftId) setInspectorDraftId(null);
    committedReturnFocusRef.current = String(row.id);
    const startDate = workloadDateOnly(row.start_date) ?? '';
    const endDate = workloadDateOnly(row.end_date) ?? '';
    setCommittedSession({
      row,
      scenarioId: activeScenarioId,
      baseline: {
        version: row.version,
        allocation: Number(row.allocation_percentage ?? 0),
        startDate,
        endDate,
      },
      source,
    });
    setCommittedForm({
      allocation: String(Number(row.allocation_percentage ?? 0)),
      startDate: preview?.startDate ?? startDate,
      endDate: preview?.endDate ?? endDate,
    });
    setCommittedError(null);
    setCommittedConflict(false);
    setCommittedConverting(false);
    setCommittedPreview(preview ?? null);
  };

  const requestCloseCommitted = () => {
    if (committedSaving) return;
    if (committedRowDirty) {
      setCommittedConfirmOpen(true);
      return;
    }
    closeCommittedSession();
  };

  const refreshCommittedLatest = async () => {
    const session = committedSession;
    if (!session) return;
    const result = await assignmentsQuery.refetch();
    const latest = (result.data ?? []).find(
      (candidate) => String(candidate.id) === String(session.row.id)
    );
    if (!latest) {
      setCommittedError(t('assignments:workbench.committed.rowGone'));
      setCommittedConflict(false);
      return;
    }
    const startDate = workloadDateOnly(latest.start_date) ?? '';
    const endDate = workloadDateOnly(latest.end_date) ?? '';
    setCommittedSession({
      ...session,
      row: latest,
      baseline: {
        version: latest.version,
        allocation: Number(latest.allocation_percentage ?? 0),
        startDate,
        endDate,
      },
    });
    setCommittedForm({
      allocation: String(Number(latest.allocation_percentage ?? 0)),
      startDate,
      endDate,
    });
    setCommittedError(null);
    setCommittedConflict(false);
  };

  const saveCommitted = async () => {
    const session = committedSession;
    if (!session || committedSaving) return;
    const mode = session.row.assignment_date_mode ?? 'fixed';
    const allocation = Number(committedForm.allocation);
    if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
      setCommittedError(t('assignments:workload.edit.invalidAllocation'));
      return;
    }
    const payload: Record<string, unknown> = {};
    if (allocation !== session.baseline.allocation) {
      payload.allocation_percentage = allocation;
    }
    if (mode === 'fixed') {
      if (!committedForm.startDate || !committedForm.endDate) {
        setCommittedError(t('assignments:workload.edit.invalidDates'));
        return;
      }
      if (
        !isIsoCalendarDate(committedForm.startDate) ||
        !isIsoCalendarDate(committedForm.endDate)
      ) {
        setCommittedError(t('assignments:workload.edit.dateFormat'));
        return;
      }
      if (committedForm.startDate > committedForm.endDate) {
        setCommittedError(t('assignments:workload.edit.invalidDateOrder'));
        return;
      }
      if (
        committedForm.startDate !== session.baseline.startDate ||
        committedForm.endDate !== session.baseline.endDate
      ) {
        payload.start_date = committedForm.startDate;
        payload.end_date = committedForm.endDate;
      }
    }
    if (Object.keys(payload).length === 0) {
      closeCommittedSession();
      return;
    }
    if (session.baseline.version !== undefined) {
      payload.expected_version = session.baseline.version;
    }
    setCommittedSaving(true);
    setCommittedError(null);
    setCommittedConflict(false);
    try {
      const response = await api.assignments.update(session.row.id, payload as never, {
        scenarioId: session.scenarioId,
      });
      const saved = response.data.data as unknown as AssignmentRow;
      // S6：逆补丁只含本次实际改动的字段 + 保存响应的新版本
      const inverse: Record<string, unknown> = {};
      if ('allocation_percentage' in payload) {
        inverse.allocation_percentage = session.baseline.allocation;
      }
      if ('start_date' in payload) {
        inverse.start_date = session.baseline.startDate;
        inverse.end_date = session.baseline.endDate;
      }
      const record = {
        id: session.row.id,
        scenarioId: session.scenarioId,
        inverse,
        savedVersion: saved.version,
      };
      closeCommittedSession();
      if (record.savedVersion !== undefined) {
        toast({
          title: t('assignments:workbench.committed.savedToast'),
          duration: 5000,
          action: (
            <ToastAction
              altText={t('assignments:workbench.committed.undo')}
              onClick={() => void performUndoCommitted(record)}
            >
              {t('assignments:workbench.committed.undo')}
            </ToastAction>
          ),
        });
      }
      void refreshAssignments();
    } catch (error: any) {
      const status = error?.response?.status;
      const serverMessage = String(
        error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message ?? ''
      );
      if (status === 409) {
        setCommittedConflict(true);
        setCommittedError(
          t('assignments:workbench.committed.versionConflict', { detail: serverMessage })
        );
      } else {
        setCommittedError(
          serverMessage || t('assignments:workload.edit.saveFailed')
        );
      }
    } finally {
      setCommittedSaving(false);
    }
  };

  /**
   * S4（§7.3）：角色/阶段转换——单请求；成功关闭面板并作废旧 id 的
   * pending undo（dismiss toast），失败保留面板与用户值。
   */
  const convertCommitted = async (payload: {
    role_id?: string;
    phase_id?: string | null;
    allocation_percentage?: number;
    start_date?: string;
    end_date?: string;
  }) => {
    const session = committedSession;
    if (!session || committedSaving || committedConverting) return;
    if (session.baseline.version === undefined) {
      setCommittedError(t('assignments:workbench.committed.convertFailed'));
      return;
    }
    setCommittedConverting(true);
    setCommittedError(null);
    setCommittedConflict(false);
    try {
      await api.assignments.convert(
        session.row.id,
        { ...payload, expected_version: session.baseline.version },
        { scenarioId: session.scenarioId }
      );
      // 旧 id 已失效：清掉可能仍挂着的一次撤销动作
      dismiss();
      closeCommittedSession();
      toast({
        title: t('assignments:workbench.committed.convertedToast'),
        duration: 4000,
      });
      void invalidateSchedulingReads(queryClient, String(session.row.project_id ?? ''));
      void refreshAssignments();
    } catch (error: any) {
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      const serverMessage = String(
        error?.response?.data?.message ??
          error?.response?.data?.error ??
          error?.message ??
          ''
      );
      if (code === 'ASSIGNMENT_DUPLICATE') {
        setCommittedError(t('assignments:workbench.committed.convertDuplicate'));
      } else if (code === 'ASSIGNMENT_SLOT_OCCUPIED') {
        setCommittedError(t('assignments:workbench.committed.convertSlotOccupied'));
      } else if (status === 409) {
        setCommittedConflict(true);
        setCommittedError(
          t('assignments:workbench.committed.versionConflict', { detail: serverMessage })
        );
      } else if (status === 400 && /direct/i.test(serverMessage)) {
        setCommittedError(t('assignments:workbench.committed.convertDirectUnsupported'));
      } else {
        setCommittedError(serverMessage || t('assignments:workbench.committed.convertFailed'));
      }
    } finally {
      setCommittedConverting(false);
    }
  };

  const performUndoCommitted = async (record: {
    id: string;
    scenarioId: string;
    inverse: Record<string, unknown>;
    savedVersion?: number;
  }) => {
    try {
      await api.assignments.update(
        record.id,
        {
          ...record.inverse,
          ...(record.savedVersion !== undefined
            ? { expected_version: record.savedVersion }
            : {}),
        } as never,
        { scenarioId: record.scenarioId }
      );
      toast({ title: t('assignments:workbench.committed.undoneToast'), duration: 3000 });
      void refreshAssignments();
    } catch {
      toast({
        title: t('assignments:workbench.committed.undoFailed'),
        variant: 'destructive',
        duration: 4000,
      });
    }
  };

  const focusBatchEntry = () => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="pw-batch-entry"]')?.focus();
    });
  };

  const startBatch = () => {
    const drafts: Record<string, string> = {};
    const baselines: Record<string, { version?: number; allocation: number }> = {};
    for (const row of allWorkloadRows()) {
      drafts[row.id] = String(Number(row.allocation_percentage ?? 0));
      baselines[row.id] = { version: row.version, allocation: Number(row.allocation_percentage ?? 0) };
    }
    setBatchDrafts(drafts);
    setBatchBaselines(baselines);
    setBatchShiftOpen(false);
    setBatchShiftPlan(null);
    setBatchShiftError(null);
    setBatchShiftForm({ direction: 'later', amount: '1', unit: 'day' });
    setBatchStatusConfirm(null);
    setBatchMessage(null);
    setBatchMode(true);
    setEditingId(null);
    setEditScenarioId(null);
    setHandoverRowId(null);
    setHandoverMessage(null);
    // 批量编辑的是下方"计入当前工作负载"表：全员配置面板（只读）若开着
    // 会挡在按钮与目标表之间，进入批量时自动收起
    setStaffingProject(null);
    // 批量输入在明细表里：进入后把工作区带入视野并聚焦首个比例输入，
    // 否则用户在按钮附近看不到任何变化（"点了没反应"）。
    window.requestAnimationFrame(() => {
      const firstInput = document.querySelector<HTMLElement>(
        '.person-workload-page .pw-allocation-input'
      );
      firstInput?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      firstInput?.focus?.();
    });
  };

  /**
   * 批量入口（EXP-012/021 同族整改）：不允许静默禁用。行编辑/交接未结束
   * 时点击 → 明确提示 + 滚动并聚焦到那个表单（原因可能不在视口内），
   * 绝不丢弃用户正在编辑的输入。
   */
  const handleBatchEntryClick = () => {
    const jumpTo = (selector: string, message: string) => {
      setBatchMessage({ tone: 'warning', text: message });
      window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(selector);
        target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        target?.focus?.();
      });
    };
    if (editingId) {
      jumpTo(
        `[data-assignment-id="${editingId}"] .pw-allocation-input`,
        t('assignments:workload.batch.finishEditFirst')
      );
      return;
    }
    if (handoverRowId) {
      jumpTo(
        `[data-assignment-id="${handoverRowId}"]`,
        t('assignments:workload.batch.finishHandoverFirst')
      );
      return;
    }
    // §4.5 互斥：committed 面板未结束时不进入批量（有未保存值/在途写则提示）
    if (committedSession) {
      if (committedSaving || committedConverting || committedRowDirty) {
        jumpTo('[data-testid="pw-committed-save"]', t('assignments:workbench.committed.finishPanelFirst'));
        return;
      }
      closeCommittedSession(false);
    }
    startBatch();
  };

  /** S6 批量撤销：一次保存视为一个操作，逆补丁逐行 + 保存响应版本。 */
  const performBatchUndo = async (
    records: Array<{
      id: string;
      scenarioId: string;
      inverse: Record<string, unknown>;
      savedVersion: number;
    }>
  ) => {
    let undone = 0;
    let failed = 0;
    for (const record of records) {
      try {
        await api.assignments.update(
          record.id,
          { ...record.inverse, expected_version: record.savedVersion } as never,
          { scenarioId: record.scenarioId }
        );
        undone += 1;
      } catch {
        failed += 1;
      }
    }
    toast({
      title:
        failed > 0
          ? t('assignments:workload.batch.undoPartial', { failed, total: records.length })
          : t('assignments:workload.batch.undoneToast', { count: undone }),
      variant: failed > 0 ? 'destructive' : undefined,
      duration: failed > 0 ? 4000 : 3000,
    });
    void invalidateSchedulingReads(queryClient);
    void refreshAssignments();
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
      const undoRecords: Array<{
        id: string;
        scenarioId: string;
        inverse: { allocation_percentage: number };
        savedVersion: number;
      }> = [];
      for (const { row, value, baseline } of updates) {
        const allocation = Number(value);
        if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
          failed += 1;
          continue;
        }
        try {
          const response = await api.assignments.update(
            row.id,
            {
              allocation_percentage: allocation,
              ...(baseline.version !== undefined ? { expected_version: baseline.version } : {}),
            } as never,
            { scenarioId: activeScenarioId }
          );
          saved += 1;
          savedIds.push(row.id);
          // S6：只记录实际改动字段的逆补丁 + 保存响应的新版本
          const savedRow = (response.data as any)?.data;
          if (typeof savedRow?.version === 'number') {
            undoRecords.push({
              id: row.id,
              scenarioId: activeScenarioId,
              inverse: { allocation_percentage: baseline.allocation },
              savedVersion: savedRow.version,
            });
          }
        } catch {
          failed += 1;
        }
      }
      return { saved, failed, noChanges: false, savedIds, undoRecords };
    },
    onSuccess: ({ saved, failed, noChanges, savedIds, undoRecords }) => {
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
        focusBatchEntry();
      }
      // S6：成功子集（需每行都有保存版本）给 5 秒撤销，一次操作一个 toast。
      if (undoRecords && undoRecords.length > 0 && undoRecords.length === saved) {
        toast({
          title: t('assignments:workload.batch.undoToast', { count: saved }),
          duration: 5000,
          action: (
            <ToastAction
              altText={t('assignments:workbench.committed.undo')}
              onClick={() => void performBatchUndo(undoRecords)}
            >
              {t('assignments:workbench.committed.undo')}
            </ToastAction>
          ),
        });
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

  // ---- S3：批量平移（预览冻结 → 应用）与批量暂停/恢复 ----
  const batchShiftMax = batchShiftForm.unit === 'day' ? 365 : batchShiftForm.unit === 'week' ? 52 : 12;

  const updateBatchShiftForm = (patch: Partial<typeof batchShiftForm>) => {
    setBatchShiftForm((prev) => ({ ...prev, ...patch }));
    // 参数一变，旧预览作废（§6.2：显式重新预览才更新冻结清单）
    setBatchShiftPlan(null);
    setBatchShiftError(null);
  };

  const previewBatchShift = () => {
    const amount = Number(batchShiftForm.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > batchShiftMax) {
      setBatchShiftPlan(null);
      setBatchShiftError(t('assignments:workload.batch.shiftInvalid', { max: batchShiftMax }));
      return;
    }
    setBatchShiftError(null);
    setBatchShiftPlan(
      planBatchShift(allWorkloadRows(), {
        direction: batchShiftForm.direction,
        amount,
        unit: batchShiftForm.unit,
        asOf,
      })
    );
  };

  const batchShiftMutation = useMutation({
    mutationFn: async (plan: BatchShiftPlan) => {
      let saved = 0;
      let failed = 0;
      const savedIds: string[] = [];
      const undoRecords: Array<{
        id: string;
        scenarioId: string;
        inverse: Record<string, unknown>;
        savedVersion: number;
      }> = [];
      for (const target of plan.rows) {
        try {
          const response = await api.assignments.update(
            target.id,
            {
              start_date: target.newStart,
              end_date: target.newEnd,
              ...(target.version !== undefined ? { expected_version: target.version } : {}),
            } as never,
            { scenarioId: activeScenarioId }
          );
          saved += 1;
          savedIds.push(target.id);
          const savedRow = (response.data as any)?.data;
          if (typeof savedRow?.version === 'number') {
            undoRecords.push({
              id: target.id,
              scenarioId: activeScenarioId,
              inverse: {
                start_date: target.originalStart,
                end_date: target.originalEnd,
              },
              savedVersion: savedRow.version,
            });
          }
        } catch {
          failed += 1;
        }
      }
      return { saved, failed, savedIds, blocked: plan.blocked.length, undoRecords };
    },
    onSuccess: ({ saved, failed, savedIds, blocked, undoRecords }, plan) => {
      // 已成功/已判定 blocked 的行移出冻结清单；网络失败行保留可重试
      const remaining = plan.rows.filter((row) => !savedIds.includes(row.id));
      if (remaining.length === 0) {
        setBatchShiftPlan(null);
      } else {
        setBatchShiftPlan({ ...plan, rows: remaining, blocked: [] });
      }
      const failedTotal = failed + blocked;
      if (failedTotal === 0) {
        setBatchMessage({
          tone: 'success',
          text: t('assignments:workload.batch.shiftApplied', { saved }),
        });
        if (!batchDraftsDirty()) {
          setBatchShiftOpen(false);
          focusBatchEntry();
        }
      } else {
        setBatchMessage({
          tone: 'warning',
          text: t('assignments:workload.batch.shiftPartial', {
            saved,
            failed: failedTotal,
            blocked,
          }),
        });
      }
      if (undoRecords.length > 0 && undoRecords.length === saved) {
        toast({
          title: t('assignments:workload.batch.undoToast', { count: saved }),
          duration: 5000,
          action: (
            <ToastAction
              altText={t('assignments:workbench.committed.undo')}
              onClick={() => void performBatchUndo(undoRecords)}
            >
              {t('assignments:workbench.committed.undo')}
            </ToastAction>
          ),
        });
      }
      void invalidateSchedulingReads(queryClient);
      void refreshAssignments();
    },
    onError: (error: any) => {
      setBatchShiftError(
        String(error?.response?.data?.message ?? error?.message ?? t('assignments:workload.batch.failed'))
      );
    },
  });

  const requestBatchStatus = (action: 'pause' | 'resume') => {
    const rows = allWorkloadRows().filter((row) =>
      action === 'pause' ? row.status !== 'paused' : row.status === 'paused'
    );
    if (rows.length === 0) {
      setBatchMessage({
        tone: 'warning',
        text: t(action === 'pause' ? 'assignments:workload.batch.pauseNothing' : 'assignments:workload.batch.resumeNothing'),
      });
      return;
    }
    setBatchStatusConfirm({ action, rows });
  };

  const batchStatusMutation = useMutation({
    mutationFn: async ({ action, rows }: { action: 'pause' | 'resume'; rows: AssignmentRow[] }) => {
      const nextStatus = action === 'pause' ? 'paused' : 'active';
      let saved = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          await api.assignments.update(
            row.id,
            {
              status: nextStatus,
              ...(row.version !== undefined ? { expected_version: row.version } : {}),
            } as never,
            { scenarioId: activeScenarioId }
          );
          saved += 1;
        } catch {
          failed += 1;
        }
      }
      return { saved, failed, action };
    },
    onSuccess: ({ saved, failed, action }) => {
      setBatchStatusConfirm(null);
      setBatchMessage(
        failed > 0
          ? { tone: 'warning', text: t('assignments:workload.batch.statusPartial', { saved, failed }) }
          : {
              tone: 'success',
              text: t(
                action === 'pause'
                  ? 'assignments:workload.batch.pauseSaved'
                  : 'assignments:workload.batch.resumeSaved',
                { count: saved }
              ),
            }
      );
      void invalidateSchedulingReads(queryClient);
      void refreshAssignments();
    },
    onError: (error: any) => {
      setBatchStatusConfirm(null);
      setBatchMessage({
        tone: 'error',
        text: String(error?.message ?? t('assignments:workload.batch.statusFailed')),
      });
    },
  });


  const confirmDelete = (row: AssignmentRow) => {
    setActionConfirm({
      title: t(
        row.assignment_type === 'direct'
          ? 'assignments:workload.edit.deleteDirectTitle'
          : 'assignments:workload.edit.deleteTitle'
      ),
      message: `${t(
        row.assignment_type === 'direct'
          ? 'assignments:workload.edit.deleteDirectConfirm'
          : 'assignments:workload.edit.deleteConfirm'
      )} ${row.project_name ?? ''} · ${row.role_name ?? ''} · ${
        workloadDateOnly(row.computed_start_date ?? row.start_date) ?? '—'
      } → ${workloadDateOnly(row.computed_end_date ?? row.end_date) ?? '—'}`,
      confirmText: t('assignments:workload.actions.delete'),
      variant: 'danger',
      onConfirm: () => {
        setActionConfirm(null);
        const allRows = allWorkloadRows();
        const focusIndex = allRows.findIndex((candidate) => candidate.id === row.id);
        deleteMutation.mutate({
          row,
          scenarioId: activeScenarioId,
          focusIndex: focusIndex >= 0 ? focusIndex : 0,
        });
      },
    });
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
            const sessionRow =
              committedSession && String(committedSession.row.id) === String(item.id);
            // W-05：面板打开时表格读同一可见窗口，而不是服务端旧值
            const displayStart =
              sessionRow && mode === 'fixed' && committedForm.startDate
                ? committedForm.startDate
                : start;
            const displayEnd =
              sessionRow && mode === 'fixed' && committedForm.endDate
                ? committedForm.endDate
                : end;
            const derived = mode === 'phase' || mode === 'project';
            const direct = item.assignment_type === 'direct';
            const unresolved = Boolean(item.date_resolution_error) || !displayStart || !displayEnd;
            const formAllocation = sessionRow ? Number(committedForm.allocation) : NaN;
            const allocation =
              sessionRow && Number.isFinite(formAllocation) && formAllocation > 0
                ? formAllocation
                : Number(item.allocation_percentage ?? 0);
            const endDisplay =
              displayStart && displayEnd && displayStart.slice(0, 4) === displayEnd.slice(0, 4)
                ? displayEnd.slice(5)
                : displayEnd;
            const editing = editingId === item.id;
            const saving = savingId === item.id;
            const error = rowError?.id === item.id ? rowError.message : null;

            return (
              <React.Fragment key={item.id}>
                <tr
                  className={[
                    excluded ? 'pw-row--excluded' : '',
                    deepLinkHighlightId === String(item.id) ? 'pw-row--deeplink' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
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
                        <IsoDateInput
                          ariaLabel={t('assignments:workload.edit.startDate')}
                          value={draft.startDate}
                          onValueChange={(value) =>
                            setDraft((prev) => ({ ...prev, startDate: value }))
                          }
                        />
                        <span aria-hidden="true">→</span>
                        <IsoDateInput
                          ariaLabel={t('assignments:workload.edit.endDate')}
                          value={draft.endDate}
                          onValueChange={(value) =>
                            setDraft((prev) => ({ ...prev, endDate: value }))
                          }
                        />
                      </div>
                    ) : (
                      <>
                        <div className="pw-dates">
                          <span>{displayStart || '—'}</span>
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
                      <Badge
                        variant="outline"
                        className={`pw-status-badge pw-status-badge--${reason}`}
                      >
                        {t(`assignments:workload.exclusion.${reason}`)}
                      </Badge>
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
                          disabled={saving || committedSaving || committedConverting}
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
                            disabled={saving || committedSaving || committedConverting}
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
                          disabled={saving || committedSaving || committedConverting}
                          onClick={() => toggleStatus(item)}
                        >
                          {item.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="pw-edit-row"
                          aria-label={t('assignments:workload.actions.edit')}
                          disabled={committedSaving || committedConverting}
                          onClick={() => beginEdit(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm pw-delete-btn"
                          aria-label={t('assignments:workload.actions.delete')}
                          disabled={saving || committedSaving || committedConverting}
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
                        {peopleQuery.isError ? (
                          <div className="pw-handover-error" role="alert">
                            {t('assignments:workload.handover.peopleError')}{' '}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => peopleQuery.refetch()}
                            >
                              {t('assignments:workload.states.retry')}
                            </button>
                          </div>
                        ) : null}
                        <label>
                          {t('assignments:workload.handover.effectiveDate')}
                          <IsoDateInput
                            ariaLabel={t('assignments:workload.handover.effectiveDate')}
                            value={handoverDraft.effectiveDate}
                            onValueChange={(value) =>
                              setHandoverDraft((prev) => ({ ...prev, effectiveDate: value }))
                            }
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
                            disabled={
                              saving ||
                              committedSaving ||
                              committedConverting ||
                              peopleQuery.isLoading ||
                              peopleQuery.isError
                            }
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
          guardLeave(() => navigate(`/people/${person.id}`));
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

      {deepLinkHint ? (
        <div
          className={`pw-deeplink${deepLinkNotice === 'missing' ? ' pw-deeplink--warning' : ''}`}
          role="status"
          data-testid="pw-deeplink"
        >
          <BriefcaseBusiness size={14} aria-hidden="true" />
          <span>
            {t('assignments:workbench.staffing.fromProject')}
            {deepLinkNotice === 'located'
              ? ` · ${t('assignments:workbench.staffing.deepLinkLocated')}`
              : deepLinkNotice === 'missing'
                ? ` · ${t('assignments:workbench.staffing.deepLinkMissing')}`
                : ''}
          </span>
        </div>
      ) : null}

      {utilizationQuery.isError ? (
        <div className="pw-alert" role="alert">
          <span>{t('assignments:workload.states.utilizationError')}</span>
          <button className="btn btn-secondary" onClick={() => utilizationQuery.refetch()}>
            <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : null}

      <div className="pw-main">
      {assignmentsQuery.isLoading ? (
        <div className="pw-data-state" role="status" aria-busy="true" data-testid="pw-assignments-loading">
          <span className="pw-data-skeleton pw-data-skeleton--metrics" aria-hidden="true" />
          <span className="pw-data-skeleton pw-data-skeleton--gantt" aria-hidden="true" />
          <span>{t('assignments:workload.states.loading')}</span>
        </div>
      ) : assignmentsQuery.isError ? (
        <div className="pw-data-state pw-data-state--error" role="alert" data-testid="pw-assignments-error">
          <AlertTriangle size={16} aria-hidden="true" />
          <strong>{t('assignments:workload.states.assignmentsError')}</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => assignmentsQuery.refetch()}>
            <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : (
        <React.Fragment>
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

      {draftScenarioMismatch || committedScenarioMismatch ? (
        <div className="pw-scenario-banner" role="alert" data-testid="pw-draft-scenario-mismatch">
          <div>
            <strong>{t('assignments:workbench.mismatch.title')}</strong>
            <p>
              {t('assignments:workbench.mismatch.body', {
                count: draftStore.drafts.length + (committedScenarioMismatch ? 1 : 0),
              })}
            </p>
          </div>
          <div className="pw-scenario-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                draftStore.clearDrafts();
                closeCommittedSession(false);
              }}
            >
              {t('assignments:workbench.mismatch.discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const targetId = committedScenarioMismatch
                  ? committedSession?.scenarioId
                  : draftScenarioId;
                const original = scenarios.find((scenario) => scenario.id === targetId);
                if (original) setCurrentScenario(original);
              }}
            >
              {t('assignments:workbench.mismatch.back')}
            </button>
          </div>
        </div>
      ) : null}

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
          // S2（§5.2）：点击已提交 bar → 就地打开 committed 面板（替换旧的
          // "定位到表格行"行为）；面板内提供「在表格中定位」。
          const row = findWorkloadRow(assignmentId);
          if (row) openCommittedSession(row, 'click');
        }}
        committedPreview={visibleCommittedPreview}
        onCommittedDragPreview={(preview) => setCommittedPreview(preview)}
        onCommittedDragEnd={(preview) => {
          const row = findWorkloadRow(preview.assignmentId);
          if (!row) {
            setCommittedPreview(null);
            return;
          }
          const sameStart = preview.startDate === (workloadDateOnly(row.start_date) ?? '');
          const sameEnd = preview.endDate === (workloadDateOnly(row.end_date) ?? '');
          // 同一行的多次拖动：沿用已打开会话，只更新"当前预览/表单日期"；
          // baseline（服务端行/版本）保持不变，保存仍按打开时的快照做乐观锁。
          if (committedSession && String(committedSession.row.id) === String(row.id)) {
            setCommittedForm((prev) => ({
              ...prev,
              startDate: preview.startDate,
              endDate: preview.endDate,
            }));
            setCommittedPreview(sameStart && sameEnd ? null : preview);
            setCommittedError(null);
            setCommittedConflict(false);
            return;
          }
          if (sameStart && sameEnd) {
            setCommittedPreview(null);
            return;
          }
          if (committedSession) {
            // 其它行会话开着时不允许开始新拖动（Gantt 已拦截）；防御性清预览
            setCommittedPreview(null);
            return;
          }
          openCommittedSession(row, 'drag', preview);
        }}
        committedDragAssignmentId={
          committedSession ? String(committedSession.row.id) : null
        }
        committedDragEnabled={
          !draftStore.submitting &&
          !committedSaving &&
          !committedConverting &&
          !committedScenarioMismatch &&
          !draftScenarioMismatch &&
          !editingId &&
          !handoverRowId &&
          !batchMode &&
          !inspectorDraftId
        }
        onLocateGhost={(draftId) => {
          const draft = draftStore.drafts.find((entry) => entry.draftId === draftId);
          if (!draft) return;
          setGanttCollapsed(false);
          // 左右越界都要真正移动窗口，而不是只开面板（W-14）
          if (draft.startDate && draft.startDate < rangeStart) {
            setRangeStartOverride(draft.startDate);
          }
          if (draft.endDate && draft.endDate > rangeEnd) {
            setRangeEndOverride((prev) =>
              draft.endDate! > (prev ?? defaultRangeEnd) ? draft.endDate : prev
            );
          }
          setInspectorDraftId(draftId);
        }}
        onGhostDatesChange={handleGhostDatesChange}
        minimapBuckets={minimapTimeline.buckets}
        onNavigateRange={(monthStart) => {
          // W-06：移动未来窗口不得回退历史左界（进行中分配的真实 start）
          setRangeStartOverride(historyRangeStart === asOf ? null : historyRangeStart);
          const anchor = monthStart >= asOf ? monthStart : asOf;
          setRangeEndOverride(shiftIsoMonths(anchor, 3));
        }}
        onLocateCommitted={(assignmentId) => {
          const row = findWorkloadRow(assignmentId);
          if (!row) return;
          const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
          if (end && end > rangeEnd) setRangeEndOverride(end);
          jumpToVisible(`[data-assignment-id="${assignmentId}"]`);
        }}
        onProjectLaneClick={openStaffingProject}
      />

      {staffingProject ? (
        <ProjectStaffingPanel
          projectId={staffingProject.id}
          projectName={staffingProject.name}
          scenarioId={activeScenarioId}
          asOf={asOf}
          onNavigateToPerson={handleStaffingNavigate}
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
          // N-02/S7：清空是破坏性操作——已调参的草稿经统一确认框
          if (draftStore.drafts.length === 0) return;
          setActionConfirm({
            title: t('assignments:workbench.clearTitle'),
            message: t('assignments:workbench.clearConfirm'),
            confirmText: t('assignments:workbench.clearConfirmAction', {
              defaultValue: t('assignments:workbench.committed.discardConfirm'),
            }),
            variant: 'danger',
            onConfirm: () => {
              setActionConfirm(null);
              draftStore.clearDrafts();
            },
          });
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

      {committedSession ? (
        <CommittedInspector
          row={{
            id: String(committedSession.row.id),
            projectId: String(committedSession.row.project_id),
            projectName: committedSession.row.project_name ?? String(committedSession.row.project_id),
            roleId: committedSession.row.role_id ?? null,
            roleName: committedSession.row.role_name ?? null,
            phaseId: committedSession.row.phase_id ?? null,
            phaseName: committedSession.row.phase_name ?? null,
            source: committedSession.row.assignment_type ?? null,
            version: committedSession.row.version ?? null,
            dateMode: committedSession.row.assignment_date_mode ?? 'fixed',
            derivedStartDate: workloadDateOnly(
              committedSession.row.computed_start_date ?? committedSession.row.start_date
            ),
            derivedEndDate: workloadDateOnly(
              committedSession.row.computed_end_date ?? committedSession.row.end_date
            ),
          }}
          form={committedForm}
          baseline={{
            allocation: committedSession.baseline.allocation,
            startDate: committedSession.baseline.startDate,
            endDate: committedSession.baseline.endDate,
          }}
          saving={committedSaving}
          converting={committedConverting}
          error={committedError}
          conflict={committedConflict}
          disabled={committedScenarioMismatch}
          roleOptions={(person.roles ?? [])
            .map((role) => ({
              role_id: String(role.role_id ?? ''),
              role_name: String(role.role_name ?? ''),
            }))
            .filter((role) => role.role_id)}
          onChange={(patch) => setCommittedForm((prev) => ({ ...prev, ...patch }))}
          onSave={() => void saveCommitted()}
          onConvert={(payload) => void convertCommitted(payload)}
          onRefreshLatest={() => void refreshCommittedLatest()}
          onLocateInTable={() => {
            jumpToVisible(`[data-assignment-id="${committedSession.row.id}"]`);
          }}
          onRequestClose={requestCloseCommitted}
          assignments={assignmentsQuery.data ?? []}
          availability={heatDefaultAvailability}
          availabilityOverrides={availabilityOverrides}
          asOf={asOf}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
        />
      ) : null}

      {actionConfirm ? (
        <ConfirmDialog
          isOpen
          title={actionConfirm.title}
          message={actionConfirm.message}
          confirmText={actionConfirm.confirmText}
          variant={actionConfirm.variant ?? 'default'}
          onConfirm={actionConfirm.onConfirm}
          onCancel={() => setActionConfirm(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={committedConfirmOpen}
        title={t('assignments:workbench.committed.discardTitle')}
        message={t('assignments:workbench.committed.discardBody')}
        confirmText={t('assignments:workbench.committed.discardConfirm')}
        cancelText={t('assignments:workbench.committed.discardCancel')}
        variant="danger"
        onConfirm={() => {
          setCommittedConfirmOpen(false);
          closeCommittedSession();
        }}
        onCancel={() => setCommittedConfirmOpen(false)}
      />

      {batchStatusConfirm ? (
        <ConfirmDialog
          isOpen
          title={t(
            batchStatusConfirm.action === 'pause'
              ? 'assignments:workload.batch.pauseConfirmTitle'
              : 'assignments:workload.batch.resumeConfirmTitle'
          )}
          message={t(
            batchStatusConfirm.action === 'pause'
              ? 'assignments:workload.batch.pauseConfirmBody'
              : 'assignments:workload.batch.resumeConfirmBody',
            {
              count: batchStatusConfirm.rows.length,
              direct: batchStatusConfirm.rows.filter(
                (row) => row.assignment_type === 'direct'
              ).length,
            }
          )}
          confirmText={t(
            batchStatusConfirm.action === 'pause'
              ? 'assignments:workload.actions.pause'
              : 'assignments:workload.actions.resume'
          )}
          variant={batchStatusConfirm.action === 'pause' ? 'danger' : 'default'}
          onConfirm={() => {
            if (!batchStatusMutation.isPending) {
              batchStatusMutation.mutate(batchStatusConfirm);
            }
          }}
          onCancel={() => setBatchStatusConfirm(null)}
        />
      ) : null}

      <section className="pw-section" aria-labelledby="pw-current-title">
        <div className="pw-section-head">
          <div>
            <h2 id="pw-current-title">{t('assignments:workload.sections.currentTitle')}</h2>
            <p>{t('assignments:workload.sections.currentDescription')}</p>
          </div>
          <div className="pw-section-actions">
            <span className="pw-section-total">{summary.totalAllocation}%</span>
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
                    setBatchShiftOpen(false);
                    setBatchShiftPlan(null);
                    setBatchShiftError(null);
                    setBatchMessage(null);
                    focusBatchEntry();
                  }}
                >
                  {t('assignments:workload.batch.cancel')}
                </button>
              </>
            ) : (
              // A（affordance 整改）：入口放进它编辑的表格标题区，位置即范围
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleBatchEntryClick}
                data-testid="pw-batch-entry"
                title={t('assignments:workload.batch.scopeHint')}
              >
                {t('assignments:workload.batch.edit')}
              </button>
            )}
          </div>
        </div>
        {batchMode ? <p className="pw-batch-hint">{t('assignments:workload.batch.hint')}</p> : null}
        {batchMode ? (
          <div className="pw-batch-tools" data-testid="pw-batch-tools">
            <div className="pw-batch-tools-row">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={batchShiftOpen}
                onClick={() => {
                  setBatchShiftOpen((open) => !open);
                  setBatchShiftError(null);
                }}
                data-testid="pw-batch-shift-toggle"
              >
                {batchShiftOpen
                  ? t('assignments:workload.batch.shiftHide')
                  : t('assignments:workload.batch.shiftToggle')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={batchStatusMutation.isPending}
                onClick={() => requestBatchStatus('pause')}
                data-testid="pw-batch-pause"
              >
                <Pause size={14} /> {t('assignments:workload.batch.pauseAll')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={batchStatusMutation.isPending}
                onClick={() => requestBatchStatus('resume')}
                data-testid="pw-batch-resume"
              >
                <Play size={14} /> {t('assignments:workload.batch.resumeAll')}
              </button>
            </div>

            {batchShiftOpen ? (
              <div
                className="pw-batch-shift-form"
                role="group"
                aria-label={t('assignments:workload.batch.shiftToggle')}
              >
                <label>
                  <span>{t('assignments:workload.batch.shiftDirection')}</span>
                  <select
                    value={batchShiftForm.direction}
                    aria-label={t('assignments:workload.batch.shiftDirection')}
                    onChange={(event) =>
                      updateBatchShiftForm({
                        direction: event.target.value as 'earlier' | 'later',
                      })
                    }
                  >
                    <option value="later">{t('assignments:workload.batch.shiftLater')}</option>
                    <option value="earlier">{t('assignments:workload.batch.shiftEarlier')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('assignments:workload.batch.shiftAmount')}</span>
                  <input
                    type="number"
                    min={1}
                    max={batchShiftMax}
                    value={batchShiftForm.amount}
                    aria-label={t('assignments:workload.batch.shiftAmount')}
                    onChange={(event) => updateBatchShiftForm({ amount: event.target.value })}
                  />
                </label>
                <label>
                  <span>{t('assignments:workload.batch.shiftUnit')}</span>
                  <select
                    value={batchShiftForm.unit}
                    aria-label={t('assignments:workload.batch.shiftUnit')}
                    onChange={(event) =>
                      updateBatchShiftForm({ unit: event.target.value as BatchShiftUnit })
                    }
                  >
                    <option value="day">{t('assignments:workload.batch.shiftUnitDay')}</option>
                    <option value="week">{t('assignments:workload.batch.shiftUnitWeek')}</option>
                    <option value="month">{t('assignments:workload.batch.shiftUnitMonth')}</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={previewBatchShift}
                  data-testid="pw-batch-shift-preview"
                >
                  {batchShiftPlan
                    ? t('assignments:workload.batch.shiftRePreview')
                    : t('assignments:workload.batch.shiftPreview')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={
                    !batchShiftPlan ||
                    batchShiftPlan.rows.length === 0 ||
                    batchShiftMutation.isPending
                  }
                  onClick={() => {
                    if (batchShiftPlan) batchShiftMutation.mutate(batchShiftPlan);
                  }}
                  data-testid="pw-batch-shift-apply"
                >
                  {batchShiftMutation.isPending
                    ? t('assignments:workload.batch.shiftApplying')
                    : t('assignments:workload.batch.shiftApply')}
                </button>
              </div>
            ) : null}

            {batchShiftError ? (
              <span
                className="pw-batch-message pw-batch-message--error"
                role="alert"
                data-testid="pw-batch-shift-error"
              >
                {batchShiftError}
              </span>
            ) : null}
            {batchShiftPlan ? (
              <div className="pw-batch-shift-summary" role="status" data-testid="pw-batch-shift-summary">
                <span>
                  {t('assignments:workload.batch.shiftPreviewSummary', {
                    count: batchShiftPlan.rows.length,
                    skipped: batchShiftSkipTotal(batchShiftPlan.skipped),
                    paused: batchShiftPlan.skipped.paused,
                    phase: batchShiftPlan.skipped.phase,
                    project: batchShiftPlan.skipped.project,
                    undated: batchShiftPlan.skipped.undated,
                  })}
                </span>
                {batchShiftDirectCount(batchShiftPlan) > 0 ? (
                  <span className="pw-batch-shift-blocked" data-testid="pw-batch-shift-direct">
                    {t('assignments:workload.batch.shiftDirectWarning', {
                      count: batchShiftDirectCount(batchShiftPlan),
                    })}
                  </span>
                ) : null}
                {batchShiftPlan.blocked.length > 0 ? (
                  <span className="pw-batch-shift-blocked" data-testid="pw-batch-shift-blocked">
                    {t('assignments:workload.batch.shiftBlockedSummary', {
                      count: batchShiftPlan.blocked.length,
                      names: batchShiftPlan.blocked
                        .slice(0, 3)
                        .map((row) => row.label)
                        .join(', '),
                    })}
                  </span>
                ) : null}
                {batchShiftPlan.rows.length > 0 ? (
                  <ul className="pw-batch-shift-windows">
                    {batchShiftPlan.rows.slice(0, 3).map((row) => (
                      <li key={row.id}>
                        {row.label}: {row.originalStart} → {row.newStart} · {row.originalEnd} →{' '}
                        {row.newEnd}
                      </li>
                    ))}
                    {batchShiftPlan.rows.length > 3 ? (
                      <li>
                        {t('assignments:workload.batch.shiftMoreRows', {
                          count: batchShiftPlan.rows.length - 3,
                        })}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {batchMessage ? (
          <span className={`pw-batch-message pw-batch-message--${batchMessage.tone}`} role="status" data-testid="pw-batch-message">
            {batchMessage.text}
          </span>
        ) : null}
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
        </React.Fragment>
      )}
      </div>

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
