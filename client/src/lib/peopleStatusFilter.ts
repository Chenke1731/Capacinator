/**
 * 人员利用率状态筛选取值的单一真相（I02b/U25）。
 *
 * URL 形态（kebab-case，语言中立、可分享）：
 *   /people?status=over-allocated | fully-allocated | available
 * 映射到 person_utilization_view 的 utilization_status：
 *   Over-allocated | Fully-allocated | Available
 *
 * 所有消费方（People 页、useCriticalAlerts、EnhancedKPIs、Dashboard 快捷统计）
 * 必须经此模块生成/解析，禁止各自拼字符串（评审 Q4）。
 */
export const PEOPLE_STATUS_PARAM = 'status';

export const PEOPLE_STATUS_VALUES = ['over-allocated', 'fully-allocated', 'available'] as const;
export type PeopleStatusParam = (typeof PEOPLE_STATUS_VALUES)[number];

const PARAM_TO_UTILIZATION: Record<PeopleStatusParam, string> = {
  'over-allocated': 'Over-allocated',
  'fully-allocated': 'Fully-allocated',
  available: 'Available',
};

export function isPeopleStatusParam(value: string | null): value is PeopleStatusParam {
  return value !== null && (PEOPLE_STATUS_VALUES as readonly string[]).includes(value);
}

/** URL 值 → 视图状态；非法值返回 null（调用方负责从 URL 清理） */
export function parsePeopleStatus(value: string | null): PeopleStatusParam | null {
  return isPeopleStatusParam(value) ? value : null;
}

/** URL 值 → utilization_status 字面量 */
export function toUtilizationStatus(value: PeopleStatusParam): string {
  return PARAM_TO_UTILIZATION[value];
}

/** utilization_status → URL 值（双向映射；未知状态返回 null） */
export function statusParamForUtilization(utilizationStatus: string | null | undefined): PeopleStatusParam | null {
  if (!utilizationStatus) return null;
  const found = (Object.entries(PARAM_TO_UTILIZATION) as Array<[PeopleStatusParam, string]>).find(
    ([, u]) => u === utilizationStatus
  );
  return found ? found[0] : null;
}

/** 便捷构造：`/people?status=over-allocated`（告警/KPI 深链统一走这里） */
export function peopleStatusPath(value: PeopleStatusParam): string {
  return `/people?${PEOPLE_STATUS_PARAM}=${value}`;
}
