import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

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
    // Test files can have relaxed rules
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
