/**
 * 迭代统计纯函数(BOARD_REDESIGN_2026-09-23 §0.3/§0.5)。
 * 口径: 工作月 = 21.75 工作日/月;窗口时长按工作日折算。
 *
 * IP-02a: 日历原语收敛到 workCalendar 唯一实现——本文件只保留迭代域的
 * 组合(季度标签/展示折算/强度)。纯周末区间现在是真实的 0 天,不再"兜底 1"
 * 制造工作日;除零保护由 intensityPct 的 null 返回承担。
 */
import {
  workdaysBetween as calendarWorkdaysBetween,
  displayWorkMonths,
  workMonths
} from '../calc/workCalendar.js';

export const WORKDAYS_PER_MONTH = 21.75;

/** start_date → "26.RP4" 式季度标签(派生,不落库) */
export function quarterOf(startDate: string): string {
  const d = new Date(startDate + 'T00:00:00');
  return `${String(d.getFullYear()).slice(2)}.RP${Math.floor(d.getMonth() / 3) + 1}`;
}

/** 区间工作日数(含两端,周末剔除;同日=1,纯周末/无效=0——不制造工作日) */
export function workdaysBetween(start: string, end: string): number {
  return calendarWorkdaysBetween(start, end);
}

/** 窗口折算工作月数(展示口径,2 位小数;计算请用 workCalendar.workMonths 保留精度) */
export function monthsOf(start: string, end: string): number {
  return displayWorkMonths(calendarWorkdaysBetween(start, end));
}

/** 强度% = 人月 ÷ 工作月(防爆表口径,>100 琥珀);窗口无效返回 null */
export function intensityPct(pm: number, start: string, end: string): number | null {
  const months = workMonths(calendarWorkdaysBetween(start, end));
  if (!(months > 0)) return null;
  return Math.round((pm / months) * 100);
}
