import { describe, test, expect } from '@jest/globals';
import { utilizationTier } from '../utilizationTier.js';

/** 与视图 069/070 判档同构的边界守卫(漂移即红) */
describe('utilizationTier(与视图同构)', () => {
  test('可用率 0 → Unavailable(不看分配)', () => {
    expect(utilizationTier(150, 0)).toBe('Unavailable');
  });
  test('ratio 严格大于 100 才超载: 100/100 满载不超', () => {
    expect(utilizationTier(100, 100)).toBe('Fully-allocated');
    expect(utilizationTier(100.1, 100)).toBe('Over-allocated');
  });
  test('低可用超载: 80/50 = 160% → Over', () => {
    expect(utilizationTier(80, 50)).toBe('Over-allocated');
  });
  test('80 线含等号: 80/100 → Fully', () => {
    expect(utilizationTier(80, 100)).toBe('Fully-allocated');
    expect(utilizationTier(79.9, 100)).toBe('Partially-allocated');
  });
  test('零分配 → Available; 正分配 → Partially', () => {
    expect(utilizationTier(0, 100)).toBe('Available');
    expect(utilizationTier(1, 100)).toBe('Partially-allocated');
  });
});
