/**
 * 人员工作负载 selector（I02u）—— UI 契约的唯一口径。
 *
 * 与 personUtilizationRows / activeAssignmentsInScenario 对齐：
 * - 当前负荷 = 当前场景内、与参考日相交、status='active' 的分配之和；
 * - paused 不计；未来/已结束不计；无日期按 ongoing 计入；
 * - 可用率取 utilization 行 current_availability_percentage，缺失不再回退
 *   100；0 是“无可用容量”，不是正常 0%；
 * - 相对利用率 = 当前分配合计 / 可用率；可用率为 0/缺失时返回 null，由 UI
 *   显示“—”，不能伪造 0%。
 *
 * 页面只消费本 selector，禁止再各写一套 COALESCE/今日判断（设计 §11.2）。
 */
import { toISODateString } from '../utils/dateUtils';

export interface WorkloadAssignment {
  id: string;
  allocation_percentage?: number | string | null;
  status?: string | null;
  start_date?: string | number | null;
  end_date?: string | number | null;
  computed_start_date?: string | number | null;
  computed_end_date?: string | number | null;
  [key: string]: unknown;
}

export type WorkloadExclusionReason = 'paused' | 'future' | 'ended';

export interface ExcludedWorkloadAssignment<T extends WorkloadAssignment> {
  assignment: T;
  reason: WorkloadExclusionReason;
}

export type WorkloadStatus =
  | 'unknown'
  | 'unavailable'
  | 'over'
  | 'full'
  | 'partial'
  | 'available';

export interface PersonWorkloadSummary<T extends WorkloadAssignment> {
  asOf: string;
  current: T[];
  excluded: Array<ExcludedWorkloadAssignment<T>>;
  totalAllocation: number;
  excludedAllocation: number;
  availability: number | null;
  relativeUtilization: number | null;
  remainingCapacity: number | null;
  status: WorkloadStatus;
  excludedCounts: Record<WorkloadExclusionReason, number>;
}

/** 把任意日期形态归一为 YYYY-MM-DD；无法解析返回 null（不伪造今天）。 */
export function workloadDateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : toISODateString(date);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) return text.slice(0, 10);
  if (/^\d+$/.test(text)) {
    const date = new Date(Number(text));
    return Number.isNaN(date.getTime()) ? null : toISODateString(date);
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : toISODateString(date);
}

function allocationOf(assignment: WorkloadAssignment): number {
  const value = Number(assignment.allocation_percentage ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function availabilityOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param assignments 当前场景的分配（服务端已按 x-scenario-id 切片）
 * @param options.asOf 服务端 utilization 端点返回的参考日；UI 不得自取今天
 * @param options.availability 当前人员可用率；null/undefined 表示数据缺失
 */
export function summarizePersonWorkload<T extends WorkloadAssignment>(
  assignments: T[],
  options: { asOf: string; availability?: unknown }
): PersonWorkloadSummary<T> {
  const asOf = workloadDateOnly(options.asOf);
  if (!asOf) throw new Error('summarizePersonWorkload requires a valid asOf date');

  const current: T[] = [];
  const excluded: Array<ExcludedWorkloadAssignment<T>> = [];
  const excludedCounts: Record<WorkloadExclusionReason, number> = {
    paused: 0,
    future: 0,
    ended: 0,
  };

  for (const assignment of assignments) {
    const start = workloadDateOnly(assignment.computed_start_date ?? assignment.start_date);
    const end = workloadDateOnly(assignment.computed_end_date ?? assignment.end_date);

    let reason: WorkloadExclusionReason | null = null;
    if (assignment.status === 'paused') reason = 'paused';
    else if (start && start > asOf) reason = 'future';
    else if (end && end < asOf) reason = 'ended';

    if (reason) {
      excluded.push({ assignment, reason });
      excludedCounts[reason] += 1;
    } else {
      current.push(assignment);
    }
  }

  const totalAllocation = current.reduce((sum, row) => sum + allocationOf(row), 0);
  const excludedAllocation = excluded.reduce((sum, row) => sum + allocationOf(row.assignment), 0);
  const availability = availabilityOf(options.availability);
  const relativeUtilization =
    availability !== null && availability > 0
      ? (totalAllocation / availability) * 100
      : null;
  const remainingCapacity = availability !== null ? availability - totalAllocation : null;

  let status: WorkloadStatus;
  if (availability === null) status = 'unknown';
  else if (availability === 0) status = 'unavailable';
  else if ((relativeUtilization ?? 0) > 100) status = 'over';
  else if ((relativeUtilization ?? 0) >= 80) status = 'full';
  else if (totalAllocation > 0) status = 'partial';
  else status = 'available';

  return {
    asOf,
    current,
    excluded,
    totalAllocation,
    excludedAllocation,
    availability,
    relativeUtilization,
    remainingCapacity,
    status,
    excludedCounts,
  };
}
