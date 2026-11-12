import type { Response } from 'express';
import type { Knex } from 'knex';
import { BaseController, RequestWithContext } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { auditModelChanges } from '../../middleware/enhancedAuditMiddleware.js';
import { validateDateRange, formatDateForDB } from '../../utils/dateValidation.js';
import { AssignmentRecalculationService, type AssignmentDateChange } from '../../services/AssignmentRecalculationService.js';

// Alias for backward compatibility
type RequestWithLogging = RequestWithContext;

export class ProjectPhasesController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({ enableLogging: true }, { container });
  }
  getAll = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const result = await this.executeQuery(async () => {
      let query = this.db('project_phases_timeline')
        .join('projects', 'project_phases_timeline.project_id', 'projects.id')
        .join('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'projects.name as project_name',
          'project_phases.name as phase_name',
          'project_phases.order_index as phase_order',
          this.db.raw('CASE WHEN project_phases.name LIKE \'%Project:%\' THEN 1 ELSE 0 END as is_custom_phase')
        );

      // Apply filters with proper table references
      if (req.query.project_id) {
        query = query.where('project_phases_timeline.project_id', req.query.project_id);
      }
      if (req.query.phase_id) {
        query = query.where('project_phases_timeline.phase_id', req.query.phase_id);
      }
      
      if (req.query.page || req.query.limit) {
        query = this.paginate(query, page, limit);
      } else {
        query = query.orderBy('projects.name', 'project_phases.order_index');
      }

      const projectPhases = await query;

      // Get total count if paginated
      let total = projectPhases.length;
      if (req.query.page || req.query.limit) {
        let countQuery = this.db('project_phases_timeline').count('* as count');
        
        // Apply the same filters to count query
        if (req.query.project_id) {
          countQuery = countQuery.where('project_id', req.query.project_id);
        }
        if (req.query.phase_id) {
          countQuery = countQuery.where('phase_id', req.query.phase_id);
        }
        
        const totalResult = await countQuery.first();
        total = Number(totalResult?.count) || 0;
      }

      if (req.query.page || req.query.limit) {
        return {
          data: projectPhases,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        };
      } else {
        return { data: projectPhases };
      }
    }, req, res, 'Failed to fetch project phases');

    if (result) {
      res.json(result);
    }
  });

  getById = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const projectPhase = await this.db('project_phases_timeline')
        .join('projects', 'project_phases_timeline.project_id', 'projects.id')
        .join('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'projects.name as project_name',
          'project_phases.name as phase_name',
          'project_phases.order_index as phase_order'
        )
        .where('project_phases_timeline.id', id)
        .first();

      if (!projectPhase) {
        this.handleNotFound(req, res, 'Project phase');
        return null;
      }

      return { data: projectPhase };
    }, req, res, 'Failed to fetch project phase');

    if (result) {
      res.json(result);
    }
  });

  create = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const phaseData = req.body;

    const result = await this.executeQuery(async () => {
      // Validate that project exists
      const project = await this.db('projects')
        .where('id', phaseData.project_id)
        .first();

      if (!project) {
        res.status(404).json({
          error: 'Project not found'
        });
        return null;
      }

      // Validate that phase exists
      const phase = await this.db('project_phases')
        .where('id', phaseData.phase_id)
        .first();

      if (!phase) {
        res.status(404).json({
          error: 'Phase not found'
        });
        return null;
      }

      // Validate dates
      if (phaseData.start_date && phaseData.end_date) {
        const dateValidation = validateDateRange(phaseData.start_date, phaseData.end_date);
        if (!dateValidation.isValid) {
          res.status(400).json({
            error: dateValidation.error
          });
          return null;
        }
        
        // Normalize dates for database storage
        phaseData.start_date = formatDateForDB(dateValidation.startDate!);
        phaseData.end_date = formatDateForDB(dateValidation.endDate!);
      }

      // Check for duplicate
      const existing = await this.db('project_phases_timeline')
        .where({
          project_id: phaseData.project_id,
          phase_id: phaseData.phase_id
        })
        .first();

      if (existing) {
        res.status(409).json({
          error: 'Phase already exists for this project',
          existing
        });
        return null;
      }

      const [projectPhase] = await this.db('project_phases_timeline')
        .insert({
          ...phaseData,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      return { data: projectPhase };
    }, req, res, 'Failed to create project phase');

    if (result) {
      res.status(201).json(result);
    }
  });

  update = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const result = await this.executeQuery(async () => {
      // Get the current phase info first
      const currentPhase = await this.db('project_phases_timeline')
        .leftJoin('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name',
          this.db.raw('CASE WHEN project_phases.name LIKE \'%Project:%\' THEN 1 ELSE 0 END as is_custom_phase')
        )
        .where('project_phases_timeline.id', id)
        .first();

      if (!currentPhase) {
        this.handleNotFound(req, res, 'Project phase');
        return null;
      }

      // Validate dates with improved validation
      if (updateData.start_date || updateData.end_date) {
        // Use existing dates if only one is being updated
        const startDateToValidate = updateData.start_date || currentPhase.start_date;
        const endDateToValidate = updateData.end_date || currentPhase.end_date;
        
        const dateValidation = validateDateRange(startDateToValidate, endDateToValidate);
        if (!dateValidation.isValid) {
          res.status(400).json({
            error: dateValidation.error
          });
          return null;
        }
        
        // Normalize dates to consistent format for database storage
        if (updateData.start_date) {
          updateData.start_date = formatDateForDB(dateValidation.startDate!);
        }
        if (updateData.end_date) {
          updateData.end_date = formatDateForDB(dateValidation.endDate!);
        }
      }

      // Check if this is a custom phase (has the is_custom_phase flag)
      const isCustomPhase = currentPhase.is_custom_phase === 1;
      
      // Filter allowed fields based on phase type
      const allowedFields = ['start_date', 'end_date'];
      if (isCustomPhase) {
        allowedFields.push('phase_name');
      }
      
      const timelineUpdateData = Object.keys(updateData)
        .filter(key => ['start_date', 'end_date'].includes(key))
        .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {} as any);

      const phaseUpdateData = isCustomPhase && updateData.phase_name ? 
        { name: updateData.phase_name } : null;

      if (Object.keys(timelineUpdateData).length === 0 && !phaseUpdateData) {
        res.status(400).json({
          error: `No valid fields to update. Allowed fields: ${allowedFields.join(', ')}`
        });
        return null;
      }

      // I02a/D18：timeline 写 + computed 刷新同事务（刷新失败整体回滚，不留
      // "阶段已改、分配未跟"的半状态）；审计一律移到提交后（F8：回滚不留
      // phantom 审计）
      const dateChanged = Object.keys(timelineUpdateData).length > 0;
      // I02j/NIT-4：DB 写入与审计复用同一时刻，审计回放不产生毫秒偏差
      const now = new Date();
      let assignmentChanges: AssignmentDateChange[] = [];
      await this.db.transaction(async (trx: Knex.Transaction) => {
        if (dateChanged) {
          await trx('project_phases_timeline')
            .where('id', id)
            .update({
              ...timelineUpdateData,
              updated_at: now
            });
        }

        // Update phase name if it's a custom phase
        if (phaseUpdateData && currentPhase.phase_id) {
          await trx('project_phases')
            .where('id', currentPhase.phase_id)
            .update({
              ...phaseUpdateData,
              updated_at: now
            });
        }

        if (dateChanged && currentPhase.phase_id) {
          assignmentChanges = await new AssignmentRecalculationService(this.db)
            .recalculateForPhaseTimelineChange(
              String(currentPhase.project_id),
              [String(currentPhase.phase_id)],
              { trx }
            );
        }
      });

      if (dateChanged) {
        await auditModelChanges(req, {
          tableName: 'project_phases_timeline',
          recordId: id,
          action: 'UPDATE',
          oldValues: currentPhase,
          newValues: {
            ...currentPhase,
            ...timelineUpdateData,
            updated_at: now
          }
        });
      }
      for (const change of assignmentChanges) {
        await (req as any).logAuditEvent?.(
          'scenario_project_assignments',
          change.assignment_id,
          'UPDATE',
          { computed_start_date: change.old.start, computed_end_date: change.old.end },
          { computed_start_date: change.new.start, computed_end_date: change.new.end },
          'recomputed from phase timeline'
        );
      }

      // Get the updated phase data
      const projectPhase = await this.db('project_phases_timeline')
        .leftJoin('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name',
          this.db.raw('CASE WHEN project_phases.name LIKE \'%Project:%\' THEN 1 ELSE 0 END as is_custom_phase')
        )
        .where('project_phases_timeline.id', id)
        .first();

      if (!projectPhase) {
        this.handleNotFound(req, res, 'Project phase');
        return null;
      }

      return { data: projectPhase };
    }, req, res, 'Failed to update project phase');

    if (result) {
      res.json(result);
    }
  });

  delete = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      // Get the record before deletion for audit
      const existingRecord = await this.db('project_phases_timeline')
        .where('id', id)
        .first();

      if (!existingRecord) {
        this.handleNotFound(req, res, 'Project phase');
        return null;
      }

      // I02a/Q1（D18 评审裁决③）：被 phase 模式分配引用的阶段禁止删除——
      // 删除会让引用行 computed 失去来源（写 NULL 在利用率视图=无边界全窗，
      // 永久虚增负荷），返回引用清单供用户先改挂/删除分配
      if (existingRecord.phase_id) {
        const refs = await this.db('scenario_project_assignments')
          .where({
            project_id: existingRecord.project_id,
            phase_id: existingRecord.phase_id,
            assignment_date_mode: 'phase',
          })
          .select('id', 'scenario_id', 'person_id', 'allocation_percentage');
        if (refs.length > 0) {
          res.status(409).json({
            error: 'Conflict',
            message: `Phase has ${refs.length} phase-aligned assignment(s); reassign or delete them first`,
            references: refs.slice(0, 20),
          });
          return null;
        }
      }

      const deletedCount = await this.db('project_phases_timeline')
        .where('id', id)
        .del();

      if (deletedCount === 0) {
        this.handleNotFound(req, res, 'Project phase');
        return null;
      }

      // 审计后置（删除成功后）
      await auditModelChanges(req, {
        tableName: 'project_phases_timeline',
        recordId: id,
        action: 'DELETE',
        oldValues: existingRecord,
        newValues: null
      });

      return { message: 'Project phase deleted successfully' };
    }, req, res, 'Failed to delete project phase');

    if (result) {
      res.json(result);
    }
  });

  bulkUpdate = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { updates } = req.body;
    // 数组入参校验(2026-10-13 全库审计): 非数组载荷原先 TypeError → 500
    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ error: 'Validation error', message: 'updates must be a non-empty array' });
      return;
    }

    const result = await this.executeQuery(async () => {
      const results = {
        updated: [] as any[],
        failed: [] as any[]
      };
      // I02a/F7：审计收集到事务外（事务内调 logAuditEvent 在单连接池会等连接）；
      // 刷新在事务内，按 project 分组一次
      const auditEntries: Array<{ recordId: string; oldValues: any; newValues: any }> = [];
      const affectedByProject = new Map<string, Set<string>>();
      const assignmentChanges: AssignmentDateChange[] = [];

      await this.db.transaction(async (trx: Knex.Transaction) => {
        for (const update of updates) {
          try {
            // Validate dates
            if (update.start_date && update.end_date) {
              const startDate = new Date(update.start_date);
              const endDate = new Date(update.end_date);

              if (startDate >= endDate) {
                results.failed.push({
                  id: update.id,
                  error: 'Start date must be before end date'
                });
                continue;
              }
            }

            // Get existing record for audit
            const existingRecord = await trx('project_phases_timeline')
              .where('id', update.id)
              .first();

            if (!existingRecord) {
              results.failed.push({
                id: update.id,
                error: 'Project phase not found'
              });
              continue;
            }

            // I02j/NIT-4：DB 写入与审计复用同一时刻
            const now = new Date();
            const [updated] = await trx('project_phases_timeline')
              .where('id', update.id)
              .update({
                start_date: update.start_date,
                end_date: update.end_date,
                updated_at: now
              })
              .returning('*');
            
            if (updated) {
              results.updated.push(updated);
              auditEntries.push({
                recordId: update.id,
                oldValues: existingRecord,
                newValues: { ...existingRecord, start_date: update.start_date, end_date: update.end_date, updated_at: now }
              });
              if (existingRecord.project_id && existingRecord.phase_id) {
                const key = String(existingRecord.project_id);
                if (!affectedByProject.has(key)) affectedByProject.set(key, new Set());
                affectedByProject.get(key)!.add(String(existingRecord.phase_id));
              }
            } else {
              results.failed.push({
                id: update.id,
                error: 'Project phase not found'
              });
            }
          } catch (error) {
            results.failed.push({
              id: update.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        const service = new AssignmentRecalculationService(this.db);
        for (const [projectId, phaseIds] of affectedByProject) {
          assignmentChanges.push(
            ...(await service.recalculateForPhaseTimelineChange(projectId, [...phaseIds], { trx }))
          );
        }
      });

      // 提交后审计：timeline 行 + 刷新变更行（逐条 await，INV-4 覆盖）
      for (const entry of auditEntries) {
        await (req as any).logAuditEvent?.('project_phases_timeline', entry.recordId, 'UPDATE', entry.oldValues, entry.newValues);
      }
      for (const change of assignmentChanges) {
        await (req as any).logAuditEvent?.(
          'scenario_project_assignments',
          change.assignment_id,
          'UPDATE',
          { computed_start_date: change.old.start, computed_end_date: change.old.end },
          { computed_start_date: change.new.start, computed_end_date: change.new.end },
          'recomputed from phase timeline'
        );
      }

      return results;
    }, req, res, 'Failed to bulk update project phases');

    if (result) {
      res.json(result);
    }
  });

  /**
   * Duplicate an existing phase for a project, including its resource allocations
   */
  duplicatePhase = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { project_id, source_phase_id, target_phase_id, start_date, end_date, custom_name } = req.body;

    const result = await this.executeQuery(async () => {
      // Validate required fields
      if (!project_id || !source_phase_id || !target_phase_id || !start_date || !end_date) {
        res.status(400).json({
          error: 'Missing required fields: project_id, source_phase_id, target_phase_id, start_date, end_date'
        });
        return null;
      }

      // Validate dates
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      if (startDate >= endDate) {
        res.status(400).json({
          error: 'Start date must be before end date'
        });
        return null;
      }

      return await this.db.transaction(async (trx: Knex.Transaction) => {
        // Validate that source project phase exists
        const sourcePhase = await trx('project_phases_timeline')
          .where({
            project_id,
            phase_id: source_phase_id
          })
          .first();

        if (!sourcePhase) {
          res.status(404).json({
            error: 'Source phase not found for this project'
          });
          return null;
        }

        // Check if target phase already exists for this project
        const existingTarget = await trx('project_phases_timeline')
          .where({
            project_id,
            phase_id: target_phase_id
          })
          .first();

        if (existingTarget) {
          res.status(409).json({
            error: 'Target phase already exists for this project',
            existing: existingTarget
          });
          return null;
        }

        // Create the new project phase timeline entry
        const [newPhaseTimeline] = await trx('project_phases_timeline')
          .insert({
            project_id,
            phase_id: target_phase_id,
            start_date,
            end_date,
            created_at: new Date(),
            updated_at: new Date()
          })
          .returning('*');

        // Copy resource allocations from source phase
        const sourceAllocations = await trx('project_allocation_overrides')
          .where({
            project_id,
            phase_id: source_phase_id
          });

        const copiedAllocations = [];
        for (const allocation of sourceAllocations) {
          const [newAllocation] = await trx('project_allocation_overrides')
            .insert({
              project_id,
              project_sub_type_id: allocation.project_sub_type_id,
              phase_id: target_phase_id,
              role_id: allocation.role_id,
              allocation_percentage: allocation.allocation_percentage,
              template_id: allocation.template_id,
              is_inherited: allocation.is_inherited,
              created_at: new Date(),
              updated_at: new Date()
            })
            .returning('*');
          copiedAllocations.push(newAllocation);
        }

        // Copy demand overrides from source phase
        const sourceDemandOverrides = await trx('demand_overrides')
          .where({
            project_id,
            phase_id: source_phase_id
          });

        const copiedDemandOverrides = [];
        for (const demandOverride of sourceDemandOverrides) {
          const [newDemandOverride] = await trx('demand_overrides')
            .insert({
              project_id,
              phase_id: target_phase_id,
              role_id: demandOverride.role_id,
              start_date,
              end_date,
              demand_hours: demandOverride.demand_hours,
              reason: `Duplicated from phase: ${custom_name || 'Unknown'} (${demandOverride.reason || 'No reason'})`,
              created_at: new Date(),
              updated_at: new Date()
            })
            .returning('*');
          copiedDemandOverrides.push(newDemandOverride);
        }

        // Get phase details for response
        const phaseDetails = await trx('project_phases')
          .where('id', target_phase_id)
          .first();

        return {
          timeline: newPhaseTimeline,
          phase_details: phaseDetails,
          allocations_copied: copiedAllocations.length,
          demand_overrides_copied: copiedDemandOverrides.length,
          copied_allocations: copiedAllocations,
          copied_demand_overrides: copiedDemandOverrides
        };
      });
    }, req, res, 'Failed to duplicate phase');

    if (result) {
      res.status(201).json({ data: result });
    }
  });

  /**
   * Create a new custom phase that doesn't exist in the master phases list
   */
  createCustomPhase = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const { project_id, phase_name, description, start_date, end_date, order_index } = req.body;

    const result = await this.executeQuery(async () => {
      // Validate required fields
      if (!project_id || !phase_name || !start_date || !end_date) {
        res.status(400).json({
          error: 'Missing required fields: project_id, phase_name, start_date, end_date'
        });
        return null;
      }

      // Validate dates
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      if (startDate >= endDate) {
        res.status(400).json({
          error: 'Start date must be before end date'
        });
        return null;
      }

      return await this.db.transaction(async (trx: Knex.Transaction) => {
        // Check if project exists
        const project = await trx('projects')
          .where('id', project_id)
          .first();

        if (!project) {
          res.status(404).json({
            error: 'Project not found'
          });
          return null;
        }

        // Create the new phase in the master phases table
        // Use a unique name that includes project identifier to avoid conflicts
        const uniquePhaseName = `${phase_name} (Project: ${project.name})`;
        
        const [newPhase] = await trx('project_phases')
          .insert({
            name: uniquePhaseName,
            description: description || `Custom phase for project: ${project.name}`,
            // I01w（EXP-B05 族）：nullish——显式 0 序是合法排序值，仅缺省落尾序
            order_index: order_index ?? 99, // Default to end
            created_at: new Date(),
            updated_at: new Date()
          })
          .returning('*');

        // Create the project phase timeline entry
        const [newPhaseTimeline] = await trx('project_phases_timeline')
          .insert({
            project_id,
            phase_id: newPhase.id,
            start_date,
            end_date,
            created_at: new Date(),
            updated_at: new Date()
          })
          .returning('*');

        return {
          phase: newPhase,
          timeline: newPhaseTimeline,
          message: 'Custom phase created successfully. Resource allocations are empty and can be configured separately.'
        };
      });
    }, req, res, 'Failed to create custom phase');

    if (result) {
      res.status(201).json({ data: result });
    }
  });
}