/**
 * Property tests for committed bar dragging (I19f).
 *
 * Invariants: start <= end always; move mode preserves duration even when the
 * lower bound shifts the whole window; start/end modes only change their edge;
 * drag eligibility is fixed + active + not ended.
 */
import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  canDragCommittedBar,
  computeCommittedDragDates,
  dayNumber,
} from '../committedBarDrag';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);
const isoFromOffset = (offset: number) => new Date(EPOCH + offset * DAY_MS).toISOString().slice(0, 10);
const dateArb = fc.integer({ min: 0, max: 3650 }).map(isoFromOffset);

const windowArb = fc.tuple(dateArb, fc.integer({ min: 0, max: 90 })).map(([start, length]) => ({
  start,
  end: new Date((dayNumber(start) + length) * DAY_MS).toISOString().slice(0, 10),
}));

describe('committedBarDrag properties', () => {
  test('move preserves duration and keeps start <= end', () => {
    fc.assert(
      fc.property(windowArb, fc.integer({ min: -60, max: 60 }), ({ start, end }, deltaDays) => {
        const result = computeCommittedDragDates({
          origStart: start,
          origEnd: end,
          mode: 'move',
          deltaDays,
          asOf: start,
        });
        expect(dayNumber(result.endDate)).toBeGreaterThanOrEqual(dayNumber(result.startDate));
        expect(dayNumber(result.endDate) - dayNumber(result.startDate)).toBe(dayNumber(end) - dayNumber(start));
      }),
      { numRuns: 300 }
    );
  });

  test('start mode changes only the start; end mode changes only the end', () => {
    fc.assert(
      fc.property(windowArb, fc.integer({ min: -60, max: 60 }), ({ start, end }, deltaDays) => {
        const startResult = computeCommittedDragDates({
          origStart: start,
          origEnd: end,
          mode: 'start',
          deltaDays,
          asOf: start,
        });
        expect(startResult.endDate).toBe(end);

        const endResult = computeCommittedDragDates({
          origStart: start,
          origEnd: end,
          mode: 'end',
          deltaDays,
          asOf: start,
        });
        expect(endResult.startDate).toBe(start);
        expect(startResult.startDate <= startResult.endDate).toBe(true);
        expect(endResult.startDate <= endResult.endDate).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  test('eligibility is fixed + active + not ended', () => {
    fc.assert(
      fc.property(windowArb, ({ start, end }) => {
        expect(canDragCommittedBar({ dateMode: 'fixed', status: 'active', startDate: start, endDate: end }, start)).toBe(true);
        expect(canDragCommittedBar({ dateMode: 'fixed', status: 'paused', startDate: start, endDate: end }, start)).toBe(false);
        expect(canDragCommittedBar({ dateMode: 'phase', status: 'active', startDate: start, endDate: end }, start)).toBe(false);
        const afterEnd = new Date((dayNumber(end) + 1) * DAY_MS).toISOString().slice(0, 10);
        expect(canDragCommittedBar({ dateMode: 'fixed', status: 'active', startDate: start, endDate: end }, afterEnd)).toBe(false);
      }),
      { numRuns: 300 }
    );
  });
});
