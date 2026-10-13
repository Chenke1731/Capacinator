import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';

/**
 * Controller for test data cleanup endpoints
 * Used by e2e tests to clean up test data
 */
export class TestDataController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  async deleteProjectPhases(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      const deleted = await this.db('project_phases_timeline')
        .whereIn('project_id', 
          this.db('projects').select('id').whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        )
        .del();

      return { message: `Deleted ${deleted} test project phases` };
    }, res, 'Failed to delete test project phases');

    if (result) {
      res.json(result);
    }
  }

  async deleteAllocations(req: Request, res: Response) {
    // For now, return success - this endpoint may not be needed
    res.json({ message: 'Deleted 0 test allocations' });
  }

  async deleteAvailabilityOverrides(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      const deleted = await this.db('person_availability_overrides')
        .whereIn('person_id',
          this.db('people').select('id').whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        )
        .del();

      return { message: `Deleted ${deleted} test availability overrides` };
    }, res, 'Failed to delete test availability overrides');

    if (result) {
      res.json(result);
    }
  }

  async deleteRoles(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      const deleted = await this.db('roles')
        .whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        .del();

      return { message: `Deleted ${deleted} test roles` };
    }, res, 'Failed to delete test roles');

    if (result) {
      res.json(result);
    }
  }

  async deletePhases(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      const deleted = await this.db('project_phases')
        .whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        .del();

      return { message: `Deleted ${deleted} test phases` };
    }, res, 'Failed to delete test phases');

    if (result) {
      res.json(result);
    }
  }

  async deleteProjectTypes(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      // Delete test project types - both naming conventions
      const testProjectTypePatterns = [
        'AI/ML Platform%',
        'Product Development%', 
        'Strategy Consulting%',
        'Cloud Migration%',
        'Mobile Enhancement%',
        'Data Analytics%',
        'Security Upgrade%',
        'Platform Engineering%',
        'Technical Consulting%',
        'Implementation Consulting%',
        'Strategy & Planning%',
        'Business Analysis%',
        'Advanced Analytics%'
      ];
      
      let deleted = 0;
      let subTypesDeleted = 0;
      
      // First, delete project sub-types associated with test project types
      for (const pattern of testProjectTypePatterns) {
        const subTypesResult = await this.db('project_sub_types')
          .whereIn('project_type_id', 
            this.db('project_types').select('id').where('name', 'like', pattern)
          )
          .del();
        subTypesDeleted += subTypesResult;
      }
      
      // Also delete sub-types for Test_ prefix
      const testSubTypesDeleted = await this.db('project_sub_types')
        .whereIn('project_type_id',
          this.db('project_types').select('id').whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        )
        .del();
      subTypesDeleted += testSubTypesDeleted;
      
      // Now delete project types
      for (const pattern of testProjectTypePatterns) {
        const result = await this.db('project_types')
          .where('name', 'like', pattern)
          .del();
        deleted += result;
      }
      
      // Also delete any with Test_ prefix for backward compatibility
      const testPrefixDeleted = await this.db('project_types')
        .whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        .del();
      
      deleted += testPrefixDeleted;

      return { message: `Deleted ${deleted} test project types and ${subTypesDeleted} sub-types` };
    }, res, 'Failed to delete test project types');

    if (result) {
      res.json(result);
    }
  }

  async deleteLocations(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      const deleted = await this.db('locations')
        .whereRaw("name LIKE ? ESCAPE '\\'", ['Test\\_%'])
        .del();

      return { message: `Deleted ${deleted} test locations` };
    }, res, 'Failed to delete test locations');

    if (result) {
      res.json(result);
    }
  }
}