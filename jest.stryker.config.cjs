/**
 * Minimal Jest config for the targeted Stryker pilot (I19f).
 * Kept separate from jest.config.cjs because Stryker's Jest runner expects a
 * single-project config; this keeps mutation runs scoped to the target module.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/unit/server/services/workCalendar.test.ts',
    '<rootDir>/src/server/services/calc/__tests__/workCalendar.property.test.ts',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        moduleResolution: 'node',
        target: 'ES2020',
        module: 'commonjs',
        isolatedModules: true,
      },
    }],
  },
  setupFilesAfterEnv: ['<rootDir>/tests/unit/server/setup.ts'],
};
