import i18n, { getLocale } from '../i18n';

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return i18n.t('common:na');

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return i18n.t('common:invalidDate');

  return d.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return i18n.t('common:na');

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return i18n.t('common:invalidDate');

  return d.toLocaleString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getDaysBetween(start: string | Date, end: string | Date): number {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

export function addDays(date: string | Date, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function isDateInPast(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
}

export function isDateInFuture(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d > new Date();
}

export function getMonthYear(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  return d.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'long'
  });
}

export function getWeekNumber(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Get the default date range for reports: broader range to include historical and future projects
 * This ensures test data and real projects across different timeframes are visible
 */
export function getDefaultReportDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  
  // Start from 2023 to capture all baseline scenario historical projects
  const startDate = new Date(2023, 0, 1); // January 1, 2023
  
  // End at 12 months from now to capture future projects
  const endDate = new Date(today.getFullYear() + 1, today.getMonth(), 0); // Last day of current month next year
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

// ============================================================================
// TIMEZONE-SAFE DATE UTILITIES FOR PHASE DEPENDENCIES SYSTEM
// ============================================================================

/**
 * Parse a YYYY-MM-DD date string as a timezone-independent business date
 * This treats the date as representing the same calendar day regardless of timezone
 */
export function parseDateSafe(dateString: string): Date {
  if (!dateString) throw new Error('Date string is required');
  
  // Parse YYYY-MM-DD as local date to avoid timezone shifts
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) throw new Error('Invalid date format, expected YYYY-MM-DD');
  
  // Create date in local timezone to represent the business date
  return new Date(year, month - 1, day);
}

/**
 * Format a Date object to YYYY-MM-DD string in a timezone-safe way
 * This ensures the same calendar day is represented regardless of timezone
 */
export function formatDateSafe(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date object');
  }
  
  // Use local date components to avoid timezone shifts
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Add days to a date string in a timezone-safe way
 * Returns a new date string representing the correct business date
 */
export function addDaysSafe(dateString: string, days: number): string {
  const date = parseDateSafe(dateString);
  date.setDate(date.getDate() + days);
  return formatDateSafe(date);
}

/**
 * Compare two date strings for equality (timezone-independent)
 */
export function isSameDateSafe(dateString1: string, dateString2: string): boolean {
  return dateString1 === dateString2;
}

/**
 * Compare if date1 is before date2 (timezone-independent)
 */
export function isBeforeSafe(dateString1: string, dateString2: string): boolean {
  const date1 = parseDateSafe(dateString1);
  const date2 = parseDateSafe(dateString2);
  
  // Compare using date components to avoid timezone issues
  return date1.getTime() < date2.getTime();
}

/**
 * Compare if date1 is after date2 (timezone-independent)
 */
export function isAfterSafe(dateString1: string, dateString2: string): boolean {
  const date1 = parseDateSafe(dateString1);
  const date2 = parseDateSafe(dateString2);
  
  return date1.getTime() > date2.getTime();
}

/**
 * Compare if date1 is before or equal to date2 (timezone-independent)
 */
export function isBeforeOrEqualSafe(dateString1: string, dateString2: string): boolean {
  return isSameDateSafe(dateString1, dateString2) || isBeforeSafe(dateString1, dateString2);
}

/**
 * Compare if date1 is after or equal to date2 (timezone-independent)
 */
export function isAfterOrEqualSafe(dateString1: string, dateString2: string): boolean {
  return isSameDateSafe(dateString1, dateString2) || isAfterSafe(dateString1, dateString2);
}

/**
 * Calculate days between two date strings (timezone-independent)
 */
export function daysBetweenSafe(startDateString: string, endDateString: string): number {
  const startDate = parseDateSafe(startDateString);
  const endDate = parseDateSafe(endDateString);
  
  const diffTime = endDate.getTime() - startDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format date string for display (timezone-safe)
 */
export function formatDateDisplaySafe(dateString: string): string {
  if (!dateString) return i18n.t('common:na');

  try {
    const date = parseDateSafe(dateString);
    return date.toLocaleDateString(getLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return i18n.t('common:invalidDate');
  }
}

/**
 * Convert Date object to date string for HTML date input (timezone-safe)
 */
export function toDateInputValue(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  return formatDateSafe(date);
}

/**
 * Get today's date as a timezone-safe date string
 */
export function getTodaySafe(): string {
  return formatDateSafe(new Date());
}