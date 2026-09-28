import { db, initializeDatabase, testConnection } from './index.js';

async function initDb() {
  try {
    console.log('🔧 Initializing Capacinator database...');
    
    // Test connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Could not connect to database');
    }
    
    // Initialize database (run migrations and seeds)
    await initializeDatabase();
    
    console.log('✅ Database initialization complete!');
    console.log('\n📊 Database status:');
    
    // Show some basic stats
    const tables = [
      'locations', 'project_types', 'project_phases', 'roles', 
      'people', 'projects', 'resource_templates'
    ];
    
    for (const table of tables) {
      try {
        const count = await db(table).count('* as count').first();
        console.log(`   ${table}: ${count?.count || 0} records`);
      } catch {
        console.log(`   ${table}: table not found`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly (npm run db:init runs this file via tsx).
// The guard must not use import.meta: production compiles this tree as
// CommonJS (tsconfig.production.json module=commonjs), where import.meta
// is a compile-time syntax error (build:server was broken by it since
// e78d4b9). argv[1] matching works identically under tsx (init.ts) and
// compiled CJS (init.js).
if (process.argv[1] && /database[/\\]init\.(ts|js)$/.test(process.argv[1])) {
  initDb();
}

export { initDb };