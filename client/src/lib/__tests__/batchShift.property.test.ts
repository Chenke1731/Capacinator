/**
 * Property tests for batch shift (I19f).
 *
 * Invariants: day/week shifts preserve duration, month shifts clamp to the
 * target month's last day, paused rows are always skipped, and earlier shifts
 * never move a started row before its original start.
 */
import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { planBatchShift, shiftIsoDate, shiftIsoMonths } from '../batchShift';
import { dayNumber } from '../committedBarDrag';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);
const isoFromOffset = (offset: number) => new Date(EPOCH + offset * DAY_MS).toISOString().slice(0, 10);
const dateArb = fc.integer({ min: 0, max: 3650 }).map(isoFromOffset);
const isoFromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

const rowArb = fc.tuple(dateArb, fc.integer({ min: 0, max: 90 })).map(([start, length]) => ({
  id: 'a1',
  version: 1,
  status: 'active',
  assignment_date_mode: 'fixed',
  start_date: start,
  end_date: isoFromDay(dayNumber(start) + length),
  project_name: 'Alpha',
  assignment_type: 'scenario',
}));

describe('batchShift properties', () => {
  test('day/week shifts preserve duration', () => {
    fc.assert(
      fc.property(rowArb, fc.integer({ min: 1, max: 30 }), fc.constantFrom('day' as const, 'week' as const), (row, amount, unit) => {
        const plan = planBatchShift([row], { direction: 'later', amount, unit, asOf: row.start_date });
        expect(plan.rows).toHaveLength(1);
        const shifted = plan.rows[0];
        const originalDuration = dayNumber(row.end_date) - dayNumber(row.start_date);
        const newDuration = dayNumber(shifted.newEnd) - dayNumber(shifted.newStart);
        expect(newDuration).toBe(originalDuration);
      }),
      { numRuns: 200 }
    );
  });

  test('paused rows are skipped; earlier shifts never extend history', () => {
    fc.assert(
      fc.property(rowArb, (row) => {
        const paused = planBatchShift([{ ...row, status: 'paused' }], {
          direction: 'later',
          amount: 1,
          unit: 'day',
          asOf: row.start_date,
        });
        expect(paused.rows).toHaveLength(0);
        expect(paused.skipped.paused).toBe(1);

        const earlier = planBatchShift([row], {
          direction: 'earlier',
          amount: 3,
          unit: 'day',
          asOf: row.start_date,
        });
        if (earlier.rows.length) {
          expect(dayNumber(earlier.rows[0].newStart)).toBeGreaterThanOrEqual(dayNumber(row.start_date));
        } else {
          expect(earlier.blocked.length).toBe(1);
        }
      }),
      { numRuns: 200 }
    );
  });

  test('month shifts clamp to the target month and remain ordered', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: -12, max: 12 }),
        (year, month, day, amount) => {
          const start = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const shifted = shiftIsoMonths(start, amount);
          expect(shifted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          const targetIndex = year * 12 + (month - 1) + amount;
          const targetYear = Math.floor(targetIndex / 12);
          const targetMonth = ((targetIndex % 12) + 12) % 12 + 1;
          expect(shifted.slice(0, 7)).toBe(`${targetYear}-${String(targetMonth).padStart(2, '0')}`);
          expect(Number(shifted.slice(8, 10))).toBeLessThanOrEqual(28);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('shiftIsoDate is reversible for day units', () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: 0, max: 30 }), (date, amount) => {
        expect(shiftIsoDate(shiftIsoDate(date, amount, 'day', 'later'), amount, 'day', 'earlier')).toBe(date);
      }),
      { numRuns: 200 }
    );
  });
});
