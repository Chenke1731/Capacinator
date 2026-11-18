/**
 * Workload swimlane display-range rules.
 *
 * The range is a viewport, not a data filter: the page summary stays anchored
 * at the server's asOf. Keep validation here so the picker and the automatic
 * "locate" expansions share one definition of a usable window.
 */
import { shiftIsoDate } from './batchShift';
import { isIsoCalendarDate, isoDayNumber } from './isoDate';

/** ~5 calendar years, inclusive. Guards typos such as 9999-12-31. */
export const WORKLOAD_RANGE_MAX_DAYS = 1830;
export const WORKLOAD_RANGE_MIN_YEAR = 1900;
export const WORKLOAD_RANGE_MAX_YEAR = 2200;
/** 与年份上限配套的日期闸：minimap/导航等派生入口不得越过它。 */
export const WORKLOAD_RANGE_MAX_ISO = `${WORKLOAD_RANGE_MAX_YEAR}-12-31`;

export type WorkloadRangeError =
  | 'invalid-start'
  | 'invalid-end'
  | 'invalid-order'
  | 'too-long';

function hasSupportedYear(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= WORKLOAD_RANGE_MIN_YEAR && year <= WORKLOAD_RANGE_MAX_YEAR;
}

function isRangeDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && isIsoCalendarDate(value) && hasSupportedYear(value);
}

/**
 * Inclusive day count (2026-01-01..2026-01-01 = 1). Returns null when either
 * endpoint is not a real calendar date in the supported year range.
 */
export function workloadRangeDays(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!isRangeDate(start) || !isRangeDate(end)) return null;
  const startDay = isoDayNumber(start);
  const endDay = isoDayNumber(end);
  if (startDay === null || endDay === null) return null;
  return Math.abs(endDay - startDay) + 1;
}

export function validateWorkloadRange(
  start: string,
  end: string,
  maxDays = WORKLOAD_RANGE_MAX_DAYS
): WorkloadRangeError | null {
  if (!isRangeDate(start)) return 'invalid-start';
  if (!isRangeDate(end)) return 'invalid-end';
  if (start > end) return 'invalid-order';
  const days = workloadRangeDays(start, end);
  if (days === null) return 'invalid-start';
  if (days > maxDays) return 'too-long';
  return null;
}

/** Clamp an end date so the inclusive span stays within the product cap. */
export function clampWorkloadRangeEnd(
  start: string,
  end: string,
  maxDays = WORKLOAD_RANGE_MAX_DAYS
): string {
  const days = workloadRangeDays(start, end);
  if (days === null || days <= maxDays) return end;
  return shiftIsoDate(start, maxDays - 1, 'day', 'later');
}

/** Week buckets for short windows; month buckets once a window gets long. */
export function workloadGranularity(
  start: string,
  end: string
): 'week' | 'month' {
  const days = workloadRangeDays(start, end);
  // Keep the page's historical boundary: end - start > 183 days.
  return days !== null && days - 1 > 183 ? 'month' : 'week';
}
