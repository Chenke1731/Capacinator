import { describe, test, expect } from '@jest/globals';
import {
  WORKDAYS_PER_MONTH,
  HOURS_PER_WORKDAY,
  workdaysBetween,
  workMonths,
  displayWorkMonths,
  intersectDateRange,
  monthBuckets,
  demandHoursInWindow
} from '../../../../src/server/services/calc/workCalendar';
import { DemandCalculationService } from '../../../../src/server/services/demand/DemandCalculationService';

/**
 * IP-02a / C01–C04: 统一时间口径的共享原语。
 * 已裁决规则: 含两端、周末剔除、同日=1、8小时/工作日、21.75 折算、
 * 中间精度保留(展示才舍入)、按月真实工作日守恒、先交窗口再算工时。
 */
describe('workCalendar (统一工作日历原语)', () => {
  test('C01: 同一工作日起止 = 1 个工作日', () => {
    expect(workdaysBetween('2026-01-30', '2026-01-30')).toBe(1); // 周五
  });

  test('纯周末区间 = 0,除零保护不制造工作日', () => {
    expect(workdaysBetween('2026-01-31', '2026-01-31')).toBe(0); // 周六
    expect(workdaysBetween('2026-01-31', '2026-02-01')).toBe(0); // 周六~周日
  });

  test('C02 窗口: 01-30(周五)~02-02(周一) = 2 个工作日', () => {
    expect(workdaysBetween('2026-01-30', '2026-02-02')).toBe(2);
  });

  test('C03/C04 基准: 2026-01 全月 = 22 个工作日', () => {
    expect(workdaysBetween('2026-01-01', '2026-01-31')).toBe(22);
  });

  test('C04: 工作月 = 22/21.75,中间精度不先舍入', () => {
    expect(WORKDAYS_PER_MONTH).toBe(21.75);
    expect(workMonths(22)).toBeCloseTo(22 / 21.75, 12);
    expect(workMonths(22)).not.toBe(1.01); // 1.011494... 不能提前变 1.01
    expect(displayWorkMonths(22)).toBe(1.01);
  });

  test('monthBuckets 按月真实工作日分摊且总和守恒 (C02)', () => {
    const buckets = monthBuckets('2026-01-30', '2026-02-02');
    expect(buckets).toEqual([
      { month: '2026-01', workdays: 1 },
      { month: '2026-02', workdays: 1 }
    ]);
    const sum = buckets.reduce((s, b) => s + b.workdays, 0);
    expect(sum).toBe(workdaysBetween('2026-01-30', '2026-02-02'));
  });

  test('monthBuckets 跨整月守恒 (C03 反向核对)', () => {
    const buckets = monthBuckets('2026-01-01', '2026-02-28');
    expect(buckets).toEqual([
      { month: '2026-01', workdays: 22 },
      { month: '2026-02', workdays: 20 }
    ]);
  });

  test('intersectDateRange: 相交裁剪、无相交为 null、单边窗口', () => {
    expect(intersectDateRange('2026-01-01', '2026-03-31', '2026-01-01', '2026-01-31'))
      .toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(intersectDateRange('2026-01-10', '2026-03-31', '2026-01-01', '2026-01-31'))
      .toEqual({ start: '2026-01-10', end: '2026-01-31' });
    expect(intersectDateRange('2026-02-01', '2026-03-31', '2026-01-01', '2026-01-31')).toBeNull();
    // 查询窗口缺省 → 原区间
    expect(intersectDateRange('2026-01-30', '2026-02-02', undefined, undefined))
      .toEqual({ start: '2026-01-30', end: '2026-02-02' });
    // 2026-01-01~03-31 与 01-05~02-10 相交 → 01-05~02-10
    expect(intersectDateRange('2026-01-01', '2026-03-31', '2026-01-05', '2026-02-10'))
      .toEqual({ start: '2026-01-05', end: '2026-02-10' });
  });

  test('demandHoursInWindow: 分配×相交工作日×8,无相交为 0 (C03 核心)', () => {
    // 100% 分配覆盖 1–3 月,只查 1 月 → 22×8=176 小时,不是整个季度
    expect(demandHoursInWindow(100, '2026-01-01', '2026-03-31', '2026-01-01', '2026-01-31')).toBe(176);
    // 50% 分配
    expect(demandHoursInWindow(50, '2026-01-01', '2026-03-31', '2026-01-01', '2026-01-31')).toBe(88);
    // 窗口外
    expect(demandHoursInWindow(100, '2026-02-01', '2026-03-31', '2026-01-01', '2026-01-31')).toBe(0);
    expect(HOURS_PER_WORKDAY).toBe(8);
  });
});

describe('DemandCalculationService 统一后行为 (C01–C03)', () => {
  const service = new DemandCalculationService(null as any); // 纯方法不触库

  test('C01: calculateWorkDays 同日 = 1 (与迭代口径一致)', () => {
    expect(service.calculateWorkDays('2026-01-30', '2026-01-30')).toBe(1);
  });

  test('C02: 100% 分配 01-30~02-02 → 两月各 8 小时,共 16', () => {
    const timeline = service.calculateTimelineFromDemands(
      [{ project_id: 'p1', role_id: 'r1', allocation_percentage: 100, start_date: '2026-01-30', end_date: '2026-02-02' }],
      undefined,
      undefined
    );
    expect(timeline).toEqual([
      expect.objectContaining({ month: '2026-01', total_hours: 8 }),
      expect.objectContaining({ month: '2026-02', total_hours: 8 })
    ]);
  });

  test('C03: 分配覆盖 1–3 月,查询窗口 1 月 → 只计 176 小时', () => {
    const timeline = service.calculateTimelineFromDemands(
      [{ project_id: 'p1', role_id: 'r1', allocation_percentage: 100, start_date: '2026-01-01', end_date: '2026-03-31' }],
      '2026-01-01',
      '2026-01-31'
    );
    expect(timeline).toEqual([
      expect.objectContaining({ month: '2026-01', total_hours: 176 })
    ]);
  });
});
