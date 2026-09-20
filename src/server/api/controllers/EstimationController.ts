import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import {
  EstimationService,
  DEFAULT_CONVERSION,
  type ConversionInput
} from '../../services/estimation/EstimationService.js';

interface EstimationBody {
  estimated_loc?: number;
  loc_rate_per_pm?: number;
  design_share_pct?: number;
  deviation_low_pct?: number;
  deviation_high_pct?: number;
  expected_delivery_date?: string | null;
  review_notes?: string | null;
}

interface BackfillBody {
  actual_loc?: number | null;
  actual_design_pm?: number | null;
  actual_dev_pm?: number | null;
  actual_delivery_date?: string | null;
}

interface CheckBody {
  deadline?: string;
  start?: string;
  conversion?: Partial<ConversionInput>;
}

export class EstimationController extends BaseController {
  private estimationService: EstimationService;

  constructor(...args: any[]) {
    super(...args);
    this.estimationService = new EstimationService(this.db);
  }

  private normalizeConversion(body: EstimationBody): ConversionInput {
    return {
      estimated_loc: Number(body.estimated_loc ?? 0),
      loc_rate_per_pm: Number(body.loc_rate_per_pm ?? DEFAULT_CONVERSION.loc_rate_per_pm),
      design_share_pct: Number(body.design_share_pct ?? DEFAULT_CONVERSION.design_share_pct),
      deviation_low_pct: Number(body.deviation_low_pct ?? DEFAULT_CONVERSION.deviation_low_pct),
      deviation_high_pct: Number(body.deviation_high_pct ?? DEFAULT_CONVERSION.deviation_high_pct)
    };
  }

  private validateConversion(conversion: ConversionInput, res: Response): boolean {
    if (!(conversion.estimated_loc > 0)) {
      res.status(400).json({ error: 'Validation error', message: 'estimated_loc must be a positive number' });
      return false;
    }
    if (!(conversion.loc_rate_per_pm > 0)) {
      res.status(400).json({ error: 'Validation error', message: 'loc_rate_per_pm must be a positive number' });
      return false;
    }
    if (conversion.design_share_pct < 0 || conversion.design_share_pct > 100) {
      res.status(400).json({ error: 'Validation error', message: 'design_share_pct must be between 0 and 100' });
      return false;
    }
    if (conversion.deviation_low_pct < 0 || conversion.deviation_low_pct >= 100) {
      res.status(400).json({ error: 'Validation error', message: 'deviation_low_pct must be between 0 and 99' });
      return false;
    }
    if (conversion.deviation_high_pct < 0 || conversion.deviation_high_pct > 300) {
      res.status(400).json({ error: 'Validation error', message: 'deviation_high_pct must be between 0 and 300' });
      return false;
    }
    return true;
  }

  /**
   * GET /estimations/project/:projectId
   * Estimation history for a project, newest first; is_current flags the latest.
   */
  listByProject = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const rows = await this.db('project_estimations')
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
   * POST /estimations/project/:projectId
   * Creates a new estimation record (history is append-only).
   */
  create = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const conversion = this.normalizeConversion(req.body as EstimationBody);

    const validationResult = await this.executeQuery(async () => {
      if (!this.validateConversion(conversion, res)) return;

      const project = await this.db('projects').where('id', req.params.projectId).first();
      if (!project) {
        this.handleNotFound(res, 'Project');
        return;
      }

      const [inserted] = await this.db('project_estimations')
        .insert({
          project_id: req.params.projectId,
          estimated_loc: conversion.estimated_loc,
          loc_rate_per_pm: conversion.loc_rate_per_pm,
          design_share_pct: conversion.design_share_pct,
          deviation_low_pct: conversion.deviation_low_pct,
          deviation_high_pct: conversion.deviation_high_pct,
          expected_delivery_date: req.body.expected_delivery_date || null,
          review_notes: req.body.review_notes || null,
          created_by: req.user?.id ?? null
        })
        .returning('*');

      return res.status(201).json({ success: true, data: inserted });
    }, res);
    return validationResult;
  });

  /**
   * POST /estimations/:id/backfill
   * Records post-delivery actuals and computes estimation deviation.
   */
  backfill = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const estimation = await this.db('project_estimations').where('id', req.params.id).first();
      if (!estimation) {
        this.handleNotFound(res, 'Estimation');
        return;
      }

      const body = req.body as BackfillBody;
      const [updated] = await this.db('project_estimations')
        .where('id', req.params.id)
        .update({
          actual_loc: body.actual_loc ?? null,
          actual_design_pm: body.actual_design_pm ?? null,
          actual_dev_pm: body.actual_dev_pm ?? null,
          actual_delivery_date: body.actual_delivery_date ?? null,
          backfilled_at: this.db.fn.now(),
          updated_at: this.db.fn.now()
        })
        .returning('*');

      // Deviation = (actual - estimated) / estimated, in percent
      const deviationPct = (actual: number | null | undefined, estimated: number | null): number | null =>
        actual != null && estimated != null && estimated !== 0
          ? Math.round(((actual - estimated) / estimated) * 1000) / 10
          : null;

      return res.json({
        success: true,
        data: updated,
        deviation: {
          loc: deviationPct(updated.actual_loc, updated.estimated_loc),
          design_pm: deviationPct(
            updated.actual_design_pm,
            Math.round((updated.estimated_loc / updated.loc_rate_per_pm) * (updated.design_share_pct / 100) * 10) / 10
          ),
          dev_pm: deviationPct(
            updated.actual_dev_pm,
            Math.round((updated.estimated_loc / updated.loc_rate_per_pm) * (1 - updated.design_share_pct / 100) * 10) / 10
          ),
          days_late: updated.actual_delivery_date && updated.expected_delivery_date
            ? Math.round(
                (new Date(updated.actual_delivery_date).getTime() -
                  new Date(updated.expected_delivery_date).getTime()) / 86400000
              )
            : null
        }
      });
    }, res);
    return result;
  });

  /**
   * POST /estimations/:id/check
   * Deadline feasibility check. Body may override deadline/start/conversion params.
   */
  check = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const estimation = await this.db('project_estimations').where('id', req.params.id).first();
      if (!estimation) {
        this.handleNotFound(res, 'Estimation');
        return;
      }

      const body = req.body as CheckBody;
      const deadline = body.deadline || estimation.expected_delivery_date;
      if (!deadline) {
        res.status(400).json({
          error: 'Validation error',
          message: 'deadline is required (body.deadline or expected_delivery_date on the estimation)'
        });
        return;
      }

      const conversion: ConversionInput = {
        estimated_loc: Number(body.conversion?.estimated_loc ?? estimation.estimated_loc),
        loc_rate_per_pm: Number(body.conversion?.loc_rate_per_pm ?? estimation.loc_rate_per_pm),
        design_share_pct: Number(body.conversion?.design_share_pct ?? estimation.design_share_pct),
        deviation_low_pct: Number(body.conversion?.deviation_low_pct ?? estimation.deviation_low_pct),
        deviation_high_pct: Number(body.conversion?.deviation_high_pct ?? estimation.deviation_high_pct)
      };
      if (!this.validateConversion(conversion, res)) return;

      try {
        const analysis = await this.estimationService.checkDeadline({
          projectId: estimation.project_id,
          deadline,
          start: body.start,
          conversion
        });
        return res.json({ success: true, data: analysis });
      } catch (err: any) {
        if (/end date must be after start date|invalid date|exceeds 60 months/.test(err.message)) {
          res.status(400).json({ error: 'Validation error', message: err.message });
          return;
        }
        throw err;
      }
    }, res);
    return result;
  });
}
