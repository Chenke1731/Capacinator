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
