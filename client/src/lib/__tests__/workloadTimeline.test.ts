/**
 * workloadTimeline 计算契约测试（工作台 v2 设计 §9.2 / §18 容量验收）。
 * 覆盖：日边界分段、EDIT/REPLACE 覆盖不双算、SUCCEEDED/UNKNOWN 只计一次、
 * 周/月桶 peak（相邻不重叠不求和）、approved-only override、相对利用率轴、
 * paused 不计、undated 全窗、可用率缺失/0。
 */
import {
  workloadTimeline,
  type CommittedTimelineRow,
  type DraftTimelineRow,
  type AvailabilityOverrideInput,
} from '../workloadTimeline';

const AS_OF = '2026-11-01';
const RANGE = { rangeStart: '2026-11-01', rangeEnd: '2026-11-30', asOf: AS_OF };

function committed(id: string, allocation: number, start: string | null, end: string | null, status = 'active'): CommittedTimelineRow {
  return { id, allocationPercentage: allocation, startDate: start, endDate: end, status };
}

function draft(draftId: string, allocation: number, start: string | null, end: string | null, extra: Partial<DraftTimelineRow> = {}): DraftTimelineRow {
  return {
    id: draftId,
    draftId,
    kind: 'CREATE',
    allocationPercentage: allocation,
    startDate: start,
    endDate: end,
    submitState: 'IDLE',
    ...extra,
  };
}

describe('workloadTimeline 分段与基准负荷', () => {
  test('按分配起止日切成日边界分段，每段负荷恒定', () => {
    const result = workloadTimeline(
      [committed('a1', 40, '2026-11-01', '2026-11-10'), committed('a2', 50, '2026-11-11', '2026-11-20')],
      [],
      RANGE
    );
    expect(result.segments.map((s) => [s.start, s.end, s.load])).toEqual([
      ['2026-11-01', '2026-11-10', 40],
      ['2026-11-11', '2026-11-20', 50],
      ['2026-11-21', '2026-11-30', 0],
    ]);
  });

  test('闭区间相交：前一段 end 当天与后一段 start 同日并存', () => {
    const result = workloadTimeline(
      [
        committed('a1', 30, '2026-11-01', '2026-11-10'),
        committed('a2', 20, '2026-11-10', '2026-11-12'),
      ],
      [],
      RANGE
    );
    const boundary = result.segments.find((s) => s.start === '2026-11-10');
    expect(boundary).toBeDefined();
    expect(boundary!.load).toBe(50);
    expect(boundary!.contributors).toHaveLength(2);
  });

  test('paused 不计入负荷但保留在 contributions', () => {
    const result = workloadTimeline(
      [committed('a1', 40, '2026-11-01', '2026-11-30'), committed('p1', 30, '2026-11-01', '2026-11-30', 'paused')],
      [],
      RANGE
    );
    expect(result.segments[0].load).toBe(40);
    expect(result.contributions.find((c) => c.id === 'p1')).toBeDefined();
    expect(result.contributions.find((c) => c.id === 'p1')!.status).toBe('paused');
  });

  test('undated active 视为覆盖全时间轴', () => {
    const result = workloadTimeline([committed('u1', 25, null, null)], [], RANGE);
    expect(result.segments[0].load).toBe(25);
    expect(result.segments.at(-1)!.load).toBe(25);
  });

  test('半开日期：只有 start 时向后覆盖到范围末端', () => {
    const result = workloadTimeline([committed('h1', 10, '2026-11-15', null)], [], RANGE);
    const before = result.segments.find((s) => s.start === '2026-11-01');
    const after = result.segments.find((s) => s.start === '2026-11-15');
    expect(before!.load).toBe(0);
    expect(after!.load).toBe(10);
  });
});

describe('workloadTimeline 草稿投影（§9.2.3 / §9.2.4）', () => {
  test('CREATE 草稿进入投影：currentLoad 不变，projectedLoad 叠加', () => {
    const result = workloadTimeline(
      [committed('a1', 60, '2026-11-01', '2026-11-30')],
      [draft('g1', 20, '2026-11-01', '2026-11-20')],
      RANGE
    );
    expect(result.currentLoad).toBe(60);
    expect(result.projectedLoad).toBe(80);
    const mid = result.segments.find((s) => s.start === '2026-11-01');
    expect(mid!.load).toBe(80);
  });

  test('EDIT 覆盖原行：不出现"原行 + 新行"双算', () => {
    const result = workloadTimeline(
      [committed('a1', 60, '2026-11-01', '2026-11-30')],
      [
        {
          ...draft('g1', 30, '2026-11-01', '2026-11-30', { kind: 'EDIT' }),
          targetAssignmentId: 'a1',
        },
      ],
      RANGE
    );
    expect(result.projectedLoad).toBe(30);
    expect(result.segments[0].contributors).toHaveLength(1);
    expect(result.contributions.find((c) => c.id === 'a1')).toBeUndefined();
  });

  test('REPLACE 扣除 incumbent 原行再加新行', () => {
    const result = workloadTimeline(
      [
        committed('a1', 50, '2026-11-01', '2026-11-30'),
        committed('a2', 20, '2026-11-01', '2026-11-30'),
      ],
      [
        {
          ...draft('g1', 40, '2026-11-01', '2026-11-30', { kind: 'REPLACE' }),
          targetAssignmentId: 'a1',
        },
      ],
      RANGE
    );
    expect(result.projectedLoad).toBe(60); // 40 (REPLACE) + 20 (a2)
  });

  test('SUCCEEDED 草稿已并入 committed 读侧，不再计入投影', () => {
    const result = workloadTimeline(
      [committed('a1', 60, '2026-11-01', '2026-11-30')],
      [draft('g1', 20, '2026-11-01', '2026-11-30', { submitState: 'SUCCEEDED' })],
      RANGE
    );
    expect(result.projectedLoad).toBe(60);
  });

  test('UNKNOWN 草稿锁定后不计入可编辑投影', () => {
    const result = workloadTimeline(
      [committed('a1', 60, '2026-11-01', '2026-11-30')],
      [draft('g1', 20, '2026-11-01', '2026-11-30', { submitState: 'UNKNOWN' })],
      RANGE
    );
    expect(result.projectedLoad).toBe(60);
  });

  test('SUBMITTING 冻结参数仍计入投影', () => {
    const result = workloadTimeline(
      [],
      [draft('g1', 20, '2026-11-01', '2026-11-30', { submitState: 'SUBMITTING' })],
      RANGE
    );
    expect(result.projectedLoad).toBe(20);
  });
});

describe('workloadTimeline 桶聚合（§9.2.5）', () => {
  test('相邻但不重叠的分配不得被周桶求和成同时超载（peak 而非 sum）', () => {
    // 周一 2026-11-02 所在周：前半周 80%，后半周 80%，峰值 80 而不是 160
    const result = workloadTimeline(
      [
        committed('a1', 80, '2026-11-02', '2026-11-04'),
        committed('a2', 80, '2026-11-05', '2026-11-08'),
      ],
      [],
      { ...RANGE, defaultAvailability: 100, granularity: 'week' }
    );
    const week = result.buckets.find((b) => b.start === '2026-11-02');
    expect(week).toBeDefined();
    expect(week!.peakLoad).toBe(80);
    expect(week!.relativeUtilization).toBe(80);
    expect(week!.overloaded).toBe(false);
  });

  test('同周真实叠加取峰值并标记超载', () => {
    const result = workloadTimeline(
      [
        committed('a1', 80, '2026-11-02', '2026-11-06'),
        committed('a2', 40, '2026-11-04', '2026-11-06'),
      ],
      [],
      { ...RANGE, defaultAvailability: 100, granularity: 'week' }
    );
    const week = result.buckets.find((b) => b.start === '2026-11-02');
    expect(week!.peakLoad).toBe(120);
    expect(week!.overloaded).toBe(true);
  });

  test('月桶按月 key 聚合', () => {
    const result = workloadTimeline(
      [committed('a1', 50, '2026-11-01', '2026-11-30')],
      [],
      { ...RANGE, defaultAvailability: 100, granularity: 'month' }
    );
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].key).toBe('2026-11');
    expect(result.buckets[0].relativeUtilization).toBe(50);
  });

  test('日桶逐日给出相对利用率', () => {
    const result = workloadTimeline(
      [committed('a1', 30, '2026-11-03', '2026-11-04')],
      [],
      { ...RANGE, defaultAvailability: 100, granularity: 'day' }
    );
    expect(result.buckets.find((b) => b.key === '2026-11-02')!.relativeUtilization).toBe(0);
    expect(result.buckets.find((b) => b.key === '2026-11-03')!.relativeUtilization).toBe(30);
    expect(result.buckets.find((b) => b.key === '2026-11-05')!.relativeUtilization).toBe(0);
  });
});

describe('workloadTimeline 可用率口径（§9.2.6 / §9.2.7）', () => {
  test('相对利用率轴：非 100 可用率下 100% 线是相对阈值', () => {
    const result = workloadTimeline(
      [committed('a1', 40, '2026-11-01', '2026-11-30')],
      [],
      { ...RANGE, defaultAvailability: 50 }
    );
    expect(result.segments[0].relativeUtilization).toBe(80);
    expect(result.segments[0].overloaded).toBe(false);
    expect(result.currentRelativeUtilization).toBe(80);
  });

  test('可用率缺失：负荷仍计算，相对利用率为 null（不伪造）', () => {
    const result = workloadTimeline(
      [committed('a1', 40, '2026-11-01', '2026-11-30')],
      [],
      { ...RANGE, defaultAvailability: null }
    );
    expect(result.segments[0].load).toBe(40);
    expect(result.segments[0].relativeUtilization).toBeNull();
    expect(result.segments[0].availability).toBeNull();
    expect(result.overloadSegments).toHaveLength(0);
  });

  test('可用率 0：无可用容量，相对利用率为 null', () => {
    const result = workloadTimeline(
      [committed('a1', 40, '2026-11-01', '2026-11-30')],
      [],
      { ...RANGE, defaultAvailability: 0 }
    );
    expect(result.segments[0].availability).toBe(0);
    expect(result.segments[0].relativeUtilization).toBeNull();
  });

  test('只取 is_approved=1 的 override：未批准不参与容量线', () => {
    const overrides: AvailabilityOverrideInput[] = [
      { start: '2026-11-01', end: '2026-11-15', percentage: 50, isApproved: true },
      { start: '2026-11-16', end: '2026-11-30', percentage: 20, isApproved: false },
    ];
    const result = workloadTimeline(
      [committed('a1', 50, '2026-11-01', '2026-11-30')],
      [],
      { ...RANGE, defaultAvailability: 100, availabilityOverrides: overrides }
    );
    const firstHalf = result.segments.find((s) => s.start === '2026-11-01');
    const secondHalf = result.segments.find((s) => s.start === '2026-11-16');
    expect(firstHalf!.availability).toBe(50);
    expect(firstHalf!.relativeUtilization).toBe(100);
    expect(secondHalf!.availability).toBe(100); // 未批准被忽略，回默认
  });

  test('override 边界参与分段：override 起止日切换可用率', () => {
    const result = workloadTimeline(
      [],
      [],
      {
        ...RANGE,
        defaultAvailability: 100,
        availabilityOverrides: [{ start: '2026-11-10', end: '2026-11-20', percentage: 50, isApproved: true }],
      }
    );
    expect(result.segments.map((s) => [s.start, s.end, s.availability])).toEqual([
      ['2026-11-01', '2026-11-09', 100],
      ['2026-11-10', '2026-11-20', 50],
      ['2026-11-21', '2026-11-30', 100],
    ]);
  });

  test('同日多条 approved override 取 start 最新一条', () => {
    const result = workloadTimeline(
      [],
      [],
      {
        ...RANGE,
        defaultAvailability: 100,
        availabilityOverrides: [
          { start: '2026-11-01', end: '2026-11-30', percentage: 80, isApproved: true },
          { start: '2026-11-05', end: '2026-11-30', percentage: 40, isApproved: true },
        ],
      }
    );
    expect(result.segments.find((s) => s.start === '2026-11-05')!.availability).toBe(40);
    expect(result.segments.find((s) => s.start === '2026-11-01')!.availability).toBe(80);
  });
});

describe('workloadTimeline 输出形态', () => {
  test('overloadSegments 只含相对超载段', () => {
    const result = workloadTimeline(
      [committed('a1', 120, '2026-11-05', '2026-11-10')],
      [],
      { ...RANGE, defaultAvailability: 100 }
    );
    expect(result.overloadSegments.map((s) => s.start)).toEqual(['2026-11-05']);
  });

  test('projectedRelativeUtilization 与 currentRelativeUtilization 支撑"当前→预计"', () => {
    const result = workloadTimeline(
      [committed('a1', 60, '2026-11-01', '2026-11-30')],
      [draft('g1', 20, '2026-11-01', '2026-11-30')],
      { ...RANGE, defaultAvailability: 100 }
    );
    expect(result.currentRelativeUtilization).toBe(60);
    expect(result.projectedRelativeUtilization).toBe(80);
  });

  test('缺 asOf 直接抛错（契约输入）', () => {
    expect(() => workloadTimeline([], [], { asOf: '', rangeStart: '2026-11-01', rangeEnd: '2026-11-30' })).toThrow();
  });

  test('F2：倒置区间按 min/max 归一（原语 total——实时预览逐键中间态不得崩）', () => {
    // 用户把开始日临时改到结束日之后：不抛错，载荷按 [11-01, 11-30] 计算
    const result = workloadTimeline(
      [committed('a1', 40, '2026-11-10', '2026-11-20')],
      [],
      { asOf: '2026-11-01', rangeStart: '2026-11-30', rangeEnd: '2026-11-01' }
    );
    expect(result.rangeStart).toBe('2026-11-01');
    expect(result.rangeEnd).toBe('2026-11-30');
    expect(result.segments.some((segment) => segment.load === 40)).toBe(true);
    // 语义等价于正序输入
    const ordered = workloadTimeline(
      [committed('a1', 40, '2026-11-10', '2026-11-20')],
      [],
      { asOf: '2026-11-01', rangeStart: '2026-11-01', rangeEnd: '2026-11-30' }
    );
    expect(JSON.stringify(result)).toBe(JSON.stringify(ordered));
  });
});
