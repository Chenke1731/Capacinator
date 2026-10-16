/**
 * 分段容量判定原语（改进计划 IP-03a / C06–C09）。
 *
 * 窗口按日期边界切分:每段容量 = 默认可用率 × 已批准覆盖(重叠取最小,
 * 公开假设:保守),每段负荷 = 与该段相交的分配之和。冲突按段判定,
 * 峰值 = 段负荷最大值——区间相交不等于整体求和(C07)。
 */
import { workdaysBetween, workMonths } from './workCalendar.js';

export interface CapacitySegment {
  start: string;
  end: string;
  capacityPct: number;
  loadPct: number;
}

export interface WindowCapacityResult {
  segments: CapacitySegment[];
  peakLoadPct: number;
  minCapacityPct: number;
  overloadSegments: CapacitySegment[];
  hasConflict: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(iso: string): Date | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const toTime = (iso: string) => parseDate(iso)?.getTime() ?? null;

export function evaluateWindowCapacity(args: {
  window: { start: string; end: string };
  defaultAvailabilityPct: number;
  overrides: Array<{ start: string; end: string; availability_percentage: number }>;
  allocations: Array<{ start: string | null; end: string | null; allocation: number }>;
}): WindowCapacityResult {
  const wStart = parseDate(args.window.start);
  const wEnd = parseDate(args.window.end);
  if (!wStart || !wEnd || wEnd < wStart) {
    return { segments: [], peakLoadPct: 0, minCapacityPct: 0, overloadSegments: [], hasConflict: false };
  }

  // 窗口内有效的覆盖(裁剪到窗口)
  const overrides = args.overrides
    .map((o) => {
      const s = parseDate(o.start);
      const e = parseDate(o.end);
      if (!s || !e || e < s) return null;
      const cs = s > wStart ? s : wStart;
      const ce = e < wEnd ? e : wEnd;
      if (ce < cs) return null;
      return { start: cs.getTime(), end: ce.getTime(), pct: o.availability_percentage };
    })
    .filter((o): o is { start: number; end: number; pct: number } => o !== null);

  // 窗口内有效的分配(裁剪;null 日期视为全窗口)
  const wStartT = wStart.getTime();
  const wEndT = wEnd.getTime();
  const allocations = args.allocations
    .map((a) => {
      const s = a.start == null ? null : toTime(a.start);
      const e = a.end == null ? null : toTime(a.end);
      const cs = s == null || s < wStartT ? wStartT : s;
      const ce = e == null || e > wEndT ? wEndT : e;
      if (ce < cs) return null;
      return { start: cs, end: ce, allocation: a.allocation };
    })
    .filter((a): a is { start: number; end: number; allocation: number } => a !== null);

  // 边界集:窗口两端 + 覆盖两端 + 分配两端 → 分段(负荷切分依赖分配边界,C07)
  const boundaries = new Set<number>([wStartT, wEndT + DAY_MS]);
  for (const o of overrides) {
    if (o.start > wStartT && o.start <= wEndT) boundaries.add(o.start);
    if (o.end + DAY_MS > wStartT && o.end + DAY_MS <= wEndT) boundaries.add(o.end + DAY_MS);
  }
  for (const a of allocations) {
    if (a.start > wStartT && a.start <= wEndT) boundaries.add(a.start);
    if (a.end + DAY_MS > wStartT && a.end + DAY_MS <= wEndT) boundaries.add(a.end + DAY_MS);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const segments: CapacitySegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEndExclusive = sorted[i + 1];
    if (segEndExclusive <= segStart) continue;
    const segEndInclusive = segEndExclusive - DAY_MS; // 日粒度含端点(日期均为当日零点)

    // 覆盖本段的已批准覆盖(覆盖段起点即覆盖);重叠取最小(保守假设)
    const covering = overrides.filter((o) => o.start <= segStart && o.end >= segEndInclusive);
    const capacityPct = covering.length > 0
      ? Math.min(...covering.map((o) => o.pct))
      : args.defaultAvailabilityPct;

    // 与本段相交的分配求和
    const loadPct = allocations
      .filter((a) => a.start <= segEndInclusive && a.end >= segStart)
      .reduce((sum, a) => sum + a.allocation, 0);

    segments.push({
      start: toISODate(new Date(segStart)),
      end: toISODate(new Date(segEndExclusive - DAY_MS)),
      capacityPct,
      loadPct
    });
  }

  const overloadSegments = segments.filter((s) => s.loadPct > s.capacityPct);
  return {
    segments,
    peakLoadPct: segments.reduce((m, s) => Math.max(m, s.loadPct), 0),
    minCapacityPct: segments.reduce((m, s) => Math.min(m, s.capacityPct), args.defaultAvailabilityPct),
    overloadSegments,
    hasConflict: overloadSegments.length > 0
  };
}

/**
 * 分段有效产能(人月):Σ 段容量% × 段工作月(工作日/21.75)。
 * C06:整窗覆盖 0 → 0;部分休假按段扣除。
 */
export function segmentedWorkMonths(
  window: { start: string; end: string },
  defaultAvailabilityPct: number,
  overrides: Array<{ start: string; end: string; availability_percentage: number }>
): number {
  const r = evaluateWindowCapacity({ window, defaultAvailabilityPct, overrides, allocations: [] });
  return r.segments.reduce(
    (sum, s) => sum + (s.capacityPct / 100) * workMonths(workdaysBetween(s.start, s.end)),
    0
  );
}

/**
 * 分段有效工时：Σ 段容量% × 段工作日 × 每工作日小时。
 * 与 segmentedWorkMonths 同构（报表侧小时口径，2026-10-16 缺口①）——
 * 容量时间线不再自己发明"每月 22 天"。
 */
export function segmentedWorkHours(
  window: { start: string; end: string },
  defaultAvailabilityPct: number,
  overrides: Array<{ start: string; end: string; availability_percentage: number }>,
  hoursPerWorkday: number
): number {
  const r = evaluateWindowCapacity({ window, defaultAvailabilityPct, overrides, allocations: [] });
  return r.segments.reduce(
    (sum, s) => sum + (s.capacityPct / 100) * workdaysBetween(s.start, s.end) * hoursPerWorkday,
    0
  );
}
