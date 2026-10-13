import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { logger } from '../../services/logging/config.js';

interface ProjectTypeWithHierarchy {
  id: string;
  name: string;
  description: string;
  color_code: string;
  parent_id?: string;
  is_parent: boolean;
  level: number;
  sort_order: number;
  children?: ProjectTypeWithHierarchy[];
  phases?: any[];
}

export class ProjectTypeHierarchyController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  // Get all project types with hierarchy structure
  getHierarchy = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get all project types (parents)
      const projectTypes = await this.db('project_types')
        .select('*')
        .orderBy('name');

      // Get all project sub-types (children)
      const projectSubTypes = await this.db('project_sub_types')
        .leftJoin('project_types', 'project_sub_types.project_type_id', 'project_types.id')
        .select(
          'project_sub_types.*',
          'project_types.name as project_type_name',
          'project_types.color_code as project_type_color'
        )
        .orderBy('project_types.name')
        .orderBy('project_sub_types.name');

      const hierarchy = this.buildNewHierarchy(projectTypes, projectSubTypes);
      
      res.json({ 
        success: true, 
        data: hierarchy
      });
    } catch (error) {
      logger.error('Hierarchy error', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get hierarchy',
        details: (error as Error).message 
      });
    }
  };

  // Get phases for a project type (including inherited)
  getProjectTypePhases = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectTypeId } = req.params;
      const phases = await this.getInheritedPhases(projectTypeId);
      
      return res.json({ 
        success: true, 
        data: phases 
      });
    }, res);
  };

  // Create Project Sub-Type
  createChild = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { parentId } = req.params;
      const { name, description, color_code } = req.body;
      
      const parent = await this.db('project_types').where('id', parentId).first();
      if (!parent) {
        return res.status(404).json({ error: 'Project Type not found' });
      }

      // 子类型落 project_sub_types(2026-10-13 全库审计): 读取路径 getHierarchy
      // 只从 project_sub_types 取子项,projects.project_sub_type_id 的 FK 也
      // 指向它——原先写 project_types.parent_id,产物不可见、不可被项目引用。
      // 排序号在真表内取;阶段继承走类型链(getInheritedPhases 按需向上解析),
      // 不再为子类型复制 project_type_phases 行
      const maxSortOrder = await this.db('project_sub_types')
        .where({ project_type_id: parentId })
        .max('sort_order as max')
        .first();

      const nextSortOrder = (maxSortOrder?.max || 0) + 1;

      const child = await this.db('project_sub_types').insert({
        name,
        description,
        color_code,
        project_type_id: parentId,
        is_active: true,
        sort_order: nextSortOrder
      }).returning('*');

      // Update Project Type to mark as having Project Sub-Types
      await this.db('project_types')
        .where('id', parentId)
        .update({ is_parent: true });
      
      return res.json({ 
        success: true, 
        data: child[0] 
      });
    }, res);
  };

  // Add phase to project type (only allowed for Project Types)
  addPhase = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectTypeId } = req.params;
      const { phaseId, orderIndex } = req.body;

      // Check if this is a Project Type (phases can only be added to Project Types)
      const projectType = await this.db('project_types').where('id', projectTypeId).first();
      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Only allow adding phases to Project Types or root-level types
      if (projectType.parent_id !== null) {
        return res.status(400).json({ 
          error: 'Phases can only be added to Project Types. Project Sub-Types inherit phases from their Project Type.' 
        });
      }

      // Check if already exists
      const existing = await this.db('project_type_phases')
        .where({ project_type_id: projectTypeId, phase_id: phaseId })
        .first();

      if (existing) {
        return res.status(400).json({ error: 'Phase already assigned to this project type' });
      }

      // Get the actual order index if not provided
      const actualOrderIndex = orderIndex || await this.getNextPhaseOrderIndex(projectTypeId);

      await this.db('project_type_phases').insert({
        id: `project-type-phase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        project_type_id: projectTypeId,
        phase_id: phaseId,
        is_inherited: false,
        order_index: actualOrderIndex,
        is_mandatory: req.body.is_mandatory || false,
        min_duration_days: req.body.min_duration_days || null,
        max_duration_days: req.body.max_duration_days || null,
        default_duration_days: req.body.default_duration_days || 30,
        is_locked_order: req.body.is_locked_order || false,
        template_description: req.body.template_description || null,
        template_metadata: req.body.template_metadata ? JSON.stringify(req.body.template_metadata) : null,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Propagate to Project Sub-Types
      await this.propagatePhaseToChildren(projectTypeId, phaseId, actualOrderIndex);

      return res.json({ success: true });
    }, res);
  };

  // Remove phase from project type (only allowed for Project Types)
  removePhase = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectTypeId, phaseId } = req.params;

      // Check if this is a Project Type (phases can only be removed from Project Types)
      const projectType = await this.db('project_types').where('id', projectTypeId).first();
      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Only allow removing phases from Project Types or root-level types
      if (projectType.parent_id !== null) {
        return res.status(400).json({ 
          error: 'Phases can only be removed from Project Types. Project Sub-Types inherit phases from their Project Type.' 
        });
      }

      // Check if phase is inherited (can't remove inherited phases)
      const phaseAssignment = await this.db('project_type_phases')
        .where({ project_type_id: projectTypeId, phase_id: phaseId })
        .first();

      if (!phaseAssignment) {
        return res.status(404).json({ error: 'Phase not found for this project type' });
      }

      if (phaseAssignment.is_inherited) {
        return res.status(400).json({ error: 'Cannot remove inherited phases' });
      }

      // Remove the phase
      await this.db('project_type_phases')
        .where({ project_type_id: projectTypeId, phase_id: phaseId })
        .delete();

      // Remove from Project Sub-Types too
      await this.removePhaseFromChildren(projectTypeId, phaseId);

      return res.json({ success: true });
    }, res);
  };

  // Update phase configuration for project type
  updatePhase = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectTypeId, phaseId } = req.params;
      const updateData = req.body;

      // Check if this is a Project Type (phases can only be updated on Project Types)
      const projectType = await this.db('project_types').where('id', projectTypeId).first();
      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      // Only allow updating phases on Project Types
      if (projectType.parent_id !== null) {
        return res.status(400).json({ 
          error: 'Phases can only be updated on Project Types. Project Sub-Types inherit phases from their Project Type.' 
        });
      }

      // Find the project type phase record
      const projectTypePhase = await this.db('project_type_phases')
        .where({ project_type_id: projectTypeId, phase_id: phaseId })
        .first();

      if (!projectTypePhase) {
        return res.status(404).json({ error: 'Phase not found for this project type' });
      }

      // Prepare update data with new template fields
      const updateFields: any = {
        updated_at: new Date()
      };

      if (updateData.is_mandatory !== undefined) updateFields.is_mandatory = updateData.is_mandatory;
      if (updateData.min_duration_days !== undefined) updateFields.min_duration_days = updateData.min_duration_days;
      if (updateData.max_duration_days !== undefined) updateFields.max_duration_days = updateData.max_duration_days;
      if (updateData.default_duration_days !== undefined) updateFields.default_duration_days = updateData.default_duration_days;
      if (updateData.is_locked_order !== undefined) updateFields.is_locked_order = updateData.is_locked_order;
      if (updateData.template_description !== undefined) updateFields.template_description = updateData.template_description;
      if (updateData.template_metadata !== undefined) {
        updateFields.template_metadata = updateData.template_metadata ? JSON.stringify(updateData.template_metadata) : null;
      }
      if (updateData.order_index !== undefined) updateFields.order_index = updateData.order_index;

      // Update the project type phase
      await this.db('project_type_phases')
        .where('id', projectTypePhase.id)
        .update(updateFields);

      return res.json({ success: true });
    }, res);
  };

  // Update project type hierarchy (move, reorder)
  updateHierarchy = async (req: Request, res: Response): Promise<void> => {
    await this.executeQuery(async () => {
      const { projectTypeId } = req.params;
      const { newParentId, newSortOrder } = req.body;

      const projectType = await this.db('project_types').where('id', projectTypeId).first();
      if (!projectType) {
        return res.status(404).json({ error: 'Project type not found' });
      }

      const updates: any = {};

      // Handle parent change
      if (newParentId !== undefined) {
        if (newParentId === null) {
          // Moving to root level
          updates.parent_id = null;
          updates.level = 0;
        } else {
          // Moving to new parent
          const newParent = await this.db('project_types').where('id', newParentId).first();
          if (!newParent) {
            return res.status(404).json({ error: 'New parent not found' });
          }
          // 环检测(2026-10-13 全库审计): parent_id 无 FK 纯应用层——原先
          // 自指/后代为父可写入,成环后四个递归遍历器全部爆栈。沿新父的
          // 祖先链上行,遇自身即拒;visited-set 兜住存量环数据
          if (newParentId === projectTypeId) {
            return res.status(400).json({ error: 'Project type cannot be its own parent' });
          }
          const seen = new Set<string>();
          let cursor: string | null = newParentId;
          while (cursor && !seen.has(cursor)) {
            if (cursor === projectTypeId) {
              return res.status(400).json({ error: 'Cannot move a project type under its own descendant (cycle)' });
            }
            seen.add(cursor);
            const row: any = await this.db('project_types').where('id', cursor).first();
            cursor = row?.parent_id ?? null;
          }
          updates.parent_id = newParentId;
          updates.level = newParent.level + 1;

          // Mark new Project Type as having Project Sub-Types
          await this.db('project_types')
            .where('id', newParentId)
            .update({ is_parent: true });
        }

        // Update all Project Sub-Types' levels
        await this.updateDescendantLevels(projectTypeId, updates.level);
      }

      // Handle sort order change
      if (newSortOrder !== undefined) {
        updates.sort_order = newSortOrder;
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        await this.db('project_types')
          .where('id', projectTypeId)
          .update(updates);
      }

      return res.json({ success: true });
    }, res);
  };

  // Private helper methods
  private buildHierarchy(projectTypes: any[]): ProjectTypeWithHierarchy[] {
    const map = new Map<string, ProjectTypeWithHierarchy>();
    const roots: ProjectTypeWithHierarchy[] = [];

    // Create map of all project types
    projectTypes.forEach(pt => {
      map.set(pt.id, { ...pt, children: [] });
    });

    // Build hierarchy
    projectTypes.forEach(pt => {
      const item = map.get(pt.id)!;
      if (pt.parent_id) {
        const parent = map.get(pt.parent_id);
        if (parent) {
          parent.children!.push(item);
        }
      } else {
        roots.push(item);
      }
    });

    return roots;
  }

  private buildNewHierarchy(projectTypes: any[], projectSubTypes: any[]): ProjectTypeWithHierarchy[] {
    const hierarchy: ProjectTypeWithHierarchy[] = [];

    // Convert project types to hierarchy format
    projectTypes.forEach(pt => {
      const hierarchyItem: ProjectTypeWithHierarchy = {
        id: pt.id,
        name: pt.name,
        description: pt.description || '',
        color_code: pt.color_code || '#6b7280',
        parent_id: undefined,
        is_parent: true,
        level: 0,
        sort_order: 0,
        children: []
      };

      // Find Project Sub-Types for this Project Type
      const subTypes = projectSubTypes.filter(st => st.project_type_id === pt.id);
      
      subTypes.forEach(st => {
        const subTypeItem: ProjectTypeWithHierarchy = {
          id: st.id,
          name: st.name,
          description: st.description || '',
          color_code: st.color_code || pt.color_code || '#6b7280',
          parent_id: pt.id,
          is_parent: false,
          level: 1,
          sort_order: st.sort_order || 0,
          children: []
        };
        
        hierarchyItem.children!.push(subTypeItem);
      });

      // Sort Project Sub-Types by sort_order and name
      hierarchyItem.children!.sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.name.localeCompare(b.name);
      });

      hierarchy.push(hierarchyItem);
    });

    return hierarchy;
  }

  private async getInheritedPhases(projectTypeId: string): Promise<any[]> {
    // Get direct phases
    const directPhases = await this.db('project_type_phases')
      .join('project_phases', 'project_type_phases.phase_id', 'project_phases.id')
      .where('project_type_phases.project_type_id', projectTypeId)
      .select(
        'project_phases.id as phase_id',
        'project_phases.name as phase_name',
        'project_phases.description as phase_description',
        'project_type_phases.id',
        'project_type_phases.project_type_id',
        'project_type_phases.is_inherited',
        'project_type_phases.order_index',
        'project_type_phases.is_mandatory',
        'project_type_phases.min_duration_days',
        'project_type_phases.max_duration_days',
        'project_type_phases.default_duration_days',
        'project_type_phases.is_locked_order',
        'project_type_phases.template_description',
        'project_type_phases.template_metadata',
        'project_type_phases.duration_weeks as override_duration'
      )
      .orderBy('project_type_phases.order_index');

    // If no direct phases and has parent, get inherited phases
    if (directPhases.length === 0) {
      const projectType = await this.db('project_types').where('id', projectTypeId).first();
      if (projectType?.parent_id) {
        return this.getInheritedPhases(projectType.parent_id);
      }
    }

    return directPhases;
  }

  private async inheritPhases(childId: string, parentId: string): Promise<void> {
    const parentPhases = await this.getInheritedPhases(parentId);

    const inheritedPhases = parentPhases.map((phase, index) => ({
      project_type_id: childId,
      phase_id: phase.phase_id,
      is_inherited: true,
      order_index: index + 1
    }));

    if (inheritedPhases.length > 0) {
      await this.db('project_type_phases').insert(inheritedPhases);
    }
  }

  private async propagatePhaseToChildren(parentId: string, phaseId: string, orderIndex: number): Promise<void> {
    const subTypes = await this.db('project_types').where('parent_id', parentId);
    
    for (const subType of subTypes) {
      // Add inherited phase to Project Sub-Type
      await this.db('project_type_phases')
        .insert({
          project_type_id: subType.id,
          phase_id: phaseId,
          is_inherited: true,
          order_index: orderIndex
        })
        .onConflict(['project_type_id', 'phase_id'])
        .ignore();

      // Recurse to nested Project Sub-Types
      await this.propagatePhaseToChildren(subType.id, phaseId, orderIndex);
    }
  }

  private async removePhaseFromChildren(parentId: string, phaseId: string): Promise<void> {
    const subTypes = await this.db('project_types').where('parent_id', parentId);
    
    for (const subType of subTypes) {
      // Remove only inherited phases (not direct assignments)
      await this.db('project_type_phases')
        .where({
          project_type_id: subType.id,
          phase_id: phaseId,
          is_inherited: true
        })
        .delete();

      // Recurse to nested Project Sub-Types
      await this.removePhaseFromChildren(subType.id, phaseId);
    }
  }

  private async getNextPhaseOrderIndex(projectTypeId: string): Promise<number> {
    const maxOrder = await this.db('project_type_phases')
      .where('project_type_id', projectTypeId)
      .max('order_index as max')
      .first();

    return (maxOrder?.max || 0) + 1;
  }

  private async updateDescendantLevels(projectTypeId: string, newLevel: number): Promise<void> {
    const subTypes = await this.db('project_types').where('parent_id', projectTypeId);
    
    for (const subType of subTypes) {
      const subTypeLevel = newLevel + 1;
      await this.db('project_types')
        .where('id', subType.id)
        .update({ level: subTypeLevel });

      // Recurse to update nested Project Sub-Types
      await this.updateDescendantLevels(subType.id, subTypeLevel);
    }
  }
}