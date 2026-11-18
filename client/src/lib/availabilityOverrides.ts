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
  const PAGE_SIZE = 200;
  const MAX_PAGES = 50;
  const rows: Array<Record<string, unknown>> = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await api.availability.list({
      person_id: personId,
      is_approved: true,
      start_date: windowStart,
      end_date: windowEnd,
      limit: PAGE_SIZE,
      page,
    } as never);
    const payload = response.data as unknown as {
      data?: Array<Record<string, unknown>>;
      pagination?: { totalPages?: number };
    };
    rows.push(...(payload.data ?? []));
    const reported = Number(payload.pagination?.totalPages ?? 1);
    totalPages = Number.isFinite(reported) && reported > 0 ? reported : 1;
    // 超过保护上限时不得静默返回部分集合——调用方会把它当完整 approved 全集
    if (totalPages > MAX_PAGES) {
      throw new Error(
        `approved availability overrides exceed ${MAX_PAGES} pages (${totalPages}); refusing partial window`
      );
    }
    page += 1;
  } while (page <= totalPages && page <= MAX_PAGES);

  const seen = new Set<string>();
  const mapped: AvailabilityOverrideInput[] = [];
  for (const row of rows) {
    const key = String(
      row.id ??
        `${row.start_date}|${row.end_date}|${row.availability_percentage}|${row.is_approved}`
    );
    if (seen.has(key)) continue;
    seen.add(key);
    const override = {
      start: String(row.start_date ?? '').slice(0, 10),
      end: String(row.end_date ?? '').slice(0, 10),
      percentage: Number(row.availability_percentage ?? 0),
      // 服务端已按 is_approved 过滤；此处再做一次显式门（0/1/布尔三种形态）
      isApproved: Number(row.is_approved) === 1 || row.is_approved === true,
    };
    if (
      override.isApproved &&
      Boolean(override.start) &&
      Boolean(override.end) &&
      override.start <= override.end &&
      Number.isFinite(override.percentage)
    ) {
      mapped.push(override);
    }
  }
  return mapped;
}
