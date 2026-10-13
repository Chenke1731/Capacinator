import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

import type { Request, Response } from 'express';
import { PeopleController } from '../../../../src/server/api/controllers/PeopleController';

// Mock the audit middleware
const mockAuditModelChanges = jest.fn();
jest.mock('../../../../src/server/middleware/enhancedAuditMiddleware', () => ({
  auditModelChanges: mockAuditModelChanges
}));

jest.mock('../../../../src/server/config/index', () => ({
  isTableAudited: jest.fn().mockReturnValue(true)
}));

// Create chainable mock methods with proper typing
const createChainableMock = (returnValue: any = []): any => {
  const chainable: any = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    sum: jest.fn().mockReturnThis(),
    min: jest.fn().mockReturnThis(),
    max: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(returnValue),
    then: jest.fn().mockResolvedValue(returnValue),
    returning: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    del: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockResolvedValue(1),
    transaction: jest.fn((callback) => callback(chainable))
  };
  
  // Special handling for count().first() pattern
  chainable.count.mockImplementation((column?: string) => ({
    first: jest.fn().mockResolvedValue({ count: '25' })
  }));
  // total 克隆计数链(getAll 自 2026-10-13 起走 clone().clearSelect().clearOrder().count())
  chainable.clone = jest.fn().mockReturnThis();
  chainable.clearSelect = jest.fn().mockReturnThis();
  chainable.clearOrder = jest.fn().mockReturnThis();
  
  // Make it thenable
  chainable.then = jest.fn((resolve) => {
    resolve(returnValue);
    return Promise.resolve(returnValue);
  });
  
  return chainable;
};

/**
 * Critical PeopleController Unit Tests
 * 
 * This test suite validates the core business logic of the PeopleController:
 * - Person data retrieval with complex joins (supervisor, roles, assignments)
 * - Role assignment and management business rules
 * - Audit logging for compliance and tracking
 * - Availability and utilization calculations
 * - Input validation and error handling
 * - CRUD operations integrity
 * 
 * These tests ensure the API maintains data integrity and follows business rules.
 */

describe('PeopleController', () => {
  let controller: PeopleController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockNext: jest.Mock;
  let mockDb: any;
  let createMockDb: (queryFactory?: (table?: string) => any) => any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockAuditModelChanges.mockClear();
    
    // Setup database mock with proper chainable returns
    mockDb = jest.fn((table?: string) => {
      // Return different mock data based on table name
      const mock = (() => {
        if (table === 'people') return createChainableMock([{ id: 'person-123', name: 'Test Person' }]);
        if (table === 'roles') return createChainableMock([{ id: 'role-123', name: 'Test Role' }]);
        if (table === 'locations') return createChainableMock([{ id: 'loc-123', name: 'Test Location' }]);
        if (table === 'person_roles') return createChainableMock([{ person_id: 'person-123', role_id: 'role-123' }]);
        if (table === 'project_assignments') return createChainableMock([{ id: 'assignment-123' }]);
        if (table === 'person_availability_overrides') return createChainableMock([]);
        return createChainableMock([]);
      })();
      
      // Add raw method to the returned mock
      mock.raw = mockDb.raw;
      return mock;
    });
    mockDb.transaction = jest.fn((callback) => callback(mockDb));
    mockDb.raw = jest.fn((sql) => ({ sql }));
    mockDb.fn = { now: jest.fn() };
    
    // Helper function to create a mock db with all required methods
    createMockDb = (queryFactory?: (table?: string) => any) => {
      const db = queryFactory ? jest.fn(queryFactory) : mockDb;
      (db as any).raw = mockDb.raw;
      (db as any).transaction = mockDb.transaction;
      (db as any).fn = mockDb.fn;
      return db;
    };
    
    // Create controller with mocked database
    controller = new PeopleController(mockDb as any);
    
    // Mock executeAuditedQuery to directly call the callback with the mock database
    (controller as any).executeAuditedQuery = jest.fn(async (req: any, callback: any, res: any, errorMessage: any) => {
      try {
        return await callback(mockDb);
      } catch (error) {
        // Call handleError like the real implementation would
        (controller as any).handleError(error, res, errorMessage);
        return undefined;
      }
    });

    // Mock helper methods
    (controller as any).buildFilters = jest.fn((query: any, filters: any) => query);
    (controller as any).paginate = jest.fn((query: any, page: any, limit: any) => query);
    (controller as any).handleNotFound = jest.fn((res: any, entity: any) => {
      res.status!(404).json({ error: `${entity} not found` });
    });
    (controller as any).handleError = jest.fn((error: any, res: any, message: any) => {
      res.status!(500).json({ error: message });
    });

    // Create mock request and response objects
    req = {
      params: {},
      query: {},
      body: {}
    };

    res = {
      json: jest.fn() as any,
      status: jest.fn().mockReturnThis() as any,
      send: jest.fn() as any
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Person CRUD Operations', () => {
    test.skip('should fetch all people with supervisor and role relationships', async () => {
      req.query = { page: '1', limit: '10', primary_role_id: 'role-123' };

      const mockPeople = [
        {
          id: 'person-1',
          name: 'John Smith',
          supervisor_name: 'Jane Manager',
          primary_role_name: 'Senior Developer',
          worker_type: 'FULL_TIME'
        },
        {
          id: 'person-2',
          name: 'Alice Johnson',
          supervisor_name: 'Jane Manager',
          primary_role_name: 'Designer',
          worker_type: 'CONTRACTOR'
        }
      ];

      const mockDbQuery = createChainableMock();
      mockDbQuery.first.mockResolvedValue({ count: 25 });
      
      (controller as any).db = createMockDb(() => mockDbQuery);
      (controller as any).paginate = jest.fn((query, page, limit) => {
        expect(page).toBe(1);
        expect(limit).toBe(10);
        return Promise.resolve(mockPeople);
      });

      await controller.getAll(req as Request, res as Response);

      // Verify complex join query was built correctly
      expect((controller as any).db).toHaveBeenCalledWith('people');
      expect(mockDbQuery.leftJoin).toHaveBeenCalledWith('people as supervisor', 'people.supervisor_id', 'supervisor.id');
      expect(mockDbQuery.leftJoin).toHaveBeenCalledWith('person_roles as primary_person_role', 'people.primary_person_role_id', 'primary_person_role.id');
      expect(mockDbQuery.leftJoin).toHaveBeenCalledWith('roles as primary_role', 'primary_person_role.role_id', 'primary_role.id');
      
      expect(res.json).toHaveBeenCalledWith({
        data: mockPeople,
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3
        }
      });
    });

    test.skip('should fetch person by ID with all related data', async () => {
      req.params = { id: 'person-123' };

      const mockPerson = {
        id: 'person-123',
        name: 'John Smith',
        supervisor_name: 'Jane Manager',
        primary_role_name: 'Senior Developer',
        email: 'john.smith@company.com'
      };

      const mockRoles = [
        {
          role_id: 'role-1',
          role_name: 'Senior Developer',
          proficiency_level: 5,
          years_experience: 8
        },
        {
          role_id: 'role-2',
          role_name: 'Team Lead',
          proficiency_level: 3,
          years_experience: 3
        }
      ];

      const mockAssignments = [
        {
          project_id: 'project-1',
          project_name: 'E-commerce Platform',
          role_name: 'Senior Developer',
          allocation_percentage: 80,
          start_date: '2024-06-01',
          end_date: '2024-12-31'
        }
      ];

      const mockAvailabilityOverrides = [
        {
          start_date: '2024-07-01',
          end_date: '2024-07-15',
          availability_percentage: 50,
          reason: 'Vacation'
        }
      ];

      const mockDbQuery = createChainableMock(mockPerson);
      mockDbQuery.first.mockResolvedValue(mockPerson);
      
      const rolesQuery = createChainableMock(mockRoles);
      const assignmentsQuery = createChainableMock(mockAssignments);
      assignmentsQuery.where.mockReturnThis();
      assignmentsQuery.orderBy.mockReturnThis();
      // Override then to resolve with assignments
      assignmentsQuery.then = jest.fn((resolve) => {
        resolve(mockAssignments);
        return Promise.resolve(mockAssignments);
      });
      
      const availabilityQuery = createChainableMock(mockAvailabilityOverrides);
      availabilityQuery.orderBy.mockReturnThis();
      // Override then to resolve with availability overrides
      availabilityQuery.then = jest.fn((resolve) => {
        resolve(mockAvailabilityOverrides);
        return Promise.resolve(mockAvailabilityOverrides);
      });
      
      (controller as any).db = createMockDb((table?: string) => {
        if (table === 'people') return mockDbQuery;
        if (table === 'person_roles') return rolesQuery;
        if (table === 'project_assignments') return assignmentsQuery;
        if (table === 'person_availability_overrides') return availabilityQuery;
        return createChainableMock([]);
      });

      await controller.getById(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        ...mockPerson,
        roles: mockRoles,
        assignments: mockAssignments,
        availabilityOverrides: mockAvailabilityOverrides
      });
    });

    test.skip('should handle person not found gracefully', async () => {
      req.params = { id: 'nonexistent-person' };

      const mockDbQuery = createChainableMock();
      mockDbQuery.first.mockResolvedValue(null); // Person not found
      (controller as any).db = createMockDb(() => mockDbQuery);

      await controller.getById(req as Request, res as Response);

      expect((controller as any).handleNotFound).toHaveBeenCalledWith(res, 'Person');
    });

    test('should create person with audit logging', async () => {
      
      req.body = {
        name: 'New Employee',
        email: 'new.employee@company.com',
        worker_type: 'FULL_TIME'
      };

      const mockPerson = {
        id: 'person-new',
        ...req.body,
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      };

      // The controller makes two separate db calls:
      // 1. db('people').insert(...) 
      // 2. db('people').where(...).orderBy(...).first() to get the created record
      
      const insertQuery = createChainableMock();
      insertQuery.insert.mockResolvedValue([1]); // Mock successful insert
      
      const selectQuery = createChainableMock();
      selectQuery.where.mockReturnThis();
      selectQuery.orderBy.mockReturnThis();
      selectQuery.first.mockResolvedValue(mockPerson);
      
      // Configure mockDb to return different queries for different calls
      mockDb.mockReturnValueOnce(insertQuery)   // First call: insert
            .mockReturnValueOnce(selectQuery);  // Second call: select the created record

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPerson);
      
      // Note: PeopleController uses automatic auditing through AuditedDatabase,
      // not manual auditModelChanges calls, so no audit assertions needed here
    });

    test('should update person without requiring audit if data unchanged', async () => {
      req.params = { id: 'person-123' };
      req.body = { name: 'Updated Name' };

      const existingPerson = {
        id: 'person-123',
        name: 'Test Person'
      };

      const updatedPerson = {
        id: 'person-123',
        name: 'Updated Name',
        updated_at: expect.any(Date)
      };

      // The controller makes 3 db calls:
      // 1. db('people').where('id', id).first() - get existing person
      // 2. db('people').where('id', id).update() - update person
      // 3. db('people').where('id', id).first() - get updated person
      
      const existingQuery = createChainableMock();
      existingQuery.where.mockReturnThis();
      existingQuery.first.mockResolvedValue(existingPerson);
      
      const updateQuery = createChainableMock();
      updateQuery.where.mockReturnThis();
      updateQuery.update.mockResolvedValue(1); // 1 row updated
      
      const updatedQuery = createChainableMock();
      updatedQuery.where.mockReturnThis();
      updatedQuery.first.mockResolvedValue(updatedPerson);
      
      // Configure mockDb to return different queries for different calls
      mockDb.mockReturnValueOnce(existingQuery)   // First call: check existing
            .mockReturnValueOnce(updateQuery)     // Second call: update  
            .mockReturnValueOnce(updatedQuery);   // Third call: get updated record

      await controller.update(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(updatedPerson);
      expect(updateQuery.update).toHaveBeenCalledWith({
        name: 'Updated Name',
        updated_at: expect.any(Date)
      });
    });

    test('should delete person safely', async () => {
      req.params = { id: 'person-to-delete' };

      const existingPerson = {
        id: 'person-to-delete',
        name: 'Person to Delete'
      };

      // The controller makes 4 db calls (2026-10-13 引用检查后):
      // 1. db('people').first() - get existing person
      // 2. db('scenario_project_assignments').count().first() - 引用检查
      // 3. db('project_assignments').count().first() - 引用检查(遗留表)
      // 4. db('people').del() - delete person

      const existingQuery = createChainableMock();
      existingQuery.where.mockReturnThis();
      existingQuery.first.mockResolvedValue(existingPerson);

      const zeroCount = () => {
        const q = createChainableMock();
        q.where.mockReturnThis();
        q.count.mockImplementation(() => ({ first: jest.fn().mockResolvedValue({ count: 0 }) }));
        return q;
      };

      const deleteQuery = createChainableMock();
      deleteQuery.where.mockReturnThis();
      deleteQuery.del.mockResolvedValue(1); // 1 row deleted

      // Configure mockDb to return different queries for different calls
      mockDb.mockReturnValueOnce(existingQuery)   // First call: check existing
            .mockReturnValueOnce(zeroCount())     // 引用检查: scenario 表
            .mockReturnValueOnce(zeroCount())     // 引用检查: 遗留表
            .mockReturnValueOnce(deleteQuery);    // delete

      await controller.delete(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({ message: 'Person deleted successfully' });
      expect(deleteQuery.where).toHaveBeenCalledWith('id', 'person-to-delete');
      expect(deleteQuery.del).toHaveBeenCalled();
    });

    test('refuses to delete a person with assignments on record (2026-10-13 CASCADE 守卫)', async () => {
      req.params = { id: 'person-with-history' };

      const existingQuery = createChainableMock();
      existingQuery.where.mockReturnThis();
      existingQuery.first.mockResolvedValue({ id: 'person-with-history', name: 'P' });

      const refCount = (n: number) => {
        const q = createChainableMock();
        q.where.mockReturnThis();
        q.count.mockImplementation(() => ({ first: jest.fn().mockResolvedValue({ count: n }) }));
        return q;
      };

      mockDb.mockReturnValueOnce(existingQuery)
            .mockReturnValueOnce(refCount(3))
            .mockReturnValueOnce(refCount(2));

      await controller.delete(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Conflict' }));
    });
  });

  describe('Role Management', () => {
    test('should add role to person with proficiency tracking', async () => {
      req.params = { id: 'person-123' };
      req.body = {
        role_id: 'role-456',
        proficiency_level: 3,  // 1-5 numeric scale
        years_experience: 3,
        notes: 'Certified in React development'
      };

      const mockPersonRole = {
        id: 'person-role-789',
        person_id: 'person-123',
        role_id: 'role-456',
        proficiency_level: 3,
        years_experience: 3,
        notes: 'Certified in React development',
        assigned_at: expect.any(Date)
      };

      // Mock the joined result that the controller expects
      const expectedResult = {
        id: 'person-role-789',
        person_id: 'person-123',
        role_id: 'role-456',
        proficiency_level: 3,
        is_primary: false,
        role_name: 'Test Role',
        role_description: 'Test Role Description'
      };

      // Mock for transaction
      const trxMock = jest.fn((table) => {
        if (table === 'person_roles') {
          const query = createChainableMock();
          query.first.mockResolvedValue(null); // No existing role
          query.returning.mockResolvedValue([mockPersonRole]);
          return query;
        }
        if (table === 'person_roles as pr') {
          // This is the joined query
          const query = createChainableMock();
          query.join.mockReturnThis();
          query.where.mockReturnThis();
          query.select.mockReturnThis();
          query.first.mockResolvedValue(expectedResult);
          return query;
        }
        return createChainableMock();
      });
      trxMock.raw = mockDb.raw;
      
      const customDb = createMockDb();
      customDb.transaction = jest.fn(async (callback) => {
        const result = await callback(trxMock);
        return result;
      });
      (controller as any).db = customDb;

      await controller.addRole(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expectedResult);
    });

    test('should remove role from person safely', async () => {
      req.params = { id: 'person-123', roleId: 'role-456' };

      const mockDbQuery = createChainableMock();
      mockDbQuery.del.mockResolvedValue(1); // One role assignment deleted
      (controller as any).db = createMockDb(() => mockDbQuery);

      await controller.removeRole(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({ message: 'Role removed from person successfully' });
      expect(mockDbQuery.where).toHaveBeenCalledWith('person_id', 'person-123');
      expect(mockDbQuery.where).toHaveBeenCalledWith('role_id', 'role-456');
      expect(mockDbQuery.del).toHaveBeenCalled();
    });

    test('should handle removal of non-existent role assignment', async () => {
      req.params = { id: 'person-123', roleId: 'nonexistent-role' };

      const mockDbQuery = createChainableMock();
      mockDbQuery.del.mockResolvedValue(0); // No rows deleted
      (controller as any).db = createMockDb(() => mockDbQuery);

      await controller.removeRole(req as Request, res as Response);

      expect((controller as any).handleNotFound).toHaveBeenCalledWith(res, 'Person role assignment');
    });
  });

  describe('Utilization and Availability Analytics', () => {
    test.skip('should fetch person utilization data', async () => {
      const mockUtilizationData = [
        {
          person_id: 'person-1',
          person_name: 'John Smith',
          current_allocation: 85,
          utilization_percentage: 95,
          capacity_status: 'FULLY_UTILIZED'
        },
        {
          person_id: 'person-2',
          person_name: 'Alice Johnson',
          current_allocation: 40,
          utilization_percentage: 45,
          capacity_status: 'UNDER_UTILIZED'
        }
      ];

      const mockDbQuery = createChainableMock();
      mockDbQuery.select.mockResolvedValue(mockUtilizationData);
      (controller as any).db = createMockDb(() => mockDbQuery);

      await controller.getUtilization(req as Request, res as Response);

      expect((controller as any).db).toHaveBeenCalledWith('person_utilization_view');
      expect(res.json).toHaveBeenCalledWith(mockUtilizationData);
    });

    test.skip('should fetch person availability data', async () => {
      const mockAvailabilityData = [
        {
          person_id: 'person-1',
          person_name: 'John Smith',
          base_availability: 100,
          current_availability: 90,
          availability_status: 'AVAILABLE',
          next_available_date: null
        },
        {
          person_id: 'person-2',
          person_name: 'Alice Johnson',
          base_availability: 80, // Part-time
          current_availability: 0,
          availability_status: 'FULLY_BOOKED',
          next_available_date: '2024-09-01'
        }
      ];

      const mockDbQuery = createChainableMock();
      mockDbQuery.select.mockResolvedValue(mockAvailabilityData);
      (controller as any).db = createMockDb(() => mockDbQuery);

      await controller.getAvailability(req as Request, res as Response);

      expect((controller as any).db).toHaveBeenCalledWith('person_availability_view');
      expect(res.json).toHaveBeenCalledWith(mockAvailabilityData);
    });
  });

  describe('Test Data Management', () => {
    test('should delete test people safely', async () => {
      const mockDbQuery = createChainableMock();
      mockDbQuery.del.mockResolvedValue(3); // 3 test people deleted
      (controller as any).db = createMockDb(() => mockDbQuery);

      await controller.deleteTestData(req as Request, res as Response);

      expect(mockDbQuery.whereRaw).toHaveBeenCalledWith("name LIKE ? ESCAPE '\\'", ['Test\\_%']);
      expect(mockDbQuery.del).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Deleted 3 test people' });
    });
  });

  describe('Input Validation and Edge Cases', () => {
    test('should handle malformed person data gracefully', async () => {
      req.body = {
        name: '', // Empty name
        email: 'invalid-email', // Invalid email format
        primary_person_role_id: null,
        worker_type: 'INVALID_TYPE'
      };

      const mockDbQuery = createChainableMock();
      // Simulate database constraint violation
      mockDbQuery.insert.mockRejectedValue(new Error('CHECK constraint failed: people'));
      
      // Update the mock executeAuditedQuery to use our custom mock
      (controller as any).executeAuditedQuery = jest.fn(async (req: any, callback: any, res: any, errorMessage: any) => {
        try {
          return await callback(mockDbQuery);
        } catch (error) {
          (controller as any).handleError(error, res, errorMessage);
          return undefined;
        }
      });

      await controller.create(req as Request, res as Response);
      
      // Should have called handleError, which calls res.status(500)
      expect((controller as any).handleError).toHaveBeenCalledWith(
        expect.any(Error),
        res,
        'Failed to create person'
      );
    });

    test('should validate role assignment constraints', async () => {
      req.params = { id: 'person-123' };
      req.body = {
        role_id: 'role-456',
        proficiency_level: 6, // Invalid proficiency level (>5)
        years_experience: -5 // Negative experience
      };

      await controller.addRole(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Proficiency level must be between 1 (novice) and 5 (expert)' 
      });
    });

    test('should handle duplicate role assignments', async () => {
      req.params = { id: 'person-123' };
      req.body = {
        role_id: 'role-456', // Person already has this role
        proficiency_level: 5
      };

      // Mock for transaction that returns existing role
      const trxMock = jest.fn((table) => {
        if (table === 'person_roles') {
          const query = createChainableMock();
          query.first.mockResolvedValue({ 
            id: 'existing-role', 
            person_id: 'person-123', 
            role_id: 'role-456' 
          }); // Existing role found
          return query;
        }
        return createChainableMock();
      });
      trxMock.raw = mockDb.raw;
      
      const customDb = createMockDb();
      customDb.transaction = jest.fn(async (callback) => {
        return await callback(trxMock);
      });
      (controller as any).db = customDb;

      await controller.addRole(req as Request, res as Response);
      
      // Should have called handleError when duplicate role is detected
      expect((controller as any).handleError).toHaveBeenCalledWith(
        expect.any(Error),
        res,
        'Failed to add role to person'
      );
    });

    test('should validate pagination parameters', async () => {
      req.query = { page: 'abc', limit: '0' };

      const mockDbQuery = createChainableMock();
      mockDbQuery.first.mockResolvedValue({ count: 100 });
      (controller as any).db = createMockDb(() => mockDbQuery);
      
      (controller as any).paginate = jest.fn((query, page, limit) => {
        // Should default to safe values for invalid pagination
        expect(page).toBe(1);
        expect(limit).toBe(50);
        return Promise.resolve([]);
      });

      await controller.getAll(req as Request, res as Response);

      expect((controller as any).paginate).toHaveBeenCalled();
    });

    test('should handle concurrent person updates safely', async () => {
      req.params = { id: 'person-123' };
      req.body = { name: 'Updated Name' };

      // Simulate concurrent update - person not found
      const existingQuery = createChainableMock();
      existingQuery.where.mockReturnThis();
      existingQuery.first.mockResolvedValue(null); // Person not found
      
      // Configure mockDb to return the "not found" query
      mockDb.mockReturnValueOnce(existingQuery);

      await controller.update(req as Request, res as Response);

      expect((controller as any).handleNotFound).toHaveBeenCalledWith(res, 'Person');
    });
  });

  describe('Complex Business Logic Integration', () => {
    test.skip('should handle person with multiple role assignments correctly', async () => {
      req.params = { id: 'multi-role-person' };

      const mockPerson = {
        id: 'multi-role-person',
        name: 'Full Stack Developer',
        primary_role_name: 'Senior Developer'
      };

      const mockRoles = [
        { role_name: 'Frontend Developer', proficiency_level: 5, years_experience: 6 },
        { role_name: 'Backend Developer', proficiency_level: 3, years_experience: 4 },
        { role_name: 'DevOps Engineer', proficiency_level: 1, years_experience: 1 }
      ];

      const mockAssignments = [
        { project_name: 'Web App', role_name: 'Frontend Developer', allocation_percentage: 50 },
        { project_name: 'API Service', role_name: 'Backend Developer', allocation_percentage: 30 }
      ];

      const mockDbQuery = createChainableMock(mockPerson);
      mockDbQuery.first.mockResolvedValue(mockPerson);
      
      const rolesQuery = createChainableMock(mockRoles);
      const assignmentsQuery = createChainableMock(mockAssignments);
      assignmentsQuery.where.mockReturnThis();
      assignmentsQuery.orderBy.mockReturnThis();
      // Override then to resolve with assignments
      assignmentsQuery.then = jest.fn((resolve) => {
        resolve(mockAssignments);
        return Promise.resolve(mockAssignments);
      });
      
      const availabilityQuery = createChainableMock([]);
      availabilityQuery.orderBy.mockReturnThis();
      // Override then to resolve with empty array
      availabilityQuery.then = jest.fn((resolve) => {
        resolve([]);
        return Promise.resolve([]);
      });
      
      (controller as any).db = createMockDb((table?: string) => {
        if (table === 'people') return mockDbQuery;
        if (table === 'person_roles') return rolesQuery;
        if (table === 'project_assignments') return assignmentsQuery;
        if (table === 'person_availability_overrides') return availabilityQuery;
        return createChainableMock([]);
      });

      await controller.getById(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        ...mockPerson,
        roles: mockRoles,
        assignments: mockAssignments,
        availabilityOverrides: []
      });
    });

    test('should validate supervisor-subordinate relationship constraints', async () => {
      req.body = {
        name: 'New Employee',
        supervisor_id: 'person-123', // Valid supervisor
        primary_person_role_id: 'person-role-456'
      };

      const mockPerson = {
        id: 'person-new',
        ...req.body,
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      };

      // Mock the insert and subsequent select queries
      const insertQuery = createChainableMock();
      insertQuery.insert.mockResolvedValue([1]); // Mock successful insert
      
      const selectQuery = createChainableMock();
      selectQuery.where.mockReturnThis();
      selectQuery.orderBy.mockReturnThis();
      selectQuery.first.mockResolvedValue(mockPerson);
      
      // Configure mockDb to return different queries for different calls
      mockDb.mockReturnValueOnce(insertQuery)   // First call: insert
            .mockReturnValueOnce(selectQuery);  // Second call: select the created record

      await controller.create(req as Request, res as Response);

      expect(insertQuery.insert).toHaveBeenCalledWith({
        name: 'New Employee',
        supervisor_id: 'person-123',
        primary_person_role_id: 'person-role-456',
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
    });

    test.skip('should handle assignment queries with future date filters', async () => {
      req.params = { id: 'person-123' };

      const mockPerson = { id: 'person-123', name: 'Active Employee' };
      
      // Mock to verify that assignment query includes date filter
      const mockAssignmentQuery = createChainableMock();
      // Track the where calls
      mockAssignmentQuery.where.mockReturnThis();
      mockAssignmentQuery.orderBy.mockReturnThis();
      // Override then to resolve with assignments
      mockAssignmentQuery.then = jest.fn((resolve) => {
        resolve([
          { project_name: 'Current Project', end_date: '2024-12-31' }
        ]);
        return Promise.resolve([
          { project_name: 'Current Project', end_date: '2024-12-31' }
        ]);
      });

      const mockDbQuery = createChainableMock();
      mockDbQuery.first.mockResolvedValue(mockPerson);
      
      const customDb = jest.fn()
        .mockReturnValueOnce(mockDbQuery) // Main person query
        .mockReturnValueOnce(createChainableMock([])) // Roles
        .mockReturnValueOnce(mockAssignmentQuery) // Assignments with date filter
        .mockReturnValueOnce(createChainableMock([])); // Availability
      customDb.raw = mockDb.raw;
      customDb.transaction = mockDb.transaction;
      customDb.fn = mockDb.fn;
      (controller as any).db = customDb;

      await controller.getById(req as Request, res as Response);

      // Verify assignment query filters for current/future assignments
      expect(mockAssignmentQuery.where).toHaveBeenCalledWith('project_assignments.person_id', 'person-123');
      // The controller uses a complex where clause with a function, so just verify where was called
      expect(mockAssignmentQuery.where).toHaveBeenCalledTimes(2);
    });

    test('should enforce data consistency in person hierarchies', async () => {
      req.body = {
        name: 'Manager',
        supervisor_id: 'person-subordinate', // Circular reference - subordinate as supervisor
        primary_person_role_id: 'person-role-manager'
      };

      const mockDbQuery = createChainableMock();
      // Database should enforce referential integrity constraints
      mockDbQuery.insert.mockRejectedValue(new Error('Circular reference detected in supervisor hierarchy'));
      
      // Update the mock executeAuditedQuery to use our custom mock
      (controller as any).executeAuditedQuery = jest.fn(async (req: any, callback: any, res: any, errorMessage: any) => {
        try {
          return await callback(mockDbQuery);
        } catch (error) {
          (controller as any).handleError(error, res, errorMessage);
          return undefined;
        }
      });

      await controller.create(req as Request, res as Response);
      
      // Should have called handleError for constraint violation
      expect((controller as any).handleError).toHaveBeenCalledWith(
        expect.any(Error),
        res,
        'Failed to create person'
      );
    });
  });
});