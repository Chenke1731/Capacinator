/**
 * Test Isolation Utilities for Integration Tests
 *
 * Provides per-test data isolation through:
 * 1. Transaction-based isolation with rollback
 * 2. Per-test context with unique prefixes
 * 3. Automatic cleanup of created entities
 *
 * Usage:
 * ```typescript
 * import { useTestIsolation, createIsolatedTestData } from './test-isolation';
 *
 * describe('My Test Suite', () => {
 *   const { beforeEachTest, afterEachTest, getTestContext } = useTestIsolation();
 *
 *   beforeEach(beforeEachTest);
 *   afterEach(afterEachTest);
 *
 *   it('should do something', async () => {
 *     const ctx = getTestContext();
 *     const user = await createIsolatedTestData.user(ctx);
 *     // Test code...
 *     // Data is automatically rolled back after test
 *   });
 * });
 * ```
 */

import { Knex } from 'knex';
import { db, TEST_PROJECT_SUB_TYPE_ID } from './setup';

/**
 * Represents a unique test context for isolation
 */
export interface TestIsolationContext {
  /** Unique identifier for this test run */
  id: string;
  /** Prefix for all created entities */
  prefix: string;
  /** Timestamp when context was created */
  createdAt: number;
  /** Transaction for rollback-based isolation (if available) */
  transaction?: Knex.Transaction;
  /** Track created entity IDs for cleanup */
  createdIds: {
    people: string[];
    projects: string[];
    assignments: string[];
    scenarios: string[];
    projectPhases: string[];
    roles: string[];
    locations: string[];
  };
  /** Whether savepoint-based isolation is being used */
  usingSavepoint: boolean;
  /** Savepoint name for nested transaction support */
  savepointName?: string;
}

/**
 * Generate a unique test context ID
 */
function generateContextId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `test_${timestamp}_${random}`;
}

/**
 * Generate a unique prefix for test entities
 */
function generatePrefix(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `t${timestamp}${random}`;
}

/**
 * Current test context (set per test)
 */
let currentContext: TestIsolationContext | null = null;

/**
 * Get the current test context
 */
export function getTestContext(): TestIsolationContext {
  if (!currentContext) {
    throw new Error('No test context available. Make sure to use beforeEachTest hook.');
  }
  return currentContext;
}

/**
 * Create a new isolated test context
 */
export async function createTestContext(): Promise<TestIsolationContext> {
  const context: TestIsolationContext = {
    id: generateContextId(),
    prefix: generatePrefix(),
    createdAt: Date.now(),
    createdIds: {
      people: [],
      projects: [],
      assignments: [],
      scenarios: [],
      projectPhases: [],
      roles: [],
      locations: [],
    },
    usingSavepoint: false,
  };

  // Try to use savepoint for isolation (SQLite with better-sqlite3 supports this)
  try {
    const savepointName = `sp_${context.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    await db.raw(`SAVEPOINT ${savepointName}`);
    context.usingSavepoint = true;
    context.savepointName = savepointName;
    console.log(`[TestIsolation] Created savepoint: ${savepointName}`);
  } catch (error) {
    // Savepoint not available, will use cleanup-based isolation
    console.log('[TestIsolation] Savepoint not available, using cleanup-based isolation');
  }

  currentContext = context;
  return context;
}

/**
 * Clean up the test context and rollback all changes
 */
export async function cleanupTestContext(context: TestIsolationContext): Promise<void> {
  if (context.usingSavepoint && context.savepointName) {
    // Rollback to savepoint
    try {
      await db.raw(`ROLLBACK TO SAVEPOINT ${context.savepointName}`);
      await db.raw(`RELEASE SAVEPOINT ${context.savepointName}`);
      console.log(`[TestIsolation] Rolled back to savepoint: ${context.savepointName}`);
    } catch (error) {
      console.warn('[TestIsolation] Failed to rollback savepoint:', error);
      // Fall back to manual cleanup
      await manualCleanup(context);
    }
  } else {
    // Manual cleanup of created entities
    await manualCleanup(context);
  }

  if (currentContext === context) {
    currentContext = null;
  }
}

/**
 * Manual cleanup of created entities
 */
async function manualCleanup(context: TestIsolationContext): Promise<void> {
  // Delete in reverse dependency order
  const deletionOrder: Array<{ table: string; type: keyof TestIsolationContext['createdIds'] }> = [
    { table: 'assignments', type: 'assignments' },
    { table: 'project_phases_timeline', type: 'projectPhases' },
    { table: 'scenarios', type: 'scenarios' },
    { table: 'projects', type: 'projects' },
    { table: 'people', type: 'people' },
    { table: 'locations', type: 'locations' },
    { table: 'roles', type: 'roles' },
  ];

  for (const { table, type } of deletionOrder) {
    const ids = context.createdIds[type];
    if (ids.length > 0) {
      try {
        await db(table).whereIn('id', ids).del();
        console.log(`[TestIsolation] Deleted ${ids.length} ${type}`);
      } catch (error) {
        console.warn(`[TestIsolation] Failed to delete ${type}:`, error);
      }
    }
  }

  // Also clean up by prefix pattern
  try {
    const pattern = `${context.prefix}%`;
    await db('assignments')
      .whereIn(
        'person_id',
        db('people').select('id').where('name', 'like', pattern)
      )
      .del();
    await db('project_phases_timeline')
      .whereIn(
        'project_id',
        db('projects').select('id').where('name', 'like', pattern)
      )
      .del();
    await db('scenarios').where('name', 'like', pattern).del();
    await db('projects').where('name', 'like', pattern).del();
    await db('people').where('name', 'like', pattern).del();
    await db('locations').where('name', 'like', pattern).del();
    await db('roles').where('name', 'like', pattern).del();
  } catch (error) {
    console.warn('[TestIsolation] Failed to cleanup by prefix:', error);
  }
}

/**
 * Hook for use in test suites to enable per-test isolation
 */
export function useTestIsolation() {
  let context: TestIsolationContext | null = null;

  return {
    /**
     * Call in beforeEach to set up test isolation
     */
    beforeEachTest: async () => {
      context = await createTestContext();
    },

    /**
     * Call in afterEach to clean up test data
     */
    afterEachTest: async () => {
      if (context) {
        await cleanupTestContext(context);
        context = null;
      }
    },

    /**
     * Get the current test context
     */
    getTestContext: (): TestIsolationContext => {
      if (!context) {
        throw new Error('No test context available');
      }
      return context;
    },

    /**
     * Get the database instance (potentially within transaction)
     */
    getDb: () => db,
  };
}

/**
 * Factory functions for creating isolated test data
 */
export const createIsolatedTestData = {
  /**
   * Create an isolated test user
   */
  user: async (
    ctx: TestIsolationContext,
    overrides: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const user = {
      id: overrides.id || `${ctx.prefix}_user_${uniqueId}`,
      name: overrides.name || `${ctx.prefix}_TestUser_${uniqueId}`,
      email:
        overrides.email || `${ctx.prefix}_${uniqueId}@test.local`,
      worker_type: overrides.worker_type || 'FTE',
      default_availability_percentage:
        overrides.default_availability_percentage ?? 100,
      default_hours_per_day: overrides.default_hours_per_day ?? 8,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    await db('people').insert(user);
    ctx.createdIds.people.push(user.id as string);

    return user;
  },

  /**
   * Create an isolated test role
   */
  role: async (
    ctx: TestIsolationContext,
    overrides: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const role = {
      id: overrides.id || `${ctx.prefix}_role_${uniqueId}`,
      name: overrides.name || `${ctx.prefix}_TestRole_${uniqueId}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    // Remove description if it exists (roles table might not have it)
    delete (role as Record<string, unknown>).description;

    await db('roles').insert(role);
    ctx.createdIds.roles.push(role.id as string);

    return role;
  },

  /**
   * Create an isolated test location
   */
  location: async (
    ctx: TestIsolationContext,
    overrides: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const location = {
      id: overrides.id || `${ctx.prefix}_loc_${uniqueId}`,
      name: overrides.name || `${ctx.prefix}_TestLocation_${uniqueId}`,
      description: overrides.description || `Test location for ${ctx.id}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    await db('locations').insert(location);
    ctx.createdIds.locations.push(location.id as string);

    return location;
  },

  /**
   * Create an isolated test project
   */
  project: async (
    ctx: TestIsolationContext,
    overrides: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const project = {
      id: overrides.id || `${ctx.prefix}_proj_${uniqueId}`,
      name: overrides.name || `${ctx.prefix}_TestProject_${uniqueId}`,
      description: overrides.description || `Test project for ${ctx.id}`,
      // status 已删(真实 projects 无此列)——project_sub_type_id 为 001 真身 NOT NULL+FK
      project_sub_type_id: overrides.project_sub_type_id || TEST_PROJECT_SUB_TYPE_ID,
      priority: overrides.priority ?? 3,
      aspiration_start:
        overrides.aspiration_start || today.toISOString().split('T')[0],
      aspiration_finish:
        overrides.aspiration_finish ||
        threeMonthsLater.toISOString().split('T')[0],
      include_in_demand: overrides.include_in_demand ?? 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    await db('projects').insert(project);
    ctx.createdIds.projects.push(project.id as string);

    return project;
  },

  /**
   * Create an isolated test assignment
   */
  assignment: async (
    ctx: TestIsolationContext,
    overrides: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const today = new Date();
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    // Ensure we have required IDs
    let personId = overrides.person_id;
    let projectId = overrides.project_id;
    let roleId = overrides.role_id;

    if (!personId) {
      const person = await createIsolatedTestData.user(ctx);
      personId = person.id;
    }

    if (!projectId) {
      const project = await createIsolatedTestData.project(ctx);
      projectId = project.id;
    }

    if (!roleId) {
      // Try to get existing role first
      const existingRole = await db('roles').first();
      if (existingRole) {
        roleId = existingRole.id;
      } else {
        const role = await createIsolatedTestData.role(ctx);
        roleId = role.id;
      }
    }

    const assignment = {
      id: overrides.id || `${ctx.prefix}_asgn_${uniqueId}`,
      person_id: personId,
      project_id: projectId,
      role_id: roleId,
      allocation_percentage: overrides.allocation_percentage ?? 50,
      start_date:
        overrides.start_date || today.toISOString().split('T')[0],
      end_date:
        overrides.end_date || oneMonthLater.toISOString().split('T')[0],
      assignment_date_mode: overrides.assignment_date_mode || 'fixed',
      notes: overrides.notes || `Test assignment for ${ctx.id}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    await db('assignments').insert(assignment);
    ctx.createdIds.assignments.push(assignment.id as string);

    return assignment;
  },

  /**
   * Create an isolated test scenario
   */
  scenario: async (
    ctx: TestIsolationContext,
    overrides: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> => {
    const uniqueId = Math.random().toString(36).substring(2, 8);

    const scenario = {
      id: overrides.id || `${ctx.prefix}_scen_${uniqueId}`,
      name: overrides.name || `${ctx.prefix}_TestScenario_${uniqueId}`,
      type: overrides.type || 'what-if',
      description: overrides.description || `Test scenario for ${ctx.id}`,
      status: overrides.status || 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };

    await db('scenarios').insert(scenario);
    ctx.createdIds.scenarios.push(scenario.id as string);

    return scenario;
  },

  /**
   * Create bulk test data with a single call
   */
  bulk: async (
    ctx: TestIsolationContext,
    config: {
      users?: number;
      projects?: number;
      assignments?: number;
      scenarios?: number;
    }
  ): Promise<{
    users: Record<string, unknown>[];
    projects: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    scenarios: Record<string, unknown>[];
  }> => {
    const result = {
      users: [] as Record<string, unknown>[],
      projects: [] as Record<string, unknown>[],
      assignments: [] as Record<string, unknown>[],
      scenarios: [] as Record<string, unknown>[],
    };

    // Create users
    for (let i = 0; i < (config.users || 0); i++) {
      const user = await createIsolatedTestData.user(ctx, {
        name: `${ctx.prefix}_User_${i + 1}`,
      });
      result.users.push(user);
    }

    // Create projects
    for (let i = 0; i < (config.projects || 0); i++) {
      const project = await createIsolatedTestData.project(ctx, {
        name: `${ctx.prefix}_Project_${i + 1}`,
      });
      result.projects.push(project);
    }

    // Create scenarios
    for (let i = 0; i < (config.scenarios || 0); i++) {
      const scenario = await createIsolatedTestData.scenario(ctx, {
        name: `${ctx.prefix}_Scenario_${i + 1}`,
        type: ['what-if', 'baseline', 'forecast'][i % 3],
      });
      result.scenarios.push(scenario);
    }

    // Create assignments
    for (let i = 0; i < (config.assignments || 0); i++) {
      const assignment = await createIsolatedTestData.assignment(ctx, {
        person_id: result.users[i % Math.max(1, result.users.length)]?.id,
        project_id:
          result.projects[i % Math.max(1, result.projects.length)]?.id,
        allocation_percentage: 20 + (i * 10) % 60,
      });
      result.assignments.push(assignment);
    }

    return result;
  },
};

/**
 * Convenience wrapper for running a test with isolation
 */
export async function withTestIsolation<T>(
  testFn: (ctx: TestIsolationContext) => Promise<T>
): Promise<T> {
  const ctx = await createTestContext();
  try {
    return await testFn(ctx);
  } finally {
    await cleanupTestContext(ctx);
  }
}
