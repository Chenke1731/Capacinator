import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest, it } from '@jest/globals';
import { db, TEST_PROJECT_SUB_TYPE_ID } from './setup';
import { v4 as uuidv4 } from 'uuid';

// Mock the database module to use test database
jest.mock('../../src/server/database/index.js', () => ({
  db: require('./setup').db
}));

// Mock the notification scheduler to prevent cron jobs
jest.mock('../../src/server/services/NotificationScheduler.js', () => ({
  notificationScheduler: {
    scheduleAssignmentNotification: jest.fn(),
    sendAssignmentNotification: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  }
}));

import { ReportingController } from '../../src/server/api/controllers/ReportingController';

describe.skip('Utilization Report API Tests', () => {
  let reportingController: ReportingController;
  let testPersonId: string;
  let testProjectId: string;
  let testRoleId: string;
  let testLocationId: string;
  let testProjectTypeId: string;

  beforeAll(async () => {
    reportingController = new ReportingController();
    // Mock the db property on controller to use test database
    (reportingController as any).db = db;
  });

  beforeEach(async () => {
    // Create test data
    testLocationId = uuidv4();
    await db('locations').insert({
      id: testLocationId,
      name: 'Test Location',
      created_at: new Date(),
      updated_at: new Date()
    });

    testProjectTypeId = uuidv4();
    await db('project_types').insert({
      id: testProjectTypeId,
      name: 'Test Type',
      created_at: new Date(),
      updated_at: new Date()
    });

    testRoleId = uuidv4();
    await db('roles').insert({
      id: testRoleId,
      name: 'Developer',
      created_at: new Date(),
      updated_at: new Date()
    });

    testPersonId = uuidv4();
    await db('people').insert({
      id: testPersonId,
      name: 'Test Person',
      email: 'test@example.com',
      is_active: true,
      default_hours_per_day: 8,
      default_availability_percentage: 100,
      location_id: testLocationId,
      created_at: new Date(),
      updated_at: new Date()
    });

    testProjectId = uuidv4();
    await db('projects').insert({
      id: testProjectId,
      name: 'Test Project',
      project_type_id: testProjectTypeId,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      priority: 1,
      aspiration_start: '2025-01-01',
      aspiration_finish: '2025-12-31',
      include_in_demand: true,
      created_at: new Date(),
      updated_at: new Date()
    });
  });

  afterEach(async () => {
    // Clean up in reverse order due to foreign keys
    await db('project_assignments').delete();
    await db('person_roles').delete();
    if (testPersonId) await db('people').where('id', testPersonId).delete();
    if (testProjectId) await db('projects').where('id', testProjectId).delete();
    if (testRoleId) await db('roles').where('id', testRoleId).delete();
    if (testProjectTypeId) await db('project_types').where('id', testProjectTypeId).delete();
    if (testLocationId) await db('locations').where('id', testLocationId).delete();
  });

  test('should return empty utilization when no assignments exist', async () => {
    const req = {
      query: {
        startDate: '2025-09-01',
        endDate: '2025-12-31'
      }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await reportingController.getUtilizationReport(req as any, res as any);

    // Check if there was an error
    if (res.status.mock.calls.length > 0) {
      console.log('Error response:', res.status.mock.calls[0][0]);
      console.log('Error details:', res.json.mock.calls[0][0]);
    }

    expect(res.json).toHaveBeenCalled();
    const response = (res.json as jest.Mock).mock.calls[0][0];
    
    expect(response.utilizationData).toBeDefined();
    expect(response.utilizationData.length).toBe(1); // One active person
    expect(response.utilizationData[0].total_allocation_percentage).toBe(0);
    expect(response.summary.peopleOverutilized).toBe(0);
    expect(response.summary.peopleUnderutilized).toBe(1);
  });

  test('should calculate utilization correctly with single assignment', async () => {
    // Create assignment
    await db('project_assignments').insert({
      id: uuidv4(),
      project_id: testProjectId,
      person_id: testPersonId,
      role_id: testRoleId,
      allocation_percentage: 50,
      assignment_date_mode: 'fixed',
      start_date: '2025-09-01',
      end_date: '2025-12-31',
      created_at: new Date(),
      updated_at: new Date()
    });

    const req = {
      query: {
        startDate: '2025-09-01',
        endDate: '2025-12-31'
      }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await reportingController.getUtilizationReport(req as any, res as any);

    const response = (res.json as jest.Mock).mock.calls[0][0];
    
    expect(response.utilizationData.length).toBe(1);
    expect(response.utilizationData[0].total_allocation_percentage).toBe(50);
    expect(response.utilizationData[0].project_count).toBe(1);
    expect(response.summary.averageUtilization).toBe(50);
  });

  test('should aggregate multiple assignments correctly', async () => {
    // Create second project
    const secondProjectId = uuidv4();
    await db('projects').insert({
      id: secondProjectId,
      name: 'Second Project',
      project_type_id: testProjectTypeId,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      priority: 1,
      aspiration_start: '2025-01-01',
      aspiration_finish: '2025-12-31',
      include_in_demand: true,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Create two assignments
    await db('project_assignments').insert([
      {
        id: uuidv4(),
        project_id: testProjectId,
        person_id: testPersonId,
        role_id: testRoleId,
        allocation_percentage: 40,
        assignment_date_mode: 'fixed',
        start_date: '2025-09-01',
        end_date: '2025-12-31',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        project_id: secondProjectId,
        person_id: testPersonId,
        role_id: testRoleId,
        allocation_percentage: 60,
        assignment_date_mode: 'fixed',
        start_date: '2025-10-01',
        end_date: '2025-11-30',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    const req = {
      query: {
        startDate: '2025-09-01',
        endDate: '2025-12-31'
      }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await reportingController.getUtilizationReport(req as any, res as any);

    const response = (res.json as jest.Mock).mock.calls[0][0];
    
    expect(response.utilizationData[0].total_allocation_percentage).toBe(100);
    expect(response.utilizationData[0].project_count).toBe(2);
    expect(response.summary.peopleOverutilized).toBe(0);
    expect(response.summary.peopleUnderutilized).toBe(0); // Exactly 100%

    // Clean up second project (delete assignments first due to foreign key)
    await db('project_assignments').where('project_id', secondProjectId).delete();
    await db('projects').where('id', secondProjectId).delete();
  });

  test('should handle assignments with null dates by using project dates', async () => {
    // Create assignment with null dates
    await db('project_assignments').insert({
      id: uuidv4(),
      project_id: testProjectId,
      person_id: testPersonId,
      role_id: testRoleId,
      allocation_percentage: 75,
      assignment_date_mode: 'project',
      start_date: null,
      end_date: null,
      created_at: new Date(),
      updated_at: new Date()
    });

    const req = {
      query: {
        startDate: '2025-09-01',
        endDate: '2025-12-31'
      }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await reportingController.getUtilizationReport(req as any, res as any);

    const response = (res.json as jest.Mock).mock.calls[0][0];
    
    expect(response.utilizationData[0].total_allocation_percentage).toBe(75);
    expect(response.utilizationData[0].project_count).toBe(1);
  });

  test('should filter assignments by date range correctly', async () => {
    // Create assignments with different date ranges
    await db('project_assignments').insert([
      {
        id: uuidv4(),
        project_id: testProjectId,
        person_id: testPersonId,
        role_id: testRoleId,
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: '2025-01-01',
        end_date: '2025-03-31', // Before our query range
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        project_id: testProjectId,
        person_id: testPersonId,
        role_id: testRoleId,
        allocation_percentage: 30,
        assignment_date_mode: 'fixed',
        start_date: '2025-10-01',
        end_date: '2025-11-30', // Within our query range
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    const req = {
      query: {
        startDate: '2025-09-01',
        endDate: '2025-12-31'
      }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await reportingController.getUtilizationReport(req as any, res as any);

    const response = (res.json as jest.Mock).mock.calls[0][0];
    
    // Should only include the assignment within the date range
    expect(response.utilizationData[0].total_allocation_percentage).toBe(30);
    expect(response.utilizationData[0].project_count).toBe(1);
  });

  test('should handle overallocation correctly', async () => {
    // Create assignments that exceed 100%
    await db('project_assignments').insert([
      {
        id: uuidv4(),
        project_id: testProjectId,
        person_id: testPersonId,
        role_id: testRoleId,
        allocation_percentage: 80,
        assignment_date_mode: 'fixed',
        start_date: '2025-09-01',
        end_date: '2025-12-31',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        project_id: testProjectId,
        person_id: testPersonId,
        role_id: testRoleId,
        allocation_percentage: 70,
        assignment_date_mode: 'fixed',
        start_date: '2025-09-01',
        end_date: '2025-12-31',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    const req = {
      query: {
        startDate: '2025-09-01',
        endDate: '2025-12-31'
      }
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    await reportingController.getUtilizationReport(req as any, res as any);

    const response = (res.json as jest.Mock).mock.calls[0][0];
    
    expect(response.utilizationData[0].total_allocation_percentage).toBe(150);
    expect(response.utilizationData[0].allocation_status).toBe('OVER_ALLOCATED');
    expect(response.summary.peopleOverutilized).toBe(1);
    expect(response.summary.peakUtilization).toBe(150);
    
    // Check health summary shows warning status for 150% allocation
    expect(response.healthSummary).toBeDefined();
    expect(response.healthSummary.warning).toBe(1); // 100-150% allocation is warning
  });
});