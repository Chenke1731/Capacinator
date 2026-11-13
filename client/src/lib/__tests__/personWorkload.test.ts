import { summarizePersonWorkload, workloadDateOnly } from '../personWorkload';

type Row = {
  id: string;
  allocation_percentage: number;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  computed_start_date?: string | null;
  computed_end_date?: string | null;
};

const row = (overrides: Partial<Row> = {}): Row => ({
  id: overrides.id ?? 'a',
  allocation_percentage: 20,
  status: 'active',
  start_date: '2026-03-01',
  end_date: '2026-03-31',
  computed_start_date: null,
  computed_end_date: null,
  ...overrides,
});

describe('summarizePersonWorkload', () => {
  test('current = active rows intersecting asOf; undated is ongoing', () => {
    const summary = summarizePersonWorkload(
      [
        row({ id: 'current', start_date: '2026-03-01', end_date: '2026-03-31' }),
        row({ id: 'undated', start_date: null, end_date: null }),
        row({ id: 'paused', status: 'paused' }),
        row({ id: 'future', start_date: '2026-04-01', end_date: '2026-04-30' }),
        row({ id: 'ended', start_date: '2026-01-01', end_date: '2026-01-31' }),
      ],
      { asOf: '2026-03-15', availability: 100 }
    );

    expect(summary.current.map((item) => item.id)).toEqual(['current', 'undated']);
    expect(summary.excluded.map((item) => [item.assignment.id, item.reason])).toEqual([
      ['paused', 'paused'],
      ['future', 'future'],
      ['ended', 'ended'],
    ]);
    expect(summary.totalAllocation).toBe(40);
    expect(summary.excludedAllocation).toBe(60);
    expect(summary.excludedCounts).toEqual({ paused: 1, future: 1, ended: 1 });
    expect(summary.status).toBe('partial');
  });

  test('boundary dates are inclusive and computed dates win over raw', () => {
    const summary = summarizePersonWorkload(
      [
        row({ id: 'start-boundary', start_date: '2026-03-15', end_date: '2026-03-15' }),
        row({
          id: 'computed-future',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          computed_start_date: '2026-04-01',
          computed_end_date: '2026-04-30',
        }),
      ],
      { asOf: '2026-03-15', availability: 100 }
    );

    expect(summary.current.map((item) => item.id)).toEqual(['start-boundary']);
    expect(summary.excluded[0]).toMatchObject({ reason: 'future' });
  });

  test('availability 50 → relative utilization uses availability denominator', () => {
    const summary = summarizePersonWorkload([row({ allocation_percentage: 30 })], {
      asOf: '2026-03-15',
      availability: 50,
    });
    expect(summary.relativeUtilization).toBe(60);
    expect(summary.remainingCapacity).toBe(20);
    expect(summary.status).toBe('partial');
  });

  test('availability 0 is unavailable, not normal 0%', () => {
    const summary = summarizePersonWorkload([row({ allocation_percentage: 30 })], {
      asOf: '2026-03-15',
      availability: 0,
    });
    expect(summary.availability).toBe(0);
    expect(summary.relativeUtilization).toBeNull();
    expect(summary.remainingCapacity).toBe(-30);
    expect(summary.status).toBe('unavailable');
  });

  test('missing availability stays unknown (no 100 fallback)', () => {
    const summary = summarizePersonWorkload([row({ allocation_percentage: 30 })], {
      asOf: '2026-03-15',
    });
    expect(summary.availability).toBeNull();
    expect(summary.relativeUtilization).toBeNull();
    expect(summary.remainingCapacity).toBeNull();
    expect(summary.status).toBe('unknown');
  });

  test('over/full/available thresholds use relative utilization', () => {
    expect(
      summarizePersonWorkload([row({ allocation_percentage: 101 })], { asOf: '2026-03-15', availability: 100 }).status
    ).toBe('over');
    expect(
      summarizePersonWorkload([row({ allocation_percentage: 80 })], { asOf: '2026-03-15', availability: 100 }).status
    ).toBe('full');
    expect(
      summarizePersonWorkload([], { asOf: '2026-03-15', availability: 100 }).status
    ).toBe('available');
  });

  test('workloadDateOnly normalizes ISO datetime/number and rejects garbage', () => {
    expect(workloadDateOnly('2026-03-01')).toBe('2026-03-01');
    expect(workloadDateOnly('2026-03-01T12:00:00Z')).toBe('2026-03-01');
    expect(workloadDateOnly(new Date(2026, 2, 1).getTime())).toBe('2026-03-01');
    expect(workloadDateOnly('not-a-date')).toBeNull();
    expect(workloadDateOnly(null)).toBeNull();
  });

  test('invalid asOf is rejected instead of silently using today', () => {
    expect(() => summarizePersonWorkload([row()], { asOf: 'garbage', availability: 100 })).toThrow(
      /valid asOf/
    );
  });
});
