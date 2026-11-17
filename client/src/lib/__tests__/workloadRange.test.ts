import {
  WORKLOAD_RANGE_MAX_DAYS,
  clampWorkloadRangeEnd,
  validateWorkloadRange,
  workloadGranularity,
  workloadRangeDays,
} from '../workloadRange';

describe('workloadRange', () => {
  test('counts inclusive days and handles leap days', () => {
    expect(workloadRangeDays('2026-01-01', '2026-01-01')).toBe(1);
    expect(workloadRangeDays('2028-02-28', '2028-03-01')).toBe(3);
    expect(workloadRangeDays('2026-01-01', '2026-02-30')).toBeNull();
  });

  test('rejects impossible dates, unsupported years, inversion and overlong windows', () => {
    expect(validateWorkloadRange('2026-02-30', '2026-03-01')).toBe('invalid-start');
    expect(validateWorkloadRange('2026-01-01', '2026-13-01')).toBe('invalid-end');
    expect(validateWorkloadRange('1800-01-01', '1800-12-31')).toBe('invalid-start');
    expect(validateWorkloadRange('2026-03-01', '2026-01-01')).toBe('invalid-order');
    expect(validateWorkloadRange('2010-01-01', '2020-12-31')).toBe('too-long');
    expect(validateWorkloadRange('2026-01-01', '2030-12-31')).toBeNull();
  });

  test('clamps an overlong end to the supported span', () => {
    const end = clampWorkloadRangeEnd('2020-01-01', '2030-01-01');
    expect(workloadRangeDays('2020-01-01', end)).toBe(WORKLOAD_RANGE_MAX_DAYS);
    expect(clampWorkloadRangeEnd('2026-01-01', '2026-12-31')).toBe('2026-12-31');
  });

  test('switches to month buckets beyond 183 days', () => {
    expect(workloadGranularity('2026-01-01', '2026-06-30')).toBe('week');
    expect(workloadGranularity('2026-01-01', '2026-07-04')).toBe('month');
  });
});
