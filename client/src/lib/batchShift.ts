/**
 * 批量平移（交互优化设计 S3 §6，Phase B）——纯函数：
 * - 应用对象：fixed 且非 paused 的行；phase/project/paused/无日期分项跳过；
 * - 平移单位 day/week/month；month 按目标月月底钳制（1/31 +1 月 = 2/28）；
 * - 边界与 §4.2 同一谓词：lower = min(原 start, asOf)。已开始行不因
 *   newStart < asOf 失败（它本来就在过去）；但不得早于原 start（不扩历史）。
 *   未来行可以提前到 asOf，但不能进入过去；
 * - 计划在生成预览时冻结（页面保存本结构），应用只提交冻结清单。
 */
import { dayNumber, isoDate } from './committedBarDrag';
import { workloadDateOnly } from './personWorkload';

export type BatchShiftUnit = 'day' | 'week' | 'month';
export type BatchShiftDirection = 'earlier' | 'later';

export interface BatchShiftRowInput {
  id: string;
  version?: number;
  status?: string | null;
  assignment_date_mode?: string | null;
  start_date?: string | number | null;
  end_date?: string | number | null;
  computed_start_date?: string | number | null;
  computed_end_date?: string | number | null;
  project_name?: string | null;
}

export interface BatchShiftPlanRow {
  id: string;
  version?: number;
  label: string;
  originalStart: string;
  originalEnd: string;
  newStart: string;
  newEnd: string;
}

export interface BatchShiftBlockedRow {
  id: string;
  label: string;
  originalStart: string;
  newStart: string;
}

export interface BatchShiftSkipCounts {
  paused: number;
  phase: number;
  project: number;
  undated: number;
}

export interface BatchShiftPlan {
  direction: BatchShiftDirection;
  amount: number;
  unit: BatchShiftUnit;
  rows: BatchShiftPlanRow[];
  blocked: BatchShiftBlockedRow[];
  skipped: BatchShiftSkipCounts;
}

export interface BatchShiftOptions {
  direction: BatchShiftDirection;
  amount: number;
  unit: BatchShiftUnit;
  asOf: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 月末钳制加月：2026-01-31 +1 → 2026-02-28；2028-01-31 +1 → 2028-02-29。 */
export function shiftIsoMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(Math.min(day, lastDay))}`;
}

export function shiftIsoDate(
  iso: string,
  amount: number,
  unit: BatchShiftUnit,
  direction: BatchShiftDirection
): string {
  const signed = direction === 'earlier' ? -amount : amount;
  if (unit === 'month') return shiftIsoMonths(iso, signed);
  const days = unit === 'week' ? signed * 7 : signed;
  return isoDate(dayNumber(iso) + days);
}

export function planBatchShift(
  rows: BatchShiftRowInput[],
  options: BatchShiftOptions
): BatchShiftPlan {
  const { direction, amount, unit, asOf } = options;
  const skipped: BatchShiftSkipCounts = { paused: 0, phase: 0, project: 0, undated: 0 };
  const planRows: BatchShiftPlanRow[] = [];
  const blocked: BatchShiftBlockedRow[] = [];
  const asOfDay = dayNumber(asOf);

  for (const row of rows) {
    if (row.status === 'paused') {
      skipped.paused += 1;
      continue;
    }
    const mode = row.assignment_date_mode ?? 'fixed';
    if (mode === 'phase') {
      skipped.phase += 1;
      continue;
    }
    if (mode === 'project') {
      skipped.project += 1;
      continue;
    }
    const originalStart =
      workloadDateOnly(row.start_date) ?? workloadDateOnly(row.computed_start_date);
    const originalEnd = workloadDateOnly(row.end_date) ?? workloadDateOnly(row.computed_end_date);
    if (!originalStart || !originalEnd) {
      skipped.undated += 1;
      continue;
    }
    const newStart = shiftIsoDate(originalStart, amount, unit, direction);
    const newEnd = shiftIsoDate(originalEnd, amount, unit, direction);
    // 与 §4.2 同谓词：已开始行下限=原 start；未来行下限=asOf
    const lower = Math.min(dayNumber(originalStart), asOfDay);
    if (dayNumber(newStart) < lower || dayNumber(newEnd) < dayNumber(newStart)) {
      blocked.push({
        id: row.id,
        label: row.project_name ?? row.id,
        originalStart,
        newStart,
      });
      continue;
    }
    planRows.push({
      id: row.id,
      version: row.version,
      label: row.project_name ?? row.id,
      originalStart,
      originalEnd,
      newStart,
      newEnd,
    });
  }

  return { direction, amount, unit, rows: planRows, blocked, skipped };
}

export function batchShiftSkipTotal(skipped: BatchShiftSkipCounts): number {
  return skipped.paused + skipped.phase + skipped.project + skipped.undated;
}
