import type { Knex } from 'knex';
import { PhaseTemplateValidationService, type PhaseUpdateRequest } from './PhaseTemplateValidationService.js';
import { toIsoDateString } from '../utils/isoDate.js';

export interface CustomPhaseData {
  name: string;
  description?: string;
  durationDays?: number;
  startDate?: Date;
  endDate?: Date;
  insertIndex?: number;
  metadata?: Record<string, any>;
}

export interface PhaseUpdateData {
  name?: string;
  description?: string;
  durationDays?: number;
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
}

export interface PhaseManagementResult {
  success: boolean;
  phaseId?: string;
  message: string;
  warnings?: string[];
  affectedPhases?: string[];
}

export class CustomPhaseManagementService {
  private validationService: PhaseTemplateValidationService;

  constructor(private db: Knex) {
    this.validationService = new PhaseTemplateValidationService(db);
  }

  /**
   * Adds a custom phase to a project with proper validation and timeline adjustment
   */
  async addCustomPhase(projectId: string, phaseData: CustomPhaseData): Promise<PhaseManagementResult> {
    try {
      // First validate that the custom phase can be added
      const validation = await this.validationService.validateCustomPhaseAddition(
        projectId, 
        phaseData.name, 
        phaseData.insertIndex
      );

      if (!validation.isValid) {
        return {
          success: false,
          message: `Cannot add custom phase: ${validation.violations.map(v => v.message).join(', ')}`,
          warnings: validation.warnings
        };
      }

      // Create a new project phase if it doesn't exist
      const phaseId = await this.findOrCreatePhase(phaseData.name, phaseData.description);

      // Get current project timeline for insertion calculation
      const currentTimeline = await this.db('project_phases_timeline')
        .leftJoin('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name'
        )
        .where('project_phases_timeline.project_id', projectId)
        .orderBy('project_phases_timeline.start_date');

      // Calculate insertion position and adjust timeline
      const { startDate, endDate, affectedPhases } = await this.calculateCustomPhasePosition(
        currentTimeline,
        phaseData,
        projectId
      );

      // Create the custom phase timeline entry
      const customPhaseEntry = {
        id: `phase-timeline-${projectId}-${phaseId}-${Date.now()}`,
        project_id: projectId,
        phase_id: phaseId,
        // ISO date strings — canonical column format (epoch-ms breaks
        // downstream string comparisons, e.g. dashboard stats)
        start_date: toIsoDateString(startDate),
        end_date: toIsoDateString(endDate),
        // Custom phase tracking fields
        phase_source: 'custom',
        template_phase_id: null,
        is_deletable: true,
        original_duration_days: null,
        template_min_duration_days: null,
        template_max_duration_days: null,
        is_duration_customized: false,
        is_name_customized: false,
        template_compliance_data: JSON.stringify({
          is_custom: true,
          added_at: new Date().toISOString(),
          metadata: phaseData.metadata || {}
        }),
        created_at: new Date(),
        updated_at: new Date()
      };

      // Use transaction to ensure consistency
      await this.db.transaction(async (trx: any) => {
        // Insert the custom phase
        await trx('project_phases_timeline').insert(customPhaseEntry);

        // Update affected phases if timeline was adjusted
        for (const update of affectedPhases) {
          await trx('project_phases_timeline')
            .where('id', update.id)
            .update({
              start_date: toIsoDateString(new Date(update.start_date)),
              end_date: toIsoDateString(new Date(update.end_date)),
              updated_at: new Date()
            });
        }
      });

      return {
        success: true,
        phaseId: customPhaseEntry.id,
        message: `Custom phase "${phaseData.name}" added successfully`,
        warnings: validation.warnings,
        affectedPhases: affectedPhases.map(p => p.id)
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to add custom phase: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Updates a project phase while respecting template constraints
   */
  async updatePhase(projectId: string, phaseTimelineId: string, updateData: PhaseUpdateData): Promise<PhaseManagementResult> {
    try {
      // Get current phase data
      const currentPhase = await this.db('project_phases_timeline')
        .leftJoin('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name'
        )
        .where('project_phases_timeline.id', phaseTimelineId)
        .where('project_phases_timeline.project_id', projectId)
        .first();

      if (!currentPhase) {
        return {
          success: false,
          message: `Phase ${phaseTimelineId} not found in project ${projectId}`
        };
      }

      // Create validation request
      const validationRequest: PhaseUpdateRequest = {
        phaseId: currentPhase.phase_id,
        newDurationDays: updateData.durationDays,
        newStartDate: updateData.startDate?.getTime(),
        newEndDate: updateData.endDate?.getTime(),
        newName: updateData.name
      };

      // Validate the update
      const validation = await this.validationService.validatePhaseUpdates(projectId, [validationRequest]);

      if (!validation.isValid) {
        return {
          success: false,
          message: `Cannot update phase: ${validation.violations.map(v => v.message).join(', ')}`,
          warnings: validation.warnings
        };
      }

      // Prepare update fields
      const updates: Record<string, any> = {
        updated_at: new Date()
      };

      // Handle duration updates
      if (updateData.durationDays !== undefined) {
        const newEndDate = updateData.startDate || new Date(currentPhase.start_date);
        newEndDate.setTime(newEndDate.getTime() + (updateData.durationDays * 24 * 60 * 60 * 1000));

        updates.end_date = toIsoDateString(newEndDate);

        if (currentPhase.phase_source === 'template') {
          updates.is_duration_customized = true;
        }
      }

      // Handle date updates
      if (updateData.startDate) {
        updates.start_date = toIsoDateString(updateData.startDate);
      }
      if (updateData.endDate) {
        updates.end_date = toIsoDateString(updateData.endDate);
      }

      // Handle name updates (requires updating the phase itself)
      if (updateData.name && updateData.name !== currentPhase.phase_name) {
        if (currentPhase.phase_source === 'template') {
          updates.is_name_customized = true;
        }
        
        // For custom phases, we can update the phase name directly
        // For template phases, we should consider creating a project-specific override
        if (currentPhase.phase_source === 'custom') {
          await this.db('project_phases')
            .where('id', currentPhase.phase_id)
            .update({ name: updateData.name, updated_at: new Date() });
        }
      }

      // Update metadata
      if (updateData.metadata) {
        const currentCompliance = currentPhase.template_compliance_data ? 
          JSON.parse(currentPhase.template_compliance_data) : {};
        
        updates.template_compliance_data = JSON.stringify({
          ...currentCompliance,
          metadata: { ...currentCompliance.metadata, ...updateData.metadata },
          last_updated: new Date().toISOString()
        });
      }

      // Apply the update
      await this.db('project_phases_timeline')
        .where('id', phaseTimelineId)
        .update(updates);

      return {
        success: true,
        phaseId: phaseTimelineId,
        message: `Phase "${currentPhase.phase_name}" updated successfully`,
        warnings: validation.warnings
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to update phase: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Deletes a project phase if allowed by template constraints
   */
  async deletePhase(projectId: string, phaseTimelineId: string): Promise<PhaseManagementResult> {
    try {
      // Get current phase data
      const currentPhase = await this.db('project_phases_timeline')
        .leftJoin('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'project_phases.name as phase_name'
        )
        .where('project_phases_timeline.id', phaseTimelineId)
        .where('project_phases_timeline.project_id', projectId)
        .first();

      if (!currentPhase) {
        return {
          success: false,
          message: `Phase ${phaseTimelineId} not found in project ${projectId}`
        };
      }

      // Create validation request for deletion
      const validationRequest: PhaseUpdateRequest = {
        phaseId: currentPhase.phase_id,
        toDelete: true
      };

      // Validate the deletion
      const validation = await this.validationService.validatePhaseUpdates(projectId, [validationRequest]);

      if (!validation.isValid) {
        return {
          success: false,
          message: `Cannot delete phase: ${validation.violations.map(v => v.message).join(', ')}`,
          warnings: validation.warnings
        };
      }

      // Check if this is the only instance of a custom phase
      const otherInstances = await this.db('project_phases_timeline')
        .where('phase_id', currentPhase.phase_id)
        .where('id', '!=', phaseTimelineId)
        .count('* as count')
        .first();

      const isLastInstance = (otherInstances?.count as number) === 0;

      await this.db.transaction(async (trx: any) => {
        // Delete the timeline entry
        await trx('project_phases_timeline')
          .where('id', phaseTimelineId)
          .del();

        // If this was a custom phase and the last instance, consider deleting the phase itself
        if (currentPhase.phase_source === 'custom' && isLastInstance) {
          // Check if it's safe to delete the phase (no other references)
          const hasAssignments = await trx('assignments')
            .where('phase_id', currentPhase.phase_id)
            .count('* as count')
            .first();

          if ((hasAssignments?.count as number) === 0) {
            await trx('project_phases')
              .where('id', currentPhase.phase_id)
              .del();
          }
        }
      });

      return {
        success: true,
        message: `Phase "${currentPhase.phase_name}" deleted successfully`,
        warnings: validation.warnings
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to delete phase: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Finds an existing phase by name or creates a new one
   */
  private async findOrCreatePhase(name: string, description?: string): Promise<string> {
    // Check if phase already exists
    const existingPhase = await this.db('project_phases')
      .select('id')
      .where('name', name)
      .first();

    if (existingPhase) {
      return existingPhase.id;
    }

    // Create new phase
    const phaseId = `phase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await this.db('project_phases').insert({
      id: phaseId,
      name,
      description: description || `Custom phase: ${name}`,
      order_index: 999, // High value for custom phases
      created_at: new Date(),
      updated_at: new Date()
    });

    return phaseId;
  }

  /**
   * Calculates the position and timing for a new custom phase
   */
  private async calculateCustomPhasePosition(
    currentTimeline: any[],
    phaseData: CustomPhaseData,
    projectId: string
  ): Promise<{
    startDate: Date;
    endDate: Date;
    affectedPhases: Array<{ id: string; start_date: number; end_date: number }>;
  }> {
    const affectedPhases: Array<{ id: string; start_date: number; end_date: number }> = [];
    const phaseDuration = phaseData.durationDays || 30; // Default 30 days

    // If specific dates are provided, use them
    if (phaseData.startDate && phaseData.endDate) {
      return {
        startDate: phaseData.startDate,
        endDate: phaseData.endDate,
        affectedPhases
      };
    }

    // If no timeline exists, start from project start
    if (currentTimeline.length === 0) {
      const project = await this.db('projects')
        .select('aspiration_start')
        .where('id', projectId)
        .first();
      
      const startDate = project?.aspiration_start ? new Date(project.aspiration_start) : new Date();
      const endDate = new Date(startDate.getTime() + (phaseDuration * 24 * 60 * 60 * 1000));
      
      return { startDate, endDate, affectedPhases };
    }

    // Insert at specified index or at the end
    const insertIndex = phaseData.insertIndex !== undefined ? phaseData.insertIndex : currentTimeline.length;
    
    if (insertIndex >= currentTimeline.length) {
      // Add at the end
      const lastPhase = currentTimeline[currentTimeline.length - 1];
      const startDate = new Date(lastPhase.end_date);
      const endDate = new Date(startDate.getTime() + (phaseDuration * 24 * 60 * 60 * 1000));
      
      return { startDate, endDate, affectedPhases };
    } else {
      // Insert in the middle - need to shift subsequent phases
      const insertAfterPhase = insertIndex > 0 ? currentTimeline[insertIndex - 1] : null;
      const insertBeforePhase = currentTimeline[insertIndex];
      
      const startDate = insertAfterPhase ? new Date(insertAfterPhase.end_date) : new Date(insertBeforePhase.start_date);
      const endDate = new Date(startDate.getTime() + (phaseDuration * 24 * 60 * 60 * 1000));
      
      // Shift all subsequent phases
      let currentEndDate = endDate.getTime();
      for (let i = insertIndex; i < currentTimeline.length; i++) {
        const phase = currentTimeline[i];
        // dates may be stored as ISO strings — parse before arithmetic
        const phaseDurationMs =
          new Date(phase.end_date).getTime() - new Date(phase.start_date).getTime();

        affectedPhases.push({
          id: phase.id,
          start_date: currentEndDate,
          end_date: currentEndDate + phaseDurationMs
        });

        currentEndDate += phaseDurationMs;
      }
      
      return { startDate, endDate, affectedPhases };
    }
  }
}