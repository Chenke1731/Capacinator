import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { setupTestApp } from '../../utils/test-app-setup.js';
import { db } from '../setup.js';

/**
 * Controller Audit Integration Tests
 * 
 * These tests verify that all API controller operations automatically
 * capture audit context and log database modifications through the
 * AuditedBaseController integration.
 */

describe.skip('Controller Audit Integration Tests', () => {
  let app: any;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Set up the Express app
    app = await setupTestApp();
    // Create test user and get auth token
    const testUser = {
      id: 'controller-audit-user',
      name: 'Controller Test User',
      email: 'controller-audit@example.com',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Insert test user directly (this should be audited too)
    await db('people').insert(testUser);
    testUserId = testUser.id;

    // Skip auth for now - focus on audit functionality
    // TODO: Set up proper auth when auth routes are available
    authToken = 'test-token';
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await db('audit_log').where('changed_by', testUserId).del();
      await db('project_assignments').where('notes', 'like', '%controller-test%').del();
      await db('people').where('email', 'like', '%controller-audit%').del();
      await db('projects').where('name', 'like', '%Controller Test%').del();
      await db('roles').where('name', 'like', '%Controller Test%').del();
    } catch (error) {
      console.warn('Controller test cleanup failed:', error);
    }
  });

  describe('People Controller Audit Integration', () => {
    
    test('POST /api/people should audit person creation with request context', async () => {
      const personData = {
        name: 'Controller Test Person 1',
        email: 'controller-test-1@example.com',
        employee_id: 'CTRLTEST001',
        is_active: true
      };

      const response = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Controller-Test-Agent/1.0')
        .send(personData);

      expect(response.status).toBe(201);
      const createdPerson = response.body;

      // Verify audit entry was created with proper context
      const auditEntries = await db('audit_log')
        .where('table_name', 'people')
        .where('record_id', createdPerson.id)
        .where('action', 'CREATE');

      expect(auditEntries.length).toBe(1);
      const auditEntry = auditEntries[0];

      expect(auditEntry.changed_by).toBe(testUserId);
      expect(auditEntry.request_id).toBeDefined();
      expect(auditEntry.ip_address).toBeDefined();
      expect(auditEntry.user_agent).toBe('Controller-Test-Agent/1.0');
      expect(auditEntry.new_values).toContain(personData.name);
      expect(auditEntry.old_values).toBeNull();
    });

    test('PUT /api/people/:id should audit person updates with change tracking', async () => {
      // Create person first
      const createResponse = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Controller Test Person 2',
          email: 'controller-test-2@example.com',
          employee_id: 'CTRLTEST002',
          is_active: true
        });

      const personId = createResponse.body.id;

      // Update the person
      const updateData = {
        name: 'Controller Test Person 2 Updated',
        email: 'controller-test-2-updated@example.com',
        is_active: false
      };

      const updateResponse = await request(app)
        .put(`/api/people/${personId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Controller-Test-Agent/1.0')
        .send(updateData);

      expect(updateResponse.status).toBe(200);

      // Verify audit entry for update
      const auditEntries = await db('audit_log')
        .where('table_name', 'people')
        .where('record_id', personId)
        .where('action', 'UPDATE');

      expect(auditEntries.length).toBe(1);
      const auditEntry = auditEntries[0];

      expect(auditEntry.changed_by).toBe(testUserId);
      expect(auditEntry.old_values).toContain('Controller Test Person 2');
      expect(auditEntry.new_values).toContain('Controller Test Person 2 Updated');
      expect(auditEntry.old_values).toContain('true'); // is_active was true
      expect(auditEntry.new_values).toContain('false'); // is_active now false
    });

    test('DELETE /api/people/:id should audit person deletion', async () => {
      // Create person first
      const createResponse = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Controller Test Person 3',
          email: 'controller-test-3@example.com',
          employee_id: 'CTRLTEST003',
          is_active: true
        });

      const personId = createResponse.body.id;

      // Delete the person
      const deleteResponse = await request(app)
        .delete(`/api/people/${personId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Controller-Test-Agent/1.0');

      expect(deleteResponse.status).toBe(200);

      // Verify audit entry for deletion
      const auditEntries = await db('audit_log')
        .where('table_name', 'people')
        .where('record_id', personId)
        .where('action', 'DELETE');

      expect(auditEntries.length).toBe(1);
      const auditEntry = auditEntries[0];

      expect(auditEntry.changed_by).toBe(testUserId);
      expect(auditEntry.old_values).toContain('Controller Test Person 3');
      expect(auditEntry.new_values).toBeNull();
    });
  });

  describe('Projects Controller Audit Integration', () => {
    
    test('should audit all project CRUD operations with context', async () => {
      // CREATE
      const projectData = {
        name: 'Controller Test Project 1',
        description: 'Test project for controller audit',
        status: 'active',
        priority: 'high'
      };

      const createResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send(projectData);

      expect(createResponse.status).toBe(201);
      const projectId = createResponse.body.id;

      // Verify CREATE audit
      const createAuditEntries = await db('audit_log')
        .where('table_name', 'projects')
        .where('record_id', projectId)
        .where('action', 'CREATE');

      expect(createAuditEntries.length).toBe(1);
      expect(createAuditEntries[0].changed_by).toBe(testUserId);

      // UPDATE
      const updateResponse = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...projectData,
          name: 'Controller Test Project 1 Updated',
          status: 'completed'
        });

      expect(updateResponse.status).toBe(200);

      // Verify UPDATE audit
      const updateAuditEntries = await db('audit_log')
        .where('table_name', 'projects')
        .where('record_id', projectId)
        .where('action', 'UPDATE');

      expect(updateAuditEntries.length).toBe(1);
      expect(updateAuditEntries[0].changed_by).toBe(testUserId);

      // DELETE
      const deleteResponse = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);

      // Verify DELETE audit
      const deleteAuditEntries = await db('audit_log')
        .where('table_name', 'projects')
        .where('record_id', projectId)
        .where('action', 'DELETE');

      expect(deleteAuditEntries.length).toBe(1);
      expect(deleteAuditEntries[0].changed_by).toBe(testUserId);
    });
  });

  describe('Assignments Controller Audit Integration', () => {
    
    test('should audit assignment operations with proper table mapping', async () => {
      // Create test dependencies
      const personResponse = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Assignment Test Person',
          email: 'assignment-test@example.com',
          employee_id: 'ASGNTEST001'
        });

      const projectResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Assignment Test Project',
          description: 'Test project for assignments'
        });

      const roleResponse = await request(app)
        .post('/api/roles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Assignment Test Role',
          is_assignable: true
        });

      // Create assignment
      const assignmentData = {
        project_id: projectResponse.body.id,
        person_id: personResponse.body.id,
        role_id: roleResponse.body.id,
        allocation_percentage: 75,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'controller-test assignment'
      };

      const createAssignmentResponse = await request(app)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(assignmentData);

      expect(createAssignmentResponse.status).toBe(201);
      const assignmentId = createAssignmentResponse.body.id;

      // Verify assignment audit (should use 'assignments' table name due to mapping)
      const assignmentAuditEntries = await db('audit_log')
        .where('table_name', 'assignments')
        .where('record_id', assignmentId)
        .where('action', 'CREATE');

      expect(assignmentAuditEntries.length).toBe(1);
      expect(assignmentAuditEntries[0].changed_by).toBe(testUserId);
      expect(assignmentAuditEntries[0].new_values).toContain('controller-test assignment');
    });
  });

  describe('Availability Controller Audit Integration', () => {
    
    test('should audit availability overrides with table name mapping', async () => {
      // Create test person
      const personResponse = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Availability Test Person',
          email: 'availability-test@example.com',
          employee_id: 'AVAILTEST001'
        });

      const personId = personResponse.body.id;

      // Create availability override
      const availabilityData = {
        person_id: personId,
        start_date: '2024-12-25',
        end_date: '2024-12-31',
        override_type: 'PTO',
        availability_hours: 0,
        notes: 'controller-test holiday vacation'
      };

      const createAvailabilityResponse = await request(app)
        .post('/api/availability')
        .set('Authorization', `Bearer ${authToken}`)
        .send(availabilityData);

      expect(createAvailabilityResponse.status).toBe(201);
      const availabilityId = createAvailabilityResponse.body.id;

      // Verify availability audit (should use 'availability' table name due to mapping)
      const availabilityAuditEntries = await db('audit_log')
        .where('table_name', 'availability')
        .where('record_id', availabilityId)
        .where('action', 'CREATE');

      expect(availabilityAuditEntries.length).toBe(1);
      expect(availabilityAuditEntries[0].changed_by).toBe(testUserId);
      expect(availabilityAuditEntries[0].new_values).toContain('PTO');

      // Test DELETE operation as mentioned in the original user issue
      const deleteAvailabilityResponse = await request(app)
        .delete(`/api/availability/${availabilityId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteAvailabilityResponse.status).toBe(200);

      // Verify availability deletion audit
      const deleteAuditEntries = await db('audit_log')
        .where('table_name', 'availability')
        .where('record_id', availabilityId)
        .where('action', 'DELETE');

      expect(deleteAuditEntries.length).toBe(1);
      expect(deleteAuditEntries[0].changed_by).toBe(testUserId);
      expect(deleteAuditEntries[0].old_values).toContain('PTO');
      expect(deleteAuditEntries[0].new_values).toBeNull();
    });
  });

  describe('Scenarios Controller Audit Integration', () => {
    
    test('should audit scenario operations and scenario assignments', async () => {
      // Create scenario
      const scenarioData = {
        name: 'Controller Test Scenario',
        description: 'Test scenario for controller audit',
        scenario_type: 'what_if'
      };

      const createScenarioResponse = await request(app)
        .post('/api/scenarios')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scenarioData);

      expect(createScenarioResponse.status).toBe(201);
      const scenarioId = createScenarioResponse.body.id;

      // Verify scenario creation audit
      const scenarioAuditEntries = await db('audit_log')
        .where('table_name', 'scenarios')
        .where('record_id', scenarioId)
        .where('action', 'CREATE');

      expect(scenarioAuditEntries.length).toBe(1);
      expect(scenarioAuditEntries[0].changed_by).toBe(testUserId);

      // Create scenario assignment
      const personResponse = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Scenario Test Person',
          email: 'scenario-test@example.com'
        });

      const projectResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Scenario Test Project'
        });

      const scenarioAssignmentData = {
        scenario_id: scenarioId,
        project_id: projectResponse.body.id,
        person_id: personResponse.body.id,
        allocation_percentage: 50,
        notes: 'controller-test scenario assignment'
      };

      const createScenarioAssignmentResponse = await request(app)
        .post('/api/scenario-assignments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scenarioAssignmentData);

      expect(createScenarioAssignmentResponse.status).toBe(201);
      const scenarioAssignmentId = createScenarioAssignmentResponse.body.id;

      // Verify scenario assignment audit
      const scenarioAssignmentAuditEntries = await db('audit_log')
        .where('table_name', 'scenario_project_assignments')
        .where('record_id', scenarioAssignmentId)
        .where('action', 'CREATE');

      expect(scenarioAssignmentAuditEntries.length).toBe(1);
      expect(scenarioAssignmentAuditEntries[0].changed_by).toBe(testUserId);
    });
  });

  describe('Request Context Propagation', () => {
    
    test('should maintain consistent request context across related operations', async () => {
      // Create operations that involve multiple table modifications
      const batchData = {
        people: [
          { name: 'Batch Person 1', email: 'batch1@example.com' },
          { name: 'Batch Person 2', email: 'batch2@example.com' }
        ],
        projects: [
          { name: 'Batch Project 1', description: 'Test project 1' }
        ]
      };

      const batchResponse = await request(app)
        .post('/api/batch-create')
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Controller-Batch-Test/1.0')
        .send(batchData);

      // Skip if batch endpoint doesn't exist
      if (batchResponse.status !== 404) {
        expect(batchResponse.status).toBe(201);

        // Get all audit entries from this request
        const allAuditEntries = await db('audit_log')
          .where('changed_by', testUserId)
          .where('user_agent', 'Controller-Batch-Test/1.0')
          .orderBy('created_at', 'desc')
          .limit(3); // 2 people + 1 project

        expect(allAuditEntries.length).toBeGreaterThanOrEqual(3);

        // All entries should have the same request_id
        const requestId = allAuditEntries[0].request_id;
        for (const entry of allAuditEntries) {
          expect(entry.request_id).toBe(requestId);
          expect(entry.user_agent).toBe('Controller-Batch-Test/1.0');
        }
      }
    });

    test('should handle errors without leaving partial audit trails', async () => {
      // Attempt to create person with invalid data
      const invalidPersonData = {
        name: '', // Invalid: empty name
        email: 'invalid-email-format', // Invalid: bad email
        employee_id: null // Invalid: null employee_id
      };

      const response = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Controller-Error-Test/1.0')
        .send(invalidPersonData);

      expect(response.status).toBeGreaterThanOrEqual(400); // Some error status

      // Verify no audit entry was created for failed operation
      const errorAuditEntries = await db('audit_log')
        .where('user_agent', 'Controller-Error-Test/1.0');

      expect(errorAuditEntries.length).toBe(0);
    });
  });

  describe('Audit Metadata Completeness', () => {
    
    test('should capture all required audit metadata from request context', async () => {
      const personData = {
        name: 'Metadata Test Person',
        email: 'metadata-test@example.com',
        employee_id: 'METATEST001'
      };

      const response = await request(app)
        .post('/api/people')
        .set('Authorization', `Bearer ${authToken}`)
        .set('User-Agent', 'Metadata-Test-Agent/2.0')
        .set('X-Real-IP', '192.168.1.100')
        .send(personData);

      expect(response.status).toBe(201);
      const personId = response.body.id;

      // Verify complete audit metadata
      const auditEntries = await db('audit_log')
        .where('table_name', 'people')
        .where('record_id', personId)
        .where('action', 'CREATE');

      expect(auditEntries.length).toBe(1);
      const auditEntry = auditEntries[0];

      // Required fields
      expect(auditEntry.id).toBeDefined();
      expect(auditEntry.table_name).toBe('people');
      expect(auditEntry.record_id).toBe(personId);
      expect(auditEntry.action).toBe('CREATE');
      expect(auditEntry.changed_by).toBe(testUserId);
      expect(auditEntry.changed_at).toBeDefined();

      // Request context fields
      expect(auditEntry.request_id).toBeDefined();
      expect(auditEntry.ip_address).toBeDefined();
      expect(auditEntry.user_agent).toBe('Metadata-Test-Agent/2.0');

      // Data change fields
      expect(auditEntry.old_values).toBeNull();
      expect(auditEntry.new_values).toBeDefined();
      expect(auditEntry.new_values).toContain(personData.name);
      expect(auditEntry.new_values).toContain(personData.email);

      // Timestamps
      expect(auditEntry.created_at).toBeDefined();
      expect(auditEntry.updated_at).toBeDefined();
    });
  });
});