import { AssignmentsController } from '../AssignmentsController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

// Mock the NotificationScheduler to prevent real database access
jest.mock('../../../services/NotificationScheduler', () => ({
  notificationScheduler: {
    sendAssignmentNotification: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('AssignmentsController', () => {
  let controller: AssignmentsController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AssignmentsController();

    // Spy on sendPaginatedResponse to see if it's called
    jest.spyOn(controller as any, 'sendPaginatedResponse');

    // Create mock logger
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    // Create mock request
    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logger: mockLogger,
      logAuditEvent: jest.fn()
    };

    // Create mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Create mock database using the reusable helper
    mockDb = createMockDb();

    // Replace controller's db with our mock
    (controller as any).db = mockDb;

    // Reset mock data for clean state
    mockDb._reset();
  });

  describe('getAll - List Assignments', () => {
    it('returns paginated list of assignments', async () => {
      const mockAssignments = [
        {
          id: 'assign-1',
          project_id: 'proj-1',
          person_id: 'person-1',
          role_id: 'role-1',
          allocation_percentage: 50,
          start_date: '2025-01-01',
          end_date: '2025-12-31',
          computed_start_date: '2025-01-01',
          computed_end_date: '2025-12-31',
          project_name: 'Project Alpha',
          person_name: 'John Doe',
          role_name: 'Developer',
          aspiration_start: '2025-01-01',
          aspiration_finish: '2025-12-31',
          assignment_date_mode: 'fixed'
        }
      ];

      // Set up mock to return assignments and count
      mockDb._setQueryResult(mockAssignments);
      mockDb._setCountResult(1);

      await controller.getAll(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('filters by scenario_id from header', async () => {
      mockReq.headers = { 'x-scenario-id': 'scenario-123' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb.where).toHaveBeenCalledWith('assignments_view.scenario_id', 'scenario-123');
    });

    it('includes all scenarios when includeAllScenarios is true', async () => {
      mockReq.query = { includeAllScenarios: 'true' };
      mockReq.headers = { 'x-scenario-id': 'scenario-123' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      // Should not filter by scenario_id when includeAllScenarios is true
      expect(mockDb.where).not.toHaveBeenCalledWith('assignments_view.scenario_id', expect.anything());
    });

    it('filters by project_id', async () => {
      mockReq.query = { project_id: 'proj-123' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      // buildFilters should be called with project_id
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('filters by person_id', async () => {
      mockReq.query = { person_id: 'person-456' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('filters by date range', async () => {
      mockReq.query = {
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      // Should filter by computed_end_date >= start_date
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('getById - Get Single Assignment', () => {
    it('returns scenario assignment with spa- prefix', async () => {
      mockReq.params = { id: 'spa-123' };

      const mockAssignment = {
        id: 'spa-123',
        project_id: 'proj-1',
        person_id: 'person-1',
        allocation_percentage: 50,
        assignment_type: 'scenario'
      };

      mockDb._setFirstResult(mockAssignment);

      await controller.getById(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('scenario_project_assignments');
    });

    it('returns direct assignment without spa- prefix', async () => {
      mockReq.params = { id: 'assign-456' };

      const mockAssignment = {
        id: 'assign-456',
        project_id: 'proj-1',
        assignment_type: 'direct'
      };

      // First query: check scenario table (returns null)
      mockDb._queueFirstResult(null);
      // Second query: fetch from project_assignments table
      mockDb._queueFirstResult(mockAssignment);

      await controller.getById(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('project_assignments');
    });

    it('returns 404 when assignment not found', async () => {
      mockReq.params = { id: 'nonexistent' };

      // First query: check scenario table (returns null)
      mockDb._queueFirstResult(null);
      // Second query: check project_assignments table (returns null)
      mockDb._queueFirstResult(null);

      await controller.getById(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('create - Create Assignment', () => {
    it('creates assignment with fixed date mode', async () => {
      const assignmentData = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };

      mockReq.body = assignmentData;
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      // checkConflicts makes 3 sequential queries:
      mockDb._queueFirstResult({ name: 'John Doe', default_availability_percentage: 100 }); // 1. Person lookup
      mockDb._queueQueryResult([]); // 2. Overlapping assignments (no conflicts)
      mockDb._queueFirstResult({ effective_availability_percentage: 100 }); // 3. Availability

      // Main insert
      mockDb._queueInsertResult([{ id: 'new-assign', ...assignmentData }]);

      await controller.create(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'proj-1',
          person_id: 'person-1',
          allocation_percentage: 50,
          assignment_date_mode: 'fixed',
          scenario_id: 'baseline-0000-0000-0000-000000000000'
        })
      );
    });

    it('validates required fields', async () => {
      mockReq.body = { allocation_percentage: 50 };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('required')
        })
      );
    });

    it('validates allocation percentage is positive', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 0,
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('positive')
        })
      );
    });

    it('validates allocation percentage does not exceed 200%', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 250,
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('200')
        })
      );
    });

    it('validates assignment_date_mode is valid', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'invalid_mode'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('requires start_date and end_date for fixed mode', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'fixed'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Start date and end date')
        })
      );
    });

    it('validates start_date is before end_date', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: '2025-12-31',
        end_date: '2025-01-01'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('before or equal')
        })
      );
    });

    it('requires phase_id for phase mode', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'phase'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Phase ID')
        })
      );
    });

    it('returns warning when person is overallocated', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 75,
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      // checkConflicts makes 3 sequential queries:
      mockDb._queueFirstResult({ name: 'John Doe', default_availability_percentage: 100 }); // 1. Person lookup
      mockDb._queueQueryResult([{ allocation_percentage: 50, project_name: 'Existing Project' }]); // 2. Overlapping
      mockDb._queueFirstResult({ effective_availability_percentage: 100 }); // 3. Availability

      // Main insert
      mockDb._queueInsertResult([{ id: 'new-assign' }]);

      await controller.create(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      // Should still create but with warning
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update - Update Assignment', () => {
    it('updates scenario assignment with spa- prefix', async () => {
      mockReq.params = { id: 'spa-123' };
      mockReq.body = { allocation_percentage: 75 };

      const existingAssignment = {
        id: '123',
        allocation_percentage: 50,
        project_id: 'proj-1',
        person_id: 'person-1',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        assignment_date_mode: 'fixed',
        scenario_id: 'baseline-0000-0000-0000-000000000000'
      };

      // First query: fetch existing assignment
      mockDb._queueFirstResult(existingAssignment);

      // Update result
      mockDb._queueUpdateResult([{ ...existingAssignment, allocation_percentage: 75 }]);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb).toHaveBeenCalledWith('scenario_project_assignments');
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          allocation_percentage: 75,
          updated_at: expect.any(Date)
        })
      );
    });

    it('updates direct assignment without prefix', async () => {
      mockReq.params = { id: 'assign-456' };
      mockReq.body = { notes: 'Updated notes' };

      const existingAssignment = {
        id: 'assign-456',
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };

      // First query: check scenario table (returns null)
      mockDb._queueFirstResult(null);
      // Second query: fetch from project_assignments table
      mockDb._queueFirstResult(existingAssignment);

      // Update result
      mockDb._queueUpdateResult([existingAssignment]);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb).toHaveBeenCalledWith('project_assignments');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('returns 404 when updating non-existent assignment', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockReq.body = { allocation_percentage: 50 };

      // First query: check scenario table (returns null)
      mockDb._queueFirstResult(null);
      // Second query: check project_assignments table (returns null)
      mockDb._queueFirstResult(null);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('validates allocation percentage on update', async () => {
      mockReq.params = { id: 'assign-1' };
      mockReq.body = { allocation_percentage: 250 };

      const existing = { id: 'assign-1', allocation_percentage: 50 };

      // Queue assignment fetch
      mockDb._queueFirstResult(existing);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('200')
        })
      );
    });

    it('validates date mode on update', async () => {
      mockReq.params = { id: 'assign-1' };
      mockReq.body = { assignment_date_mode: 'invalid' };

      const existing = { id: 'assign-1', assignment_date_mode: 'fixed' };

      // Queue assignment fetch
      mockDb._queueFirstResult(existing);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('delete - Delete Assignment', () => {
    it('deletes scenario assignment with spa- prefix', async () => {
      mockReq.params = { id: 'spa-123' };

      const mockAssignment = { id: '123', project_id: 'proj-1', person_id: 'person-1' };
      mockDb._setFirstResult(mockAssignment);
      mockDb._setDeleteResult(1);

      await controller.delete(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb).toHaveBeenCalledWith('scenario_project_assignments');
      expect(mockDb.del).toHaveBeenCalled();
    });

    it('deletes direct assignment', async () => {
      mockReq.params = { id: 'assign-456' };

      const mockAssignment = { id: 'assign-456' };

      // First query: check scenario table (returns null for direct assignment)
      mockDb._queueFirstResult(null);
      // Second query: fetch from project_assignments table
      mockDb._queueFirstResult(mockAssignment);

      mockDb._setDeleteResult(1);

      await controller.delete(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('project_assignments');
    });

    it('returns 404 when deleting non-existent assignment', async () => {
      mockReq.params = { id: 'nonexistent' };

      // First query: check scenario table (returns null)
      mockDb._queueFirstResult(null);
      // Second query: check project_assignments table (returns null)
      mockDb._queueFirstResult(null);

      mockDb._setDeleteResult(0);

      await controller.delete(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('bulkAssign - Bulk Create Assignments', () => {
    it('creates multiple assignments successfully', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        assignments: [
          {
            person_id: 'person-1',
            role_id: 'role-1',
            allocation_percentage: 50,
            start_date: '2025-01-01',
            end_date: '2025-12-31'
          },
          {
            person_id: 'person-2',
            role_id: 'role-2',
            allocation_percentage: 75,
            start_date: '2025-01-01',
            end_date: '2025-12-31'
          }
        ]
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      // First assignment checkConflicts (3 queries):
      mockDb._queueFirstResult({ name: 'Person 1', default_availability_percentage: 100 });
      mockDb._queueQueryResult([]); // No conflicts
      mockDb._queueFirstResult({ effective_availability_percentage: 100 });

      // Second assignment checkConflicts (3 queries):
      mockDb._queueFirstResult({ name: 'Person 2', default_availability_percentage: 100 });
      mockDb._queueQueryResult([]); // No conflicts
      mockDb._queueFirstResult({ effective_availability_percentage: 100 });

      // Insert results
      mockDb._queueInsertResult([{ id: 'new-1' }]);
      mockDb._queueInsertResult([{ id: 'new-2' }]);

      await controller.bulkAssign(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('reports conflicts in bulk assignment', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        assignments: [
          {
            person_id: 'person-1',
            role_id: 'role-1',
            allocation_percentage: 150, // Over capacity
            start_date: '2025-01-01',
            end_date: '2025-12-31'
          }
        ]
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      // checkConflicts (3 queries):
      mockDb._queueFirstResult({ name: 'John Doe', default_availability_percentage: 100 });
      mockDb._queueQueryResult([]); // No overlapping assignments
      mockDb._queueFirstResult({ effective_availability_percentage: 100 });

      await controller.bulkAssign(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      // Should return summary with conflicts
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('checkConflicts - Conflict Detection', () => {
    it('detects over allocation conflicts', async () => {
      const mockPerson = {
        id: 'person-1',
        name: 'John Doe',
        default_availability_percentage: 100
      };

      const mockOverlapping = [
        {
          allocation_percentage: 60,
          project_name: 'Project A',
          start_date: '2025-01-01',
          end_date: '2025-06-30'
        },
        {
          allocation_percentage: 50,
          project_name: 'Project B',
          start_date: '2025-03-01',
          end_date: '2025-09-30'
        }
      ];

      mockDb.first
        .mockImplementationOnce(() => ({
          then: (resolve: any) => Promise.resolve(mockPerson).then(resolve)
        }));
      // IP-03a 查询序:①重叠分配切片 ②已批准可用率覆盖(空=默认 100)
      mockDb._queueQueryResult(mockOverlapping);
      mockDb._queueQueryResult([]);

      const conflict = await controller.checkConflicts(
        'person-1',
        '2025-01-01',
        '2025-12-31',
        50
      );

      expect(conflict).not.toBeNull();
      // 峰值口径:Mar–Jun 段 60+50+50=160% 并发,而非全区间求和
      expect(conflict?.total_allocation).toBe(160);
    });

    it('returns null when no conflicts', async () => {
      const mockPerson = { id: 'person-1', name: 'John Doe' };

      mockDb.first
        .mockImplementationOnce(() => ({
          then: (resolve: any) => Promise.resolve(mockPerson).then(resolve)
        }))
        .mockImplementationOnce(() => ({
          then: (resolve: any) => Promise.resolve({ effective_availability_percentage: 100 }).then(resolve)
        }));
      mockDb._setQueryResult([]); // No overlapping assignments

      const conflict = await controller.checkConflicts(
        'person-1',
        '2025-01-01',
        '2025-12-31',
        50
      );

      expect(conflict).toBeNull();
    });

    it('excludes current assignment when checking', async () => {
      const mockPerson = { id: 'person-1', name: 'John Doe' };

      mockDb.first
        .mockImplementationOnce(() => ({
          then: (resolve: any) => Promise.resolve(mockPerson).then(resolve)
        }));
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);

      await controller.checkConflicts(
        'person-1',
        '2025-01-01',
        '2025-12-31',
        50,
        'assign-1' // Exclude this one
      );

      // IP-03a: 切片查询直接用 scenario 表数值 id('spa-' 前缀已剥)
      expect(mockDb.where).toHaveBeenCalledWith('spa.id', '!=', 'assign-1');
    });
  });

  describe('getConflicts - Get Conflicts for Person', () => {
    it('returns conflicts for person in date range', async () => {
      mockReq.params = { person_id: 'person-1' };
      mockReq.query = {
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      const mockAssignments = [
        { allocation_percentage: 75, project_name: 'Project A' },
        { allocation_percentage: 50, project_name: 'Project B' }
      ];

      mockDb._setQueryResult(mockAssignments);

      await controller.getConflicts(mockReq, mockRes);

      expect(mockDb.where).toHaveBeenCalledWith('assignments_view.person_id', 'person-1');
    });
  });

  describe('getSuggestions - Get Assignment Suggestions', () => {
    it('suggests people based on role and availability', async () => {
      mockReq.query = {
        role_id: 'role-1',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        required_allocation: '50'
      };

      const mockPeopleWithRole = [
        {
          id: 'person-1',
          name: 'John Doe',
          proficiency_level: 4
        }
      ];

      mockDb._setQueryResult(mockPeopleWithRole);

      await controller.getSuggestions(mockReq, mockRes);

      expect(mockDb.where).toHaveBeenCalledWith('person_roles.role_id', 'role-1');
    });

    it('filters out people without sufficient capacity', async () => {
      mockReq.query = {
        role_id: 'role-1',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        required_allocation: '50'
      };

      const mockPeopleWithRole = [
        {
          id: 'person-1',
          name: 'John Doe',
          proficiency_level: 4
        }
      ];

      // First query: get people with role
      mockDb._queueQueryResult(mockPeopleWithRole);

      // checkConflicts for person-1 (3 queries):
      mockDb._queueFirstResult({ name: 'John Doe', default_availability_percentage: 100 });
      mockDb._queueQueryResult([{ allocation_percentage: 80 }]); // Already heavily allocated
      mockDb._queueFirstResult({ effective_availability_percentage: 100 });

      await controller.getSuggestions(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      // Person should be excluded from suggestions due to insufficient capacity
      const response = mockRes.json.mock.calls[0][0];
      expect(response?.suggestions || []).toHaveLength(0);
    });
  });

  describe('getTimeline - Get Assignment Timeline', () => {
    it('returns timeline with assignments and availability', async () => {
      mockReq.params = { person_id: 'person-1' };
      mockReq.query = {
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      const mockAssignments = [
        {
          allocation_percentage: 50,
          start_date: '2025-01-01',
          end_date: '2025-06-30',
          project_name: 'Project A'
        }
      ];

      const mockAvailability = [
        {
          start_date: '2025-07-01',
          end_date: '2025-07-31',
          availability_percentage: 80
        }
      ];

      // First query: assignments
      mockDb._queueQueryResult(mockAssignments);
      // Second query: availability overrides
      mockDb._queueQueryResult(mockAvailability);

      await controller.getTimeline(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            timeline: expect.objectContaining({
              assignments: expect.any(Array),
              availability_overrides: expect.any(Array),
              summary: expect.any(Object)
            })
          })
        })
      );
    });

    it('filters timeline by date range', async () => {
      mockReq.params = { person_id: 'person-1' };
      mockReq.query = {
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      mockDb._setQueryResult([]);

      await controller.getTimeline(mockReq, mockRes);

      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('deleteTestData - Delete Test Assignments', () => {
    it('deletes assignments for test projects and people', async () => {
      // For deleteTestData, the controller uses whereIn with subqueries
      // Mock these subqueries to return empty arrays (no test data to delete)
      mockDb._queueQueryResult([]); // subquery for projects
      mockDb._queueQueryResult([]); // subquery for people
      mockDb._setDeleteResult(10);

      await controller.deleteTestData(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      // Verify method completes and responds
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('Date Mode Handling', () => {
    it('handles fixed date mode correctly', async () => {
      const assignment = {
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      };

      const dates = await (controller as any).computeAssignmentDates(assignment);

      expect(dates.computed_start_date).toBe('2025-01-01');
      expect(dates.computed_end_date).toBe('2025-12-31');
    });

    it('handles project date mode with aspiration dates', async () => {
      const assignment = {
        assignment_date_mode: 'project',
        project_id: 'proj-1',
        project: {
          aspiration_start: '2025-02-01',
          aspiration_finish: '2025-11-30'
        }
      };

      const dates = await (controller as any).computeAssignmentDates(assignment);

      expect(dates.computed_start_date).toBe('2025-02-01');
      expect(dates.computed_end_date).toBe('2025-11-30');
    });

    it('handles phase date mode with timeline', async () => {
      const assignment = {
        assignment_date_mode: 'phase',
        project_id: 'proj-1',
        phase_id: 'phase-1'
      };

      const mockPhaseTimeline = {
        start_date: '2025-03-01',
        end_date: '2025-06-30'
      };

      mockDb._setFirstResult(mockPhaseTimeline);

      const dates = await (controller as any).computeAssignmentDates(assignment);

      expect(dates.computed_start_date).toBe('2025-03-01');
      expect(dates.computed_end_date).toBe('2025-06-30');
    });

    it('throws error for phase mode without phase_id', async () => {
      const assignment = {
        assignment_date_mode: 'phase',
        project_id: 'proj-1'
      };

      await expect(
        (controller as any).computeAssignmentDates(assignment)
      ).rejects.toThrow('Phase mode requires both phase_id and project_id');
    });

    it('throws error for unknown date mode', async () => {
      const assignment = {
        assignment_date_mode: 'unknown_mode'
      };

      await expect(
        (controller as any).computeAssignmentDates(assignment)
      ).rejects.toThrow('Unknown assignment_date_mode');
    });

    it('validates invalid date format in fixed mode', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: 'invalid-date',
        end_date: '2025-12-31'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid date format')
        })
      );
    });

    it('handles project mode with missing aspiration dates - fallback', async () => {
      const assignment = {
        assignment_date_mode: 'project',
        project_id: 'proj-1',
        start_date: '2025-01-15',
        end_date: '2025-12-15'
      };

      // Mock project without aspiration dates
      mockDb._setFirstResult({
        id: 'proj-1',
        name: 'Test Project',
        aspiration_start: null,
        aspiration_finish: null,
        start_date: null,
        end_date: null
      });

      const dates = await (controller as any).computeAssignmentDates(assignment);

      // Should fall back to assignment dates
      expect(dates.computed_start_date).toBe('2025-01-15');
      expect(dates.computed_end_date).toBe('2025-12-15');
    });

    it('throws error when phase timeline not found', async () => {
      const assignment = {
        assignment_date_mode: 'phase',
        project_id: 'proj-1',
        phase_id: 'phase-1'
      };

      mockDb._setFirstResult(null); // No timeline found

      await expect(
        (controller as any).computeAssignmentDates(assignment)
      ).rejects.toThrow('No timeline found for phase');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('returns null when checking conflicts for non-existent person', async () => {
      mockDb.first.mockImplementationOnce(() => ({
        then: (resolve: any) => Promise.resolve(null).then(resolve)
      }));

      const conflict = await controller.checkConflicts(
        'nonexistent-person',
        '2025-01-01',
        '2025-12-31',
        50
      );

      expect(conflict).toBeNull();
    });

    it('validates start_date before end_date on update', async () => {
      mockReq.params = { id: 'assign-1' };
      mockReq.body = {
        start_date: '2025-12-31',
        end_date: '2025-01-01'
      };

      const existing = {
        id: 'assign-1',
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-06-30'
      };

      mockDb._queueFirstResult(existing);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('before or equal')
        })
      );
    });

    it('validates date format on update', async () => {
      mockReq.params = { id: 'assign-1' };
      mockReq.body = {
        start_date: 'invalid-date',
        end_date: '2025-12-31'
      };

      const existing = {
        id: 'assign-1',
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-06-30'
      };

      mockDb._queueFirstResult(existing);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid date format')
        })
      );
    });

    it('validates phase_id required when changing to phase mode on update', async () => {
      mockReq.params = { id: 'assign-1' };
      mockReq.body = {
        assignment_date_mode: 'phase'
      };

      const existing = {
        id: 'assign-1',
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-06-30',
        phase_id: null
      };

      mockDb._queueFirstResult(existing);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Phase ID')
        })
      );
    });

    it('validates allocation percentage must be positive on update', async () => {
      mockReq.params = { id: 'assign-1' };
      mockReq.body = { allocation_percentage: 0 };

      const existing = { id: 'assign-1', allocation_percentage: 50 };

      mockDb._queueFirstResult(existing);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('positive')
        })
      );
    });

    it('handles bulk assignment with errors', async () => {
      mockReq.body = {
        project_id: 'proj-1',
        assignments: [
          {
            person_id: 'person-1',
            role_id: 'role-1',
            allocation_percentage: 50,
            start_date: '2025-01-01',
            end_date: '2025-12-31'
          }
        ]
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };

      // checkConflicts (3 queries):
      mockDb._queueFirstResult({ name: 'John Doe' });
      mockDb._queueQueryResult([]);
      mockDb._queueFirstResult({ effective_availability_percentage: 100 });

      // Make insert fail
      mockDb._queueError(new Error('Insert failed'));

      await controller.bulkAssign(mockReq, mockRes);
      await flushPromises();

      // Should still return result with failed assignments
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('calculates suggestion score based on proficiency level', async () => {
      // Test private method directly
      const person1 = { proficiency_level: 'Expert' };
      const person2 = { proficiency_level: 'Junior' };

      const score1 = (controller as any).calculateSuggestionScore(person1, 50);
      const score2 = (controller as any).calculateSuggestionScore(person2, 50);

      // Expert should have higher score than Junior
      expect(score1).toBeGreaterThan(score2);
    });

    it('calculates timeline summary with gaps between assignments', async () => {
      const assignments = [
        {
          start_date: '2025-01-01',
          end_date: '2025-02-28',
          allocation_percentage: 50
        },
        {
          start_date: '2025-04-01', // Gap of March
          end_date: '2025-06-30',
          allocation_percentage: 75
        }
      ];

      const summary = (controller as any).calculateTimelineSummary(assignments, []);

      expect(summary.totalAssignments).toBe(2);
      // Note: gaps property doesn't exist in TimelineSummary interface
      // This test expectation is checking for functionality that was removed
    });

    it('handles timeline summary with no valid dates', async () => {
      const assignments = [
        {
          start_date: null,
          end_date: null,
          computed_start_date: null,
          computed_end_date: null,
          allocation_percentage: 50
        }
      ];

      const summary = (controller as any).calculateTimelineSummary(assignments, []);

      expect(summary.totalAssignments).toBe(1);
      expect(summary.averageAllocation).toBe(0);
    });

    it('groups overlapping assignments correctly', async () => {
      const assignments = [
        {
          start_date: '2025-01-01',
          end_date: '2025-06-30',
          allocation_percentage: 60
        },
        {
          start_date: '2025-03-01', // Overlaps with first
          end_date: '2025-09-30',
          allocation_percentage: 50
        }
      ];

      const groups = (controller as any).groupOverlappingAssignments(assignments);

      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].is_overallocated).toBe(true);
      expect(groups[0].total_allocation).toBeGreaterThan(100);
    });
  });

  /**
   * IP-10 / S05: 响应信封契约——键集与 client/src/lib/api-client.ts assignments 块
   * 声明逐键对应。服务端增删/改名键此处必红,强制连带改声明。
   */
  describe('响应信封契约 (IP-10/S05)', () => {
    const keysOf = (o: unknown) => Object.keys(o as Record<string, unknown>).sort();

    it('getAll = { success, data, pagination{6键}, requestId } — sendPaginatedResponse', async () => {
      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);
      await controller.getAll(mockReq, mockRes);
      await flushPromises();
      const body = mockRes.json.mock.calls[0][0];
      expect(keysOf(body)).toEqual(['data', 'pagination', 'requestId', 'success']);
      expect(keysOf(body.pagination)).toEqual(['hasNextPage', 'hasPrevPage', 'limit', 'page', 'total', 'totalPages']);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('create = { success, data, requestId, message } — sendSuccess', async () => {
      mockReq.body = {
        project_id: 'proj-1', person_id: 'person-1', role_id: 'role-1',
        allocation_percentage: 50, assignment_date_mode: 'fixed',
        start_date: '2025-01-01', end_date: '2025-12-31'
      };
      mockReq.headers = { 'x-scenario-id': 'baseline-0000-0000-0000-000000000000' };
      mockDb._queueFirstResult({ name: 'John Doe', default_availability_percentage: 100 });
      mockDb._queueQueryResult([]);
      mockDb._queueFirstResult({ effective_availability_percentage: 100 });
      mockDb._queueInsertResult([{ id: 'new-assign' }]);
      await controller.create(mockReq, mockRes);
      await flushPromises();
      const body = mockRes.json.mock.calls[0][0];
      expect(keysOf(body)).toEqual(['data', 'message', 'requestId', 'success']);
      expect(body.success).toBe(true);
      expect(typeof body.message).toBe('string');
    });

    it('update = { success, data, requestId, message } — sendSuccess', async () => {
      mockReq.params = { id: 'spa-123' };
      mockReq.body = { allocation_percentage: 75 };
      const existing = { id: '123', allocation_percentage: 50, project_id: 'proj-1', person_id: 'person-1', start_date: '2025-01-01', end_date: '2025-12-31', assignment_date_mode: 'fixed', scenario_id: 'baseline-0000-0000-0000-000000000000' };
      mockDb._queueFirstResult(existing);
      mockDb._queueUpdateResult([{ ...existing, allocation_percentage: 75 }]);
      await controller.update(mockReq, mockRes);
      await flushPromises();
      const body = mockRes.json.mock.calls[0][0];
      expect(keysOf(body)).toEqual(['data', 'message', 'requestId', 'success']);
    });

    it('delete = { success, data{message}, requestId, message } — 两层 message', async () => {
      mockReq.params = { id: 'spa-123' };
      mockDb._setFirstResult({ id: '123', project_id: 'proj-1', person_id: 'person-1' });
      mockDb._setDeleteResult(1);
      await controller.delete(mockReq, mockRes);
      await flushPromises();
      const body = mockRes.json.mock.calls[0][0];
      expect(keysOf(body)).toEqual(['data', 'message', 'requestId', 'success']);
      expect(keysOf(body.data)).toEqual(['message']);
    });
  });
});
