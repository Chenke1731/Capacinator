#!/usr/bin/env node
/**
 * Local PR/merge gate (I19b/c). Replaces the former GitHub `test.yml`.
 *
 * Usage:
 *   node scripts/verify-pr.mjs            # full gate (includes smoke + L3 redline)
 *   node scripts/verify-pr.mjs --skip-e2e # static + unit/integration only
 *
 * Run under the Node version in .nvmrc (verify:doctor enforces it).
 * GitHub CI is intentionally not used; this is the local equivalent.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipE2e = process.argv.includes('--skip-e2e');
let failed = false;

function run(label, cmd, args, env = {}) {
  const started = Date.now();
  console.log(`\n── ${label} ──`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`✗ ${label} failed (exit ${r.status}, ${secs}s)`);
    failed = true;
    return false;
  }
  console.log(`✓ ${label} (${secs}s)`);
  return true;
}

const steps = [
  ['Environment doctor', 'node', ['scripts/verify-doctor.mjs']],
  ['Lint', 'npm', ['run', 'lint']],
  ['Architecture (new violations vs baseline)', 'node', ['scripts/check-architecture.mjs']],
  ['Agent docs mirror', 'node', ['scripts/check-agent-docs.mjs']],
  ['Docs local links', 'node', ['scripts/check-doc-links.mjs', '--strict']],
  // Full `verify:colors` is a T2 inventory gate and currently carries existing
  // unrelated debt; the PR gate only proves the guard itself is alive.
  ['Color guard self-test', 'npm', ['run', 'verify:colors:selftest']],
  ['UI invariants (static: U3 + D2)', 'node', ['scripts/verify-invariants.mjs', '--id', 'U3,D2', '--static-only']],
  ['Typecheck (root)', 'npm', ['run', 'typecheck']],
  ['Typecheck (client budget)', 'node', ['scripts/client-typecheck-budget.mjs']],
  ['Typecheck (spec budget)', 'node', ['scripts/spec-typecheck-budget.mjs']],
  ['Bundle build (client)', 'npm', ['run', 'build:client']],
  ['Bundle budget', 'node', ['scripts/check-bundle-size.mjs']],
  ['Jest (client + server-unit + server-integration)', 'npx', ['jest', '--config', 'jest.config.cjs', '--selectProjects', 'client', 'server-unit', 'server-integration']],
  ['E2E collection ledger', 'node', ['scripts/check-collection.mjs']],
  ['Redline annotations', 'node', ['scripts/check-redline-annotations.mjs']],
];

for (const [label, cmd, args] of steps) {
  if (!run(label, cmd, args)) break;
}

if (!failed && !skipE2e) {
  run('Playwright smoke', 'npx', ['playwright', 'test', '--config', 'playwright.config.ts', '--project=smoke', '--retries=1']);
  if (!failed) {
    run('Playwright L3 redline', 'npx', ['playwright', 'test', 'tests/e2e/suites/redline', '--config', 'playwright.config.ts', '--retries=1']);
  }
}

if (failed) {
  console.error('\n✗ verify:pr failed');
  process.exit(1);
}
console.log(`\n✓ verify:pr passed${skipE2e ? ' (E2E skipped)' : ''}`);
