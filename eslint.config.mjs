import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jest from 'eslint-plugin-jest';
import testingLibrary from 'eslint-plugin-testing-library';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'build/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'client/src/**/*.ts', 'client/src/**/*.tsx', 'shared/**/*.ts'],
    rules: {
      // Enforce radix parameter in parseInt to prevent octal interpretation
      // This is a critical security/correctness rule
      'radix': 'error',

      // Other recommended rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off', // Allow console for server-side logging
    },
  },
  {
    // React hooks：规则已安装但此前未接线。rules-of-hooks 阻断条件调用/
    // 循环调用；exhaustive-deps 先以 warning 建立基线，避免一次引入大量红。
    files: ['client/src/**/*.ts', 'client/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Jest/RTL static test smells (I19e). Playwright specs are excluded:
    // their test/expect globals are not Jest and would misfire.
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'client/src/**/__tests__/**/*.{ts,tsx}',
      'tests/unit/**/*.ts',
      'tests/integration/**/*.ts',
    ],
    ignores: ['tests/e2e/**'],
    plugins: { jest, 'testing-library': testingLibrary },
    rules: {
      'jest/no-focused-tests': 'error',
      'jest/valid-expect': 'error',
      // Existing suites use expect inside setup/helpers; warn first, tighten later.
      'jest/no-standalone-expect': 'warn',
      'jest/no-conditional-expect': 'warn',
      'testing-library/await-async-queries': 'error',
      'testing-library/no-debugging-utils': 'warn',
      'testing-library/no-node-access': 'warn',
    },
  },
  {
    // Test files can have relaxed rules
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Jest module isolation legitimately uses require()/Function in tests.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      // Test doubles wrap callbacks to rethrow; the wrapper is intentional.
      'no-useless-catch': 'off',
    },
  }
);
