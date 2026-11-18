/**
 * Strict calendar-date helpers shared by forms and range math.
 *
 * `new Date('2026-02-30')` silently rolls into March; callers that compare
 * user-entered dates must reject impossible days instead of normalizing them.
 */

export function isIsoCalendarDate(
  value: string | null | undefined
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * 用户常输入 2026-12-1 这种未补零日期。允许 1–2 位月/日，归一成
 * 页面/接口统一使用的 YYYY-MM-DD；真正无效的日历日仍返回 null。
 */
export function normalizeIsoDateInput(value: string): string | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return isIsoCalendarDate(iso) ? iso : null;
}

/** Day index in UTC, or null for an invalid calendar date. */
export function isoDayNumber(value: string | null | undefined): number | null {
  if (!isIsoCalendarDate(value)) return null;
  const day = Math.floor(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(5, 7)) - 1,
      Number(value.slice(8, 10))
    ) / 86_400_000
  );
  return Number.isFinite(day) ? day : null;
}
