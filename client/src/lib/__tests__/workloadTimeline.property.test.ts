/**
 * Property tests for the workload timeline (I19f).
 *
 * Invariants: an empty timeline has zero load, a committed row contributes its
 * allocation at asOf, a draft adds to the projected load, and an inverted range
 * is normalized (not thrown) for live-preview intermediate states.
 */
import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { workloadTimeline } from '../workloadTimeline';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);
const isoFromOffset = (offset: number) => new Date(EPOCH + offset * DAY_MS).toISOString().slice(0, 10);

const rangeArb = fc.tuple(fc.integer({ min: 0, max: 3650 }), fc.integer({ min: 0, max: 60 }))
  .map(([offset, length]) => {
    const start = isoFromOffset(offset);
    const end = isoFromOffset(offset + length);
    return { start, end };
  });

describe('workloadTimeline properties', () => {
  test('empty timeline has zero load and normalizes an inverted range', () => {
    fc.assert(
      fc.property(rangeArb, ({ start, end }) => {
        const result = workloadTimeline([], [], {
          asOf: start,
          rangeStart: end,
          rangeEnd: start,
          defaultAvailability: 100,
          granularity: 'week',
        });
        expect(result.rangeStart <= result.rangeEnd).toBe(true);
        expect(result.currentLoad).toBe(0);
        expect(result.projectedLoad).toBe(0);
        expect(result.segments.every((segment) => segment.load === 0)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  test('a committed row contributes its allocation; a draft adds to projected load', () => {
    fc.assert(
      fc.property(
        rangeArb,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        ({ start, end }, committedAllocation, draftAllocation) => {
          const committed = [{
            id: 'c1',
            allocationPercentage: committedAllocation,
            startDate: start,
            endDate: end,
            status: 'active',
          }];
          const draft = [{
            draftId: 'd1',
            id: 'd1',
            kind: 'CREATE' as const,
            allocationPercentage: draftAllocation,
            startDate: start,
            endDate: end,
            status: null,
            submitState: 'IDLE' as const,
          }];
          const committedOnly = workloadTimeline(committed, [], {
            asOf: start,
            rangeStart: start,
            rangeEnd: end,
            defaultAvailability: 100,
            granularity: 'week',
          });
          expect(committedOnly.currentLoad).toBe(committedAllocation);
          expect(committedOnly.projectedLoad).toBe(committedAllocation);

          const projected = workloadTimeline(committed, draft, {
            asOf: start,
            rangeStart: start,
            rangeEnd: end,
            defaultAvailability: 100,
            granularity: 'week',
          });
          expect(projected.currentLoad).toBe(committedAllocation);
          expect(projected.projectedLoad).toBe(committedAllocation + draftAllocation);
        }
      ),
      { numRuns: 200 }
    );
  });
});
