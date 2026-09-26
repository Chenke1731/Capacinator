import type { Request, Response } from 'express';
import type { Knex } from 'knex';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { randomUUID } from 'crypto';
import { auditModelChanges } from '../../middleware/enhancedAuditMiddleware.js';

export class ScenariosController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  // Get all scenarios
  async getAll(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      const scenarios = await this.db('scenarios')
        .leftJoin('people as creator', 'scenarios.created_by', 'creator.id')
        .leftJoin('scenarios as parent', 'scenarios.parent_scenario_id', 'parent.id')
        .select(
          'scenarios.*',
          'creator.name as created_by_name',
          'parent.name as parent_scenario_name'
        )
        .orderBy('scenarios.created_at', 'desc');

      return scenarios;
    }, res, 'Failed to fetch scenarios');

    if (result) {
      res.json(result);
    }
  }

  // Get a specific scenario
  async getById(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const scenario = await this.db('scenarios')
        .leftJoin('people as creator', 'scenarios.created_by', 'creator.id')
        .leftJoin('scenarios as parent', 'scenarios.parent_scenario_id', 'parent.id')
        .select(
          'scenarios.*',
          'creator.name as created_by_name',
          'parent.name as parent_scenario_name'
        )
        .where('scenarios.id', id)
        .first();

      if (!scenario) {
        throw new Error('Scenario not found');
      }

      // Get child scenarios
      const childScenarios = await this.db('scenarios')
        .leftJoin('people as creator', 'scenarios.created_by', 'creator.id')
        .select(
          'scenarios.*',
          'creator.name as created_by_name'
        )
        .where('scenarios.parent_scenario_id', id);

      scenario.child_scenarios = childScenarios;

      return scenario;
    }, res, 'Failed to fetch scenario');

    if (result) {
      res.json(result);
    }
  }

  // Create a new scenario (branch from existing)
  async create(req: Request, res: Response) {
    const { name, description, parent_scenario_id, created_by, scenario_type = 'branch' } = req.body;

    // Prefer the authenticated identity over the client-supplied created_by
    // (2026-09-26 harvest hardening): body values can be stale — a browser
    // holding a token for a since-deleted person sent its id here and hit
    // the people FK. The token is the server's source of truth for the actor.
    const creator = (req as any).user?.id || created_by;
    if (!name || !creator) {
      return res.status(400).json({ error: 'Name and created_by are required' });
    }

    const result = await this.executeQuery(async () => {
      const scenarioId = randomUUID();
      const now = new Date();

      // Create the new scenario
      await this.db('scenarios').insert({
        id: scenarioId,
        name,
        description,
        parent_scenario_id,
        created_by: creator,
        status: 'active',
        scenario_type,
        branch_point: parent_scenario_id ? now : null,
        created_at: now,
        updated_at: now
      });

      // If this is a branch, copy relevant data from parent
      if (parent_scenario_id && scenario_type === 'branch') {
        await this.branchFromParent(scenarioId, parent_scenario_id);
      }

      // Return the created scenario
      const newScenario = await this.db('scenarios')
        .leftJoin('people as creator', 'scenarios.created_by', 'creator.id')
        .leftJoin('scenarios as parent', 'scenarios.parent_scenario_id', 'parent.id')
        .select(
          'scenarios.*',
          'creator.name as created_by_name',
          'parent.name as parent_scenario_name'
        )
        .where('scenarios.id', scenarioId)
        .first();

      // Audit log
      await auditModelChanges(req, {
        tableName: 'scenarios',
        recordId: scenarioId,
        action: 'INSERT',
        oldValues: null,
        newValues: newScenario
      });

      return newScenario;
    }, res, 'Failed to create scenario');

    if (result) {
      res.status(201).json(result);
    }
  }

  // Update a scenario
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const { name, description, status } = req.body;

    const result = await this.executeQuery(async () => {
      // Get existing scenario for audit
      const existingScenario = await this.db('scenarios')
        .where('id', id)
        .first();

      if (!existingScenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      const updateData: any = { updated_at: new Date() };
      
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;

      await this.db('scenarios')
        .where('id', id)
        .update(updateData);

      // Return updated scenario
      const scenario = await this.db('scenarios')
        .leftJoin('people as creator', 'scenarios.created_by', 'creator.id')
        .leftJoin('scenarios as parent', 'scenarios.parent_scenario_id', 'parent.id')
        .select(
          'scenarios.*',
          'creator.name as created_by_name',
          'parent.name as parent_scenario_name'
        )
        .where('scenarios.id', id)
        .first();

      // Audit log
      await auditModelChanges(req, {
        tableName: 'scenarios',
        recordId: id,
        action: 'UPDATE',
        oldValues: existingScenario,
        newValues: scenario
      });

      return scenario;
    }, res, 'Failed to update scenario');

    if (result) {
      res.json(result);
    }
  }

  // Delete a scenario
  async delete(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      // Check if scenario exists and get its type
      const scenario = await this.db('scenarios').where('id', id).first();
      if (!scenario) {
        throw new Error('Scenario not found');
      }

      // Prevent deletion of baseline scenario
      if (scenario.scenario_type === 'baseline') {
        throw new Error('Cannot delete baseline scenario');
      }

      // Check if scenario has child scenarios
      const childCount = await this.db('scenarios')
        .where('parent_scenario_id', id)
        .count('* as count')
        .first();

      if (childCount && Number(childCount.count) > 0) {
        throw new Error('Cannot delete scenario with child scenarios');
      }

      // Audit log before deletion
      await auditModelChanges(req, {
        tableName: 'scenarios',
        recordId: id,
        action: 'DELETE',
        oldValues: scenario,
        newValues: null
      });

      await this.db('scenarios').where('id', id).del();
      return { success: true };
    }, res, 'Failed to delete scenario');

    if (result) {
      res.json(result);
    }
  }

  // Get scenario assignments
  async getAssignments(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const assignments = await this.db('scenario_project_assignments')
        .where('scenario_id', id)
        .select('*');

      return assignments;
    }, res, 'Failed to fetch scenario assignments');

    if (result) {
      res.json(result);
    }
  }

  // Add/update assignment in scenario
  async upsertAssignment(req: Request, res: Response) {
    const { id } = req.params;
    const {
      project_id,
      person_id,
      role_id,
      phase_id,
      allocation_percentage,
      assignment_date_mode = 'project',
      start_date,
      end_date,
      notes,
      change_type = 'added',
      base_assignment_id
    } = req.body;

    if (!project_id || !person_id || !role_id || allocation_percentage === undefined) {
      return res.status(400).json({ 
        error: 'project_id, person_id, role_id, and allocation_percentage are required' 
      });
    }
    
    // Validate allocation percentage bounds
    if (allocation_percentage <= 0 || allocation_percentage > 100) {
      return res.status(400).json({ 
        error: 'allocation_percentage must be between 1 and 100' 
      });
    }

    const result = await this.executeQuery(async () => {
      const assignmentId = randomUUID();
      const now = new Date();

      // Check if assignment already exists for this combination
      const existing = await this.db('scenario_project_assignments')
        .where({
          scenario_id: id,
          project_id,
          person_id,
          role_id,
          phase_id: phase_id || null
        })
        .first();

      if (existing) {
        // Update existing assignment
        const updatedData = {
          allocation_percentage,
          assignment_date_mode,
          start_date,
          end_date,
          notes,
          change_type,
          base_assignment_id,
          updated_at: now
        };

        await this.db('scenario_project_assignments')
          .where('id', existing.id)
          .update(updatedData);

        const result = { ...existing, ...updatedData };

        // Audit log for update
        await auditModelChanges(req, {
          tableName: 'scenario_project_assignments',
          recordId: existing.id,
          action: 'UPDATE',
          oldValues: existing,
          newValues: result
        });

        return result;
      } else {
        // Create new assignment
        const assignmentData = {
          id: assignmentId,
          scenario_id: id,
          project_id,
          person_id,
          role_id,
          phase_id,
          allocation_percentage,
          assignment_date_mode,
          start_date,
          end_date,
          notes,
          change_type,
          base_assignment_id,
          created_at: now,
          updated_at: now
        };

        await this.db('scenario_project_assignments').insert(assignmentData);

        // Audit log for create
        await auditModelChanges(req, {
          tableName: 'scenario_project_assignments',
          recordId: assignmentId,
          action: 'INSERT',
          oldValues: null,
          newValues: assignmentData
        });

        return assignmentData;
      }
    }, res, 'Failed to create/update scenario assignment');

    if (result) {
      res.json(result);
    }
  }

  // Remove assignment from scenario
  async removeAssignment(req: Request, res: Response) {
    const { id, assignmentId } = req.params;

    const result = await this.executeQuery(async () => {
      // Get existing assignment for audit
      const existingAssignment = await this.db('scenario_project_assignments')
        .where('id', assignmentId)
        .where('scenario_id', id)
        .first();

      if (!existingAssignment) {
        throw new Error('Assignment not found');
      }

      // Audit log before deletion
      await auditModelChanges(req, {
        tableName: 'scenario_project_assignments',
        recordId: assignmentId,
        action: 'DELETE',
        oldValues: existingAssignment,
        newValues: null
      });

      await this.db('scenario_project_assignments')
        .where('id', assignmentId)
        .where('scenario_id', id)
        .del();

      return { success: true };
    }, res, 'Failed to remove scenario assignment');

    if (result) {
      res.json(result);
    }
  }

  // Compare two scenarios
  async compare(req: Request, res: Response) {
    const { id } = req.params;
    const { compare_to } = req.query;

    if (!compare_to) {
      return res.status(400).json({ error: 'compare_to parameter is required' });
    }

    const result = await this.executeQuery(async () => {
      // Get both scenarios
      const [scenario1, scenario2] = await Promise.all([
        this.db('scenarios').where('id', id).first(),
        this.db('scenarios').where('id', compare_to).first()
      ]);

      if (!scenario1 || !scenario2) {
        throw new Error('One or both scenarios not found');
      }

      // Helper function to get effective assignments for a scenario
      const getEffectiveAssignments = async (scenarioId: string, scenario: any) => {
        const effectiveMap = new Map();
        
        // For baseline scenarios, always start with base project_assignments
        const needsBaseAssignments = scenario.scenario_type === 'baseline';
        
        if (needsBaseAssignments) {
          // Start with base project_assignments
          const baseAssignments = await this.db('project_assignments as pa')
            .leftJoin('projects as p', 'pa.project_id', 'p.id')
            .leftJoin('people as pe', 'pa.person_id', 'pe.id')
            .leftJoin('roles as r', 'pa.role_id', 'r.id')
            .select(
              'pa.*',
              'p.name as project_name',
              'pe.name as person_name',
              'r.name as role_name'
            );

          // Add base assignments to the map
          baseAssignments.forEach((a: Record<string, any>) => {
            const key = `${a.project_id}:${a.person_id}:${a.role_id}:${a.phase_id || 'null'}`;
            effectiveMap.set(key, a);
          });
        }

        // Get scenario-specific assignments
        const scenarioAssignments = await this.db('scenario_project_assignments as spa')
          .leftJoin('projects as p', 'spa.project_id', 'p.id')
          .leftJoin('people as pe', 'spa.person_id', 'pe.id')
          .leftJoin('roles as r', 'spa.role_id', 'r.id')
          .where('spa.scenario_id', scenarioId)
          .select(
            'spa.*',
            'p.name as project_name',
            'pe.name as person_name',
            'r.name as role_name'
          );

        // Apply scenario-specific changes
        scenarioAssignments.forEach((assignment: Record<string, any>) => {
          const key = `${assignment.project_id}:${assignment.person_id}:${assignment.role_id}:${assignment.phase_id || 'null'}`;

          if (assignment.change_type === 'removed' || assignment.allocation_percentage === 0) {
            // Remove assignment
            effectiveMap.delete(key);
          } else if (assignment.change_type === 'added' || assignment.change_type === 'modified') {
            // Add or update assignment
            effectiveMap.set(key, assignment);
          }
        });

        return Array.from(effectiveMap.values());
      };

      // Get assignments for both scenarios
      const [assignments1, assignments2] = await Promise.all([
        getEffectiveAssignments(id, scenario1),
        getEffectiveAssignments(compare_to as string, scenario2)
      ]);

      // Create maps for easier comparison
      const assignments1Map = new Map();
      const assignments2Map = new Map();

      // Key format: project_id:person_id:role_id:phase_id
      assignments1.forEach(a => {
        const key = `${a.project_id}:${a.person_id}:${a.role_id}:${a.phase_id || 'null'}`;
        assignments1Map.set(key, a);
      });

      assignments2.forEach(a => {
        const key = `${a.project_id}:${a.person_id}:${a.role_id}:${a.phase_id || 'null'}`;
        assignments2Map.set(key, a);
      });

      // Find differences
      const assignmentDifferences = {
        added: [] as any[],
        modified: [] as any[],
        removed: [] as any[]
      };

      // Find added and modified assignments in scenario2
      assignments2Map.forEach((assignment2, key) => {
        const assignment1 = assignments1Map.get(key);
        
        if (!assignment1) {
          // Assignment exists in scenario2 but not in scenario1 (added)
          assignmentDifferences.added.push({
            ...assignment2,
            difference: 'Added',
            details: `${assignment2.person_name} assigned to ${assignment2.project_name} as ${assignment2.role_name} (${assignment2.allocation_percentage}%)`
          });
        } else if (assignment1.allocation_percentage !== assignment2.allocation_percentage ||
                   assignment1.start_date !== assignment2.start_date ||
                   assignment1.end_date !== assignment2.end_date) {
          // Assignment exists in both but with different values (modified)
          assignmentDifferences.modified.push({
            original: assignment1,
            modified: assignment2,
            changes: {
              allocation: {
                from: assignment1.allocation_percentage,
                to: assignment2.allocation_percentage
              },
              dates: {
                start: {
                  from: assignment1.start_date,
                  to: assignment2.start_date
                },
                end: {
                  from: assignment1.end_date,
                  to: assignment2.end_date
                }
              }
            },
            details: `${assignment2.person_name} on ${assignment2.project_name}: allocation ${assignment1.allocation_percentage}% → ${assignment2.allocation_percentage}%`
          });
        }
      });

      // Find removed assignments (in scenario1 but not in scenario2)
      assignments1Map.forEach((assignment1, key) => {
        if (!assignments2Map.has(key)) {
          assignmentDifferences.removed.push({
            ...assignment1,
            difference: 'Removed',
            details: `${assignment1.person_name} removed from ${assignment1.project_name} as ${assignment1.role_name}`
          });
        }
      });

      // Get projects for both scenarios
      const [projects1, projects2] = await Promise.all([
        this.db('scenario_projects').where('scenario_id', id),
        this.db('scenario_projects').where('scenario_id', compare_to)
      ]);

      // Get phase timelines for both scenarios
      const [phases1, phases2] = await Promise.all([
        this.db('scenario_project_phases').where('scenario_id', id),
        this.db('scenario_project_phases').where('scenario_id', compare_to)
      ]);

      // Calculate metrics
      const totalAllocation1 = assignments1.reduce((sum, a) => sum + (a.allocation_percentage || 0), 0);
      const totalAllocation2 = assignments2.reduce((sum, a) => sum + (a.allocation_percentage || 0), 0);
      
      const peopleCount1 = new Set(assignments1.map(a => a.person_id)).size;
      const peopleCount2 = new Set(assignments2.map(a => a.person_id)).size;
      
      const projectCount1 = new Set(assignments1.map(a => a.project_id)).size;
      const projectCount2 = new Set(assignments2.map(a => a.project_id)).size;

      const metrics = {
        utilization_impact: {
          total_allocation_change: totalAllocation2 - totalAllocation1,
          total_allocation_percent_change: totalAllocation1 > 0 
            ? ((totalAllocation2 - totalAllocation1) / totalAllocation1 * 100).toFixed(1)
            : 0,
          people_count_change: peopleCount2 - peopleCount1,
          scenario1_total: totalAllocation1,
          scenario2_total: totalAllocation2
        },
        capacity_impact: {
          assignments_added: assignmentDifferences.added.length,
          assignments_modified: assignmentDifferences.modified.length,
          assignments_removed: assignmentDifferences.removed.length,
          net_change: assignmentDifferences.added.length - assignmentDifferences.removed.length
        },
        timeline_impact: {
          projects_affected: projectCount2 - projectCount1,
          phases_modified: phases2.length - phases1.length
        }
      };

      return {
        scenario1,
        scenario2,
        differences: {
          assignments: assignmentDifferences,
          phases: {
            added: [],
            modified: [],
            removed: []
          },
          projects: {
            added: projects2.filter((p2: Record<string, any>) => !projects1.find((p1: Record<string, any>) => p1.project_id === p2.project_id)),
            modified: [],
            removed: projects1.filter((p1: Record<string, any>) => !projects2.find((p2: Record<string, any>) => p2.project_id === p1.project_id))
          }
        },
        metrics
      };
    }, res, 'Failed to compare scenarios');

    if (result) {
      res.json(result);
    }
  }

  // Merge scenario back to parent
  async merge(req: Request, res: Response) {
    const { id } = req.params;
    const { resolve_conflicts_as = 'manual' } = req.body;

    const result = await this.executeQuery(async () => {
      const scenario = await this.db('scenarios').where('id', id).first();
      if (!scenario) {
        throw new Error('Scenario not found');
      }

      if (!scenario.parent_scenario_id) {
        throw new Error('Cannot merge scenario without parent');
      }

      if (scenario.scenario_type === 'baseline') {
        throw new Error('Cannot merge baseline scenario');
      }

      // Audit log - merge initiation
      await auditModelChanges(req, {
        tableName: 'scenarios',
        recordId: id,
        action: 'UPDATE',
        oldValues: scenario,
        newValues: { ...scenario, status: 'merging' },
        comment: `Merge initiated from ${scenario.name} to parent scenario ${scenario.parent_scenario_id} with conflict resolution: ${resolve_conflicts_as}`
      });

      // Detect conflicts first
      const conflicts = await this.detectMergeConflicts(id, scenario.parent_scenario_id);

      if (conflicts.length > 0 && resolve_conflicts_as === 'manual') {
        // Save conflicts for manual resolution
        for (const conflict of conflicts) {
          const conflictId = randomUUID();
          await this.db('scenario_merge_conflicts').insert({
            id: conflictId,
            source_scenario_id: id,
            target_scenario_id: scenario.parent_scenario_id,
            conflict_type: conflict.type,
            entity_id: conflict.entity_id,
            source_data: JSON.stringify(conflict.source_data),
            target_data: JSON.stringify(conflict.target_data),
            resolution: 'pending',
            created_at: new Date()
          });

          // Audit log - conflict detection
          await auditModelChanges(req, {
            tableName: 'scenario_merge_conflicts',
            recordId: conflictId,
            action: 'INSERT',
            oldValues: null,
            newValues: {
              id: conflictId,
              source_scenario_id: id,
              target_scenario_id: scenario.parent_scenario_id,
              conflict_type: conflict.type,
              entity_id: conflict.entity_id
            },
            comment: `Merge conflict detected: ${conflict.type} for entity ${conflict.entity_id}`
          });
        }

        // Audit log - merge failed due to conflicts
        await auditModelChanges(req, {
          tableName: 'scenarios',
          recordId: id,
          action: 'UPDATE',
          oldValues: scenario,
          newValues: { ...scenario, status: 'conflict' },
          comment: `Merge failed: ${conflicts.length} conflicts require manual resolution`
        });

        return {
          success: false,
          message: 'Merge conflicts detected. Manual resolution required.',
          conflicts: conflicts.length
        };
      }

      // Perform the merge (this will handle individual table audit logging)
      await this.performMerge(id, scenario.parent_scenario_id, resolve_conflicts_as);

      // Mark scenario as merged
      const mergedScenario = { ...scenario, status: 'merged', updated_at: new Date() };
      await this.db('scenarios')
        .where('id', id)
        .update({ status: 'merged', updated_at: new Date() });

      // Audit log - merge completion
      await auditModelChanges(req, {
        tableName: 'scenarios',
        recordId: id,
        action: 'UPDATE',
        oldValues: scenario,
        newValues: mergedScenario,
        comment: `Merge completed successfully from ${scenario.name} to parent scenario ${scenario.parent_scenario_id}`
      });

      return {
        success: true,
        message: 'Scenario merged successfully'
      };
    }, res, 'Failed to merge scenario');

    if (result) {
      res.json(result);
    }
  }

  // Private helper methods
  private async branchFromParent(scenarioId: string, parentScenarioId: string) {
    // For baseline, copy current assignments
    if (parentScenarioId === 'baseline-0000-0000-0000-000000000000') {
      // Copy current project assignments to scenario. History may instead
      // live as baseline scenario rows (the e2e consolidated seed models all
      // assignments that way and leaves project_assignments empty) — union
      // both sources, deduped by identity, so branching from the baseline
      // never yields an empty world.
      const baseAssignments = await this.db('project_assignments')
        .select('*');
      const baselineScenarioRows = await this.db('scenario_project_assignments')
        .where('scenario_id', parentScenarioId)
        .whereNot('change_type', 'removed');

      const seenKeys = new Set<string>();
      // baseId: FK into project_assignments — only rows that actually come
      // from (or reference) that table may carry it; a dangling value
      // violates the FK (baseline scenario rows have no base counterpart).
      const copyAssignment = async (assignment: Record<string, any>, baseId: string | null) => {
        const key = `${assignment.project_id}:${assignment.person_id}:${assignment.role_id}:${assignment.phase_id || 'null'}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        await this.db('scenario_project_assignments').insert({
          id: randomUUID(),
          scenario_id: scenarioId,
          project_id: assignment.project_id,
          person_id: assignment.person_id,
          role_id: assignment.role_id,
          phase_id: assignment.phase_id,
          allocation_percentage: assignment.allocation_percentage,
          assignment_date_mode: assignment.assignment_date_mode,
          start_date: assignment.start_date,
          end_date: assignment.end_date,
          notes: assignment.notes,
          change_type: 'added',
          base_assignment_id: baseId,
          created_at: new Date(),
          updated_at: new Date()
        });
      };

      for (const assignment of baseAssignments) {
        await copyAssignment(assignment, assignment.id);
      }
      for (const assignment of baselineScenarioRows) {
        await copyAssignment(assignment, assignment.base_assignment_id || null);
      }

      // Copy current project phases
      const phases = await this.db('project_phases_timeline')
        .select('*');

      for (const phase of phases) {
        await this.db('scenario_project_phases').insert({
          id: randomUUID(),
          scenario_id: scenarioId,
          project_id: phase.project_id,
          phase_id: phase.phase_id,
          start_date: phase.start_date,
          end_date: phase.end_date,
          notes: phase.notes,
          change_type: 'added',
          base_phase_timeline_id: phase.id,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    } else {
      // Copy from parent scenario
      const parentAssignments = await this.db('scenario_project_assignments')
        .where('scenario_id', parentScenarioId);

      for (const assignment of parentAssignments) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, scenario_id, created_at, updated_at, ...assignmentData } = assignment;
        await this.db('scenario_project_assignments').insert({
          ...assignmentData,
          id: randomUUID(),
          scenario_id: scenarioId,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      const parentPhases = await this.db('scenario_project_phases')
        .where('scenario_id', parentScenarioId);

      for (const phase of parentPhases) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, scenario_id, created_at, updated_at, ...phaseData } = phase;
        await this.db('scenario_project_phases').insert({
          ...phaseData,
          id: randomUUID(),
          scenario_id: scenarioId,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    }
  }

  private async detectMergeConflicts(sourceScenarioId: string, targetScenarioId: string) {
    const conflicts = [];

    // Get all changes from source scenario
    const sourceAssignments = await this.db('scenario_project_assignments')
      .where('scenario_id', sourceScenarioId);
    
    const sourcePhases = await this.db('scenario_project_phases')
      .where('scenario_id', sourceScenarioId);
    
    const sourceProjects = await this.db('scenario_projects')
      .where('scenario_id', sourceScenarioId);

    // Check for assignment conflicts
    for (const sourceAssignment of sourceAssignments) {
      // Check if target scenario has a conflicting assignment
      const targetAssignment = await this.db('scenario_project_assignments')
        .where('scenario_id', targetScenarioId)
        .where('project_id', sourceAssignment.project_id)
        .where('person_id', sourceAssignment.person_id)
        .where('role_id', sourceAssignment.role_id)
        .where('phase_id', sourceAssignment.phase_id || null)
        .first();

      if (targetAssignment) {
        // Check if assignments are different
        const fieldsToCompare = ['allocation_percentage', 'assignment_date_mode', 'start_date', 'end_date'];
        const hasConflict = fieldsToCompare.some(field => 
          sourceAssignment[field] !== targetAssignment[field]
        );

        if (hasConflict) {
          conflicts.push({
            type: 'assignment',
            entity_id: `${sourceAssignment.project_id}-${sourceAssignment.person_id}-${sourceAssignment.role_id}`,
            source_data: sourceAssignment,
            target_data: targetAssignment
          });
        }
      }
    }

    // Check for phase timeline conflicts
    for (const sourcePhase of sourcePhases) {
      const targetPhase = await this.db('scenario_project_phases')
        .where('scenario_id', targetScenarioId)
        .where('project_id', sourcePhase.project_id)
        .where('phase_id', sourcePhase.phase_id)
        .first();

      if (targetPhase) {
        // Check if phase timelines are different
        const hasConflict = sourcePhase.start_date !== targetPhase.start_date ||
                           sourcePhase.end_date !== targetPhase.end_date;

        if (hasConflict) {
          conflicts.push({
            type: 'phase_timeline',
            entity_id: `${sourcePhase.project_id}-${sourcePhase.phase_id}`,
            source_data: sourcePhase,
            target_data: targetPhase
          });
        }
      }
    }

    // Check for project detail conflicts
    for (const sourceProject of sourceProjects) {
      const targetProject = await this.db('scenario_projects')
        .where('scenario_id', targetScenarioId)
        .where('project_id', sourceProject.project_id)
        .first();

      if (targetProject) {
        // Check if project details are different
        const fieldsToCompare = ['name', 'priority', 'aspiration_start', 'aspiration_finish'];
        const hasConflict = fieldsToCompare.some(field => 
          sourceProject[field] !== targetProject[field]
        );

        if (hasConflict) {
          conflicts.push({
            type: 'project_details',
            entity_id: sourceProject.project_id,
            source_data: sourceProject,
            target_data: targetProject
          });
        }
      }
    }

    return conflicts;
  }

  private async performMerge(sourceScenarioId: string, targetScenarioId: string, _conflictResolution: string = 'use_source') {
    // Start a transaction to ensure atomicity
    await this.db.transaction(async (trx: Knex.Transaction) => {
      // Get all conflicts that need resolution
      const conflicts = await trx('scenario_merge_conflicts')
        .where('source_scenario_id', sourceScenarioId)
        .where('target_scenario_id', targetScenarioId)
        .where('resolution', '!=', 'pending');

      // Apply resolved conflicts first
      for (const conflict of conflicts) {
        const resolvedData = conflict.resolved_data ? 
          JSON.parse(conflict.resolved_data) : 
          (conflict.resolution === 'use_source' ? 
            JSON.parse(conflict.source_data) : 
            JSON.parse(conflict.target_data));

        if (conflict.conflict_type === 'assignment') {
          await this.mergeAssignment(trx, targetScenarioId, resolvedData);
        } else if (conflict.conflict_type === 'phase_timeline') {
          await this.mergePhaseTimeline(trx, targetScenarioId, resolvedData);
        } else if (conflict.conflict_type === 'project_details') {
          await this.mergeProjectDetails(trx, targetScenarioId, resolvedData);
        }
      }

      // Apply non-conflicting changes
      await this.mergeNonConflictingChanges(trx, sourceScenarioId, targetScenarioId);

      // Clean up resolved conflicts
      await trx('scenario_merge_conflicts')
        .where('source_scenario_id', sourceScenarioId)
        .where('target_scenario_id', targetScenarioId)
        .del();
    });
  }

  private async mergeAssignment(trx: any, targetScenarioId: string, assignmentData: any) {
    const existingAssignment = await trx('scenario_project_assignments')
      .where('scenario_id', targetScenarioId)
      .where('project_id', assignmentData.project_id)
      .where('person_id', assignmentData.person_id)
      .where('role_id', assignmentData.role_id)
      .where('phase_id', assignmentData.phase_id || null)
      .first();

    if (existingAssignment) {
      // Update existing assignment
      await trx('scenario_project_assignments')
        .where('id', existingAssignment.id)
        .update({
          allocation_percentage: assignmentData.allocation_percentage,
          assignment_date_mode: assignmentData.assignment_date_mode,
          start_date: assignmentData.start_date,
          end_date: assignmentData.end_date,
          change_type: 'modified',
          updated_at: new Date()
        });
    } else {
      // Create new assignment
      await trx('scenario_project_assignments').insert({
        id: randomUUID(),
        scenario_id: targetScenarioId,
        project_id: assignmentData.project_id,
        person_id: assignmentData.person_id,
        role_id: assignmentData.role_id,
        phase_id: assignmentData.phase_id,
        allocation_percentage: assignmentData.allocation_percentage,
        assignment_date_mode: assignmentData.assignment_date_mode,
        start_date: assignmentData.start_date,
        end_date: assignmentData.end_date,
        change_type: 'added',
        base_assignment_id: assignmentData.base_assignment_id,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  private async mergePhaseTimeline(trx: any, targetScenarioId: string, phaseData: any) {
    const existingPhase = await trx('scenario_project_phases')
      .where('scenario_id', targetScenarioId)
      .where('project_id', phaseData.project_id)
      .where('phase_id', phaseData.phase_id)
      .first();

    if (existingPhase) {
      // Update existing phase
      await trx('scenario_project_phases')
        .where('id', existingPhase.id)
        .update({
          start_date: phaseData.start_date,
          end_date: phaseData.end_date,
          notes: phaseData.notes,
          change_type: 'modified',
          updated_at: new Date()
        });
    } else {
      // Create new phase
      await trx('scenario_project_phases').insert({
        id: randomUUID(),
        scenario_id: targetScenarioId,
        project_id: phaseData.project_id,
        phase_id: phaseData.phase_id,
        start_date: phaseData.start_date,
        end_date: phaseData.end_date,
        notes: phaseData.notes,
        change_type: 'added',
        base_phase_timeline_id: phaseData.base_phase_timeline_id,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  private async mergeProjectDetails(trx: any, targetScenarioId: string, projectData: any) {
    const existingProject = await trx('scenario_projects')
      .where('scenario_id', targetScenarioId)
      .where('project_id', projectData.project_id)
      .first();

    if (existingProject) {
      // Update existing project
      await trx('scenario_projects')
        .where('id', existingProject.id)
        .update({
          name: projectData.name,
          priority: projectData.priority,
          aspiration_start: projectData.aspiration_start,
          aspiration_finish: projectData.aspiration_finish,
          notes: projectData.notes,
          change_type: 'modified',
          updated_at: new Date()
        });
    } else {
      // Create new project modification
      await trx('scenario_projects').insert({
        id: randomUUID(),
        scenario_id: targetScenarioId,
        project_id: projectData.project_id,
        name: projectData.name,
        priority: projectData.priority,
        aspiration_start: projectData.aspiration_start,
        aspiration_finish: projectData.aspiration_finish,
        notes: projectData.notes,
        change_type: 'added',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  private async mergeNonConflictingChanges(trx: any, sourceScenarioId: string, targetScenarioId: string) {
    // Get all source assignments that don't have conflicts
    const sourceAssignments = await trx('scenario_project_assignments')
      .where('scenario_id', sourceScenarioId);

    for (const sourceAssignment of sourceAssignments) {
      const targetAssignment = await trx('scenario_project_assignments')
        .where('scenario_id', targetScenarioId)
        .where('project_id', sourceAssignment.project_id)
        .where('person_id', sourceAssignment.person_id)
        .where('role_id', sourceAssignment.role_id)
        .where('phase_id', sourceAssignment.phase_id || null)
        .first();

      if (!targetAssignment) {
        // No conflict, safe to add
        await this.mergeAssignment(trx, targetScenarioId, sourceAssignment);
      }
    }

    // Similar logic for phases and projects
    const sourcePhases = await trx('scenario_project_phases')
      .where('scenario_id', sourceScenarioId);

    for (const sourcePhase of sourcePhases) {
      const targetPhase = await trx('scenario_project_phases')
        .where('scenario_id', targetScenarioId)
        .where('project_id', sourcePhase.project_id)
        .where('phase_id', sourcePhase.phase_id)
        .first();

      if (!targetPhase) {
        await this.mergePhaseTimeline(trx, targetScenarioId, sourcePhase);
      }
    }

    const sourceProjects = await trx('scenario_projects')
      .where('scenario_id', sourceScenarioId);

    for (const sourceProject of sourceProjects) {
      const targetProject = await trx('scenario_projects')
        .where('scenario_id', targetScenarioId)
        .where('project_id', sourceProject.project_id)
        .first();

      if (!targetProject) {
        await this.mergeProjectDetails(trx, targetScenarioId, sourceProject);
      }
    }
  }
}