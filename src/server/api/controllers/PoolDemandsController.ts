import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';

interface PoolDemandBody {
  role_id?: string;
  headcount?: number;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  notes?: string | null;
}

const POOL_STATUSES = ['open', 'named', 'cancelled'];

/**
 * PoolDemandsController — 池占位 CRUD.
 *
 * A pool placeholder is role-side quantity demand WITHOUT a named person
 * ("3月起 2 个开发"). It consumes side capacity in every calculation exactly
 * like named assignments (capacity_gaps_view / project_demands_view /
 * EstimationService supply checks all include open pools). Naming a pool row
 * is done by creating real assignments and then PATCHing status → 'named'.
 */
export class PoolDemandsController extends BaseController {
  private validateHeadcount(headcount: unknown, res: Response): headcount is number {
    const n = Number(headcount);
    if (!(n > 0) || n > 10) {
      res.status(400).json({
        error: 'Validation error',
        message: 'headcount must be a number between 0 and 10 (FTE)'
      });
      return false;
    }
    return true;
  }

  private validateDates(start: string | null | undefined, end: string | null | undefined, res: Response): boolean {
    if (start && end && new Date(end) <= new Date(start)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'end_date must be after start_date'
      });
      return false;
    }
    return true;
  }

  listByProject = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const rows = await this.db('project_pool_demands as pmd')
        .leftJoin('roles as r', 'pmd.role_id', 'r.id')
        .where('pmd.project_id', req.params.projectId)
        .orderBy('pmd.created_at', 'desc')
        .select('pmd.*', 'r.name as role_name');
      return res.json({ success: true, data: rows });
    }, res);
    return result;
  });

  create = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const body = req.body as PoolDemandBody;
    const result = await this.executeQuery(async () => {
      if (!body.role_id) {
        res.status(400).json({ error: 'Validation error', message: 'role_id is required' });
        return;
      }
      if (!this.validateHeadcount(body.headcount, res)) return;
      if (!this.validateDates(body.start_date, body.end_date, res)) return;

      const project = await this.db('projects').where('id', req.params.projectId).first();
      if (!project) {
        this.handleNotFound(res, 'Project');
        return;
      }
      const role = await this.db('roles').where('id', body.role_id).first();
      if (!role) {
        this.handleNotFound(res, 'Role');
        return;
      }

      const [inserted] = await this.db('project_pool_demands')
        .insert({
          project_id: req.params.projectId,
          role_id: body.role_id,
          headcount: Number(body.headcount),
          start_date: body.start_date || null,
          end_date: body.end_date || null,
          status: 'open',
          notes: body.notes || null,
          created_by: req.user?.id ?? null
        })
        .returning('*');

      return res.status(201).json({ success: true, data: { ...inserted, role_name: role.name } });
    }, res);
    return result;
  });

  update = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const body = req.body as PoolDemandBody;
    const result = await this.executeQuery(async () => {
      const existing = await this.db('project_pool_demands').where('id', req.params.id).first();
      if (!existing) {
        this.handleNotFound(res, 'Pool demand');
        return;
      }

      if (body.status !== undefined && !POOL_STATUSES.includes(body.status)) {
        res.status(400).json({
          error: 'Validation error',
          message: `status must be one of: ${POOL_STATUSES.join(', ')}`
        });
        return;
      }
      if (body.headcount !== undefined && !this.validateHeadcount(body.headcount, res)) return;

      const start = body.start_date !== undefined ? body.start_date : existing.start_date;
      const end = body.end_date !== undefined ? body.end_date : existing.end_date;
      if (!this.validateDates(start, end, res)) return;

      const role = body.role_id
        ? await this.db('roles').where('id', body.role_id).first()
        : null;
      if (body.role_id && !role) {
        this.handleNotFound(res, 'Role');
        return;
      }

      const [updated] = await this.db('project_pool_demands')
        .where('id', req.params.id)
        .update({
          ...(body.role_id ? { role_id: body.role_id } : {}),
          ...(body.headcount !== undefined ? { headcount: Number(body.headcount) } : {}),
          ...(body.start_date !== undefined ? { start_date: body.start_date || null } : {}),
          ...(body.end_date !== undefined ? { end_date: body.end_date || null } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
          updated_at: this.db.fn.now()
        })
        .returning('*');

      return res.json({
        success: true,
        data: { ...updated, role_name: role?.name ?? undefined }
      });
    }, res);
    return result;
  });

  delete = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const deleted = await this.db('project_pool_demands')
        .where('id', req.params.id)
        .del();
      if (deleted === 0) {
        this.handleNotFound(res, 'Pool demand');
        return;
      }
      return res.json({ success: true, data: { id: req.params.id } });
    }, res);
    return result;
  });
}
