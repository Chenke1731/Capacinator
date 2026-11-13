import type { Response } from 'express';
import type { Knex } from 'knex';
import { BaseController, RequestWithContext } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { transformDates, transformDatesInArray, COMMON_DATE_FIELDS } from '../../utils/dateTransform.js';
import { notificationScheduler } from '../../services/NotificationScheduler.js';
import { BASELINE_SCENARIO_ID, activeAssignmentsInScenario, resolveScenarioId } from '../../services/calc/effectiveAssignments.js';
import { evaluateWindowCapacity } from '../../services/calc/capacitySegments.js';
import { computeAssignmentDates } from '../../services/calc/assignmentDates.js';

// Alias for backward compatibility with existing code
type RequestWithLogging = RequestWithContext;

/** 可写字段白名单：身份列（id/scenario_id/person_id/project_id/role_id）永不由
 *  update 载荷修改；create 的项目/人员/角色单独取。 */
const ASSIGNMENT_CREATE_FIELDS = [
  'project_id', 'person_id', 'role_id', 'phase_id', 'allocation_percentage',
  'assignment_date_mode', 'start_date', 'end_date', 'notes', 'is_primary'
] as const;
const ASSIGNMENT_UPDATE_FIELDS = [
  'phase_id', 'allocation_percentage', 'assignment_date_mode', 'start_date',
  'end_date', 'notes', 'status', 'is_primary'
] as const;

function pickAssignmentFields(body: Record<string, any>, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, field)) out[field] = body[field];
  }
  if (Object.prototype.hasOwnProperty.call(out, 'phase_id')) {
    out.phase_id = out.phase_id === '' ? null : out.phase_id;
  }
  return out;
}

/** 严格归一为真实日历日：接受 YYYY-MM-DD / ISO datetime / Date / epoch 毫秒，
 *  统一输出 UTC 日历日；2026-02-30、非法串和 NaN 一律拒绝。空值用 null
 *  表示显式清空（是否允许由调用方的日期模式决定）。 */
function parseAssignmentDate(value: unknown): { value: string | null; invalid: boolean } {
  if (value === null || value === undefined) return { value: null, invalid: false };

  let date: Date;
  let dateOnlyText: string | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { value: null, invalid: true };
    date = new Date(value);
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return { value: null, invalid: false };
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      dateOnlyText = text;
      date = new Date(`${text}T00:00:00Z`);
    } else if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) {
      date = new Date(text.replace(' ', 'T'));
    } else {
      return { value: null, invalid: true };
    }
  } else {
    return { value: null, invalid: true };
  }

  if (Number.isNaN(date.getTime())) return { value: null, invalid: true };
  const normalized = date.toISOString().slice(0, 10);
  if (dateOnlyText && normalized !== dateOnlyText) {
    return { value: null, invalid: true };
  }
  return { value: normalized, invalid: false };
}

function allocationValidationError(value: unknown): string | null {
  // 字符串 '30' 必须拒绝：容量求和会变成 '030' 拼接而不是 30。
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Allocation percentage must be a number between 0 and 200';
  }
  if (value <= 0) return 'Allocation percentage must be positive';
  if (value > 200) return 'Allocation percentage cannot exceed 200%';
  return null;
}

const DATE_TOUCH_FIELDS = ['start_date', 'end_date', 'assignment_date_mode', 'phase_id'] as const;

/** 业务冲突（409）：携带稳定 code + 可定位数据；由 controller 直接回写。 */
class AssignmentWriteConflict extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly payload: Record<string, any>
  ) {
    super(String(payload.message ?? 'Assignment conflict'));
    this.name = 'AssignmentWriteConflict';
  }
}

// ============================================================================
// Assignment Types
// ============================================================================

/**
 * Assignment row from database view
 */
interface AssignmentRow {
  id: string;
  person_id: string;
  project_id: string;
  role_id: string;
  phase_id?: string;
  start_date?: string;
  end_date?: string;
  allocation_percentage: number;
  assignment_date_mode?: 'fixed' | 'project' | 'phase';
  notes?: string;
  scenario_id?: string;
  computed_start_date?: string;
  computed_end_date?: string;
  project_name?: string;
  person_name?: string;
  role_name?: string;
  phase_name?: string;
  aspiration_start?: string;
  aspiration_finish?: string;
}

/**
 * Person row for suggestions and capacity calculations
 */
interface PersonRow {
  id: string;
  name: string;
  email?: string;
  primary_role_id?: string;
  supervisor_id?: string;
  worker_type?: 'FTE' | 'Contractor' | 'Consultant';
  default_availability_percentage: number;
  default_hours_per_day: number;
  role_name?: string;
  total_allocation?: number;
  proficiency_level?: string;
}

/**
 * Availability override row
 */
interface AvailabilityOverrideRow {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string;
  availability_percentage: number;
  hours_per_day?: number;
  reason?: string;
  override_type?: string;
}

/**
 * Assignment with overlapping info
 */
interface OverlappingAssignment extends AssignmentRow {
  person_name: string;
  project_name: string;
}

interface AssignmentConflict {
  person_id: string;
  person_name: string;
  conflicting_projects: Array<{
    project_name: string;
    start_date: string;
    end_date: string;
    allocation_percentage: number;
  }>;
  total_allocation: number;
  available_capacity: number;
  /** IP-03a: 超载区间(日期边界分段)——峰值口径下报告哪些段超载 */
  overload_segments?: Array<{ start: string; end: string; capacityPct: number; loadPct: number }>;
}

/**
 * Overlapping assignment group for conflict detection
 */
interface OverlappingGroup {
  period: {
    start: string | undefined;
    end: string | undefined;
  };
  assignments: AssignmentRow[];
  total_allocation: number;
  is_overallocated: boolean;
  overallocation_amount: number;
}

/**
 * Timeline summary for person assignments
 */
interface TimelineSummary {
  totalAssignments: number;
  averageAllocation: number;
  timeSpan: { start: string; end: string } | null;
  peakPeriod: { start: string; end: string; allocation: number } | null;
  availabilityOverrideCount: number;
}

export class AssignmentsController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({ enableLogging: true }, { container });
  }
  getAll = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    // 上限与既有调用方对齐（Assignments/Reports/ProjectDemandChart 都传 2000，
    // 用于“一次取全 + 自己做完整筛选”）；超过上限仍可分页取全。
    const MAX_LIST_LIMIT = 2000;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const filters = {
      project_id: req.query.project_id,
      person_id: req.query.person_id,
      role_id: req.query.role_id,
      status: req.query.status
    };

    // Get scenario from header（缺省 baseline，不再“无头=全场景”）
    const scenarioId = resolveScenarioId(req.headers['x-scenario-id']);
    const includeAllScenarios = req.query.includeAllScenarios === 'true';

    const result = await this.executeQuery(async () => {
      let query = this.db('assignments_view')
        .join('projects', 'assignments_view.project_id', 'projects.id')
        .join('people', 'assignments_view.person_id', 'people.id')
        .join('roles', 'assignments_view.role_id', 'roles.id')
        .leftJoin('project_phases', 'assignments_view.phase_id', 'project_phases.id')
        .select(
          'assignments_view.*',
          'projects.name as project_name',
          'projects.aspiration_start',
          'projects.aspiration_finish',
          'people.name as person_name',
          'roles.name as role_name',
          'project_phases.name as phase_name'
        );

      // Filter by scenario if not including all scenarios
      if (!includeAllScenarios) {
        query = query.where('assignments_view.scenario_id', scenarioId);
      }

      // Add date range filter using computed dates
      if (req.query.start_date) {
        query = query.where(function(this: Knex.QueryBuilder) {
          this.where('assignments_view.computed_end_date', '>=', req.query.start_date as string)
            .orWhere(function(this: Knex.QueryBuilder) {
              this.whereNull('assignments_view.computed_end_date')
                .andWhere('assignments_view.end_date', '>=', req.query.start_date as string);
            });
        });
      }
      if (req.query.end_date) {
        query = query.where(function(this: Knex.QueryBuilder) {
          this.where('assignments_view.computed_start_date', '<=', req.query.end_date as string)
            .orWhere(function(this: Knex.QueryBuilder) {
              this.whereNull('assignments_view.computed_start_date')
                .andWhere('assignments_view.start_date', '<=', req.query.end_date as string);
            });
        });
      }

      query = this.buildFilters(query, filters);
      // total 与数据同过滤(2026-10-13 全库审计: 原先裸视图 count)——克隆清投影
      const total = await query.clone().clearSelect().count('* as count').first();
      query = this.paginate(query, page, limit);
      // 稳定排序：同 start_date 的行用 id 兜底，分页不会重复/丢行
      query = query
        .orderBy('assignments_view.start_date', 'desc')
        .orderBy('assignments_view.id', 'asc');

      const assignments = await query;

      // 读契约（设计 §11.1）：直接使用视图持久化的 computed_*（视图已
      // COALESCE 原始日期）；不在读路径重算——旧实现逐行 compute 会因
      // 单行缺阶段/缺 aspiration 拖垮整页，并把 project 缺日期回退成
      // today/+90（每次读都变），且 phase 行 N+1。
      const assignmentsWithDates = assignments.map((assignment: AssignmentRow) => {
        const computedStart = assignment.computed_start_date || assignment.start_date || null;
        const computedEnd = assignment.computed_end_date || assignment.end_date || null;
        const resolved = Boolean(computedStart && computedEnd);
        const mode = assignment.assignment_date_mode || 'fixed';
        const dateResolutionError = resolved
          ? null
          : mode === 'phase'
            ? 'PHASE_TIMELINE_MISSING'
            : mode === 'project'
              ? 'PROJECT_DATES_MISSING'
              : 'ASSIGNMENT_DATES_MISSING';

        return {
          ...assignment,
          computed_start_date: computedStart,
          computed_end_date: computedEnd,
          computed_dates_resolved: resolved,
          date_resolution_error: dateResolutionError
        };
      });

      // Transform date fields from timestamps to date strings
      const transformedAssignments = transformDatesInArray(assignmentsWithDates, [
        ...COMMON_DATE_FIELDS,
        'computed_start_date',
        'computed_end_date',
        'aspiration_start',
        'aspiration_finish'
      ]);

      return {
        data: transformedAssignments,
        pagination: {
          page,
          limit,
          total: Number(total?.count) || 0,
          totalPages: Math.ceil((Number(total?.count) || 0) / limit)
        }
      };
    }, req, res, 'Failed to fetch assignments');

    if (result) {
      this.sendPaginatedResponse(req, res, result.data, result.pagination.total, result.pagination.page, result.pagination.limit);
    }
  })

  create = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const body = (req.body ?? {}) as Record<string, any>;
    const assignmentData = pickAssignmentFields(body, ASSIGNMENT_CREATE_FIELDS);
    const scenarioId = resolveScenarioId(req.headers['x-scenario-id']);
    const replaceAssignmentId = typeof body.replace_assignment_id === 'string'
      ? body.replace_assignment_id
      : undefined;
    const replaceExpectedVersion = body.replace_expected_version !== undefined
      ? Number(body.replace_expected_version)
      : undefined;

    const result = await this.executeQuery(async () => {
      // 显式替换必须成对出现：只有 replace_assignment_id 无法判断调用方看到的
      // 是否仍是同一版本，等于无令牌覆盖删除；只有版本没有目标同样无意义。
      if (replaceAssignmentId && replaceExpectedVersion === undefined) {
        throw this.createOperationalError(
          'replace_expected_version is required when replace_assignment_id is provided',
          400
        );
      }
      if (replaceExpectedVersion !== undefined &&
          (!Number.isInteger(replaceExpectedVersion) || replaceExpectedVersion < 1)) {
        throw this.createOperationalError('replace_expected_version must be a positive integer', 400);
      }
      if (!replaceAssignmentId && replaceExpectedVersion !== undefined) {
        throw this.createOperationalError(
          'replace_assignment_id is required when replace_expected_version is provided',
          400
        );
      }

      // Validate required fields
      if (!assignmentData.project_id || !assignmentData.person_id || !assignmentData.role_id) {
        throw this.createOperationalError('Missing required fields: project_id, person_id, and role_id are required', 400);
      }

      // Validate allocation percentage（严格数值：字符串 '30' 会造成容量求和变成 5030）
      const allocationError = allocationValidationError(assignmentData.allocation_percentage);
      if (allocationError) {
        throw this.createOperationalError(allocationError, 400);
      }

      // Validate assignment_date_mode
      const validDateModes = ['fixed', 'project', 'phase'];
      if (!assignmentData.assignment_date_mode || !validDateModes.includes(assignmentData.assignment_date_mode)) {
        throw this.createOperationalError('Invalid assignment_date_mode. Must be one of: fixed, project, phase', 400);
      }

      // Normalize/validate dates by mode
      if ('start_date' in assignmentData) {
        const parsed = parseAssignmentDate(assignmentData.start_date);
        if (parsed.invalid) throw this.createOperationalError('Invalid date format. Use YYYY-MM-DD format', 400);
        assignmentData.start_date = parsed.value;
      }
      if ('end_date' in assignmentData) {
        const parsed = parseAssignmentDate(assignmentData.end_date);
        if (parsed.invalid) throw this.createOperationalError('Invalid date format. Use YYYY-MM-DD format', 400);
        assignmentData.end_date = parsed.value;
      }
      if (assignmentData.assignment_date_mode === 'fixed') {
        if (!assignmentData.start_date || !assignmentData.end_date) {
          throw this.createOperationalError('Start date and end date are required for fixed date mode assignments', 400);
        }
        if (assignmentData.start_date > assignmentData.end_date) {
          throw this.createOperationalError('Start date must be before or equal to end date', 400);
        }
      } else if (assignmentData.assignment_date_mode === 'phase' && !assignmentData.phase_id) {
        throw this.createOperationalError('Phase ID is required for phase-based assignments', 400);
      }

      let warning: string | null = null;
      let conflicts: any = null;
      let computedDates: any = null;
      let replaced: any = null;
      let assignment: any;

      try {
        [assignment] = await this.db.transaction(async (trx: any) => {
          // 同业务键查重（NULL phase 由 whereNull 显式覆盖；SQLite 唯一索引
          // 对 NULL 不去重，不能只靠约束）
          const duplicate = await this.findDuplicateAssignment(trx, 'scenario_project_assignments', {
            scenarioId,
            projectId: assignmentData.project_id,
            personId: assignmentData.person_id,
            roleId: assignmentData.role_id,
            phaseId: assignmentData.phase_id ?? null,
          });
          if (duplicate) {
            throw new AssignmentWriteConflict(409, {
              error: 'Conflict',
              code: 'ASSIGNMENT_DUPLICATE',
              message: 'An assignment with the same project, person, role and phase already exists',
              existing_id: duplicate.id,
              current: duplicate,
            });
          }

          // SE/MDE 单人制：默认不替换他人；只有显式 replace_assignment_id +
          // 版本匹配才删除指定旧行，且提交后补 DELETE 审计（旧实现无差别 del）。
          const roleName = await this.roleNameFor(trx, assignmentData.role_id);
          if (roleName === 'SE' || roleName === 'MDE') {
            const incumbents = await trx('scenario_project_assignments as spa')
              .leftJoin('people as p', 'spa.person_id', 'p.id')
              .where({
                'spa.scenario_id': scenarioId,
                'spa.project_id': assignmentData.project_id,
                'spa.role_id': assignmentData.role_id,
                'spa.status': 'active',
              })
              .select(
                'spa.id',
                'spa.person_id',
                'p.name as person_name',
                'spa.phase_id',
                'spa.allocation_percentage',
                'spa.version'
              );
            if (incumbents.length > 0) {
              if (!replaceAssignmentId) {
                throw new AssignmentWriteConflict(409, {
                  error: 'Conflict',
                  code: 'ASSIGNMENT_SLOT_OCCUPIED',
                  message: `The ${roleName} slot is already occupied; confirm replacement explicitly`,
                  incumbents,
                });
              }
              const target = incumbents.find((row: any) => String(row.id) === String(replaceAssignmentId));
              if (!target) {
                throw new AssignmentWriteConflict(409, {
                  error: 'Conflict',
                  code: 'ASSIGNMENT_SLOT_OCCUPIED',
                  message: 'replace_assignment_id does not identify an active occupant',
                  incumbents,
                });
              }
              if (replaceExpectedVersion !== undefined && Number(target.version) !== replaceExpectedVersion) {
                throw new AssignmentWriteConflict(409, {
                  error: 'Conflict',
                  code: 'ASSIGNMENT_VERSION_CONFLICT',
                  message: 'The replaced assignment was modified by someone else',
                  current: target,
                });
              }
              const deleted = await trx('scenario_project_assignments')
                .where({
                  id: replaceAssignmentId,
                  status: 'active',
                  ...(replaceExpectedVersion !== undefined ? { version: replaceExpectedVersion } : {}),
                })
                .del();
              if (!deleted) {
                throw new AssignmentWriteConflict(409, {
                  error: 'Conflict',
                  code: 'ASSIGNMENT_VERSION_CONFLICT',
                  message: 'The replaced assignment changed before replacement',
                  current: target,
                });
              }
              replaced = target;
            }
          }

          // 主投入互斥(063c 部分唯一索引)
          if (assignmentData.is_primary) {
            await trx('scenario_project_assignments')
              .where({ project_id: assignmentData.project_id, scenario_id: scenarioId })
              .where('is_primary', 1)
              .update({ is_primary: false, updated_at: new Date() });
          }

          computedDates = await this.computeAssignmentDates(assignmentData as any, trx);
          const effectiveStartDate = computedDates.computed_start_date || assignmentData.start_date;
          const effectiveEndDate = computedDates.computed_end_date || assignmentData.end_date;
          if (!effectiveStartDate || !effectiveEndDate) {
            throw this.createOperationalError(
              'Unable to determine assignment dates. Check project/phase configuration.',
              400
            );
          }

          conflicts = await this.checkConflicts(
            assignmentData.person_id,
            effectiveStartDate,
            effectiveEndDate,
            assignmentData.allocation_percentage,
            undefined,
            scenarioId,
            trx
          );

          if (conflicts && conflicts.total_allocation > 100) {
            warning = `Person will be overallocated at ${conflicts.total_allocation}% during this period`;
          }

          return await trx('scenario_project_assignments')
            .insert({
              ...assignmentData,
              ...computedDates,
              scenario_id: scenarioId,
              created_at: new Date(),
              updated_at: new Date()
            })
            .returning('*');
        });
      } catch (error) {
        if (error instanceof AssignmentWriteConflict) {
          res.status(error.statusCode).json(error.payload);
          return null;
        }
        throw error;
      }

      // Return assignment with computed dates
      const assignmentWithDates = { ...assignment, ...computedDates };

      // 显式替换的旧 SE/MDE 行在事务内已删除；提交后补 DELETE 审计，
      // 否则替换历史只留下新行 CREATE，审计链缺口（旧实现静默 del 无痕）。
      if (replaced) {
        await (req as any).logAuditEvent(
          'scenario_project_assignments',
          replaced.id,
          'DELETE',
          replaced,
          undefined
        );
      }

      // Send notification for assignment creation
      try {
        await notificationScheduler.sendAssignmentNotification(
          assignmentData.person_id,
          'created',
          assignmentData
        );
      } catch (error) {
        req.logger.error('Failed to send assignment notification:', error);
      }

      // Log audit event for assignment creation
      await (req as any).logAuditEvent('scenario_project_assignments', assignment.id, 'CREATE', undefined, assignment);
      this.logBusinessOperation(req, 'CREATE', 'assignment', assignment.id, {
        projectId: assignmentData.project_id,
        personId: assignmentData.person_id,
        roleId: assignmentData.role_id,
        allocation: assignmentData.allocation_percentage
      });
      
      const response = transformDates(assignmentWithDates, [
        ...COMMON_DATE_FIELDS,
        'computed_start_date',
        'computed_end_date'
      ]);
      
      // Add warning if person is overallocated
      if (warning && conflicts) {
        return {
          ...response,
          warning,
          totalAllocation: conflicts.total_allocation
        };
      }
      
      return response;
    }, req, res, 'Failed to create assignment');

    if (result) {
      this.sendSuccess(req, res, result, 'Assignment created successfully');
    }
  })

  getById = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      // Check if this is a scenario assignment
      const isScenarioAssignment = id.startsWith('spa-');
      
      let assignment;
      if (isScenarioAssignment) {
        // Remove the 'spa-' prefix to get the actual ID
        const actualId = id.substring(4);
        assignment = await this.db('scenario_project_assignments')
          .join('projects', 'scenario_project_assignments.project_id', 'projects.id')
          .join('people', 'scenario_project_assignments.person_id', 'people.id')
          .join('roles', 'scenario_project_assignments.role_id', 'roles.id')
          .join('scenarios', 'scenario_project_assignments.scenario_id', 'scenarios.id')
          .select(
            'scenario_project_assignments.*',
            'projects.name as project_name',
            'people.name as person_name',
            'roles.name as role_name',
            'scenarios.name as scenario_name'
          )
          .where('scenario_project_assignments.id', actualId)
          .where('scenarios.status', 'active')
          .first();
          
        if (assignment) {
          // Add the spa- prefix back to the ID
          assignment.id = 'spa-' + assignment.id;
          assignment.assignment_type = 'scenario';
        }
      } else {
        assignment = await this.db('project_assignments')
          .join('projects', 'project_assignments.project_id', 'projects.id')
          .join('people', 'project_assignments.person_id', 'people.id')
          .join('roles', 'project_assignments.role_id', 'roles.id')
          .select(
            'project_assignments.*',
            'projects.name as project_name',
            'people.name as person_name',
            'roles.name as role_name'
          )
          .where('project_assignments.id', id)
          .first();

        if (assignment) {
          assignment.assignment_type = 'direct';
        } else {
          // Raw-id fallback (2026-09-26 harvest finding, mirrors the delete
          // fallback from de9ad27): POST /api/assignments returns a bare
          // scenario_project_assignments row id — without this fallback,
          // GET by the create-returned id 404s (create→get contract break)
          assignment = await this.db('scenario_project_assignments')
            .join('projects', 'scenario_project_assignments.project_id', 'projects.id')
            .join('people', 'scenario_project_assignments.person_id', 'people.id')
            .join('roles', 'scenario_project_assignments.role_id', 'roles.id')
            .join('scenarios', 'scenario_project_assignments.scenario_id', 'scenarios.id')
            .select(
              'scenario_project_assignments.*',
              'projects.name as project_name',
              'people.name as person_name',
              'roles.name as role_name',
              'scenarios.name as scenario_name'
            )
            .where('scenario_project_assignments.id', id)
            .first();

          if (assignment) {
            assignment.assignment_type = 'scenario';
          }
        }
      }

      if (!assignment) {
        this.handleNotFound(req, res, 'Assignment');
        return null;
      }

      return transformDates(assignment, COMMON_DATE_FIELDS);
    }, req, res, 'Failed to fetch assignment');

    if (result) {
      this.sendSuccess(req, res, result, 'Assignment fetched successfully');
    }
  })

  update = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;
    const body = (req.body ?? {}) as Record<string, any>;
    // IP-07c/F06: expected_version 是乐观锁令牌(可选),不是可写列
    const expectedVersion = body.expected_version;
    // 身份列（id/scenario_id/project_id/person_id/role_id）不由 update 载荷
    // 修改；旧实现直接展开 body，可把分配搬到别的项目/人员/场景。
    const updateData = pickAssignmentFields(body, ASSIGNMENT_UPDATE_FIELDS);
    const headerScenarioId = resolveScenarioId(req.headers['x-scenario-id']);

    const result = await this.executeQuery(async () => {
      // 写路径按 (id, 当前场景) 查找：spa-/原生 id 都不能越过场景边界；
      // direct 轨是 baseline 全局数据，非 baseline 上下文只读。
      const target = await this.findAssignmentForWrite(id, headerScenarioId);
      if (!target) {
        this.handleNotFound(req, res, 'Assignment');
        return null;
      }
      const { row: existing, tableName, actualId, isScenarioAssignment, scenarioId } = target;

      if (tableName === 'project_assignments' && 'is_primary' in updateData) {
        throw this.createOperationalError('is_primary is only supported on scenario assignments', 400);
      }

      // Validate pause status if provided (lifecycle 退回/裁决取消 or manual pause)
      if (updateData.status !== undefined) {
        if (!['active', 'paused'].includes(updateData.status)) {
          throw this.createOperationalError("Invalid status. Must be 'active' or 'paused'", 400);
        }
      }

      // Validate allocation percentage if provided（严格数值：字符串 '30'
      // 会让容量求和变成 '030' 拼接）
      if ('allocation_percentage' in updateData) {
        const allocationError = allocationValidationError(updateData.allocation_percentage);
        if (allocationError) throw this.createOperationalError(allocationError, 400);
      }

      // Validate date mode if it's being changed
      if (updateData.assignment_date_mode !== undefined &&
          !['fixed', 'project', 'phase'].includes(updateData.assignment_date_mode)) {
        throw this.createOperationalError('Invalid assignment_date_mode. Must be one of: fixed, project, phase', 400);
      }
      if ('notes' in updateData && updateData.notes !== null && typeof updateData.notes !== 'string') {
        throw this.createOperationalError('Notes must be a string or null', 400);
      }

      // 日期只在调度字段被触碰时校验/重算；allocation/status/notes-only
      // 更新不因存量脏日期被 400 拦死，也不改写 computed（设计 §11）。
      const datesTouched = DATE_TOUCH_FIELDS.some((field) =>
        Object.prototype.hasOwnProperty.call(updateData, field)
      );

      if ('start_date' in updateData) {
        const parsed = parseAssignmentDate(updateData.start_date);
        if (parsed.invalid) throw this.createOperationalError('Invalid date format. Use YYYY-MM-DD format', 400);
        updateData.start_date = parsed.value;
      }
      if ('end_date' in updateData) {
        const parsed = parseAssignmentDate(updateData.end_date);
        if (parsed.invalid) throw this.createOperationalError('Invalid date format. Use YYYY-MM-DD format', 400);
        updateData.end_date = parsed.value;
      }

      // 只有调度字段被触碰时才校验日期模式；allocation/status/notes-only
      // 更新不应因存量脏日期被 400 拦死（设计 §11 的显式边界）。
      if (datesTouched) {
        const dateMode = updateData.assignment_date_mode || existing.assignment_date_mode || 'fixed';

        if (dateMode === 'fixed') {
          const start = parseAssignmentDate('start_date' in updateData ? updateData.start_date : existing.start_date);
          const end = parseAssignmentDate('end_date' in updateData ? updateData.end_date : existing.end_date);
          if (start.invalid || end.invalid) {
            throw this.createOperationalError('Invalid date format. Use YYYY-MM-DD format', 400);
          }
          // fixed 模式必须两端齐全；'' / null 是显式清空，同样拒绝（否则
          // computed 会落到 today/+90 之类不可见回退，日期被静默改写）。
          if (!start.value || !end.value) {
            throw this.createOperationalError('Start date and end date are required for fixed date mode assignments', 400);
          }
          if (start.value > end.value) {
            throw this.createOperationalError('Start date must be before or equal to end date', 400);
          }
        } else if (dateMode === 'phase') {
          const phaseId = 'phase_id' in updateData ? updateData.phase_id : existing.phase_id;
          if (!phaseId) {
            throw this.createOperationalError('Phase ID is required for phase-based assignments', 400);
          }
        }
      }

      // I02m/P1：compute + 冲突检查 + 写入必须同一事务。旧实现事务外先算日期
      // 再写：另一请求在此期间改阶段并刷新 computed（刷新不 bump version），
      // 本请求随后用旧日期+旧 version 覆盖成功——最终"阶段四月、分配三月"。
      // 生产 pool.max=1 下事务串行化：B 先提交则本请求读到新日期；本请求先
      // 提交则 B 的刷新随后覆盖 computed，最终态一致。
      const assignmentForComputation = { ...existing, ...updateData, scenario_id: scenarioId };
      let warning: string | null = null;
      let totalAllocation: number | null = null;
      let updated: any;

      // Update assignment。IP-07c/F06: 带令牌=原子版本比较(WHERE version=expected),
      // 令牌过期 409 载荷含当前值(前端保留草稿);无令牌=旧行为,version 仍递增
      const versionClause = expectedVersion !== undefined ? { version: Number(expectedVersion) } : {};

      try {
        await this.db.transaction(async (trx: any) => {
          // 改 phase 会改变业务键：事务内预检，避免唯一索引报 500；NULL
          // phase 的 SQLite 唯一索引不生效，必须显式 whereNull 查重。
          if ('phase_id' in updateData) {
            const duplicate = await this.findDuplicateAssignment(trx, tableName, {
              ...(isScenarioAssignment ? { scenarioId } : {}),
              projectId: existing.project_id,
              personId: existing.person_id,
              roleId: existing.role_id,
              phaseId: updateData.phase_id ?? null,
            }, actualId);
            if (duplicate) {
              throw new AssignmentWriteConflict(409, {
                error: 'Conflict',
                code: 'ASSIGNMENT_DUPLICATE',
                message: 'An assignment with the same project, person, role and phase already exists',
                existing_id: duplicate.id,
                current: duplicate,
              });
            }
          }

          const writePayload: Record<string, any> = { ...updateData };

          if (datesTouched) {
            const computedDates = await this.computeAssignmentDates(assignmentForComputation, trx);

            // Use computed dates for conflict checking
            const effectiveStartDate = computedDates.computed_start_date ||
              ('start_date' in updateData ? updateData.start_date : existing.start_date);
            const effectiveEndDate = computedDates.computed_end_date ||
              ('end_date' in updateData ? updateData.end_date : existing.end_date);

            if (!effectiveStartDate || !effectiveEndDate) {
              throw this.createOperationalError(
                'Unable to determine assignment dates. Check project/phase configuration.',
                400
              );
            }

            // I02a/F1（P0）：派生日期必须随写落库——旧实现算了不写，fixed 日期
            // 编辑/mode 切换后 computed 永久停留旧窗口（dev 库实证漂移 3 周+）
            writePayload.computed_start_date = computedDates.computed_start_date;
            writePayload.computed_end_date = computedDates.computed_end_date;

            const conflict = await this.checkConflicts(
              existing.person_id,
              effectiveStartDate,
              effectiveEndDate,
              'allocation_percentage' in updateData
                ? updateData.allocation_percentage
                : Number(existing.allocation_percentage),
              actualId,
              scenarioId,
              trx
            );

            if (conflict && conflict.total_allocation > 100) {
              warning = `Person will be overallocated at ${conflict.total_allocation}% during this period`;
              totalAllocation = conflict.total_allocation;
            }
          } else if ('allocation_percentage' in updateData) {
            // 仅改比例也要给超标提醒；日期未触碰则沿用已存在的有效窗口，
            // 窗口无法确定时静默跳过（不因存量脏数据阻断比例调整）。
            const start = existing.computed_start_date || existing.start_date;
            const end = existing.computed_end_date || existing.end_date;
            if (start && end) {
              const conflict = await this.checkConflicts(
                existing.person_id,
                start,
                end,
                updateData.allocation_percentage,
                actualId,
                scenarioId,
                trx
              );
              if (conflict && conflict.total_allocation > 100) {
                warning = `Person will be overallocated at ${conflict.total_allocation}% during this period`;
                totalAllocation = conflict.total_allocation;
              }
            }
          }

          [updated] = await trx(tableName)
            .where({ id: actualId, ...versionClause })
            .update({
              ...writePayload,
              updated_at: new Date(),
              version: trx.raw('version + 1')
            })
            .returning('*');
        });
      } catch (error) {
        if (error instanceof AssignmentWriteConflict) {
          res.status(error.statusCode).json(error.payload);
          return null;
        }
        throw error;
      }

      if (!updated && expectedVersion !== undefined) {
        const current = await this.db(tableName).where('id', actualId).first();
        const presented = isScenarioAssignment && current
          ? { ...current, id: 'spa-' + current.id }
          : current;
        res.status(409).json({
          error: 'Version conflict',
          code: 'ASSIGNMENT_VERSION_CONFLICT',
          message: 'This assignment was modified by someone else. Review the current value and retry.',
          current: presented
        });
        return null;
      }

      if (!updated) {
        // 无令牌时行已被并发删除：回 404，不返回 200 空对象
        this.handleNotFound(req, res, 'Assignment');
        return null;
      }

      // Add back the spa- prefix if it's a scenario assignment
      if (isScenarioAssignment && updated) {
        updated.id = 'spa-' + updated.id;
      }

      // Send notification for assignment update
      try {
        await notificationScheduler.sendAssignmentNotification(
          updateData.person_id || existing.person_id,
          'updated',
          { ...existing, ...updateData }
        );
      } catch (error) {
        req.logger.error('Failed to send assignment notification:', error);
      }

      // Log audit event for assignment update
      await (req as any).logAuditEvent(tableName, actualId, 'UPDATE', existing, updated);
      this.logBusinessOperation(req, 'UPDATE', 'assignment', actualId, {
        projectId: updated.project_id,
        personId: updated.person_id,
        fieldsUpdated: Object.keys(updateData)
      });

      const response = transformDates(updated, COMMON_DATE_FIELDS);
      
      // Add warning if person is overallocated
      if (warning) {
        return {
          ...response,
          warning,
          currentTotalAllocation: totalAllocation
        };
      }
      
      return response;
    }, req, res, 'Failed to update assignment');

    if (result) {
      this.sendSuccess(req, res, result, 'Assignment updated successfully');
    }
  })

  delete = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;
    // IP-07e/F06: 可选乐观锁令牌——删除他人刚改的行=丢失更新的一种,
    // 与 update 同契约(WHERE version=expected 原子比较,过期 409+当前值)
    const expectedVersion = (req.body ?? {}).expected_version;
    const headerScenarioId = resolveScenarioId(req.headers['x-scenario-id']);

    const result = await this.executeQuery(async () => {
      // 与 update 同一套场景归属：场景轨按 (id, 当前场景) 查，direct 轨
      // 只在 baseline 上下文可写；不能靠 id 前缀把其他场景的行删掉。
      const target = await this.findAssignmentForWrite(id, headerScenarioId);
      if (!target) {
        this.handleNotFound(req, res, 'Assignment');
        return null;
      }
      const { row: assignment, tableName, actualId, isScenarioAssignment } = target;
      // 令牌进删除条件本身(不是先读再判——并发窗口内行可被改)
      const versionClause = expectedVersion !== undefined ? { version: Number(expectedVersion) } : {};

      const deleted = await this.db(tableName)
        .where({ id: actualId, ...versionClause })
        .del();

      // 令牌过期: 行还在但版本不匹配 → 409+当前值(前端提示刷新)
      if (deleted === 0 && expectedVersion !== undefined) {
        const current = await this.db(tableName).where('id', actualId).first();
        if (current) {
          const presented = isScenarioAssignment
            ? { ...current, id: 'spa-' + current.id }
            : current;
          res.status(409).json({
            error: 'Version conflict',
            code: 'ASSIGNMENT_VERSION_CONFLICT',
            message: 'This assignment was modified by someone else. Review the current value and retry.',
            current: presented
          });
          return null;
        }
      }

      if (deleted === 0) {
        this.handleNotFound(req, res, 'Assignment');
        return null;
      }

      // Log audit event for assignment deletion
      await (req as any).logAuditEvent(tableName, actualId, 'DELETE', assignment, undefined);
      this.logBusinessOperation(req, 'DELETE', 'assignment', actualId, {
        projectId: assignment.project_id,
        personId: assignment.person_id
      });

      return { message: 'Assignment deleted successfully' };
    }, req, res, 'Failed to delete assignment');

    if (result) {
      this.sendSuccess(req, res, result, result.message);
    }
  })

  bulkAssign = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { project_id, assignments } = req.body;
    // 数组入参校验(2026-10-13 全库审计): 非数组载荷原先 for...of 直迭代
    // undefined → TypeError → 500;对照新批量端点的入参门槛
    if (!Array.isArray(assignments) || assignments.length === 0) {
      res.status(400).json({ error: 'Validation error', message: 'assignments must be a non-empty array' });
      return;
    }

    const result = await this.executeQuery(async () => {
      const results = {
        successful: [] as any[],
        failed: [] as any[],
        conflicts: [] as AssignmentConflict[]
      };

      // Get scenario from header
      const scenarioId = req.headers['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';

      // Process each assignment
      for (const assignment of assignments) {
        try {
          // Check conflicts
          const conflict = await this.checkConflicts(
            assignment.person_id,
            assignment.start_date,
            assignment.end_date,
            assignment.allocation_percentage,
            assignment.id, // Exclude current assignment if updating
            scenarioId
          );

          if (conflict && conflict.total_allocation > 100) {
            results.conflicts.push(conflict);
            results.failed.push({
              ...assignment,
              reason: 'Capacity exceeded',
              total_allocation: conflict.total_allocation
            });
            continue;
          }

          // Create assignment
          const [created] = await this.db('scenario_project_assignments')
            .insert({
              project_id,
              person_id: assignment.person_id,
              role_id: assignment.role_id,
              allocation_percentage: assignment.allocation_percentage,
              // I02a/G-A：批量分配显式 fixed 模式 + 派生日期落库（旧插入不带
              // 模式→落库默认 project，需求视图会改用 aspiration 而忽略这里的
              // start/end；computed 也缺失）
              assignment_date_mode: 'fixed',
              start_date: assignment.start_date,
              end_date: assignment.end_date,
              computed_start_date: assignment.start_date,
              computed_end_date: assignment.end_date,
              notes: assignment.notes,
              scenario_id: scenarioId,
              created_at: new Date(),
              updated_at: new Date()
            })
            .returning('*');

          results.successful.push(transformDates(created, COMMON_DATE_FIELDS));

        } catch (error) {
          results.failed.push({
            ...assignment,
            reason: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return {
        summary: {
          total: assignments.length,
          successful: results.successful.length,
          failed: results.failed.length,
          conflicts: results.conflicts.length
        },
        results
      };
    }, req, res, 'Failed to create bulk assignments');

    if (result) {
      this.sendSuccess(req, res, result, 'Bulk assignments created successfully');
    }
  })

  async checkConflicts(
    person_id: string,
    start_date: string,
    end_date: string,
    allocation_percentage: number,
    exclude_assignment_id?: string,
    scenarioId?: string,
    // 可选事务句柄(2026-10-13): create 事务内在删除之后调用本方法——走
    // this.db 会另取池连接,文件库读到事务前快照(口径漂移)、内存测试库
    // 直接池等待挂起;与事务同连接才是"删后查"的本意
    trx?: any
  ): Promise<AssignmentConflict | null> {
    const db = trx ?? this.db;
    // Get person details
    const person = await db('people')
      .where('id', person_id)
      .first();

    if (!person) return null;

    // Get scenario from header if not provided
    if (!scenarioId) {
      scenarioId = (this as any).req?.headers?.['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';
    }

    // IP-03a/C07–C09: 选定场景 active 切片(paused 不占容量,C08);冲突按日期
    // 边界分段——判并发峰值而非区间相交整体求和(C07);可用率用已批准覆盖的
    // 真值,0 就是 0,不 ||100 回退(C09);不再依赖"今天"口径的可用率视图
    let query = activeAssignmentsInScenario(db, scenarioId)
      .join('projects', 'spa.project_id', 'projects.id')
      .where('spa.person_id', person_id)
      .where(function(this: Knex.QueryBuilder) {
        this.where('spa.computed_start_date', '<=', end_date)
          .orWhere(function(this: Knex.QueryBuilder) {
            this.whereNull('spa.computed_start_date')
              .andWhere('spa.start_date', '<=', end_date);
          });
      })
      .where(function(this: Knex.QueryBuilder) {
        this.where('spa.computed_end_date', '>=', start_date)
          .orWhere(function(this: Knex.QueryBuilder) {
            this.whereNull('spa.computed_end_date')
              .andWhere('spa.end_date', '>=', start_date);
          });
      });

    if (exclude_assignment_id) {
      // 旧 assignments_view 的 id 是 'spa-' 前缀串;切片查询直接用数值 id
      const numericId = String(exclude_assignment_id).replace(/^spa-/, '');
      query = query.where('spa.id', '!=', numericId);
    }

    const overlapping = await query.select(
      'spa.*',
      'projects.name as project_name'
    );

    // 已批准且与窗口相交的可用率覆盖
    const overrides = await db('person_availability_overrides')
      .where('person_id', person_id)
      .where('is_approved', 1)
      .where('start_date', '<=', end_date)
      .where('end_date', '>=', start_date)
      .select('start_date', 'end_date', 'availability_percentage');

    const capacity = evaluateWindowCapacity({
      window: { start: start_date, end: end_date },
      defaultAvailabilityPct: person.default_availability_percentage ?? 100,
      overrides: overrides.map((o: { start_date: string; end_date: string; availability_percentage: number }) => ({
        start: o.start_date,
        end: o.end_date,
        availability_percentage: o.availability_percentage
      })),
      allocations: [
        ...overlapping.map((a: OverlappingAssignment) => ({
          start: (a.computed_start_date || a.start_date) as string | null,
          end: (a.computed_end_date || a.end_date) as string | null,
          allocation: a.allocation_percentage
        })),
        { start: start_date, end: end_date, allocation: allocation_percentage }
      ]
    });

    if (capacity.hasConflict) {
      const worst = capacity.overloadSegments[0];
      return {
        person_id,
        person_name: person.name,
        conflicting_projects: overlapping.map((a: OverlappingAssignment) => ({
          project_name: a.project_name,
          start_date: a.computed_start_date || a.start_date || '',
          end_date: a.computed_end_date || a.end_date || '',
          allocation_percentage: a.allocation_percentage
        })),
        total_allocation: capacity.peakLoadPct,
        available_capacity: worst.capacityPct,
        overload_segments: capacity.overloadSegments
      };
    }

    return null;
  }

  getConflicts = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { person_id } = req.params;
    const { start_date, end_date } = req.query;

    const result = await this.executeQuery(async () => {
      // Get scenario from header
      const scenarioId = req.headers['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';
      
      let query = this.db('assignments_view')
        .join('projects', 'assignments_view.project_id', 'projects.id')
        .where('assignments_view.person_id', person_id)
        .where('assignments_view.scenario_id', scenarioId);

      if (start_date && end_date) {
        query = query
          .where(function(this: Knex.QueryBuilder) {
            this.where('assignments_view.computed_start_date', '<=', end_date)
              .orWhere(function(this: Knex.QueryBuilder) {
                this.whereNull('assignments_view.computed_start_date')
                  .andWhere('assignments_view.start_date', '<=', end_date);
              });
          })
          .where(function(this: Knex.QueryBuilder) {
            this.where('assignments_view.computed_end_date', '>=', start_date)
              .orWhere(function(this: Knex.QueryBuilder) {
                this.whereNull('assignments_view.computed_end_date')
                  .andWhere('assignments_view.end_date', '>=', start_date);
              });
          });
      }

      const assignments = await query.select(
        'assignments_view.*',
        'projects.name as project_name'
      );

      // Transform date fields
      const transformedAssignments = transformDatesInArray(assignments, COMMON_DATE_FIELDS) as AssignmentRow[];

      // Group by overlapping time periods
      const conflicts = this.groupOverlappingAssignments(transformedAssignments);

      return conflicts;
    }, req, res, 'Failed to check conflicts');

    if (result) {
      this.sendSuccess(req, res, result, 'Conflicts checked successfully');
    }
  })

  getSuggestions = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { role_id, start_date, end_date, required_allocation } = req.query;

    const result = await this.executeQuery(async () => {
      // Get all people with the required role
      const peopleWithRole = await this.db('person_roles')
        .join('people', 'person_roles.person_id', 'people.id')
        .where('person_roles.role_id', role_id)
        .select(
          'people.*',
          'person_roles.proficiency_level'
        );

      // Check availability for each person
      const suggestions = [];

      for (const person of peopleWithRole) {
        // Get current allocations in the date range
        const allocations = await this.db('project_assignments')
          .where('person_id', person.id)
          .where('start_date', '<=', end_date as string)
          .where('end_date', '>=', start_date as string)
          .sum('allocation_percentage as total_allocation')
          .first();

        const currentAllocation = allocations?.total_allocation || 0;

        // Get availability
        const availability = await this.db('person_availability_view')
          .where('person_id', person.id)
          .first();

        // I01v/C09 族（EXP-B05）：nullish——显式 0% 可用率是真 0，只有缺省
        // （view 无行）才回退 100；旧 || 把 0% 当满载候选
        const availableCapacity = (availability?.effective_availability_percentage ?? 100) - currentAllocation;

        if (availableCapacity >= Number(required_allocation)) {
          suggestions.push({
            person_id: person.id,
            person_name: person.name,
            proficiency_level: person.proficiency_level,
            current_allocation: currentAllocation,
            available_capacity: availableCapacity,
            availability_status: availability?.availability_status,
            score: this.calculateSuggestionScore(person, availableCapacity)
          });
        }
      }

      // Sort by score (highest first)
      suggestions.sort((a, b) => b.score - a.score);

      return {
        role_id,
        start_date,
        end_date,
        required_allocation,
        suggestions: suggestions.slice(0, 10) // Top 10 suggestions
      };
    }, req, res, 'Failed to get assignment suggestions');

    if (result) {
      this.sendSuccess(req, res, result, 'Assignment suggestions fetched successfully');
    }
  })

  getTimeline = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { person_id } = req.params;
    const { start_date, end_date } = req.query;

    const result = await this.executeQuery(async () => {
      // Get scenario from header
      const scenarioId = req.headers['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';
      
      let query = this.db('assignments_view')
        .join('projects', 'assignments_view.project_id', 'projects.id')
        .join('roles', 'assignments_view.role_id', 'roles.id')
        .where('assignments_view.person_id', person_id)
        .where('assignments_view.scenario_id', scenarioId)
        .select(
          'assignments_view.*',
          'projects.name as project_name',
          'projects.priority as project_priority',
          'roles.name as role_name'
        );

      if (start_date) {
        query = query.where(function(this: Knex.QueryBuilder) {
          this.where('assignments_view.computed_end_date', '>=', start_date)
            .orWhere(function(this: Knex.QueryBuilder) {
              this.whereNull('assignments_view.computed_end_date')
                .andWhere('assignments_view.end_date', '>=', start_date);
            });
        });
      }
      if (end_date) {
        query = query.where(function(this: Knex.QueryBuilder) {
          this.where('assignments_view.computed_start_date', '<=', end_date)
            .orWhere(function(this: Knex.QueryBuilder) {
              this.whereNull('assignments_view.computed_start_date')
                .andWhere('assignments_view.start_date', '<=', end_date);
            });
        });
      }

      const assignments = await query.orderBy(
        this.db.raw('COALESCE(assignments_view.computed_start_date, assignments_view.start_date)')
      );

      // Get availability overrides in the same period
      let availabilityQuery = this.db('person_availability_overrides')
        .where('person_id', person_id);

      if (start_date) {
        availabilityQuery = availabilityQuery.where('end_date', '>=', start_date);
      }
      if (end_date) {
        availabilityQuery = availabilityQuery.where('start_date', '<=', end_date);
      }

      const availabilityOverrides = await availabilityQuery.orderBy('start_date');

      // Transform date fields
      const transformedAssignments = transformDatesInArray(assignments, COMMON_DATE_FIELDS) as AssignmentRow[];
      const transformedOverrides = transformDatesInArray(availabilityOverrides, COMMON_DATE_FIELDS) as AvailabilityOverrideRow[];

      return {
        person_id,
        timeline: {
          assignments: transformedAssignments,
          availability_overrides: transformedOverrides,
          summary: this.calculateTimelineSummary(transformedAssignments, transformedOverrides)
        }
      };
    }, req, res, 'Failed to get assignment timeline');

    if (result) {
      this.sendSuccess(req, res, result, 'Assignment timeline fetched successfully');
    }
  })

  private groupOverlappingAssignments(assignments: AssignmentRow[]): OverlappingGroup[] {
    // Group assignments that overlap in time
    const groups: OverlappingGroup[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < assignments.length; i++) {
      if (processed.has(i)) continue;

      const group = {
        period: {
          start: assignments[i].start_date,
          end: assignments[i].end_date
        },
        assignments: [assignments[i]],
        total_allocation: assignments[i].allocation_percentage,
        is_overallocated: false,
        overallocation_amount: 0
      };

      processed.add(i);

      // Find all overlapping assignments
      for (let j = i + 1; j < assignments.length; j++) {
        if (processed.has(j)) continue;

        if (this.datesOverlap(
          assignments[i].start_date,
          assignments[i].end_date,
          assignments[j].start_date,
          assignments[j].end_date
        )) {
          group.assignments.push(assignments[j]);
          group.total_allocation += assignments[j].allocation_percentage;
          group.period.start = this.minDate(group.period.start, assignments[j].start_date);
          group.period.end = this.maxDate(group.period.end, assignments[j].end_date);
          processed.add(j);
        }
      }

      if (group.total_allocation > 100) {
        group.is_overallocated = true;
        group.overallocation_amount = group.total_allocation - 100;
        groups.push(group);
      }
    }

    return groups;
  }

  private datesOverlap(start1: string | undefined, end1: string | undefined, start2: string | undefined, end2: string | undefined): boolean {
    if (!start1 || !end1 || !start2 || !end2) return false;
    return start1 <= end2 && end1 >= start2;
  }

  private minDate(date1: string | undefined, date2: string | undefined): string | undefined {
    if (!date1) return date2;
    if (!date2) return date1;
    return date1 < date2 ? date1 : date2;
  }

  private maxDate(date1: string | undefined, date2: string | undefined): string | undefined {
    if (!date1) return date2;
    if (!date2) return date1;
    return date1 > date2 ? date1 : date2;
  }

  private calculateSuggestionScore(person: PersonRow, availableCapacity: number): number {
    let score = 0;

    // Higher score for more available capacity
    score += availableCapacity * 0.5;

    // Higher score for higher proficiency
    const proficiencyScores: Record<string, number> = {
      'Expert': 40,
      'Senior': 30,
      'Intermediate': 20,
      'Junior': 10
    };
    score += (person.proficiency_level && proficiencyScores[person.proficiency_level]) || 0;

    // Could add years of experience if it was in the schema
    // score += Math.min(person.years_experience * 2, 20);

    return score;
  }

  private calculateTimelineSummary(assignments: AssignmentRow[], availabilityOverrides: AvailabilityOverrideRow[]): TimelineSummary {
    if (assignments.length === 0) {
      return {
        totalAssignments: 0,
        averageAllocation: 0,
        timeSpan: null,
        peakPeriod: null,
        availabilityOverrideCount: availabilityOverrides.length
      };
    }

    // Define type for validated assignments with effective dates
    type ValidatedAssignment = AssignmentRow & {
      effective_start_date: string;
      effective_end_date: string;
    };

    // Filter out assignments without any valid dates and use effective dates
    const validAssignments: ValidatedAssignment[] = assignments.filter(a => {
      const startDate = a.computed_start_date || a.start_date;
      const endDate = a.computed_end_date || a.end_date;
      return startDate && endDate;
    }).map(a => ({
      ...a,
      effective_start_date: (a.computed_start_date || a.start_date) as string,
      effective_end_date: (a.computed_end_date || a.end_date) as string
    }));

    if (validAssignments.length === 0) {
      return {
        totalAssignments: assignments.length,
        averageAllocation: 0,
        timeSpan: null,
        peakPeriod: null,
        availabilityOverrideCount: availabilityOverrides.length
      };
    }

    // Calculate metrics
    let totalAllocationDays = 0;
    let totalDaysAssigned = 0;
    let peakAllocation = 0;
    let peakIndex = -1;

    validAssignments.forEach((assignment, index) => {
      const days = this.daysBetween(assignment.effective_start_date, assignment.effective_end_date);
      totalDaysAssigned += days;
      totalAllocationDays += days * assignment.allocation_percentage;
      if (assignment.allocation_percentage > peakAllocation) {
        peakAllocation = assignment.allocation_percentage;
        peakIndex = index;
      }
    });

    const averageAllocation = totalDaysAssigned > 0 ? totalAllocationDays / totalDaysAssigned : 0;

    // Sort to find time span
    const sortedAssignments = [...validAssignments].sort((a, b) =>
      a.effective_start_date.localeCompare(b.effective_start_date)
    );

    const timeSpan = {
      start: sortedAssignments[0].effective_start_date,
      end: sortedAssignments.reduce((maxEnd, a) =>
        a.effective_end_date > maxEnd ? a.effective_end_date : maxEnd,
        sortedAssignments[0].effective_end_date
      )
    };

    const peakAssignment = peakIndex >= 0 ? validAssignments[peakIndex] : null;
    const peakPeriod = peakAssignment ? {
      start: peakAssignment.effective_start_date,
      end: peakAssignment.effective_end_date,
      allocation: peakAllocation
    } : null;

    return {
      totalAssignments: assignments.length,
      averageAllocation,
      timeSpan,
      peakPeriod,
      availabilityOverrideCount: availabilityOverrides.length
    };
  }

  deleteTestData = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const result = await this.executeQuery(async () => {
      // Delete test assignments (ones with "Test_" in related entities)
      const deleted = await this.db('project_assignments')
        .whereIn('project_id', 
          this.db('projects').select('id').whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        )
        .orWhereIn('person_id',
          this.db('people').select('id').whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])  
        )
        .del();

      return { message: `Deleted ${deleted} test assignments` };
    }, req, res, 'Failed to delete test data');

    if (result) {
      this.sendSuccess(req, res, result, 'Test assignments deleted successfully');
    }
  })

  private daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Compute assignment start and end dates based on assignment_date_mode
   */
  /** I02a：委托共享原语（services/calc/assignmentDates）——写路径与刷新路径
   *  单一算法，防两处口径漂移（EXP-B11） */
  private async computeAssignmentDates(
    assignment: AssignmentRow & { project?: { name?: string; aspiration_start?: string; aspiration_finish?: string; start_date?: string | null; end_date?: string | null } },
    conn: any = this.db
  ): Promise<{
    computed_start_date?: string;
    computed_end_date?: string;
  }> {
    return computeAssignmentDates(conn, assignment as any) as Promise<{
      computed_start_date?: string;
      computed_end_date?: string;
    }>;
  }

  /** 同业务键查重；phase_id NULL 需要 whereNull（SQLite 唯一索引不会拦 NULL）。
   *  direct 轨（project_assignments）没有 scenario_id 列，scenarioId 传 undefined。 */
  private async findDuplicateAssignment(
    conn: any,
    tableName: string,
    params: { scenarioId?: string; projectId: string; personId: string; roleId: string; phaseId: string | null },
    excludeId?: string
  ): Promise<any> {
    let query = conn(tableName).where({
      ...(params.scenarioId ? { scenario_id: params.scenarioId } : {}),
      project_id: params.projectId,
      person_id: params.personId,
      role_id: params.roleId,
    });
    if (params.phaseId) query = query.where('phase_id', params.phaseId);
    else query = query.whereNull('phase_id');
    if (excludeId) query = query.whereNot('id', excludeId);
    return query.first();
  }

  private async roleNameFor(conn: any, roleId: string): Promise<string | undefined> {
    const role = await conn('roles').where('id', roleId).first();
    return role?.name;
  }

  /**
   * 写路径（update/delete）的行定位：场景轨必须与当前 X-Scenario-Id 匹配，
   * 不能靠 id 猜；direct 轨没有 scenario_id，只允许 baseline 上下文写入。
   * 场景不匹配按 404 处理（不泄露其他场景的行是否存在）。
   */
  private async findAssignmentForWrite(id: string, scenarioId: string): Promise<{
    tableName: 'scenario_project_assignments' | 'project_assignments';
    actualId: string;
    isScenarioAssignment: boolean;
    scenarioId: string;
    row: any;
  } | null> {
    const isScenarioAssignment = id.startsWith('spa-');
    const actualId = isScenarioAssignment ? id.substring(4) : id;

    if (isScenarioAssignment) {
      const row = await this.db('scenario_project_assignments')
        .where({ id: actualId, scenario_id: scenarioId })
        .first();
      return row
        ? { tableName: 'scenario_project_assignments', actualId, isScenarioAssignment: true, scenarioId, row }
        : null;
    }

    const scenarioRow = await this.db('scenario_project_assignments')
      .where({ id: actualId, scenario_id: scenarioId })
      .first();
    if (scenarioRow) {
      return { tableName: 'scenario_project_assignments', actualId, isScenarioAssignment: true, scenarioId, row: scenarioRow };
    }

    if (scenarioId !== BASELINE_SCENARIO_ID) {
      // direct 行是 baseline 全局数据；从分支场景写入会绕过场景隔离
      return null;
    }

    const directRow = await this.db('project_assignments').where('id', actualId).first();
    return directRow
      ? { tableName: 'project_assignments', actualId, isScenarioAssignment: false, scenarioId, row: directRow }
      : null;
  }
}