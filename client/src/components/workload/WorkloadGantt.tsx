/**
 * WorkloadGantt（工作台 v2 §5.2/§8）——工作负载泳道：
 * 容量热区（workloadTimeline buckets，100% 相对线）+ 分配 bar 层。
 *
 * 第一版不做拖拽：点击 ghost → 参数面板；点击已有 bar → 定位明细表行。
 * bar 视觉契约：fixed 实心；phase/project 派生虚线+锁形 aria；paused 灰；
 * future/ended 淡化；ghost 斜纹半透明（§18 视觉验收）。范围外 ghost 给
 * 定位入口（§20.3）。可折叠为紧凑容量条（1366）。
 */
import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Crosshair, Lock } from 'lucide-react';
import { workloadDateOnly, type WorkloadAssignment } from '../../lib/personWorkload';
import type { AssignmentDraft } from '../../lib/assignmentDrafts';
import type { WorkloadTimelineBucket, WorkloadTimelineResult } from '../../lib/workloadTimeline';
import { CapacityHeatStrip } from './CapacityHeatStrip';

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
}

type DragMode = 'move' | 'start' | 'end';

interface DragState {
  draftId: string;
  mode: DragMode;
  pointerStartX: number;
  trackWidth: number;
  origStart: number | null;
  origEnd: number | null;
}

interface BarModel {
  key: string;
  kind: 'committed' | 'ghost';
  label: string;
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
}: WorkloadGanttProps) {
  const { t } = useTranslation(['assignments']);

  const rangeStartDay = toDayNumber(timeline.rangeStart);
  const rangeEndDay = toDayNumber(timeline.rangeEnd);
  const totalDays = Math.max(rangeEndDay - rangeStartDay + 1, 1);

  // ---- Phase 2：fixed ghost 拖动/缩放（指针 + 键盘）----
  const dragRef = useRef<DragState | null>(null);
  const dragGhostEditable = (draft: AssignmentDraft | undefined): boolean =>
    Boolean(
      onGhostDatesChange &&
        draft &&
        draft.assignmentDateMode === 'fixed' &&
        draft.startDate &&
        draft.endDate &&
        (draft.submitState === 'IDLE' || draft.submitState === 'FAILED')
    );

  const applyDrag = useCallback(
    (state: DragState, deltaDays: number) => {
      const next = onGhostDatesChange;
      if (!next || !state.origStart || !state.origEnd) return;
      const draft = drafts.find((entry) => entry.draftId === state.draftId);
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
      next(state.draftId, {
        startDate: new Date(startDay * DAY_MS).toISOString().slice(0, 10),
        endDate: new Date(endDay * DAY_MS).toISOString().slice(0, 10),
      });
    },
    [drafts, onGhostDatesChange]
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const deltaDays = Math.round(((event.clientX - state.pointerStartX) / state.trackWidth) * totalDays);
      applyDrag(state, deltaDays);
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [applyDrag, totalDays]);

  const beginGhostDrag = (event: ReactPointerEvent, bar: BarModel, mode: DragMode) => {
    if (!dragGhostEditable(bar.ghost)) return;
    event.preventDefault();
    event.stopPropagation();
    const track = (event.currentTarget as HTMLElement).closest('.pw-gantt-lane-track') as HTMLElement | null;
    if (!track) return;
    dragRef.current = {
      draftId: bar.draftId!,
      mode,
      pointerStartX: event.clientX,
      trackWidth: track.getBoundingClientRect().width || 1,
      origStart: bar.startDate ? toDayNumber(bar.startDate) : null,
      origEnd: bar.endDate ? toDayNumber(bar.endDate) : null,
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

  const outOfRangeGhosts = drafts.filter((draft) => {
    if (draft.submitState === 'SUCCEEDED' || draft.submitState === 'UNKNOWN') return false;
    if (!draft.startDate && !draft.endDate) return false;
    const start = draft.startDate ? toDayNumber(draft.startDate) : Number.NEGATIVE_INFINITY;
    const end = draft.endDate ? toDayNumber(draft.endDate) : Number.POSITIVE_INFINITY;
    return end < rangeStartDay || start > rangeEndDay;
  });

  const asOfOffset = ((toDayNumber(timeline.asOf) - rangeStartDay) / totalDays) * 100;

  const barStyle = (bar: BarModel): CSSProperties => {
    if (!bar.startDate && !bar.endDate) {
      return { left: '0%', width: '100%' };
    }
    const start = bar.startDate ? toDayNumber(bar.startDate) : rangeStartDay;
    const end = bar.endDate ? toDayNumber(bar.endDate) : rangeEndDay;
    const clampedStart = Math.max(start, rangeStartDay);
    const clampedEnd = Math.min(end, rangeEndDay);
    if (clampedEnd < rangeStartDay || clampedStart > rangeEndDay) {
      return { display: 'none' };
    }
    const left = ((clampedStart - rangeStartDay) / totalDays) * 100;
    const width = ((clampedEnd - clampedStart + 1) / totalDays) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.8)}%` };
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
    <section className="pw-gantt" aria-labelledby="pw-gantt-title" data-testid="pw-gantt">
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
                  <span className="pw-minimap-label" aria-hidden="true">{bucket.key.slice(5)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <span className="pw-gantt-range">
          {timeline.rangeStart.slice(0, 7)} ~ {timeline.rangeEnd.slice(0, 7)}
        </span>
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

          <div className="pw-gantt-legend" aria-hidden="true">
            <span className="pw-legend pw-legend--fixed">{t('assignments:workbench.gantt.fixed')}</span>
            <span className="pw-legend pw-legend--derived">
              <Lock size={11} /> {t('assignments:workbench.gantt.derived')}
            </span>
            <span className="pw-legend pw-legend--paused">{t('assignments:workbench.gantt.paused')}</span>
            <span className="pw-legend pw-legend--ghost">{t('assignments:workbench.gantt.ghost')}</span>
          </div>
          <p className="sr-only" id="pw-gantt-drag-help">
            {t('assignments:workbench.gantt.dragHelp')}
          </p>

          <div className="pw-gantt-body">
            {lanes.length === 0 ? (
              <div className="pw-gantt-empty">{t('assignments:workbench.gantt.empty')}</div>
            ) : (
              lanes.map((lane) => (
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
                    style={{ minHeight: `${Math.max(lane.bars.length * 20 + 2, 30)}px` }}
                  >
                    <span className="pw-gantt-asof" style={{ left: `${Math.min(Math.max(asOfOffset, 0), 100)}%` }} aria-hidden="true" />
                    {lane.bars.map((bar, barIndex) => {
                      const ghostDraggable = bar.kind === 'ghost' && dragGhostEditable(bar.ghost);
                      return (
                      <button
                        key={bar.key}
                        type="button"
                        className={barClasses(bar)}
                        style={{ ...barStyle(bar), top: `${barIndex * 20}px` }}
                        title={
                          ghostDraggable
                            ? `${bar.label} · ${t('assignments:workbench.gantt.dragHint')}`
                            : bar.label
                        }
                        data-testid={bar.kind === 'ghost' ? 'pw-ghost-bar' : 'pw-gantt-bar'}
                        data-draft-id={bar.draftId}
                        data-assignment-id={bar.assignmentId}
                        onClick={() => {
                          if (bar.kind === 'ghost' && bar.draftId) onGhostClick(bar.draftId);
                          else if (bar.assignmentId) onBarClick(bar.assignmentId);
                        }}
                        onKeyDown={(event) => {
                          if (ghostDraggable) onGhostKeyDown(event, bar);
                        }}
                        onPointerDown={(event) => {
                          if (ghostDraggable) beginGhostDrag(event, bar, 'move');
                        }}
                        aria-label={bar.label}
                        aria-describedby={ghostDraggable ? 'pw-gantt-drag-help' : undefined}
                      >
                        {ghostDraggable ? (
                          <span
                            className="pw-gantt-resize pw-gantt-resize--start"
                            role="presentation"
                            onPointerDown={(event) => beginGhostDrag(event, bar, 'start')}
                          />
                        ) : null}
                        {(bar.mode === 'phase' || bar.mode === 'project') && bar.kind === 'committed' ? (
                          <Lock size={10} className="pw-gantt-lock" aria-hidden="true" />
                        ) : null}
                        <span className="pw-gantt-bar-text">{bar.label}</span>
                        {ghostDraggable ? (
                          <span
                            className="pw-gantt-resize pw-gantt-resize--end"
                            role="presentation"
                            onPointerDown={(event) => beginGhostDrag(event, bar, 'end')}
                          />
                        ) : null}
                      </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

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
              lane.bars.map((bar) => (
                <li key={`${lane.projectId}-${bar.key}`}>{`${bar.label} ${bar.startDate ?? '—'} → ${bar.endDate ?? '—'}`}</li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  );
}
