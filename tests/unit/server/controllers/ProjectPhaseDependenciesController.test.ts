import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

import type { Request, Response } from 'express';
import { ProjectPhaseDependenciesController } from '../../../../src/server/api/controllers/ProjectPhaseDependenciesController';

// Mock the database module
jest.mock('../../../../src/server/database/index.js', () => ({
  db: jest.fn()
}));

import { db } from '../../../../src/server/database/index.js';

// Mock ProjectPhaseCascadeService
jest.mock('../../../../src/server/services/ProjectPhaseCascadeService', () => ({
  ProjectPhaseCascadeService: jest.fn().mockImplementation(() => ({
    calculateCascade: jest.fn().mockResolvedValue({
      affected: [],
      conflicts: []
    }),
    applyCascade: jest.fn().mockResolvedValue({
      updated_phases: 0,
      phase_changes: [],
      assignment_changes: []
    })
  }))
}));

describe('ProjectPhaseDependenciesController', () => {
  let controller: ProjectPhaseDependenciesController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockQuery: any;

  beforeEach(() => {
    // Create controller instance (uses mocked global db)
    controller = new ProjectPhaseDependenciesController();
    // Create a mock query builder
    mockQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn(),
      returning: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis()
    };

    // Mock db to return our query builder by default
    (db as jest.Mock).mockImplementation(() => mockQuery);

    mockReq = {
      query: {},
      params: {},
      body: {}
    };
    mockRes = {
      json: jest.fn() as any,
      status: jest.fn().mockReturnThis() as any,
      send: jest.fn() as any
    };
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it.skip('should fetch all dependencies with pagination', async () => {
      const mockDependencies = [
        {
          id: 'dep-1',
          project_id: 'proj-1',
          predecessor_phase_timeline_id: 'phase-1',
          successor_phase_timeline_id: 'phase-2',
          dependency_type: 'FS',
          lag_days: 0,
          predecessor_phase_name: 'Phase 1',
          successor_phase_name: 'Phase 2'
        }
      ];

      const mockCount = [{ total: '1' }];  // Note: array destructuring expected

      // Mock for the count query
      const countMockQuery = {
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(mockCount)  // count returns the array directly
      };

      // Mock for the main data query
      const dataMockQuery = {
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(mockDependencies)  // offset is the last call, resolves to data
      };

      // Return different query objects for different calls
      (db as jest.Mock)
        .mockReturnValueOnce(countMockQuery)  // First call is for count
        .mockReturnValueOnce(dataMockQuery);  // Second call is for data

      await controller.getAll(mockReq as Request, mockRes as Response);

      expect(db).toHaveBeenNthCalledWith(1, 'project_phase_dependencies');  // count query
      expect(db).toHaveBeenNthCalledWith(2, 'project_phase_dependencies as pd');  // data query
      expect(dataMockQuery.join).toHaveBeenCalledTimes(4); // 4 joins for phase names
      expect(dataMockQuery.select).toHaveBeenCalled();
      expect(dataMockQuery.orderBy).toHaveBeenCalledWith('pd.created_at', 'desc');
      expect(dataMockQuery.limit).toHaveBeenCalledWith(10); // default limit
      expect(dataMockQuery.offset).toHaveBeenCalledWith(0); // page 1
      expect(mockRes.json).toHaveBeenCalledWith({
        data: mockDependencies,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      mockQuery.orderBy.mockRejectedValue(error);

      await controller.getAll(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch dependencies' });
    });
  });

  describe('getById', () => {
    it('should fetch dependency by id with phase names', async () => {
      const mockDependency = {
        id: 'dep-1',
        project_id: 'proj-1',
        dependency_type: 'FS',
        predecessor_phase_name: 'Phase 1',
        successor_phase_name: 'Phase 2'
      };

      mockReq.params = { id: 'dep-1' };
      mockQuery.first.mockResolvedValue(mockDependency);

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(db).toHaveBeenCalledWith('project_phase_dependencies as pd');
      expect(mockQuery.join).toHaveBeenCalledTimes(4); // 4 joins for phase names
      expect(mockQuery.where).toHaveBeenCalledWith('pd.id', 'dep-1');
      expect(mockQuery.select).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockDependency);
    });

    it('should return 404 if dependency not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockQuery.first.mockResolvedValue(null);

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Dependency not found' });
    });

    it('should handle errors in getById', async () => {
      mockReq.params = { id: 'dep-1' };
      mockQuery.first.mockRejectedValue(new Error('Database error'));

      await controller.getById(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch dependency' });
    });
  });

  describe('create', () => {
    it('should create a new dependency', async () => {
      const newDependency = {
        project_id: 'proj-1',
        predecessor_phase_timeline_id: 'phase-1',
        successor_phase_timeline_id: 'phase-2',
        dependency_type: 'FS',
        lag_days: 0
      };

      const createdDependency = { id: 'dep-1', ...newDependency };
      const dependencyWithPhaseNames = {
        ...createdDependency,
        predecessor_phase_name: 'Phase 1',
        successor_phase_name: 'Phase 2'
      };
      
      mockReq.body = newDependency;
      
      // First call for insert
      mockQuery.returning.mockResolvedValueOnce([createdDependency]);
      
      // Second call for fetching with phase names
      const secondMockQuery = {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dependencyWithPhaseNames)
      };
      
      (db as jest.Mock).mockReturnValueOnce(mockQuery).mockReturnValueOnce(secondMockQuery);

      await controller.create(mockReq as Request, mockRes as Response);

      expect(db).toHaveBeenCalledWith('project_phase_dependencies');
      expect(mockQuery.insert).toHaveBeenCalledWith({
        ...newDependency,
        id: expect.stringMatching(/^dep-/),
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
      expect(mockQuery.returning).toHaveBeenCalledWith('*');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ data: dependencyWithPhaseNames });
    });

    it('should prevent self-dependencies', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        predecessor_phase_timeline_id: 'phase-1',
        successor_phase_timeline_id: 'phase-1', // Same as predecessor
        dependency_type: 'FS',
        lag_days: 0
      };

      await controller.create(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'A phase cannot depend on itself' });
      expect(db).not.toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        predecessor_phase_timeline_id: 'phase-1',
        successor_phase_timeline_id: 'phase-2',
        dependency_type: 'FS',
        lag_days: 0
      };
      mockQuery.returning.mockRejectedValue(new Error('Insert failed'));

      await controller.create(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to create dependency' });
    });
  });

  describe('update', () => {
    it('should update an existing dependency', async () => {
      const updateData = { lag_days: 5 };
      const updatedDependency = {
        id: 'dep-1',
        project_id: 'proj-1',
        lag_days: 5
      };

      mockReq.params = { id: 'dep-1' };
      mockReq.body = updateData;
      mockQuery.returning.mockResolvedValue([updatedDependency]);

      await controller.update(mockReq as Request, mockRes as Response);

      expect(db).toHaveBeenCalledWith('project_phase_dependencies');
      expect(mockQuery.where).toHaveBeenCalledWith({ id: 'dep-1' });
      expect(mockQuery.update).toHaveBeenCalledWith({ ...updateData, updated_at: expect.any(Date) });
      expect(mockRes.json).toHaveBeenCalledWith(updatedDependency);
    });

    it('should return 404 if dependency to update not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockReq.body = { lag_days: 5 };
      mockQuery.returning.mockResolvedValue([]);

      await controller.update(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Dependency not found' });
    });

    it('should handle errors in update', async () => {
      mockReq.params = { id: 'dep-1' };
      mockReq.body = { lag_days: 5 };
      mockQuery.returning.mockRejectedValue(new Error('Update failed'));

      await controller.update(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to update dependency' });
    });
  });

  describe('delete', () => {
    it('should delete a dependency', async () => {
      mockReq.params = { id: 'dep-1' };
      mockQuery.delete.mockResolvedValue(1);

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(db).toHaveBeenCalledWith('project_phase_dependencies');
      expect(mockQuery.where).toHaveBeenCalledWith({ id: 'dep-1' });
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should return 404 if dependency to delete not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockQuery.delete.mockResolvedValue(0);

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Dependency not found' });
    });

    it('should handle errors in delete', async () => {
      mockReq.params = { id: 'dep-1' };
      mockQuery.delete.mockRejectedValue(new Error('Delete failed'));

      await controller.delete(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to delete dependency' });
    });
  });

  describe('calculateCascade', () => {
    it('should calculate cascade effects', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        phase_timeline_id: 'timeline-1',
        new_start_date: '2024-01-01',
        new_end_date: '2024-01-31'
      };

      const mockCascadeResult = {
        affected_phases: ['timeline-2', 'timeline-3'],
        cascade_count: 2
      };

      // The ProjectPhaseCascadeService is mocked at the top of the file
      await controller.calculateCascade(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        affected: [],
        conflicts: []
      });
    });
  });

  describe('applyCascade', () => {
    it('should apply cascade changes', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        cascade_data: {
          'timeline-2': { start_date: '2024-02-01', end_date: '2024-02-28' },
          'timeline-3': { start_date: '2024-03-01', end_date: '2024-03-31' }
        }
      };

      await controller.applyCascade(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cascade changes applied successfully',
        updated_phases: 0,
        updated_assignments: 0
      });
    });

    it('should handle errors in applyCascade', async () => {
      // Mock the cascade service to throw an error
      const { ProjectPhaseCascadeService } = await import('../../../../src/server/services/ProjectPhaseCascadeService');
      const mockApplyCascade = jest.fn().mockRejectedValue(new Error('Cascade apply failed'));
      (ProjectPhaseCascadeService as jest.Mock).mockImplementationOnce(() => ({
        applyCascade: mockApplyCascade
      }));

      mockReq.body = {
        project_id: 'proj-1',
        cascade_data: {}
      };

      await controller.applyCascade(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to apply cascade changes' });
    });
  });

  describe('calculateCascade error handling', () => {
    it('should handle errors in calculateCascade', async () => {
      // Mock the cascade service to throw an error
      const { ProjectPhaseCascadeService } = await import('../../../../src/server/services/ProjectPhaseCascadeService');
      const mockCalculate = jest.fn().mockRejectedValue(new Error('Cascade calculation failed'));
      (ProjectPhaseCascadeService as jest.Mock).mockImplementationOnce(() => ({
        calculateCascade: mockCalculate
      }));

      mockReq.body = {
        project_id: 'proj-1',
        phase_timeline_id: 'timeline-1',
        new_start_date: '2024-01-01',
        new_end_date: '2024-01-31'
      };

      await controller.calculateCascade(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to calculate cascade effects' });
    });
  });

  describe('getAll with project_id filter', () => {
    it('should filter by project_id when provided', async () => {
      const mockDependencies = [
        {
          id: 'dep-1',
          project_id: 'proj-1',
          predecessor_phase_name: 'Phase 1',
          successor_phase_name: 'Phase 2'
        }
      ];

      mockReq.query = { project_id: 'proj-1', page: '1', limit: '10' };

      // Mock for the data query that chains correctly
      mockQuery.offset.mockResolvedValue(mockDependencies);

      // Mock for the count query - returns a thenable with count
      const countMockQuery = {
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ total: '1' }])
      };

      (db as jest.Mock)
        .mockReturnValueOnce(mockQuery)  // First call for data query
        .mockReturnValueOnce(countMockQuery);  // Second call for count

      await controller.getAll(mockReq as Request, mockRes as Response);

      // Verify project_id filter was applied
      expect(mockQuery.where).toHaveBeenCalledWith('pd.project_id', 'proj-1');
    });
  });

  describe('getAll pagination edge cases', () => {
    it('should use default page and limit when not provided', async () => {
      mockReq.query = {};

      // Setup mocks for the query chain
      mockQuery.offset.mockResolvedValue([]);

      const countMockQuery = {
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ total: '0' }])
      };

      (db as jest.Mock)
        .mockReturnValueOnce(mockQuery)
        .mockReturnValueOnce(countMockQuery);

      await controller.getAll(mockReq as Request, mockRes as Response);

      expect(mockQuery.limit).toHaveBeenCalledWith(10); // default limit
      expect(mockQuery.offset).toHaveBeenCalledWith(0); // page 1, offset 0
    });

    it('should calculate correct totalPages for partial last page', async () => {
      mockReq.query = { page: '1', limit: '3' };

      mockQuery.offset.mockResolvedValue([{}, {}, {}]);

      const countMockQuery = {
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ total: '7' }])  // 7 items with limit 3 = 3 pages
      };

      (db as jest.Mock)
        .mockReturnValueOnce(mockQuery)
        .mockReturnValueOnce(countMockQuery);

      await controller.getAll(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        pagination: expect.objectContaining({
          total: 7,
          totalPages: 3  // Math.ceil(7/3) = 3
        })
      }));
    });
  });

  describe('create with custom id', () => {
    it('should use provided id if specified in body', async () => {
      const newDependency = {
        id: 'custom-dep-id',
        project_id: 'proj-1',
        predecessor_phase_timeline_id: 'phase-1',
        successor_phase_timeline_id: 'phase-2',
        dependency_type: 'FS'
      };

      const createdDependency = { ...newDependency };
      const dependencyWithPhaseNames = {
        ...createdDependency,
        predecessor_phase_name: 'Phase 1',
        successor_phase_name: 'Phase 2'
      };

      mockReq.body = newDependency;

      mockQuery.returning.mockResolvedValueOnce([createdDependency]);

      const secondMockQuery = {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dependencyWithPhaseNames)
      };

      (db as jest.Mock).mockReturnValueOnce(mockQuery).mockReturnValueOnce(secondMockQuery);

      await controller.create(mockReq as Request, mockRes as Response);

      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
        id: 'custom-dep-id'
      }));
    });
  });

  describe('update with empty body', () => {
    it('should still update with just updated_at timestamp', async () => {
      const updatedDependency = {
        id: 'dep-1',
        project_id: 'proj-1'
      };

      mockReq.params = { id: 'dep-1' };
      mockReq.body = {}; // Empty body

      mockQuery.returning.mockResolvedValue([updatedDependency]);

      await controller.update(mockReq as Request, mockRes as Response);

      expect(mockQuery.update).toHaveBeenCalledWith(expect.objectContaining({
        updated_at: expect.any(Date)
      }));
      expect(mockRes.json).toHaveBeenCalledWith(updatedDependency);
    });
  });
});