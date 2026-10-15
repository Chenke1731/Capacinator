/**
 * 统一工作日历原语（改进计划 IP-02a / C01–C04）。
 *
 * 已裁决口径的唯一实现,四个历史复制品(IterationStats / IterationsController
 * 私有 / DemandCalculationService / EstimationService.windowMonths)全部收敛到此处:
 * - 区间含两端,周末剔除;同一工作日 = 1 天;纯周末/无效区间 = 0 天
 *   (除零保护在消费方,不在这里制造工作日)
 * - 工作月 = 工作日 / 21.75;中间精度保留,展示才经 displayWorkMonths 舍入
 * - 先与查询窗口求交,再算工时;月桶按各月真实工作日分摊,总和守恒
 */

export const WORKDAYS_PER_MONTH = 21.75;
export const HOURS_PER_WORKDAY = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(iso: string): Date | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? null : d;
}

/** 区间工作日数(含两端,周末剔除);同日=1,纯周末/无效=0 */
export function workdaysBetween(startISO: string, endISO: string): number {
  const a = parseDate(startISO);
  const b = parseDate(endISO);
  if (!a || !b || b < a) return 0;
  let days = 0;
  for (let t = new Date(a); t <= b; t = new Date(t.getTime() + DAY_MS)) {
    const dow = t.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** 工作月 = 工作日/21.75,不舍入(中间精度) */
export function workMonths(workdays: number): number {
  return workdays / WORKDAYS_PER_MONTH;
}

/** 展示用工作月(2 位小数)——只在显示边界调用 */
export function displayWorkMonths(workdays: number): number {
  return Math.round(workMonths(workdays) * 100) / 100;
}

/** 两区间交集;无重叠返回 null;查询窗口缺省侧视为不裁剪 */
export function intersectDateRange(
  rangeStart: string, rangeEnd: string,
  windowStart?: string, windowEnd?: string
): { start: string; end: string } | null {
  const rs = parseDate(rangeStart);
  const re = parseDate(rangeEnd);
  if (!rs || !re || re < rs) return null;
  const ws = windowStart !== undefined ? parseDate(windowStart) : null;
  const we = windowEnd !== undefined ? parseDate(windowEnd) : null;
  const start = ws && ws > rs ? ws : rs;
  const end = we && we < re ? we : re;
  if (end < start) return null;
  return { start: toISODate(start), end: toISODate(end) };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface MonthBucket {
  month: string; // 'YYYY-MM'
  workdays: number;
}

/** 按月真实工作日分桶;各桶之和 = 区间工作日数(守恒) */
export function monthBuckets(startISO: string, endISO: string): MonthBucket[] {
  const a = parseDate(startISO);
  const b = parseDate(endISO);
  if (!a || !b || b < a) return [];
  const buckets: MonthBucket[] = [];
  for (let t = new Date(a); t <= b; t = new Date(t.getTime() + DAY_MS)) {
    const dow = t.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const last = buckets[buckets.length - 1];
    if (last && last.month === key) {
      last.workdays++;
    } else {
      buckets.push({ month: key, workdays: 1 });
    }
  }
  return buckets;
}

/**
 * 窗口内分配工时 = 分配% × 相交工作日 × 8;无相交 = 0。
 * C02/C03 的核心:先交窗口再算工时,不得用整个分配区间计入查询窗口。
 */
export function demandHoursInWindow(
  allocationPercentage: number,
  rangeStart: string, rangeEnd: string,
  windowStart?: string, windowEnd?: string
): number {
  const intersection = intersectDateRange(rangeStart, rangeEnd, windowStart, windowEnd);
  if (!intersection) return 0;
  return (allocationPercentage / 100) * workdaysBetween(intersection.start, intersection.end) * HOURS_PER_WORKDAY;
}
