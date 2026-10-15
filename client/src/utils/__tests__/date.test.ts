import {
  formatDate,
  formatDateTime,
  getDaysBetween,
  addDays,
  formatDateRange,
  isDateInPast,
  isDateInFuture,
  getMonthYear,
  getWeekNumber,
  getDefaultReportDateRange,
  parseDateSafe,
  formatDateSafe,
  addDaysSafe,
  isSameDateSafe,
  isBeforeSafe,
  isAfterSafe,
  isBeforeOrEqualSafe,
  isAfterOrEqualSafe,
  daysBetweenSafe,
  formatDateDisplaySafe,
  toDateInputValue,
  getTodaySafe
} from '../date';

describe('date.ts - Basic Date Formatting', () => {
  describe('formatDate', () => {
    it('formats a Date object correctly', () => {
      const date = new Date(2025, 2, 15, 10, 30); // March 15, 2025 local time
      const result = formatDate(date);
      expect(result).toBe('Mar 15, 2025');
    });

    it('formats a date string correctly', () => {
      const result = formatDate('2025-03-15T12:00:00');
      expect(result).toContain('Mar');
      expect(result).toContain('2025');
    });

    it('returns N/A for null', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    it('returns N/A for undefined', () => {
      expect(formatDate(undefined)).toBe('N/A');
    });

    it('returns Invalid date for invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('Invalid date');
    });

    it('handles empty string', () => {
      expect(formatDate('')).toBe('N/A');
    });
  });

  describe('formatDateTime', () => {
    it('formats a Date object with time', () => {
      const date = new Date('2025-03-15T14:30:00');
      const result = formatDateTime(date);
      expect(result).toContain('Mar 15, 2025');
      expect(result).toContain('2:30 PM');
    });

    it('formats a date string with time', () => {
      const result = formatDateTime('2025-03-15T14:30:00');
      expect(result).toContain('Mar 15, 2025');
    });

    it('returns N/A for null', () => {
      expect(formatDateTime(null)).toBe('N/A');
    });

    it('returns N/A for undefined', () => {
      expect(formatDateTime(undefined)).toBe('N/A');
    });

    it('returns Invalid date for invalid input', () => {
      expect(formatDateTime('invalid')).toBe('Invalid date');
    });
  });

  describe('formatDateRange', () => {
    it('formats date range with Date objects', () => {
      const start = new Date(2025, 0, 1); // Jan 1, 2025 local
      const end = new Date(2025, 11, 31); // Dec 31, 2025 local
      expect(formatDateRange(start, end)).toBe('Jan 1, 2025 - Dec 31, 2025');
    });

    it('formats date range with strings', () => {
      const result = formatDateRange('2025-01-01T12:00:00', '2025-12-31T12:00:00');
      expect(result).toContain('2025');
      expect(result).toContain(' - ');
    });

    it('handles mixed Date and string', () => {
      const start = new Date(2025, 0, 1); // Jan 1, 2025 local
      const result = formatDateRange(start, '2025-12-31T12:00:00');
      expect(result).toContain('2025');
    });
  });

  describe('getMonthYear', () => {
    it('formats month and year from Date object', () => {
      const date = new Date(2025, 2, 15); // March 15, 2025 local
      expect(getMonthYear(date)).toBe('March 2025');
    });

    it('formats month and year from string', () => {
      const result = getMonthYear('2025-03-15T12:00:00');
      expect(result).toContain('2025');
    });

    it('handles different months', () => {
      const jan = new Date(2025, 0, 15); // January 15, 2025
      const dec = new Date(2025, 11, 15); // December 15, 2025
      expect(getMonthYear(jan)).toBe('January 2025');
      expect(getMonthYear(dec)).toBe('December 2025');
    });
  });
});

describe('date.ts - Date Calculations', () => {
  describe('getDaysBetween', () => {
    it('calculates days between Date objects', () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-08');
      expect(getDaysBetween(start, end)).toBe(7);
    });

    it('calculates days between strings', () => {
      expect(getDaysBetween('2025-01-01', '2025-01-08')).toBe(7);
    });

    it('handles same date', () => {
      expect(getDaysBetween('2025-01-01', '2025-01-01')).toBe(0);
    });

    it('uses absolute value for reversed dates', () => {
      expect(getDaysBetween('2025-01-08', '2025-01-01')).toBe(7);
    });

    it('calculates days across months', () => {
      expect(getDaysBetween('2025-01-30', '2025-02-03')).toBe(4);
    });

    it('calculates days across years', () => {
      expect(getDaysBetween('2024-12-30', '2025-01-02')).toBe(3);
    });

    it('handles leap year', () => {
      expect(getDaysBetween('2024-02-28', '2024-03-01')).toBe(2);
    });
  });

  describe('addDays', () => {
    it('adds days to Date object', () => {
      const date = new Date(2025, 0, 15); // Jan 15, 2025
      const result = addDays(date, 7);
      expect(result.getDate()).toBe(22);
    });

    it('adds days to string', () => {
      const result = addDays('2025-01-15T12:00:00', 7);
      expect(result.getDate()).toBeGreaterThanOrEqual(21);
      expect(result.getDate()).toBeLessThanOrEqual(22);
    });

    it('handles adding zero days', () => {
      const date = new Date(2025, 0, 15); // Jan 15, 2025
      const result = addDays(date, 0);
      expect(result.getDate()).toBe(15);
    });

    it('handles negative days (subtraction)', () => {
      const date = new Date(2025, 0, 15); // Jan 15, 2025
      const result = addDays(date, -5);
      expect(result.getDate()).toBe(10);
    });

    it('handles crossing month boundary', () => {
      const date = new Date(2025, 0, 30); // Jan 30, 2025
      const result = addDays(date, 5);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(4);
    });

    it('handles crossing year boundary', () => {
      const date = new Date(2024, 11, 30); // Dec 30, 2024
      const result = addDays(date, 5);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0); // January
    });

    it('handles leap year in February', () => {
      const date = new Date(2024, 1, 28); // Feb 28, 2024
      const result = addDays(date, 1);
      expect(result.getDate()).toBe(29);
    });
  });

  describe('getWeekNumber', () => {
    it('calculates week number for Date object', () => {
      const date = new Date('2025-01-08');
      const weekNum = getWeekNumber(date);
      expect(weekNum).toBeGreaterThan(0);
      expect(weekNum).toBeLessThanOrEqual(53);
    });

    it('calculates week number for string', () => {
      const weekNum = getWeekNumber('2025-01-08');
      expect(weekNum).toBeGreaterThan(0);
      expect(weekNum).toBeLessThanOrEqual(53);
    });

    it('handles first week of year', () => {
      const weekNum = getWeekNumber(new Date(2025, 0, 5)); // Jan 5, 2025 (safely in week 1-2)
      expect(weekNum).toBeGreaterThanOrEqual(1);
      expect(weekNum).toBeLessThanOrEqual(2);
    });

    it('handles end of year', () => {
      const weekNum = getWeekNumber('2025-12-31');
      expect(weekNum).toBeGreaterThanOrEqual(52);
    });
  });
});

describe('date.ts - Date Comparisons', () => {
  describe('isDateInPast', () => {
    it('returns true for past date', () => {
      const pastDate = new Date('2020-01-01');
      expect(isDateInPast(pastDate)).toBe(true);
    });

    it('returns true for past date string', () => {
      expect(isDateInPast('2020-01-01')).toBe(true);
    });

    it('returns false for future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(isDateInPast(futureDate)).toBe(false);
    });
  });

  describe('isDateInFuture', () => {
    it('returns true for future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(isDateInFuture(futureDate)).toBe(true);
    });

    it('returns true for future date string', () => {
      expect(isDateInFuture('2030-01-01')).toBe(true);
    });

    it('returns false for past date', () => {
      const pastDate = new Date('2020-01-01');
      expect(isDateInFuture(pastDate)).toBe(false);
    });
  });
});

describe('date.ts - Report Date Range', () => {
  describe('getDefaultReportDateRange', () => {
    it('U11: 默认窗口=本月1日起、未来三个月末(历史需显式选择)', () => {
      jest.useFakeTimers({ now: new Date('2026-10-15T10:00:00'), doNotFake: ['nextTick', 'setTimeout'] } as any);
      jest.setSystemTime(new Date('2026-10-15T10:00:00'));
      const range = getDefaultReportDateRange();
      jest.useRealTimers();
      expect(range.startDate).toBe('2026-10-01');
      expect(range.endDate).toBe('2027-01-31'); // 10/11/12/1 月,末日
    });

    it('returns dates in YYYY-MM-DD format', () => {
      const range = getDefaultReportDateRange();
      expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('date.ts - Timezone-Safe Date Utilities', () => {
  describe('parseDateSafe', () => {
    it('parses YYYY-MM-DD format correctly', () => {
      const result = parseDateSafe('2025-03-15');
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(2); // 0-indexed
      expect(result.getDate()).toBe(15);
    });

    it('throws error for empty string', () => {
      expect(() => parseDateSafe('')).toThrow('Date string is required');
    });

    it('throws error for invalid format', () => {
      expect(() => parseDateSafe('invalid')).toThrow('Invalid date format');
    });

    it('creates date for month 13 (JavaScript auto-adjusts)', () => {
      // JavaScript Date automatically adjusts month 13 to next year's January
      const result = parseDateSafe('2025-13-01');
      expect(result).toBeInstanceOf(Date);
      // Month 13 becomes January of next year
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0); // January
    });

    it('parses leap year date correctly', () => {
      const result = parseDateSafe('2024-02-29');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1);
      expect(result.getDate()).toBe(29);
    });
  });

  describe('formatDateSafe', () => {
    it('formats date to YYYY-MM-DD', () => {
      const date = new Date(2025, 2, 15); // March 15, 2025
      expect(formatDateSafe(date)).toBe('2025-03-15');
    });

    it('pads single digit months', () => {
      const date = new Date(2025, 0, 5); // January 5
      expect(formatDateSafe(date)).toBe('2025-01-05');
    });

    it('pads single digit days', () => {
      const date = new Date(2025, 11, 5); // December 5
      expect(formatDateSafe(date)).toBe('2025-12-05');
    });

    it('throws error for invalid date', () => {
      const invalidDate = new Date('invalid');
      expect(() => formatDateSafe(invalidDate)).toThrow('Invalid date object');
    });

    it('throws error for non-Date object', () => {
      expect(() => formatDateSafe('not a date' as any)).toThrow('Invalid date object');
    });
  });

  describe('addDaysSafe', () => {
    it('adds days to date string', () => {
      expect(addDaysSafe('2025-01-15', 7)).toBe('2025-01-22');
    });

    it('handles negative days', () => {
      expect(addDaysSafe('2025-01-15', -5)).toBe('2025-01-10');
    });

    it('handles crossing month boundary', () => {
      expect(addDaysSafe('2025-01-30', 5)).toBe('2025-02-04');
    });

    it('handles crossing year boundary', () => {
      expect(addDaysSafe('2024-12-30', 5)).toBe('2025-01-04');
    });

    it('handles leap year', () => {
      expect(addDaysSafe('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDaysSafe('2024-02-29', 1)).toBe('2024-03-01');
    });

    it('handles non-leap year', () => {
      expect(addDaysSafe('2025-02-28', 1)).toBe('2025-03-01');
    });
  });

  describe('isSameDateSafe', () => {
    it('returns true for identical dates', () => {
      expect(isSameDateSafe('2025-03-15', '2025-03-15')).toBe(true);
    });

    it('returns false for different dates', () => {
      expect(isSameDateSafe('2025-03-15', '2025-03-16')).toBe(false);
    });

    it('returns false for same day different months', () => {
      expect(isSameDateSafe('2025-03-15', '2025-04-15')).toBe(false);
    });
  });

  describe('isBeforeSafe', () => {
    it('returns true when first date is before second', () => {
      expect(isBeforeSafe('2025-01-15', '2025-01-20')).toBe(true);
    });

    it('returns false when first date is after second', () => {
      expect(isBeforeSafe('2025-01-20', '2025-01-15')).toBe(false);
    });

    it('returns false when dates are equal', () => {
      expect(isBeforeSafe('2025-01-15', '2025-01-15')).toBe(false);
    });

    it('handles dates across months', () => {
      expect(isBeforeSafe('2025-01-31', '2025-02-01')).toBe(true);
    });

    it('handles dates across years', () => {
      expect(isBeforeSafe('2024-12-31', '2025-01-01')).toBe(true);
    });
  });

  describe('isAfterSafe', () => {
    it('returns true when first date is after second', () => {
      expect(isAfterSafe('2025-01-20', '2025-01-15')).toBe(true);
    });

    it('returns false when first date is before second', () => {
      expect(isAfterSafe('2025-01-15', '2025-01-20')).toBe(false);
    });

    it('returns false when dates are equal', () => {
      expect(isAfterSafe('2025-01-15', '2025-01-15')).toBe(false);
    });
  });

  describe('isBeforeOrEqualSafe', () => {
    it('returns true when first date is before second', () => {
      expect(isBeforeOrEqualSafe('2025-01-15', '2025-01-20')).toBe(true);
    });

    it('returns true when dates are equal', () => {
      expect(isBeforeOrEqualSafe('2025-01-15', '2025-01-15')).toBe(true);
    });

    it('returns false when first date is after second', () => {
      expect(isBeforeOrEqualSafe('2025-01-20', '2025-01-15')).toBe(false);
    });
  });

  describe('isAfterOrEqualSafe', () => {
    it('returns true when first date is after second', () => {
      expect(isAfterOrEqualSafe('2025-01-20', '2025-01-15')).toBe(true);
    });

    it('returns true when dates are equal', () => {
      expect(isAfterOrEqualSafe('2025-01-15', '2025-01-15')).toBe(true);
    });

    it('returns false when first date is before second', () => {
      expect(isAfterOrEqualSafe('2025-01-15', '2025-01-20')).toBe(false);
    });
  });

  describe('daysBetweenSafe', () => {
    it('calculates positive days between dates', () => {
      expect(daysBetweenSafe('2025-01-01', '2025-01-08')).toBe(7);
    });

    it('calculates negative days when end is before start', () => {
      expect(daysBetweenSafe('2025-01-08', '2025-01-01')).toBe(-7);
    });

    it('returns zero for same date', () => {
      expect(daysBetweenSafe('2025-01-15', '2025-01-15')).toBe(0);
    });

    it('handles dates across months', () => {
      expect(daysBetweenSafe('2025-01-30', '2025-02-03')).toBe(4);
    });

    it('handles dates across years', () => {
      expect(daysBetweenSafe('2024-12-30', '2025-01-02')).toBe(3);
    });

    it('handles leap year correctly', () => {
      expect(daysBetweenSafe('2024-02-28', '2024-03-01')).toBe(2);
    });
  });

  describe('formatDateDisplaySafe', () => {
    it('formats valid date string for display', () => {
      expect(formatDateDisplaySafe('2025-03-15')).toBe('Mar 15, 2025');
    });

    it('returns N/A for empty string', () => {
      expect(formatDateDisplaySafe('')).toBe('N/A');
    });

    it('returns Invalid date for malformed string', () => {
      expect(formatDateDisplaySafe('invalid')).toBe('Invalid date');
    });
  });

  describe('toDateInputValue', () => {
    it('converts Date object to input value', () => {
      const date = new Date(2025, 2, 15); // March 15, 2025
      expect(toDateInputValue(date)).toBe('2025-03-15');
    });

    it('returns empty string for invalid date', () => {
      const invalidDate = new Date('invalid');
      expect(toDateInputValue(invalidDate)).toBe('');
    });

    it('returns empty string for non-Date object', () => {
      expect(toDateInputValue('not a date' as any)).toBe('');
    });
  });

  describe('getTodaySafe', () => {
    it('returns today in YYYY-MM-DD format', () => {
      const result = getTodaySafe();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns current date matching Date object', () => {
      const result = getTodaySafe();
      const today = new Date();
      const expectedYear = today.getFullYear();
      const expectedMonth = (today.getMonth() + 1).toString().padStart(2, '0');
      const expectedDay = today.getDate().toString().padStart(2, '0');
      expect(result).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
    });
  });
});

describe('date.ts - Edge Cases and Error Handling', () => {
  it('handles very old dates', () => {
    const oldDate = new Date(1900, 0, 1); // Jan 1, 1900 local
    expect(formatDate(oldDate)).toBe('Jan 1, 1900');
  });

  it('handles far future dates', () => {
    const futureDate = new Date(2100, 11, 31); // Dec 31, 2100 local
    expect(formatDate(futureDate)).toBe('Dec 31, 2100');
  });

  it('handles dates near epoch', () => {
    const epochDate = new Date('1970-01-01');
    expect(formatDate(epochDate)).toBeTruthy();
  });

  it('parseDateSafe accepts single-digit components', () => {
    // parseDateSafe splits and parses, so single digit is accepted
    const result = parseDateSafe('2025-1-5');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January (0-indexed)
    expect(result.getDate()).toBe(5);
  });

  it('addDaysSafe handles large day additions', () => {
    const result = addDaysSafe('2025-01-01', 365);
    expect(result).toBe('2026-01-01');
  });

  it('daysBetweenSafe handles long time spans', () => {
    const days = daysBetweenSafe('2020-01-01', '2025-01-01');
    expect(days).toBeGreaterThan(1800);
    expect(days).toBeLessThan(1900);
  });
});
