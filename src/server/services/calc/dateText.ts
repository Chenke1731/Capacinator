/**
 * 日期落库规范化（导入贯通验收修正）。
 *
 * knex + better-sqlite3 把 Date 对象存成毫秒文本（如 "1793548800000.0"），
 * 而全部运行时读侧（需求过滤 `end_date >= '2026-01-01'`、workCalendar
 * 字符串解析）按 ISO 日期字符串比较——毫秒文本与日期字符串的字典序比较
 * 必然失配，导入行对日期过滤查询整体不可见。导入器写日期列一律先过此处。
 */
export function toISODateText(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
