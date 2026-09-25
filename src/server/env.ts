/**
 * Environment bootstrap — MUST be imported by config/index.ts before any
 * getConfig() call.
 *
 * Why this module exists (2026-09-25 incident): services/logging/config.ts
 * instantiates its logger at module scope, which froze the central config
 * BEFORE index.ts could load the .env file — every env-file-only setting
 * (notably AUDIT_ENABLED_TABLES) silently fell back to defaults, and
 * assignment audit events were dropped in ALL environments (dev/test/e2e).
 * Loading env here means ANY import chain that reaches config/index.ts
 * loads the right .env first, regardless of entry point.
 */
import { config as dotenvConfig } from 'dotenv';

const nodeEnv = process.env.NODE_ENV || 'development';
let envFile = '.env';
if (nodeEnv === 'development') {
  envFile = '.env.development';
} else if (nodeEnv === 'test') {
  envFile = '.env.test';
} else if (nodeEnv === 'e2e') {
  envFile = '.env.e2e';
}
dotenvConfig({ path: envFile });

export { envFile };
