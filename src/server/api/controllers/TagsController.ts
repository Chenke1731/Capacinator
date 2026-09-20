import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';

/**
 * CRUD for project tags. Tags are free-form classification labels used for
 * filtering and cross-cutting grouping; they carry NO calculation semantics.
 */
export class TagsController extends BaseController {
  getAll = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const tags = await this.db('tags')
        .select(
          'tags.*',
          this.db.raw('(SELECT COUNT(*) FROM project_tags pt WHERE pt.tag_id = tags.id) as project_count')
        )
        .orderBy('name');
      return res.json({ success: true, data: tags });
    }, res);
    return result;
  });

  create = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const { name, color, description } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Validation error', message: 'name is required' });
      }
      const trimmed = String(name).trim().slice(0, 100);

      const existing = await this.db('tags').where('name', trimmed).first();
      if (existing) {
        return res.status(409).json({
          error: 'Conflict',
          message: `Tag "${trimmed}" already exists`,
          data: existing
        });
      }

      const [created] = await this.db('tags')
        .insert({ name: trimmed, color: color || null, description: description || null })
        .returning('*');
      return res.status(201).json({ success: true, data: created });
    }, res);
    return result;
  });

  update = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      const { id } = req.params;
      const { name, color, description } = req.body;
      const [updated] = await this.db('tags')
        .where('id', id)
        .update({
          ...(name ? { name: String(name).trim().slice(0, 100) } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(description !== undefined ? { description } : {}),
          updated_at: this.db.fn.now()
        })
        .returning('*');
      if (!updated) {
        this.handleNotFound(res, 'Tag');
        return;
      }
      return res.json({ success: true, data: updated });
    }, res);
    return result;
  });

  remove = this.asyncHandler(async (req: RequestWithContext, res: Response) => {
    const result = await this.executeQuery(async () => {
      await this.db('tags').where('id', req.params.id).del();
      return res.json({ success: true, message: 'Tag deleted' });
    }, res);
    return result;
  });
}
