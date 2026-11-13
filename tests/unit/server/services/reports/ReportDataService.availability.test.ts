/**
 * I02d：Dashboard availability 四档计数。
 *
 * 背景：calculateAvailability 只返回 AVAILABLE/ASSIGNED，Dashboard 的
 * "休假中/产能受限" 恒 undefined→0（假 0）。新增：
 *  - UNAVAILABLE = 视图 utilization_status 'Unavailable'（可用率 0）
 *  - LIMITED = 0 < current_availability_percentage < 100（与 AVAILABLE/
 *    ASSIGNED 正交：低可用率但无分配的人仍算 Available，同时算 Limited）
 * 既有 AVAILABLE/ASSIGNED 语义不变。
 */
import { describe, test, expect } from '@jest/globals';
import { ReportDataService } from '../../../../../src/server/services/reports/ReportDataService';

function availabilityFor(rows: Array<Record<string, unknown>>) {
  const service = new ReportDataService({} as any);
  return (service as any).calculateAvailability(rows);
}

describe('ReportDataService.calculateAvailability（I02d）', () => {
  test('Unavailable 与 Limited 分档互斥，AVAILABLE/ASSIGNED 口径保持', () => {
    const result = availabilityFor([
      { utilization_status: 'Available', current_availability_percentage: 100 },
      { utilization_status: 'Available', current_availability_percentage: 50 },
      { utilization_status: 'Partially-allocated', current_availability_percentage: 80 },
      { utilization_status: 'Fully-allocated', current_availability_percentage: 100 },
      { utilization_status: 'Unavailable', current_availability_percentage: 0 },
    ]);

    expect(result).toEqual({
      AVAILABLE: 2, // Available 状态两人（100% 与 50%），既有口径不变
      ASSIGNED: 3, // 非 Available 状态三人（含 Unavailable）
      UNAVAILABLE: 1,
      LIMITED: 2, // 50% 与 80%；0% 不重复计入
    });
  });

  test('缺列/非法可用率不产生 LIMITED 假阳性', () => {
    const result = availabilityFor([
      { utilization_status: 'Available' }, // 无 current_availability_percentage
      { utilization_status: 'Available', current_availability_percentage: null },
      { utilization_status: 'Available', current_availability_percentage: 'not-a-number' },
      { utilization_status: 'Available', current_availability_percentage: 0 },
    ]);
    expect(result.UNAVAILABLE).toBe(0);
    // 缺列回退 100（视图真身一定有值），null ≈ 0 但状态不是 Unavailable：
    // 明确不把缺失/非法值当"产能受限"
    expect(result.LIMITED).toBe(0);
  });

  test('空数据返回全零四档', () => {
    expect(availabilityFor([])).toEqual({
      AVAILABLE: 0,
      ASSIGNED: 0,
      UNAVAILABLE: 0,
      LIMITED: 0,
    });
  });
});
