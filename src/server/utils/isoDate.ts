/**
 * Format a Date as an ISO calendar date string ('YYYY-MM-DD', UTC components).
 *
 * Canonical storage format for date columns (projects.aspiration_start,
 * project_phases_timeline.start_date/end_date, ...). Never store epoch
 * milliseconds: SQLite compares numbers and strings by type, and any
 * number < any text, so numeric dates silently break string comparisons.
 */
export function toIsoDateString(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date object');
  }
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalize a STORED date-column value to canonical 'YYYY-MM-DD' for export.
 * (2026-10-13 全库审计: 导出侧原先统一 new Date(x).toISOString().split——
 * 对日期串是恒等,但存量带时间分量的值经 UTC 切片会偏一天。)
 * 规则: 已是日期串 → 原样;带时区标记(Z/±hh:mm)的完整串 → UTC 日历日
 * (写入即 UTC 序列化,UTC 部件即本意);无时区的 naive 日期时间 → 本地
 * 日历日(按本地写入的语义,不再漂移)。
 */
export function storedDateToIso(value: string): string {
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s; // 解析不动就原样交还,不制造新垃圾
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) return toIsoDateString(d);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
