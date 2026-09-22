/**
 * 迭代统计纯函数(BOARD_REDESIGN_2026-09-23 §0.3/§0.5)。
 * 口径: 工作月 = 21.75 工作日/月;窗口时长按工作日折算。
 */
export const WORKDAYS_PER_MONTH = 21.75;

/** start_date → "26.RP4" 式季度标签(派生,不落库) */
export function quarterOf(startDate: string): string {
  const d = new Date(startDate + 'T00:00:00');
  return `${String(d.getFullYear()).slice(2)}.RP${Math.floor(d.getMonth() / 3) + 1}`;
}

/** 区间工作日数(含两端,周末剔除;至少 1 防除零) */
export function workdaysBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  let days = 0;
  for (let t = a; t <= b; t.setDate(t.getDate() + 1)) {
    const dow = t.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return Math.max(days, 1);
}

/** 窗口折算工作月数 */
export function monthsOf(start: string, end: string): number {
  return Math.round((workdaysBetween(start, end) / WORKDAYS_PER_MONTH) * 100) / 100;
}

/** 强度% = 人月 ÷ 工作月(防爆表口径,>100 琥珀);窗口无效返回 null */
export function intensityPct(pm: number, start: string, end: string): number | null {
  const months = monthsOf(start, end);
  if (!(months > 0)) return null;
  return Math.round((pm / months) * 100);
}
