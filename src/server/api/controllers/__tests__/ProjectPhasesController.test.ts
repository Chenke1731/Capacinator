import { ProjectPhasesController } from '../ProjectPhasesController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

// Mock date validation utilities
jest.mock('../../../utils/dateValidation', () => ({
  validateDateRange: jest.fn((start, end) => ({
    isValid: new Date(start) < new Date(end),
    error: new Date(start) >= new Date(end) ? 'Start date must be before end date' : null,
    startDate: new Date(start),
    endDate: new Date(end)
  })),
  formatDateForDB: jest.fn((date) => {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    return date;
  })
}));

// Mock audit middleware
jest.mock('../../../middleware/enhancedAuditMiddleware', () => ({
  auditModelChanges: jest.fn().mockResolvedValue(undefined)
}));

describe('ProjectPhasesController', () => {
  let controller: ProjectPhasesController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new ProjectPhasesController();

    // Create mock request
    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logAuditEvent: jest.fn().mockResolvedValue(undefined),
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }
    };

    // Create mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Create mock database
    mockDb = createMockDb();
    (controller as any).db = mockDb;

    // Mock transaction support
    mockDb.transaction = jest.fn().mockImplementation(async (callback) => {
      return await callback(mockDb);
    });

    mockDb._reset();
  });

  describe('getAll - List Project Phases', () => {
    it('returns all project phases without pagination', async () => {
      const mockPhases = [
        {
          id: 'phase-1',
          project_id: 'proj-1',
          phase_id: 'phase-def-1',
          project_name: 'Project Alpha',
          phase_name: 'Planning',
          phase_order: 1,
          is_custom_phase: 0,
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        }
      ];

      mockDb._setQueryResult(mockPhases);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        data: mockPhases
      });
    });

    it('returns paginated project phases when page/limit provided', async () => {
      mockReq.query = { page: '1', limit: '10' };

      const mockPhases = [
        {
          id: 'phase-1',
          project_id: 'proj-1',
          phase_id: 'phase-def-1',
          project_name: 'Project Alpha',
          phase_name: 'Planning'
        }
      ];

      // Mock main query result
      mockDb._setQueryResult(mockPhases);

      // Mock count query - set count result that will be used by .first()
      mockDb._setCountResult(1);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        data: mockPhases,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      });
    });

    it('filters by project_id', async () => {
      mockReq.query = { project_id: 'proj-123' };

      mockDb._setQueryResult([]);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.where).toHaveBeenCalledWith('project_phases_timeline.project_id', 'proj-123');
    });

    it('filters by phase_id', async () => {
      mockReq.query = { phase_id: 'phase-456' };

      mockDb._setQueryResult([]);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.where).toHaveBeenCalledWith('project_phases_timeline.phase_id', 'phase-456');
    });

    it('orders by project name and phase order when not paginated', async () => {
      mockDb._setQueryResult([]);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });

  describe('getById - Get Single Project Phase', () => {
    it('returns project phase by id', async () => {
      mockReq.params = { id: 'phase-1' };

      const mockPhase = {
        id: 'phase-1',
        project_id: 'proj-1',
        phase_id: 'phase-def-1',
        project_name: 'Project Alpha',
        phase_name: 'Planning',
        phase_order: 1,
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };

      mockDb._setFirstResult(mockPhase);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        data: mockPhase
      });
    });

    it('returns 404 when project phase not found', async () => {
      mockReq.params = { id: 'nonexistent' };

      mockDb._setFirstResult(null);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('create - Create Project Phase', () => {
    beforeEach(() => {
      mockReq.body = {
        project_id: 'proj-1',
        phase_id: 'phase-def-1',
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };
    });

    it('creates project phase successfully', async () => {
      // Mock project lookup
      mockDb._queueFirstResult({ id: 'proj-1', name: 'Project Alpha' });

      // Mock phase lookup
      mockDb._queueFirstResult({ id: 'phase-def-1', name: 'Planning' });

      // Mock duplicate check
      mockDb._queueFirstResult(null);

      // Mock insert
      mockDb._queueInsertResult([{
        id: 'new-phase-1',
        ...mockReq.body
      }]);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'new-phase-1'
        })
      });
    });

    it('returns 404 when project not found', async () => {
      // Mock project lookup (not found)
      mockDb._setFirstResult(null);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project not found'
      });
    });

    it('returns 404 when phase definition not found', async () => {
      // Mock project lookup (found)
      mockDb._queueFirstResult({ id: 'proj-1' });

      // Mock phase lookup (not found)
      mockDb._setFirstResult(null);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phase not found'
      });
    });

    it('returns 400 when dates are invalid', async () => {
      mockReq.body.start_date = '2025-01-31';
      mockReq.body.end_date = '2025-01-01'; // End before start

      // Mock project lookup
      mockDb._queueFirstResult({ id: 'proj-1' });

      // Mock phase lookup
      mockDb._queueFirstResult({ id: 'phase-def-1' });

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('before end date')
      });
    });

    it('returns 409 when phase already exists for project', async () => {
      // Mock project lookup
      mockDb._queueFirstResult({ id: 'proj-1' });

      // Mock phase lookup
      mockDb._queueFirstResult({ id: 'phase-def-1' });

      // Mock duplicate check (found existing)
      mockDb._setFirstResult({ id: 'existing-phase', ...mockReq.body });

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phase already exists for this project',
        existing: expect.any(Object)
      });
    });
  });

  describe('update - Update Project Phase', () => {
    beforeEach(() => {
      mockReq.params = { id: 'phase-1' };
      mockReq.body = {
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      };
    });

    it('updates project phase dates successfully', async () => {
      const currentPhase = {
        id: 'phase-1',
        project_id: 'proj-1',
        phase_id: 'phase-def-1',
        phase_name: 'Planning',
        is_custom_phase: 0,
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };

      // Mock fetch current phase
      mockDb._queueFirstResult(currentPhase);

      // Mock update operation (returns affected rows)
      mockDb._queueUpdateResult([1]);

      // Mock fetch updated phase
      mockDb._queueFirstResult({
        ...currentPhase,
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      });

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          start_date: '2025-02-01',
          end_date: '2025-02-28'
        })
      });
    });

    it('returns 404 when project phase not found', async () => {
      mockDb._setFirstResult(null);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when updated dates are invalid', async () => {
      mockReq.body = {
        start_date: '2025-02-28',
        end_date: '2025-02-01' // End before start
      };

      const currentPhase = {
        id: 'phase-1',
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };

      mockDb._setFirstResult(currentPhase);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('allows updating custom phase name', async () => {
      mockReq.body = {
        phase_name: 'Updated Custom Phase Name',
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      };

      const currentPhase = {
        id: 'phase-1',
        project_id: 'proj-1',
        phase_id: 'phase-def-custom',
        phase_name: 'Custom Phase',
        is_custom_phase: 1, // Custom phase
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };

      // Mock fetch current phase (custom)
      mockDb._queueFirstResult(currentPhase);

      // Mock timeline update
      mockDb._queueUpdateResult([1]);

      // Mock phase name update
      mockDb._queueUpdateResult([1]);

      // Mock fetch updated phase
      mockDb._queueFirstResult({
        ...currentPhase,
        phase_name: 'Updated Custom Phase Name',
        start_date: '2025-02-01',
        end_date: '2025-02-28'
      });

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledTimes(2); // Timeline + phase name
    });

    it('returns 400 when no valid fields to update', async () => {
      mockReq.body = {
        invalid_field: 'value'
      };

      const currentPhase = {
        id: 'phase-1',
        is_custom_phase: 0
      };

      mockDb._setFirstResult(currentPhase);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('No valid fields to update')
      });
    });
  });

  describe('delete - Delete Project Phase', () => {
    beforeEach(() => {
      mockReq.params = { id: 'phase-1' };
    });

    it('deletes project phase successfully', async () => {
      const existingPhase = {
        id: 'phase-1',
        project_id: 'proj-1',
        phase_id: 'phase-def-1'
      };

      // Mock fetch existing record
      mockDb._queueFirstResult(existingPhase);

      // Mock delete operation
      mockDb._setDeleteResult(1); // del() returns count directly

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Project phase deleted successfully'
      });
    });

    it('returns 404 when project phase not found', async () => {
      mockDb._setFirstResult(null);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 when delete count is zero', async () => {
      const existingPhase = {
        id: 'phase-1'
      };

      // Mock fetch existing record
      mockDb._queueFirstResult(existingPhase);

      // Mock delete operation (returns 0)
      mockDb._queueUpdateResult([0]);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('bulkUpdate - Bulk Update Phases', () => {
    beforeEach(() => {
      mockReq.body = {
        updates: [
          {
            id: 'phase-1',
            start_date: '2025-02-01',
            end_date: '2025-02-28'
          },
          {
            id: 'phase-2',
            start_date: '2025-03-01',
            end_date: '2025-03-31'
          }
        ]
      };
    });

    it('updates multiple phases successfully', async () => {
      // Mock transaction callback
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock existing record for phase-1
        mockDb._queueFirstResult({ id: 'phase-1', start_date: '2025-01-01', end_date: '2025-01-31' });
        // Mock update for phase-1 (update().returning() returns array)
        mockDb._queueUpdateResult([{ id: 'phase-1', start_date: '2025-02-01', end_date: '2025-02-28' }]);

        // Mock existing record for phase-2
        mockDb._queueFirstResult({ id: 'phase-2', start_date: '2025-01-01', end_date: '2025-01-31' });
        // Mock update for phase-2
        mockDb._queueUpdateResult([{ id: 'phase-2', start_date: '2025-03-01', end_date: '2025-03-31' }]);

        return await callback(mockDb);
      });

      await controller.bulkUpdate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        updated: expect.arrayContaining([
          expect.objectContaining({ id: 'phase-1' }),
          expect.objectContaining({ id: 'phase-2' })
        ]),
        failed: []
      });
    });

    it('reports failures for invalid dates', async () => {
      mockReq.body.updates = [
        {
          id: 'phase-1',
          start_date: '2025-02-28',
          end_date: '2025-02-01' // Invalid: end before start
        }
      ];

      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        return await callback(mockDb);
      });

      await controller.bulkUpdate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        updated: [],
        failed: expect.arrayContaining([
          expect.objectContaining({
            id: 'phase-1',
            error: 'Start date must be before end date'
          })
        ])
      });
    });

    it('reports failures for non-existent phases', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock existing record lookup (not found)
        mockDb._queueFirstResult(null);
        mockDb._queueFirstResult(null);

        return await callback(mockDb);
      });

      await controller.bulkUpdate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        updated: [],
        failed: expect.arrayContaining([
          expect.objectContaining({
            error: 'Project phase not found'
          })
        ])
      });
    });

    it('continues processing after individual failures', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock phase-1 (not found - will fail)
        mockDb._queueFirstResult(null);

        // Mock phase-2 (found - will succeed)
        mockDb._queueFirstResult({ id: 'phase-2', start_date: '2025-01-01', end_date: '2025-01-31' });
        mockDb._queueUpdateResult([{ id: 'phase-2', start_date: '2025-03-01', end_date: '2025-03-31' }]);

        return await callback(mockDb);
      });

      await controller.bulkUpdate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        updated: expect.arrayContaining([
          expect.objectContaining({ id: 'phase-2' })
        ]),
        failed: expect.arrayContaining([
          expect.objectContaining({ id: 'phase-1' })
        ])
      });
    });
  });

  describe('duplicatePhase - Duplicate Phase', () => {
    beforeEach(() => {
      mockReq.body = {
        project_id: 'proj-1',
        source_phase_id: 'phase-source',
        target_phase_id: 'phase-target',
        start_date: '2025-03-01',
        end_date: '2025-03-31',
        custom_name: 'Duplicated Phase'
      };
    });

    it('duplicates phase with allocations successfully', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock source phase lookup
        mockDb._queueFirstResult({ id: 'source-timeline-1', project_id: 'proj-1', phase_id: 'phase-source' });

        // Mock existing target check
        mockDb._queueFirstResult(null);

        // Mock new phase timeline insert
        mockDb._queueInsertResult([{ id: 'new-timeline-1', project_id: 'proj-1', phase_id: 'phase-target' }]);

        // Mock source allocations query
        mockDb._queueQueryResult([
          { id: 'alloc-1', project_id: 'proj-1', phase_id: 'phase-source', role_id: 'role-1', allocation_percentage: 50 }
        ]);

        // Mock allocation insert
        mockDb._queueInsertResult([{ id: 'new-alloc-1', phase_id: 'phase-target', role_id: 'role-1' }]);

        // Mock source demand overrides query
        mockDb._queueQueryResult([
          { id: 'demand-1', project_id: 'proj-1', phase_id: 'phase-source', role_id: 'role-1', demand_hours: 100 }
        ]);

        // Mock demand override insert
        mockDb._queueInsertResult([{ id: 'new-demand-1', phase_id: 'phase-target' }]);

        // Mock phase details lookup
        mockDb._queueFirstResult({ id: 'phase-target', name: 'Target Phase' });

        return await callback(mockDb);
      });

      await controller.duplicatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          timeline: expect.any(Object),
          allocations_copied: 1,
          demand_overrides_copied: 1
        })
      });
    });

    it('returns 400 when required fields missing', async () => {
      mockReq.body = {
        project_id: 'proj-1'
        // Missing other required fields
      };

      await controller.duplicatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Missing required fields')
      });
    });

    it('returns 400 when dates are invalid', async () => {
      mockReq.body.start_date = '2025-03-31';
      mockReq.body.end_date = '2025-03-01'; // End before start

      await controller.duplicatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Start date must be before end date'
      });
    });

    it('returns 404 when source phase not found', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock source phase lookup (not found)
        mockDb._setFirstResult(null);

        return await callback(mockDb);
      });

      await controller.duplicatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Source phase not found for this project'
      });
    });

    it('returns 409 when target phase already exists', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock source phase lookup (found)
        mockDb._queueFirstResult({ id: 'source-timeline-1' });

        // Mock existing target check (found)
        mockDb._setFirstResult({ id: 'existing-target' });

        return await callback(mockDb);
      });

      await controller.duplicatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Target phase already exists for this project',
        existing: expect.any(Object)
      });
    });
  });

  describe('createCustomPhase - Create Custom Phase', () => {
    beforeEach(() => {
      mockReq.body = {
        project_id: 'proj-1',
        phase_name: 'Custom Analysis Phase',
        description: 'Special analysis phase',
        start_date: '2025-04-01',
        end_date: '2025-04-30',
        order_index: 5
      };
    });

    it('creates custom phase successfully', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock project lookup
        mockDb._queueFirstResult({ id: 'proj-1', name: 'Project Alpha' });

        // Mock new phase insert
        mockDb._queueInsertResult([{
          id: 'new-phase-def-1',
          name: 'Custom Analysis Phase (Project: Project Alpha)',
          order_index: 5
        }]);

        // Mock phase timeline insert
        mockDb._queueInsertResult([{
          id: 'new-timeline-1',
          project_id: 'proj-1',
          phase_id: 'new-phase-def-1'
        }]);

        return await callback(mockDb);
      });

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phase: expect.any(Object),
          timeline: expect.any(Object),
          message: expect.stringContaining('Custom phase created successfully')
        })
      });
    });

    it('returns 400 when required fields missing', async () => {
      mockReq.body = {
        project_id: 'proj-1'
        // Missing other required fields
      };

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Missing required fields')
      });
    });

    it('returns 400 when dates are invalid', async () => {
      mockReq.body.start_date = '2025-04-30';
      mockReq.body.end_date = '2025-04-01'; // End before start

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Start date must be before end date'
      });
    });

    it('returns 404 when project not found', async () => {
      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock project lookup (not found)
        mockDb._setFirstResult(null);

        return await callback(mockDb);
      });

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project not found'
      });
    });

    it('uses default order_index when not provided', async () => {
      delete mockReq.body.order_index;

      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        // Mock project lookup
        mockDb._queueFirstResult({ id: 'proj-1', name: 'Project Alpha' });

        // Mock new phase insert
        mockDb._queueInsertResult([{ id: 'new-phase-def-1', order_index: 99 }]);

        // Mock phase timeline insert
        mockDb._queueInsertResult([{ id: 'new-timeline-1' }]);

        return await callback(mockDb);
      });

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.order_index).toBe(99);
    });

    it('I01w：显式 order_index=0 保留（零序合法，旧 || 99 会吞成尾序）', async () => {
      mockReq.body.order_index = 0;

      mockDb.transaction.mockImplementationOnce(async (callback: (db: unknown) => Promise<unknown>) => {
        mockDb._queueFirstResult({ id: 'proj-1', name: 'Project Alpha' });
        mockDb._queueInsertResult([{ id: 'new-phase-def-1', order_index: 0 }]);
        mockDb._queueInsertResult([{ id: 'new-timeline-1' }]);
        return await callback(mockDb);
      });

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.order_index).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('handles database errors in getAll', async () => {
      mockDb.join = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles errors in transactions', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        phase_name: 'Test',
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };

      mockDb.transaction.mockRejectedValueOnce(new Error('Transaction failed'));

      await controller.createCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
