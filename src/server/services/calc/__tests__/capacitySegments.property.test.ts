/**
 * Property tests for segmented capacity (I19f).
 *
 * Invariants: an empty window has zero load, a single full-window allocation
 * shows up as peak load, conflict is exactly load > capacity, and a full-window
 * zero-availability override yields zero effective work months.
 */
import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  evaluateWindowCapacity,
  segmentedWorkMonths,
} from '../capacitySegments.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);
const isoFromOffset = (offset: number) => new Date(EPOCH + offset * DAY_MS).toISOString().slice(0, 10);
const dateArb = fc.integer({ min: 0, max: 3650 }).map(isoFromOffset);

const orderedPair = fc.tuple(dateArb, dateArb).map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [string, string]);

describe('capacitySegments properties', () => {
  test('empty allocations have zero peak and no conflict', () => {
    fc.assert(
      fc.property(orderedPair, fc.integer({ min: 0, max: 150 }), ([start, end], availability) => {
        const result = evaluateWindowCapacity({
          window: { start, end },
          defaultAvailabilityPct: availability,
          overrides: [],
          allocations: [],
        });
        expect(result.peakLoadPct).toBe(0);
        expect(result.hasConflict).toBe(false);
        expect(result.overloadSegments).toHaveLength(0);
        expect(result.minCapacityPct).toBe(availability);
        for (const segment of result.segments) {
          expect(segment.start >= start).toBe(true);
          expect(segment.end <= end).toBe(true);
          expect(segment.loadPct).toBe(0);
        }
      }),
      { numRuns: 300 }
    );
  });

  test('a full-window allocation is peak load, conflict iff allocation > capacity', () => {
    fc.assert(
      fc.property(orderedPair, fc.integer({ min: 0, max: 200 }), ([start, end], allocation) => {
        const capacity = 100;
        const result = evaluateWindowCapacity({
          window: { start, end },
          defaultAvailabilityPct: capacity,
          overrides: [],
          allocations: [{ start: null, end: null, allocation }],
        });
        expect(result.peakLoadPct).toBe(allocation);
        expect(result.hasConflict).toBe(allocation > capacity);
        expect(result.overloadSegments.length > 0).toBe(allocation > capacity);
      }),
      { numRuns: 300 }
    );
  });

  test('a full-window zero-availability override yields zero effective work months', () => {
    fc.assert(
      fc.property(orderedPair, ([start, end]) => {
        const workMonths = segmentedWorkMonths(
          { start, end },
          100,
          [{ start, end, availability_percentage: 0 }]
        );
        expect(workMonths).toBe(0);
      }),
      { numRuns: 300 }
    );
  });
});
