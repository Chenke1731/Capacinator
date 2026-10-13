import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

import { getAuditConfig, isAuditEnabled, isTableAudited, getConfig, resetConfig } from '../../../../src/server/config/index';

describe('Audit Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset the config singleton before each test
    resetConfig();
    process.env = { ...originalEnv };
    // Set NODE_ENV to test to avoid production validations
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    resetConfig();
    process.env = originalEnv;
  });

  describe('getAuditConfig', () => {
    test('should return default configuration when env vars not set', () => {
      delete process.env.AUDIT_MAX_HISTORY_ENTRIES;
      delete process.env.AUDIT_RETENTION_DAYS;
      delete process.env.AUDIT_SENSITIVE_FIELDS;
      delete process.env.AUDIT_ENABLED_TABLES;

      const config = getAuditConfig();

      expect(config).toEqual({
        maxHistoryEntries: 1000,
        retentionDays: 365,
        sensitiveFields: ['password', 'token', 'secret', 'key', 'hash'],
        // 2026-10-13 审计修正: 'assignments' 表不存在,真实分配表为
        // project_assignments / scenario_project_assignments
        enabledTables: ['people', 'projects', 'roles', 'project_assignments', 'scenario_project_assignments', 'availability']
      });
    });

    test('should parse environment variables correctly', () => {
      process.env.AUDIT_MAX_HISTORY_ENTRIES = '500';
      process.env.AUDIT_RETENTION_DAYS = '30';
      process.env.AUDIT_SENSITIVE_FIELDS = 'password,secret,apiKey';
      process.env.AUDIT_ENABLED_TABLES = 'users,orders,products';

      const config = getAuditConfig();

      expect(config).toEqual({
        maxHistoryEntries: 500,
        retentionDays: 30,
        sensitiveFields: ['password', 'secret', 'apiKey'],
        enabledTables: ['users', 'orders', 'products']
      });
    });

    test('should handle whitespace in comma-separated values', () => {
      process.env.AUDIT_SENSITIVE_FIELDS = ' password , token , secret ';
      process.env.AUDIT_ENABLED_TABLES = ' people , projects , roles ';

      const config = getAuditConfig();

      expect(config.sensitiveFields).toEqual(['password', 'token', 'secret']);
      expect(config.enabledTables).toEqual(['people', 'projects', 'roles']);
    });

    test('should handle very large numeric values', () => {
      process.env.AUDIT_MAX_HISTORY_ENTRIES = '999999999';
      process.env.AUDIT_RETENTION_DAYS = '999999999';

      const config = getAuditConfig();

      expect(config.maxHistoryEntries).toBe(999999999);
      expect(config.retentionDays).toBe(999999999);
    });

    test('should handle special characters in field names', () => {
      process.env.AUDIT_SENSITIVE_FIELDS = 'password,user-token,api_key,oauth.secret';
      process.env.AUDIT_ENABLED_TABLES = 'user-profiles,project_data,role.permissions';

      const config = getAuditConfig();

      expect(config.sensitiveFields).toEqual(['password', 'user-token', 'api_key', 'oauth.secret']);
      expect(config.enabledTables).toEqual(['user-profiles', 'project_data', 'role.permissions']);
    });
  });

  describe('isAuditEnabled', () => {
    test('should return true when AUDIT_ENABLED is "true"', () => {
      process.env.AUDIT_ENABLED = 'true';
      expect(isAuditEnabled()).toBe(true);
    });

    test('should return false when AUDIT_ENABLED is "false"', () => {
      process.env.AUDIT_ENABLED = 'false';
      expect(isAuditEnabled()).toBe(false);
    });

    test('should return true by default (new behavior)', () => {
      delete process.env.AUDIT_ENABLED;
      // The new config defaults audit.enabled to true
      expect(isAuditEnabled()).toBe(true);
    });

    test('should return true in e2e mode', () => {
      process.env.NODE_ENV = 'e2e';
      process.env.AUDIT_ENABLED = 'false';
      resetConfig();
      // In e2e mode, audit is always enabled
      expect(isAuditEnabled()).toBe(true);
    });
  });

  describe('isTableAudited', () => {
    test('should return false when audit is disabled', () => {
      process.env.AUDIT_ENABLED = 'false';
      process.env.AUDIT_ENABLED_TABLES = 'people,projects';

      expect(isTableAudited('people')).toBe(false);
      expect(isTableAudited('projects')).toBe(false);
    });

    test('should return true for tables in enabled list when audit is enabled', () => {
      process.env.AUDIT_ENABLED = 'true';
      process.env.AUDIT_ENABLED_TABLES = 'people,projects,roles';

      expect(isTableAudited('people')).toBe(true);
      expect(isTableAudited('projects')).toBe(true);
      expect(isTableAudited('roles')).toBe(true);
    });

    test('should return false for tables not in enabled list', () => {
      process.env.AUDIT_ENABLED = 'true';
      process.env.AUDIT_ENABLED_TABLES = 'people,projects';

      expect(isTableAudited('roles')).toBe(false);
      expect(isTableAudited('unknown_table')).toBe(false);
    });

    test('should be case sensitive for table names', () => {
      process.env.AUDIT_ENABLED = 'true';
      process.env.AUDIT_ENABLED_TABLES = 'people,Projects';

      expect(isTableAudited('people')).toBe(true);
      expect(isTableAudited('PEOPLE')).toBe(false);
      expect(isTableAudited('Projects')).toBe(true);
      expect(isTableAudited('projects')).toBe(false);
    });

    test('should handle whitespace in table names', () => {
      process.env.AUDIT_ENABLED = 'true';
      process.env.AUDIT_ENABLED_TABLES = ' people , projects ';

      expect(isTableAudited('people')).toBe(true);
      expect(isTableAudited('projects')).toBe(true);
      expect(isTableAudited(' people ')).toBe(false); // Exact match required
    });

    test('should handle empty string table name', () => {
      process.env.AUDIT_ENABLED = 'true';
      process.env.AUDIT_ENABLED_TABLES = 'people,projects';

      expect(isTableAudited('')).toBe(false);
    });

    test('should handle special characters in table names', () => {
      process.env.AUDIT_ENABLED = 'true';
      process.env.AUDIT_ENABLED_TABLES = 'user-profiles,project_data,role.permissions';

      expect(isTableAudited('user-profiles')).toBe(true);
      expect(isTableAudited('project_data')).toBe(true);
      expect(isTableAudited('role.permissions')).toBe(true);
    });
  });

  describe('getConfig - central configuration', () => {
    test('should return full config object', () => {
      const config = getConfig();

      expect(config).toHaveProperty('env');
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('audit');
      expect(config).toHaveProperty('email');
      expect(config).toHaveProperty('gitSync');
      expect(config).toHaveProperty('github');
      expect(config).toHaveProperty('features');
    });

    test('should cache configuration (singleton)', () => {
      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    test('should reset and reload config', () => {
      process.env.PORT = '4000';
      const config1 = getConfig();
      expect(config1.server.port).toBe(4000);

      resetConfig();
      process.env.PORT = '5000';
      const config2 = getConfig();
      expect(config2.server.port).toBe(5000);
    });
  });

  describe('Configuration Security', () => {
    test('should handle potentially malicious input in environment variables', () => {
      process.env.AUDIT_SENSITIVE_FIELDS = '<script>alert("xss")</script>';
      process.env.AUDIT_ENABLED_TABLES = '"; DROP TABLE users; --';

      const config = getAuditConfig();

      expect(config.sensitiveFields).toEqual(['<script>alert("xss")</script>']);
      expect(config.enabledTables).toEqual(['"; DROP TABLE users; --']);
    });

    test('should handle unicode characters in configuration', () => {
      process.env.AUDIT_SENSITIVE_FIELDS = 'пароль,密码,パスワード';
      process.env.AUDIT_ENABLED_TABLES = 'пользователи,用户,ユーザー';

      const config = getAuditConfig();

      expect(config.sensitiveFields).toEqual(['пароль', '密码', 'パスワード']);
      expect(config.enabledTables).toEqual(['пользователи', '用户', 'ユーザー']);
    });
  });

  describe('Edge Cases', () => {
    test('should handle configuration changes with resetConfig', () => {
      process.env.AUDIT_MAX_HISTORY_ENTRIES = '100';
      const config1 = getAuditConfig();

      resetConfig();
      process.env.AUDIT_MAX_HISTORY_ENTRIES = '200';
      const config2 = getAuditConfig();

      expect(config1.maxHistoryEntries).toBe(100);
      expect(config2.maxHistoryEntries).toBe(200);
    });

    test('should handle extremely large comma-separated lists', () => {
      const largeSensitiveFields = Array.from({ length: 100 }, (_, i) => `field${i}`).join(',');
      const largeEnabledTables = Array.from({ length: 100 }, (_, i) => `table${i}`).join(',');

      process.env.AUDIT_SENSITIVE_FIELDS = largeSensitiveFields;
      process.env.AUDIT_ENABLED_TABLES = largeEnabledTables;

      const config = getAuditConfig();

      expect(config.sensitiveFields.length).toBe(100);
      expect(config.enabledTables.length).toBe(100);
      expect(config.sensitiveFields[0]).toBe('field0');
      expect(config.sensitiveFields[99]).toBe('field99');
    });
  });
});
