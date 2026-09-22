import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';

/**
 * ActualInvestmentsController — 实投入月帐(计划 vs 实际的闭环)。
 *
 * 两个口径(2026-09-22 真实人力排序表借鉴):
 * - 计划 planned: 当月有效实名分配 FTE(与事项台月窗口同一重叠规则;
 *   池不计——池是计划杠杆,不是实际投入)
 * - 实际 actual: 月末快照(snapshot, 自动可刷新)或主管改写(manual, 快照不覆盖)
 */
export class ActualInvestmentsController extends BaseController {
  private static MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  private badMonth(res: Response) {
    res.status(400).json({ error: 'Validation error', message: 'month must be YYYY-MM' });
  }

  /** 任意月份的分配重叠占比(与 AffairsBoard monthOverlapFraction 同口径) */
  private monthPlannedFte(rows: any[], month: string): number {
    const [y, m] = month.split('-').map(Number);
    const mStart = new Date(y, m - 1, 1).getTime();
    const mEnd = new Date(y, m, 0, 23, 59, 59).getTime();
    let sum = 0;
    for (const a of rows) {
      const s = a.start ? new Date(`${a.start}T00:00:00`).getTime() : null;
      const e = a.end ? new Date(`${a.end}T23:59:59`).getTime() : null;
      const effS = s && s > mStart ? s : mStart;
      const effE = e && e < mEnd ? e : mEnd;
      if (effE <= effS) continue;
      sum += ((a.allocation_percentage ?? 0) / 100) * ((effE - effS) / (mEnd - mStart));
    }
    return Math.round(sum * 100) / 100;
  }

  private async activeAssignments(projectId: string): Promise<any[]> {
    const rows = await this.db('assignments_view as av')
      .where('av.project_id', projectId)
      .where('av.status', 'active')
      .select(
        'av.allocation_percentage',
        this.db.raw('COALESCE(av.computed_start_date, av.start_date) as start'),
        this.db.raw('COALESCE(av.computed_end_date, av.end_date) as end')
      );
    return rows.map((r: any) => ({
      ...r,
      start: r.start ? String(r.start).slice(0, 10) : null,
      end: r.end ? String(r.end).slice(0, 10) : null
    }));
  }

  /** 行 + 每行实时算的计划值(单一载荷给 UI 的 计划vs实际) */
  list = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const rows = await this.db('project_actual_investments')
        .where('project_id', req.params.projectId)
        .orderBy('month', 'desc')
        .select();
      const assignments = await this.activeAssignments(req.params.projectId);
      return {
        data: rows.map((r: any) => ({ ...r, planned_fte: this.monthPlannedFte(assignments, r.month) }))
      };
    }, res, 'Failed to list actual investments');
    if (result) this.sendSuccess(req, res, result, undefined);
  });

  /** 月末快照: 只补缺失/刷新旧快照,manual 行绝不覆盖 */
  snapshot = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const month = String(req.body?.month ?? '');
    if (!ActualInvestmentsController.MONTH_RE.test(month)) return this.badMonth(res);
    const result = await this.executeQuery(async () => {
      const assignments = await this.activeAssignments(req.params.projectId);
      const fte = this.monthPlannedFte(assignments, month);
      const existing = await this.db('project_actual_investments')
        .where({ project_id: req.params.projectId, month })
        .first();
      if (existing && existing.source === 'manual') {
        return { data: { ...existing, skipped: true } };
      }
      let row;
      if (existing) {
        [row] = await this.db('project_actual_investments')
          .where({ id: existing.id })
          .update({ fte, updated_at: new Date() })
          .returning('*');
      } else {
        [row] = await this.db('project_actual_investments')
          .insert({ project_id: req.params.projectId, month, fte, source: 'snapshot' })
          .returning('*');
      }
      return { data: { ...row, planned_fte: fte } };
    }, res, 'Failed to snapshot actual investment');
    if (result) this.sendSuccess(req, res, result, undefined);
  });

  /** 主管改写(manual): 实际投入的真相以人为准 */
  setManual = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const month = String(req.body?.month ?? '');
    const fte = Number(req.body?.fte);
    if (!ActualInvestmentsController.MONTH_RE.test(month)) return this.badMonth(res);
    if (!(fte >= 0) || fte > 50) {
      res.status(400).json({ error: 'Validation error', message: 'fte must be a number between 0 and 50' });
      return;
    }
    const result = await this.executeQuery(async () => {
      const [row] = await this.db('project_actual_investments')
        .insert({
          project_id: req.params.projectId,
          month,
          fte,
          source: 'manual',
          created_by: (req as any).user?.id ?? null
        })
        .onConflict(['project_id', 'month'])
        .merge({ fte, source: 'manual', updated_at: new Date() })
        .returning('*');
      const assignments = await this.activeAssignments(req.params.projectId);
      return { data: { ...row, planned_fte: this.monthPlannedFte(assignments, month) } };
    }, res, 'Failed to save actual investment');
    if (result) this.sendSuccess(req, res, result, undefined);
  });

  /** 清除某月记录(manual 或 snapshot) */
  remove = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const month = String(req.params.month ?? '');
    if (!ActualInvestmentsController.MONTH_RE.test(month)) return this.badMonth(res);
    const result = await this.executeQuery(async () => {
      await this.db('project_actual_investments')
        .where({ project_id: req.params.projectId, month })
        .del();
      return { data: { month } };
    }, res, 'Failed to remove actual investment');
    if (result) this.sendSuccess(req, res, result, undefined);
  });
}
