/**
 * Property tests for the shared work calendar (I19f).
 *
 * Invariants, not examples: weekend exclusion, calendar-day upper bound,
 * month-bucket conservation, and rounding at the display boundary.
 */
import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  workdaysBetween,
  monthBuckets,
  workMonths,
  displayWorkMonths,
  intersectDateRange,
} from '../workCalendar.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);
const isoFromOffset = (offset: number) => new Date(EPOCH + offset * DAY_MS).toISOString().slice(0, 10);
const dateArb = fc.integer({ min: 0, max: 3650 }).map(isoFromOffset);

const calendarDays = (a: string, b: string) =>
  Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;

const localWeekday = (iso: string) => new Date(`${iso}T00:00:00`).getDay();

describe('workCalendar properties', () => {
  test('same day is 1 on weekdays and 0 on weekends', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const dow = localWeekday(date);
        expect(workdaysBetween(date, date)).toBe(dow === 0 || dow === 6 ? 0 : 1);
      }),
      { numRuns: 300 }
    );
  });

  test('workdays never exceed calendar days; inverted ranges are 0', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (a, b) => {
        const [start, end] = a <= b ? [a, b] : [b, a];
        const workdays = workdaysBetween(start, end);
        expect(workdays).toBeGreaterThanOrEqual(0);
        expect(workdays).toBeLessThanOrEqual(calendarDays(start, end));
        if (a > b) expect(workdaysBetween(a, b)).toBe(0);
      }),
      { numRuns: 300 }
    );
  });

  test('month buckets conserve the total workday count', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (a, b) => {
        const [start, end] = a <= b ? [a, b] : [b, a];
        const buckets = monthBuckets(start, end);
        const total = buckets.reduce((sum, bucket) => sum + bucket.workdays, 0);
        expect(total).toBe(workdaysBetween(start, end));
        for (const bucket of buckets) {
          expect(bucket.month).toMatch(/^\d{4}-\d{2}$/);
          expect(bucket.workdays).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 }
    );
  });

  test('invalid and inverted inputs are safe (mutation-survivor killers)', () => {
    expect(workdaysBetween('', '2026-01-01')).toBe(0);
    expect(workdaysBetween('not-a-date', '2026-01-01')).toBe(0);
    expect(workdaysBetween('2026-01-02', '2026-01-01')).toBe(0);
    expect(workdaysBetween(undefined as unknown as string, '2026-01-01')).toBe(0);
    expect(monthBuckets('', '2026-01-01')).toEqual([]);
    expect(monthBuckets('not-a-date', '2026-01-01')).toEqual([]);
    expect(monthBuckets('2026-01-02', '2026-01-01')).toEqual([]);
  });

  test('window intersection clips, rejects non-overlap, and treats missing sides as unbounded', () => {
    expect(intersectDateRange('2026-01-01', '2026-01-31', '2026-01-10', '2026-01-20')).toEqual({
      start: '2026-01-10',
      end: '2026-01-20',
    });
    expect(intersectDateRange('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-10')).toBeNull();
    expect(intersectDateRange('2026-01-31', '2026-01-01')).toBeNull();
    expect(intersectDateRange('2026-01-01', '2026-01-31', undefined, '2026-01-15')).toEqual({
      start: '2026-01-01',
      end: '2026-01-15',
    });
    expect(intersectDateRange('2026-01-01', '2026-01-31', '2026-01-15', undefined)).toEqual({
      start: '2026-01-15',
      end: '2026-01-31',
    });
  });

  test('displayWorkMonths is the rounded work-month value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (days) => {
        expect(displayWorkMonths(days)).toBe(Math.round(workMonths(days) * 100) / 100);
      }),
      { numRuns: 300 }
    );
  });
});
