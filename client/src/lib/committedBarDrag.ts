/**
 * 已提交 fixed bar 的拖拽/缩放日期计算（交互优化设计 S1 §4.2，评审 B2 收敛）。
 *
 * 与 ghost 拖拽的关键区别：
 * - ghost 的 `start >= asOf` 是为"新分配不得进历史"立的；
 * - 已提交行可能已开始或已结束——
 *   - 整体移动：下限 = min(原 start, asOf)，不向更早扩展、不截断历史；
 *   - 左端缩放：原 start >= asOf 时下限 asOf；原 start < asOf 时下限 = 原 start；
 *   - 右端缩放：只改结束日，不得顺带修改开始日；
 *   - 已结束行（end < asOf）不可拖；
 *   - paused / phase / project 不可拖。
 *
 * 纯函数、无副作用，页面与 Gantt 共用；单测覆盖边界矩阵。
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export type CommittedDragMode = 'move' | 'start' | 'end';

export interface CommittedBarWindow {
  dateMode: string | null | undefined;
  status: string | null | undefined;
  startDate: string;
  endDate: string;
}

export function dayNumber(iso: string): number {
  return Math.floor(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS
  );
}

export function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 可拖条件：fixed + active（非 paused）+ 有起止 + 未结束（end >= asOf）。 */
export function canDragCommittedBar(bar: CommittedBarWindow, asOf: string): boolean {
  if ((bar.dateMode ?? 'fixed') !== 'fixed') return false;
  if (bar.status === 'paused') return false;
  if (!bar.startDate || !bar.endDate) return false;
  return dayNumber(bar.endDate) >= dayNumber(asOf);
}

/** 左侧可扩展下限：已开始的行不允许把窗口扩到原 start 之前。 */
function lowerBoundDay(origStartDay: number, asOfDay: number): number {
  return origStartDay < asOfDay ? origStartDay : asOfDay;
}

/**
 * 计算拖拽后的起止日期。deltaDays 为按天对齐的位移（正=向后）。
 * 不变量：返回 start <= end；move 保持时长不变（直到下限）。
 */
export function computeCommittedDragDates(args: {
  origStart: string;
  origEnd: string;
  mode: CommittedDragMode;
  deltaDays: number;
  asOf: string;
}): { startDate: string; endDate: string } {
  const origStartDay = dayNumber(args.origStart);
  const origEndDay = dayNumber(args.origEnd);
  const asOfDay = dayNumber(args.asOf);
  const lower = lowerBoundDay(origStartDay, asOfDay);

  if (args.mode === 'move') {
    let startDay = origStartDay + args.deltaDays;
    let endDay = origEndDay + args.deltaDays;
    if (startDay < lower) {
      // 到下限后整段停住（保持时长），不压缩历史窗口
      const shift = lower - startDay;
      startDay = lower;
      endDay += shift;
    }
    return { startDate: isoDate(startDay), endDate: isoDate(endDay) };
  }

  if (args.mode === 'start') {
    const startDay = Math.min(Math.max(origStartDay + args.deltaDays, lower), origEndDay);
    return { startDate: isoDate(startDay), endDate: isoDate(origEndDay) };
  }

  // end：只改结束日，绝不修改开始日
  const endDay = Math.max(origEndDay + args.deltaDays, origStartDay);
  return { startDate: isoDate(origStartDay), endDate: isoDate(endDay) };
}
