import { db, TEST_PROJECT_TYPE_ID, TEST_PROJECT_SUB_TYPE_ID } from './setup';
import type { Request, Response } from 'express';

// Mock Express request/response for controller tests
export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    user: { id: 'test-user' },
    ...overrides
  };
}

export function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as any,
    json: jest.fn().mockReturnThis() as any,
    send: jest.fn().mockReturnThis() as any,
    setHeader: jest.fn().mockReturnThis() as any,
  };
  return res;
}

// Helper to clean database before tests
export async function cleanDatabase() {
  const tables = [
    'scenario_merge_conflicts',
    'scenario_project_assignments', 
    'scenario_project_phases',
    'scenario_projects',
    'scenarios',
    'project_phase_dependencies',
    'project_phases_timeline',
    'project_assignments',
    'assignments',
    'person_availability_overrides',
    'audit_log',
    'project_phases',
    'projects',
    'people',
    'roles',
    'locations',
    'project_types',
    'project_sub_types',
    'notifications',
    'user_permissions',
    'user_permission_overrides'
  ];

  for (const table of tables) {
    try {
      if (await db.schema.hasTable(table)) {
        await db(table).del();
      }
    } catch (error) {
      // Ignore errors for non-existent tables
    }
  }

  // 自愈: 清库会删掉 setup 种子的夹具子类型(projects.project_sub_type_id
  // NOT NULL+FK),消费方下一轮建项目前必须有人重种——统一在此重种。
  await db('project_types').insert({ id: TEST_PROJECT_TYPE_ID, name: 'Fixture Root Type' }).catch(() => {});
  await db('project_sub_types').insert({ id: TEST_PROJECT_SUB_TYPE_ID, name: 'SR', project_type_id: TEST_PROJECT_TYPE_ID }).catch(() => {});
}

// Helper to create test data
export async function createTestData() {
  const testData = {
    roleId: 'role-test-1',
    personId: 'person-test-1',
    projectId: 'project-test-1',
    locationId: 'location-test-1',
    projectTypeId: 'type-test-1'
  };

  // Create location
  await db('locations').insert({
    id: testData.locationId,
    name: 'Test Location',
    created_at: new Date(),
    updated_at: new Date()
  });

  // Create project type
  await db('project_types').insert({
    id: testData.projectTypeId,
    name: 'Test Type',
    created_at: new Date(),
    updated_at: new Date()
  });

  // Create role
  await db('roles').insert({
    id: testData.roleId,
    name: 'Test Role',
    created_at: new Date(),
    updated_at: new Date()
  });

  // Create person
  await db('people').insert({
    id: testData.personId,
    name: 'Test Person',
    email: 'test@example.com',
    location_id: testData.locationId,
    default_availability_percentage: 100,
    created_at: new Date(),
    updated_at: new Date()
  });

  // Create project
  await db('projects').insert({
    id: testData.projectId,
    name: 'Test Project',
    project_type_id: testData.projectTypeId,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID, // 001 真身 NOT NULL+FK
    location_id: testData.locationId,
    // status/created_by 已删(2026-10-13 漂移守卫): 真实 projects 无此列
    created_at: new Date(),
    updated_at: new Date()
  });

  return testData;
}

export { db };