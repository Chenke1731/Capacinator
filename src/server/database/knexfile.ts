import { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import e2eConfig from './knexfile.e2e.js';

// 双模式目录解析: CJS(Jest 变换/knex CLI)原生 __dirname; ESM(tsx 4.23)无垫片,
// import.meta.url 又会被 Jest 的 CJS 变换打成语法错误(21 套件常红的旧因)——
// 故 ESM 分支从错误堆栈解析本文件路径(堆栈在两种模块体系里都含文件位置)。
function resolveThisDir(): string {
  if (typeof __dirname !== 'undefined') return __dirname;
  const line = (new Error().stack ?? '').split('\n').find((l) => l.includes('knexfile')) ?? '';
  const hit = line.match(/(?:file:\/\/)?(\/[^\s:]+?)\/knexfile\.ts/);
  return hit?.[1] ?? process.cwd();
}
const thisDir = resolveThisDir();

// Determine which config to use based on environment
const getConfig = (): Knex.Config => {
  // Use E2E config when in E2E mode
  if (process.env.NODE_ENV === 'e2e') {
    console.log('🧪 Using E2E database configuration');
    return e2eConfig;
  }

  // Get the appropriate data directory based on platform
  const getDataPath = () => {
  if (process.env.NODE_ENV === 'development') {
    return path.join(process.cwd(), 'data');
  }
  
  // In production, try to get electron path, fallback to current directory
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    return app.getPath('userData');
  } catch {
    return path.join(process.cwd(), 'data');
  }
};

// Ensure data directory exists (skip for in-memory database)
const dataPath = getDataPath();
if (!process.env.DATABASE_URL && !fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

  const config: Knex.Config = {
    client: 'better-sqlite3',
    connection: process.env.DATABASE_URL ? {
      filename: process.env.DATABASE_URL
    } : {
      filename: path.join(dataPath, process.env.DB_FILENAME || 'capacinator.db')
    },
    useNullAsDefault: true,
    acquireConnectionTimeout: 30000, // Increased to 30 seconds for bulk operations
    migrations: {
      directory: process.env.NODE_ENV === 'development'
        ? path.resolve(process.cwd(), 'src/server/database/migrations')
        : path.join(thisDir, 'migrations')
    },
    seeds: {
      directory: process.env.NODE_ENV === 'development'
        ? path.resolve(process.cwd(), 'src/server/database/seeds')
        : path.join(thisDir, 'seeds')
    },
    // SQLite configuration for stability
    pool: {
      min: 0,
      max: 1,
      afterCreate: (conn: any, cb: any) => {
        // Keep existing journal mode to avoid conflicts
        conn.pragma('synchronous = NORMAL'); // Better performance while maintaining durability
        conn.pragma('foreign_keys = ON');
        conn.pragma('busy_timeout = 30000'); // 30 second timeout for busy database
        conn.pragma('cache_size = -64000'); // 64MB cache
        cb();
      }
    }
  };

  return config;
};

export default getConfig();