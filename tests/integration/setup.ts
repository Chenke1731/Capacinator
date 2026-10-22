import knex from 'knex';
import path from 'path';
import { readdirSync } from 'fs';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

/**
 * jest 内跑真 migrations（IP-01 真实 schema 入口, 2026-10-22）:
 * knex 的 migrate 加载器对迁移源走动态 import()——jest CJS 沙箱无
 * --experimental-vm-modules 即炸（"迁移在 jest 不可运行"的历史死结真身）。
 * 手排执行器用 jest 的 require（经 ts-jest 变换）加载同一份迁移源码、
 * 顺序执行 up()、账本记 knex_migrations——空库上与 migrate.latest 等价。
 * 集成库从此由 migrations 建出,笔写 test-schema*.sql 退役（CHECK 缺失
 * 曾掩盖 conflict 500,见 __tests__/migrations-built-db.test.ts）。
 */
const MIGRATIONS_DIR = path.resolve('src/server/database/migrations');

/** 项目夹具共享子类型（种子块落库,projects.project_sub_type_id NOT NULL+FK 的真身要求） */
export const TEST_PROJECT_TYPE_ID = 'test-project-type-1';
export const TEST_PROJECT_SUB_TYPE_ID = 'test-sub-type-1';
async function runMigrationsManually(db: ReturnType<typeof knex>): Promise<void> {
  await db.schema.createTable('knex_migrations', t => {
    t.string('name', 255).notNullable().primary();
    t.integer('batch').notNullable();
    t.timestamp('migration_time').defaultTo(db.fn.now());
  });
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.ts')).sort();
  const batch = 1;
  for (const f of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { up } = require(path.join(MIGRATIONS_DIR, f));
    if (typeof up === 'function') {
      await up(db);
    }
    await db('knex_migrations').insert({ name: f, batch, migration_time: new Date() });
  }
}

// Create test database connection with proper paths
const testDb = knex({
  client: 'better-sqlite3',
  connection: {
    filename: ':memory:' // Use in-memory database for tests
  },
  useNullAsDefault: true,
  pool: {
    afterCreate: (conn: any, done: any) => {
      // Enable foreign keys for each connection
      conn.pragma('foreign_keys = ON');
      done();
    }
  },
  migrations: {
    directory: path.resolve('src/server/database/migrations'),
    loadExtensions: ['.ts', '.js'] // Support both TS and JS files
  },
  seeds: {
    directory: path.resolve('src/server/database/seeds'),
    loadExtensions: ['.ts', '.js']
  }
});

// Run migrations before all integration tests
beforeAll(async () => {
  console.log('Setting up test database...');
  try {
    // Enable foreign keys in SQLite
    await testDb.raw('PRAGMA foreign_keys = ON');

    // 真身入口: 全量 migrations 在内存库上执行（同一份源码,含 CHECK/视图/索引）
    await runMigrationsManually(testDb);
    console.log(`Test database schema created by migrations`);

    // Add some basic seed data if needed
    const hasRoles = await testDb('roles').count('* as count').first();
    if (!hasRoles || hasRoles.count === 0) {
      await testDb('roles').insert([
        { id: 'role-1', name: 'Developer', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'role-2', name: 'Designer', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 'role-3', name: 'Project Manager', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      ]);
      console.log('Test database seeded with basic data');
    }

    // projects.project_sub_type_id = NOT NULL + FK(001 真身): 任何项目夹具
    // 都必须挂一个真实子类型——手写 DDL 时代偷掉此约束曾让全部夹具漏列。
    // name 用占位名避开套件自建的 'Test Type'(project_types.name 真身 UNIQUE)。
    const hasSubType = await testDb('project_sub_types').count('* as count').first();
    if (!hasSubType || hasSubType.count === 0) {
      await testDb('project_types').insert({ id: TEST_PROJECT_TYPE_ID, name: 'Fixture Root Type' });
      await testDb('project_sub_types').insert({ id: TEST_PROJECT_SUB_TYPE_ID, name: 'SR', project_type_id: TEST_PROJECT_TYPE_ID });
    }
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
});

// Clean up after all tests
afterAll(async () => {
  try {
    await testDb.destroy();
    console.log('Test database connection closed');
  } catch (error) {
    console.error('Failed to close database connection:', error);
  }
});

// Test helper functions
export async function createTestUser(overrides: Partial<any> = {}): Promise<any> {
  // No need for legacy handling - we just use name field
  const processedOverrides = { ...overrides };

  const uniqueId = overrides.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const user = {
    id: uniqueId,
    name: overrides.name || 'Test User',
    email: overrides.email || `test-${uniqueId}@example.com`, // Use unique email
    is_active: 1, // SQLite uses INTEGER for booleans
    worker_type: 'FTE', // Must be 'FTE', 'Contractor', or 'Consultant'
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...processedOverrides
  };

  await testDb('people').insert(user);
  return user;
}

export async function createTestRole(overrides: Partial<any> = {}): Promise<any> {
  const role = {
    id: overrides.id || `role-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: overrides.name || 'Test Role',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
  
  // Remove description if it exists since roles table doesn't have it
  delete role.description;

  await testDb('roles').insert(role);
  return role;
}

export async function createTestProject(overrides: Partial<any> = {}): Promise<any> {
  const project = {
    id: overrides.id || `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Project',
    description: 'A test project',
    // status 已删(2026-10-13 漂移守卫): 真实 projects 无此列——生命周期
    // 归 lifecycle_state,测试种子不再杜撰
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID, // 001 真身 NOT NULL+FK,见种子块注释
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };

  await testDb('projects').insert(project);
  return project;
}

// Export test database for use in tests
export { testDb as db };