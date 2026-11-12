import { Knex } from 'knex';
import { getAuditedDb } from '../database/index.js';
import { DependencyType } from '../types/project-phases.js';
import { AssignmentRecalculationService, type AssignmentDateChange } from './AssignmentRecalculationService.js';

export interface CascadeCalculation {
  phase_timeline_id: string;
  phase_name: string;
  current_start_date: string;
  current_end_date: string;
  new_start_date: string;
  new_end_date: string;
  dependency_type: DependencyType;
  lag_days: number;
  affects_count: number; // How many phases this change affects
}

export interface CascadeResult {
  affected_phases: CascadeCalculation[];
  cascade_count: number;
  circular_dependencies: string[]; // Any circular dependency issues found
  validation_errors?: string[]; // Validation errors that prevent the update
}

export interface PhaseTimelineChange {
  timeline_id: string;
  phase_id: string;
  old_start_date: string | null;
  old_end_date: string | null;
  new_start_date: string;
  new_end_date: string;
}

export interface CascadeApplyResult {
  updated_phases: number;
  phase_changes: PhaseTimelineChange[];
  assignment_changes: AssignmentDateChange[];
}


export class ProjectPhaseCascadeService {
  private db: any;

  constructor(database?: Knex) {
    // Use provided database or default to audited database
    this.db = database || getAuditedDb();
  }

  /**
   * Format a Date object to YYYY-MM-DD string in a timezone-safe way
   * This ensures business dates remain consistent regardless of server timezone
   */
  private formatDateSafe(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date object');
    }

    // Use UTC date components to ensure consistency
    // This prevents timezone-related date shifts
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Parse a YYYY-MM-DD date string as a timezone-independent business date
   */
  private parseDateSafe(dateString: string): Date {
    if (!dateString) throw new Error('Date string is required');

    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) throw new Error('Invalid date format, expected YYYY-MM-DD');

    // Create date in UTC to ensure timezone-independent business dates
    return new Date(Date.UTC(year, month - 1, day));
  }

  /**
   * Add days to a date string in a timezone-safe way
   */
  private addDaysSafe(dateString: string, days: number): string {
    const date = this.parseDateSafe(dateString);
    date.setDate(date.getDate() + days);
    return this.formatDateSafe(date);
  }

  /**
   * Calculate cascade effects for a phase date change
   */
  async calculateCascade(
    projectId: string,
    changedPhaseId: string,
    newStartDate: Date,
    newEndDate: Date,
    trx?: Knex.Transaction
  ): Promise<CascadeResult> {
    // Use transaction if provided, otherwise use default db
    const db = trx || this.db;

    // Build dependency graph for the project
    const dependencyGraph = await this.buildDependencyGraph(projectId, db);

    // Check for circular dependencies first (before validation)
    // This allows us to detect cycles even if dates are invalid
    const circularDependencies = this.detectCircularDependencies(dependencyGraph);

    // Validate that the change itself doesn't violate dependencies
    const validationErrors = await this.validatePhaseChange(
      dependencyGraph,
      changedPhaseId,
      newStartDate,
      newEndDate
    );

    if (validationErrors.length > 0) {
      return {
        affected_phases: [],
        cascade_count: 0,
        circular_dependencies: circularDependencies,
        validation_errors: validationErrors
      };
    }

    // Find all phases affected by this change
    const affectedPhases = await this.findAffectedPhases(
      dependencyGraph,
      changedPhaseId,
      newStartDate,
      newEndDate
    );

    return {
      affected_phases: affectedPhases,
      cascade_count: affectedPhases.length,
      circular_dependencies: circularDependencies,
      validation_errors: []
    };
  }

  /**
   * Apply cascade changes to the database.
   *
   * Phase timeline writes and the phase-mode assignment refresh happen in the
   * same transaction. Callers that already own a transaction pass `trx` so the
   * refresh is atomic with their own writes (single-connection sqlite pool:
   * never open a nested transaction). Returns the applied timeline changes and
   * the assignment rows whose computed dates were refreshed, for audit.
   */
  async applyCascade(
    projectId: string,
    cascadeResult: CascadeResult,
    opts: { trx?: Knex.Transaction } = {}
  ): Promise<CascadeApplyResult> {
    const run = async (trx: any): Promise<CascadeApplyResult> => {
      const changes = cascadeResult.affected_phases ?? [];
      if (!changes.length) {
        return { updated_phases: 0, phase_changes: [], assignment_changes: [] };
      }

      const timelineIds = changes.map(change => change.phase_timeline_id);
      const before = await trx('project_phases_timeline')
        .whereIn('id', timelineIds)
        .select('id', 'phase_id', 'start_date', 'end_date');
      const beforeById = new Map<string, any>(
        (before as any[]).map(row => [String(row.id), row])
      );

      for (const change of changes) {
        await trx('project_phases_timeline')
          .where('id', change.phase_timeline_id)
          .update({
            start_date: change.new_start_date,
            end_date: change.new_end_date,
            updated_at: new Date().toISOString()
          });
      }

      const phaseIds = [
        ...new Set(
          (before as any[])
            .map(row => (row.phase_id === null || row.phase_id === undefined ? null : String(row.phase_id)))
            .filter((phaseId): phaseId is string => phaseId !== null)
        )
      ];
      const assignmentChanges = phaseIds.length
        ? await new AssignmentRecalculationService(this.db).recalculateForPhaseTimelineChange(
            projectId,
            phaseIds,
            { trx }
          )
        : [];

      const phaseChanges: PhaseTimelineChange[] = changes.map(change => {
        const old = beforeById.get(String(change.phase_timeline_id));
        return {
          timeline_id: String(change.phase_timeline_id),
          phase_id: old?.phase_id === null || old?.phase_id === undefined ? '' : String(old.phase_id),
          old_start_date: old?.start_date ?? null,
          old_end_date: old?.end_date ?? null,
          new_start_date: change.new_start_date,
          new_end_date: change.new_end_date
        };
      });

      return {
        updated_phases: changes.length,
        phase_changes: phaseChanges,
        assignment_changes: assignmentChanges
      };
    };

    return opts.trx ? run(opts.trx) : this.db.transaction(run);
  }

  /**
   * Update project phases and handle cascading effects.
   * Phase timeline writes and phase-mode assignment refreshes share one
   * transaction, so a failed refresh rolls the timeline writes back too.
   */
  async updateProjectPhases(projectId: string, phaseUpdates: Array<{
    phase_id: string;
    start_date: Date;
    end_date: Date;
  }>, opts: { trx?: Knex.Transaction } = {}): Promise<CascadeApplyResult> {
    const run = async (trx: any): Promise<CascadeApplyResult> => {
      const touchedPhaseIds = new Set<string>();
      let assignmentChanges: AssignmentDateChange[] = [];

      for (const update of phaseUpdates) {
        // Get the timeline ID for this phase
        const timeline = await trx('project_phases_timeline')
          .where('project_id', projectId)
          .where('phase_id', update.phase_id)
          .first();

        if (!timeline) {
          throw new Error(`Timeline not found for phase ${update.phase_id} in project ${projectId}`);
        }

        // Update the phase timeline
        await trx('project_phases_timeline')
          .where('id', timeline.id)
          .update({
            start_date: this.formatDateSafe(update.start_date),
            end_date: this.formatDateSafe(update.end_date),
            updated_at: new Date().toISOString()
          });
        touchedPhaseIds.add(String(update.phase_id));

        // Calculate and apply cascading effects using timeline ID
        // Pass the transaction so queries don't deadlock
        const cascadeResult = await this.calculateCascade(
          projectId,
          timeline.id,  // Use timeline ID, not phase ID
          update.start_date,
          update.end_date,
          trx  // Pass transaction to avoid deadlock
        );

        if (cascadeResult.validation_errors && cascadeResult.validation_errors.length > 0) {
          throw new Error(`Phase update validation failed: ${cascadeResult.validation_errors.join(', ')}`);
        }

        if (cascadeResult.affected_phases.length > 0) {
          const applied = await this.applyCascade(projectId, cascadeResult, { trx });
          applied.phase_changes.forEach(change => {
            if (change.phase_id) touchedPhaseIds.add(change.phase_id);
          });
          assignmentChanges = assignmentChanges.concat(applied.assignment_changes);
        }
      }

      if (touchedPhaseIds.size > 0) {
        const refreshed = await new AssignmentRecalculationService(this.db).recalculateForPhaseTimelineChange(
          projectId,
          [...touchedPhaseIds],
          { trx }
        );
        assignmentChanges = assignmentChanges.concat(refreshed);
      }

      return {
        updated_phases: touchedPhaseIds.size,
        phase_changes: [],
        assignment_changes: assignmentChanges
      };
    };

    return opts.trx ? run(opts.trx) : this.db.transaction(run);
  }

  /**
   * Build a dependency graph for the project
   */
  private async buildDependencyGraph(projectId: string, db?: any): Promise<Map<string, DependencyNode>> {
    // Use provided db or fall back to this.db
    const database = db || this.db;

    // Get all phases for the project
    const phases = await database('project_phases_timeline as ppt')
      .join('project_phases as pp', 'ppt.phase_id', 'pp.id')
      .where('ppt.project_id', projectId)
      .select(
        'ppt.id',
        'ppt.start_date',
        'ppt.end_date',
        'pp.name as phase_name'
      );

    // Get all dependencies for the project
    const dependencies = await database('project_phase_dependencies')
      .where('project_id', projectId)
      .select('*');

    // Build the graph
    const graph = new Map<string, DependencyNode>();

    // Initialize nodes
    phases.forEach((phase: { id: string; phase_name: string; start_date: string; end_date: string }) => {
      graph.set(phase.id, {
        id: phase.id,
        phase_name: phase.phase_name,
        start_date: phase.start_date,
        end_date: phase.end_date,
        dependencies: [], // Phases this one depends on
        dependents: []    // Phases that depend on this one
      });
    });

    // Add dependency relationships
    dependencies.forEach((dep: { predecessor_phase_timeline_id: string; successor_phase_timeline_id: string; dependency_type: DependencyType; lag_days?: number }) => {
      const predecessor = graph.get(dep.predecessor_phase_timeline_id);
      const successor = graph.get(dep.successor_phase_timeline_id);

      if (predecessor && successor) {
        // Add dependency info
        successor.dependencies.push({
          predecessor_id: dep.predecessor_phase_timeline_id,
          dependency_type: dep.dependency_type,
          lag_days: dep.lag_days || 0
        });

        predecessor.dependents.push({
          successor_id: dep.successor_phase_timeline_id,
          dependency_type: dep.dependency_type,
          lag_days: dep.lag_days || 0
        });
      }
    });

    return graph;
  }

  /**
   * Find all phases affected by a change to a specific phase
   */
  private async findAffectedPhases(
    graph: Map<string, DependencyNode>,
    changedPhaseId: string,
    newStartDate: Date,
    newEndDate: Date
  ): Promise<CascadeCalculation[]> {
    const affectedPhases: CascadeCalculation[] = [];
    const visited = new Set<string>();
    const queue = [{ phaseId: changedPhaseId, triggerStartDate: newStartDate, triggerEndDate: newEndDate }];

    while (queue.length > 0) {
      const { phaseId, triggerStartDate, triggerEndDate } = queue.shift()!;

      if (visited.has(phaseId)) continue;
      visited.add(phaseId);

      const phase = graph.get(phaseId);
      if (!phase) continue;

      // Process all dependents (phases that depend on this one)
      for (const dependent of phase.dependents) {
        const dependentPhase = graph.get(dependent.successor_id);
        if (!dependentPhase || visited.has(dependent.successor_id)) continue;

        // Calculate new dates based on dependency type
        const newDates = this.calculateDependentDates(
          triggerStartDate,
          triggerEndDate,
          dependentPhase,
          dependent.dependency_type,
          dependent.lag_days
        );

        // Only add if dates actually change (timezone-safe comparison)
        const currentStartStr = dependentPhase.start_date;
        const currentEndStr = dependentPhase.end_date;
        const newStartStr = this.formatDateSafe(newDates.start);
        const newEndStr = this.formatDateSafe(newDates.end);

        if (currentStartStr !== newStartStr || currentEndStr !== newEndStr) {
          
          affectedPhases.push({
            phase_timeline_id: dependent.successor_id,
            phase_name: dependentPhase.phase_name,
            current_start_date: dependentPhase.start_date,
            current_end_date: dependentPhase.end_date,
            new_start_date: this.formatDateSafe(newDates.start),
            new_end_date: this.formatDateSafe(newDates.end),
            dependency_type: dependent.dependency_type,
            lag_days: dependent.lag_days,
            affects_count: dependentPhase.dependents.length
          });

          // Add to queue to process its dependents
          queue.push({
            phaseId: dependent.successor_id,
            triggerStartDate: newDates.start,
            triggerEndDate: newDates.end
          });
        }
      }
    }

    return affectedPhases;
  }

  /**
   * Calculate new dates for a dependent phase based on dependency type
   */
  private calculateDependentDates(
    predecessorStartDate: Date,
    predecessorEndDate: Date,
    dependentPhase: DependencyNode,
    dependencyType: DependencyType,
    lagDays: number
  ): { start: Date; end: Date } {
    // Calculate duration in days (timezone-safe)
    const currentStartDate = this.parseDateSafe(dependentPhase.start_date);
    const currentEndDate = this.parseDateSafe(dependentPhase.end_date);
    const durationDays = Math.max(1, Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)));

    let newStart: Date;
    const predecessorEndStr = this.formatDateSafe(predecessorEndDate);

    switch (dependencyType) {
      case 'FS': {
        // Finish-to-Start: successor starts on or after predecessor finishes (allow same-day)
        const newStartStr = this.addDaysSafe(predecessorEndStr, lagDays);
        newStart = this.parseDateSafe(newStartStr);
        break;
      }
      
      case 'SS': {
        // Start-to-Start: successor starts when predecessor starts
        const predecessorStartStr = this.formatDateSafe(predecessorStartDate);
        const newStartStrSS = this.addDaysSafe(predecessorStartStr, lagDays);
        newStart = this.parseDateSafe(newStartStrSS);
        break;
      }
      
      case 'FF': { // Finish-to-Finish: successor finishes when predecessor finishes
        const newEndStrFF = this.addDaysSafe(predecessorEndStr, lagDays);
        const newEndFF = this.parseDateSafe(newEndStrFF);
        const newStartStrFF = this.addDaysSafe(newEndStrFF, -durationDays);
        newStart = this.parseDateSafe(newStartStrFF);
        return { start: newStart, end: newEndFF };
      }

      case 'SF': {
        // Start-to-Finish: successor finishes when predecessor starts
        const predecessorStartStrSF = this.formatDateSafe(predecessorStartDate);
        const newEndStrSF = this.addDaysSafe(predecessorStartStrSF, lagDays);
        const newEndSF = this.parseDateSafe(newEndStrSF);
        const newStartStrSF = this.addDaysSafe(newEndStrSF, -durationDays);
        newStart = this.parseDateSafe(newStartStrSF);
        return { start: newStart, end: newEndSF };
      }
      
      default:
        newStart = this.parseDateSafe(dependentPhase.start_date);
    }

    // Calculate end date based on duration
    const newEndStr = this.addDaysSafe(this.formatDateSafe(newStart), durationDays);
    const newEnd = this.parseDateSafe(newEndStr);

    return { start: newStart, end: newEnd };
  }

  /**
   * Validate that a phase change doesn't violate any dependencies
   */
  private async validatePhaseChange(
    graph: Map<string, DependencyNode>,
    phaseId: string,
    newStartDate: Date,
    newEndDate: Date
  ): Promise<string[]> {
    const errors: string[] = [];
    const phase = graph.get(phaseId);
    
    if (!phase) return errors;
    
    // Check incoming dependencies (phases this one depends on)
    for (const dep of phase.dependencies) {
      const predecessor = graph.get(dep.predecessor_id);
      if (!predecessor) continue;
      
      const predecessorEndDate = this.parseDateSafe(predecessor.end_date);
      const predecessorStartDate = this.parseDateSafe(predecessor.start_date);
      
      switch (dep.dependency_type) {
        case 'FS': // Finish-to-Start: this phase must start on or after predecessor finishes
          if (newStartDate < predecessorEndDate) {
            const lagDays = dep.lag_days || 0;
            const requiredStartDate = new Date(predecessorEndDate);
            requiredStartDate.setDate(requiredStartDate.getDate() + lagDays);
            
            errors.push(
              `Phase "${phase.phase_name}" cannot start before "${predecessor.phase_name}" finishes. ` +
              `Required start date: ${this.formatDateSafe(requiredStartDate)} or later.`
            );
          }
          break;
          
        case 'SS': // Start-to-Start: this phase must start on or after predecessor starts
          if (newStartDate < predecessorStartDate) {
            const lagDays = dep.lag_days || 0;
            const requiredStartDate = new Date(predecessorStartDate);
            requiredStartDate.setDate(requiredStartDate.getDate() + lagDays);
            
            errors.push(
              `Phase "${phase.phase_name}" cannot start before "${predecessor.phase_name}" starts. ` +
              `Required start date: ${this.formatDateSafe(requiredStartDate)} or later.`
            );
          }
          break;
          
        case 'FF': { // Finish-to-Finish: this phase must finish on or after predecessor finishes
          if (newEndDate < predecessorEndDate) {
            const lagDays = dep.lag_days || 0;
            const requiredEndDate = new Date(predecessorEndDate);
            requiredEndDate.setDate(requiredEndDate.getDate() + lagDays);

            errors.push(
              `Phase "${phase.phase_name}" cannot finish before "${predecessor.phase_name}" finishes. ` +
              `Required end date: ${this.formatDateSafe(requiredEndDate)} or later.`
            );
          }
          break;
        }

        case 'SF': { // Start-to-Finish: this phase must finish on or after predecessor starts
          if (newEndDate < predecessorStartDate) {
            const lagDays = dep.lag_days || 0;
            const requiredEndDate = new Date(predecessorStartDate);
            requiredEndDate.setDate(requiredEndDate.getDate() + lagDays);

            errors.push(
              `Phase "${phase.phase_name}" cannot finish before "${predecessor.phase_name}" starts. ` +
              `Required end date: ${this.formatDateSafe(requiredEndDate)} or later.`
            );
          }
          break;
        }
      }
    }
    
    // NOTE: We do NOT check outgoing dependencies (phases that depend on this one)
    // because those will be handled by the cascade logic. The cascade will update
    // successor phases to maintain the dependency relationships. Only incoming
    // dependencies need to be validated because we cannot change predecessor phases.
    
    return errors;
  }

  /**
   * Detect circular dependencies in the graph
   */
  private detectCircularDependencies(graph: Map<string, DependencyNode>): string[] {
    const circular: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        circular.push(`Circular dependency detected: ${path.join(' -> ')} -> ${nodeId}`);
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = graph.get(nodeId);
      if (node) {
        for (const dependent of node.dependents) {
          dfs(dependent.successor_id, [...path, nodeId]);
        }
      }

      recursionStack.delete(nodeId);
    };

    // Check all nodes
    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return circular;
  }
}

interface DependencyNode {
  id: string;
  phase_name: string;
  start_date: string;
  end_date: string;
  dependencies: Array<{
    predecessor_id: string;
    dependency_type: DependencyType;
    lag_days: number;
  }>;
  dependents: Array<{
    successor_id: string;
    dependency_type: DependencyType;
    lag_days: number;
  }>;
}