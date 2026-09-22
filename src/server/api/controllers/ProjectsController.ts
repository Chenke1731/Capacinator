import type { Request, Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { notificationScheduler } from '../../services/NotificationScheduler.js';
import { PhaseTemplateValidationService, type PhaseUpdateRequest } from '../../services/PhaseTemplateValidationService.js';
import { CustomPhaseManagementService, type CustomPhaseData, type PhaseUpdateData } from '../../services/CustomPhaseManagementService.js';
import { toIsoDateString } from '../../utils/isoDate.js';
import { LifecycleService } from '../../services/lifecycle/LifecycleService.js';
import { logger } from '../../services/logging/config.js';

// Alias for backward compatibility
type RequestWithLogging = RequestWithContext;

export class ProjectsController extends BaseController {
  /**
   * Create a new ProjectsController
   * @param container - Optional ServiceContainer for dependency injection
   */
  constructor(container?: ServiceContainer) {
    super({ enableLogging: true }, { container });
  }
  /**
   * Automatically inherits phases from project type template when creating a new project.
   * Creates project_phases_timeline entries with template tracking and duration constraints.
   */
  private async inheritProjectPhases(projectId: string, projectTypeId: string): Promise<void> {
    try {
      // Get all template phases for the project type with enhanced template data
      const projectTypePhases = await this.db('project_type_phases')
        .select(
          'project_type_phases.id as template_phase_id',
          'project_type_phases.order_index',
          'project_type_phases.is_mandatory',
          'project_type_phases.min_duration_days',
          'project_type_phases.max_duration_days', 
          'project_type_phases.default_duration_days',
          'project_type_phases.is_locked_order',
          'project_type_phases.template_description',
          'project_phases.id as phase_id',
          'project_phases.name as phase_name'
        )
        .leftJoin('project_phases', 'project_type_phases.phase_id', 'project_phases.id')
        .where('project_type_phases.project_type_id', projectTypeId)
        .orderBy('project_type_phases.order_index');

      if (projectTypePhases.length === 0) {
        // No template phases defined for this project type
        return;
      }

      // Get project aspiration dates for phase date calculation
      const project = await this.db('projects')
        .select('aspiration_start', 'aspiration_finish')
        .where('id', projectId)
        .first();

      // Calculate phase dates using template durations when available
      const now = new Date();
      const projectStart = project?.aspiration_start ? new Date(project.aspiration_start) : now;
      // Note: projectEnd can be used for future phase date validation

      let currentDate = new Date(projectStart);
      
      // Create timeline entries for each template phase
      const timelineEntries = projectTypePhases.map((templatePhase: Record<string, any>, index: number) => {
        const phaseDurationDays = templatePhase.default_duration_days || 30;
        const phaseStart = new Date(currentDate);
        const phaseEnd = new Date(currentDate.getTime() + (phaseDurationDays * 24 * 60 * 60 * 1000));
        
        // Move currentDate to start of next phase
        currentDate = new Date(phaseEnd);

        return {
          id: `phase-timeline-${projectId}-${templatePhase.phase_id}-${Date.now()}-${index}`,
          project_id: projectId,
          phase_id: templatePhase.phase_id,
          // ISO date strings — the canonical column format; epoch-ms numbers
          // break every string comparison downstream (e.g. dashboard stats)
          start_date: toIsoDateString(phaseStart),
          end_date: toIsoDateString(phaseEnd),
          // Template tracking fields from new schema
          phase_source: 'template',
          template_phase_id: templatePhase.template_phase_id,
          is_deletable: !templatePhase.is_mandatory,
          original_duration_days: templatePhase.default_duration_days,
          template_min_duration_days: templatePhase.min_duration_days,
          template_max_duration_days: templatePhase.max_duration_days,
          is_duration_customized: false,
          is_name_customized: false,
          template_compliance_data: JSON.stringify({
            is_mandatory: templatePhase.is_mandatory,
            is_locked_order: templatePhase.is_locked_order,
            template_description: templatePhase.template_description,
            inherited_at: new Date().toISOString()
          }),
          created_at: new Date(),
          updated_at: new Date()
        };
      });

      // Insert all template phase timeline entries
      if (timelineEntries.length > 0) {
        await this.db('project_phases_timeline').insert(timelineEntries);
      }

      // Log successful template inheritance for audit
      logger.info('Successfully inherited template phases for project', { count: timelineEntries.length, projectId, projectTypeId });
      
    } catch (error) {
      // Log the error but don't fail project creation
      logger.error('Failed to inherit template phases for project', error instanceof Error ? error : undefined, { projectId });
      throw error; // Re-throw to ensure project creation fails if template inheritance fails
    }
  }

  /**
   * Validates that a project has a mandatory project subtype.
   * Projects must be associated with active project sub-types.
   */
  /**
   * Per-project side summaries for the list's 人力 column (batched):
   * named FTE from active assignments (SE → design side, others → dev),
   * pool FTE from open pool placeholders.
   */
  private async attachStaffingSummaries(projects: any[]): Promise<void> {
    const ids = projects.map((p: any) => p.id);
    const blank = () => ({
      design: { named: 0, pool: 0, named_detail: [] as any[] },
      dev: { named: 0, pool: 0, named_detail: [] as any[] }
    });
    const summaries = new Map<string, any>();
    for (const p of projects) summaries.set(p.id, blank());
    if (ids.length === 0) return;

    const sideOf = (roleName: string) => (roleName === 'SE' ? 'design' : 'dev');

    const namedRows = await this.db('assignments_view as av')
      .join('roles as r', 'av.role_id', 'r.id')
      .join('people as pe', 'av.person_id', 'pe.id')
      .whereIn('av.project_id', ids)
      .where('av.status', 'active')
      .select('av.project_id', 'r.name as role_name', 'av.allocation_percentage', 'pe.name as person_name');
    for (const row of namedRows) {
      const s = summaries.get(row.project_id);
      if (!s) continue;
      const fte = (row.allocation_percentage ?? 0) / 100;
      const side = s[sideOf(row.role_name)];
      side.named += fte;
      side.named_detail.push({ name: row.person_name, fte });
    }

    const poolRows = await this.db('project_pool_demands as pmd')
      .join('roles as r', 'pmd.role_id', 'r.id')
      .whereIn('pmd.project_id', ids)
      .where('pmd.status', 'open')
      .select('pmd.project_id', 'r.name as role_name', 'pmd.headcount');
    for (const row of poolRows) {
      const s = summaries.get(row.project_id);
      if (!s) continue;
      s[sideOf(row.role_name)].pool += row.headcount ?? 0;
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    for (const p of projects) {
      const s = summaries.get(p.id);
      p.staffing_summary = {
        design: {
          named: round2(s.design.named),
          pool: round2(s.design.pool),
          named_detail: s.design.named_detail
            .sort((a: any, b: any) => b.fte - a.fte)
            .map((d: any) => ({ name: d.name, fte: round2(d.fte) }))
        },
        dev: {
          named: round2(s.dev.named),
          pool: round2(s.dev.pool),
          named_detail: s.dev.named_detail
            .sort((a: any, b: any) => b.fte - a.fte)
            .map((d: any) => ({ name: d.name, fte: round2(d.fte) }))
        }
      };
    }
  }

  /**
   * 规模列数据源(2026-09-22 用户真实人力排序表借鉴): 每项目最新一条评估
   * (project_estimations)换算 KLOC 与人月。只读呈现,评估仍在详情页做——
   * 计算同权,呈现分流。
   */
  private async attachEstimationSummaries(projects: any[]): Promise<void> {
    const ids = projects.map((p: any) => p.id);
    if (ids.length === 0) return;
    const rows = await this.db('project_estimations')
      .whereIn('project_id', ids)
      .orderBy('created_at')
      .select('project_id', 'estimated_loc', 'loc_rate_per_pm');
    const latest = new Map<string, any>();
    for (const row of rows) latest.set(row.project_id, row); // 有序遍历,后者覆盖=最新
    const round2 = (n: number) => Math.round(n * 100) / 100;
    for (const p of projects) {
      const e = latest.get(p.id);
      if (!e || !Number.isFinite(Number(e.estimated_loc))) {
        p.estimation_summary = null;
        continue;
      }
      const loc = Number(e.estimated_loc);
      const rate = Number(e.loc_rate_per_pm) || 500;
      p.estimation_summary = { kloc: round2(loc / 1000), pm: round2(loc / rate) };
    }
  }

  /**
   * 看板规划数据源(BOARD_REDESIGN_2026-09-23 §9): 迭代挂接/设计粗估分量/
   * SE·MDE 分配/开发主投入——批量为列表页挂载。分配读 assignments_view
   * (场景感知,与人力汇总同源);主投入标记在场景分配表(063c)。
   */
  private async attachBoardPlanning(projects: any[]): Promise<void> {
    const ids = projects.map((p: any) => p.id);
    if (ids.length === 0) return;

    const iterRows = await this.db('projects as p')
      .leftJoin('iterations as i', 'p.iteration_id', 'i.id')
      .whereIn('p.id', ids)
      .select('p.id as pid', 'i.id as iter_id', 'i.name as iter_name',
              'i.start_date as iter_start', 'i.end_date as iter_end');
    const iterBy = new Map(iterRows.map((r: any) => [r.pid, r]));

    const deRows = await this.db('project_design_estimations')
      .whereIn('project_id', ids).orderBy('created_at').orderBy('id')
      .select('project_id', 'se_estimate_pm', 'mde_estimate_pm');
    const deBy = new Map<string, any>();
    for (const r of deRows) deBy.set(r.project_id, r); // 有序遍历,后者=最新

    const roleRows = await this.db('assignments_view as av')
      .join('roles as r', 'av.role_id', 'r.id')
      .join('people as pe', 'av.person_id', 'pe.id')
      .whereIn('av.project_id', ids)
      .where('av.status', 'active')
      .whereIn('r.name', ['SE', 'MDE'])
      .select('av.id as av_id', 'av.project_id', 'r.name as role_name', 'pe.name as person_name',
              'av.allocation_percentage', 'av.start_date', 'av.end_date');
    const seBy = new Map<string, any>();
    const mdeBy = new Map<string, any>();
    for (const r of roleRows) {
      (r.role_name === 'SE' ? seBy : mdeBy).set(r.project_id, {
        id: r.av_id,
        person_name: r.person_name,
        allocation_pct: Number(r.allocation_percentage ?? 0),
        start_date: r.start_date ?? null,
        end_date: r.end_date ?? null
      });
    }

    const primaryRows = await this.db('scenario_project_assignments as spa')
      .join('people as pe', 'spa.person_id', 'pe.id')
      .join('roles as r', 'spa.role_id', 'r.id')
      .whereIn('spa.project_id', ids)
      .where('spa.is_primary', 1)
      .where('spa.status', 'active')
      .select('spa.id as spa_id', 'spa.project_id', 'pe.name as person_name', 'r.name as role_name',
              'spa.allocation_percentage', 'spa.start_date', 'spa.end_date');
    const primaryBy = new Map(primaryRows.map((r: any) => [r.project_id, r]));

    for (const p of projects) {
      const it: any = iterBy.get(p.id);
      p.iteration = it?.iter_id
        ? { id: it.iter_id, name: it.iter_name, start_date: it.iter_start, end_date: it.iter_end }
        : null;
      const de: any = deBy.get(p.id);
      p.design_estimates = de
        ? { se: de.se_estimate_pm ?? null, mde: de.mde_estimate_pm ?? null }
        : null;
      p.se_assignment = seBy.get(p.id) ?? null;
      p.mde_assignment = mdeBy.get(p.id) ?? null;
      const pr: any = primaryBy.get(p.id);
      // 告警推导用的行内事实(告警计算不回表)
      p.iter_start_date = it?.iter_start ?? null;
      p.iter_end_date = it?.iter_end ?? null;
      p.primary_dev_name = pr?.person_name ?? null;
      p.mde_person_name = mdeBy.get(p.id)?.person_name ?? null;
      p.primary_dev = pr
        ? { id: pr.spa_id, person_name: pr.person_name, role_name: pr.role_name,
            allocation_pct: Number(pr.allocation_percentage ?? 0),
            start_date: pr.start_date ?? null, end_date: pr.end_date ?? null }
        : null;
    }
  }

  /** SR→AR 一层父子: 父必须存在且自身无父(禁止 SR 套 SR),禁止自引用。
      返回错误文案或 null;调用方以 400 响应(语义错误不是服务器错误)。 */
  private async validateParent(projectId: string | null, parentId: string | null): Promise<string | null> {
    if (!parentId) return null;
    if (parentId && projectId && parentId === projectId) {
      return 'Project cannot be its own parent';
    }
    const parent = await this.db('projects').where('id', parentId).first();
    if (!parent) {
      return 'Parent project not found';
    }
    if (parent.parent_id) {
      return 'Only one level of decomposition is allowed (the parent is already an AR child)';
    }
    return null;
  }

  private async validateProjectSubType(projectTypeId: string, projectSubTypeId: string): Promise<void> {
    // project_sub_type_id is now mandatory
    if (!projectSubTypeId) {
      throw new Error('Project sub-type is required for all projects');
    }

    // Check if project type exists
    const projectType = await this.db('project_types')
      .select('id', 'name')
      .where('id', projectTypeId)
      .first();

    if (!projectType) {
      throw new Error(`Project type with ID ${projectTypeId} not found`);
    }

    // Validate the project sub-type
    const projectSubType = await this.db('project_sub_types')
      .select('id', 'name', 'project_type_id', 'is_active')
      .where('id', projectSubTypeId)
      .first();

    if (!projectSubType) {
      throw new Error(`Project sub-type with ID ${projectSubTypeId} not found`);
    }

    if (projectSubType.project_type_id !== projectTypeId) {
      throw new Error(`Project sub-type "${projectSubType.name}" does not belong to project type "${projectType.name}"`);
    }

    if (!projectSubType.is_active) {
      throw new Error(`Project sub-type "${projectSubType.name}" is not active`);
    }
  }
  async debugQuery(req: Request, res: Response) {
    const testQuery = await this.db('projects')
      .select('id', 'name')
      .select(this.db.raw('(SELECT MIN(start_date) FROM project_phases_timeline WHERE project_id = projects.id) as start_date'))
      .select(this.db.raw('(SELECT MAX(end_date) FROM project_phases_timeline WHERE project_id = projects.id) as end_date'))
      .limit(3);
    
    res.json({ debug: testQuery });
  }

  getAll = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const filters = {
      location_id: req.query.location_id,
      project_type_id: req.query.project_type_id,
      priority: req.query.priority,
      include_in_demand: req.query.include_in_demand
    };

    const result = await this.executeQuery(async () => {
      let query = this.db('projects')
        .leftJoin('locations', 'projects.location_id', 'locations.id')
        .leftJoin('project_types', 'projects.project_type_id', 'project_types.id')
        .leftJoin('project_sub_types', 'projects.project_sub_type_id', 'project_sub_types.id')
        .leftJoin('people as owner', 'projects.owner_id', 'owner.id')
        .leftJoin('project_phases as current_phase', 'projects.current_phase_id', 'current_phase.id')
        .select(
          'projects.id',
        'projects.seq_number',
        'projects.iteration_id',
          'projects.name',
          'projects.description',
          'projects.priority',
          'projects.project_type_id',
          'projects.project_sub_type_id',
          'projects.location_id',
          'projects.owner_id',
          'projects.current_phase_id',
          'projects.aspiration_start',
          'projects.aspiration_finish',
          'projects.include_in_demand',
          'projects.data_restrictions',
          'projects.external_id',
          'projects.lifecycle_state',
          'projects.external_number',
          'projects.product_version',
          'projects.release_version',
          'projects.component',
          'projects.parent_id',
          'projects.iteration_label',
          'projects.created_at',
          'projects.updated_at',
          'locations.name as location_name',
          'project_types.name as project_type_name',
          this.db.raw('COALESCE(project_sub_types.color_code, project_types.color_code) as project_type_color_code'),
          'project_sub_types.name as project_sub_type_name',
          'owner.name as owner_name',
          'current_phase.name as current_phase_name',
          // Calculate start_date and end_date from project phases timeline
          this.db.raw(`(
            SELECT MIN(start_date)
            FROM project_phases_timeline
            WHERE project_id = projects.id
          ) as start_date`),
          this.db.raw(`(
            SELECT MAX(end_date)
            FROM project_phases_timeline
            WHERE project_id = projects.id
          ) as end_date`),
          // Design deadline = 设计 phase timeline end date (lifecycle banner)
          this.db.raw(`(
            SELECT ppt.end_date FROM project_phases_timeline ppt
            JOIN project_phases pp ON ppt.phase_id = pp.id
            WHERE ppt.project_id = projects.id AND pp.name = '设计'
            ORDER BY ppt.end_date ASC LIMIT 1
          ) as design_deadline`)
        );

      // Lifecycle state filter: 'none' selects standing items without a lifecycle
      if (req.query.lifecycle_state !== undefined && req.query.lifecycle_state !== '') {
        if (req.query.lifecycle_state === 'none') {
          query.whereNull('projects.lifecycle_state');
        } else {
          query.where('projects.lifecycle_state', req.query.lifecycle_state);
        }
      }

      // Apply filters manually to avoid ambiguous column names
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'project_type_id') {
            query.where('projects.project_type_id', value);
          } else if (key === 'location_id') {
            query.where('projects.location_id', value);
          } else if (typeof value === 'string' && value.includes('%')) {
            query.where(`projects.${key}`, 'like', value);
          } else {
            query.where(`projects.${key}`, value);
          }
        }
      });

      // Tag filter: ?tag_id=<id> — tags are pure classification (no calc
      // semantics); the [预留] prefix convention has been retired
      if (req.query.tag_id) {
        query.whereExists((sub: any) => {
          sub.select('*')
            .from('project_tags as pt')
            .whereRaw('pt.project_id = projects.id')
            .where('pt.tag_id', req.query.tag_id);
        });
      }

      // Count with the same filters as the list (cloned before pagination)
      const countQuery = query.clone().clearSelect().clearOrder();
      query = this.paginate(query, page, limit);

      const projects = await query;

      // Attach tags (id/name/color) to each project row
      const pageIds = projects.map((p: any) => p.id);
      const tagRows = pageIds.length
        ? await this.db('project_tags as pt')
            .join('tags', 'pt.tag_id', 'tags.id')
            .whereIn('pt.project_id', pageIds)
            .select('pt.project_id', 'tags.id', 'tags.name', 'tags.color')
        : [];
      const tagsByProject = new Map<string, any[]>();
      for (const row of tagRows) {
        const list = tagsByProject.get(row.project_id) ?? [];
        list.push({ id: row.id, name: row.name, color: row.color });
        tagsByProject.set(row.project_id, list);
      }

      // Advisory lifecycle warnings (状态告警) + 人力汇总 — batched for the page
      const lifecycleService = new LifecycleService(this.db);
      const warningsByProject = await lifecycleService.computeWarningsForProjects(projects);
      await this.attachStaffingSummaries(projects);
      await this.attachEstimationSummaries(projects);
      await this.attachBoardPlanning(projects);

      for (const project of projects) {
        project.tags = tagsByProject.get(project.id) ?? [];
        project.lifecycle_warnings = warningsByProject.get(project.id) ?? [];
      }

      // DEBUG: Test if raw SQL is working
      const testQuery = await this.db('projects')
        .select('id', 'name')
        .select(this.db.raw('(SELECT MIN(start_date) FROM project_phases_timeline WHERE project_id = projects.id) as start_date'))
        .limit(1);
      req.logger.debug('Test query result', { testQuery: testQuery[0] });

      const total = await countQuery.count('* as count').first();

      return {
        data: projects,
        pagination: {
          page,
          limit,
          total: Number(total?.count) || 0,
          totalPages: Math.ceil((Number(total?.count) || 0) / limit)
        }
      };
    }, req, res, 'Failed to fetch projects');

    if (result) {
      this.sendPaginatedResponse(req, res, result.data, result.pagination.total, result.pagination.page, result.pagination.limit);
    }
  })

  getById = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const project = await this.db('projects')
        .leftJoin('locations', 'projects.location_id', 'locations.id')
        .leftJoin('project_types', 'projects.project_type_id', 'project_types.id')
        .leftJoin('project_sub_types', 'projects.project_sub_type_id', 'project_sub_types.id')
        .leftJoin('people as owner', 'projects.owner_id', 'owner.id')
        .leftJoin('project_phases as current_phase', 'projects.current_phase_id', 'current_phase.id')
        .select(
          'projects.id',
        'projects.seq_number',
        'projects.iteration_id',
          'projects.name',
          'projects.description',
          'projects.priority',
          'projects.project_type_id',
          'projects.project_sub_type_id',
          'projects.location_id',
          'projects.owner_id',
          'projects.current_phase_id',
          'projects.aspiration_start',
          'projects.aspiration_finish',
          'projects.include_in_demand',
          'projects.data_restrictions',
          'projects.external_id',
          'projects.lifecycle_state',
          'projects.external_number',
          'projects.product_version',
          'projects.release_version',
          'projects.component',
          'projects.parent_id',
          'projects.iteration_label',
          'projects.created_at',
          'projects.updated_at',
          'locations.name as location_name',
          'project_types.name as project_type_name',
          this.db.raw('COALESCE(project_sub_types.color_code, project_types.color_code) as project_type_color_code'),
          'project_sub_types.name as project_sub_type_name',
          'owner.name as owner_name',
          'current_phase.name as current_phase_name',
          // Calculate start_date and end_date from project phases timeline
          this.db.raw(`(
            SELECT MIN(start_date)
            FROM project_phases_timeline
            WHERE project_id = projects.id
          ) as start_date`),
          this.db.raw(`(
            SELECT MAX(end_date)
            FROM project_phases_timeline
            WHERE project_id = projects.id
          ) as end_date`),
          // Design deadline = 设计 phase timeline end date (lifecycle banner)
          this.db.raw(`(
            SELECT ppt.end_date FROM project_phases_timeline ppt
            JOIN project_phases pp ON ppt.phase_id = pp.id
            WHERE ppt.project_id = projects.id AND pp.name = '设计'
            ORDER BY ppt.end_date ASC LIMIT 1
          ) as design_deadline`)
        )
        .where('projects.id', id)
        .first();

      if (!project) {
        this.handleNotFound(req, res, 'Project');
        return null;
      }

      // Attach tags (consistent with the list endpoint)
      project.tags = await this.db('project_tags as pt')
        .join('tags', 'pt.tag_id', 'tags.id')
        .where('pt.project_id', id)
        .select('tags.id', 'tags.name', 'tags.color');

      // Get phases timeline
      const phases = await this.db('project_phases_timeline')
        .join('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name',
          'project_phases.description as phase_description'
        )
        .where('project_phases_timeline.project_id', id)
        .orderBy('project_phases_timeline.start_date');

      // Get assignments — from assignments_view so scenario-written rows and
      // pause status are included (both base and active-scenario rows)
      const assignments = await this.db('assignments_view as av')
        .join('people', 'av.person_id', 'people.id')
        .join('roles', 'av.role_id', 'roles.id')
        .select(
          'av.*',
          'people.name as person_name',
          'roles.name as role_name'
        )
        .where('av.project_id', id)
        .orderBy('av.computed_start_date');

      // Get pool demands (role-side quantity demand without named persons)
      const pool_demands = await this.db('project_pool_demands as pmd')
        .leftJoin('roles as r', 'pmd.role_id', 'r.id')
        .where('pmd.project_id', id)
        .orderBy('pmd.created_at', 'desc')
        .select('pmd.*', 'r.name as role_name');

      // Get planners
      const planners = await this.db('project_planners')
        .join('people', 'project_planners.person_id', 'people.id')
        .select(
          'project_planners.*',
          'people.name as person_name'
        )
        .where('project_planners.project_id', id)
        .orderBy('project_planners.is_primary_planner', 'desc');

      // Advisory lifecycle warnings (状态告警) + 人力汇总
      const lifecycleService = new LifecycleService(this.db);
      const lifecycle_warnings = project.lifecycle_state != null
        ? await lifecycleService.computeWarnings(id)
        : [];
      const projectForSummary = [project];
      await this.attachStaffingSummaries(projectForSummary);
      await this.attachEstimationSummaries(projectForSummary);
      await this.attachBoardPlanning(projectForSummary);

      return {
        ...project,
        phases,
        assignments,
        pool_demands,
        planners,
        lifecycle_warnings,
        staffing_summary: projectForSummary[0].staffing_summary
      };
    }, req, res, 'Failed to fetch project');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  create = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const projectData = req.body;

    const result = await this.executeQuery(async () => {
      // Validate project type and sub-type relationship
      await this.validateProjectSubType(projectData.project_type_id, projectData.project_sub_type_id);
      // SR→AR 分解: 新建即挂父(仅一层)
      if (projectData.parent_id) {
        const parentErr = await this.validateParent(null, projectData.parent_id);
        if (parentErr) {
          res.status(400).json({ error: 'Validation error', message: parentErr });
          return null;
        }
      }

      // Generate ID for SQLite compatibility
      const projectId = projectData.id || `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // tag_ids is a junction-table payload, not a projects column
      const tagIds: Array<number | string> = Array.isArray(projectData.tag_ids) ? projectData.tag_ids : [];
      const sanitizedData = { ...projectData };
      delete sanitizedData.tag_ids;
      const nullableForeignKeys = ['owner_id', 'project_sub_type_id', 'current_phase_id'];
      
      nullableForeignKeys.forEach(field => {
        if (sanitizedData[field] === '') {
          sanitizedData[field] = null;
        }
      });
      
      // 引用码序号: max+1(单用户无并发竞争;唯一索引兜底拒绝重复)
      const maxRow = await this.db('projects').max('seq_number as maxSeq').first();
      const nextSeq = Number(maxRow?.maxSeq ?? 0) + 1;

      const projectToInsert = {
        id: projectId,
        seq_number: nextSeq,
        ...sanitizedData,
        project_type_id: sanitizedData.project_sub_type_id ?
          (await this.db('project_sub_types').where('id', sanitizedData.project_sub_type_id).first())?.project_type_id :
          sanitizedData.project_type_id,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Trackable item types enter the lifecycle at 待RAT; standing types
      // (问题单支持/项目事务) have no lifecycle (NULL)
      const typeName = projectToInsert.project_type_id
        ? (await this.db('project_types').where('id', projectToInsert.project_type_id).first())?.name
        : null;
      const lifecycleEnabled = ['需求交付', '零星事项'].includes(typeName);
      if (lifecycleEnabled) {
        projectToInsert.lifecycle_state = 'pending_rat';
      }

      await this.db('projects').insert(projectToInsert);

      if (lifecycleEnabled) {
        await this.db('project_lifecycle_events').insert({
          project_id: projectId,
          from_state: null,
          to_state: 'pending_rat',
          note: 'auto: project created',
          actor: req.user?.id ?? null
        });
      }

      // Apply tags
      if (tagIds.length > 0) {
        await this.db('project_tags').insert(
          tagIds.map((tagId) => ({ project_id: projectId, tag_id: tagId }))
        );
      }

      // Auto-inherit phases from project type
      await this.inheritProjectPhases(projectId, projectToInsert.project_type_id);
      
      // Fetch the created project
      const project = await this.db('projects').where('id', projectId).first();

      // Log audit event for project creation
      if (project) {
        await (req as any).logAuditEvent('projects', project.id, 'CREATE', undefined, project);
        this.logBusinessOperation(req, 'CREATE', 'project', project.id, {
          projectName: project.name,
          projectType: projectData.project_type_id
        });
      }

      return project;
    }, req, res, 'Failed to create project');

    if (result) {
      this.sendSuccess(req, res, result, 'Project created successfully');
    }
  })

  update = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const result = await this.executeQuery(async () => {
      // Get current project to track timeline changes
      const currentProject = await this.db('projects').where('id', id).first();
      
      // Validate project type and sub-type relationship
      if (updateData.project_type_id || updateData.project_sub_type_id) {
        const typeId = updateData.project_type_id || currentProject?.project_type_id;
        const subTypeId = updateData.project_sub_type_id || currentProject?.project_sub_type_id;
        
        await this.validateProjectSubType(typeId, subTypeId);
      }

      // tag_ids is a junction-table payload, not a projects column
      const tagIdsProvided = Array.isArray(updateData.tag_ids);
      const tagIds: Array<number | string> = tagIdsProvided ? updateData.tag_ids : [];
      const sanitizedData = { ...updateData };
      delete sanitizedData.tag_ids;

      // 迭代挂接(事实字段,设计 §0.6): 值必须存在于迭代表(空=解除挂接)
      if ('iteration_id' in sanitizedData) {
        const iterId = sanitizedData.iteration_id || null;
        if (iterId) {
          const it = await this.db('iterations').where({ id: iterId }).first();
          if (!it) {
            res.status(400).json({ error: 'Validation error', message: '迭代不存在' });
            return null;
          }
        }
        sanitizedData.iteration_id = iterId;
      }
      // se/mde 粗估分量: 看板就地编辑走 update 端点,服务端映射到最新设计
      // 粗估记录(无则创建,总量=分量和;实施日志 D3/D5)
      const seEst = sanitizedData.se_estimate_pm;
      const mdeEst = sanitizedData.mde_estimate_pm;
      delete sanitizedData.se_estimate_pm;
      delete sanitizedData.mde_estimate_pm;

      // Lifecycle fields are owned by the state machine endpoints only
      // (POST /projects/:id/lifecycle/*) — never by the generic update.
      // external_number 例外: 2026-09-22 起允许就地编辑(需求台 AR 号内联),
      // lifecycle 端点的 RAT 回填语义不变。
      delete sanitizedData.lifecycle_state;
      delete sanitizedData.iteration_label;
      if (sanitizedData.parent_id !== undefined) {
        const parentErr = await this.validateParent(id, sanitizedData.parent_id);
        if (parentErr) {
          res.status(400).json({ error: 'Validation error', message: parentErr });
          return null;
        }
      }

      // Sanitize foreign key fields - convert empty strings to null
      const nullableForeignKeys = ['owner_id', 'project_sub_type_id', 'current_phase_id'];
      
      nullableForeignKeys.forEach(field => {
        if (sanitizedData[field] === '') {
          sanitizedData[field] = null;
        }
      });

      await this.db('projects')
        .where('id', id)
        .update({
          ...sanitizedData,
          updated_at: new Date()
        });

      // 设计粗估分量落最新记录(D3): 有分量入参时写
      if (seEst !== undefined || mdeEst !== undefined) {
        const latest = await this.db('project_design_estimations')
          .where({ project_id: id }).orderBy('created_at').orderBy('id').first();
        const nextSe = seEst !== undefined ? (Number(seEst) || null) : undefined;
        const nextMde = mdeEst !== undefined ? (Number(mdeEst) || null) : undefined;
        if (latest) {
          await this.db('project_design_estimations').where({ id: latest.id }).update({
            ...(nextSe !== undefined ? { se_estimate_pm: nextSe } : {}),
            ...(nextMde !== undefined ? { mde_estimate_pm: nextMde } : {}),
            updated_at: new Date()
          });
        } else {
          await this.db('project_design_estimations').insert({
            project_id: id,
            estimated_design_pm: Number(nextSe ?? 0) + Number(nextMde ?? 0),
            se_estimate_pm: nextSe ?? null,
            mde_estimate_pm: nextMde ?? null
          });
        }
      }

      // Replace the project's tag set when tag_ids was provided
      if (tagIdsProvided) {
        await this.db('project_tags').where('project_id', id).del();
        if (tagIds.length > 0) {
          await this.db('project_tags').insert(
            tagIds.map((tagId) => ({ project_id: id, tag_id: tagId }))
          );
        }
      }

      // Fetch the updated project
      const project = await this.db('projects').where('id', id).first();

      if (!project) {
        this.handleNotFound(req, res, 'Project');
        return null;
      }

      // Send timeline change notifications if dates changed
      if (currentProject && (updateData.aspiration_start || updateData.aspiration_finish)) {
        try {
          const oldStart = currentProject.aspiration_start ? new Date(currentProject.aspiration_start) : null;
          const newStart = updateData.aspiration_start ? new Date(updateData.aspiration_start) : oldStart;
          const oldEnd = currentProject.aspiration_finish ? new Date(currentProject.aspiration_finish) : null;
          const newEnd = updateData.aspiration_finish ? new Date(updateData.aspiration_finish) : oldEnd;
          
          // Only send if dates actually changed
          if ((oldStart?.getTime() !== newStart?.getTime()) || (oldEnd?.getTime() !== newEnd?.getTime())) {
            await notificationScheduler.sendProjectTimelineNotification(
              id,
              oldStart,
              newStart,
              oldEnd,
              newEnd
            );
          }
        } catch (error) {
          req.logger.error('Failed to send project timeline notification', error, {
            projectId: id,
            userId: (req as any).user?.id
          });
        }
      }

      // Log audit event for project update
      if (project) {
        await (req as any).logAuditEvent('projects', id, 'UPDATE', currentProject, project);
        this.logBusinessOperation(req, 'UPDATE', 'project', id, {
          projectName: project.name,
          fieldsUpdated: Object.keys(updateData)
        });
      }

      return project;
    }, req, res, 'Failed to update project');

    if (result) {
      this.sendSuccess(req, res, result, 'Project updated successfully');
    }
  })

  delete = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      // Get project data before deletion for audit
      const project = await this.db('projects').where('id', id).first();
      
      if (!project) {
        this.handleNotFound(req, res, 'Project');
        return null;
      }

      // SR→AR: 有子行的父(SR)不可直接删——先分解处理子行
      const childCount = await this.db('projects').where('parent_id', id).count('* as c').first();
      if (Number(childCount?.c ?? 0) > 0) {
        res.status(409).json({
          error: 'Conflict',
          message: `Project still has ${childCount.c} child items — delete or re-parent them first`
        });
        return null;
      }

      await this.db('projects')
        .where('id', id)
        .del();

      // Log audit event for project deletion
      await (req as any).logAuditEvent('projects', id, 'DELETE', project, undefined);
      this.logBusinessOperation(req, 'DELETE', 'project', id, {
        projectName: project.name
      });

      return { message: 'Project deleted successfully' };
    }, req, res, 'Failed to delete project');

    if (result) {
      this.sendSuccess(req, res, result, result.message);
    }
  })

  getHealth = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const result = await this.executeQuery(async () => {
      const healthData = await this.db('project_health_view').select('*');
      return healthData;
    }, req, res, 'Failed to fetch project health data');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  getDemands = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const demands = await this.db('project_demands_view')
        .join('roles', 'project_demands_view.role_id', 'roles.id')
        .select(
          'project_demands_view.*',
          'roles.name as role_name'
        )
        .where('project_demands_view.project_id', id)
        .orderBy('project_demands_view.start_date');

      return demands;
    }, req, res, 'Failed to fetch project demands');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  deleteTestData = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const result = await this.executeQuery(async () => {
      // Delete test projects (ones with "Test_" in name)
      const deleted = await this.db('projects')
        .where('name', 'like', 'Test_%')
        .del();

      return { message: `Deleted ${deleted} test projects` };
    }, req, res, 'Failed to delete test data');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  /**
   * Validates phase updates against template constraints
   */
  validatePhaseUpdates = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId } = req.params;
    const { updates } = req.body as { updates: PhaseUpdateRequest[] };

    if (!updates || !Array.isArray(updates)) {
      return this.sendError(req, res, 'Invalid updates array provided', 400);
    }

    const result = await this.executeQuery(async () => {
      const validationService = new PhaseTemplateValidationService(this.db);
      return await validationService.validatePhaseUpdates(projectId, updates);
    }, req, res, 'Failed to validate phase updates');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  /**
   * Validates adding a custom phase to a project
   */
  validateCustomPhase = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId } = req.params;
    const { phaseName, insertIndex } = req.body as { phaseName: string; insertIndex?: number };

    if (!phaseName) {
      return this.sendError(req, res, 'Phase name is required', 400);
    }

    const result = await this.executeQuery(async () => {
      const validationService = new PhaseTemplateValidationService(this.db);
      return await validationService.validateCustomPhaseAddition(projectId, phaseName, insertIndex);
    }, req, res, 'Failed to validate custom phase addition');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  /**
   * Gets template compliance summary for a project
   */
  getTemplateCompliance = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId } = req.params;

    const result = await this.executeQuery(async () => {
      const validationService = new PhaseTemplateValidationService(this.db);
      return await validationService.getProjectTemplateCompliance(projectId);
    }, req, res, 'Failed to get template compliance');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  /**
   * Gets project timeline with phases and their details
   */
  getProjectTimeline = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId } = req.params;

    const result = await this.executeQuery(async () => {
      // Get project phases timeline
      const timeline = await this.db('project_phases_timeline')
        .leftJoin('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name',
          'project_phases.description as phase_description'
        )
        .where('project_phases_timeline.project_id', projectId)
        .orderBy('project_phases_timeline.start_date');

      return {
        projectId,
        phases: timeline.map((phase: any) => ({
          id: phase.id,
          phase_id: phase.phase_id,
          name: phase.phase_name,
          description: phase.phase_description,
          start_date: phase.start_date,
          end_date: phase.end_date,
          duration_days: phase.duration_days,
          phase_source: phase.phase_source,
          template_phase_id: phase.template_phase_id,
          is_deletable: phase.is_deletable,
          is_duration_customized: phase.is_duration_customized,
          is_name_customized: phase.is_name_customized,
          template_compliance_data: phase.template_compliance_data ? 
            JSON.parse(phase.template_compliance_data) : null
        }))
      };
    }, req, res, 'Failed to get project timeline');

    if (result) {
      this.sendSuccess(req, res, result);
    }
  })

  /**
   * Adds a custom phase to a project
   */
  addCustomPhase = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId } = req.params;
    const phaseData = req.body as CustomPhaseData;

    if (!phaseData.name) {
      return this.sendError(req, res, 'Phase name is required', 400);
    }

    const result = await this.executeQuery(async () => {
      const phaseService = new CustomPhaseManagementService(this.db);
      return await phaseService.addCustomPhase(projectId, phaseData);
    }, req, res, 'Failed to add custom phase');

    if (result) {
      if (result.success) {
        this.sendSuccess(req, res, result);
      } else {
        this.sendError(req, res, result.message, 400);
      }
    }
  })

  /**
   * Updates a project phase
   */
  updateProjectPhase = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId, phaseTimelineId } = req.params;
    const updateData = req.body as PhaseUpdateData;

    const result = await this.executeQuery(async () => {
      const phaseService = new CustomPhaseManagementService(this.db);
      return await phaseService.updatePhase(projectId, phaseTimelineId, updateData);
    }, req, res, 'Failed to update project phase');

    if (result) {
      if (result.success) {
        this.sendSuccess(req, res, result);
      } else {
        this.sendError(req, res, result.message, 400);
      }
    }
  })

  /**
   * Deletes a project phase
   */
  deleteProjectPhase = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id: projectId, phaseTimelineId } = req.params;

    const result = await this.executeQuery(async () => {
      const phaseService = new CustomPhaseManagementService(this.db);
      return await phaseService.deletePhase(projectId, phaseTimelineId);
    }, req, res, 'Failed to delete project phase');

    if (result) {
      if (result.success) {
        this.sendSuccess(req, res, result);
      } else {
        this.sendError(req, res, result.message, 400);
      }
    }
  })
}