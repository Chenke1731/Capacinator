import { ProjectTypeHierarchyController } from '../ProjectTypeHierarchyController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

describe('ProjectTypeHierarchyController', () => {
  let controller: ProjectTypeHierarchyController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new ProjectTypeHierarchyController();

    // Create mock request
    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {}
    };

    // Create mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Create mock database
    mockDb = createMockDb();
    (controller as any).db = mockDb;

    mockDb._reset();
  });

  describe('getHierarchy - Get project type hierarchy', () => {
    it('returns hierarchy with project types and sub-types', async () => {
      const mockProjectTypes = [
        { id: 'type-1', name: 'Project Type A', description: 'Desc A', color_code: '#FF0000' },
        { id: 'type-2', name: 'Project Type B', description: 'Desc B', color_code: '#00FF00' }
      ];

      const mockSubTypes = [
        { id: 'sub-1', name: 'Sub Type 1', project_type_id: 'type-1', color_code: '#FF0000', sort_order: 1 },
        { id: 'sub-2', name: 'Sub Type 2', project_type_id: 'type-1', color_code: '#FF0000', sort_order: 2 }
      ];

      // Mock project types query
      mockDb._queueQueryResult(mockProjectTypes);

      // Mock sub-types query
      mockDb._queueQueryResult(mockSubTypes);

      await controller.getHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'type-1',
            name: 'Project Type A',
            is_parent: true,
            level: 0,
            children: expect.arrayContaining([
              expect.objectContaining({
                id: 'sub-1',
                name: 'Sub Type 1',
                parent_id: 'type-1',
                is_parent: false,
                level: 1
              })
            ])
          })
        ])
      });
    });

    it('handles project types without sub-types', async () => {
      const mockProjectTypes = [
        { id: 'type-1', name: 'Project Type A' }
      ];

      mockDb._queueQueryResult(mockProjectTypes);
      mockDb._queueQueryResult([]); // No sub-types

      await controller.getHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'type-1',
            children: []
          })
        ])
      });
    });

    it('handles database errors gracefully', async () => {
      mockDb.select = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.getHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get hierarchy',
        details: 'Database error'
      });
    });
  });

  describe('getProjectTypePhases - Get phases for project type', () => {
    beforeEach(() => {
      mockReq.params = { projectTypeId: 'type-1' };
    });

    it('returns direct phases for project type', async () => {
      const mockPhases = [
        {
          phase_id: 'phase-1',
          phase_name: 'Planning',
          is_inherited: false,
          order_index: 1
        }
      ];

      mockDb._setQueryResult(mockPhases);

      await controller.getProjectTypePhases(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockPhases
      });
    });

    it('returns inherited phases when no direct phases', async () => {
      // First query returns no direct phases
      mockDb._queueQueryResult([]);

      // Get project type with parent
      mockDb._queueFirstResult({
        id: 'type-1',
        parent_id: 'parent-1'
      });

      // Recursive call for parent phases
      mockDb._queueQueryResult([
        { phase_id: 'phase-1', phase_name: 'Planning', is_inherited: true }
      ]);

      await controller.getProjectTypePhases(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            phase_id: 'phase-1'
          })
        ])
      });
    });

    it('handles database errors gracefully', async () => {
      mockDb.join = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.getProjectTypePhases(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createChild - Create project sub-type', () => {
    beforeEach(() => {
      mockReq.params = { parentId: 'parent-1' };
      mockReq.body = {
        name: 'New Sub Type',
        description: 'Description',
        color_code: '#FF0000'
      };
    });

    it('creates child and inherits phases from parent', async () => {
      const mockParent = {
        id: 'parent-1',
        name: 'Parent Type',
        level: 0
      };

      const mockChild = {
        id: 'child-1',
        name: 'New Sub Type',
        parent_id: 'parent-1',
        level: 1
      };

      const mockParentPhases = [
        { id: 'phase-1', phase_id: 'phase-1' }
      ];

      // Mock parent lookup
      mockDb._queueFirstResult(mockParent);

      // Mock max sort order query
      mockDb._queueFirstResult({ max: 2 });

      // Mock child insert
      mockDb._queueInsertResult([mockChild]);

      // Mock update parent to is_parent = true
      mockDb._setUpdateResult(1);

      // Mock inherit phases - get parent phases
      mockDb._queueQueryResult(mockParentPhases);

      // Mock insert inherited phases
      mockDb._setInsertResult([]);

      await controller.createChild(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockChild
      });
    });

    it('returns 404 when parent not found', async () => {
      mockDb._setFirstResult(null);

      await controller.createChild(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project Type not found'
      });
    });

    it('sets correct sort order for first child', async () => {
      const mockParent = { id: 'parent-1', level: 0 };

      mockDb._queueFirstResult(mockParent);
      mockDb._queueFirstResult({ max: null }); // No existing children
      mockDb._queueInsertResult([{ id: 'child-1' }]);
      mockDb._setUpdateResult(1);
      mockDb._queueQueryResult([]);
      mockDb._setInsertResult([]);

      await controller.createChild(mockReq, mockRes);
      await flushPromises();

      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.sort_order).toBe(1);
    });

    it('handles database errors gracefully', async () => {
      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.createChild(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addPhase - Add phase to project type', () => {
    beforeEach(() => {
      mockReq.params = { projectTypeId: 'type-1' };
      mockReq.body = {
        phaseId: 'phase-1',
        orderIndex: 1,
        is_mandatory: true
      };
    });

    it('adds phase to project type successfully', async () => {
      const mockProjectType = {
        id: 'type-1',
        name: 'Project Type',
        parent_id: null
      };

      // Mock project type lookup
      mockDb._queueFirstResult(mockProjectType);

      // Mock existing check (not found)
      mockDb._queueFirstResult(null);

      // Mock insert
      mockDb._setInsertResult([]);

      // Mock propagation - get children
      mockDb._queueQueryResult([]);

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('I01v/D17：显式 0 天模板保留（零时长里程碑，旧 || 30 会吞成 30）', async () => {
      mockDb._queueFirstResult({ id: 'type-1', parent_id: null });
      mockDb._queueFirstResult(null);
      mockDb._setInsertResult([]);
      mockDb._queueQueryResult([]);
      mockReq.body = {
        phaseId: 'phase-1',
        orderIndex: 1,
        default_duration_days: 0,
        min_duration_days: 0,
      };

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.default_duration_days).toBe(0);
      expect(insertCall.min_duration_days).toBe(0);
    });

    it('I01v/D17：脏输入 default_duration_days 负数 → 400（不再静默纠正）', async () => {
      mockDb._queueFirstResult({ id: 'type-1', parent_id: null });
      mockDb._queueFirstResult(null);
      mockReq.body = { phaseId: 'phase-1', orderIndex: 1, default_duration_days: -5 };

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'default_duration_days must be a non-negative integer'
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('I01v/D17：缺省 default_duration_days → 30', async () => {
      mockDb._queueFirstResult({ id: 'type-1', parent_id: null });
      mockDb._queueFirstResult(null);
      mockDb._setInsertResult([]);
      mockDb._queueQueryResult([]);
      mockReq.body = { phaseId: 'phase-1', orderIndex: 1 };

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.default_duration_days).toBe(30);
      expect(insertCall.min_duration_days).toBeNull();
    });

    it('returns 404 when project type not found', async () => {
      mockDb._setFirstResult(null);

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when trying to add phase to sub-type', async () => {
      const mockProjectType = {
        id: 'type-1',
        parent_id: 'parent-1' // Has parent, so it's a sub-type
      };

      mockDb._queueFirstResult(mockProjectType);

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phases can only be added to Project Types. Project Sub-Types inherit phases from their Project Type.'
      });
    });

    it('returns 400 when phase already exists', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockExisting = { id: 'existing-1' };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockExisting);

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phase already assigned to this project type'
      });
    });

    it('uses next order index when not provided', async () => {
      mockReq.body.orderIndex = undefined;

      const mockProjectType = { id: 'type-1', parent_id: null };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(null); // No existing
      mockDb._queueFirstResult({ max: 5 }); // Max order index
      mockDb._setInsertResult([]);
      mockDb._queueQueryResult([]);

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.order_index).toBe(6);
    });

    it('propagates phase to children', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockChildren = [{ id: 'child-1' }];

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(null);
      mockDb._setInsertResult([]);

      // Mock propagation
      mockDb._queueQueryResult(mockChildren);
      mockDb._setInsertResult([]); // Child phase insert
      mockDb._queueQueryResult([]); // Grandchildren

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      // Should have inserted twice (parent and child)
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('handles database errors gracefully', async () => {
      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.addPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('removePhase - Remove phase from project type', () => {
    beforeEach(() => {
      mockReq.params = {
        projectTypeId: 'type-1',
        phaseId: 'phase-1'
      };
    });

    it('removes phase successfully', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockPhaseAssignment = {
        id: 'assignment-1',
        is_inherited: false
      };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockPhaseAssignment);
      mockDb._setDeleteResult(1);

      // Mock remove from children
      mockDb._queueQueryResult([]);

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 404 when project type not found', async () => {
      mockDb._setFirstResult(null);

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when trying to remove from sub-type', async () => {
      const mockProjectType = { id: 'type-1', parent_id: 'parent-1' };

      mockDb._queueFirstResult(mockProjectType);

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when phase not found', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(null); // Phase not found

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when trying to remove inherited phase', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockPhaseAssignment = { is_inherited: true };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockPhaseAssignment);

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Cannot remove inherited phases'
      });
    });

    it('removes phase from children too', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockPhaseAssignment = { is_inherited: false };
      const mockChildren = [{ id: 'child-1' }];

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockPhaseAssignment);
      mockDb._setDeleteResult(1);

      // Mock remove from children
      mockDb._queueQueryResult(mockChildren);
      mockDb._setDeleteResult(1); // Child phase delete
      mockDb._queueQueryResult([]); // Grandchildren

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it('handles database errors gracefully', async () => {
      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.removePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updatePhase - Update phase configuration', () => {
    beforeEach(() => {
      mockReq.params = {
        projectTypeId: 'type-1',
        phaseId: 'phase-1'
      };
      mockReq.body = {
        is_mandatory: true,
        min_duration_days: 5,
        max_duration_days: 30,
        default_duration_days: 15
      };
    });

    it('updates phase configuration successfully', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockProjectTypePhase = {
        id: 'ptp-1',
        project_type_id: 'type-1',
        phase_id: 'phase-1'
      };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockProjectTypePhase);
      mockDb._setUpdateResult(1);

      await controller.updatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_mandatory: true,
          min_duration_days: 5,
          max_duration_days: 30,
          default_duration_days: 15
        })
      );
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 404 when project type not found', async () => {
      mockDb._setFirstResult(null);

      await controller.updatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when trying to update sub-type phase', async () => {
      const mockProjectType = { id: 'type-1', parent_id: 'parent-1' };

      mockDb._queueFirstResult(mockProjectType);

      await controller.updatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when phase not found', async () => {
      const mockProjectType = { id: 'type-1', parent_id: null };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(null); // Phase not found

      await controller.updatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('handles optional fields', async () => {
      mockReq.body = {
        is_locked_order: true,
        template_description: 'Custom description',
        template_metadata: { key: 'value' }
      };

      const mockProjectType = { id: 'type-1', parent_id: null };
      const mockProjectTypePhase = { id: 'ptp-1' };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockProjectTypePhase);
      mockDb._setUpdateResult(1);

      await controller.updatePhase(mockReq, mockRes);
      await flushPromises();

      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.is_locked_order).toBe(true);
      expect(updateCall.template_description).toBe('Custom description');
      expect(JSON.parse(updateCall.template_metadata)).toEqual({ key: 'value' });
    });

    it('handles database errors gracefully', async () => {
      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.updatePhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateHierarchy - Update hierarchy', () => {
    beforeEach(() => {
      mockReq.params = { projectTypeId: 'type-1' };
    });

    it('moves project type to new parent', async () => {
      mockReq.body = {
        newParentId: 'parent-2',
        newSortOrder: undefined
      };

      const mockProjectType = { id: 'type-1', parent_id: 'parent-1' };
      const mockNewParent = { id: 'parent-2', level: 1 };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockNewParent);
      mockDb._setUpdateResult(1); // Mark new parent as is_parent
      mockDb._queueQueryResult([]); // No descendants
      mockDb._setUpdateResult(1); // Update project type

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_id: 'parent-2',
          level: 2
        })
      );
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('moves project type to root level', async () => {
      mockReq.body = {
        newParentId: null,
        newSortOrder: undefined
      };

      const mockProjectType = { id: 'type-1', parent_id: 'parent-1' };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueQueryResult([]); // No descendants
      mockDb._setUpdateResult(1);

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_id: null,
          level: 0
        })
      );
    });

    it('updates sort order only', async () => {
      mockReq.body = {
        newParentId: undefined,
        newSortOrder: 5
      };

      const mockProjectType = { id: 'type-1' };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._setUpdateResult(1);

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledWith({ sort_order: 5 });
    });

    it('returns 404 when project type not found', async () => {
      mockReq.body = { newParentId: 'parent-2' };
      mockDb._setFirstResult(null);

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 when new parent not found', async () => {
      mockReq.body = { newParentId: 'parent-2' };

      const mockProjectType = { id: 'type-1' };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._setFirstResult(null); // New parent not found

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'New parent not found'
      });
    });

    it('updates descendant levels recursively', async () => {
      mockReq.body = { newParentId: 'parent-2' };

      const mockProjectType = { id: 'type-1' };
      const mockNewParent = { id: 'parent-2', level: 1 };
      const mockChildren = [{ id: 'child-1' }];

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockNewParent);
      mockDb._setUpdateResult(1); // Mark parent as is_parent

      // Update descendants
      mockDb._queueQueryResult(mockChildren);
      mockDb._setUpdateResult(1); // Update child level
      mockDb._queueQueryResult([]); // No grandchildren

      mockDb._setUpdateResult(1); // Update project type

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledTimes(3);
    });

    it('handles database errors gracefully', async () => {
      mockReq.body = { newSortOrder: 5 };

      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.updateHierarchy(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
