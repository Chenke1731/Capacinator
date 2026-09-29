import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';

export class SimpleController extends BaseController {
  constructor(private tableName: string, container?: ServiceContainer) {
    super({}, { container });
  }

  async getAll(req: Request, res: Response) {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const result = await this.executeQuery(async () => {
      let query = this.db(this.tableName).select('*');
      
      // Add search if name field exists and search query provided
      if (req.query.search) {
        query = query.where('name', 'like', `%${req.query.search}%`);
      }

      // Apply pagination only if requested
      if (req.query.page || req.query.limit) {
        query = this.paginate(query, page, limit);
      } else {
        // Only order by name if the table has a name column
        const hasNameColumn = ['locations', 'project_types', 'project_phases', 'roles', 'components'].includes(this.tableName);
        if (hasNameColumn) {
          query = query.orderBy('name');
        }
      }

      const items = await query;

      // Get total count for pagination
      let total = items.length;
      if (req.query.page || req.query.limit) {
        const countQuery = this.db(this.tableName).count('* as count');
        if (req.query.search) {
          countQuery.where('name', 'like', `%${req.query.search}%`);
        }
        const totalResult = await countQuery.first();
        total = Number(totalResult?.count) || 0;
      }

      if (req.query.page || req.query.limit) {
        return {
          data: items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        };
      } else {
        return {
          data: items
        };
      }
    }, res, `Failed to fetch ${this.tableName}`);

    if (result) {
      res.json(result);
    }
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const item = await this.db(this.tableName)
        .where('id', id)
        .first();

      if (!item) {
        this.handleNotFound(res, this.tableName.slice(0, -1)); // Remove 's' for singular
        return null;
      }

      return { data: item };
    }, res, `Failed to fetch ${this.tableName.slice(0, -1)}`);

    if (result) {
      res.json(result);
    }
  }

  async create(req: Request, res: Response) {
    const itemData = req.body;

    const result = await this.executeQuery(async () => {
      const [item] = await this.db(this.tableName)
        .insert({
          ...itemData,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      return { data: item };
    }, res, `Failed to create ${this.tableName.slice(0, -1)}`);

    if (result) {
      res.status(201).json(result);
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateData = req.body;

    const result = await this.executeQuery(async () => {
      const [item] = await this.db(this.tableName)
        .where('id', id)
        .update({
          ...updateData,
          updated_at: new Date()
        })
        .returning('*');

      if (!item) {
        this.handleNotFound(res, this.tableName.slice(0, -1));
        return null;
      }

      return { data: item };
    }, res, `Failed to update ${this.tableName.slice(0, -1)}`);

    if (result) {
      res.json(result);
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const deletedCount = await this.db(this.tableName)
        .where('id', id)
        .del();

      if (deletedCount === 0) {
        this.handleNotFound(res, this.tableName.slice(0, -1));
        return null;
      }

      return { message: `${this.tableName.slice(0, -1)} deleted successfully` };
    }, res, `Failed to delete ${this.tableName.slice(0, -1)}`);

    if (result) {
      res.json(result);
    }
  }
}