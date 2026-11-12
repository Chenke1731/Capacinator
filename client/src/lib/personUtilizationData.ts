/**
 * 人员利用率取数与载荷归一（I02b 复评 #1）。
 *
 * 事故：People 与 BoardCells 共用 `queryKeys.people.utilization(scenarioId)`，
 * 但两个 queryFn 归一形状不同（People 返回 {personUtilization}，BoardCells
 * 返回裸数组）——先打开分配弹层会把裸数组写进同一缓存键，人员页随后读到
 * 无 personUtilization 的对象 → 超载名单显示 0 且 5 分钟内不重取。
 *
 * 约束：凡消费该查询键的取数必须走 fetchPersonUtilization（写侧统一形状）；
 * 读取侧用 personUtilizationRowsFrom 容忍旧缓存里的裸数组/{data}。
 */
import { api } from './api-client';

export interface PersonUtilizationPayload {
  personUtilization: Array<Record<string, unknown>>;
}

/** 写侧：统一归一为 { personUtilization: rows } */
export async function fetchPersonUtilization(): Promise<PersonUtilizationPayload> {
  const payload = (await api.people.getUtilization()).data as unknown;
  return { personUtilization: personUtilizationRowsFrom(payload) };
}

/** 读侧：容忍裸数组 / {data} / {personUtilization}（旧缓存/信封变体） */
export function personUtilizationRowsFrom(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const payload = data as { personUtilization?: unknown; data?: unknown } | null | undefined;
  const rows = payload?.personUtilization ?? payload?.data;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}
