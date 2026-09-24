import { ScenariosController } from '../ScenariosController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';
import { randomUUID } from 'crypto';

// Mock the crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn()
}));

// Mock the audit middleware
jest.mock('../../../middleware/enhancedAuditMiddleware', () => ({
  auditModelChanges: jest.fn()
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

describe('ScenariosController', () => {
  let controller: ScenariosController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ScenariosController();

    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logger: mockLogger,
      logAuditEvent: jest.fn()
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    mockDb = createMockDb();
    (controller as any).db = mockDb;
    mockDb._reset();
  });

  describe('getAll - List All Scenarios', () => {
    it('retrieves all scenarios with creator and parent information', async () => {
      const mockScenarios = [
        {
          id: 'baseline-0000-0000-0000-000000000000',
          name: 'Baseline',
          description: 'Baseline scenario',
          scenario_type: 'baseline',
          status: 'active',
          created_by: 'user-1',
          created_by_name: 'John Doe',
          parent_scenario_id: null,
          parent_scenario_name: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
        {
          id: 'scenario-1',
          name: 'Q1 Planning',
          description: 'Q1 resource planning',
          scenario_type: 'branch',
          status: 'active',
          created_by: 'user-1',
          created_by_name: 'John Doe',
          parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
          parent_scenario_name: 'Baseline',
          created_at: new Date('2024-02-01'),
          updated_at: new Date('2024-02-01')
        }
      ];

      mockDb._setQueryResult(mockScenarios);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('scenarios');
      expect(mockDb.leftJoin).toHaveBeenCalledWith('people as creator', 'scenarios.created_by', 'creator.id');
      expect(mockDb.leftJoin).toHaveBeenCalledWith('scenarios as parent', 'scenarios.parent_scenario_id', 'parent.id');
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalledWith('scenarios.created_at', 'desc');
      expect(mockRes.json).toHaveBeenCalledWith(mockScenarios);
    });

    it('returns empty array when no scenarios exist', async () => {
      mockDb._setQueryResult([]);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });

  describe('getById - Get Specific Scenario', () => {
    it('retrieves scenario with child scenarios', async () => {
      mockReq.params.id = 'baseline-0000-0000-0000-000000000000';

      const mockScenario = {
        id: 'baseline-0000-0000-0000-000000000000',
        name: 'Baseline',
        description: 'Baseline scenario',
        scenario_type: 'baseline',
        status: 'active',
        created_by: 'user-1',
        created_by_name: 'John Doe',
        parent_scenario_id: null,
        parent_scenario_name: null
      };

      const mockChildren = [
        {
          id: 'scenario-1',
          name: 'Q1 Planning',
          scenario_type: 'branch',
          created_by: 'user-1',
          created_by_name: 'John Doe',
          parent_scenario_id: 'baseline-0000-0000-0000-000000000000'
        }
      ];

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult(mockChildren);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.first).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        ...mockScenario,
        child_scenarios: mockChildren
      });
    });

    it('returns 500 error when scenario not found', async () => {
      mockReq.params.id = 'nonexistent-scenario';

      mockDb._setFirstResult(null);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch scenario',
        details: undefined
      });
    });
  });

  describe('create - Create New Scenario', () => {
    beforeEach(() => {
      (randomUUID as jest.Mock).mockReturnValue('new-scenario-id');
    });

    it('creates a new baseline scenario without parent', async () => {
      mockReq.body = {
        name: 'New Baseline',
        description: 'Test baseline',
        created_by: 'user-1',
        scenario_type: 'baseline'
      };

      const mockCreatedScenario = {
        id: 'new-scenario-id',
        name: 'New Baseline',
        description: 'Test baseline',
        scenario_type: 'baseline',
        status: 'active',
        created_by: 'user-1',
        created_by_name: 'John Doe',
        parent_scenario_id: null,
        parent_scenario_name: null
      };

      mockDb._queueFirstResult(mockCreatedScenario);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockCreatedScenario);
    });

    it('creates a branch scenario from baseline parent', async () => {
      mockReq.body = {
        name: 'Q1 Branch',
        description: 'Q1 planning branch',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        created_by: 'user-1',
        scenario_type: 'branch'
      };

      const mockAssignments = [
        {
          id: 'assign-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          assignment_date_mode: 'project',
          start_date: null,
          end_date: null,
          notes: null
        }
      ];

      const mockPhases = [
        {
          id: 'phase-timeline-1',
          project_id: 'project-1',
          phase_id: 'phase-1',
          start_date: '2024-01-01',
          end_date: '2024-03-31',
          notes: null
        }
      ];

      const mockCreatedScenario = {
        id: 'new-scenario-id',
        name: 'Q1 Branch',
        description: 'Q1 planning branch',
        scenario_type: 'branch',
        status: 'active',
        created_by: 'user-1',
        created_by_name: 'John Doe',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        parent_scenario_name: 'Baseline'
      };

      // Queue responses for branchFromParent (copy assignments and phases).
      // Assignment copy unions two sources: base project_assignments AND
      // the baseline's own scenario rows (deduped by identity key).
      const mockBaselineScenarioRows = [
        {
          // same identity key as assign-1 — exercises the dedupe path
          id: 'spa-existing',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          assignment_date_mode: 'project',
          start_date: null,
          end_date: null,
          notes: null,
          base_assignment_id: 'assign-1'
        }
      ];
      mockDb._queueQueryResult(mockAssignments); // project_assignments query
      mockDb._queueQueryResult(mockBaselineScenarioRows); // baseline scenario rows query
      mockDb._queueQueryResult(mockPhases); // project_phases_timeline query
      mockDb._queueFirstResult(mockCreatedScenario); // final scenario fetch

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockCreatedScenario);
    });

    it('creates a branch scenario from parent scenario', async () => {
      mockReq.body = {
        name: 'Q2 Branch',
        description: 'Q2 planning branch',
        parent_scenario_id: 'scenario-1',
        created_by: 'user-1',
        scenario_type: 'branch'
      };

      const mockParentAssignments = [
        {
          id: 'parent-assign-1',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 60,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      const mockParentPhases = [
        {
          id: 'parent-phase-1',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          phase_id: 'phase-1',
          start_date: '2024-04-01',
          end_date: '2024-06-30',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      const mockCreatedScenario = {
        id: 'new-scenario-id',
        name: 'Q2 Branch',
        description: 'Q2 planning branch',
        scenario_type: 'branch',
        status: 'active',
        created_by: 'user-1',
        created_by_name: 'John Doe',
        parent_scenario_id: 'scenario-1',
        parent_scenario_name: 'Q1 Planning'
      };

      mockDb._queueQueryResult(mockParentAssignments);
      mockDb._queueQueryResult(mockParentPhases);
      mockDb._queueFirstResult(mockCreatedScenario);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockCreatedScenario);
    });

    it('returns 400 when name is missing', async () => {
      mockReq.body = {
        created_by: 'user-1'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Name and created_by are required'
      });
    });

    it('returns 400 when created_by is missing', async () => {
      mockReq.body = {
        name: 'Test Scenario'
      };

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Name and created_by are required'
      });
    });
  });

  describe('update - Update Scenario', () => {
    it('updates scenario name, description, and status', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        name: 'Updated Scenario',
        description: 'Updated description',
        status: 'archived'
      };

      const mockExistingScenario = {
        id: 'scenario-1',
        name: 'Original Scenario',
        description: 'Original description',
        status: 'active',
        scenario_type: 'branch',
        created_by: 'user-1'
      };

      const mockUpdatedScenario = {
        id: 'scenario-1',
        name: 'Updated Scenario',
        description: 'Updated description',
        status: 'archived',
        scenario_type: 'branch',
        created_by: 'user-1',
        created_by_name: 'John Doe',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        parent_scenario_name: 'Baseline'
      };

      mockDb._queueFirstResult(mockExistingScenario);
      mockDb._queueFirstResult(mockUpdatedScenario);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockUpdatedScenario);
    });

    it('updates only provided fields', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        name: 'New Name Only'
      };

      const mockExistingScenario = {
        id: 'scenario-1',
        name: 'Original Name',
        description: 'Keep this',
        status: 'active'
      };

      const mockUpdatedScenario = {
        id: 'scenario-1',
        name: 'New Name Only',
        description: 'Keep this',
        status: 'active',
        created_by_name: 'John Doe'
      };

      mockDb._queueFirstResult(mockExistingScenario);
      mockDb._queueFirstResult(mockUpdatedScenario);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockUpdatedScenario);
    });

    it('returns error when scenario not found', async () => {
      mockReq.params.id = 'nonexistent-scenario';
      mockReq.body = { name: 'New Name' };

      mockDb._setFirstResult(null);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Scenario not found'
      });
    });
  });

  describe('delete - Delete Scenario', () => {
    it('successfully deletes a branch scenario without children', async () => {
      mockReq.params.id = 'scenario-1';

      const mockScenario = {
        id: 'scenario-1',
        name: 'Branch Scenario',
        scenario_type: 'branch',
        status: 'active'
      };

      mockDb._queueFirstResult(mockScenario); // Initial scenario fetch

      // Mock the count query chain
      const countMock = {
        first: jest.fn().mockResolvedValue({ count: 0 })
      };
      mockDb.count = jest.fn().mockReturnValue(countMock);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('prevents deletion of baseline scenario', async () => {
      mockReq.params.id = 'baseline-0000-0000-0000-000000000000';

      const mockBaselineScenario = {
        id: 'baseline-0000-0000-0000-000000000000',
        name: 'Baseline',
        scenario_type: 'baseline',
        status: 'active'
      };

      mockDb._setFirstResult(mockBaselineScenario);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to delete scenario',
        details: undefined
      });
    });

    it('prevents deletion of scenario with child scenarios', async () => {
      mockReq.params.id = 'scenario-1';

      const mockScenario = {
        id: 'scenario-1',
        name: 'Parent Scenario',
        scenario_type: 'branch',
        status: 'active'
      };

      const mockChildCount = { count: 2 };

      mockDb._queueFirstResult(mockScenario);
      // Mock the count query chain
      const countMock = {
        first: jest.fn().mockResolvedValue(mockChildCount)
      };
      mockDb.count = jest.fn().mockReturnValue(countMock);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to delete scenario',
        details: undefined
      });
    });

    it('returns error when scenario not found', async () => {
      mockReq.params.id = 'nonexistent-scenario';

      mockDb._setFirstResult(null);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to delete scenario',
        details: undefined
      });
    });
  });

  describe('getAssignments - Get Scenario Assignments', () => {
    it('retrieves all assignments for a scenario', async () => {
      mockReq.params.id = 'scenario-1';

      const mockAssignments = [
        {
          id: 'assign-1',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          allocation_percentage: 50,
          change_type: 'added'
        },
        {
          id: 'assign-2',
          scenario_id: 'scenario-1',
          project_id: 'project-2',
          person_id: 'person-1',
          role_id: 'role-2',
          allocation_percentage: 30,
          change_type: 'modified'
        }
      ];

      mockDb._setQueryResult(mockAssignments);

      await controller.getAssignments(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('scenario_project_assignments');
      expect(mockDb.where).toHaveBeenCalledWith('scenario_id', 'scenario-1');
      expect(mockRes.json).toHaveBeenCalledWith(mockAssignments);
    });

    it('returns empty array when scenario has no assignments', async () => {
      mockReq.params.id = 'scenario-1';

      mockDb._setQueryResult([]);

      await controller.getAssignments(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });

  describe('upsertAssignment - Create/Update Assignment', () => {
    beforeEach(() => {
      (randomUUID as jest.Mock).mockReturnValue('new-assignment-id');
    });

    it('creates new assignment when none exists', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50,
        assignment_date_mode: 'project',
        change_type: 'added'
      };

      mockDb._setFirstResult(null); // No existing assignment

      await controller.upsertAssignment(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-assignment-id',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          allocation_percentage: 50
        })
      );
    });

    it('updates existing assignment', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 75,
        assignment_date_mode: 'fixed',
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        change_type: 'modified'
      };

      const mockExistingAssignment = {
        id: 'existing-assignment-id',
        scenario_id: 'scenario-1',
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        phase_id: null,
        allocation_percentage: 50,
        assignment_date_mode: 'project'
      };

      mockDb._setFirstResult(mockExistingAssignment);

      await controller.upsertAssignment(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-assignment-id',
          allocation_percentage: 75,
          assignment_date_mode: 'fixed',
          start_date: '2024-01-01',
          end_date: '2024-12-31'
        })
      );
    });

    it('returns 400 when required fields are missing', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        project_id: 'project-1'
        // Missing person_id, role_id, allocation_percentage
      };

      await controller.upsertAssignment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'project_id, person_id, role_id, and allocation_percentage are required'
      });
    });

    it('returns 400 when allocation_percentage is less than or equal to 0', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 0
      };

      await controller.upsertAssignment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'allocation_percentage must be between 1 and 100'
      });
    });

    it('returns 400 when allocation_percentage exceeds 100', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 150
      };

      await controller.upsertAssignment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'allocation_percentage must be between 1 and 100'
      });
    });
  });

  describe('removeAssignment - Remove Assignment', () => {
    it('removes assignment from scenario', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.params.assignmentId = 'assignment-1';

      const mockExistingAssignment = {
        id: 'assignment-1',
        scenario_id: 'scenario-1',
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        allocation_percentage: 50
      };

      mockDb._setFirstResult(mockExistingAssignment);

      await controller.removeAssignment(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns error when assignment not found', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.params.assignmentId = 'nonexistent-assignment';

      mockDb._setFirstResult(null);

      await controller.removeAssignment(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to remove scenario assignment',
        details: undefined
      });
    });
  });

  describe('compare - Compare Scenarios', () => {
    it('compares two scenarios and identifies differences', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query.compare_to = 'scenario-2';

      const mockScenario1 = {
        id: 'scenario-1',
        name: 'Scenario 1',
        scenario_type: 'branch'
      };

      const mockScenario2 = {
        id: 'scenario-2',
        name: 'Scenario 2',
        scenario_type: 'branch'
      };

      const mockAssignments1 = [
        {
          id: 'assign-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer'
        }
      ];

      const mockAssignments2 = [
        {
          id: 'assign-2',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 75,
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer'
        }
      ];

      const mockProjects1: unknown[] = [];
      const mockProjects2: unknown[] = [];
      const mockPhases1: unknown[] = [];
      const mockPhases2: unknown[] = [];

      // Queue responses for both scenarios
      mockDb._queueFirstResult(mockScenario1);
      mockDb._queueFirstResult(mockScenario2);
      mockDb._queueQueryResult(mockAssignments1);
      mockDb._queueQueryResult(mockAssignments2);
      mockDb._queueQueryResult(mockProjects1);
      mockDb._queueQueryResult(mockProjects2);
      mockDb._queueQueryResult(mockPhases1);
      mockDb._queueQueryResult(mockPhases2);

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario1: mockScenario1,
          scenario2: mockScenario2,
          differences: expect.objectContaining({
            assignments: expect.objectContaining({
              added: expect.any(Array),
              modified: expect.any(Array),
              removed: expect.any(Array)
            })
          }),
          metrics: expect.objectContaining({
            utilization_impact: expect.any(Object),
            capacity_impact: expect.any(Object),
            timeline_impact: expect.any(Object)
          })
        })
      );
    });

    it('returns 400 when compare_to parameter is missing', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query = {};

      await controller.compare(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'compare_to parameter is required'
      });
    });

    it('returns error when one or both scenarios not found', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query.compare_to = 'nonexistent-scenario';

      mockDb._queueFirstResult({ id: 'scenario-1', name: 'Scenario 1' });
      mockDb._queueFirstResult(null); // Second scenario not found

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to compare scenarios',
        details: undefined
      });
    });
  });

  describe('merge - Merge Scenario', () => {
    it('successfully merges scenario without conflicts', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        resolve_conflicts_as: 'use_source'
      };

      const mockScenario = {
        id: 'scenario-1',
        name: 'Branch Scenario',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        scenario_type: 'branch',
        status: 'active'
      };

      const mockConflicts: unknown[] = [];
      const mockSourceAssignments: unknown[] = [];
      const mockSourcePhases: unknown[] = [];
      const mockSourceProjects: unknown[] = [];

      mockDb._queueFirstResult(mockScenario);
      // detectMergeConflicts queries
      mockDb._queueQueryResult(mockSourceAssignments);
      mockDb._queueQueryResult(mockSourcePhases);
      mockDb._queueQueryResult(mockSourceProjects);
      // performMerge transaction queries
      mockDb._queueQueryResult([]); // scenario_merge_conflicts
      mockDb._queueQueryResult(mockSourceAssignments);
      mockDb._queueQueryResult(mockSourcePhases);
      mockDb._queueQueryResult(mockSourceProjects);

      // Mock transaction
      mockDb.transaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createMockDb();
        trx._setQueryResult([]);
        await callback(trx);
        return trx;
      });

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Scenario merged successfully'
      });
    });

    it('detects conflicts and requires manual resolution', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        resolve_conflicts_as: 'manual'
      };

      const mockScenario = {
        id: 'scenario-1',
        name: 'Branch Scenario',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        scenario_type: 'branch',
        status: 'active'
      };

      const mockSourceAssignments = [
        {
          id: 'assign-1',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 75,
          assignment_date_mode: 'project'
        }
      ];

      const mockTargetAssignment = {
        id: 'assign-target',
        scenario_id: 'baseline-0000-0000-0000-000000000000',
        project_id: 'project-1',
        person_id: 'person-1',
        role_id: 'role-1',
        phase_id: null,
        allocation_percentage: 50, // Different allocation - conflict!
        assignment_date_mode: 'project'
      };

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult(mockSourceAssignments);
      mockDb._queueQueryResult([]); // source phases
      mockDb._queueQueryResult([]); // source projects
      mockDb._queueFirstResult(mockTargetAssignment); // Conflicting assignment

      (randomUUID as jest.Mock).mockReturnValue('conflict-id-1');

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled(); // Conflict record inserted
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Merge conflicts detected. Manual resolution required.',
        conflicts: 1
      });
    });

    it('returns error when scenario has no parent', async () => {
      mockReq.params.id = 'baseline-0000-0000-0000-000000000000';
      mockReq.body = {
        resolve_conflicts_as: 'use_source'
      };

      const mockBaselineScenario = {
        id: 'baseline-0000-0000-0000-000000000000',
        name: 'Baseline',
        parent_scenario_id: null,
        scenario_type: 'baseline',
        status: 'active'
      };

      mockDb._setFirstResult(mockBaselineScenario);

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to merge scenario',
        details: undefined
      });
    });

    it('returns error when trying to merge baseline scenario', async () => {
      mockReq.params.id = 'baseline-0000-0000-0000-000000000000';
      mockReq.body = {
        resolve_conflicts_as: 'use_source'
      };

      const mockBaselineScenario = {
        id: 'baseline-0000-0000-0000-000000000000',
        name: 'Baseline',
        parent_scenario_id: 'some-parent',
        scenario_type: 'baseline',
        status: 'active'
      };

      mockDb._setFirstResult(mockBaselineScenario);

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to merge scenario',
        details: undefined
      });
    });

    it('returns error when scenario not found', async () => {
      mockReq.params.id = 'nonexistent-scenario';
      mockReq.body = {
        resolve_conflicts_as: 'use_source'
      };

      mockDb._setFirstResult(null);

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to merge scenario',
        details: undefined
      });
    });
  });

  describe('compare - Advanced Comparison Logic', () => {
    it('compares baseline scenarios with base assignments', async () => {
      mockReq.params.id = 'baseline-0000-0000-0000-000000000000';
      mockReq.query.compare_to = 'scenario-1';

      const mockBaselineScenario = {
        id: 'baseline-0000-0000-0000-000000000000',
        name: 'Baseline',
        scenario_type: 'baseline'
      };

      const mockBranchScenario = {
        id: 'scenario-1',
        name: 'Scenario 1',
        scenario_type: 'branch'
      };

      // Base project_assignments for baseline
      const mockBaseAssignments = [
        {
          id: 'base-assign-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer'
        }
      ];

      const mockScenarioAssignments: unknown[] = [];
      const mockProjects1: unknown[] = [];
      const mockProjects2: unknown[] = [];
      const mockPhases1: unknown[] = [];
      const mockPhases2: unknown[] = [];

      // Queue responses
      mockDb._queueFirstResult(mockBaselineScenario);
      mockDb._queueFirstResult(mockBranchScenario);
      // Baseline: base assignments + scenario assignments
      mockDb._queueQueryResult(mockBaseAssignments); // project_assignments for baseline
      mockDb._queueQueryResult(mockScenarioAssignments); // scenario_project_assignments for baseline
      // Branch: scenario assignments only
      mockDb._queueQueryResult([]); // scenario_project_assignments for branch
      mockDb._queueQueryResult(mockProjects1);
      mockDb._queueQueryResult(mockProjects2);
      mockDb._queueQueryResult(mockPhases1);
      mockDb._queueQueryResult(mockPhases2);

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario1: mockBaselineScenario,
          scenario2: mockBranchScenario,
          differences: expect.objectContaining({
            assignments: expect.objectContaining({
              added: expect.any(Array),
              modified: expect.any(Array),
              removed: expect.any(Array)
            })
          })
        })
      );
    });

    it('detects added assignments in comparison', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query.compare_to = 'scenario-2';

      const mockScenario1 = {
        id: 'scenario-1',
        name: 'Scenario 1',
        scenario_type: 'branch'
      };

      const mockScenario2 = {
        id: 'scenario-2',
        name: 'Scenario 2',
        scenario_type: 'branch'
      };

      // For branch scenarios, only scenario_project_assignments are used
      const mockScenarioAssignments1: unknown[] = [];
      const mockScenarioAssignments2 = [
        {
          id: 'assign-new',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer',
          change_type: 'added'
        }
      ];

      mockDb._queueFirstResult(mockScenario1);
      mockDb._queueFirstResult(mockScenario2);
      // Branch scenario 1 - scenario_project_assignments
      mockDb._queueQueryResult(mockScenarioAssignments1);
      // Branch scenario 2 - scenario_project_assignments
      mockDb._queueQueryResult(mockScenarioAssignments2);
      // Projects
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      // Phases
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      const result = mockRes.json.mock.calls[0][0];
      expect(result.differences.assignments.added).toHaveLength(1);
      expect(result.differences.assignments.added[0]).toMatchObject({
        project_id: 'project-1',
        person_id: 'person-1',
        difference: 'Added'
      });
    });

    it('detects removed assignments in comparison', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query.compare_to = 'scenario-2';

      const mockScenario1 = {
        id: 'scenario-1',
        name: 'Scenario 1',
        scenario_type: 'branch'
      };

      const mockScenario2 = {
        id: 'scenario-2',
        name: 'Scenario 2',
        scenario_type: 'branch'
      };

      const mockScenarioAssignments1 = [
        {
          id: 'assign-removed',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer',
          change_type: 'added'
        }
      ];
      const mockScenarioAssignments2: unknown[] = [];

      mockDb._queueFirstResult(mockScenario1);
      mockDb._queueFirstResult(mockScenario2);
      mockDb._queueQueryResult(mockScenarioAssignments1);
      mockDb._queueQueryResult(mockScenarioAssignments2);
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      const result = mockRes.json.mock.calls[0][0];
      expect(result.differences.assignments.removed).toHaveLength(1);
      expect(result.differences.assignments.removed[0]).toMatchObject({
        project_id: 'project-1',
        person_id: 'person-1',
        difference: 'Removed'
      });
    });

    it('detects modified assignments with date changes', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query.compare_to = 'scenario-2';

      const mockScenario1 = {
        id: 'scenario-1',
        name: 'Scenario 1',
        scenario_type: 'branch'
      };

      const mockScenario2 = {
        id: 'scenario-2',
        name: 'Scenario 2',
        scenario_type: 'branch'
      };

      const mockScenarioAssignments1 = [
        {
          id: 'assign-1',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          start_date: '2024-01-01',
          end_date: '2024-06-30',
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer',
          change_type: 'added'
        }
      ];

      const mockScenarioAssignments2 = [
        {
          id: 'assign-2',
          project_id: 'project-1',
          person_id: 'person-1',
          role_id: 'role-1',
          phase_id: null,
          allocation_percentage: 50,
          start_date: '2024-02-01', // Different start date
          end_date: '2024-07-31', // Different end date
          person_name: 'John Doe',
          project_name: 'Project A',
          role_name: 'Developer',
          change_type: 'modified'
        }
      ];

      mockDb._queueFirstResult(mockScenario1);
      mockDb._queueFirstResult(mockScenario2);
      mockDb._queueQueryResult(mockScenarioAssignments1);
      mockDb._queueQueryResult(mockScenarioAssignments2);
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      const result = mockRes.json.mock.calls[0][0];
      expect(result.differences.assignments.modified).toHaveLength(1);
      expect(result.differences.assignments.modified[0].changes.dates).toMatchObject({
        start: {
          from: '2024-01-01',
          to: '2024-02-01'
        },
        end: {
          from: '2024-06-30',
          to: '2024-07-31'
        }
      });
    });

    it('detects project differences', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.query.compare_to = 'scenario-2';

      const mockScenario1 = {
        id: 'scenario-1',
        name: 'Scenario 1',
        scenario_type: 'branch'
      };

      const mockScenario2 = {
        id: 'scenario-2',
        name: 'Scenario 2',
        scenario_type: 'branch'
      };

      const mockAssignments1: unknown[] = [];
      const mockAssignments2: unknown[] = [];

      const mockProjects1 = [
        { id: 'proj-1', project_id: 'project-1', scenario_id: 'scenario-1' }
      ];
      const mockProjects2 = [
        { id: 'proj-2', project_id: 'project-2', scenario_id: 'scenario-2' }
      ];

      const mockPhases1: unknown[] = [];
      const mockPhases2: unknown[] = [];

      mockDb._queueFirstResult(mockScenario1);
      mockDb._queueFirstResult(mockScenario2);
      mockDb._queueQueryResult(mockAssignments1);
      mockDb._queueQueryResult(mockAssignments2);
      mockDb._queueQueryResult(mockProjects1);
      mockDb._queueQueryResult(mockProjects2);
      mockDb._queueQueryResult(mockPhases1);
      mockDb._queueQueryResult(mockPhases2);

      await controller.compare(mockReq, mockRes);
      await flushPromises();

      const result = mockRes.json.mock.calls[0][0];
      expect(result.differences.projects.added).toHaveLength(1);
      expect(result.differences.projects.removed).toHaveLength(1);
    });
  });

  describe('merge - Conflict Detection Edge Cases', () => {
    it('detects phase timeline conflicts', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        resolve_conflicts_as: 'manual'
      };

      const mockScenario = {
        id: 'scenario-1',
        name: 'Branch Scenario',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        scenario_type: 'branch',
        status: 'active'
      };

      const mockSourcePhases = [
        {
          id: 'phase-1',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          phase_id: 'phase-1',
          start_date: '2024-01-01',
          end_date: '2024-03-31'
        }
      ];

      const mockTargetPhase = {
        id: 'phase-target',
        scenario_id: 'baseline-0000-0000-0000-000000000000',
        project_id: 'project-1',
        phase_id: 'phase-1',
        start_date: '2024-02-01', // Different start date - conflict!
        end_date: '2024-04-30' // Different end date - conflict!
      };

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult([]); // source assignments
      mockDb._queueQueryResult(mockSourcePhases); // source phases
      mockDb._queueQueryResult([]); // source projects
      mockDb._queueFirstResult(mockTargetPhase); // Conflicting phase

      (randomUUID as jest.Mock).mockReturnValue('conflict-phase-1');

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled(); // Conflict record inserted
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Merge conflicts detected. Manual resolution required.',
        conflicts: 1
      });
    });

    it('detects project detail conflicts', async () => {
      mockReq.params.id = 'scenario-1';
      mockReq.body = {
        resolve_conflicts_as: 'manual'
      };

      const mockScenario = {
        id: 'scenario-1',
        name: 'Branch Scenario',
        parent_scenario_id: 'baseline-0000-0000-0000-000000000000',
        scenario_type: 'branch',
        status: 'active'
      };

      const mockSourceProjects = [
        {
          id: 'proj-1',
          scenario_id: 'scenario-1',
          project_id: 'project-1',
          name: 'Project A',
          priority: 'high',
          aspiration_start: '2024-01-01',
          aspiration_finish: '2024-12-31'
        }
      ];

      const mockTargetProject = {
        id: 'proj-target',
        scenario_id: 'baseline-0000-0000-0000-000000000000',
        project_id: 'project-1',
        name: 'Project A Modified', // Different name - conflict!
        priority: 'medium', // Different priority - conflict!
        aspiration_start: '2024-01-01',
        aspiration_finish: '2024-12-31'
      };

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult([]); // source assignments
      mockDb._queueQueryResult([]); // source phases
      mockDb._queueQueryResult(mockSourceProjects); // source projects
      mockDb._queueFirstResult(mockTargetProject); // Conflicting project

      (randomUUID as jest.Mock).mockReturnValue('conflict-proj-1');

      await controller.merge(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled(); // Conflict record inserted
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Merge conflicts detected. Manual resolution required.',
        conflicts: 1
      });
    });
  });
});
