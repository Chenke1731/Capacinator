import { describe, test, expect } from '@jest/globals';
import { evaluateWindowCapacity } from '../../../../src/server/services/calc/capacitySegments';

/**
 * IP-03a / C06–C09 容量判定纯原语：
 * 按日期边界分段——每段容量(默认可用率×已批准覆盖,重叠取最小)对每段负荷(区间相交求和),
 * 峰值=段负荷最大值;超载按段报告。区间相交≠整体求和(C07)。
 */
describe('evaluateWindowCapacity (分段容量判定)', () => {
  const window = { start: '2026-01-01', end: '2026-01-31' };

  test('C07: 错峰两段 50% + 新增整月 50% → 峰值 100,零超载', () => {
    const r = evaluateWindowCapacity({
      window,
      defaultAvailabilityPct: 100,
      overrides: [],
      allocations: [
        { start: '2026-01-01', end: '2026-01-15', allocation: 50 },
        { start: '2026-01-16', end: '2026-01-31', allocation: 50 },
        { start: '2026-01-01', end: '2026-01-31', allocation: 50 }
      ]
    });
    expect(r.peakLoadPct).toBe(100);
    expect(r.overloadSegments).toEqual([]);
    expect(r.hasConflict).toBe(false);
    // 两段不共享 01-15 端点:分段边界在 01-15/01-16 切开
    expect(r.segments.length).toBeGreaterThanOrEqual(2);
  });

  test('真正并发超载:同窗 80%+30% → 峰值 110,超载段可报告', () => {
    const r = evaluateWindowCapacity({
      window,
      defaultAvailabilityPct: 100,
      overrides: [],
      allocations: [
        { start: '2026-01-01', end: '2026-01-31', allocation: 80 },
        { start: '2026-01-01', end: '2026-01-31', allocation: 30 }
      ]
    });
    expect(r.peakLoadPct).toBe(110);
    expect(r.hasConflict).toBe(true);
    expect(r.overloadSegments[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-31', loadPct: 110, capacityPct: 100 });
  });

  test('C09: 已批准覆盖可用率 0 → 容量 0,任何负荷都是缺口', () => {
    const r = evaluateWindowCapacity({
      window,
      defaultAvailabilityPct: 100,
      overrides: [{ start: '2026-01-01', end: '2026-01-31', availability_percentage: 0 }],
      allocations: [{ start: '2026-01-01', end: '2026-01-31', allocation: 25 }]
    });
    expect(r.segments[0].capacityPct).toBe(0);
    expect(r.hasConflict).toBe(true);
    expect(r.overloadSegments[0].capacityPct).toBe(0);
  });

  test('C06 部分休假:窗口半月覆盖 0,其余默认 → 分段容量', () => {
    const r = evaluateWindowCapacity({
      window: { start: '2026-01-01', end: '2026-02-28' },
      defaultAvailabilityPct: 100,
      overrides: [{ start: '2026-01-01', end: '2026-01-31', availability_percentage: 0 }],
      allocations: []
    });
    const jan = r.segments.find((s) => s.start === '2026-01-01');
    const feb = r.segments.find((s) => s.start === '2026-02-01');
    expect(jan?.capacityPct).toBe(0);
    expect(feb?.capacityPct).toBe(100);
  });

  test('覆盖重叠取最小(公开假设,保守)', () => {
    const r = evaluateWindowCapacity({
      window,
      defaultAvailabilityPct: 100,
      overrides: [
        { start: '2026-01-01', end: '2026-01-31', availability_percentage: 80 },
        { start: '2026-01-10', end: '2026-01-20', availability_percentage: 40 }
      ],
      allocations: []
    });
    expect(r.segments.find((s) => s.start === '2026-01-10')?.capacityPct).toBe(40);
    expect(r.segments.find((s) => s.start === '2026-01-01')?.capacityPct).toBe(80);
    expect(r.segments.find((s) => s.start === '2026-01-21')?.capacityPct).toBe(80);
  });

  test('无日期分配按全窗口计负荷(与 overlapMonths 语义一致)', () => {
    const r = evaluateWindowCapacity({
      window,
      defaultAvailabilityPct: 100,
      overrides: [],
      allocations: [{ start: null, end: null, allocation: 60 }]
    });
    expect(r.peakLoadPct).toBe(60);
  });

  test('窗口外的分配/覆盖不参与', () => {
    const r = evaluateWindowCapacity({
      window,
      defaultAvailabilityPct: 100,
      overrides: [{ start: '2025-12-01', end: '2025-12-31', availability_percentage: 0 }],
      allocations: [{ start: '2026-02-01', end: '2026-02-10', allocation: 100 }]
    });
    expect(r.peakLoadPct).toBe(0);
    expect(r.segments.every((s) => s.capacityPct === 100)).toBe(true);
  });
});
