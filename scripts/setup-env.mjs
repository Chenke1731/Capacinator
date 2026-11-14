#!/usr/bin/env node
/**
 * Local environment bootstrap.
 *
 * Clean checkouts intentionally do not ship developer/QA/staging/production
 * env files. This script creates the missing local files from `.env.example`
 * and replaces sensitive placeholders with freshly generated development
 * values. Test/E2E files are tracked fixtures and are never generated here.
 *
 * Usage:
 *   node scripts/setup-env.mjs                 # development (default)
 *   node scripts/setup-env.mjs --force         # overwrite existing development file
 *   node scripts/setup-env.mjs --self-test     # hermetic test of the generator
 *
 * Production is never auto-generated: deployments must inject `.env`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, '.env.example');
const TARGET = path.join(ROOT, '.env.development');

export function generateJwtSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('base64');
}

/** Replace `KEY=...` in env text, or append it when missing. */
export function setEnvValue(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  return `${text.replace(/\n?$/, '\n')}${key}=${value}\n`;
}

/** Build a development env file from the checked-in example. */
export function rotateDevelopmentKeys(text) {
  let next = setEnvValue(text, 'JWT_SECRET', generateJwtSecret());
  next = setEnvValue(next, 'ENCRYPTION_KEY', generateEncryptionKey());
  return next;
}

export function buildDevelopmentEnv(example) {
  let text = example;
  text = setEnvValue(text, 'NODE_ENV', 'development');
  text = setEnvValue(text, 'PORT', '3110');
  text = setEnvValue(text, 'CLIENT_PORT', '3120');
  text = setEnvValue(text, 'DB_FILENAME', 'capacinator.db');
  text = setEnvValue(text, 'JWT_SECRET', generateJwtSecret());
  text = setEnvValue(text, 'ENCRYPTION_KEY', generateEncryptionKey());
  if (/^ENCRYPTION_KEY=REPLACE_ME_WITH_BASE64_32_BYTES$/m.test(text)) {
    throw new Error('ENCRYPTION_KEY placeholder was not replaced');
  }
  if (/^JWT_SECRET=your-super-secret-jwt-key-change-in-production$/m.test(text)) {
    throw new Error('JWT_SECRET placeholder was not replaced');
  }
  return text;
}

function writePrivate(file, content) {
  fs.writeFileSync(file, content, { mode: 0o600 });
}

export function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capacinator-env-'));
  try {
    const example = [
      'NODE_ENV=development',
      'PORT=3456',
      'DB_FILENAME=capacinator.db',
      'JWT_SECRET=your-super-secret-jwt-key-change-in-production',
      'ENCRYPTION_KEY=REPLACE_ME_WITH_BASE64_32_BYTES',
      '',
    ].join('\n');
    const built = buildDevelopmentEnv(example);
    const get = (key) => built.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
    if (get('NODE_ENV') !== 'development') throw new Error('NODE_ENV not set');
    if (get('PORT') !== '3110') throw new Error('PORT not set');
    if (get('CLIENT_PORT') !== '3120') throw new Error('CLIENT_PORT not added');
    if (!/^[0-9a-f]{64}$/.test(get('JWT_SECRET'))) throw new Error('JWT_SECRET not random hex');
    const key = Buffer.from(get('ENCRYPTION_KEY'), 'base64');
    if (key.length !== 32) throw new Error('ENCRYPTION_KEY is not 32 bytes');
    if (built.includes('REPLACE_ME_WITH_BASE64_32_BYTES')) throw new Error('placeholder leaked');
    const target = path.join(dir, '.env.development');
    writePrivate(target, built);
    if ((fs.statSync(target).mode & 0o777) !== 0o600) throw new Error('env file mode is not 0600');
    console.log('✓ setup-env self-test passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }
  if (args.includes('--production')) {
    console.error('Refusing to generate production .env: inject it from the deployment environment.');
    process.exit(1);
  }
  if (!fs.existsSync(EXAMPLE)) {
    console.error(`✗ missing ${path.relative(ROOT, EXAMPLE)}`);
    process.exit(1);
  }
  const force = args.includes('--force');
  if (fs.existsSync(TARGET) && args.includes('--rotate')) {
    const rotated = rotateDevelopmentKeys(fs.readFileSync(TARGET, 'utf8'));
    writePrivate(TARGET, rotated);
    console.log(`✓ rotated JWT_SECRET and ENCRYPTION_KEY in ${path.relative(ROOT, TARGET)} (other keys preserved)`);
    return;
  }
  if (fs.existsSync(TARGET) && !force) {
    console.log(`· ${path.relative(ROOT, TARGET)} exists; leaving it untouched (use --force to overwrite, or --rotate to change keys only)`);
    return;
  }
  const example = fs.readFileSync(EXAMPLE, 'utf8');
  const built = buildDevelopmentEnv(example);
  writePrivate(TARGET, built);
  console.log(`✓ wrote ${path.relative(ROOT, TARGET)} with fresh development JWT/encryption keys`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
