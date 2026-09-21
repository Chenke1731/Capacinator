import type { Response } from 'express';
import type { Knex } from 'knex';
import { BaseController, RequestWithContext } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { transformDates, transformDatesInArray, COMMON_DATE_FIELDS } from '../../utils/dateTransform.js';
import { notificationScheduler } from '../../services/NotificationScheduler.js';
import { logger } from '../../services/logging/config.js';

// Alias for backward compatibility with existing code
type RequestWithLogging = RequestWithContext;

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
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const filters = {
      project_id: req.query.project_id,
      person_id: req.query.person_id,
      role_id: req.query.role_id,
      status: req.query.status
    };

    // Get scenario from header
    const scenarioId = req.headers['x-scenario-id'] as string;
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

      // Filter by scenario if provided and not including all scenarios
      if (scenarioId && !includeAllScenarios) {
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
      query = this.paginate(query, page, limit);
      query = query.orderBy('assignments_view.start_date', 'desc');

      const assignments = await query;
      const total = await this.db('assignments_view').count('* as count').first();

      // Compute dates for each assignment
      const assignmentsWithComputedDates = await Promise.all(
        assignments.map(async (assignment: AssignmentRow) => {
          // Map the query result fields to what computeAssignmentDates expects
          const assignmentForComputation = {
            ...assignment,
            // Create a mock project object with the dates
            project: {
              aspiration_start: assignment.aspiration_start,
              aspiration_finish: assignment.aspiration_finish,
              start_date: null, // Projects table doesn't have start_date
              end_date: null,   // Projects table doesn't have end_date
              name: assignment.project_name
            }
          };
          const computedDates = await this.computeAssignmentDates(assignmentForComputation);
          return { ...assignment, ...computedDates };
        })
      );

      // Transform date fields from timestamps to date strings
      const transformedAssignments = transformDatesInArray(assignmentsWithComputedDates, [
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
    const assignmentData = req.body;

    const result = await this.executeQuery(async () => {
      // Validate required fields
      if (!assignmentData.project_id || !assignmentData.person_id || !assignmentData.role_id) {
        throw this.createOperationalError('Missing required fields: project_id, person_id, and role_id are required', 400);
      }

      // Validate allocation percentage
      const allocation = assignmentData.allocation_percentage || 0;
      if (allocation <= 0) {
        throw this.createOperationalError('Allocation percentage must be positive', 400);
      }
      if (allocation > 200) {
        throw this.createOperationalError('Allocation percentage cannot exceed 200%', 400);
      }

      // Validate assignment_date_mode
      const validDateModes = ['fixed', 'project', 'phase'];
      if (!assignmentData.assignment_date_mode || !validDateModes.includes(assignmentData.assignment_date_mode)) {
        return res.status(400).json({
          error: 'Invalid assignment_date_mode. Must be one of: fixed, project, phase'
        });
      }

      // Validate dates based on mode
      if (assignmentData.assignment_date_mode === 'fixed') {
        if (!assignmentData.start_date || !assignmentData.end_date) {
          return res.status(400).json({
            error: 'Start date and end date are required for fixed date mode assignments'
          });
        }
        // Validate date format and order
        const startDate = new Date(assignmentData.start_date);
        const endDate = new Date(assignmentData.end_date);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({
            error: 'Invalid date format. Use YYYY-MM-DD format'
          });
        }
        if (startDate > endDate) {
          return res.status(400).json({
            error: 'Start date must be before or equal to end date'
          });
        }
      } else if (assignmentData.assignment_date_mode === 'phase' && !assignmentData.phase_id) {
        return res.status(400).json({
          error: 'Phase ID is required for phase-based assignments'
        });
      }

      // Compute dates based on assignment mode
      const computedDates = await this.computeAssignmentDates(assignmentData);
      
      // Use computed dates for conflict checking
      const effectiveStartDate = computedDates.computed_start_date || assignmentData.start_date;
      const effectiveEndDate = computedDates.computed_end_date || assignmentData.end_date;

      // Ensure we have valid dates for the assignment
      if (!effectiveStartDate || !effectiveEndDate) {
        return res.status(400).json({
          error: 'Unable to determine assignment dates. Check project/phase configuration.'
        });
      }

      // Get scenario from header
      const scenarioId = req.headers['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';

      // Check for conflicts before creating
      const conflicts = await this.checkConflicts(
        assignmentData.person_id,
        effectiveStartDate,
        effectiveEndDate,
        assignmentData.allocation_percentage,
        undefined,
        scenarioId
      );

      let warning = null;
      if (conflicts && conflicts.total_allocation > 100) {
        warning = `Person will be overallocated at ${conflicts.total_allocation}% during this period`;
      }
      
      const [assignment] = await this.db('scenario_project_assignments')
        .insert({
          ...assignmentData,
          ...computedDates,
          scenario_id: scenarioId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      // Return assignment with computed dates
      const assignmentWithDates = { ...assignment, ...computedDates };
      
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
    const updateData = req.body;

    const result = await this.executeQuery(async () => {
      // Check for assignment in scenario table first, then fall back to legacy table
      let existing;
      let tableName = 'scenario_project_assignments';
      let actualId = id;
      let isScenarioAssignment = true;
      
      // Remove 'spa-' prefix if present for backward compatibility
      if (id.startsWith('spa-')) {
        actualId = id.substring(4);
      }
      
      existing = await this.db(tableName).where('id', actualId).first();

      // If not found in scenario table, check legacy table
      if (!existing) {
        tableName = 'project_assignments';
        isScenarioAssignment = false;
        existing = await this.db(tableName).where('id', actualId).first();
      }

      if (!existing) {
        this.handleNotFound(req, res, 'Assignment');
        return null;
      }

      // Validate pause status if provided (lifecycle 退回/裁决取消 or manual pause)
      if (updateData.status !== undefined) {
        if (!['active', 'paused'].includes(updateData.status)) {
          return res.status(400).json({
            error: "Invalid status. Must be 'active' or 'paused'"
          });
        }
      }

      // Validate allocation percentage if provided
      if (updateData.allocation_percentage !== undefined) {
        const allocation = updateData.allocation_percentage;
        if (allocation <= 0) {
          return res.status(400).json({
            error: 'Allocation percentage must be positive'
          });
        }
        if (allocation > 200) {
          return res.status(400).json({
            error: 'Allocation percentage cannot exceed 200%'
          });
        }
      }

      // Validate date mode if it's being changed
      if (updateData.assignment_date_mode) {
        const validDateModes = ['fixed', 'project', 'phase'];
        if (!validDateModes.includes(updateData.assignment_date_mode)) {
          return res.status(400).json({
            error: 'Invalid assignment_date_mode. Must be one of: fixed, project, phase'
          });
        }
      }

      // Determine the effective date mode
      const dateMode = updateData.assignment_date_mode || existing.assignment_date_mode;

      // Validate dates based on mode
      if (dateMode === 'fixed') {
        const startDate = updateData.start_date || existing.start_date;
        const endDate = updateData.end_date || existing.end_date;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            error: 'Start date and end date are required for fixed date mode assignments'
          });
        }

        // Validate date format and order if dates are being updated
        if (updateData.start_date || updateData.end_date) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
              error: 'Invalid date format. Use YYYY-MM-DD format'
            });
          }
          if (start > end) {
            return res.status(400).json({
              error: 'Start date must be before or equal to end date'
            });
          }
        }
      } else if (dateMode === 'phase') {
        const phaseId = updateData.phase_id || existing.phase_id;
        if (!phaseId) {
          return res.status(400).json({
            error: 'Phase ID is required for phase-based assignments'
          });
        }
      }

      // Compute dates for the updated assignment
      const assignmentForComputation = { ...existing, ...updateData };
      const computedDates = await this.computeAssignmentDates(assignmentForComputation);
      
      // Use computed dates for conflict checking
      const effectiveStartDate = computedDates.computed_start_date || updateData.start_date || existing.start_date;
      const effectiveEndDate = computedDates.computed_end_date || updateData.end_date || existing.end_date;

      // Ensure we have valid dates
      if (!effectiveStartDate || !effectiveEndDate) {
        return res.status(400).json({
          error: 'Unable to determine assignment dates. Check project/phase configuration.'
        });
      }

      // Check conflicts if dates or allocation changed
      let warning = null;
      let totalAllocation = null;
      
      // Get scenario from existing assignment or header
      const scenarioId = existing.scenario_id || req.headers['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';
      
      if (updateData.start_date || updateData.end_date || updateData.allocation_percentage || 
          updateData.assignment_date_mode || updateData.phase_id) {
        const conflict = await this.checkConflicts(
          updateData.person_id || existing.person_id,
          effectiveStartDate,
          effectiveEndDate,
          updateData.allocation_percentage || existing.allocation_percentage,
          id, // Exclude current assignment
          scenarioId
        );

        if (conflict && conflict.total_allocation > 100) {
          warning = `Person will be overallocated at ${conflict.total_allocation}% during this period`;
          totalAllocation = conflict.total_allocation;
        }
      }

      // Update assignment
      const [updated] = await this.db(tableName)
        .where('id', actualId)
        .update({
          ...updateData,
          updated_at: new Date()
        })
        .returning('*');
        
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

    const result = await this.executeQuery(async () => {
      // Check if this is a scenario assignment
      const isScenarioAssignment = id.startsWith('spa-');
      let deleted;
      let assignment;
      let tableName;
      let actualId = id;
      
      if (isScenarioAssignment) {
        actualId = id.substring(4); // Remove 'spa-' prefix
        tableName = 'scenario_project_assignments';
        assignment = await this.db(tableName).where('id', actualId).first();
        deleted = await this.db(tableName)
          .where('id', actualId)
          .del();
      } else {
        tableName = 'project_assignments';
        assignment = await this.db(tableName).where('id', id).first();
        deleted = await this.db(tableName)
          .where('id', id)
          .del();
      }

      if (!assignment || deleted === 0) {
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
              start_date: assignment.start_date,
              end_date: assignment.end_date,
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
    scenarioId?: string
  ): Promise<AssignmentConflict | null> {
    // Get person details
    const person = await this.db('people')
      .where('id', person_id)
      .first();

    if (!person) return null;

    // Get scenario from header if not provided
    if (!scenarioId) {
      scenarioId = (this as any).req?.headers?.['x-scenario-id'] as string || 'baseline-0000-0000-0000-000000000000';
    }

    // Get overlapping assignments from assignments_view (includes both direct and scenario assignments)
    let query = this.db('assignments_view')
      .join('projects', 'assignments_view.project_id', 'projects.id')
      .where('assignments_view.person_id', person_id)
      .where('assignments_view.scenario_id', scenarioId)
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

    if (exclude_assignment_id) {
      query = query.where('assignments_view.id', '!=', exclude_assignment_id);
    }

    const overlapping = await query.select(
      'assignments_view.*',
      'projects.name as project_name'
    );

    const total_allocation = overlapping.reduce((sum: number, assignment: OverlappingAssignment) =>
      sum + assignment.allocation_percentage, allocation_percentage
    );

    // Get person's current availability
    const availability = await this.db('person_availability_view')
      .where('person_id', person_id)
      .first();

    const available_capacity = availability?.effective_availability_percentage || 100;

    if (total_allocation > available_capacity) {
      return {
        person_id,
        person_name: person.name,
        conflicting_projects: overlapping.map((a: OverlappingAssignment) => ({
          project_name: a.project_name,
          start_date: a.computed_start_date || a.start_date || '',
          end_date: a.computed_end_date || a.end_date || '',
          allocation_percentage: a.allocation_percentage
        })),
        total_allocation,
        available_capacity
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

        const availableCapacity = (availability?.effective_availability_percentage || 100) - currentAllocation;

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
          this.db('projects').select('id').where('name', 'like', 'Test_%')
        )
        .orWhereIn('person_id',
          this.db('people').select('id').where('name', 'like', 'Test_%')  
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
  private async computeAssignmentDates(assignment: AssignmentRow & { project?: { name?: string; aspiration_start?: string; aspiration_finish?: string; start_date?: string | null; end_date?: string | null } }): Promise<{
    computed_start_date?: string;
    computed_end_date?: string;
  }> {
    const mode = assignment.assignment_date_mode || 'fixed';
    
    switch (mode) {
      case 'fixed':
        // Use explicit start_date and end_date
        return {
          computed_start_date: assignment.start_date,
          computed_end_date: assignment.end_date
        };
        
      case 'phase': {
        // Get dates from project phase timeline
        if (!assignment.phase_id || !assignment.project_id) {
          throw new Error('Phase mode requires both phase_id and project_id');
        }

        const phaseTimeline = await this.db('project_phases_timeline')
          .where('project_id', assignment.project_id)
          .where('phase_id', assignment.phase_id)
          .first();

        if (!phaseTimeline) {
          throw new Error(`No timeline found for phase ${assignment.phase_id} in project ${assignment.project_id}`);
        }

        return {
          computed_start_date: phaseTimeline.start_date,
          computed_end_date: phaseTimeline.end_date
        };
      }

      case 'project': {
        // Get dates from project aspiration dates
        if (!assignment.project_id) {
          throw new Error('Project mode requires project_id');
        }

        // Use project data from assignment if available (when called from getAll),
        // otherwise fetch from database
        let project = assignment.project;
        if (!project) {
          project = await this.db('projects')
            .where('id', assignment.project_id)
            .first();

          if (!project) {
            throw new Error(`Project ${assignment.project_id} not found`);
          }
        }

        // Use aspiration dates if available, otherwise fall back to project start/end dates
        const startDate = project.aspiration_start || project.start_date;
        const endDate = project.aspiration_finish || project.end_date;

        if (!startDate || !endDate) {
          logger.warn('Project missing both aspiration and start/end dates, using assignment dates as fallback', { projectId: assignment.project_id, projectName: project.name || 'Unknown' });

          // If assignment dates are also missing, use reasonable defaults
          const fallbackStartDate = assignment.start_date || new Date().toISOString().split('T')[0];
          const fallbackEndDate = assignment.end_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 90 days from now

          return {
            computed_start_date: fallbackStartDate,
            computed_end_date: fallbackEndDate
          };
        }

        return {
          computed_start_date: startDate,
          computed_end_date: endDate
        };
      }

      default:
        throw new Error(`Unknown assignment_date_mode: ${mode}`);
    }
  }
}