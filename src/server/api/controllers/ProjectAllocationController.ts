import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { randomUUID } from 'crypto';
import { matchResourceTemplates } from '../../services/projects/resourceTemplateMatch.js';


export class ProjectAllocationController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  // Get all effective allocations for a project (inherited + overridden)
  getProjectAllocations = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectId } = req.params;

      // Get project details to find project type
      const project = await this.db('projects').where('id', projectId).first();
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get effective allocations (project overrides + inherited from project type)
      const allocations = await this.getEffectiveAllocations(projectId);

      return res.json({
        success: true,
        data: {
          project: project,
          allocations: allocations,
          summary: {
            total_allocations: allocations.length,
            inherited_count: allocations.filter(a => a.is_inherited).length,
            overridden_count: allocations.filter(a => !a.is_inherited).length
          }
        }
      });
    }, res);
  };

  // Initialize project allocations from project type (called when project is created)
  initializeProjectAllocations = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectId } = req.params;

      // Get project details
      const project = await this.db('projects').where('id', projectId).first();
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get project type allocations——与选择弹窗的需求回落共用同一匹配规则
      // （后端评审 F5 裁决 A：sub_type 精确优先 + NULL 通配；此前只按
      // project_type_id，会把该类型下**所有** sub_type 的模板都复制成覆盖）
      const typeTemplates = await this.db('resource_templates')
        .where('project_type_id', project.project_type_id)
        .join('project_phases', 'resource_templates.phase_id', 'project_phases.id')
        .join('roles', 'resource_templates.role_id', 'roles.id')
        .select(
          'resource_templates.*',
          'project_phases.name as phase_name',
          'roles.name as role_name'
        );
      const projectTypeAllocations = matchResourceTemplates(typeTemplates as any[], {
        project_type_id: project.project_type_id ?? null,
        project_sub_type_id: project.project_sub_type_id ?? null,
      });

      // Create inherited allocations for this project
      const inheritedAllocations = projectTypeAllocations.map((template: Record<string, any>) => ({
        id: randomUUID(),
        project_id: projectId,
        phase_id: template.phase_id,
        role_id: template.role_id,
        allocation_percentage: template.allocation_percentage,
        is_inherited: true,
        template_id: template.id,
        notes: `Inherited from project type: ${template.phase_name} - ${template.role_name}`,
        created_at: new Date(),
        updated_at: new Date()
      }));

      // Insert all inherited allocations
      if (inheritedAllocations.length > 0) {
        await this.db('project_allocation_overrides').insert(inheritedAllocations);
      }

      return res.json({
        success: true,
        data: {
          created_count: inheritedAllocations.length,
          allocations: inheritedAllocations
        }
      });
    }, res);
  };

  // Override an allocation for a specific project
  overrideAllocation = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectId } = req.params;
      const { phase_id, role_id, allocation_percentage, notes } = req.body;

      // Check if project exists
      const project = await this.db('projects').where('id', projectId).first();
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Find the existing allocation (inherited or overridden)
      const existingAllocation = await this.db('project_allocation_overrides')
        .where({ project_id: projectId, phase_id, role_id })
        .first();

      if (existingAllocation) {
        // Update existing allocation
        const [updatedAllocation] = await this.db('project_allocation_overrides')
          .where('id', existingAllocation.id)
          .update({
            allocation_percentage,
            is_inherited: false, // Mark as overridden
            notes: notes || `Overridden on ${new Date().toISOString()}`,
            updated_at: new Date()
          })
          .returning('*');

        return res.json({
          success: true,
          data: updatedAllocation,
          message: 'Allocation overridden successfully'
        });
      } else {
        // Create new override allocation
        const newAllocation = {
          id: randomUUID(),
          project_id: projectId,
          phase_id,
          role_id,
          allocation_percentage,
          is_inherited: false,
          template_id: null,
          notes: notes || `Custom allocation created on ${new Date().toISOString()}`,
          created_at: new Date(),
          updated_at: new Date()
        };

        const [createdAllocation] = await this.db('project_allocation_overrides')
          .insert(newAllocation)
          .returning('*');

        return res.json({
          success: true,
          data: createdAllocation,
          message: 'New allocation created successfully'
        });
      }
    }, res);
  };

  // Reset an allocation back to inherited value
  resetToInherited = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectId, phaseId, roleId } = req.params;

      // Get project details
      const project = await this.db('projects').where('id', projectId).first();
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get the original template allocation
      const templateAllocation = await this.db('resource_templates')
        .where({
          project_type_id: project.project_type_id,
          phase_id: phaseId,
          role_id: roleId
        })
        .first();

      if (!templateAllocation) {
        return res.status(404).json({ error: 'No template allocation found to inherit from' });
      }

      // Update the project allocation to inherited values
      const [resetAllocation] = await this.db('project_allocation_overrides')
        .where({ project_id: projectId, phase_id: phaseId, role_id: roleId })
        .update({
          allocation_percentage: templateAllocation.allocation_percentage,
          is_inherited: true,
          template_id: templateAllocation.id,
          notes: `Reset to inherited value on ${new Date().toISOString()}`,
          updated_at: new Date()
        })
        .returning('*');

      return res.json({
        success: true,
        data: resetAllocation,
        message: 'Allocation reset to inherited value successfully'
      });
    }, res);
  };

  // Delete a project allocation (removes override, falls back to inherited)
  deleteAllocation = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectId, phaseId, roleId } = req.params;

      const deleted = await this.db('project_allocation_overrides')
        .where({ project_id: projectId, phase_id: phaseId, role_id: roleId })
        .delete();

      if (deleted === 0) {
        return res.status(404).json({ error: 'Allocation not found' });
      }

      return res.json({
        success: true,
        message: 'Allocation deleted successfully'
      });
    }, res);
  };

  // Helper method to get effective allocations for a project
  private async getEffectiveAllocations(projectId: string): Promise<any[]> {
    const project = await this.db('projects').where('id', projectId).first();
    if (!project) {
      throw new Error('Project not found');
    }

    // Get all project allocations (inherited + overridden)
    const projectAllocations = await this.db('project_allocation_overrides')
      .where('project_id', projectId)
      .join('project_phases', 'project_allocation_overrides.phase_id', 'project_phases.id')
      .join('roles', 'project_allocation_overrides.role_id', 'roles.id')
      .leftJoin('resource_templates', 'project_allocation_overrides.template_id', 'resource_templates.id')
      .select(
        'project_allocation_overrides.*',
        'project_phases.name as phase_name',
        'project_phases.order_index as phase_order',
        'roles.name as role_name',
        'resource_templates.allocation_percentage as original_percentage'
      )
      .orderBy('project_phases.order_index', 'roles.name');

    return projectAllocations;
  }
}

export default ProjectAllocationController;