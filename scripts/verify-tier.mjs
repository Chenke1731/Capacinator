#!/usr/bin/env node
/**
 * Change-aware verification orchestrator (I19c).
 *
 *   node scripts/verify-tier.mjs --tier t0 [--base origin/main] [--files a,b] [--dry-run]
 *   node scripts/verify-tier.mjs --tier t1
 *   node scripts/verify-tier.mjs --tier t2 [--dry-run]
 *   node scripts/verify-tier.mjs --self-test
 *
 * T0 = fast iteration (typecheck + eslint changed + related Jest + at most 2 states profiles)
 * T1 = batch end (T0 + full states for affected profiles + cache keys + mapped E2E)
 * T2 = milestone (full lint/typecheck/Jest/visual/E2E)
 *
 * Exit codes: 0 = pass/printed plan, 1 = a command failed, 2 = cannot cover the
 * change at this tier (e.g. wide UI change at T0) or no tools.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyFiles, selfTest } from './lib/verify-map.mjs';
import { profiles } from './lib/ui-profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = has('--dry-run');
const tier = (value('--tier') ?? 't0').toLowerCase();
const base = value('--base');

function gitLines(gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

function collectChangedFiles() {
  const explicit = value('--files');
  if (explicit) return explicit.split(',').map((s) => s.trim()).filter(Boolean);
  const set = new Set();
  if (base) gitLines(['diff', '--name-only', `${base}...HEAD`]).forEach((f) => set.add(f));
  gitLines(['diff', '--name-only']).forEach((f) => set.add(f));
  gitLines(['diff', '--cached', '--name-only']).forEach((f) => set.add(f));
  gitLines(['ls-files', '--others', '--exclude-standard']).forEach((f) => set.add(f));
  return [...set].sort();
}

const existing = (files) => files.filter((f) => fs.existsSync(path.join(ROOT, f)));

function run(label, cmd, cmdArgs) {
  console.log(`\n── ${label} ──`);
  if (dryRun) {
    console.log(`[dry-run] ${cmd} ${cmdArgs.join(' ')}`);
    return true;
  }
  const started = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit' });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.error(`✗ ${label} failed (exit ${r.status}, ${secs}s)`);
    return false;
  }
  console.log(`✓ ${label} (${secs}s)`);
  return true;
}

function main() {
  if (has('--self-test')) {
    selfTest();
    return 0;
  }
  if (!['t0', 't1', 't2'].includes(tier)) {
    console.error(`✗ unknown tier: ${tier} (expected t0|t1|t2)`);
    return 2;
  }

  const changed = collectChangedFiles();
  if (changed.length === 0) {
    console.log('· no changed files; nothing to verify');
    return 0;
  }

  let plan;
  try {
    plan = classifyFiles(changed);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  console.log(`changed files (${changed.length}):`);
  for (const file of changed) console.log(`  ${file}`);
  console.log(`mapped: client=${plan.clientTests.length} server=${plan.serverTests.length} integration=${plan.integrationTests.length} profiles=${plan.profiles.length} e2e=${plan.e2e.length}${plan.wide ? ' wide' : ''}${plan.full ? ' full' : ''}`);

  if (tier === 't0' && (plan.wide || plan.full)) {
    console.error('✗ T0 cannot cover a wide UI change or dependency-manifest change. Run `verify:t1`.');
    return 2;
  }

  if (tier === 't2') {
    const steps = [
      ['Lint', 'npm', ['run', 'lint']],
      ['Typecheck (root)', 'npm', ['run', 'typecheck']],
      ['Typecheck (client budget)', 'node', ['scripts/client-typecheck-budget.mjs']],
      ['Typecheck (spec budget)', 'node', ['scripts/spec-typecheck-budget.mjs']],
      ['Jest (all projects)', 'npx', ['jest', '--config', 'jest.config.cjs']],
      ['E2E collection ledger', 'node', ['scripts/check-collection.mjs']],
      ['Redline annotations', 'node', ['scripts/check-redline-annotations.mjs']],
      ['Visual matrix (4 shards)', 'npm', ['run', 'verify:visual:shards', '--', '--shards', '4']],
      ['Playwright main', 'npx', ['playwright', 'test', '--config', 'playwright.config.ts']],
      ['Playwright scenarios', 'npx', ['playwright', 'test', '--config', 'playwright.scenario.config.ts']],
    ];
    for (const [label, cmd, cmdArgs] of steps) {
      if (!run(label, cmd, cmdArgs)) return 1;
    }
    return 0;
  }

  // T0/T1 common: environment preflight.
  if (!run('verify:doctor', 'node', ['scripts/verify-doctor.mjs'])) return 1;

  // Typechecks.
  if (plan.serverTests.length || plan.integrationTests.length) {
    if (!run('Typecheck (root)', 'npm', ['run', 'typecheck'])) return 1;
  }
  if (plan.clientTests.length) {
    if (!run('Typecheck (client budget)', 'node', ['scripts/client-typecheck-budget.mjs'])) return 1;
  }
  if (plan.e2e.length) {
    if (!run('Typecheck (spec budget)', 'node', ['scripts/spec-typecheck-budget.mjs'])) return 1;
  }

  // Changed-file ESLint (pre-commit does not run lint).
  const lintFiles = existing(plan.eslintFiles).filter((f) => /\.(ts|tsx)$/.test(f));
  if (lintFiles.length) {
    if (!run('ESLint (changed files)', 'npx', ['eslint', ...lintFiles])) return 1;
  }

  // Related Jest tests, split by project.
  const jest = (project, files, label) => {
    const present = existing(files);
    if (!present.length) return true;
    return run(label, 'npx', ['jest', '--config', 'jest.config.cjs', '--selectProjects', project, '--findRelatedTests', ...present]);
  };
  if (plan.full) {
    if (!run('Jest (all projects; dependency manifest changed)', 'npx', ['jest', '--config', 'jest.config.cjs'])) return 1;
  } else {
    if (!jest('client', plan.clientTests, 'Jest related (client)')) return 1;
    if (!jest('server-unit', plan.serverTests, 'Jest related (server-unit)')) return 1;
    if (!jest('server-integration', plan.integrationTests, 'Jest related (server-integration)')) return 1;
  }

  // CSS/static guards.
  if (changed.some((f) => f.endsWith('.css'))) {
    if (!run('UI CSS guards', 'npm', ['run', 'lint:ui'])) return 1;
  }
  if (plan.clientTests.length) {
    if (!run('Cache-key pairing', 'node', ['scripts/verify-cache-keys.mjs'])) return 1;
  }
  if (changed.some((f) => f.startsWith('migrations/'))) {
    if (!run('Migration immutability', 'node', ['scripts/check-migrations-immutable.mjs'])) return 1;
  }

  // States profiles.
  const profileNames = plan.wide ? Object.keys(profiles) : plan.profiles;
  if (tier === 't0') {
    if (profileNames.length > 2) {
      console.error(`✗ T0 covers at most 2 states profiles; this change maps ${profileNames.length}. Run \`verify:t1\`.`);
      return 2;
    }
    for (const profile of profileNames) {
      if (!run(`verify-states --quick (${profile})`, 'node', ['scripts/verify-states.mjs', '--profile', profile, '--quick'])) return 1;
    }
  } else {
    for (const profile of profileNames) {
      if (!run(`verify-states (${profile})`, 'node', ['scripts/verify-states.mjs', '--profile', profile])) return 1;
    }
  }

  // T1 UI invariants: changed routes only; full matrix stays at T2/nightly.
  if (tier === 't1' && plan.clientTests.length) {
    if (!run('UI invariants (U1 text fit + U3 actions, changed routes)', 'node', ['scripts/verify-invariants.mjs', '--id', 'U1,U3', '--changed'])) return 1;
  }
  const cssSurfaceChanged = changed.some((file) =>
    file.endsWith('.css') ||
    file.startsWith('client/src/components/ui/') ||
    file === 'client/src/index.css' ||
    file === 'client/src/App.css'
  );
  if (tier === 't1' && cssSurfaceChanged) {
    if (!run('CSS isolation census (strict)', 'node', ['scripts/verify-css-isolation.mjs', '--all', '--strict'])) return 1;
  }

  // T1 E2E (mapped specs only; source-to-spec mapping is explicit).
  if (tier === 't1' && plan.e2e.length) {
    const specs = existing(plan.e2e);
    if (specs.length) {
      if (!run('Playwright (mapped specs)', 'npx', ['playwright', 'test', ...specs, '--config', 'playwright.config.ts', '--retries=1'])) return 1;
    }
  }

  console.log(`\n✓ verify:${tier} passed${dryRun ? ' (dry-run)' : ''}`);
  return 0;
}

process.exit(main());
