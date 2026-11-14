/**
 * S1 纯函数测试：已提交 fixed bar 拖拽/缩放边界（设计 §4.2，评审 B2）。
 * 覆盖：可拖条件矩阵、move 下限不截断历史、start/end 分边约束、
 * 右端缩放不改开始日、时长保持、闭区间语义。
 */
import {
  canDragCommittedBar,
  computeCommittedDragDates,
  dayNumber,
  isoDate,
} from '../committedBarDrag';

const AS_OF = '2026-11-14';

function bar(overrides: Record<string, unknown> = {}) {
  return {
    dateMode: 'fixed',
    status: 'active',
    startDate: '2026-11-01',
    endDate: '2026-12-31',
    ...overrides,
  } as { dateMode: string; status: string; startDate: string; endDate: string };
}

describe('canDragCommittedBar', () => {
  test('fixed + active + 未结束 → 可拖', () => {
    expect(canDragCommittedBar(bar(), AS_OF)).toBe(true);
  });
  test('paused / phase / project / missing dates → 不可拖', () => {
    expect(canDragCommittedBar(bar({ status: 'paused' }), AS_OF)).toBe(false);
    expect(canDragCommittedBar(bar({ dateMode: 'phase' }), AS_OF)).toBe(false);
    expect(canDragCommittedBar(bar({ dateMode: 'project' }), AS_OF)).toBe(false);
    expect(canDragCommittedBar(bar({ startDate: null }), AS_OF)).toBe(false);
  });
  test('已结束行（end < asOf）不可拖；当天结束可拖', () => {
    expect(canDragCommittedBar(bar({ startDate: '2026-09-01', endDate: '2026-10-31' }), AS_OF)).toBe(false);
    expect(canDragCommittedBar(bar({ startDate: '2026-09-01', endDate: '2026-11-14' }), AS_OF)).toBe(true);
  });
});

describe('computeCommittedDragDates · move', () => {
  test('整体移动 +7 天：起止同移，时长不变', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-10', origEnd: '2026-11-20', mode: 'move', deltaDays: 7, asOf: AS_OF });
    expect(r).toEqual({ startDate: '2026-11-17', endDate: '2026-11-27' });
  });

  test('已开始行（start<asOf）左移：下限=原 start，不截断历史', () => {
    // 原 11-01..12-31（已开始），左移 -30 天：start 不得早于 11-01，整段停住
    const r = computeCommittedDragDates({ origStart: '2026-11-01', origEnd: '2026-12-31', mode: 'move', deltaDays: -30, asOf: AS_OF });
    expect(r.startDate).toBe('2026-11-01');
    expect(r.endDate).toBe('2026-12-31');
    // 时长不变（原 61 天 -> 仍 61 天）
    expect(dayNumber(r.endDate) - dayNumber(r.startDate)).toBe(dayNumber('2026-12-31') - dayNumber('2026-11-01'));
  });

  test('已开始行（start<asOf）不允许向更早扩展：下限=原 start，整段停住', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-10', origEnd: '2026-11-20', mode: 'move', deltaDays: -2, asOf: AS_OF });
    expect(r).toEqual({ startDate: '2026-11-10', endDate: '2026-11-20' });
  });

  test('未来行（start>=asOf）左移下限=asOf', () => {
    const r = computeCommittedDragDates({ origStart: '2026-12-01', origEnd: '2026-12-10', mode: 'move', deltaDays: -30, asOf: AS_OF });
    expect(r.startDate).toBe('2026-11-14');
    expect(dayNumber(r.endDate) - dayNumber(r.startDate)).toBe(9);
  });

  test('右移无上限', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-10', origEnd: '2026-11-20', mode: 'move', deltaDays: 400, asOf: AS_OF });
    expect(dayNumber(r.startDate)).toBe(dayNumber('2026-11-10') + 400);
  });
});

describe('computeCommittedDragDates · start', () => {
  test('左端左移：已开始行下限=原 start（不扩到历史更早）', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-01', origEnd: '2026-11-30', mode: 'start', deltaDays: -5, asOf: AS_OF });
    expect(r).toEqual({ startDate: '2026-11-01', endDate: '2026-11-30' });
  });

  test('未来行左端左移下限=asOf', () => {
    const r = computeCommittedDragDates({ origStart: '2026-12-01', origEnd: '2026-12-10', mode: 'start', deltaDays: -40, asOf: AS_OF });
    expect(r.startDate).toBe(AS_OF);
  });

  test('右端右移夹在结束日：start 不得超过 end', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-01', origEnd: '2026-11-30', mode: 'start', deltaDays: 90, asOf: AS_OF });
    expect(r).toEqual({ startDate: '2026-11-30', endDate: '2026-11-30' });
  });
});

describe('computeCommittedDragDates · end', () => {
  test('右端缩放只改结束日，绝不修改开始日', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-01', origEnd: '2026-12-31', mode: 'end', deltaDays: -20, asOf: AS_OF });
    expect(r.startDate).toBe('2026-11-01');
    expect(r.endDate).toBe('2026-12-11');
  });

  test('右端收缩夹在开始日：end 不得早于 start', () => {
    const r = computeCommittedDragDates({ origStart: '2026-11-01', origEnd: '2026-11-10', mode: 'end', deltaDays: -90, asOf: AS_OF });
    expect(r).toEqual({ startDate: '2026-11-01', endDate: '2026-11-01' });
  });

  test('已结束行的 end 也可通过面板编辑（这里只验证纯函数语义：允许拉到更晚）', () => {
    const r = computeCommittedDragDates({ origStart: '2026-09-01', origEnd: '2026-10-01', mode: 'end', deltaDays: 60, asOf: AS_OF });
    expect(r.startDate).toBe('2026-09-01');
    expect(r.endDate).toBe('2026-11-30');
  });
});

describe('日期工具', () => {
  test('dayNumber/isoDate 往返一致（UTC，无时区漂移）', () => {
    expect(isoDate(dayNumber('2026-03-01'))).toBe('2026-03-01');
    expect(isoDate(dayNumber('2026-12-31') + 1)).toBe('2027-01-01');
  });
});
