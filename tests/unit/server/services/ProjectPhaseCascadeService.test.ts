import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

import { ProjectPhaseCascadeService } from '../../../../src/server/services/ProjectPhaseCascadeService';
import type { DependencyType } from '../../../../client/src/types/index';

// Mock database
const createMockDb = () => {
  const mockDb = jest.fn() as any;
  
  // Default mock implementation
  mockDb.mockImplementation((tableName: string) => {
    const query = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      first: jest.fn(),
      then: jest.fn()
    };
    return query;
  });
  
  mockDb.transaction = jest.fn(async (callback) => {
    const trx = Object.assign(mockDb, {
      commit: jest.fn(),
      rollback: jest.fn()
    });
    return callback(trx);
  });
  
  return mockDb;
};

describe('ProjectPhaseCascadeService', () => {
  let service: ProjectPhaseCascadeService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new ProjectPhaseCascadeService(mockDb);
    jest.clearAllMocks();
  });

  describe('calculateCascade', () => {
    it('should calculate cascade for Finish-to-Start dependency', async () => {
      const projectId = 'proj-1';
      const changedPhaseId = 'phase-1';
      const newStartDate = new Date('2024-01-01');
      const newEndDate = new Date('2024-01-31');

      // Mock the phases query
      const phasesQuery = {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          {
            id: 'phase-1',
            start_date: '2024-01-01',
            end_date: '2024-01-15',
            phase_name: 'Phase 1'
          },
          {
            id: 'phase-2',
            start_date: '2024-01-16',
            end_date: '2024-02-15',
            phase_name: 'Phase 2'
          }
        ])
      };

      // Mock the dependencies query
      const depsQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          {
            id: 'dep-1',
            predecessor_phase_timeline_id: 'phase-1',
            successor_phase_timeline_id: 'phase-2',
            dependency_type: 'FS' as DependencyType,
            lag_days: 0
          }
        ])
      };

      // Setup the mock returns
      mockDb.mockImplementationOnce(() => phasesQuery) // phases query
            .mockImplementationOnce(() => depsQuery);   // dependencies query

      const result = await service.calculateCascade(
        projectId,
        changedPhaseId,
        newStartDate,
        newEndDate
      );

      expect(result).toBeDefined();
      expect(result.affected_phases).toBeDefined();
      expect(Array.isArray(result.affected_phases)).toBe(true);
      expect(result.cascade_count).toBeDefined();
      expect(typeof result.cascade_count).toBe('number');
    });

    it('should handle circular dependencies gracefully', async () => {
      const projectId = 'proj-1';
      const changedPhaseId = 'phase-1';
      const newStartDate = new Date('2024-01-01');
      const newEndDate = new Date('2024-01-31');

      // Mock circular dependency scenario
      const phasesQuery = {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          {
            id: 'phase-1',
            start_date: '2024-01-01',
            end_date: '2024-01-31',
            phase_name: 'Phase 1'
          },
          {
            id: 'phase-2',
            start_date: '2024-02-01',
            end_date: '2024-02-28',
            phase_name: 'Phase 2'
          }
        ])
      };

      const depsQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          {
            id: 'dep-1',
            predecessor_phase_timeline_id: 'phase-1',
            successor_phase_timeline_id: 'phase-2',
            dependency_type: 'FS' as DependencyType,
            lag_days: 0
          },
          {
            id: 'dep-2',
            predecessor_phase_timeline_id: 'phase-2',
            successor_phase_timeline_id: 'phase-1',
            dependency_type: 'FS' as DependencyType,
            lag_days: 0
          }
        ])
      };

      mockDb.mockImplementationOnce(() => phasesQuery)
            .mockImplementationOnce(() => depsQuery);

      const result = await service.calculateCascade(
        projectId,
        changedPhaseId,
        newStartDate,
        newEndDate
      );

      expect(result).toBeDefined();
      expect(result.circular_dependencies).toBeDefined();
      expect(Array.isArray(result.circular_dependencies)).toBe(true);
    });

    it('should handle empty dependencies', async () => {
      const projectId = 'proj-1';
      const changedPhaseId = 'phase-1';
      const newStartDate = new Date('2024-01-01');
      const newEndDate = new Date('2024-01-31');

      const phasesQuery = {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          {
            id: 'phase-1',
            start_date: '2024-01-01',
            end_date: '2024-01-31',
            phase_name: 'Phase 1'
          }
        ])
      };

      const depsQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]) // No dependencies
      };

      mockDb.mockImplementationOnce(() => phasesQuery)
            .mockImplementationOnce(() => depsQuery);

      const result = await service.calculateCascade(
        projectId,
        changedPhaseId,
        newStartDate,
        newEndDate
      );

      expect(result.affected_phases).toHaveLength(0);
      expect(result.cascade_count).toBe(0);
    });
  });

  describe('applyCascade', () => {
    it('should successfully apply cascade changes', async () => {
      const projectId = 'proj-1';
      const cascadeResult = {
        affected_phases: [
          {
            phase_timeline_id: 'phase-2',
            phase_name: 'Phase 2',
            current_start_date: '2024-01-16',
            current_end_date: '2024-02-15',
            new_start_date: '2024-02-01',
            new_end_date: '2024-03-01',
            dependency_type: 'FS' as DependencyType,
            lag_days: 0,
            affects_count: 1
          }
        ],
        cascade_count: 1,
        circular_dependencies: []
      };

      const updateSpy = jest.fn().mockResolvedValue(1);
      const updateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { id: 'phase-2', phase_id: 'phase-2', start_date: '2024-01-16', end_date: '2024-02-15' }
        ]),
        update: updateSpy
      };
      const assignmentQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      };

      const trxMock: any = jest.fn((tableName: string) =>
        tableName === 'scenario_project_assignments' ? assignmentQuery : updateQuery
      );
      mockDb.mockImplementation(() => updateQuery);
      mockDb.transaction = jest.fn(async (callback: any) => callback(trxMock));

      await expect(service.applyCascade(projectId, cascadeResult))
        .resolves.not.toThrow();

      expect(updateSpy).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const projectId = 'proj-1';
      const cascadeResult = {
        affected_phases: [
          {
            phase_timeline_id: 'phase-2',
            phase_name: 'Phase 2',
            current_start_date: '2024-01-16',
            current_end_date: '2024-02-15',
            new_start_date: '2024-02-01',
            new_end_date: '2024-03-01',
            dependency_type: 'FS' as DependencyType,
            lag_days: 0,
            affects_count: 1
          }
        ],
        cascade_count: 1,
        circular_dependencies: []
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        throw new Error('Database error');
      });

      await expect(service.applyCascade(projectId, cascadeResult))
        .rejects.toThrow('Database error');
    });
  });
});