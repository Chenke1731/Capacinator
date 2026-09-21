import { PeopleController } from '../PeopleController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

describe('PeopleController', () => {
  let controller: PeopleController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    controller = new PeopleController();

    // Create mock logger
    const mockLogger = {
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
      logger: mockLogger
    };

    // Create mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    // Create mock database using the reusable helper
    mockDb = createMockDb();

    // Override transaction to return the same mock (so queued data is available)
    mockDb.transaction = jest.fn().mockImplementation(async (callback) => {
      return await callback(mockDb);
    });

    // Replace controller's db AND auditedDb with our mock
    (controller as any).db = mockDb;
    (controller as any)._auditedDb = mockDb;

    // Reset mock data for clean state
    mockDb._reset();
  });

  describe('getAll - List People', () => {
    it('returns paginated list of people', async () => {
      const mockPeople = [
        {
          id: 'person-1',
          name: 'John Doe',
          email: 'john@example.com',
          supervisor_name: 'Jane Manager',
          primary_role_name: 'Developer',
          location_name: 'New York'
        }
      ];

      // getAll makes 2 queries: one for people list, one for count
      mockDb._queueQueryResult(mockPeople); // People query
      mockDb._setCountResult(1); // Count query

      await controller.getAll(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockPeople,
          pagination: expect.objectContaining({
            page: 1,
            limit: 50,
            total: 1,
            totalPages: 1
          })
        })
      );
    });

    it('handles pagination parameters', async () => {
      mockReq.query = { page: '2', limit: '10' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(25);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb().limit).toHaveBeenCalledWith(10);
      expect(mockDb().offset).toHaveBeenCalledWith(10); // (page 2 - 1) * 10
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            page: 2,
            limit: 10,
            total: 25,
            totalPages: 3
          })
        })
      );
    });

    it('filters by primary_role_id', async () => {
      mockReq.query = { primary_role_id: 'role-123' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb().where).toHaveBeenCalledWith('primary_role.id', 'role-123');
    });

    it('filters by supervisor_id', async () => {
      mockReq.query = { supervisor_id: 'super-456' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb().where).toHaveBeenCalledWith('people.supervisor_id', 'super-456');
    });

    it('filters by worker_type', async () => {
      mockReq.query = { worker_type: 'FTE' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb().where).toHaveBeenCalledWith('people.worker_type', 'FTE');
    });

    it('filters by location_id', async () => {
      mockReq.query = { location_id: 'loc-789' };

      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockDb().where).toHaveBeenCalledWith('people.location_id', 'loc-789');
    });

    it('returns empty array when no people found', async () => {
      mockDb._setQueryResult([]);
      mockDb._setCountResult(0);

      await controller.getAll(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [],
          pagination: expect.objectContaining({
            total: 0,
            totalPages: 0
          })
        })
      );
    });
  });

  describe('getById - Get Single Person', () => {
    it('returns person with roles and assignments', async () => {
      const mockPerson = {
        id: 'person-1',
        name: 'John Doe',
        email: 'john@example.com',
        supervisor_name: 'Manager',
        primary_role_name: 'Developer'
      };

      const mockRoles = [{ id: 'role-1', role_name: 'Developer', proficiency_level: 4 }];
      const mockAssignments = [{ id: 'assign-1', project_name: 'Project Alpha' }];
      const mockAvailability = [{ id: 'avail-1', start_date: '2025-01-01' }];

      mockReq.params = { id: 'person-1' };

      // Chain the queries → Use queue methods
      mockDb._queueFirstResult(mockPerson);      // Person lookup
      mockDb._queueQueryResult(mockRoles);        // Roles query
      mockDb._queueQueryResult(mockAssignments);  // Assignments query
      mockDb._queueQueryResult(mockAvailability); // Availability query

      await controller.getById(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockPerson,
          roles: mockRoles,
          assignments: mockAssignments,
          availabilityOverrides: mockAvailability
        })
      );
    });

    it('returns 404 when person not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockDb._setFirstResult(null);

      await controller.getById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Person not found'
      });
    });
  });

  describe('create - Create Person', () => {
    it('creates a new person with valid data', async () => {
      const newPerson = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        primary_person_role_id: 'role-1',
        worker_type: 'FTE',
        default_availability_percentage: 100,
        default_hours_per_day: 8
      };

      mockReq.body = newPerson;

      const createdPerson = { id: 'person-new', ...newPerson };
      mockDb._queueInsertResult([{ id: 'person-new' }]); // Insert
      mockDb._queueFirstResult(createdPerson);        // Fetch created

      await controller.create(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ...newPerson,
          created_at: expect.any(Date),
          updated_at: expect.any(Date)
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(createdPerson);
    });

    it('filters out invalid fields before insert', async () => {
      mockReq.body = {
        name: 'Test Person',
        email: 'test@example.com',
        invalidField: 'should be removed',
        anotherBadField: 'also removed'
      };

      mockDb._queueInsertResult([{ id: '1' }]);
      mockDb._queueFirstResult({ id: '1' });

      await controller.create(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      const insertCall = mockDb().insert.mock.calls[0][0];
      expect(insertCall).not.toHaveProperty('invalidField');
      expect(insertCall).not.toHaveProperty('anotherBadField');
      expect(insertCall).toHaveProperty('name');
      expect(insertCall).toHaveProperty('email');
    });

    it('sets created_at and updated_at timestamps', async () => {
      mockReq.body = {
        name: 'Test',
        email: 'test@test.com'
      };

      mockDb._queueInsertResult([{ id: '1' }]);
      mockDb._queueFirstResult({ id: '1' });

      await controller.create(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          created_at: expect.any(Date),
          updated_at: expect.any(Date)
        })
      );
    });
  });

  describe('update - Update Person', () => {
    it('updates existing person', async () => {
      const existingPerson = {
        id: 'person-1',
        name: 'Old Name',
        email: 'old@example.com'
      };

      const updateData = {
        name: 'New Name',
        email: 'new@example.com'
      };

      const updatedPerson = { ...existingPerson, ...updateData };

      mockReq.params = { id: 'person-1' };
      mockReq.body = updateData;

      mockDb._queueFirstResult(existingPerson);  // Check existing
      mockDb._queueFirstResult(updatedPerson);    // Get updated
      mockDb._queueUpdateResult([updatedPerson]); // Update result

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Name',
          email: 'new@example.com',
          updated_at: expect.any(Date)
        })
      );
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('returns 404 when updating non-existent person', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockReq.body = { name: 'Test' };

      mockDb._setFirstResult(null);

      await controller.update(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockDb().update).not.toHaveBeenCalled();
    });

    it('converts empty strings to null for foreign keys', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = {
        name: 'Test',
        supervisor_id: '',
        location_id: '',
        primary_person_role_id: ''
      };

      mockDb._queueFirstResult({ id: 'person-1' });
      mockDb._queueFirstResult({ id: 'person-1' });
      mockDb._queueUpdateResult([{ id: 'person-1' }]);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().update).toHaveBeenCalledWith(
        expect.objectContaining({
          supervisor_id: null,
          location_id: null,
          primary_person_role_id: null
        })
      );
    });

    it('filters out invalid fields from update', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = {
        name: 'Valid',
        invalidField: 'removed'
      };

      mockDb._queueFirstResult({ id: 'person-1' });
      mockDb._queueFirstResult({ id: 'person-1' });
      mockDb._queueUpdateResult([{ id: 'person-1' }]);

      await controller.update(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      const updateCall = mockDb().update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('invalidField');
    });
  });

  describe('delete - Delete Person', () => {
    it('deletes existing person', async () => {
      mockReq.params = { id: 'person-1' };

      mockDb._setFirstResult({ id: 'person-1' });
      mockDb._setDeleteResult(1);

      await controller.delete(mockReq, mockRes);

      expect(mockDb().del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Person deleted successfully'
      });
    });

    it('returns 404 when deleting non-existent person', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockDb._setFirstResult(null);

      await controller.delete(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockDb().del).not.toHaveBeenCalled();
    });
  });

  describe('getUtilization - Get Utilization Data', () => {
    it('returns utilization data from view', async () => {
      const mockUtilization = [
        { person_id: 'person-1', utilization: 75 },
        { person_id: 'person-2', utilization: 90 }
      ];

      mockDb._setQueryResult(mockUtilization);

      await controller.getUtilization(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('person_utilization_view');
      expect(mockRes.json).toHaveBeenCalledWith(mockUtilization);
    });
  });

  describe('getAvailability - Get Availability Data', () => {
    it('returns availability data from view', async () => {
      const mockAvailability = [
        { person_id: 'person-1', available: 100 },
        { person_id: 'person-2', available: 80 }
      ];

      mockDb._setQueryResult(mockAvailability);

      await controller.getAvailability(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('person_availability_view');
      expect(mockRes.json).toHaveBeenCalledWith(mockAvailability);
    });
  });

  describe('getPersonUtilizationTimeline - Get Person Timeline', () => {
    it('returns timeline for person with assignments', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.query = {
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      };

      const mockPerson = {
        name: 'John Doe',
        default_availability_percentage: 100,
        default_hours_per_day: 8
      };

      const mockAssignments = [
        {
          allocation_percentage: 50,
          start_date: '2025-01-01',
          end_date: '2025-06-30',
          project_name: 'Project A'
        }
      ];

      mockDb._queueFirstResult(mockPerson);
      mockDb._queueQueryResult(mockAssignments);

      await controller.getPersonUtilizationTimeline(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          personName: 'John Doe',
          defaultAvailability: 100,
          timeline: expect.any(Array)
        })
      );
    });

    it('returns 404 when person not found', async () => {
      mockReq.params = { id: 'nonexistent' };
      mockDb._setFirstResult(null);

      await controller.getPersonUtilizationTimeline(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('filters assignments by date range', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.query = {
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      };

      mockDb._queueFirstResult({ name: 'Test', default_availability_percentage: 100 });
      mockDb._queueQueryResult([]);

      await controller.getPersonUtilizationTimeline(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      // assignments_view columns, undated rows treated as ongoing
      expect(mockDb().where).toHaveBeenCalledWith('av.person_id', 'person-1');
      expect(mockDb().where).toHaveBeenCalledWith('av.status', 'active');
      expect(mockDb().whereRaw).toHaveBeenCalledWith(
        '(av.computed_end_date IS NULL OR av.computed_end_date >= ?)',
        ['2025-01-01']
      );
      expect(mockDb().whereRaw).toHaveBeenCalledWith(
        '(av.computed_start_date IS NULL OR av.computed_start_date <= ?)',
        ['2025-12-31']
      );
    });
  });

  describe('addRole - Add Role to Person', () => {
    it('adds role with proficiency level', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = {
        role_id: 'role-1',
        proficiency_level: 4,
        is_primary: false
      };

      const mockInsertedRole = {
        id: 'pr-1',
        person_id: 'person-1',
        role_id: 'role-1',
        proficiency_level: 4,
        is_primary: false
      };

      const mockPersonRole = {
        ...mockInsertedRole,
        role_name: 'Developer'
      };

      mockDb._queueFirstResult(null); // No existing role
      mockDb._queueInsertResult([mockInsertedRole]); // Insert returns full object
      mockDb._queueFirstResult(mockPersonRole); // Return created role with join

      await controller.addRole(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().insert).toHaveBeenCalledWith({
        person_id: 'person-1',
        role_id: 'role-1',
        proficiency_level: 4,
        is_primary: false
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('validates proficiency level is between 1 and 5', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = {
        role_id: 'role-1',
        proficiency_level: 6
      };

      await controller.addRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Proficiency level must be between 1 (novice) and 5 (expert)'
      });
    });

    it('sets default proficiency level to 3', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = { role_id: 'role-1' };

      const mockInsertedRole = {
        id: 'pr-1',
        person_id: 'person-1',
        role_id: 'role-1',
        proficiency_level: 3,
        is_primary: false
      };

      mockDb._queueFirstResult(null);
      mockDb._queueInsertResult([mockInsertedRole]);
      mockDb._queueFirstResult({ ...mockInsertedRole, role_name: 'Developer' });

      await controller.addRole(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          proficiency_level: 3
        })
      );
    });

    it('removes primary flag from other roles when setting new primary', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = {
        role_id: 'role-1',
        is_primary: true
      };

      const mockInsertedRole = {
        id: 'pr-1',
        person_id: 'person-1',
        role_id: 'role-1',
        proficiency_level: 3,
        is_primary: true
      };

      mockDb._queueFirstResult(null);
      mockDb._queueUpdateResult([{ is_primary: false }]); // Clear other primary roles
      mockDb._queueInsertResult([mockInsertedRole]); // Insert new role
      mockDb._queueUpdateResult([{ primary_person_role_id: 'pr-1' }]); // Update people table
      mockDb._queueFirstResult({ ...mockInsertedRole, role_name: 'Developer' }); // Return created role

      await controller.addRole(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      // Should clear other primary roles
      expect(mockDb().update).toHaveBeenCalledWith({ is_primary: false });
      // Should update people table with primary_person_role_id
      expect(mockDb().update).toHaveBeenCalledWith({ primary_person_role_id: 'pr-1' });
    });

    it('returns error when role already exists for person', async () => {
      mockReq.params = { id: 'person-1' };
      mockReq.body = { role_id: 'role-1' };

      mockDb._setFirstResult({ id: 'existing-pr' });

      await controller.addRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockDb().insert).not.toHaveBeenCalled();
    });
  });

  describe('getRoles - Get Person Roles', () => {
    it('returns all roles for person', async () => {
      mockReq.params = { id: 'person-1' };

      const mockRoles = [
        {
          id: 'pr-1',
          role_name: 'Developer',
          proficiency_level: 4,
          is_primary: true
        },
        {
          id: 'pr-2',
          role_name: 'Designer',
          proficiency_level: 3,
          is_primary: false
        }
      ];

      mockDb._setQueryResult(mockRoles);

      await controller.getRoles(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ data: mockRoles });
    });

    it('orders roles by primary status and proficiency', async () => {
      mockReq.params = { id: 'person-1' };

      mockDb._setQueryResult([]);

      await controller.getRoles(mockReq, mockRes);

      expect(mockDb().orderBy).toHaveBeenCalledWith('pr.is_primary', 'desc');
      expect(mockDb().orderBy).toHaveBeenCalledWith('pr.proficiency_level', 'desc');
    });
  });

  describe('updateRole - Update Person Role', () => {
    it('updates role proficiency level', async () => {
      mockReq.params = { id: 'person-1', roleId: 'role-1' };
      mockReq.body = { proficiency_level: 5 };

      const existingRole = { id: 'pr-1', proficiency_level: 3 };
      const updatedRole = { ...existingRole, proficiency_level: 5 };

      mockDb._queueFirstResult(existingRole);
      mockDb._queueFirstResult(updatedRole);
      mockDb._queueUpdateResult([updatedRole]);

      await controller.updateRole(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().update).toHaveBeenCalledWith({ proficiency_level: 5 });
      expect(mockRes.json).toHaveBeenCalledWith({ data: updatedRole });
    });

    it('validates proficiency level range', async () => {
      mockReq.params = { id: 'person-1', roleId: 'role-1' };
      mockReq.body = { proficiency_level: 0 };

      await controller.updateRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 when role not found', async () => {
      mockReq.params = { id: 'person-1', roleId: 'nonexistent' };
      mockReq.body = { proficiency_level: 4 };

      mockDb._setFirstResult(null);

      await controller.updateRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('updates primary flag and clears others', async () => {
      mockReq.params = { id: 'person-1', roleId: 'role-1' };
      mockReq.body = { is_primary: true };

      const existingRole = { id: 'pr-1', person_id: 'person-1', role_id: 'role-1', proficiency_level: 3, is_primary: false };
      const updatedRole = { ...existingRole, is_primary: true, role_name: 'Developer' };

      mockDb._queueFirstResult(existingRole); // Check existing
      mockDb._queueUpdateResult([{ is_primary: false }]); // Clear other primary roles
      mockDb._queueUpdateResult([updatedRole]); // Update this role
      mockDb._queueUpdateResult([{ primary_person_role_id: 'pr-1' }]); // Update people table
      mockDb._queueFirstResult(updatedRole); // Return updated role

      await controller.updateRole(mockReq, mockRes);
      await flushPromises(); // Wait for async operations to complete

      expect(mockDb().update).toHaveBeenCalledWith({ is_primary: false });
      expect(mockDb().update).toHaveBeenCalledWith({ is_primary: true });
    });
  });

  describe('removeRole - Remove Role from Person', () => {
    it('deletes role assignment', async () => {
      mockReq.params = { id: 'person-1', roleId: 'role-1' };

      mockDb._setDeleteResult(1);

      await controller.removeRole(mockReq, mockRes);

      expect(mockDb().del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Role removed from person successfully'
      });
    });

    it('returns 404 when role assignment not found', async () => {
      mockReq.params = { id: 'person-1', roleId: 'nonexistent' };

      mockDb._setDeleteResult(0);

      await controller.removeRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteTestData - Delete Test People', () => {
    it('deletes people with Test_ prefix in name', async () => {
      mockDb._setDeleteResult(5);

      await controller.deleteTestData(mockReq, mockRes);

      expect(mockDb().where).toHaveBeenCalledWith('name', 'like', 'Test_%');
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Deleted 5 test people'
      });
    });
  });

  describe('Error Handling', () => {
    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');

      // Make leftJoin throw an error (called early in getAll)
      mockDb.leftJoin = jest.fn().mockImplementation(() => {
        throw dbError;
      });

      await controller.getAll(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch people'
        })
      );
    });
  });
});
