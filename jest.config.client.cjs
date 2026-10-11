module.exports = {
  // Use jsdom environment for client tests
  testEnvironment: 'jsdom',

  // Test isolation - ensure clean state between tests
  clearMocks: true,
  restoreMocks: true,

  // Test timeout - increase for CI environments
  testTimeout: 30000,

  // Test file patterns - only client tests
  testMatch: [
    '**/client/**/*.(test|spec).[jt]s?(x)',
    '**/tests/unit/client/**/*.(test|spec).[jt]s?(x)'
  ],
  
  // Module name mapper
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@client/(.*)$': '<rootDir>/client/src/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    // devEnv 含 import.meta(CJS 变换不识别)——映射为常量 mock
    '^.*/devEnv$': '<rootDir>/tests/unit/client/setup/devEnvMock.ts'
  },
  
  // Transform TypeScript/TSX files
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
      tsconfig: {
        allowJs: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react',
        lib: ['ES2022', 'DOM'],
        module: 'commonjs',
        target: 'ES2022',
        moduleResolution: 'node',
        strict: false
      }
    }]
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Setup files
  setupFiles: ['<rootDir>/tests/setup.client.js'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],

  // Coverage configuration (client-specific)
  collectCoverageFrom: [
    'client/src/**/*.{ts,tsx}',
    // Exclude type definition files
    '!**/*.d.ts',
    // Exclude node_modules
    '!**/node_modules/**',
    // Exclude test files
    '!**/__tests__/**',
    // Exclude build output
    '!**/dist/**',
    '!**/build/**',
    // Exclude config files
    '!**/*.config.{ts,js,cjs}',
    // Exclude index/barrel files (often just re-exports)
    '!**/index.ts'
  ],

  // Coverage thresholds - baselines to prevent regression
  // These can be increased incrementally as coverage improves
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 40,
      lines: 45,
      statements: 45
    }
  },

  // Coverage output directory
  coverageDirectory: '<rootDir>/coverage/client',

  // Coverage report formats
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'json'
  ]
};