/**
 * Targeted mutation audit (I19f).
 *
 * Deliberately NOT a standing CI gate: no schedule, no break threshold, and a
 * single pure module per run. Use when the redline structure changes or when
 * there is a concrete question about assertion strength. See the plan §5.3
 * decision and I19f ledger row.
 */
export default {
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.stryker.config.cjs',
    enableFindRelatedTests: false,
  },
  mutate: ['src/server/services/calc/workCalendar.ts'],
  // Keep the sandbox small and avoid symlinked agent dirs (EISDIR on copy).
  ignorePatterns: [
    '.zcode/**',
    '.claude/**',
    '.omc/**',
    '.remember/**',
    '.github/**',
    'docs/**',
    'data/**',
    'tmp/**',
    '.e2e-data/**',
    'dist-client/**',
    'dist-electron/**',
    'uploads/**',
    'tests/visual/**',
  ],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/workCalendar.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  incremental: true,
  incrementalFile: 'reports/mutation/stryker-incremental.json',
  concurrency: 2,
  timeoutMS: 30000,
  thresholds: { high: 80, low: 60, break: null },
};
