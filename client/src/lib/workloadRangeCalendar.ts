/**
 * 泳道范围日历的纯日期原语（双月并排、周一开头）。
 *
 * 全部走 ISO 字符串 / UTC 日号运算：本地时区、月末、闰年都由
 * shiftIsoMonths/isoDayNumber 承担，这里不做任何 new Date() 网格数学。
 */
import { shiftIsoDate, shiftIsoMonths } from './batchShift';
import { isoDateFromDayNumber, isoDayNumber } from './isoDate';

export const WORKLOAD_CALENDAR_MIN_MONTH = '1900-01';
/** 双月视图的最晚起始月：再往后第二个月会越过 2200-12。 */
export const WORKLOAD_CALENDAR_MAX_VIEW_MONTH = '2200-11';

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertMonthKey(month: string): void {
  if (!MONTH_KEY_RE.test(month)) {
    throw new Error(`workload calendar expects YYYY-MM, got ${month}`);
  }
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonthKey(month: string, months: number): string {
  assertMonthKey(month);
  return shiftIsoMonths(`${month}-01`, months).slice(0, 7);
}

export function monthFirstIso(month: string): string {
  assertMonthKey(month);
  return `${month}-01`;
}

export function monthLastIso(month: string): string {
  return shiftIsoDate(monthFirstIso(shiftMonthKey(month, 1)), 1, 'day', 'earlier');
}

export function clampViewMonth(month: string): string {
  assertMonthKey(month);
  if (month < WORKLOAD_CALENDAR_MIN_MONTH) return WORKLOAD_CALENDAR_MIN_MONTH;
  if (month > WORKLOAD_CALENDAR_MAX_VIEW_MONTH) return WORKLOAD_CALENDAR_MAX_VIEW_MONTH;
  return month;
}

/**
 * 固定 6 周 × 7 列（周一开头）。首尾会带相邻月日期，渲染层负责禁用；
 * 固定行数让双月布局在翻月时不跳动。
 */
export function buildWorkloadMonthGrid(month: string): string[][] {
  const firstDayNumber = isoDayNumber(monthFirstIso(month));
  if (firstDayNumber === null) throw new Error(`invalid month ${month}`);
  // epoch day 0 = 周四；周一偏移与 workloadTimeline.weekKey 同口径
  const mondayOffset = ((((firstDayNumber % 7) + 3) % 7) + 7) % 7;
  const gridStartDay = firstDayNumber - mondayOffset;
  const weeks: string[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      row.push(isoDateFromDayNumber(gridStartDay + week * 7 + day));
    }
    weeks.push(row);
  }
  return weeks;
}
