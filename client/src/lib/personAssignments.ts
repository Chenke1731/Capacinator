/**
 * 人员分配完整分页读取（工作台 v2 §13.1）：
 * 不允许把单页 limit=2000 当作完整集合——必须循环读 pagination.totalPages。
 * workloadTimeline 的 committed 输入、同键分类、UNKNOWN 回读共用本取数，
 * 缓存由 react-query 按 personId+scenarioId 键控。
 */
import { api } from './api-client';

export interface PersonAssignmentsPage {
  rows: Array<Record<string, unknown>>;
  total: number;
  pages: number;
}

export async function fetchAllPersonAssignments(
  personId: string,
  scenarioId?: string,
  pageSize = 200
): Promise<PersonAssignmentsPage> {
  const rows: Array<Record<string, unknown>> = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;
  // 上限 50 页（1 万行）防御性封顶：正常人员分配远达不到；超出属服务端异常
  for (let guard = 0; guard < 50; guard += 1) {
    const response = await api.assignments.list(
      { person_id: personId, page, limit: pageSize } as never,
      scenarioId ? { scenarioId } : undefined
    );
    const payload = response.data as unknown as {
      data?: Array<Record<string, unknown>>;
      pagination?: { page: number; total: number; totalPages: number };
    };
    rows.push(...(payload.data ?? []));
    total = Number(payload.pagination?.total ?? rows.length);
    totalPages = Number(payload.pagination?.totalPages ?? 1);
    if (page >= totalPages) break;
    page += 1;
  }
  return { rows, total, pages: totalPages };
}
