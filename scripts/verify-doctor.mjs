#!/usr/bin/env node
/**
 * Environment doctor (I19b): one command that answers "can this machine run the
 * project's verification stack?".
 *
 * Exit codes: 0 = PASS (warnings allowed), 1 = FAIL, 2 = could not run.
 *
 * It never prints secret values; only key names and PASS/WARN/FAIL status.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const add = (status, name, detail = '') => results.push({ status, name, detail });

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function command(cmd, args = []) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
}

function major(version) {
  return Number(String(version).replace(/^v/, '').split('.')[0]);
}

function checkNode() {
  const expected = exists('.nvmrc') ? read('.nvmrc').trim() : '';
  if (!expected) {
    add('FAIL', 'node', '.nvmrc missing');
    return;
  }
  const actual = process.versions.node;
  if (major(actual) !== major(expected)) {
    add('FAIL', 'node', `current ${actual}; .nvmrc ${expected} (use nvm use)`);
  } else {
    add('PASS', 'node', actual);
  }

  const pkg = JSON.parse(read('package.json'));
  const wanted = pkg.packageManager?.replace(/^npm@/, '');
  const npm = command('npm', ['-v']);
  if (npm.status !== 0) {
    add('FAIL', 'npm', 'not runnable');
  } else if (wanted && npm.stdout.trim() !== wanted) {
    add('WARN', 'npm', `current ${npm.stdout.trim()}; packageManager npm@${wanted}`);
  } else {
    add('PASS', 'npm', npm.stdout.trim());
  }
}

function checkHooks() {
  const r = command('git', ['config', '--get', 'core.hooksPath']);
  const value = (r.stdout ?? '').trim();
  if (value !== '.githooks') add('FAIL', 'hooks', `core.hooksPath=${value || '(unset)'}; expected .githooks`);
  else add('PASS', 'hooks', '.githooks');
}

async function checkChromium() {
  try {
    const mod = await import('./lib/browser.mjs');
    const chrome = mod.resolveChromium();
    add('PASS', 'chromium', chrome);
  } catch (error) {
    add('FAIL', 'chromium', error instanceof Error ? error.message : String(error));
  }
}

function checkPorts() {
  const ports = [3110, 3120, 3111, 3122, 3131, 3132];
  return Promise.all(ports.map((port) => new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 300 });
    socket.once('connect', () => { socket.destroy(); resolve({ port, inUse: true }); });
    socket.once('timeout', () => { socket.destroy(); resolve({ port, inUse: false }); });
    socket.once('error', () => resolve({ port, inUse: false }));
  }))).then((rows) => {
    const inUse = rows.filter((r) => r.inUse).map((r) => r.port);
    if (inUse.length) add('WARN', 'ports', `in use: ${inUse.join(', ')} (dev/e2e stack may be running)`);
    else add('PASS', 'ports', '3110/3120/3111/3122/3131/3132 free');
  });
}

function checkVlmkit() {
  const v = command('vlmkit', ['--version']);
  if (v.status !== 0) {
    add('WARN', 'vlmkit', 'not installed (layout nightly disabled)');
    return;
  }
  const version = (v.stdout || v.stderr || '').trim().split('\n')[0];
  add('PASS', 'vlmkit', version);
  const root = command('npm', ['root', '-g']);
  if (root.status === 0) {
    const pkg = path.join(root.stdout.trim(), '@mizchi/vlmkit', 'package.json');
    if (fs.existsSync(pkg)) {
      const engines = JSON.parse(fs.readFileSync(pkg, 'utf8')).engines?.node;
      if (engines && major(process.versions.node) < major(engines.replace(/[^0-9.]/g, ''))) {
        add('WARN', 'vlmkit engines', `vlmkit wants ${engines}; current ${process.versions.node} (runtime exception documented)`);
      }
    }
  }
}

function checkCron() {
  const r = command('crontab', ['-l']);
  if (r.status !== 0) {
    add('WARN', 'cron', 'crontab unavailable');
  } else if (!r.stdout.includes('capacinator-audit-nightly')) {
    add('WARN', 'cron', 'audit-nightly cron not installed (npm run audit:nightly:cron)');
  } else {
    add('PASS', 'cron', 'audit-nightly installed');
  }
}

function checkEnv() {
  for (const rel of ['.env.example', '.env.test', '.env.e2e']) {
    if (!exists(rel)) add('FAIL', 'env', `${rel} missing`);
  }
  if (!exists('.env.development')) {
    add('WARN', 'env', '.env.development missing (npm run setup:env)');
  } else {
    const text = read('.env.development');
    if (/^JWT_SECRET=(your-super-secret|REPLACE_ME|)$/m.test(text)) add('FAIL', 'env', '.env.development JWT_SECRET is a placeholder');
    if (/^ENCRYPTION_KEY=(REPLACE_ME_WITH_BASE64_32_BYTES|)$/m.test(text)) add('FAIL', 'env', '.env.development ENCRYPTION_KEY is a placeholder');
  }
  if (exists('.env.development')) add('PASS', 'env', 'local env present');
}

function checkSecurityTools() {
  for (const cmd of ['gitleaks', 'osv-scanner']) {
    if (command('sh', ['-c', `command -v ${cmd}`]).status === 0) add('PASS', cmd, 'installed');
    else add(process.env.REQUIRE_SECURITY_TOOLS === '1' ? 'FAIL' : 'WARN', cmd, 'not installed');
  }
}

function checkDbIsolation() {
  const knex = exists('src/server/database/knexfile.e2e.ts') ? read('src/server/database/knexfile.e2e.ts') : '';
  const nightly = exists('scripts/audit-nightly.mjs') ? read('scripts/audit-nightly.mjs') : '';
  const knexOk = /E2E_DB_PATH|DATABASE_URL/.test(knex);
  const nightlyOk = /AUDIT_NIGHTLY_DB|E2E_DB_PATH/.test(nightly || '');
  if (!knexOk) add('FAIL', 'e2e-db', 'knexfile.e2e.ts does not accept E2E_DB_PATH/DATABASE_URL');
  else if (!nightlyOk) add('FAIL', 'e2e-db', 'audit-nightly.mjs does not set an isolated E2E DB path');
  else add('PASS', 'e2e-db', 'nightly/E2E DB paths are configurable');
}

async function main() {
  checkNode();
  checkHooks();
  await checkChromium();
  await checkPorts();
  checkVlmkit();
  checkCron();
  checkEnv();
  checkSecurityTools();
  checkDbIsolation();

  let failed = false;
  for (const r of results) {
    console.log(`${r.status.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (r.status === 'FAIL') failed = true;
  }
  console.log(failed ? '✗ verify:doctor found blocking issues' : '✓ verify:doctor passed');
  return failed ? 1 : 0;
}

process.exit(await main());
