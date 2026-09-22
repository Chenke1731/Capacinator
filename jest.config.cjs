module.exports = {
  // Root configuration
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test isolation - ensure clean state between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Test timeout - increase for CI environments
  testTimeout: 30000,

  // Platform-specific configuration
  ...(process.platform === 'win32' ? {
    maxWorkers: 1,  // Reduce workers on Windows to avoid EPERM errors
    workerIdleMemoryLimit: '512MB'  // Prevent memory issues
  } : {
    maxWorkers: '50%'  // Use 50% of available CPUs on Unix
  }),

  // Separate projects for server and client
  projects: [
    {
      displayName: 'server-unit',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/server/**/__tests__/**/*.test.ts',
        '<rootDir>/tests/unit/server/**/*.test.ts',
        '<rootDir>/shared/**/__tests__/**/*.test.ts'
      ],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@octokit)/)'
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            resolveJsonModule: true,
            moduleResolution: 'node',
            target: 'ES2020',
            module: 'commonjs',
            isolatedModules: true
          }
        }]
      },
      setupFilesAfterEnv: ['<rootDir>/tests/unit/server/setup.ts']
    },
    {
      displayName: 'server-integration',
      testEnvironment: 'node',
      maxWorkers: 1, // Run integration tests serially to avoid DB conflicts
      testMatch: [
        '<rootDir>/tests/integration/**/*.test.ts'
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        'audit-performance.test.ts',  // Flaky: concurrent test >60s timeout on CI
        'phases.test.ts'               // Flaky: causes worker OOM on CI
      ],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      transformIgnorePatterns: [
        'node_modules/(?!(@octokit)/)'
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            resolveJsonModule: true,
            moduleResolution: 'node',
            target: 'ES2020',
            module: 'commonjs',
            isolatedModules: true
          }
        }]
      },
      setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts']
    },
    {
      displayName: 'client',
      testEnvironment: 'jsdom',
      // 框架加载前固定时区: date/dateUtils 按本地日历断言, 容器 TZ=UTC 会跨日
      setupFiles: ['<rootDir>/tests/setup.tz.js'],
      testMatch: [
        '<rootDir>/tests/unit/client/**/*.test.tsx',
        '<rootDir>/tests/unit/client/**/*.test.ts',
        '<rootDir>/client/src/**/__tests__/**/*.test.tsx',
        '<rootDir>/client/src/**/__tests__/**/*.test.ts'
      ],
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '^@/(.*)$': '<rootDir>/client/src/$1',
        '^@client/(.*)$': '<rootDir>/client/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1'
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            jsx: 'react',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            resolveJsonModule: true,
            moduleResolution: 'node',
            target: 'ES2020',
            module: 'commonjs',
            isolatedModules: true
          }
        }]
      },
      setupFilesAfterEnv: [
        '<rootDir>/tests/setup.client.js',
        '<rootDir>/tests/unit/client/setup/setup.ts'
      ]
    }
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-electron/',
    '/build/',
    '/tests/e2e/',
    '\\.spec\\.ts$'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'client/src/**/*.{ts,tsx}',
    // Exclude type definition files
    '!**/*.d.ts',
    // Exclude node_modules
    '!**/node_modules/**',
    // Exclude test files
    '!**/__tests__/**',
    '!**/tests/**',
    // Exclude build output
    '!**/dist/**',
    '!**/build/**',
    // Exclude config files
    '!**/*.config.{ts,js,cjs}',
    // Exclude index/barrel files (often just re-exports)
    '!**/index.ts',
    // Exclude migrations (database schema, not application logic)
    '!**/migrations/**',
    // Exclude Electron main process (separate runtime)
    '!src/electron/**'
  ],

  // Coverage thresholds - baselines based on current coverage levels
  // Current coverage (as of initial setup):
  //   Statements: 49.46%, Branches: 48.77%, Functions: 43.04%, Lines: 50.81%
  // These thresholds prevent regression and can be increased incrementally
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 40,
      lines: 45,
      statements: 45
    }
  },

  // Coverage output directory
  coverageDirectory: '<rootDir>/coverage',

  // Coverage report formats
  coverageReporters: [
    'text',           // Console output
    'text-summary',   // Condensed console summary
    'lcov',           // HTML report + lcov.info for CI tools
    'json'            // JSON for programmatic access
  ]
};