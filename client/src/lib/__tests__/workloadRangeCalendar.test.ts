import {
  WORKLOAD_CALENDAR_MAX_VIEW_MONTH,
  WORKLOAD_CALENDAR_MIN_MONTH,
  buildWorkloadMonthGrid,
  clampViewMonth,
  monthFirstIso,
  monthKeyOf,
  monthLastIso,
  shiftMonthKey,
} from '../workloadRangeCalendar';

describe('workloadRangeCalendar', () => {
  test('month keys shift across year boundaries with month-end clamping', () => {
    expect(monthKeyOf('2026-03-15')).toBe('2026-03');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2027-01', -1)).toBe('2026-12');
    expect(monthFirstIso('2026-04')).toBe('2026-04-01');
    expect(monthLastIso('2027-02')).toBe('2027-02-28');
    expect(monthLastIso('2028-02')).toBe('2028-02-29');
    expect(monthLastIso('2026-12')).toBe('2026-12-31');
  });

  test('builds a Monday-first 6x7 grid with stable height', () => {
    // 2026-03-01 是周日；周一开头的首格应回到 2026-02-23
    const grid = buildWorkloadMonthGrid('2026-03');
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0]).toBe('2026-02-23');
    expect(grid.flat()).toContain('2026-03-01');
    expect(grid.flat()).toContain('2026-03-31');
    // 2026-02-01 是周日；跨月网格同样从上一个周一开始
    expect(buildWorkloadMonthGrid('2026-02')[0][0]).toBe('2026-01-26');
  });

  test('clamps the two-month view inside the supported year range', () => {
    expect(clampViewMonth('1899-12')).toBe(WORKLOAD_CALENDAR_MIN_MONTH);
    expect(clampViewMonth('2200-12')).toBe(WORKLOAD_CALENDAR_MAX_VIEW_MONTH);
    expect(clampViewMonth('2026-11')).toBe('2026-11');
  });

  test('rejects malformed month keys loudly', () => {
    expect(() => shiftMonthKey('2026-13', 1)).toThrow(/YYYY-MM/);
  });
});
