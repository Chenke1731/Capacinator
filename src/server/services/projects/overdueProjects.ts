/**
 * I02g 排期逾期原语（项目级，单一真相）。
 *
 * 口径（2026-11-13 用户批准，Codex/Claude 双评审收敛）：
 * - 按项目计数，不按阶段；计划完成日 = 全部阶段 end_date 的 MAX（含窗口外阶段）。
 * - 只统计 include_in_demand=1 且 lifecycle_state 属于六个已知非终态的项目；
 *   lifecycle_state=NULL（055：不适用/常驻事项）、delivered、cancelled、未知值
 *   一律不命中——NULL 不是"未完成"，不能靠 SQL NULL 语义碰巧排除。
 * - 严格小于参考日：完成日 = 参考日不算逾期。
 * - 参考日 = min(请求参考日, 今天)：历史窗口可回看；未来窗口不预言逾期。
 * - 无阶段/日期不完整 → 不命中（MAX 忽略 NULL 时不得制造确定结论）。
 *
 * Dashboard 计数与 board-feed 行级 is_overdue 必须共用本原语，禁止各自重写。
 */
import type { Knex } from 'knex';
import { toISODateLocal } from '../../utils/isoDate.js';

export const OVERDUE_LIFECYCLE_STATES = [
  'pending_rat',
  'nok',
  'designing',
  'backlog',
  'scheduled',
  'in_iteration',
] as const;

export interface OverdueProjectRow {
  project_id: string;
  planned_finish: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * 参考日归一：非法/缺失→今天；未来→今天（不预言）；历史保留。
 * 日期串已是 YYYY-MM-DD，可直接字典序比较。
 */
export function resolveOverdueReferenceDate(
  requested?: string | null,
  today: string = toISODateLocal(new Date())
): string {
  const value = typeof requested === 'string' ? requested.trim() : '';
  if (!isValidIsoDate(value)) return today;
  return value < today ? value : today;
}

export async function overdueProjects(
  db: Knex,
  referenceDate?: string | null
): Promise<OverdueProjectRow[]> {
  const ref = resolveOverdueReferenceDate(referenceDate);
  const rows = await db('projects as p')
    .join('project_phases_timeline as ppt', 'ppt.project_id', 'p.id')
    .where('p.include_in_demand', 1)
    .whereIn('p.lifecycle_state', [...OVERDUE_LIFECYCLE_STATES])
    .groupBy('p.id')
    // 日期不完整/异常 → 排期未知，不判逾期（COUNT 检查 + MAX 比较都要过）
    .havingRaw('COUNT(ppt.end_date) = COUNT(*)')
    .havingRaw('MAX(ppt.end_date) < ?', [ref])
    .select('p.id as project_id')
    .select(db.raw('MAX(ppt.end_date) as planned_finish'));

  return rows.map((row: any) => ({
    project_id: String(row.project_id),
    planned_finish: String(row.planned_finish),
  }));
}

export async function overdueProjectIds(
  db: Knex,
  referenceDate?: string | null
): Promise<Set<string>> {
  const rows = await overdueProjects(db, referenceDate);
  return new Set(rows.map((row) => row.project_id));
}
