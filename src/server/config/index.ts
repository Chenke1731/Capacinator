/**
 * Centralized Environment Configuration
 *
 * This module provides a single source of truth for all environment configuration.
 * All environment variables should be accessed through this module, not directly
 * via process.env.
 *
 * Features:
 * - Fail-fast validation at startup for required variables
 * - Type-safe configuration object
 * - Sensible defaults for development
 * - Singleton pattern with lazy initialization
 */

// Env bootstrap MUST be the first import — see src/server/env.ts for the
// incident note. Import order here is load-bearing.
import '../env.js';
import * as path from 'path';
import * as os from 'os';

// =============================================================================
// Type Definitions
// =============================================================================

export type Environment = 'development' | 'test' | 'e2e' | 'production' | 'staging' | 'qa';
export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';
export type LogFormat = 'human' | 'json';

export interface ServerConfig {
  port: number;
  maxFileSize: number;
  uploadDir: string;
}

export interface DatabaseConfig {
  filename: string;
  backupEnabled: boolean;
  backupInterval: string;
  backupRetentionDays: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  bcryptRounds: number;
  encryptionKey: string;
}

export interface LoggingConfig {
  level: LogLevel;
  format: LogFormat;
  directory: string;
  maxFileSize: number;
  maxFiles: number;
  serviceName: string;
  enableTestLogs: boolean;
}

export interface AuditConfig {
  enabled: boolean;
  maxHistoryEntries: number;
  retentionDays: number;
  sensitiveFields: string[];
  enabledTables: string[];
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  appUrl: string;
}

export interface GitSyncConfig {
  enabled: boolean;
  repositoryUrl: string;
  repoPath: string;
  autoPullOnStartup: boolean;
  shallowClone: boolean;
  conflictAutoMerge: boolean;
}

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  enterpriseUrl: string;
}

export interface FeaturesConfig {
  autoSaveInterval: number;
  enableAutoUpdate: boolean;
  enableClientRemoteLogging: boolean;
  clientLogEndpoint: string;
}

export interface Config {
  env: Environment;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  isE2E: boolean;
  isCI: boolean;

  server: ServerConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  logging: LoggingConfig;
  audit: AuditConfig;
  email: EmailConfig;
  gitSync: GitSyncConfig;
  github: GitHubConfig;
  features: FeaturesConfig;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  return '';
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function getEnvList(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function getEnvironment(): Environment {
  const env = process.env.NODE_ENV || 'development';
  const validEnvs: Environment[] = ['development', 'test', 'e2e', 'production', 'staging', 'qa'];
  if (validEnvs.includes(env as Environment)) {
    return env as Environment;
  }
  return 'development';
}

function getLogLevel(env: Environment): LogLevel {
  const explicitLevel = process.env.LOG_LEVEL;
  if (explicitLevel) {
    const validLevels: LogLevel[] = ['error', 'warn', 'info', 'http', 'debug'];
    if (validLevels.includes(explicitLevel as LogLevel)) {
      return explicitLevel as LogLevel;
    }
  }
  // Default based on environment
  switch (env) {
    case 'production':
    case 'staging':
      return 'info';
    case 'test':
    case 'e2e':
      return 'error';
    default:
      return 'debug';
  }
}

function getLogFormat(env: Environment): LogFormat {
  const explicitFormat = process.env.LOG_FORMAT;
  if (explicitFormat === 'json') {
    return 'json';
  }
  // Default: JSON in production, human-readable otherwise
  return env === 'production' ? 'json' : 'human';
}

function getDatabaseFilename(env: Environment): string {
  // DATABASE_URL takes precedence (for compatibility)
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return databaseUrl;
  }

  const dbFilename = process.env.DB_FILENAME;
  if (dbFilename) {
    return dbFilename;
  }

  // Environment-specific defaults
  switch (env) {
    case 'test':
      return ':memory:';
    case 'e2e':
      return 'capacinator-e2e.db';
    case 'production':
      return 'capacinator.db';
    default:
      return 'capacinator-dev.db';
  }
}

function getGitRepoPath(): string {
  const explicitPath = process.env.GIT_REPO_PATH;
  if (explicitPath) {
    return explicitPath;
  }
  return path.join(os.homedir(), '.capacinator', 'git-repo');
}

// =============================================================================
// Validation
// =============================================================================

class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

function validateConfig(config: Config): void {
  const errors: string[] = [];

  // Production-only validations
  if (config.isProduction) {
    // JWT secret must be changed from default
    if (config.auth.jwtSecret === 'dev-jwt-secret') {
      errors.push('JWT_SECRET must be set to a secure value in production (not "dev-jwt-secret")');
    }

    // Encryption key required for GitHub token storage
    if (config.gitSync.enabled && !config.auth.encryptionKey) {
      errors.push('ENCRYPTION_KEY is required when ENABLE_GIT_SYNC is true in production');
    }

    // GitHub OAuth credentials required if git sync is enabled
    if (config.gitSync.enabled) {
      if (!config.github.clientId) {
        errors.push('GITHUB_CLIENT_ID is required when ENABLE_GIT_SYNC is true');
      }
      if (!config.github.clientSecret) {
        errors.push('GITHUB_CLIENT_SECRET is required when ENABLE_GIT_SYNC is true');
      }
      if (!config.github.callbackUrl) {
        errors.push('GITHUB_CALLBACK_URL is required when ENABLE_GIT_SYNC is true');
      }
    }
  }

  // General validations (all environments)
  if (config.audit.enabled) {
    if (config.audit.maxHistoryEntries < 1) {
      errors.push('AUDIT_MAX_HISTORY_ENTRIES must be at least 1');
    }
    if (config.audit.retentionDays < 1) {
      errors.push('AUDIT_RETENTION_DAYS must be at least 1');
    }
    if (config.audit.enabledTables.length === 0) {
      errors.push('AUDIT_ENABLED_TABLES must include at least one table');
    }
  }

  if (config.logging.maxFileSize < 1024) {
    errors.push('LOG_MAX_FILE_SIZE must be at least 1024 bytes');
  }

  if (config.logging.maxFiles < 1) {
    errors.push('LOG_MAX_FILES must be at least 1');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Fail fast if any errors
  if (errors.length > 0) {
    const errorMessage = [
      'Configuration validation failed:',
      ...errors.map(e => `  - ${e}`),
      '',
      'Please check your environment variables and try again.'
    ].join('\n');
    throw new ConfigValidationError(errorMessage);
  }
}

// =============================================================================
// Config Loading
// =============================================================================

function loadConfig(): Config {
  const env = getEnvironment();
  const isProduction = env === 'production';
  const isDevelopment = env === 'development';
  const isTest = env === 'test';
  const isE2E = env === 'e2e';
  const isCI = getEnvBool('CI', false);

  const config: Config = {
    env,
    isProduction,
    isDevelopment,
    isTest,
    isE2E,
    isCI,

    server: {
      port: getEnvInt('PORT', 3110),
      maxFileSize: getEnvInt('MAX_FILE_SIZE', 52428800), // 50MB
      uploadDir: getEnv('UPLOAD_DIR', 'uploads'),
    },

    database: {
      filename: getDatabaseFilename(env),
      backupEnabled: getEnvBool('DB_BACKUP_ENABLED', !isTest && !isE2E),
      backupInterval: getEnv('DB_BACKUP_INTERVAL', 'daily'),
      backupRetentionDays: getEnvInt('DB_BACKUP_RETENTION_DAYS', 30),
    },

    auth: {
      jwtSecret: getEnv('JWT_SECRET', 'dev-jwt-secret'),
      jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
      jwtRefreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
      bcryptRounds: getEnvInt('BCRYPT_ROUNDS', 10),
      encryptionKey: getEnv('ENCRYPTION_KEY', ''),
    },

    logging: {
      level: getLogLevel(env),
      format: getLogFormat(env),
      directory: getEnv('LOG_DIRECTORY', '/tmp/capacinator-logs'),
      maxFileSize: getEnvInt('LOG_MAX_FILE_SIZE', 10485760), // 10MB
      maxFiles: getEnvInt('LOG_MAX_FILES', 10),
      serviceName: getEnv('SERVICE_NAME', 'capacinator'),
      enableTestLogs: getEnvBool('ENABLE_TEST_LOGS', false),
    },

    audit: {
      enabled: getEnvBool('AUDIT_ENABLED', true) || isE2E,
      maxHistoryEntries: getEnvInt('AUDIT_MAX_HISTORY_ENTRIES', 1000),
      retentionDays: getEnvInt('AUDIT_RETENTION_DAYS', 365),
      sensitiveFields: getEnvList('AUDIT_SENSITIVE_FIELDS', ['password', 'token', 'secret', 'key', 'hash']),
      enabledTables: getEnvList('AUDIT_ENABLED_TABLES', ['people', 'projects', 'roles', 'assignments', 'availability']),
    },

    email: {
      host: getEnv('SMTP_HOST', 'localhost'),
      port: getEnvInt('SMTP_PORT', 587),
      secure: getEnvBool('SMTP_SECURE', false),
      user: getEnv('SMTP_USER', ''),
      pass: getEnv('SMTP_PASS', ''),
      from: getEnv('SMTP_FROM', 'noreply@capacinator.com'),
      appUrl: getEnv('APP_URL', 'http://localhost:3120'),
    },

    gitSync: {
      enabled: getEnvBool('ENABLE_GIT_SYNC', false),
      repositoryUrl: getEnv('GIT_REPOSITORY_URL', ''),
      repoPath: getGitRepoPath(),
      autoPullOnStartup: getEnvBool('GIT_SYNC_AUTO_PULL_ON_STARTUP', false),
      shallowClone: getEnvBool('GIT_SYNC_SHALLOW_CLONE', true),
      conflictAutoMerge: getEnvBool('GIT_SYNC_CONFLICT_AUTO_MERGE', true),
    },

    github: {
      clientId: getEnv('GITHUB_CLIENT_ID', ''),
      clientSecret: getEnv('GITHUB_CLIENT_SECRET', ''),
      callbackUrl: getEnv('GITHUB_CALLBACK_URL', ''),
      enterpriseUrl: getEnv('GITHUB_ENTERPRISE_URL', ''),
    },

    features: {
      autoSaveInterval: getEnvInt('AUTO_SAVE_INTERVAL', 30000),
      enableAutoUpdate: getEnvBool('ENABLE_AUTO_UPDATE', true),
      enableClientRemoteLogging: getEnvBool('ENABLE_CLIENT_REMOTE_LOGGING', true),
      clientLogEndpoint: getEnv('CLIENT_LOG_ENDPOINT', '/api/client-logs'),
    },
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _config: Config | null = null;

/**
 * Get the application configuration.
 * Configuration is loaded once on first access and cached.
 * Validates required environment variables and fails fast if invalid.
 */
export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Reset the configuration cache.
 * Only use this in tests to allow reconfiguration between test cases.
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Check if a specific feature is enabled.
 * Convenience method for feature flags.
 */
export function isFeatureEnabled(feature: keyof FeaturesConfig | 'audit' | 'gitSync'): boolean {
  const config = getConfig();
  switch (feature) {
    case 'audit':
      return config.audit.enabled;
    case 'gitSync':
      return config.gitSync.enabled;
    default:
      return !!config.features[feature];
  }
}

// =============================================================================
// Legacy Compatibility
// =============================================================================

/**
 * @deprecated Use getConfig().audit instead
 */
export function getAuditConfig() {
  const config = getConfig();
  return {
    maxHistoryEntries: config.audit.maxHistoryEntries,
    retentionDays: config.audit.retentionDays,
    sensitiveFields: config.audit.sensitiveFields,
    enabledTables: config.audit.enabledTables,
  };
}

/**
 * @deprecated Use getConfig().audit.enabled instead
 */
export function isAuditEnabled(): boolean {
  return getConfig().audit.enabled;
}

/**
 * @deprecated Use getConfig().audit.enabledTables.includes(tableName) instead
 */
export function isTableAudited(tableName: string): boolean {
  const config = getConfig();
  if (!config.audit.enabled) {
    return false;
  }
  return config.audit.enabledTables.includes(tableName);
}

// Legacy export for backwards compatibility
export const config = {
  features: {
    get audit() {
      return getConfig().audit.enabled;
    }
  }
};
