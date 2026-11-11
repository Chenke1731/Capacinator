/**
 * I02b：KPI 口径与深链映射测试（D2/Q5/G4）。
 * - 比例型 KPI 分母用利用率行（在用人口），含停用人员时不得被稀释
 * - KPI → 目标页映射（真参数），资源效率不回落到超载筛选
 */
import { describe, test, expect } from '@jest/globals';
import {
  KPI_NAVIGATION,
  calculateResourceEfficiency,
  calculateAllocationAccuracy,
} from '../EnhancedKPIs';

const base = {
  summary: { projects: 1, people: 12, roles: 1 },
  projectHealth: {},
  capacityGaps: {},
} as any;

describe('EnhancedKPIs 口径（I02b/D2）', () => {
  test('资源效率/准确率分母=利用率行（在用 10），不因 2 名停用人员稀释', () => {
    const dashboard = {
      ...base,
      // 在用 10（9 满载 + 1 可用）；全量 people=12（2 停用）
      utilization: { FULLY_ALLOCATED: 9, AVAILABLE: 1 },
    };
    expect(calculateResourceEfficiency(dashboard)).toBe(90); // 9/10
    expect(calculateAllocationAccuracy(dashboard)).toBe(100); // (10-0)/10
  });

  test('有超载时准确率按在用人口扣减（1 超载/10 在用 → 90%）', () => {
    const dashboard = {
      ...base,
      utilization: { OVER_ALLOCATED: 1, FULLY_ALLOCATED: 9 },
    };
    expect(calculateAllocationAccuracy(dashboard)).toBe(90); // (10-1)/10
    expect(calculateResourceEfficiency(dashboard)).toBe(85); // (9-0.5)/10
  });

  test('无利用率行时不除零', () => {
    const dashboard = { ...base, utilization: {} };
    expect(calculateResourceEfficiency(dashboard)).toBe(0);
    expect(calculateAllocationAccuracy(dashboard)).toBe(0);
  });
});

describe('KPI 深链映射（I02b/U25+D5）', () => {
  test('映射表为真参数且资源效率承接全量名册', () => {
    expect(KPI_NAVIGATION.allocationAccuracy).toBe('/people?status=over-allocated');
    expect(KPI_NAVIGATION.resourceEfficiency).toBe('/people');
    expect(KPI_NAVIGATION.projectHealth).toBe('/projects');
    expect(KPI_NAVIGATION.capacityBurnRate).toBe('/reports?tab=capacity');
  });
});
