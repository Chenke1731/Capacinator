import { describe, test, expect } from '@jest/globals';
import { quarterOf, workdaysBetween, monthsOf, intensityPct } from '../../../../src/server/services/iteration/IterationStats';

/** 迭代统计口径(设计 §0.3): 工作月 21.75;季度派生;防爆表强度 */
describe('IterationStats (纯函数)', () => {
  test('quarterOf 派生季度标签', () => {
    expect(quarterOf('2026-11-01')).toBe('26.RP4');
    expect(quarterOf('2026-01-15')).toBe('26.RP1');
    expect(quarterOf('2027-07-01')).toBe('27.RP3');
  });

  test('workdaysBetween 剔除周末且防除零', () => {
    expect(workdaysBetween('2026-11-02', '2026-11-06')).toBe(5);   // 周一~周五
    expect(workdaysBetween('2026-11-07', '2026-11-08')).toBe(1);   // 纯周末 → 兜底 1
    expect(workdaysBetween('2026-11-01', '2026-11-30')).toBe(21);  // 门户11月演示口径
  });

  test('monthsOf 工作月折算', () => {
    expect(monthsOf('2026-11-01', '2026-11-30')).toBeCloseTo(0.97, 1);
  });

  test('intensityPct 防爆表口径: 1.2 人月 ÷ ~0.97 月 ≈ 124%', () => {
    const pct = intensityPct(1.2, '2026-11-01', '2026-11-30');
    expect(pct).toBeGreaterThanOrEqual(120);
    expect(pct).toBeLessThanOrEqual(125);
    expect(intensityPct(0, '2026-11-01', '2026-11-30')).toBe(0);
  });
});
