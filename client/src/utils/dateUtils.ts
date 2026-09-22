/**
 * Utility functions for consistent date handling across the application
 * Handles both string dates and timestamp formats for backward compatibility
 */

import { getLocale } from '../i18n';

export interface TimelineDate {
  start_date: string | number;
  end_date: string | number;
}

/**
 * Safely parse a date that could be either a string or timestamp
 * @param dateInput - Date string (YYYY-MM-DD) or timestamp number
 * @returns Date object
 */
export function parseDate(dateInput: string | number): Date {
  if (typeof dateInput === 'number') {
    // Handle timestamp (milliseconds)
    return new Date(dateInput);
  }
  
  if (typeof dateInput === 'string') {
    // Handle date string
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Proper YYYY-MM-DD format
      return new Date(dateInput + 'T00:00:00');
    } else if (dateInput.match(/^\d+$/)) {
      // String that looks like a timestamp
      return new Date(parseInt(dateInput, 10));
    } else {
      // Other string formats
      return new Date(dateInput);
    }
  }
  
  // Fallback for invalid input
  console.warn('Invalid date input:', dateInput);
  return new Date();
}

/**
 * Format a date for display in timelines
 * @param date - Date object
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatTimelineDate(
  date: Date, 
  options: { 
    includeYear?: boolean; 
    monthFormat?: 'short' | 'long' | 'numeric';
  } = {}
): string {
  const { includeYear = true, monthFormat = 'short' } = options;
  
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: monthFormat,
    day: 'numeric',
  };
  
  if (includeYear) {
    formatOptions.year = 'numeric';
  }
  
  return date.toLocaleDateString(getLocale(), formatOptions);
}

/**
 * Convert timeline data with mixed date formats to consistent Date objects
 * @param timelineData - Array of objects with start_date and end_date
 * @returns Array with parsed Date objects
 */
export function normalizeTimelineDates<T extends TimelineDate>(
  timelineData: T[]
): (T & { startDate: Date; endDate: Date })[] {
  return timelineData.map(item => ({
    ...item,
    startDate: parseDate(item.start_date),
    endDate: parseDate(item.end_date),
  }));
}

/**
 * Calculate duration in days between two dates
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Duration in days
 */
export function calculateDurationDays(startDate: Date, endDate: Date): number {
  const diffTime = endDate.getTime() - startDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Convert Date object to ISO date string (YYYY-MM-DD)
 * @param date - Date object
 * @returns ISO date string
 */
export function toISODateString(date: Date): string {
  // 本地日历日期, 不用 toISOString(UTC): 东八区 0-8 点会返回昨天
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Validate that a date string is in YYYY-MM-DD format
 * @param dateString - Date string to validate
 * @returns True if valid format
 */
export function isValidDateString(dateString: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
}

/**
 * Check if two dates represent the same day
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return toISODateString(date1) === toISODateString(date2);
}