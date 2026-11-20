import type { Request, Response } from 'express';
import { db as globalDb } from '../../database/index.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { logger } from '../../services/logging/config.js';

export class ProjectPhaseDependenciesController {
  private db: any;

  constructor(container?: ServiceContainer) {
    this.db = container ? container.getDb() : globalDb;
  }

  async getAll(req: Request, res: Response) {
    try {
      const { project_id, page = 1, limit = 10 } = req.query;
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      let query = this.db('project_phase_dependencies as pd')
        .join('project_phases_timeline as ppt1', 'pd.predecessor_phase_timeline_id', 'ppt1.id')
        .join('project_phases_timeline as ppt2', 'pd.successor_phase_timeline_id', 'ppt2.id')
        .join('project_phases as pp1', 'ppt1.phase_id', 'pp1.id')
        .join('project_phases as pp2', 'ppt2.phase_id', 'pp2.id')
        .select(
          'pd.*',
          'pp1.name as predecessor_phase_name',
          'pp2.name as successor_phase_name'
        );

      if (project_id) {
        query = query.where('pd.project_id', project_id);
      }

      // Get total count
      const [{ total }] = await this.db('project_phase_dependencies')
        .where(project_id ? { project_id } : {})
        .count('* as total');

      // Get paginated data
      const dependencies = await query
        .orderBy('pd.created_at', 'desc')
        .limit(limitNum)
        .offset(offset);

      res.json({
        data: dependencies,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: parseInt(total as string, 10),
          totalPages: Math.ceil(parseInt(total as string, 10) / limitNum)
        }
      });
    } catch (error) {
      logger.error('Error fetching project phase dependencies', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to fetch dependencies' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const dependency = await this.db('project_phase_dependencies as pd')
        .join('project_phases_timeline as ppt1', 'pd.predecessor_phase_timeline_id', 'ppt1.id')
        .join('project_phases_timeline as ppt2', 'pd.successor_phase_timeline_id', 'ppt2.id')
        .join('project_phases as pp1', 'ppt1.phase_id', 'pp1.id')
        .join('project_phases as pp2', 'ppt2.phase_id', 'pp2.id')
        .where('pd.id', id)
        .select(
          'pd.*',
          'pp1.name as predecessor_phase_name',
          'pp2.name as successor_phase_name'
        )
        .first();

      if (!dependency) {
        return res.status(404).json({ error: 'Dependency not found' });
      }

      res.json(dependency);
    } catch (error) {
      logger.error('Error fetching dependency', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to fetch dependency' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { predecessor_phase_timeline_id, successor_phase_timeline_id } = req.body;

      // Validate no self-dependency
      if (predecessor_phase_timeline_id === successor_phase_timeline_id) {
        return res.status(400).json({ error: 'A phase cannot depend on itself' });
      }

      const now = new Date();
      const dependencyData = {
        ...req.body,
        id: req.body.id || `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        created_at: now,
        updated_at: now
      };

      const [insertedDep] = await this.db('project_phase_dependencies')
        .insert(dependencyData)
        .returning('*');

      // Fetch with phase names
      const dependency = await this.db('project_phase_dependencies as pd')
        .join('project_phases_timeline as ppt1', 'pd.predecessor_phase_timeline_id', 'ppt1.id')
        .join('project_phases_timeline as ppt2', 'pd.successor_phase_timeline_id', 'ppt2.id')
        .join('project_phases as pp1', 'ppt1.phase_id', 'pp1.id')
        .join('project_phases as pp2', 'ppt2.phase_id', 'pp2.id')
        .where('pd.id', insertedDep.id)
        .select(
          'pd.*',
          'pp1.name as predecessor_phase_name',
          'pp2.name as successor_phase_name'
        )
        .first();

      res.status(201).json({ data: dependency });
    } catch (error) {
      logger.error('Error creating dependency', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to create dependency' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const [dependency] = await this.db('project_phase_dependencies')
        .where({ id })
        .update({ ...req.body, updated_at: new Date() })
        .returning('*');

      if (!dependency) {
        return res.status(404).json({ error: 'Dependency not found' });
      }

      res.json(dependency);
    } catch (error) {
      logger.error('Error updating dependency', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to update dependency' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.db('project_phase_dependencies')
        .where({ id })
        .delete();

      if (!result) {
        return res.status(404).json({ error: 'Dependency not found' });
      }

      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting dependency', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to delete dependency' });
    }
  }

  async calculateCascade(req: Request, res: Response) {
    try {
      const { project_id, phase_timeline_id, new_start_date, new_end_date } = req.body;

      // Import cascade service
      const { ProjectPhaseCascadeService } = await import('../../services/ProjectPhaseCascadeService.js');
      const cascadeService = new ProjectPhaseCascadeService(this.db);

      // Calculate cascade effects
      const result = await cascadeService.calculateCascade(
        project_id,
        phase_timeline_id,
        new Date(new_start_date),
        new Date(new_end_date)
      );

      res.json(result);
    } catch (error) {
      logger.error('Error calculating cascade', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to calculate cascade effects' });
    }
  }

  async applyCascade(req: Request, res: Response) {
    try {
      const { project_id, cascade_data } = req.body;

      // Import cascade service
      const { ProjectPhaseCascadeService } = await import('../../services/ProjectPhaseCascadeService.js');
      const cascadeService = new ProjectPhaseCascadeService(this.db);

      // Apply cascade changes (timeline writes + assignment refresh share one transaction)
      const result = await cascadeService.applyCascade(project_id, cascade_data);

      // Post-commit audit: timeline rows and refreshed assignment rows.
      // logAuditEvent is awaited per row (INV-4); never inside the transaction
      // (single-connection pool would deadlock).
      for (const change of result.phase_changes) {
        await (req as any).logAuditEvent?.(
          'project_phases_timeline',
          change.timeline_id,
          'UPDATE',
          { start_date: change.old_start_date, end_date: change.old_end_date },
          { start_date: change.new_start_date, end_date: change.new_end_date },
          'cascade applied from phase dependency'
        );
      }
      for (const change of result.assignment_changes) {
        await (req as any).logAuditEvent?.(
          'scenario_project_assignments',
          change.assignment_id,
          'UPDATE',
          { computed_start_date: change.old.start, computed_end_date: change.old.end },
          { computed_start_date: change.new.start, computed_end_date: change.new.end },
          'recomputed from phase timeline'
        );
      }

      res.json({
        success: true,
        message: 'Cascade changes applied successfully',
        updated_phases: result.updated_phases,
        updated_assignments: result.assignment_changes.length
      });
    } catch (error) {
      // I02j/P2-4：cascade 入参校验失败 → 400（不把他项目数据写坏后 500）。
      // 按 name 判定而非 instanceof：动态 import/测试替身下类对象可能缺失。
      if (error instanceof Error && error.name === 'CascadeProjectMismatchError') {
        logger.warn('Rejected cascade apply', { projectId: req.body?.project_id, reason: error.message });
        res.status(400).json({ error: 'Validation error', message: error.message });
        return;
      }
      logger.error('Error applying cascade', error instanceof Error ? error : undefined);
      res.status(500).json({ error: 'Failed to apply cascade changes' });
    }
  }
}
