import knex from 'knex';
import path from 'path';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

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
    
    // Read and execute test schema SQL
    const fs = await import('fs/promises');
    const schemaPath = path.resolve('tests/integration/test-schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf-8');
    
    // Also read additional schema
    const additionsPath = path.resolve('tests/integration/test-schema-additions.sql');
    const additionsSql = await fs.readFile(additionsPath, 'utf-8');
    
    // Combine both schemas
    const fullSchemaSql = schemaSql + '\n' + additionsSql;
    
    // Split by semicolons and execute each statement
    const statements = fullSchemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      try {
        await testDb.raw(statement);
      } catch (error: any) {
        // Ignore errors for ALTER TABLE on columns that already exist
        if (!error.message.includes('duplicate column name')) {
          console.error('Schema error:', error.message);
        }
      }
    }
    
    console.log('Test database schema created');
    
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };

  await testDb('projects').insert(project);
  return project;
}

// Export test database for use in tests
export { testDb as db };