/**
 * 人员已批准可用率覆盖的窗口读取原语（DeepSeek P2 #3 修复，EXP-B11/B17 家族
 * 的客户端消费面）：
 *
 * 旧实现从 utilization 视图的 availability_start/end 构造"单一当前窗口"
 * override——视图只 JOIN 覆盖今天的行，未来已批准休假（如下周整周 0%）根本
 * 不可见，热区按默认可用率出数（页面显示 30% 正常，实际整周无容量）。
 *
 * 本原语按时间轴窗口查询 approved-only 覆盖全集；页面所有容量面（泳道热区/
 * 弹窗迷你热区/minimap/inspector）共用同一数组，禁止再各自拼近似。
 */
import { api } from './api-client';
import type { AvailabilityOverrideInput } from './workloadTimeline';

export async function fetchApprovedAvailabilityOverrides(
  personId: string,
  windowStart: string,
  windowEnd: string
): Promise<AvailabilityOverrideInput[]> {
  const response = await api.availability.list({
    person_id: personId,
    is_approved: true,
    start_date: windowStart,
    end_date: windowEnd,
    limit: 200,
  } as never);
  const payload = response.data as unknown as {
    data?: Array<Record<string, unknown>>;
  };
  return (payload.data ?? [])
    .map((row) => ({
      start: String(row.start_date ?? '').slice(0, 10),
      end: String(row.end_date ?? '').slice(0, 10),
      percentage: Number(row.availability_percentage ?? 0),
      // 服务端已按 is_approved 过滤；此处再做一次显式门（0/1/布尔三种形态）
      isApproved: Number(row.is_approved) === 1 || row.is_approved === true,
    }))
    .filter(
      (override) =>
        override.isApproved &&
        Boolean(override.start) &&
        Boolean(override.end) &&
        override.start <= override.end &&
        Number.isFinite(override.percentage)
    )
}
