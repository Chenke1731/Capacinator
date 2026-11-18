/**
 * WorkloadGantt（工作台 v2 §5.2/§8 + 交互优化 S1/S2）——工作负载泳道：
 * 容量热区（workloadTimeline buckets，100% 相对线）+ 分配 bar 层。
 *
 * 拖拽：ghost 即时改草稿；已提交 fixed bar 越过 3px 阈值后进入"预览 →
 * 松手开确认面板"（不直存）。边界由 committedBarDrag 纯函数统一（已开始行
 * 不截断历史、右端缩放不改开始日、已结束行不可拖）。拖拽成立后吞掉随后
 * click，避免确认面板被 S2 重开覆盖。
 *
 * bar 视觉契约：fixed 实心；phase/project 派生虚线+锁形 aria；paused 灰；
 * future/ended 淡化；ghost 斜纹半透明（§18 视觉验收）。范围外 ghost 给
 * 定位入口（§20.3）。可折叠为紧凑容量条（1366）。
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Crosshair, Lock, Calendar } from 'lucide-react';
import { workloadDateOnly, type WorkloadAssignment } from '../../lib/personWorkload';
import type { AssignmentDraft } from '../../lib/assignmentDrafts';
import type { WorkloadTimelineBucket, WorkloadTimelineResult } from '../../lib/workloadTimeline';
import { canDragCommittedBar, computeCommittedDragDates } from '../../lib/committedBarDrag';
import { CapacityHeatStrip } from './CapacityHeatStrip';
import { WorkloadRangePanel } from './WorkloadRangePanel';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(iso: string): number {
  return Math.floor(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS
  );
}

export interface GanttAssignmentMeta extends WorkloadAssignment {
  project_name?: string | null;
  role_name?: string | null;
}

export interface CommittedDatePreview {
  assignmentId: string;
  startDate: string;
  endDate: string;
}

export interface WorkloadGanttProps {
  timeline: WorkloadTimelineResult;
  committedRows: GanttAssignmentMeta[];
  drafts: AssignmentDraft[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGhostClick: (draftId: string) => void;
  onBarClick: (assignmentId: string) => void;
  /** 范围外 ghost 的定位（切到该 ghost 的日期范围） */
  onLocateGhost?: (draftId: string) => void;
  /** Phase 2：fixed ghost 拖动/缩放落点（已按天对齐，页面负责钳制） */
  onGhostDatesChange?: (draftId: string, next: { startDate: string; endDate: string }) => void;
  /** Phase 3 mini-map：12 个月月桶总览；点击月桶移动观察窗 */
  minimapBuckets?: WorkloadTimelineBucket[];
  onNavigateRange?: (monthStart: string) => void;
  /** Phase 3 项目泳道模式：lane 点击查看该项目全员配置 */
  onProjectLaneClick?: (projectId: string, projectName: string) => void;
  /** S1：已提交 fixed bar 拖动中的临时预览（页面用它驱动热区投影） */
  committedPreview?: CommittedDatePreview | null;
  /** S1：拖动中（每次位移后）更新预览 */
  onCommittedDragPreview?: (preview: CommittedDatePreview) => void;
  /** S1：松手且日期变化 → 页面打开 committed 面板（沿用会话） */
  onCommittedDragEnd?: (preview: CommittedDatePreview) => void;
  /** S1：拖拽总开关（提交中/场景失配/只读时关闭） */
  committedDragEnabled?: boolean;
  /** S8：窗口外 committed 行（start 在窗口末端之后）的定位入口 */
  onLocateCommitted?: (assignmentId: string) => void;
  /** 已打开面板的行 id：只允许该行继续拖动（多次拖动沿用当前预览），其它行禁止 */
  committedDragAssignmentId?: string | null;
  /** 当前窗口是否来自用户自定义（触发器显示“自定义”） */
  rangeIsCustom?: boolean;
  /** 用户应用自定义窗口；提供时才显示范围编辑入口 */
  onApplyRange?: (start: string, end: string) => void;
  onResetRange?: () => void;
  /** 可用率覆盖查询状态：未就绪时热区不得显示确定数字 */
  availabilityStatus?: 'ready' | 'loading' | 'error';
  onRetryAvailability?: () => void;
}

type DragMode = 'move' | 'start' | 'end';

interface DragState {
  kind: 'draft' | 'committed';
  id: string;
  mode: DragMode;
  pointerStartX: number;
  trackWidth: number;
  origStart: number | null;
  origEnd: number | null;
  /** committed：越过 3px 阈值后才算拖动成立（否则视为点击） */
  started: boolean;
  lastDelta?: number;
  lastPreview?: CommittedDatePreview;
}

interface BarModel {
  key: string;
  kind: 'committed' | 'ghost';
  /** 完整串（title/aria/OOR 列表用）；条面显示走 textMain/textTail 分栏 */
  label: string;
  /** Batch3(2026-11-15): 条内分栏——主文本(项目·角色,左侧可 ellipsis) */
  textMain: string;
  /** Batch3(2026-11-15): 尾缀(投入%,右侧钉住不裁) */
  textTail: string;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  mode: 'fixed' | 'phase' | 'project' | string | null;
  ghost?: AssignmentDraft;
  assignmentId?: string;
  draftId?: string;
}

interface LaneModel {
  projectId: string;
  projectName: string;
  bars: BarModel[];
  hasGhost: boolean;
}

export function WorkloadGantt({
  timeline,
  committedRows,
  drafts,
  collapsed,
  onToggleCollapse,
  onGhostClick,
  onBarClick,
  onLocateGhost,
  onGhostDatesChange,
  minimapBuckets,
  onNavigateRange,
  onProjectLaneClick,
  committedPreview,
  onCommittedDragPreview,
  onCommittedDragEnd,
  committedDragEnabled = false,
  onLocateCommitted,
  committedDragAssignmentId = null,
  rangeIsCustom = false,
  onApplyRange,
  onResetRange,
  availabilityStatus = 'ready',
  onRetryAvailability,
}: WorkloadGanttProps) {
  const { t } = useTranslation(['assignments', 'common']);
  const [rangePanelOpen, setRangePanelOpen] = useState(false);
  const [rangePopoverStyle, setRangePopoverStyle] = useState<CSSProperties>({});
  const rangeToggleRef = useRef<HTMLButtonElement | null>(null);
  const rangePopoverRef = useRef<HTMLDivElement | null>(null);

  const closeRangePanel = useCallback(() => {
    setRangePanelOpen(false);
    window.requestAnimationFrame(() => rangeToggleRef.current?.focus());
  }, []);

  // 非模态浮层：外点关闭；点击触发器自身交给 onClick 切换，避免刚开就关
  useEffect(() => {
    if (!rangePanelOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rangePopoverRef.current?.contains(target)) return;
      if (rangeToggleRef.current?.contains(target)) return;
      setRangePanelOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [rangePanelOpen]);

  // 贴住触发器右缘向下弹出，并只占视口剩余高度；内容在浮层内滚动
  useLayoutEffect(() => {
    if (!rangePanelOpen) return;
    const update = () => {
      const trigger = rangeToggleRef.current?.getBoundingClientRect();
      const card = rangePopoverRef.current?.offsetParent as HTMLElement | null;
      const cardRect = card?.getBoundingClientRect();
      if (!trigger || !cardRect) return;
      const width = Math.min(680, Math.max(280, cardRect.width - 48));
      setRangePopoverStyle({
        top: trigger.bottom - cardRect.top + 6,
        right: Math.max(8, cardRect.right - trigger.right),
        width,
        maxHeight: Math.max(200, window.innerHeight - trigger.bottom - 16),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [rangePanelOpen]);

  const rangeStartDay = toDayNumber(timeline.rangeStart);
  const rangeEndDay = toDayNumber(timeline.rangeEnd);
  const totalDays = Math.max(rangeEndDay - rangeStartDay + 1, 1);
  // S1 手柄命中策略（§15，Claude R4）：每条边 24px 命中区；bar 太窄时
  // 三个手势无法共存 → 降级为"仅移动"，缩放走面板日期输入。
  // 轨道宽度用首条泳道测量（所有泳道同宽），ResizeObserver 跟随视口。
  const [trackWidth, setTrackWidth] = useState(0);
  const trackResizeObserverRef = useRef<ResizeObserver | null>(null);
  const measureTrackRef = useCallback((node: HTMLDivElement | null) => {
    trackResizeObserverRef.current?.disconnect();
    trackResizeObserverRef.current = null;
    if (!node) return;
    setTrackWidth(node.getBoundingClientRect().width || 0);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setTrackWidth(width);
    });
    observer.observe(node);
    trackResizeObserverRef.current = observer;
  }, []);
  useEffect(() => () => trackResizeObserverRef.current?.disconnect(), []);
  // S1：拖拽成立后吞掉随后 click（否则会按 S2 重开并覆盖预填）
  const suppressClickRef = useRef(false);
  // S1 手感改造：拖动中本地即时预览（bar 跟手），页面热区投影按 80ms 节流；
  // 浮动提示显示精确到日的起止与时长，解决"不知道拖到哪天"。
  const [localDragPreview, setLocalDragPreview] = useState<CommittedDatePreview | null>(null);
  const [dragTip, setDragTip] = useState<{
    x: number;
    y: number;
    preview: CommittedDatePreview;
    mode: DragMode;
    deltaDays: number;
    appliedDelta: number;
    clamped: boolean;
    durationDays: number;
  } | null>(null);
  const dragNotifyRef = useRef<{
    last: number;
    timer: number | null;
    pending: CommittedDatePreview | null;
  }>({ last: 0, timer: null, pending: null });
  const bodyCursorRef = useRef<{ cursor: string; userSelect: string } | null>(null);

  const notifyCommittedPreview = useCallback(
    (preview: CommittedDatePreview) => {
      const notify = onCommittedDragPreview;
      if (!notify) return;
      const state = dragNotifyRef.current;
      state.pending = preview;
      const flush = () => {
        state.timer = null;
        state.last = Date.now();
        const next = state.pending;
        state.pending = null;
        if (next) notify(next);
      };
      if (Date.now() - state.last >= 80) flush();
      else if (state.timer === null) {
        state.timer = window.setTimeout(flush, 80);
      }
    },
    [onCommittedDragPreview]
  );

  const clearDragFeedback = useCallback(() => {
    const state = dragNotifyRef.current;
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    state.pending = null;
    setLocalDragPreview(null);
    setDragTip(null);
    if (bodyCursorRef.current) {
      document.body.style.cursor = bodyCursorRef.current.cursor;
      document.body.style.userSelect = bodyCursorRef.current.userSelect;
      bodyCursorRef.current = null;
    }
  }, []);

  // ---- Phase 2/S1：ghost 与已提交 fixed bar 的拖拽/缩放（指针 + 键盘）----
  const dragRef = useRef<DragState | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const dragGhostEditable = (draft: AssignmentDraft | undefined): boolean =>
    Boolean(
      onGhostDatesChange &&
        draft &&
        draft.assignmentDateMode === 'fixed' &&
        draft.startDate &&
        draft.endDate &&
        (draft.submitState === 'IDLE' || draft.submitState === 'FAILED')
    );
  const dragCommittedEditable = (bar: BarModel): boolean =>
    Boolean(
      committedDragEnabled &&
        onCommittedDragPreview &&
        onCommittedDragEnd &&
        bar.kind === 'committed' &&
        bar.assignmentId &&
        (!committedDragAssignmentId || bar.assignmentId === committedDragAssignmentId) &&
        canDragCommittedBar(
          {
            dateMode: bar.mode,
            status: bar.status,
            startDate: bar.startDate ?? '',
            endDate: bar.endDate ?? '',
          },
          timeline.asOf
        )
    );

  const applyDrag = useCallback(
    (state: DragState, deltaDays: number) => {
      if (state.kind === 'draft') {
        const next = onGhostDatesChange;
        if (!next || !state.origStart || !state.origEnd) return;
        const draft = drafts.find((entry) => entry.draftId === state.id);
        if (!dragGhostEditable(draft)) return;
        let startDay = state.origStart;
        let endDay = state.origEnd;
        if (state.mode === 'move') {
          startDay += deltaDays;
          endDay += deltaDays;
        } else if (state.mode === 'start') {
          startDay = Math.min(state.origStart + deltaDays, state.origEnd);
        } else {
          endDay = Math.max(state.origEnd + deltaDays, state.origStart);
        }
        next(state.id, {
          startDate: new Date(startDay * DAY_MS).toISOString().slice(0, 10),
          endDate: new Date(endDay * DAY_MS).toISOString().slice(0, 10),
        });
        return;
      }

      // committed：纯函数统一边界（已开始行不截断历史/右端不改开始日）
      if (!state.origStart || !state.origEnd || !onCommittedDragPreview) return;
      const next = computeCommittedDragDates({
        origStart: new Date(state.origStart * DAY_MS).toISOString().slice(0, 10),
        origEnd: new Date(state.origEnd * DAY_MS).toISOString().slice(0, 10),
        mode: state.mode,
        deltaDays,
        asOf: timeline.asOf,
      });
      const preview = { assignmentId: state.id, ...next };
      state.lastPreview = preview;
      setLocalDragPreview(preview);
      // toDayNumber 已是"天"，不能再除 DAY_MS（否则恒为 1 天）
      const durationDays = toDayNumber(preview.endDate) - toDayNumber(preview.startDate) + 1;
      // 提示里的位移必须是"应用后"的位移，不是鼠标原始位移（钳制时两者不同）
      const appliedDelta =
        state.mode === 'end'
          ? toDayNumber(preview.endDate) - state.origEnd
          : toDayNumber(preview.startDate) - state.origStart;
      setDragTip({
        x: lastPointer.current.x,
        y: lastPointer.current.y,
        preview,
        mode: state.mode,
        deltaDays,
        appliedDelta,
        clamped: appliedDelta !== deltaDays,
        durationDays,
      });
      notifyCommittedPreview(preview);
    },
    [drafts, onGhostDatesChange, onCommittedDragPreview, timeline.asOf]
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      const deltaDays = Math.round(((event.clientX - state.pointerStartX) / state.trackWidth) * totalDays);
      if (state.kind === 'committed' && !state.started) {
        // 阈值：<3px 视为点击，不进入拖动
        if (Math.abs(event.clientX - state.pointerStartX) < 3) return;
        state.started = true;
      }
      if (state.lastDelta === deltaDays && state.kind === 'committed') return;
      state.lastDelta = deltaDays;
      applyDrag(state, deltaDays);
    };
    const onPointerUp = () => {
      const state = dragRef.current;
      dragRef.current = null;
      if (!state) return;
      if (state.kind === 'committed' && state.started && state.lastPreview) {
        // 吞掉随后 click；日期无变化则只清理预览（页面负责）
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        onCommittedDragEnd?.(state.lastPreview);
      }
      clearDragFeedback();
    };
    // pointercancel / 窗口失焦 / Esc：取消拖动并回到原位（不打开面板）
    const cancelDrag = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      clearDragFeedback();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current?.started) {
        event.preventDefault();
        cancelDrag();
      }
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('blur', cancelDrag);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [applyDrag, totalDays, onCommittedDragEnd, clearDragFeedback]);

  const beginPointerDrag = (event: ReactPointerEvent, bar: BarModel, mode: DragMode) => {
    const isGhost = bar.kind === 'ghost' && dragGhostEditable(bar.ghost);
    const isCommitted = bar.kind === 'committed' && dragCommittedEditable(bar);
    if (!isGhost && !isCommitted) return;
    event.preventDefault();
    event.stopPropagation();
    const track = (event.currentTarget as HTMLElement).closest('.pw-gantt-lane-track') as HTMLElement | null;
    if (!track) return;
    if (isCommitted) {
      bodyCursorRef.current = {
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect,
      };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }
    // 多次拖动：基准取"当前显示值"（本地/页面预览），不是服务端原始行。
    // 否则第二次拖动会把 bar 拉回原始日期再叠加位移，造成跳变与光标偏移。
    const displayed = effectiveDates(bar);
    dragRef.current = {
      kind: isGhost ? 'draft' : 'committed',
      id: isGhost ? bar.draftId! : bar.assignmentId!,
      mode,
      pointerStartX: event.clientX,
      trackWidth: track.getBoundingClientRect().width || 1,
      origStart: displayed.startDate ? toDayNumber(displayed.startDate) : null,
      origEnd: displayed.endDate ? toDayNumber(displayed.endDate) : null,
      // 桌面点击（无位移）不进入拖动；ghost 保持即时（草稿可回退）
      started: isGhost,
    };
  };

  const onGhostKeyDown = (event: ReactKeyboardEvent, bar: BarModel) => {
    if (!dragGhostEditable(bar.ghost) || !bar.draftId || !onGhostDatesChange) return;
    const draft = bar.ghost!;
    const start = toDayNumber(draft.startDate!);
    const end = toDayNumber(draft.endDate!);
    const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
    const step = event.shiftKey ? 7 : 1;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onGhostDatesChange(bar.draftId, { startDate: iso(start - step), endDate: iso(end - step) });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onGhostDatesChange(bar.draftId, { startDate: iso(start + step), endDate: iso(end + step) });
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onGhostDatesChange(bar.draftId, { startDate: iso(start), endDate: iso(end + 1) });
    } else if (event.key === '-') {
      event.preventDefault();
      if (end - start >= 1) onGhostDatesChange(bar.draftId, { startDate: iso(start), endDate: iso(end - 1) });
    }
  };

  const lanes = useMemo<LaneModel[]>(() => {
    const byProject = new Map<string, LaneModel>();
    const laneFor = (projectId: string, projectName: string): LaneModel => {
      let lane = byProject.get(projectId);
      if (!lane) {
        lane = { projectId, projectName, bars: [], hasGhost: false };
        byProject.set(projectId, lane);
      }
      return lane;
    };

    for (const row of committedRows) {
      const lane = laneFor(String(row.project_id), String(row.project_name ?? row.project_id));
      const mode = (row.assignment_date_mode as string | null) ?? 'fixed';
      const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
      const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
      const allocation = Math.round(Number(row.allocation_percentage ?? 0));
      lane.bars.push({
        key: String(row.id),
        kind: 'committed',
        label: `${row.project_name ?? ''} · ${row.role_name ?? ''} · ${allocation}%`,
        textMain: `${row.project_name ?? ''} · ${row.role_name ?? ''}`,
        textTail: `${allocation}%`,
        startDate: start,
        endDate: end,
        status: row.status ?? null,
        mode,
        assignmentId: String(row.id),
      });
    }

    for (const draft of drafts) {
      if (draft.submitState === 'SUCCEEDED' || draft.submitState === 'UNKNOWN') continue;
      const lane = laneFor(String(draft.projectId), String(draft.projectName));
      lane.hasGhost = true;
      const allocation = Math.round(draft.allocationPercentage);
      lane.bars.push({
        key: draft.draftId,
        kind: 'ghost',
        label: `${draft.projectName} · ${draft.roleName ?? ''} · ${allocation}% (${t('assignments:workbench.gantt.ghost')})`,
        /* 草稿标记留主文本侧(窄条时随 ellipsis 让位);尾缀只放 % 保右缘锚定 */
        textMain: `${draft.projectName} · ${draft.roleName ?? ''} (${t('assignments:workbench.gantt.ghost')})`,
        textTail: `${allocation}%`,
        startDate: draft.startDate,
        endDate: draft.endDate,
        status: draft.submitState === 'SUBMITTING' ? 'submitting' : null,
        mode: draft.assignmentDateMode,
        ghost: draft,
        draftId: draft.draftId,
      });
    }

    // ghost 行放同项目 committed 之上（未提交的待确认视觉优先）
    const ordered = [...byProject.values()].sort((a, b) => {
      if (a.hasGhost !== b.hasGhost) return a.hasGhost ? -1 : 1;
      return a.projectName.localeCompare(b.projectName);
    });
    for (const lane of ordered) {
      lane.bars.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'ghost' ? -1 : 1;
        const aStart = a.startDate ? toDayNumber(a.startDate) : Number.POSITIVE_INFINITY;
        const bStart = b.startDate ? toDayNumber(b.startDate) : Number.POSITIVE_INFINITY;
        return aStart - bStart;
      });
    }
    return ordered;
  }, [committedRows, drafts, t]);

  // 已提交行相对窗口分两类：完全在外（无交集）与部分裁切（有交集但越界）。
  // 页脚文案必须与渲染谓词同源，避免“bar 可见却显示在窗口外”。
  const outsideWindowCommitted = onLocateCommitted
    ? committedRows.filter((row) => {
        const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
        const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
        const startDay = start ? toDayNumber(start) : Number.NEGATIVE_INFINITY;
        const endDay = end ? toDayNumber(end) : Number.POSITIVE_INFINITY;
        return endDay < rangeStartDay || startDay > rangeEndDay;
      })
    : [];
  const outsideWindowIds = new Set(outsideWindowCommitted.map((row) => String(row.id)));
  const clippedCommitted = onLocateCommitted
    ? committedRows.filter((row) => {
        if (outsideWindowIds.has(String(row.id))) return false;
        const start = workloadDateOnly(row.computed_start_date ?? row.start_date);
        const end = workloadDateOnly(row.computed_end_date ?? row.end_date);
        const startsBefore = start ? toDayNumber(start) < rangeStartDay : false;
        const endsAfter = end ? toDayNumber(end) > rangeEndDay : false;
        return startsBefore || endsAfter;
      })
    : [];
  const outOfRangeGhosts = drafts.filter((draft) => {
    if (draft.submitState === 'SUCCEEDED' || draft.submitState === 'UNKNOWN') return false;
    if (!draft.startDate && !draft.endDate) return false;
    const start = draft.startDate ? toDayNumber(draft.startDate) : Number.NEGATIVE_INFINITY;
    const end = draft.endDate ? toDayNumber(draft.endDate) : Number.POSITIVE_INFINITY;
    return end < rangeStartDay || start > rangeEndDay;
  });

  const asOfOffset = ((toDayNumber(timeline.asOf) - rangeStartDay) / totalDays) * 100;
  // 闭区间判断：end=asOf 前一天时 offset 恰为 100%，百分比判断会误画边缘线
  const asOfInRange =
    timeline.rangeStart <= timeline.asOf && timeline.asOf <= timeline.rangeEnd;
  const rangeAriaLabel = [
    t('assignments:workbench.gantt.range.open'),
    `${timeline.rangeStart} ~ ${timeline.rangeEnd}`,
    rangeIsCustom ? t('assignments:workbench.gantt.range.customBadge') : null,
    asOfInRange
      ? null
      : t('assignments:workbench.gantt.range.asOfOutside', { date: timeline.asOf }),
  ]
    .filter(Boolean)
    .join(' · ');

  /** 拖动中/确认面板未保存期：已提交 bar 以临时预览日期定位（不写库）。 */
  const effectiveDates = (bar: BarModel): { startDate: string | null; endDate: string | null } => {
    const local = localDragPreview;
    if (bar.kind === 'committed' && local && local.assignmentId === bar.assignmentId) {
      return { startDate: local.startDate, endDate: local.endDate };
    }
    if (
      bar.kind === 'committed' &&
      committedPreview &&
      committedPreview.assignmentId === bar.assignmentId
    ) {
      return { startDate: committedPreview.startDate, endDate: committedPreview.endDate };
    }
    return { startDate: bar.startDate, endDate: bar.endDate };
  };

  const styleForWindow = (startDate: string | null, endDate: string | null): CSSProperties => {
    if (!startDate && !endDate) {
      return { left: '0%', width: '100%' };
    }
    const start = startDate ? toDayNumber(startDate) : rangeStartDay;
    const end = endDate ? toDayNumber(endDate) : rangeEndDay;
    const clampedStart = Math.max(start, rangeStartDay);
    const clampedEnd = Math.min(end, rangeEndDay);
    if (clampedEnd < rangeStartDay || clampedStart > rangeEndDay) {
      return { display: 'none' };
    }
    const left = ((clampedStart - rangeStartDay) / totalDays) * 100;
    const width = ((clampedEnd - clampedStart + 1) / totalDays) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.8)}%` };
  };

  const barStyle = (bar: BarModel): CSSProperties => {
    const dates = effectiveDates(bar);
    return styleForWindow(dates.startDate, dates.endDate);
  };

  /** 是否与当前窗口有交集（决定 lane 内是否有可见 bar / 图例项是否出现）。 */
  const barIntersectsWindow = (bar: BarModel): boolean => {
    const dates = effectiveDates(bar);
    if (!dates.startDate && !dates.endDate) return true;
    const start = dates.startDate ? toDayNumber(dates.startDate) : rangeStartDay;
    const end = dates.endDate ? toDayNumber(dates.endDate) : rangeEndDay;
    return !(end < rangeStartDay || start > rangeEndDay);
  };

  const visibleLaneBars = lanes.flatMap((lane) => lane.bars).filter(barIntersectsWindow);

  /** 与 barStyle 同口径的宽度百分比（用于判断能否容纳两端 24px 手柄）。 */
  const MIN_RESIZE_BAR_PX = 72;
  const barWidthPercent = (bar: BarModel): number => {
    const dates = effectiveDates(bar);
    if (!dates.startDate && !dates.endDate) return 100;
    const start = dates.startDate ? toDayNumber(dates.startDate) : rangeStartDay;
    const end = dates.endDate ? toDayNumber(dates.endDate) : rangeEndDay;
    const clampedStart = Math.max(start, rangeStartDay);
    const clampedEnd = Math.min(end, rangeEndDay);
    if (clampedEnd < rangeStartDay || clampedStart > rangeEndDay) return 0;
    return ((clampedEnd - clampedStart + 1) / totalDays) * 100;
  };
  /** 手柄可见性：测量前先显示（回调 ref 提交时即测量）；过窄降级仅移动。 */
  const barWideEnoughForHandles = (bar: BarModel): boolean => {
    if (trackWidth <= 0) return true;
    return (barWidthPercent(bar) / 100) * trackWidth >= MIN_RESIZE_BAR_PX;
  };
  /** 长窗口下一日 bar 仍按最小宽度绘制；文字塞不下时不硬裁切（title/aria 保留全文）。 */
  const MIN_BAR_TEXT_PX = 48;
  const barWideEnoughForText = (bar: BarModel): boolean => {
    if (trackWidth <= 0) return true;
    return (barWidthPercent(bar) / 100) * trackWidth >= MIN_BAR_TEXT_PX;
  };

  const barClasses = (bar: BarModel): string => {
    const classes = ['pw-gantt-bar'];
    if (bar.kind === 'ghost') {
      classes.push('pw-gantt-bar--ghost');
      if (bar.ghost?.status === 'CONFLICT') classes.push('pw-gantt-bar--conflict');
      if (bar.ghost?.status === 'INVALID') classes.push('pw-gantt-bar--invalid');
      if (bar.status === 'submitting') classes.push('pw-gantt-bar--submitting');
      if (bar.ghost?.submitState === 'FAILED') classes.push('pw-gantt-bar--failed');
    } else {
      if (bar.mode === 'phase' || bar.mode === 'project') classes.push('pw-gantt-bar--derived');
      if (bar.status === 'paused') classes.push('pw-gantt-bar--paused');
      // 未来/已结束行保留在泳道但淡化（§5.2 bar 层契约）
      if (bar.startDate && bar.startDate > timeline.asOf) classes.push('pw-gantt-bar--future');
      else if (bar.endDate && bar.endDate < timeline.asOf) classes.push('pw-gantt-bar--ended');
    }
    return classes.join(' ');
  };

  return (
    <section
      className="pw-gantt"
      aria-labelledby="pw-gantt-title"
      aria-busy={availabilityStatus === 'loading' || undefined}
      data-testid="pw-gantt"
    >
      <div className="pw-gantt-head">
        <h2 id="pw-gantt-title">{t('assignments:workbench.gantt.title')}</h2>
        {minimapBuckets && minimapBuckets.length > 0 && onNavigateRange ? (
          <div className="pw-minimap" role="group" aria-label={t('assignments:workbench.gantt.minimapLabel')} data-testid="pw-minimap">
            {minimapBuckets.map((bucket) => {
              const inWindow =
                bucket.start <= timeline.rangeEnd && bucket.end >= timeline.rangeStart;
              const relative = bucket.relativeUtilization;
              const height = relative === null ? 4 : Math.max(4, Math.min(relative, 200) / 2);
              return (
                <button
                  key={bucket.key}
                  type="button"
                  className={`pw-minimap-month${inWindow ? ' pw-minimap-month--active' : ''}${bucket.overloaded ? ' pw-minimap-month--over' : ''}`}
                  onClick={() => onNavigateRange(bucket.start)}
                  title={`${bucket.key}${relative !== null ? ` · ${Math.round(relative)}%` : ''}`}
                  aria-label={`${bucket.key}${relative !== null ? ` ${Math.round(relative)}%` : ''}`}
                >
                  <span className="pw-minimap-bar" style={{ height: `${height}%` }} aria-hidden="true" />
                  <span className="pw-minimap-label" aria-hidden="true">
                      {minimapBuckets.length > 12 ? bucket.key.slice(2, 7) : bucket.key.slice(5)}
                    </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {onApplyRange && onResetRange ? (
          <button
            ref={rangeToggleRef}
            type="button"
            className="pw-gantt-range pw-gantt-range-trigger"
            onClick={() => setRangePanelOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && rangePanelOpen) {
                event.preventDefault();
                closeRangePanel();
              }
            }}
            aria-expanded={rangePanelOpen}
            aria-controls="pw-gantt-range-panel"
            aria-label={rangeAriaLabel}
            title={t('assignments:workbench.gantt.range.open')}
            data-testid="pw-gantt-range-toggle"
          >
            <Calendar size={13} aria-hidden="true" />
            <span>{timeline.rangeStart} ~ {timeline.rangeEnd}</span>
            {rangeIsCustom ? (
              <span className="pw-gantt-range-mode">
                {t('assignments:workbench.gantt.range.customBadge')}
              </span>
            ) : null}
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={`pw-gantt-range-chevron${rangePanelOpen ? ' is-open' : ''}`}
            />
          </button>
        ) : (
          <span className="pw-gantt-range">
            {timeline.rangeStart} ~ {timeline.rangeEnd}
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('assignments:workbench.gantt.expand') : t('assignments:workbench.gantt.collapse')}
          data-testid="pw-gantt-toggle"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {rangePanelOpen && onApplyRange && onResetRange ? (
        <div
          ref={rangePopoverRef}
          className="pw-range-popover"
          style={rangePopoverStyle}
          data-testid="pw-range-popover"
        >
          <WorkloadRangePanel
            id="pw-gantt-range-panel"
            rangeStart={timeline.rangeStart}
            rangeEnd={timeline.rangeEnd}
            asOf={timeline.asOf}
            isCustom={rangeIsCustom}
            onApply={onApplyRange}
            onReset={onResetRange}
            onClose={closeRangePanel}
          />
        </div>
      ) : null}

      {availabilityStatus === 'loading' ? (
        <p className="pw-gantt-availability-status" role="status" data-testid="pw-gantt-availability-loading">
          {t('assignments:workbench.gantt.range.availabilityLoading')}
        </p>
      ) : null}
      {availabilityStatus === 'error' ? (
        <div className="pw-gantt-availability-error" role="alert" data-testid="pw-gantt-availability-error">
          <span>{t('assignments:workbench.gantt.range.availabilityError')}</span>
          {onRetryAvailability ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryAvailability}>
              {t('common:retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {collapsed ? (
        <CapacityHeatStrip buckets={timeline.buckets} compact data-testid="pw-gantt-heat-compact" />
      ) : (
        <>
          <div className="pw-gantt-heat" data-testid="pw-gantt-heat">
            <div className="pw-gantt-heat-scale" aria-hidden="true">
              <span>200%</span>
              <span className="pw-gantt-heat-100">100%</span>
              <span>0</span>
            </div>
            <CapacityHeatStrip buckets={timeline.buckets} data-testid="pw-gantt-heat-full" />
          </div>

          <div className="pw-gantt-legend">
            <span className="pw-legend pw-legend--fixed">{t('assignments:workbench.gantt.fixed')}</span>
            {asOfOffset > 0 ? (
              <span className="pw-legend pw-legend--history">{t('assignments:workbench.gantt.history')}</span>
            ) : null}
            {visibleLaneBars.some((bar) => bar.kind === 'committed' && (bar.mode === 'phase' || bar.mode === 'project')) ? (
              <span className="pw-legend pw-legend--derived">
                <Lock size={11} aria-hidden="true" /> {t('assignments:workbench.gantt.derived')}
              </span>
            ) : null}
            {visibleLaneBars.some((bar) => bar.kind === 'committed' && bar.status === 'paused') ? (
              <span className="pw-legend pw-legend--paused">{t('assignments:workbench.gantt.paused')}</span>
            ) : null}
            {visibleLaneBars.some((bar) => bar.kind === 'ghost') ? (
              <span className="pw-legend pw-legend--ghost">{t('assignments:workbench.gantt.ghost')}</span>
            ) : null}
            {visibleLaneBars.some((bar) => bar.kind === 'committed' && bar.startDate && bar.startDate > timeline.asOf) ? (
              <span className="pw-legend pw-legend--future">{t('assignments:workbench.gantt.future')}</span>
            ) : null}
            {visibleLaneBars.some((bar) => bar.kind === 'committed' && bar.endDate && bar.endDate < timeline.asOf) ? (
              <span className="pw-legend pw-legend--ended">{t('assignments:workbench.gantt.ended')}</span>
            ) : null}
          </div>
          <p className="sr-only" id="pw-gantt-drag-help">
            {t('assignments:workbench.gantt.dragHelp')}
          </p>
          <p className="sr-only" id="pw-gantt-drag-help-committed">
            {t('assignments:workbench.gantt.dragHelpCommitted')}
          </p>

          <div className="pw-gantt-body">
            {lanes.length === 0 ? (
              <div className="pw-gantt-empty">{t('assignments:workbench.gantt.empty')}</div>
            ) : (
              lanes.map((lane, laneIndex) => (
                <div className="pw-gantt-lane" key={lane.projectId} data-lane-project={lane.projectId}>
                  <div className="pw-gantt-lane-label" title={lane.projectName}>
                    {onProjectLaneClick ? (
                      <button
                        type="button"
                        className="pw-gantt-lane-link"
                        onClick={() => onProjectLaneClick(lane.projectId, lane.projectName)}
                        aria-label={t('assignments:workbench.gantt.projectLane', { name: lane.projectName })}
                      >
                        {lane.projectName}
                      </button>
                    ) : (
                      lane.projectName
                    )}
                  </div>
                  <div
                    className="pw-gantt-lane-track"
                    ref={laneIndex === 0 ? measureTrackRef : undefined}
                    style={{ minHeight: `${Math.max(lane.bars.length * 26 + 2, 30)}px` }}
                  >
                    {(() => {
                      const hidden = lane.bars.filter((bar) => !barIntersectsWindow(bar)).length;
                      if (hidden === 0 || hidden < lane.bars.length) return null;
                      return (
                        <span className="pw-gantt-lane-outside" data-testid="pw-gantt-lane-outside">
                          {t('assignments:workbench.gantt.laneOutside', { count: hidden })}
                        </span>
                      );
                    })()}
                    {asOfOffset > 0 ? (
                      <span
                        className="pw-gantt-history"
                        style={{ width: `${Math.min(asOfOffset, 100)}%` }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {asOfInRange ? (
                      <span className="pw-gantt-asof" style={{ left: `${asOfOffset}%` }} aria-hidden="true" />
                    ) : null}
                    {lane.bars.map((bar, barIndex) => {
                      const originalOutline =
                        bar.kind === 'committed' &&
                        localDragPreview?.assignmentId === bar.assignmentId
                          ? styleForWindow(bar.startDate, bar.endDate)
                          : null;
                      const ghostDraggable = bar.kind === 'ghost' && dragGhostEditable(bar.ghost);
                      const committedDraggable = bar.kind === 'committed' && dragCommittedEditable(bar);
                      const draggable = ghostDraggable || committedDraggable;
                      const showResizeHandles =
                        (ghostDraggable || committedDraggable) && barWideEnoughForHandles(bar);
                      const dragging =
                        localDragPreview?.assignmentId === bar.assignmentId ||
                        (committedPreview !== undefined &&
                          committedPreview !== null &&
                          committedPreview.assignmentId === bar.assignmentId);
                      return (
                      <Fragment key={bar.key}>
                      {originalOutline ? (
                        <span
                          className="pw-gantt-orig-window"
                          style={{ ...originalOutline, top: `${barIndex * 26}px` }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <button
                        type="button"
                        className={barClasses(bar) + (dragging ? ' pw-gantt-bar--dragging' : '')}
                        style={{ ...barStyle(bar), top: `${barIndex * 26}px` }}
                        title={
                          draggable
                            ? `${bar.label} · ${
                                ghostDraggable
                                  ? t('assignments:workbench.gantt.dragHint')
                                  : t('assignments:workbench.gantt.dragHintCommitted')
                              }`
                            : bar.label
                        }
                        data-testid={bar.kind === 'ghost' ? 'pw-ghost-bar' : 'pw-gantt-bar'}
                        data-draft-id={bar.draftId}
                        data-assignment-id={bar.assignmentId}
                        onClick={() => {
                          if (suppressClickRef.current) return;
                          if (bar.kind === 'ghost' && bar.draftId) onGhostClick(bar.draftId);
                          else if (bar.assignmentId) onBarClick(bar.assignmentId);
                        }}
                        onKeyDown={(event) => {
                          if (ghostDraggable) onGhostKeyDown(event, bar);
                        }}
                        onPointerDown={(event) => {
                          if (draggable) beginPointerDrag(event, bar, 'move');
                        }}
                        aria-label={bar.label}
                        aria-describedby={
                          draggable
                            ? ghostDraggable
                              ? 'pw-gantt-drag-help'
                              : 'pw-gantt-drag-help-committed'
                            : undefined
                        }
                      >
                        {showResizeHandles ? (
                          <span
                            className="pw-gantt-resize pw-gantt-resize--start"
                            role="presentation"
                            onPointerDown={(event) => beginPointerDrag(event, bar, 'start')}
                          />
                        ) : null}
                        {(bar.mode === 'phase' || bar.mode === 'project') && bar.kind === 'committed' ? (
                          <Lock size={10} className="pw-gantt-lock" aria-hidden="true" />
                        ) : null}
                        {barWideEnoughForText(bar) ? (
                          <span className="pw-gantt-bar-text">
                            <span className="pw-gantt-bar-name">{bar.textMain}</span>
                            <span className="pw-gantt-bar-pct">{bar.textTail}</span>
                          </span>
                        ) : null}
                        {showResizeHandles ? (
                          <span
                            className="pw-gantt-resize pw-gantt-resize--end"
                            role="presentation"
                            onPointerDown={(event) => beginPointerDrag(event, bar, 'end')}
                          />
                        ) : null}
                      </button>
                      </Fragment>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {outsideWindowCommitted.length > 0 ? (
            <div className="pw-gantt-oor" data-testid="pw-gantt-oor-committed">
              <span>
                {t('assignments:workbench.outOfRangeCommitted', {
                  count: outsideWindowCommitted.length,
                })}
              </span>
              {outsideWindowCommitted.map((row) => (
                <button
                  key={String(row.id)}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onLocateCommitted?.(String(row.id))}
                  data-testid={`pw-locate-committed-${row.id}`}
                >
                  <Crosshair size={12} aria-hidden="true" />{' '}
                  {row.project_name ?? String(row.project_id)}
                  {row.role_name ? ` · ${row.role_name}` : ''}
                </button>
              ))}
            </div>
          ) : null}

          {clippedCommitted.length > 0 ? (
            <div className="pw-gantt-oor" data-testid="pw-gantt-oor-committed-clipped">
              <span>
                {t('assignments:workbench.outOfRangeCommittedClipped', {
                  count: clippedCommitted.length,
                })}
              </span>
              {clippedCommitted.map((row) => (
                <button
                  key={String(row.id)}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onLocateCommitted?.(String(row.id))}
                  data-testid={`pw-locate-committed-${row.id}`}
                >
                  <Crosshair size={12} aria-hidden="true" />{' '}
                  {row.project_name ?? String(row.project_id)}
                  {row.role_name ? ` · ${row.role_name}` : ''}
                </button>
              ))}
            </div>
          ) : null}

          {outOfRangeGhosts.length > 0 ? (
            <div className="pw-gantt-oor">
              <span>{t('assignments:workbench.gantt.outOfRange', { count: outOfRangeGhosts.length })}</span>
              {outOfRangeGhosts.map((draft) => (
                <button
                  key={draft.draftId}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => (onLocateGhost ? onLocateGhost(draft.draftId) : onGhostClick(draft.draftId))}
                >
                  <Crosshair size={12} aria-hidden="true" /> {draft.projectName}
                </button>
              ))}
            </div>
          ) : null}

          <ul className="sr-only">
            {lanes.flatMap((lane) =>
              lane.bars
                .filter((bar) => styleForWindow(bar.startDate, bar.endDate).display !== 'none')
                .map((bar) => {
                // N-01：读屏 bar 清单带状态词——paused/派生/未定日期不能只靠颜色
                const stateWord =
                  bar.kind === 'ghost'
                    ? t('assignments:workbench.gantt.ghost')
                    : bar.status === 'paused'
                      ? t('assignments:workbench.gantt.paused')
                      : bar.mode === 'phase' || bar.mode === 'project'
                        ? t('assignments:workbench.gantt.derived')
                        : bar.startDate && bar.startDate > timeline.asOf
                          ? t('assignments:workbench.gantt.future')
                          : bar.endDate && bar.endDate < timeline.asOf
                            ? t('assignments:workbench.gantt.ended')
                            : '';
                return (
                  <li key={`${lane.projectId}-${bar.key}`}>{`${bar.label}${stateWord ? ` · ${stateWord}` : ''} ${bar.startDate ?? t('assignments:workbench.gantt.undated')} → ${bar.endDate ?? t('assignments:workbench.gantt.undated')}`}</li>
                );
              })
            )}
          </ul>
        </>
      )}

      {dragTip ? (
        <div
          className="pw-gantt-drag-tip"
          aria-hidden="true"
          data-testid="pw-gantt-drag-tip"
          style={{
            left: Math.min(
              Math.max(dragTip.x + 14, 8),
              (typeof window !== 'undefined' ? window.innerWidth : 1280) - 260
            ),
            top: dragTip.y + 16,
          }}
        >
          {t(
            dragTip.mode === 'move'
              ? 'assignments:workbench.gantt.dragTipMove'
              : 'assignments:workbench.gantt.dragTipWindow',
            {
              start: dragTip.preview.startDate,
              end: dragTip.preview.endDate,
              days: dragTip.durationDays,
              delta: `${dragTip.appliedDelta > 0 ? '+' : ''}${dragTip.appliedDelta}`,
            }
          )}
          {dragTip.clamped ? t('assignments:workbench.gantt.dragTipClamped') : ''}
        </div>
      ) : null}
    </section>
  );
}
