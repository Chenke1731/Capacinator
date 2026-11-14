/**
 * 工作台 v2 共享容量口径（设计 §9）——泳道热区 / 弹窗迷你热区 / 影响预览
 * 三处展示的唯一计算源，禁止各自实现。
 *
 * 计算契约（§9.2，评审锁死，改动需回设计文档）：
 * 1. 先按日边界分段：分段端点 = 分配起止日、override 起止日、时间轴边界；
 *    区间闭区间，`start <= segEnd && end >= segStart` 视为相交。
 * 2. 每段基准负荷 = committed active 之和；paused 不计；undated active 视为
 *    覆盖全时间轴；未来/已结束行保留在泳道但不进入 currentLoad 汇总。
 * 3. EDIT/REPLACE 覆盖原行（按 targetAssignmentId 扣除原 committed 行再加
 *    proposed），绝不"原行 + 新行"双算。
 * 4. 每行只计一次：submitState=SUCCEEDED 的草稿已并入 committed 读侧，跳过；
 *    UNKNOWN 锁定后不计入可编辑投影，等待按原场景回读去重。
 * 5. 桶聚合：日桶 = 该日相对利用率；周/月桶 = 桶内各日分段的最大值（peak），
 *    不是求和——相邻但不重叠的分配不得被加成同时超载。
 * 6. 纵轴统一相对利用率 load / approvedAvailability * 100；可用率缺失(null)
 *    为"数据不可用"、0 为"无可用容量"，两者相对利用率均为 null（UI 显示—）。
 * 7. override 只取 is_approved=1（本函数强制过滤，调用方传错也被拦下）；
 *    同日多条 approved override 并存时取 start_date 最新一条（确定性）。
 */
import { workloadDateOnly } from './personWorkload';

export interface TimelineRowInput {
  id: string;
  allocationPercentage: number;
  startDate?: string | number | null;
  endDate?: string | number | null;
  status?: string | null;
}

export type CommittedTimelineRow = TimelineRowInput;

export type DraftKind = 'CREATE' | 'EDIT' | 'REPLACE';
export type DraftSubmitState = 'IDLE' | 'SUBMITTING' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED';

export interface DraftTimelineRow extends TimelineRowInput {
  draftId: string;
  kind: DraftKind;
  targetAssignmentId?: string | null;
  submitState?: DraftSubmitState;
}

export interface AvailabilityOverrideInput {
  start: string;
  end: string;
  percentage: number;
  isApproved: boolean;
}

export interface TimelineContributor {
  id: string;
  allocation: number;
}

export interface WorkloadTimelineSegment {
  start: string;
  end: string;
  /** 该段生效的可用率：null=数据不可用；0=无可用容量 */
  availability: number | null;
  /** 该段绝对分配百分点之和（bar 标签/明细口径） */
  load: number;
  /** load / availability * 100；availability null 或 0 时为 null */
  relativeUtilization: number | null;
  contributors: TimelineContributor[];
  overloaded: boolean;
}

export interface WorkloadTimelineBucket {
  /** week: 周一日期；month: YYYY-MM；day: 日期 */
  key: string;
  start: string;
  end: string;
  /** 桶内各日分段绝对负荷的最大值 */
  peakLoad: number;
  /** 桶内各日相对利用率的峰值；全桶不可算为 null */
  relativeUtilization: number | null;
  overloaded: boolean;
}

export interface WorkloadContributionRow {
  id: string;
  origin: 'committed' | 'draft';
  kind?: DraftKind;
  allocationPercentage: number;
  startDate: string | null;
  endDate: string | null;
  status?: string | null;
}

export interface WorkloadTimelineResult {
  rangeStart: string;
  rangeEnd: string;
  asOf: string;
  segments: WorkloadTimelineSegment[];
  buckets: WorkloadTimelineBucket[];
  /** 参考日 committed（未投影草稿）active 负荷 */
  currentLoad: number;
  /** 参考日投影草稿后的负荷 */
  projectedLoad: number;
  currentAvailability: number | null;
  currentRelativeUtilization: number | null;
  projectedRelativeUtilization: number | null;
  overloadSegments: WorkloadTimelineSegment[];
  contributions: WorkloadContributionRow[];
}

export interface WorkloadTimelineOptions {
  asOf: string;
  rangeStart: string;
  rangeEnd: string;
  /** 人员默认可用率；null/undefined=数据不可用，不回退 100 */
  defaultAvailability?: number | null;
  availabilityOverrides?: AvailabilityOverrideInput[];
  granularity?: 'day' | 'week' | 'month';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(iso: string): number {
  return Math.floor(Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10))
  ) / DAY_MS);
}

function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function allocationOfRow(row: TimelineRowInput): number {
  const value = Number(row.allocationPercentage);
  return Number.isFinite(value) ? value : 0;
}

/** active 才计入容量；paused 不计（§9.2.2）。草稿无 paused 态。 */
function countsTowardLoad(row: { status?: string | null }): boolean {
  return row.status !== 'paused';
}

function normalizeRowWindow(row: TimelineRowInput): { start: string | null; end: string | null } {
  return {
    start: workloadDateOnly(row.startDate ?? null),
    end: workloadDateOnly(row.endDate ?? null),
  };
}

function intersects(start: string | null, end: string | null, segStartDay: number, segEndDay: number): boolean {
  // undated = 全时间轴（§9.2.2）；闭区间相交（§9.2.1）
  if (start === null && end === null) return true;
  const startDay = start === null ? Number.NEGATIVE_INFINITY : toDayNumber(start);
  const endDay = end === null ? Number.POSITIVE_INFINITY : toDayNumber(end);
  return startDay <= segEndDay && endDay >= segStartDay;
}

function coversDay(start: string | null, end: string | null, day: number): boolean {
  if (start === null && end === null) return true;
  const startDay = start === null ? Number.NEGATIVE_INFINITY : toDayNumber(start);
  const endDay = end === null ? Number.POSITIVE_INFINITY : toDayNumber(end);
  return startDay <= day && endDay >= day;
}

interface EffectiveOverride {
  start: string;
  end: string;
  percentage: number;
}

/** approved-only 过滤 + 同日多条取 start 最新（确定性，§9.2.7）。 */
function approvedOverrides(overrides: AvailabilityOverrideInput[] | undefined): EffectiveOverride[] {
  if (!overrides) return [];
  return overrides
    .filter((override) => override.isApproved === true)
    .map((override) => ({
      start: workloadDateOnly(override.start),
      end: workloadDateOnly(override.end),
      percentage: Number(override.percentage),
    }))
    .filter((override): override is EffectiveOverride & { start: string; end: string } =>
      Boolean(override.start && override.end && Number.isFinite(override.percentage))
    )
    .sort((a, b) => (a.start === b.start ? (a.end < b.end ? 1 : -1) : (a.start < b.start ? 1 : -1)));
}

function overrideForDay(overrides: EffectiveOverride[], day: number): EffectiveOverride | null {
  // 已按 start 降序排序：第一条覆盖该日的即最新
  for (const override of overrides) {
    if (coversDay(override.start, override.end, day)) return override;
  }
  return null;
}

function relativeUtilization(load: number, availability: number | null): number | null {
  if (availability === null || availability === 0) return null;
  return (load / availability) * 100;
}

/** 周一作为周桶锚点（ISO 周）：epoch day 0 = 周四，周一 = day - ((day + 3) % 7) */
function weekKey(day: number): number {
  const mondayOffset = (((day % 7) + 3) % 7 + 7) % 7;
  return day - mondayOffset;
}

function monthKey(dayNumber: number): string {
  const iso = fromDayNumber(dayNumber);
  return iso.slice(0, 7);
}

/**
 * 三处容量展示共用的唯一纯函数（§9）。
 *
 * @param committedAssignments 当前场景可见的已提交分配完整集合（分页读全）
 * @param draftAssignments    泳道 ghost / 弹窗临时勾选（投影行）
 * @param options.asOf        服务端 utilization 返回的参考日
 */
export function workloadTimeline(
  committedAssignments: CommittedTimelineRow[],
  draftAssignments: DraftTimelineRow[],
  options: WorkloadTimelineOptions
): WorkloadTimelineResult {
  const asOf = workloadDateOnly(options.asOf);
  const rangeStartInput = workloadDateOnly(options.rangeStart);
  const rangeEndInput = workloadDateOnly(options.rangeEnd);
  if (!asOf) throw new Error('workloadTimeline requires a valid asOf date');
  if (!rangeStartInput || !rangeEndInput) throw new Error('workloadTimeline requires a valid time range');
  // F2（DeepSeek P2）：倒置区间按 min/max 归一而不是抛错——实时预览（行编辑
  // 逐键渲染）必然经过"开始日 > 结束日"的中间态，契约函数对任意日期输入
  // 必须 total（原语级修复，N 个调用点自动安全；EXP 候选）。
  const rangeStart = rangeStartInput <= rangeEndInput ? rangeStartInput : rangeEndInput;
  const rangeEnd = rangeStartInput <= rangeEndInput ? rangeEndInput : rangeStartInput;

  const granularity = options.granularity ?? 'week';
  const defaultAvailability =
    options.defaultAvailability === undefined || options.defaultAvailability === null
      ? null
      : Number(options.defaultAvailability);
  const overrides = approvedOverrides(options.availabilityOverrides);
  const rangeStartDay = toDayNumber(rangeStart);
  const rangeEndDay = toDayNumber(rangeEnd);

  // ---- §9.2.3 EDIT/REPLACE 覆盖原行：先扣原行再进投影 ----
  const replacedIds = new Set<string>();
  for (const draft of draftAssignments) {
    if ((draft.kind === 'EDIT' || draft.kind === 'REPLACE') && draft.targetAssignmentId) {
      replacedIds.add(String(draft.targetAssignmentId));
    }
  }
  // ---- §9.2.4 每行只计一次：SUCCEEDED 已并入 committed；UNKNOWN 等回读 ----
  const activeDrafts = draftAssignments.filter(
    (draft) => draft.submitState !== 'SUCCEEDED' && draft.submitState !== 'UNKNOWN'
  );
  const effectiveCommitted = committedAssignments.filter((row) => !replacedIds.has(String(row.id)));

  interface ProjectedRow {
    id: string;
    origin: 'committed' | 'draft';
    kind?: DraftKind;
    allocation: number;
    start: string | null;
    end: string | null;
    status?: string | null;
  }

  const projected: ProjectedRow[] = [
    ...effectiveCommitted.map((row) => ({
      id: String(row.id),
      origin: 'committed' as const,
      allocation: allocationOfRow(row),
      ...normalizeRowWindow(row),
      status: row.status ?? null,
    })),
    ...activeDrafts.map((row) => ({
      id: String(row.draftId),
      origin: 'draft' as const,
      kind: row.kind,
      allocation: allocationOfRow(row),
      ...normalizeRowWindow(row),
      status: null,
    })),
  ];

  // ---- §9.2.1 日边界分段：分配起止日、override 起止日、时间轴边界 ----
  const boundaries = new Set<number>([rangeStartDay, rangeEndDay + 1]);
  const addBoundary = (iso: string | null, offsetDays = 0) => {
    if (!iso) return;
    const day = toDayNumber(iso) + offsetDays;
    if (day > rangeStartDay && day <= rangeEndDay) boundaries.add(day);
  };
  for (const row of projected) {
    addBoundary(row.start);
    addBoundary(row.end, 1); // 闭区间：end 次日才切换
  }
  for (const override of overrides) {
    addBoundary(override.start);
    addBoundary(override.end, 1);
  }
  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  const segments: WorkloadTimelineSegment[] = [];
  for (let i = 0; i < sortedBoundaries.length - 1; i += 1) {
    const segStartDay = sortedBoundaries[i];
    const segEndDay = sortedBoundaries[i + 1] - 1;
    if (segStartDay > rangeEndDay || segEndDay < rangeStartDay) continue;

    const override = overrideForDay(overrides, segStartDay);
    const availability = override ? override.percentage : defaultAvailability;
    const contributors: TimelineContributor[] = [];
    let load = 0;
    for (const row of projected) {
      if (!countsTowardLoad(row)) continue;
      if (!intersects(row.start, row.end, segStartDay, segEndDay)) continue;
      load += row.allocation;
      contributors.push({ id: row.id, allocation: row.allocation });
    }
    const relative = relativeUtilization(load, availability);
    segments.push({
      start: fromDayNumber(segStartDay),
      end: fromDayNumber(segEndDay),
      availability,
      load,
      relativeUtilization: relative,
      contributors,
      overloaded: relative !== null && relative > 100,
    });
  }

  // ---- §9.2.5 桶聚合：日桶=该日相对利用率；周/月桶=桶内各日 peak ----
  const segmentIndexByDay = new Map<number, WorkloadTimelineSegment>();
  for (const segment of segments) {
    const startDay = toDayNumber(segment.start);
    const endDay = toDayNumber(segment.end);
    for (let day = startDay; day <= endDay; day += 1) segmentIndexByDay.set(day, segment);
  }

  const buckets: WorkloadTimelineBucket[] = [];
  let bucketStartDay: number | null = null;
  let bucketKey: string | null = null;
  let bucketPeakLoad = 0;
  let bucketPeakRelative: number | null = null;
  let bucketOverloaded = false;

  const flushBucket = () => {
    if (bucketKey === null || bucketStartDay === null) return;
    buckets.push({
      key: bucketKey,
      start: fromDayNumber(bucketStartDay),
      end: fromDayNumber(currentBucketEndDay),
      peakLoad: bucketPeakLoad,
      relativeUtilization: bucketPeakRelative,
      overloaded: bucketOverloaded,
    });
    bucketKey = null;
    bucketStartDay = null;
    bucketPeakLoad = 0;
    bucketPeakRelative = null;
    bucketOverloaded = false;
  };

  let currentBucketEndDay = rangeStartDay;
  for (let day = rangeStartDay; day <= rangeEndDay; day += 1) {
    const key =
      granularity === 'day'
        ? fromDayNumber(day)
        : granularity === 'month'
          ? monthKey(day)
          : String(weekKey(day));
    if (key !== bucketKey) {
      flushBucket();
      bucketKey = key;
      bucketStartDay = day;
    }
    currentBucketEndDay = day;
    const segment = segmentIndexByDay.get(day);
    if (!segment) continue;
    if (segment.load > bucketPeakLoad) bucketPeakLoad = segment.load;
    if (segment.relativeUtilization !== null) {
      if (bucketPeakRelative === null || segment.relativeUtilization > bucketPeakRelative) {
        bucketPeakRelative = segment.relativeUtilization;
      }
      if (segment.relativeUtilization > 100) bucketOverloaded = true;
    }
  }
  flushBucket();

  // ---- 参考日 point query：current=committed 现状，projected=投影后 ----
  const asOfDay = toDayNumber(asOf);
  const loadAtDay = (rows: Array<{ start: string | null; end: string | null; status?: string | null; allocation: number }>): number => {
    let sum = 0;
    for (const row of rows) {
      if (!countsTowardLoad(row)) continue;
      if (coversDay(row.start, row.end, asOfDay)) sum += row.allocation;
    }
    return sum;
  };
  const committedOnly = projected.filter((row) => row.origin === 'committed');
  const currentLoad = loadAtDay(committedOnly);
  const projectedLoad = loadAtDay(projected);
  const currentAvailability = overrideForDay(overrides, asOfDay)?.percentage ?? defaultAvailability;

  return {
    rangeStart,
    rangeEnd,
    asOf,
    segments,
    buckets,
    currentLoad,
    projectedLoad,
    currentAvailability,
    currentRelativeUtilization: relativeUtilization(currentLoad, currentAvailability),
    projectedRelativeUtilization: relativeUtilization(projectedLoad, currentAvailability),
    overloadSegments: segments.filter((segment) => segment.overloaded),
    contributions: projected.map((row) => ({
      id: row.id,
      origin: row.origin,
      kind: row.kind,
      allocationPercentage: row.allocation,
      startDate: row.start,
      endDate: row.end,
      status: row.status ?? null,
    })),
  };
}
