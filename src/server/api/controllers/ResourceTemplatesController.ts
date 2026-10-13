import type { Request, Response } from 'express';
import type { Knex } from 'knex';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { logger } from '../../services/logging/config.js';

export class ResourceTemplatesController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  async getAll(req: Request, res: Response) {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const filters = {
      project_type_id: req.query.project_type_id,
      phase_id: req.query.phase_id,
      role_id: req.query.role_id
    };

    const result = await this.executeQuery(async () => {
      let query = this.db('resource_templates')
        .join('project_types', 'resource_templates.project_type_id', 'project_types.id')
        .join('project_phases', 'resource_templates.phase_id', 'project_phases.id')
        .join('roles', 'resource_templates.role_id', 'roles.id')
        .select(
          'resource_templates.*',
          'project_types.name as project_type_name',
          'project_phases.name as phase_name',
          'roles.name as role_name'
        );

      query = this.buildFilters(query, filters);
      
      if (req.query.page || req.query.limit) {
        query = this.paginate(query, page, limit);
      } else {
        query = query.orderBy('project_types.name', 'project_phases.order_index', 'roles.name');
      }

      const allocations = await query;

      // Get total count
      let total = allocations.length;
      if (req.query.page || req.query.limit) {
        const countQuery = this.db('resource_templates').count('* as count');
        this.buildFilters(countQuery, filters);
        const totalResult = await countQuery.first();
        total = Number(totalResult?.count) || 0;
      }

      if (req.query.page || req.query.limit) {
        return {
          data: allocations,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        };
      } else {
        return allocations;
      }
    }, res, 'Failed to fetch allocations');

    if (result) {
      res.json(result);
    }
  }

  async getByProjectType(req: Request, res: Response) {
    const { project_type_id } = req.params;

    const result = await this.executeQuery(async () => {
      // Get allocations grouped by phase
      const allocations = await this.db('resource_templates')
        .join('project_phases', 'resource_templates.phase_id', 'project_phases.id')
        .join('roles', 'resource_templates.role_id', 'roles.id')
        .where('resource_templates.project_type_id', project_type_id)
        .select(
          'resource_templates.*',
          'project_phases.name as phase_name',
          'project_phases.order_index as phase_order',
          'roles.name as role_name'
        )
        .orderBy('project_phases.order_index', 'roles.name');

      // Group by phase
      const phaseMap = new Map();

      allocations.forEach((allocation: Record<string, any>) => {
        if (!phaseMap.has(allocation.phase_id)) {
          phaseMap.set(allocation.phase_id, {
            phase_id: allocation.phase_id,
            phase_name: allocation.phase_name,
            phase_order: allocation.phase_order,
            allocations: []
          });
        }
        
        phaseMap.get(allocation.phase_id).allocations.push({
          id: allocation.id,
          role_id: allocation.role_id,
          role_name: allocation.role_name,
          allocation_percentage: allocation.allocation_percentage
        });
      });

      // Convert to array and sort by phase order
      const phases = Array.from(phaseMap.values()).sort((a, b) => a.phase_order - b.phase_order);

      // Get project type details
      const projectType = await this.db('project_types')
        .where('id', project_type_id)
        .first();

      return {
        project_type: projectType,
        phases,
        summary: {
          total_phases: phases.length,
          total_allocations: allocations.length,
          total_percentage_by_phase: phases.map(phase => ({
            phase_name: phase.phase_name,
            total_percentage: phase.allocations.reduce((sum: number, a: any) => sum + a.allocation_percentage, 0)
          }))
        }
      };
    }, res, 'Failed to fetch allocations by project type');

    if (result) {
      res.json(result);
    }
  }

  async create(req: Request, res: Response) {
    const allocationData = req.body;

    const result = await this.executeQuery(async () => {
      // Check if this is a child project type (role allocations only allowed for child types)
      const projectType = await this.db('project_types')
        .where('id', allocationData.project_type_id)
        .first();

      if (!projectType) {
        return res.status(404).json({
          error: 'Project type not found'
        });
      }

      // Prevent editing allocations for default child project types
      if (projectType.is_default) {
        return res.status(403).json({
          error: 'Cannot modify allocations for default project types',
          message: 'Default project types are read-only. Modify the parent project type instead.'
        });
      }

      // Determine if this is an inherited template or a parent/override template
      const isInherited = false; // Direct creation is never inherited
      const parentTemplateId = null; // Will be set during inheritance propagation

      // Validate allocation doesn't already exist
      const existing = await this.db('resource_templates')
        .where({
          project_type_id: allocationData.project_type_id,
          phase_id: allocationData.phase_id,
          role_id: allocationData.role_id
        })
        .first();

      if (existing) {
        return res.status(409).json({
          error: 'Allocation already exists',
          existing,
          message: 'Use PUT to update existing allocation'
        });
      }

      const [allocation] = await this.db('resource_templates')
        .insert({
          ...allocationData,
          is_inherited: isInherited,
          parent_template_id: parentTemplateId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      // If this is a parent project type, propagate to children
      if (projectType.parent_id === null) {
        await this.propagateTemplateToChildren(allocation.project_type_id, allocation);
      }

      return allocation;
    }, res, 'Failed to create allocation');

    if (result) {
      res.status(201).json(result);
    }
  }

  async bulkUpdate(req: Request, res: Response) {
    const { project_type_id, allocations } = req.body;

    const result = await this.executeQuery(async () => {
      // Check if this is a child project type (role allocations only allowed for child types)
      const projectType = await this.db('project_types')
        .where('id', project_type_id)
        .first();

      if (!projectType) {
        return res.status(404).json({
          error: 'Project type not found'
        });
      }

      // Prevent editing allocations for default child project types
      if (projectType.is_default) {
        return res.status(403).json({
          error: 'Cannot modify allocations for default project types',
          message: 'Default project types are read-only. Modify the parent project type instead.'
        });
      }

      // Note: isInherited and parentTemplateId will be set during inheritance propagation

      const results = {
        created: [] as any[],
        updated: [] as any[],
        failed: [] as any[]
      };

      await this.db.transaction(async (trx: Knex.Transaction) => {
        for (const allocation of allocations) {
          try {
            // Check if allocation exists
            const existing = await trx('resource_templates')
              .where({
                project_type_id,
                phase_id: allocation.phase_id,
                role_id: allocation.role_id
              })
              .first();

            if (existing) {
              // Update existing
              const [updated] = await trx('resource_templates')
                .where('id', existing.id)
                .update({
                  allocation_percentage: allocation.allocation_percentage,
                  updated_at: new Date()
                })
                .returning('*');
              
              results.updated.push(updated);
            } else {
              // Create new
              const [created] = await trx('resource_templates')
                .insert({
                  project_type_id,
                  phase_id: allocation.phase_id,
                  role_id: allocation.role_id,
                  allocation_percentage: allocation.allocation_percentage,
                  is_inherited: false,
                  parent_template_id: null,
                  created_at: new Date(),
                  updated_at: new Date()
                })
                .returning('*');
              
              results.created.push(created);
            }
          } catch (error) {
            results.failed.push({
              allocation,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      });

      // If this is a parent project type, propagate changes to children
      if (projectType.parent_id === null) {
        for (const createdTemplate of results.created) {
          await this.propagateTemplateToChildren(project_type_id, createdTemplate);
        }
        for (const updatedTemplate of results.updated) {
          await this.propagateTemplateToChildren(project_type_id, updatedTemplate);
        }
      }

      return {
        summary: {
          total: allocations.length,
          created: results.created.length,
          updated: results.updated.length,
          failed: results.failed.length
        },
        results
      };
    }, res, 'Failed to bulk update allocations');

    if (result) {
      res.json(result);
    }
  }

  async copy(req: Request, res: Response) {
    const { source_project_type_id, target_project_type_id } = req.body;

    const result = await this.executeQuery(async () => {
      // Validate source and target exist
      const sourceType = await this.db('project_types')
        .where('id', source_project_type_id)
        .first();
      
      const targetType = await this.db('project_types')
        .where('id', target_project_type_id)
        .first();

      if (!sourceType || !targetType) {
        return res.status(404).json({
          error: 'Project type not found',
          source_exists: !!sourceType,
          target_exists: !!targetType
        });
      }

      // Get all allocations from source
      const sourceAllocations = await this.db('resource_templates')
        .where('project_type_id', source_project_type_id)
        .select('phase_id', 'role_id', 'allocation_percentage');

      if (sourceAllocations.length === 0) {
        return res.status(404).json({
          error: 'No allocations found for source project type'
        });
      }

      // 清空+复制必须同事务(2026-10-13 全库审计): 无事务时插入失败(如源行
      // 指向已删阶段撞 FK)会把目标类型模板清成空集
      const inserted = await this.db.transaction(async (trx: any) => {
        // Delete existing allocations for target
        await trx('resource_templates')
          .where('project_type_id', target_project_type_id)
          .del();

        // Insert copied allocations
        const newAllocations = sourceAllocations.map((allocation: Record<string, any>) => ({
          ...allocation,
          project_type_id: target_project_type_id,
          created_at: new Date(),
          updated_at: new Date()
        }));

        return await trx('resource_templates')
          .insert(newAllocations)
          .returning('*');
      });

      return {
        source: {
          id: source_project_type_id,
          name: sourceType.name,
          allocation_count: sourceAllocations.length
        },
        target: {
          id: target_project_type_id,
          name: targetType.name,
          allocation_count: inserted.length
        },
        copied_allocations: inserted.length
      };
    }, res, 'Failed to copy allocations');

    if (result) {
      res.json(result);
    }
  }

  async getTemplates(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      // Get project types with allocation counts
      const templates = await this.db('project_types')
        .leftJoin(
          this.db('resource_templates')
            .select('project_type_id')
            .count('* as allocation_count')
            .groupBy('project_type_id')
            .as('counts'),
          'project_types.id',
          'counts.project_type_id'
        )
        .select(
          'project_types.*',
          this.db.raw('COALESCE(counts.allocation_count, 0) as allocation_count')
        )
        .orderBy('project_types.name');

      // Get phase counts for each template
      for (const template of templates) {
        if (template.allocation_count > 0) {
          const phases = await this.db('resource_templates')
            .where('project_type_id', template.id)
            .countDistinct('phase_id as phase_count')
            .first();
          
          template.phase_count = phases?.phase_count || 0;
        } else {
          template.phase_count = 0;
        }
      }

      return {
        templates,
        summary: {
          total_templates: templates.length,
          templates_with_allocations: templates.filter((t: Record<string, any>) => t.allocation_count > 0).length,
          empty_templates: templates.filter((t: Record<string, any>) => t.allocation_count === 0).length
        }
      };
    }, res, 'Failed to fetch allocation templates');

    if (result) {
      res.json(result);
    }
  }

  async getSummary(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      // Get allocation statistics
      const stats = await this.db('resource_templates')
        .select(
          this.db.raw('COUNT(DISTINCT project_type_id) as project_types_count'),
          this.db.raw('COUNT(DISTINCT phase_id) as phases_count'),
          this.db.raw('COUNT(DISTINCT role_id) as roles_count'),
          this.db.raw('COUNT(*) as total_allocations'),
          this.db.raw('AVG(allocation_percentage) as avg_allocation'),
          this.db.raw('MAX(allocation_percentage) as max_allocation'),
          this.db.raw('MIN(allocation_percentage) as min_allocation')
        )
        .first();

      // Get allocations by project type
      const byProjectType = await this.db('resource_templates')
        .join('project_types', 'resource_templates.project_type_id', 'project_types.id')
        .select(
          'project_types.name as project_type',
          this.db.raw('COUNT(*) as allocation_count'),
          this.db.raw('SUM(allocation_percentage) as total_percentage')
        )
        .groupBy('project_types.id', 'project_types.name')
        .orderBy('allocation_count', 'desc');

      // Get allocations by role
      const byRole = await this.db('resource_templates')
        .join('roles', 'resource_templates.role_id', 'roles.id')
        .select(
          'roles.name as role',
          this.db.raw('COUNT(*) as allocation_count'),
          this.db.raw('AVG(allocation_percentage) as avg_percentage')
        )
        .groupBy('roles.id', 'roles.name')
        .orderBy('allocation_count', 'desc');

      // Get over-allocated phases (total > 100%)
      const overAllocated = await this.db('resource_templates')
        .join('project_types', 'resource_templates.project_type_id', 'project_types.id')
        .join('project_phases', 'resource_templates.phase_id', 'project_phases.id')
        .select(
          'project_types.name as project_type',
          'project_phases.name as phase',
          this.db.raw('SUM(allocation_percentage) as total_percentage')
        )
        .groupBy(
          'resource_templates.project_type_id',
          'resource_templates.phase_id',
          'project_types.name',
          'project_phases.name'
        )
        .having('total_percentage', '>', 100)
        .orderBy('total_percentage', 'desc');

      return {
        statistics: stats,
        by_project_type: byProjectType,
        by_role: byRole,
        over_allocated_phases: overAllocated,
        summary: {
          has_over_allocations: overAllocated.length > 0,
          over_allocation_count: overAllocated.length
        }
      };
    }, res, 'Failed to fetch allocation summary');

    if (result) {
      res.json(result);
    }
  }

  // Helper method to propagate template to children
  private async propagateTemplateToChildren(parentProjectTypeId: string, parentTemplate: any) {
    // Get all child project types
    const children = await this.db('project_types')
      .where('parent_id', parentProjectTypeId);

    for (const child of children) {
      // Check if child already has an override for this role/phase combination
      const existingOverride = await this.db('resource_templates')
        .where({
          project_type_id: child.id,
          phase_id: parentTemplate.phase_id,
          role_id: parentTemplate.role_id,
          is_inherited: false
        })
        .first();

      if (existingOverride) {
        // Child has an override, don't propagate
        continue;
      }

      // Check if child already has an inherited template for this role/phase
      const existingInherited = await this.db('resource_templates')
        .where({
          project_type_id: child.id,
          phase_id: parentTemplate.phase_id,
          role_id: parentTemplate.role_id,
          is_inherited: true
        })
        .first();

      if (existingInherited) {
        // Update existing inherited template
        await this.db('resource_templates')
          .where('id', existingInherited.id)
          .update({
            allocation_percentage: parentTemplate.allocation_percentage,
            parent_template_id: parentTemplate.id,
            updated_at: new Date()
          });
      } else {
        // Create new inherited template
        await this.db('resource_templates')
          .insert({
            project_type_id: child.id,
            phase_id: parentTemplate.phase_id,
            role_id: parentTemplate.role_id,
            allocation_percentage: parentTemplate.allocation_percentage,
            is_inherited: true,
            parent_template_id: parentTemplate.id,
            created_at: new Date(),
            updated_at: new Date()
          });
      }

      // Recursively propagate to grandchildren
      await this.propagateTemplateToChildren(child.id, parentTemplate);
    }
  }

  // Helper method to get effective allocations (inherited + overridden)
  async getEffectiveAllocations(projectTypeId: string) {
    try {
      // Get all templates for this project type
      const templates = await this.db('resource_templates')
        .join('project_phases', 'resource_templates.phase_id', 'project_phases.id')
        .join('roles', 'resource_templates.role_id', 'roles.id')
        .leftJoin('project_types as parent_types', 'resource_templates.parent_template_id', 'parent_types.id')
        .where('resource_templates.project_type_id', projectTypeId)
        .select(
          'resource_templates.*',
          'project_phases.name as phase_name',
          'project_phases.order_index as phase_order',
          'roles.name as role_name',
          'parent_types.name as parent_type_name'
        )
        .orderBy('project_phases.order_index', 'roles.name');

      return templates;
    } catch (error) {
      logger.error('Error getting effective allocations', error instanceof Error ? error : undefined);
      return [];
    }
  }
}