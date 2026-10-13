import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import {
  LifecycleService,
  LIFECYCLE_STATES,
  STATE_LABELS,
  LifecycleError,
  type LifecycleState
} from '../../services/lifecycle/LifecycleService.js';

interface TransitionBody {
  to?: string;
  external_number?: string | null;
  iteration_label?: string | null;
  iteration_id?: string | null;
  note?: string | null;
  dev_assignments_action?: 'pause' | 'release' | 'keep';
  pool?: {
    role_id: string;
    headcount: number;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
  };
}

interface FieldUpdateBody {
  external_number?: string | null;
  iteration_label?: string | null;
  iteration_id?: string | null;
}

export class LifecycleController extends BaseController {
  private lifecycleService: LifecycleService;

  constructor(...args: any[]) {
    super(...args);
    this.lifecycleService = new LifecycleService(this.db);
  }

  private mapError(err: unknown, res: Response): boolean {
    if (err instanceof LifecycleError) {
      res.status(err.statusCode).json({ error: err.message });
      return true;
    }
    return false;
  }

  /**
   * GET /projects/:id/lifecycle
   * State metadata + advisory warnings (状态告警) + event history.
   * Any state may jump to any other — warnings flag unreasonable spots.
   */
  getLifecycle = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const project = await this.db('projects').where('id', req.params.id).first();
    if (!project) {
      this.handleNotFound(res, 'Project');
      return;
    }
    const current = project.lifecycle_state as LifecycleState | null;
    const [events, warnings] = await Promise.all([
      this.lifecycleService.listEvents(req.params.id),
      current != null ? this.lifecycleService.computeWarnings(req.params.id) : Promise.resolve([])
    ]);

    res.json({
      success: true,
      data: {
        lifecycle_state: current,
        external_number: project.external_number ?? null,
        iteration_label: project.iteration_label ?? null,
        applicable: current != null,
        warnings,
        events
      }
    });
  });

  /**
   * POST /projects/:id/lifecycle/transition
   * Guarded state transition with side effects (see LifecycleService).
   */
  transition = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const body = req.body as TransitionBody;
    if (!body.to || !LIFECYCLE_STATES.includes(body.to as LifecycleState)) {
      res.status(400).json({
        error: `body.to must be one of: ${LIFECYCLE_STATES.join(', ')}`
      });
      return;
    }

    try {
      const { project, event } = await this.lifecycleService.transition({
        projectId: req.params.id,
        to: body.to as LifecycleState,
        external_number: body.external_number ?? null,
        iteration_label: body.iteration_label ?? null,
        iteration_id: body.iteration_id ?? null,
        note: body.note ?? null,
        dev_assignments_action: body.dev_assignments_action,
        pool: body.pool,
        actor: req.user?.id ?? req.user?.name ?? null
      });
      // 流转副作用审计(2026-10-13 全库审计): designing→release 物理删分配此前
      // 零审计;审计白名单已补真实分配表,流转本身按 projects UPDATE 记录
      // (from 态取自事件行;释放/暂停明细在事件 note)
      try {
        await (req as any).logAuditEvent?.(
          'projects',
          req.params.id,
          'UPDATE',
          { lifecycle_state: (event as any)?.from_state ?? null },
          project,
          `lifecycle: → ${body.to}`
        );
      } catch {
        // 审计失败不阻断流转
      }
      res.json({ success: true, data: { project, event } });
    } catch (err: any) {
      if (!this.mapError(err, res)) throw err;
    }
  });

  /**
   * PATCH /projects/:id/lifecycle
   * Field-only update (AR number / iteration label) without a state change.
   */
  updateFields = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const body = req.body as FieldUpdateBody;
    try {
      const project = await this.lifecycleService.updateFields(req.params.id, body);
      res.json({ success: true, data: project });
    } catch (err: any) {
      if (!this.mapError(err, res)) throw err;
    }
  });

  /** Convenience for logging/tests: state labels in both code and display form. */
  get states() {
    return LIFECYCLE_STATES.map((s) => ({ value: s, label: STATE_LABELS[s] }));
  }
}
