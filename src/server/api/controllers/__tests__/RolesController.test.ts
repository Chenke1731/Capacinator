import { RolesController } from '../RolesController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logPerformance: jest.fn(),
  logBusinessOperation: jest.fn()
};

describe('RolesController', () => {
  let controller: RolesController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RolesController();

    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logger: mockLogger,
      requestId: 'test-request-id',
      logAuditEvent: jest.fn()
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    mockDb = createMockDb();
    (controller as any).db = mockDb;
    mockDb._reset();

    // Mock db.raw for subqueries
    mockDb.raw = jest.fn((sql) => ({
      toString: () => sql
    }));
  });

  describe('getAll - List All Roles', () => {
    it('retrieves all roles with counts', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          name: 'Software Engineer',
          description: 'Develops software',
          people_count: 10,
          planners_count: 2,
          standard_allocations_count: 5
        },
        {
          id: 'role-2',
          name: 'Product Manager',
          description: 'Manages products',
          people_count: 5,
          planners_count: 1,
          standard_allocations_count: 3
        }
      ];

      mockDb._setQueryResult(mockRoles);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('roles');
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalledWith('name');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Roles fetched successfully',
          data: mockRoles
        })
      );
    });

    it('returns empty array when no roles exist', async () => {
      mockDb._setQueryResult([]);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: []
        })
      );
    });
  });

  describe('getById - Get Specific Role', () => {
    it('retrieves role with people, planners, and resource templates', async () => {
      mockReq.params.id = 'role-1';

      const mockRole = {
        id: 'role-1',
        name: 'Software Engineer',
        description: 'Develops software'
      };

      const mockPeople = [
        {
          id: 'pr-1',
          person_id: 'person-1',
          person_name: 'John Doe',
          person_email: 'john@example.com',
          is_primary: true
        }
      ];

      const mockPlanners = [
        {
          id: 'planner-1',
          person_id: 'person-2',
          person_name: 'Jane Smith',
          is_primary: true
        }
      ];

      const mockResourceTemplates = [
        {
          id: 'template-1',
          role_id: 'role-1',
          project_type_id: 'type-1',
          project_type_name: 'Development',
          phase_id: 'phase-1',
          phase_name: 'Planning',
          percentage: 50
        }
      ];

      mockDb._queueFirstResult(mockRole);
      mockDb._queueQueryResult(mockPeople);
      mockDb._queueQueryResult(mockPlanners);
      mockDb._queueQueryResult(mockResourceTemplates);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        ...mockRole,
        people: mockPeople,
        planners: mockPlanners,
        resourceTemplates: mockResourceTemplates
      });
    });

    it('returns 404 when role not found', async () => {
      mockReq.params.id = 'nonexistent-role';

      mockDb._setFirstResult(null);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role not found'
        })
      );
    });
  });

  describe('create - Create New Role', () => {
    it('creates a new role with audit logging', async () => {
      mockReq.body = {
        name: 'New Role',
        description: 'Test role description'
      };

      const mockCreatedRole = {
        id: 'role-new',
        name: 'New Role',
        description: 'Test role description',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb._setInsertResult([mockCreatedRole]);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'roles',
        'role-new',
        'CREATE',
        null,
        mockCreatedRole,
        'Role created: New Role'
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockCreatedRole);
    });
  });

  describe('update - Update Role', () => {
    it('updates role successfully with audit logging', async () => {
      mockReq.params.id = 'role-1';
      mockReq.body = {
        name: 'Updated Role Name',
        description: 'Updated description'
      };

      const mockExistingRole = {
        id: 'role-1',
        name: 'Original Name',
        description: 'Original description'
      };

      const mockUpdatedRole = {
        id: 'role-1',
        name: 'Updated Role Name',
        description: 'Updated description',
        updated_at: new Date()
      };

      mockDb._queueFirstResult(mockExistingRole);
      mockDb._setUpdateResult([mockUpdatedRole]);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'roles',
        'role-1',
        'UPDATE',
        mockExistingRole,
        mockUpdatedRole,
        'Role updated: Updated Role Name'
      );
      expect(mockRes.json).toHaveBeenCalledWith(mockUpdatedRole);
    });

    it('returns 404 when role not found on initial fetch', async () => {
      mockReq.params.id = 'nonexistent-role';
      mockReq.body = { name: 'Updated Name' };

      mockDb._setFirstResult(null);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role not found'
        })
      );
    });

    it('returns 404 when role not found after update', async () => {
      mockReq.params.id = 'role-1';
      mockReq.body = { name: 'Updated Name' };

      const mockExistingRole = {
        id: 'role-1',
        name: 'Original Name'
      };

      mockDb._queueFirstResult(mockExistingRole);
      mockDb._setUpdateResult([]); // No role returned after update

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role not found'
        })
      );
    });
  });

  describe('delete - Delete Role', () => {
    it('deletes role successfully with audit logging', async () => {
      mockReq.params.id = 'role-1';

      const mockExistingRole = {
        id: 'role-1',
        name: 'Role to Delete'
      };

      mockDb._queueFirstResult(mockExistingRole);
      mockDb._setDeleteResult(1); // 1 row deleted

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'roles',
        'role-1',
        'DELETE',
        mockExistingRole,
        null,
        'Role deleted: Role to Delete'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Role deleted successfully'
      });
    });

    it('returns 404 when role not found on initial fetch', async () => {
      mockReq.params.id = 'nonexistent-role';

      mockDb._setFirstResult(null);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role not found'
        })
      );
    });

    it('returns 404 when no rows deleted', async () => {
      mockReq.params.id = 'role-1';

      const mockExistingRole = {
        id: 'role-1',
        name: 'Role'
      };

      mockDb._queueFirstResult(mockExistingRole);
      mockDb._setDeleteResult(0); // No rows deleted

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role not found'
        })
      );
    });
  });

  describe('addPlanner - Add Role Planner', () => {
    it('adds role planner successfully with audit logging', async () => {
      mockReq.params.id = 'role-1';
      mockReq.body = {
        person_id: 'person-1',
        is_primary: true
      };

      const mockRolePlanner = {
        id: 'planner-1',
        role_id: 'role-1',
        person_id: 'person-1',
        is_primary: true,
        assigned_at: new Date()
      };

      mockDb._setInsertResult([mockRolePlanner]);

      await controller.addPlanner(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'role_planners',
        'role-1-person-1',
        'CREATE',
        null,
        mockRolePlanner,
        'Role planner added to role role-1'
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockRolePlanner);
    });
  });

  describe('removePlanner - Remove Role Planner', () => {
    it('removes role planner successfully with audit logging', async () => {
      mockReq.params.id = 'role-1';
      mockReq.params.plannerId = 'person-1';

      const mockExistingPlanner = {
        id: 'planner-1',
        role_id: 'role-1',
        person_id: 'person-1',
        is_primary: true
      };

      mockDb._queueFirstResult(mockExistingPlanner);
      mockDb._setDeleteResult(1);

      await controller.removePlanner(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'role_planners',
        'role-1-person-1',
        'DELETE',
        mockExistingPlanner,
        null,
        'Role planner removed from role role-1'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Role planner removed successfully'
      });
    });

    it('returns 404 when role planner not found on initial fetch', async () => {
      mockReq.params.id = 'role-1';
      mockReq.params.plannerId = 'person-1';

      mockDb._setFirstResult(null);

      await controller.removePlanner(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role planner assignment not found'
        })
      );
    });

    it('returns 404 when no rows deleted', async () => {
      mockReq.params.id = 'role-1';
      mockReq.params.plannerId = 'person-1';

      const mockExistingPlanner = {
        id: 'planner-1',
        role_id: 'role-1',
        person_id: 'person-1'
      };

      mockDb._queueFirstResult(mockExistingPlanner);
      mockDb._setDeleteResult(0);

      await controller.removePlanner(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Role planner assignment not found'
        })
      );
    });
  });

  describe('getCapacityGaps - Get Capacity Gaps', () => {
    it('retrieves capacity gaps from view', async () => {
      // I01v/D15：改吃 roleCapacityGaps 原语（场景切片），旧视图/死列
      // orderBy('gap_fte') 退役——原语行按 capacity_gap_fte 降序返回
      const mockGaps = [
        { role_id: 'role-1', role_name: 'Software Engineer', capacity_gap_fte: -5.5 },
        { role_id: 'role-2', role_name: 'Product Manager', capacity_gap_fte: -2.0 }
      ];

      mockDb.raw = jest.fn().mockResolvedValue(mockGaps);

      await controller.getCapacityGaps(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.raw).toHaveBeenCalledTimes(1);
      expect(String((mockDb.raw as jest.Mock).mock.calls[0][0])).toContain('role_capacity');
      // 缺省场景头 = baseline（resolveScenarioId）
      expect((mockDb.raw as jest.Mock).mock.calls[0][1]).toEqual([
        'baseline-0000-0000-0000-000000000000'
      ]);
      // 降序：-2.0 在 -5.5 之前
      expect(mockRes.json).toHaveBeenCalledWith([
        expect.objectContaining({ role_id: 'role-2' }),
        expect.objectContaining({ role_id: 'role-1' })
      ]);
    });

    it('returns empty array when no gaps exist', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([]);

      await controller.getCapacityGaps(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith([]);
    });
  });

  describe('getExpertiseLevels - Get Expertise Levels', () => {
    it('returns hardcoded expertise levels', async () => {
      await controller.getExpertiseLevels(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        data: [
          { level: 1, name: 'Novice', description: 'Learning the fundamentals, requires supervision' },
          { level: 2, name: 'Beginner', description: 'Some experience, occasional guidance needed' },
          { level: 3, name: 'Intermediate', description: 'Solid competency, works independently' },
          { level: 4, name: 'Advanced', description: 'Highly skilled, mentors others' },
          { level: 5, name: 'Expert', description: 'Domain expert, thought leader' }
        ]
      });
    });

    it('handles errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Spy on the original getExpertiseLevels and make it throw
      const originalMethod = controller.getExpertiseLevels;
      (controller as any).getExpertiseLevels = async (req: any, res: any) => {
        try {
          throw new Error('Test error');
        } catch (error) {
          console.error('Error fetching expertise levels:', error);
          res.status(500).json({ error: 'Failed to fetch expertise levels' });
        }
      };

      await controller.getExpertiseLevels(mockReq, mockRes);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching expertise levels:', expect.any(Error));
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch expertise levels' });

      consoleErrorSpy.mockRestore();
      (controller as any).getExpertiseLevels = originalMethod;
    });
  });
});
