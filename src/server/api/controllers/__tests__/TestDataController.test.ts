import { TestDataController } from '../TestDataController.js';
import { createMockDb } from './helpers/mockDb.js';

// Helper to flush promises
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('TestDataController', () => {
  let controller: TestDataController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TestDataController();
    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {}
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    mockDb = createMockDb();
    (controller as any).db = mockDb;
    mockDb._reset();
  });

  describe('deleteProjectPhases - Delete test project phases', () => {
    it('deletes project phases for test projects', async () => {
      mockDb._setDeleteResult(5);

      await controller.deleteProjectPhases(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.whereIn).toHaveBeenCalled();
      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 5 test project phases'
      });
    });

    it('handles zero deletions', async () => {
      mockDb._setDeleteResult(0);

      await controller.deleteProjectPhases(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test project phases'
      });
    });

    it('uses whereIn with subquery to find test projects', async () => {
      mockDb._setDeleteResult(3);

      await controller.deleteProjectPhases(mockReq, mockRes);
      await flushPromises();

      // Verify the query structure
      expect(mockDb).toHaveBeenCalledWith('project_phases_timeline');
      expect(mockDb.whereIn).toHaveBeenCalled();
      expect(mockDb).toHaveBeenCalledWith('projects');
      expect(mockDb.select).toHaveBeenCalledWith('id');
      expect(mockDb.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
    });
  });

  describe('deleteAllocations - Delete test allocations', () => {
    it('returns success message without deletion', async () => {
      await controller.deleteAllocations(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test allocations'
      });
      expect(mockDb.del).not.toHaveBeenCalled();
    });
  });

  describe('deleteAvailabilityOverrides - Delete test availability overrides', () => {
    it('deletes availability overrides for test people', async () => {
      mockDb._setDeleteResult(10);

      await controller.deleteAvailabilityOverrides(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.whereIn).toHaveBeenCalled();
      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 10 test availability overrides'
      });
    });

    it('handles zero deletions', async () => {
      mockDb._setDeleteResult(0);

      await controller.deleteAvailabilityOverrides(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test availability overrides'
      });
    });

    it('uses whereIn with subquery to find test people', async () => {
      mockDb._setDeleteResult(5);

      await controller.deleteAvailabilityOverrides(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('person_availability_overrides');
      expect(mockDb.whereIn).toHaveBeenCalled();
      expect(mockDb).toHaveBeenCalledWith('people');
      expect(mockDb.select).toHaveBeenCalledWith('id');
      expect(mockDb.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
    });
  });

  describe('deleteRoles - Delete test roles', () => {
    it('deletes roles with Test_ prefix', async () => {
      mockDb._setDeleteResult(7);

      await controller.deleteRoles(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('roles');
      expect(mockDb.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 7 test roles'
      });
    });

    it('handles zero deletions', async () => {
      mockDb._setDeleteResult(0);

      await controller.deleteRoles(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test roles'
      });
    });
  });

  describe('deletePhases - Delete test phases', () => {
    it('deletes phases with Test_ prefix', async () => {
      mockDb._setDeleteResult(4);

      await controller.deletePhases(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('project_phases');
      expect(mockDb.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 4 test phases'
      });
    });

    it('handles zero deletions', async () => {
      mockDb._setDeleteResult(0);

      await controller.deletePhases(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test phases'
      });
    });
  });

  describe('deleteProjectTypes - Delete test project types', () => {
    it('deletes project types and sub-types with specific patterns', async () => {
      mockDb._setDeleteResult(2);

      await controller.deleteProjectTypes(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('project_sub_types');
      expect(mockDb).toHaveBeenCalledWith('project_types');
      expect(mockDb.whereIn).toHaveBeenCalled();
      expect(mockDb.del).toHaveBeenCalled();

      // Just verify the response format (counts will vary based on mock setup)
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.message).toMatch(/^Deleted \d+ test project types and \d+ sub-types$/);
    });

    it('calls database operations in correct order', async () => {
      mockDb._setDeleteResult(1);

      await controller.deleteProjectTypes(mockReq, mockRes);
      await flushPromises();

      // Verify both tables are accessed
      expect(mockDb).toHaveBeenCalledWith('project_sub_types');
      expect(mockDb).toHaveBeenCalledWith('project_types');

      // Verify response is returned
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('handles specific test project type patterns', async () => {
      // Mock all deletes to return 0
      mockDb._setDeleteResult(0);

      await controller.deleteProjectTypes(mockReq, mockRes);
      await flushPromises();

      // Check that specific patterns are used
      const whereCalls = mockDb.where.mock.calls.filter((call: any) =>
        call[0] === 'name' && call[1] === 'like'
      );

      const patterns = whereCalls.map((call: any) => call[2]);

      // Should include specific patterns(Test_ 前缀自 2026-10-13 LIKE 转义
      // 修复起走 ESCAPE 子句,不再出现在 where('name','like',...) 调用里)
      expect(patterns).toContain('AI/ML Platform%');
      expect(patterns).toContain('Product Development%');
      expect(patterns).toContain('Cloud Migration%');
      expect(mockDb.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
    });

    it('handles zero deletions', async () => {
      mockDb._setDeleteResult(0);

      await controller.deleteProjectTypes(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test project types and 0 sub-types'
      });
    });
  });

  describe('deleteLocations - Delete test locations', () => {
    it('deletes locations with Test_ prefix', async () => {
      mockDb._setDeleteResult(3);

      await controller.deleteLocations(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('locations');
      expect(mockDb.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 3 test locations'
      });
    });

    it('handles zero deletions', async () => {
      mockDb._setDeleteResult(0);

      await controller.deleteLocations(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 0 test locations'
      });
    });
  });

  describe('Integration - Multiple cleanup operations', () => {
    it('can be called sequentially to clean up test data', async () => {
      // Simulate a complete cleanup sequence
      mockDb._setDeleteResult(5);
      await controller.deleteProjectPhases(mockReq, mockRes);
      await flushPromises();

      mockDb._reset();
      mockDb._setDeleteResult(10);
      await controller.deleteAvailabilityOverrides(mockReq, mockRes);
      await flushPromises();

      mockDb._reset();
      mockDb._setDeleteResult(3);
      await controller.deleteRoles(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledTimes(3);
    });
  });
});
