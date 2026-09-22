/**
 * LifecycleService — 事项生命周期状态机 (2026-09-21 设计契约)
 *
 * 设计侧:  pending_rat 待RAT → nok NOK ⇄ designing 设计中 ──(准入)──► backlog
 * 开发侧:  backlog 待排序 → scheduled 已排序 → in_iteration 已启动迭代 → delivered 已交付
 * 终态:    cancelled 裁决取消 (任意非终态可进, 暂停全部分配+取消池)
 * 退回:    backlog/scheduled/in_iteration → designing (开发分配可 暂停/释放/保留)
 *
 * 产能语义 (为什么这些状态值得存在):
 *   pending_rat / nok   不占产能 (排队/阻塞)
 *   designing           SE 粗估消耗
 *   backlog             不占 (沙盘候选)
 *   scheduled           开发池占位消耗 —— 排序的实体化就是建池
 *   in_iteration        实名+池消耗
 *   delivered/cancelled 不占
 *
 * 准入 (designing → backlog): AR 编号可选 (正式需求填, 普通事项留空), 有则落档。
 */

export const LIFECYCLE_STATES = [
  'pending_rat',
  'nok',
  'designing',
  'backlog',
  'scheduled',
  'in_iteration',
  'delivered',
  'cancelled'
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const STATE_LABELS: Record<LifecycleState, string> = {
  pending_rat: '待RAT',
  nok: 'NOK',
  designing: '设计中',
  backlog: '待排序',
  scheduled: '已排序',
  in_iteration: '已启动迭代',
  delivered: '已交付',
  cancelled: '裁决取消'
};

/** 侧别: 状态机前半段属设计侧, 后半段属开发侧 */
export function sideOf(state: LifecycleState): 'design' | 'dev' | null {
  if (state === 'pending_rat' || state === 'nok' || state === 'designing') return 'design';
  if (state === 'backlog' || state === 'scheduled' || state === 'in_iteration') return 'dev';
  return null; // delivered / cancelled
}

/**
 * Historical reference: the pre-2026-09-21 guarded flow. The state machine no
 * longer ENFORCES this path (the human owns the flow, any jump is allowed);
 * it survives as documentation of the blessed sequence, and the advisory
 * warnings (computeWarnings) flag jumps whose side effects are missing.
 */
export const BLESSED_FLOW: Record<LifecycleState, LifecycleState[]> = {
  pending_rat: ['nok', 'designing', 'cancelled'],
  nok: ['pending_rat', 'designing', 'cancelled'],
  designing: ['nok', 'backlog', 'cancelled'],
  backlog: ['scheduled', 'designing', 'cancelled'],
  scheduled: ['in_iteration', 'designing', 'cancelled'],
  in_iteration: ['delivered', 'designing', 'cancelled'],
  delivered: [],
  cancelled: []
};

/** Dev-side role names — same source of truth as EstimationService. */
export const DEV_SIDE_ROLE_NAMES = ['开发'];

export interface TransitionInput {
  projectId: string;
  to: LifecycleState;
  external_number?: string | null;
  iteration_label?: string | null;
  note?: string | null;
  /** Only for 退回 (→ designing): what to do with dev-side assignments */
  dev_assignments_action?: 'pause' | 'release' | 'keep';
  /** Only for → scheduled: create the dev pool row that embodies the scheduling */
  pool?: {
    role_id: string;
    headcount: number;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
  };
  actor?: string | null;
}

export class LifecycleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class LifecycleService {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  private async devSideRoleIds(trx: any): Promise<string[]> {
    const rows = await trx('roles').whereIn('name', DEV_SIDE_ROLE_NAMES).select('id');
    return rows.map((r: any) => r.id);
  }

  /** Is there dev-side demand (open pool or active assignment) for the project? */
  private async hasDevSideDemand(trx: any, projectId: string): Promise<boolean> {
    const devRoleIds = await this.devSideRoleIds(trx);
    if (devRoleIds.length === 0) return false;

    const pool = await trx('project_pool_demands')
      .where({ project_id: projectId, status: 'open' })
      .whereIn('role_id', devRoleIds)
      .first('id');
    if (pool) return true;

    const spa = await trx('scenario_project_assignments')
      .where({ project_id: projectId, status: 'active' })
      .whereIn('role_id', devRoleIds)
      .first('id');
    if (spa) return true;

    const pa = await trx('project_assignments')
      .where({ project_id: projectId, status: 'active' })
      .whereIn('role_id', devRoleIds)
      .first('id');
    return Boolean(pa);
  }

  /**
   * Execute a transition with its side effects, all in one transaction.
   *
   * 2026-09-21 revision (user ruling): the human owns the flow — ANY state
   * may jump to ANY other state. The old hard TRANSITIONS guard is gone;
   * unreasonable jumps are surfaced as advisory warnings instead
   * (see computeWarnings). Only same-state and unknown states are rejected,
   * and target-state semantics (pool creation, pause/release, auto-cancel)
   * still apply.
   */
  async transition(input: TransitionInput): Promise<{ project: any; event: any }> {
    if (!LIFECYCLE_STATES.includes(input.to)) {
      throw new LifecycleError(`unknown lifecycle state '${input.to}'`);
    }

    return this.db.transaction(async (trx: any) => {
      const project = await trx('projects').where('id', input.projectId).first();
      if (!project) {
        throw new LifecycleError('project not found', 404);
      }
      if (project.lifecycle_state == null) {
        throw new LifecycleError(
          'lifecycle tracking is not applicable to this project (standing item)'
        );
      }
      const from = project.lifecycle_state as LifecycleState;
      if (from === input.to) {
        throw new LifecycleError(`project is already in '${STATE_LABELS[from]}'`);
      }

      const projectUpdate: Record<string, any> = {
        lifecycle_state: input.to,
        updated_at: trx.fn.now()
      };
      const eventRow: Record<string, any> = {
        project_id: input.projectId,
        from_state: from,
        to_state: input.to,
        note: input.note ?? null,
        actor: input.actor ?? null
      };

      switch (input.to) {
        case 'backlog': {
          // 准入: 编号 optional — 前缀(SRxxx/ARxxx)自述粒度,混排世界
          // 顶层事项既可能是 SR 也可能是 AR(2026-09-22 泛化裁决)
          if (input.external_number != null && String(input.external_number).trim() !== '') {
            projectUpdate.external_number = String(input.external_number).trim();
            eventRow.external_number = projectUpdate.external_number;
          }
          break;
        }

        case 'scheduled': {
          // 排序即建池 stays the blessed path (body.pool creates it in the
          // same call), but scheduling WITHOUT dev-side demand is no longer
          // blocked — it surfaces as the NO_DEV_DEMAND warning instead
          // (2026-09-21: human owns the flow, system advises).
          if (input.pool) {
            const headcount = Number(input.pool.headcount);
            if (!(headcount > 0 && headcount <= 10)) {
              throw new LifecycleError('pool.headcount must be between 0 and 10');
            }
            const role = await trx('roles').where('id', input.pool.role_id).first();
            if (!role) {
              throw new LifecycleError('pool.role_id does not exist');
            }
            await trx('project_pool_demands').insert({
              project_id: input.projectId,
              role_id: input.pool.role_id,
              headcount,
              start_date: input.pool.start_date || null,
              end_date: input.pool.end_date || null,
              notes: input.pool.notes || null,
              status: 'open',
              created_by: input.actor ?? null
            });
          }
          break;
        }

        case 'in_iteration': {
          if (input.iteration_label != null && String(input.iteration_label).trim() !== '') {
            projectUpdate.iteration_label = String(input.iteration_label).trim();
            eventRow.iteration_label = projectUpdate.iteration_label;
          }
          break;
        }

        case 'delivered': {
          // Open pools are meaningless after delivery
          await trx('project_pool_demands')
            .where({ project_id: input.projectId, status: 'open' })
            .update({ status: 'cancelled', updated_at: trx.fn.now() });
          break;
        }

        case 'cancelled': {
          // 全释放: pause every active assignment (rows preserved for audit),
          // cancel every open pool.
          await trx('scenario_project_assignments')
            .where({ project_id: input.projectId, status: 'active' })
            .update({ status: 'paused', updated_at: trx.fn.now() });
          await trx('project_assignments')
            .where({ project_id: input.projectId, status: 'active' })
            .update({ status: 'paused', updated_at: trx.fn.now() });
          await trx('project_pool_demands')
            .where({ project_id: input.projectId, status: 'open' })
            .update({ status: 'cancelled', updated_at: trx.fn.now() });
          break;
        }

        case 'designing': {
          // 退回设计 (方案倒退): dev assignments get paused / released / kept.
          // AR number is retained — the requirement stays analyzed.
          const action = input.dev_assignments_action ?? 'keep';
          if (action !== 'pause' && action !== 'release' && action !== 'keep') {
            throw new LifecycleError(`invalid dev_assignments_action '${action}'`);
          }
          if (action !== 'keep') {
            const devRoleIds = await this.devSideRoleIds(trx);
            if (devRoleIds.length > 0) {
              if (action === 'pause') {
                await trx('scenario_project_assignments')
                  .where({ project_id: input.projectId, status: 'active' })
                  .whereIn('role_id', devRoleIds)
                  .update({ status: 'paused', updated_at: trx.fn.now() });
                await trx('project_assignments')
                  .where({ project_id: input.projectId, status: 'active' })
                  .whereIn('role_id', devRoleIds)
                  .update({ status: 'paused', updated_at: trx.fn.now() });
              } else {
                await trx('scenario_project_assignments')
                  .where({ project_id: input.projectId })
                  .whereIn('role_id', devRoleIds)
                  .del();
                await trx('project_assignments')
                  .where({ project_id: input.projectId })
                  .whereIn('role_id', devRoleIds)
                  .del();
              }
            }
            eventRow.note = [
              input.note ?? null,
              `dev assignments ${action === 'pause' ? 'paused' : 'released'}`
            ].filter(Boolean).join(' — ');
          }
          break;
        }

        default:
          break; // pending_rat / nok: pure state changes
      }

      const [event] = await trx('project_lifecycle_events').insert(eventRow);
      const [updated] = await trx('projects')
        .where('id', input.projectId)
        .update(projectUpdate)
        .returning('*');

      return { project: updated, event: { ...eventRow, id: event } };
    });
  }

  /** Update 编号 / iteration fields without a state change (inline edits in the banner). */
  async updateFields(
    projectId: string,
    fields: { external_number?: string | null; iteration_label?: string | null }
  ): Promise<any> {
    const project = await this.db('projects').where('id', projectId).first();
    if (!project) throw new LifecycleError('project not found', 404);

    const update: Record<string, any> = { updated_at: this.db.fn.now() };
    if (fields.external_number !== undefined) {
      update.external_number = fields.external_number != null && String(fields.external_number).trim() !== ''
        ? String(fields.external_number).trim()
        : null;
    }
    if (fields.iteration_label !== undefined) {
      update.iteration_label = fields.iteration_label != null && String(fields.iteration_label).trim() !== ''
        ? String(fields.iteration_label).trim()
        : null;
    }

    const [updated] = await this.db('projects').where('id', projectId).update(update).returning('*');
    return updated;
  }

  /** Event history, newest first. */
  async listEvents(projectId: string): Promise<any[]> {
    return this.db('project_lifecycle_events')
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .select('*');
  }

  /**
   * Advisory warnings for the project's CURRENT state (状态告警 — the human
   * owns the flow; the system flags unreasonable spots, never blocks).
   * Returns machine codes; the client maps them to localized text.
   *
   * Codes:
   *  - NO_DEV_DEMAND     scheduled/in_iteration without open dev pool or
   *                      active dev assignment — capacity not locked
   *  - NO_LOC_ESTIMATE   scheduled/in_iteration without an LOC estimation
   *  - NO_DESIGN_ESTIMATE designing without a rough design estimate
   *  - DESIGN_NOT_BACKFILLED dev-side state, design estimate exists but the
   *                      actual design effort was never backfilled
   *  - DELIVERED_NOT_BACKFILLED delivered with an LOC estimation but no
   *                      post-delivery backfill
   *  - NO_ITERATION_NUMBER in_iteration without an external number — the
   *                      item entered iteration but its SR/AR number was
   *                      never filled (2026-09-22 混排裁决: 告警盯编号非空,
   *                      不区分 SR/AR — 前缀自述粒度)
   */
  async computeWarnings(projectId: string): Promise<string[]> {
    const project = await this.db('projects').where('id', projectId).first();
    if (!project || project.lifecycle_state == null) return [];
    const inputs = await this.warningInputs([projectId]);
    return this.computeWarningsForProject(project, inputs);
  }

  /** Batched inputs for warning computation across a page of projects. */
  private async warningInputs(projectIds: string[]): Promise<Map<string, any>> {
    const inputs = new Map<string, any>();
    for (const id of projectIds) {
      inputs.set(id, {
        hasOpenDevDemand: false,
        hasDesignEstimate: false,
        designBackfilled: false,
        hasLocEstimate: false,
        locBackfilled: false
      });
    }
    if (projectIds.length === 0) return inputs;

    const devRoleIds = (await this.db('roles').whereIn('name', DEV_SIDE_ROLE_NAMES).select('id'))
      .map((r: any) => r.id);

    if (devRoleIds.length > 0) {
      const poolRows = await this.db('project_pool_demands')
        .whereIn('project_id', projectIds)
        .where('status', 'open')
        .whereIn('role_id', devRoleIds)
        .select('project_id');
      const spaRows = await this.db('scenario_project_assignments')
        .whereIn('project_id', projectIds)
        .where('status', 'active')
        .whereIn('role_id', devRoleIds)
        .select('project_id');
      const paRows = await this.db('project_assignments')
        .whereIn('project_id', projectIds)
        .where('status', 'active')
        .whereIn('role_id', devRoleIds)
        .select('project_id');
      const withDemand = new Set(
        [...poolRows, ...spaRows, ...paRows].map((r: any) => r.project_id)
      );
      for (const id of projectIds) {
        if (withDemand.has(id)) inputs.get(id).hasOpenDevDemand = true;
      }
    }

    // Latest design / LOC estimations per project (is-current flag by recency)
    const designRows = await this.db('project_design_estimations')
      .whereIn('project_id', projectIds)
      .select('project_id', 'backfilled_at', 'created_at', 'id');
    for (const id of projectIds) {
      const mine = designRows.filter((r: any) => r.project_id === id)
        .sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id);
      if (mine.length > 0) {
        inputs.get(id).hasDesignEstimate = true;
        inputs.get(id).designBackfilled = Boolean(mine[0].backfilled_at);
      }
    }

    const locRows = await this.db('project_estimations')
      .whereIn('project_id', projectIds)
      .select('project_id', 'backfilled_at', 'created_at', 'id');
    for (const id of projectIds) {
      const mine = locRows.filter((r: any) => r.project_id === id)
        .sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id);
      if (mine.length > 0) {
        inputs.get(id).hasLocEstimate = true;
        inputs.get(id).locBackfilled = Boolean(mine[0].backfilled_at);
      }
    }

    return inputs;
  }

  /** Pure check: project row + warning inputs → warning codes (exported for lists). */
  computeWarningsForProject(
    project: any,
    inputs: Map<string, any>
  ): string[] {
    const state = project.lifecycle_state;
    if (!state) return [];
    const i = inputs.get(project.id);
    if (!i) return [];

    const warnings: string[] = [];
    const devSide = ['backlog', 'scheduled', 'in_iteration'].includes(state);

    if ((state === 'scheduled' || state === 'in_iteration') && !i.hasOpenDevDemand) {
      warnings.push('NO_DEV_DEMAND');
    }
    if ((state === 'scheduled' || state === 'in_iteration') && !i.hasLocEstimate) {
      warnings.push('NO_LOC_ESTIMATE');
    }
    if (state === 'designing' && !i.hasDesignEstimate) {
      warnings.push('NO_DESIGN_ESTIMATE');
    }
    if (devSide && i.hasDesignEstimate && !i.designBackfilled) {
      warnings.push('DESIGN_NOT_BACKFILLED');
    }
    if (state === 'delivered' && i.hasLocEstimate && !i.locBackfilled) {
      warnings.push('DELIVERED_NOT_BACKFILLED');
    }
    if (state === 'in_iteration' && !String(project.external_number ?? '').trim()) {
      warnings.push('NO_ITERATION_NUMBER');
    }
    return warnings;
  }

  /** Warnings for a page of project rows (batched, list-friendly). */
  async computeWarningsForProjects(projects: any[]): Promise<Map<string, string[]>> {
    const ids = projects.filter((p) => p.lifecycle_state != null).map((p) => p.id);
    const inputs = await this.warningInputs(ids);
    const out = new Map<string, string[]>();
    for (const p of projects) {
      out.set(p.id, this.computeWarningsForProject(p, inputs));
    }
    return out;
  }
}
