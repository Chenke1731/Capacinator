import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import {
  EstimationService
} from '../../services/estimation/EstimationService.js';
import { parseBackfillBody, backfillComplete } from '../../services/estimation/backfillPayload.js';

interface DesignEstimationBody {
  estimated_design_pm?: number;
  deviation_low_pct?: number;
  deviation_high_pct?: number;
  notes?: string | null;
}

interface DesignCheckBody {
  deadline?: string;
  start?: string;
}

/**
 * DesignEstimationController — 设计侧粗估 (设计阶段无人月精算输入, LOC 不存在).
 *
 * Mirrors EstimationController: append-only history, post-completion backfill
 * with deviation %, deadline check (design side only — deadline defaults to
 * the 设计 phase timeline end date).
 */
export class DesignEstimationController extends BaseController {
  private estimationService: EstimationService;

  constructor(...args: any[]) {
    super(...args);
    this.estimationService = new EstimationService(this.db);
  }

  /**
   * GET /design-estimations/project/:projectId
   * Design estimation history, newest first; is_current flags the latest.
   */
  listByProject = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const rows = await this.db('project_design_estimations')
        .where('project_id', req.params.projectId)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .select('*');

      const data = rows.map((row: any, index: number) => ({
        ...row,
        is_current: index === 0
      }));

      return res.json({ success: true, data });
    }, res);
    return result;
  });

  /**
   * POST /design-estimations/project/:projectId
   * Creates a new rough design estimate (append-only history).
   */
  create = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const body = req.body as DesignEstimationBody;
    const result = await this.executeQuery(async () => {
      const pm = Number(body.estimated_design_pm ?? 0);
      const low = Number(body.deviation_low_pct ?? 20);
      const high = Number(body.deviation_high_pct ?? 50);

      if (!(pm > 0)) {
        res.status(400).json({
          error: 'Validation error',
          message: 'estimated_design_pm must be a positive number'
        });
        return;
      }
      if (low < 0 || low >= 100) {
        res.status(400).json({ error: 'Validation error', message: 'deviation_low_pct must be between 0 and 99' });
        return;
      }
      if (high < 0 || high > 300) {
        res.status(400).json({ error: 'Validation error', message: 'deviation_high_pct must be between 0 and 300' });
        return;
      }

      const project = await this.db('projects').where('id', req.params.projectId).first();
      if (!project) {
        this.handleNotFound(res, 'Project');
        return;
      }

      const [inserted] = await this.db('project_design_estimations')
        .insert({
          project_id: req.params.projectId,
          estimated_design_pm: pm,
          deviation_low_pct: low,
          deviation_high_pct: high,
          notes: body.notes || null,
          created_by: req.user?.id ?? null
        })
        .returning('*');

      return res.status(201).json({ success: true, data: inserted });
    }, res);
    return result;
  });

  /**
   * POST /design-estimations/:id/backfill
   * Records the actual design effort after the design work wraps up.
   */
  backfill = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const estimation = await this.db('project_design_estimations').where('id', req.params.id).first();
      if (!estimation) {
        this.handleNotFound(res, 'Design estimation');
        return;
      }

      // IP-07a/C11/C12: 同 LOC 侧语义——只写提交字段,空/非法拒绝,显式 null 不是清空(D11)
      const parsed = parseBackfillBody(req.body, ['actual_design_pm'], []);
      if (!parsed.ok) {
        res.status(400).json({ error: 'Validation error', message: parsed.message });
        return;
      }

      // 单字段回填:actual_design_pm 非空即完整
      const payload: Record<string, unknown> = { ...parsed.values, updated_at: this.db.fn.now() };
      if (backfillComplete({ ...estimation, ...parsed.values }, ['actual_design_pm'])) {
        payload.backfilled_at = this.db.fn.now();
      }

      const [updated] = await this.db('project_design_estimations')
        .where('id', req.params.id)
        .update(payload)
        .returning('*');

      // Deviation = (actual - estimated) / estimated, in percent
      const deviationPct =
        updated.actual_design_pm != null && updated.estimated_design_pm > 0
          ? Math.round(((updated.actual_design_pm - updated.estimated_design_pm) / updated.estimated_design_pm) * 1000) / 10
          : null;

      return res.json({ success: true, data: updated, deviation: { design_pm: deviationPct } });
    }, res);
    return result;
  });

  /**
   * POST /design-estimations/:id/check
   * Design-side deadline check; deadline defaults to the 设计 phase end date.
   */
  check = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const body = req.body as DesignCheckBody;
    const result = await this.executeQuery(async () => {
      const estimation = await this.db('project_design_estimations').where('id', req.params.id).first();
      if (!estimation) {
        this.handleNotFound(res, 'Design estimation');
        return;
      }

      try {
        const analysis = await this.estimationService.checkDesignDeadline({
          projectId: estimation.project_id,
          deadline: body.deadline,
          start: body.start,
          estimated_design_pm: estimation.estimated_design_pm,
          deviation_low_pct: estimation.deviation_low_pct,
          deviation_high_pct: estimation.deviation_high_pct
        });
        return res.json({ success: true, data: analysis });
      } catch (err: any) {
        if (/end date must be after start date|invalid date|exceeds 60 months|deadline is required/.test(err.message)) {
          res.status(400).json({ error: 'Validation error', message: err.message });
          return;
        }
        throw err;
      }
    }, res);
    return result;
  });
}
