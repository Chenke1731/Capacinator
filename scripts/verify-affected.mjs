#!/usr/bin/env node
/**
 * Change-aware fast verification entry point.
 *
 * This is the iteration-time gate: it runs the cheap/static checks plus only
 * the affected states/visual/browser surfaces. The full matrix and verify:pr
 * remain batch-end actions.
 *
 * Usage:
 *   node scripts/verify-affected.mjs --changed
 *   node scripts/verify-affected.mjs --files client/src/pages/People.tsx
 *   node scripts/verify-affected.mjs --changed --visual
 *   node scripts/verify-affected.mjs --changed --all-states
 *   node scripts/verify-affected.mjs --changed --dry-run
 *   node scripts/verify-affected.mjs --selftest
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { classifyFiles } from './lib/verify-map.mjs';
import { profiles } from './lib/ui-profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { spawnSync } = require('node:child_process');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const valid = new Set([
  '--changed', '--files', '--base', '--parallel', '--all-states', '--visual', '--e2e',
  '--dry-run', '--selftest', '--help',
]);
for (let i = 0; i < argv.length; i += 1) {
  if (!valid.has(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
  if (['--files', '--base', '--parallel'].includes(argv[i])) {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${argv[i]}`);
    i += 1;
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
}

export function changedFiles() {
  const files = new Set();
  const base = value('--base');
  if (base) git(['diff', '--name-only', `${base}...HEAD`]).forEach((file) => files.add(file));
  git(['diff', '--name-only']).forEach((file) => files.add(file));
  git(['diff', '--cached', '--name-only']).forEach((file) => files.add(file));
  git(['ls-files', '--others', '--exclude-standard']).forEach((file) => files.add(file));
  return [...files].sort();
}

export function buildPlan(files, options = {}) {
  const plan = classifyFiles(files);
  const cssChanged = files.some((file) => file.endsWith('.css'));
  const sharedUi = files.some((file) =>
    file.startsWith('client/src/components/ui/') ||
    file.startsWith('client/src/styles/') ||
    file === 'client/src/index.css' ||
    file === 'client/src/App.css' ||
    file === 'client/src/App.tsx'
  );
  const clientChanged = files.some((file) => file.startsWith('client/src/'));
  const statesProfiles = options.allStates
    ? Object.keys(profiles)
    : plan.profiles;
  return {
    files,
    plan,
    cssChanged,
    sharedUi,
    clientChanged,
    u1u3: clientChanged || plan.clientTests.length > 0,
    u2: cssChanged || sharedUi,
    statesProfiles: [...new Set(statesProfiles)],
    visualProfiles: options.visual ? [...new Set(plan.profiles)] : [],
    e2eSpecs: options.e2e ? plan.e2e : [],
  };
}

function selftest() {
  const page = buildPlan(['client/src/pages/People.tsx']);
  const css = buildPlan(['client/src/pages/People.css']);
  const server = buildPlan(['src/server/api/controllers/PeopleController.ts']);
  const checks = [
    ['page maps states', page.statesProfiles.includes('people')],
    ['page needs U1/U3', page.u1u3],
    ['page does not need U2', !page.u2],
    ['css needs U2', css.u2],
    ['css maps states', css.statesProfiles.includes('people')],
    ['server maps server tests', server.plan.serverTests.length > 0],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} selftest ${name}`);
  return checks.every(([, ok]) => ok);
}

if (has('--selftest')) process.exit(selftest() ? 0 : 1);
if (has('--help')) {
  console.log('verify-affected: --changed | --files a,b [--base ref] [--parallel N] [--all-states] [--visual] [--e2e] [--dry-run] [--selftest]');
  process.exit(0);
}

const explicitFiles = value('--files');
const files = explicitFiles
  ? explicitFiles.split(',').map((file) => file.trim()).filter(Boolean)
  : changedFiles();
if (!files.length) {
  console.log('· no changed files; nothing to verify');
  process.exit(0);
}
const parallel = Math.max(1, Math.min(6, Number(value('--parallel') ?? 3)));
const dryRun = has('--dry-run');
const plan = buildPlan(files, { visual: has('--visual'), e2e: has('--e2e'), allStates: has('--all-states') });

function run(label, command, args) {
  return new Promise((resolve) => {
    if (dryRun) {
      console.log(`[dry-run] ${path.basename(command)} ${args.join(' ')}`);
      resolve({ label, ok: true, seconds: 0, output: '' });
      return;
    }
    const started = Date.now();
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ label, ok: false, seconds: (Date.now() - started) / 1000, output: `${output}\n${error.message}` }));
    child.on('exit', (code) => resolve({ label, ok: code === 0, seconds: (Date.now() - started) / 1000, output }));
  });
}

async function runGroup(title, steps) {
  if (!steps.length) return true;
  console.log(`\n── ${title} ──`);
  const queue = [...steps];
  const results = [];
  const worker = async () => {
    while (queue.length) {
      const step = queue.shift();
      const result = await run(step.label, step.command, step.args);
      results.push(result);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label} (${result.seconds.toFixed(1)}s)`);
      if (!result.ok) {
        const lines = result.output.split('\n').filter(Boolean);
        console.log(lines.slice(-40).map((line) => `  ${line}`).join('\n'));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, steps.length) }, () => worker()));
  return results.every((result) => result.ok);
}

const staticSteps = [];
const addSelftest = (label, script, args = ['--selftest']) => {
  if (!staticSteps.some((step) => step.label === label)) {
    staticSteps.push({ label, command: process.execPath, args: [script, ...args] });
  }
};
if (files.includes('scripts/verify-affected.mjs')) addSelftest('selftest verify-affected', 'scripts/verify-affected.mjs');
if (files.includes('scripts/verify-states-many.mjs')) addSelftest('selftest verify-states-many', 'scripts/verify-states-many.mjs');
if (files.some((file) => file === 'scripts/verify-invariants.mjs' || file.startsWith('scripts/lib/invariants/'))) {
  addSelftest('selftest verify-invariants', 'scripts/verify-invariants.mjs');
  addSelftest('selftest verify-css-isolation', 'scripts/verify-css-isolation.mjs');
}
if (files.includes('scripts/verify-css-isolation.mjs')) addSelftest('selftest verify-css-isolation', 'scripts/verify-css-isolation.mjs');
if (files.some((file) => file === 'scripts/lib/verify-map.mjs' || file === 'scripts/verify-tier.mjs')) {
  addSelftest('selftest verify-tier/map', 'scripts/verify-tier.mjs', ['--self-test']);
}
if (files.some((file) => file.endsWith('.css'))) {
  staticSteps.push({ label: 'lint:ui', command: 'npm', args: ['run', 'lint:ui'] });
}
if (plan.clientChanged || plan.plan.clientTests.length) {
  staticSteps.push({ label: 'typecheck:client', command: 'npm', args: ['run', 'typecheck:client'] });
}
if (plan.plan.serverTests.length || plan.plan.integrationTests.length || plan.plan.full) {
  staticSteps.push({ label: 'typecheck:root', command: 'npm', args: ['run', 'typecheck'] });
}
const lintFiles = plan.plan.eslintFiles.filter((file) => /\.(ts|tsx)$/.test(file));
if (lintFiles.length) {
  staticSteps.push({ label: 'eslint changed', command: 'npx', args: ['eslint', ...lintFiles] });
}

const testSteps = [];
if (plan.plan.full) {
  testSteps.push({ label: 'Jest full', command: 'npx', args: ['jest', '--config', 'jest.config.cjs', '--runInBand'] });
} else {
  const relation = (project, list, label) => {
    const present = list.filter((file) => file.startsWith('client/') || file.startsWith('src/') || file.startsWith('shared/') || file.startsWith('tests/'));
    if (!present.length) return;
    testSteps.push({ label, command: 'npx', args: ['jest', '--config', 'jest.config.cjs', '--selectProjects', project, '--findRelatedTests', ...present, '--runInBand'] });
  };
  relation('client', plan.plan.clientTests, 'Jest related client');
  relation('server-unit', plan.plan.serverTests, 'Jest related server-unit');
  relation('server-integration', plan.plan.integrationTests, 'Jest related server-integration');
}

const browserSteps = [];
if (plan.u1u3) {
  browserSteps.push({ label: 'U1/U3 changed routes', command: process.execPath, args: ['scripts/verify-invariants.mjs', '--id', 'U1,U3', '--files', files.join(',')] });
}
if (plan.u2) {
  browserSteps.push({ label: 'U2 CSS isolation strict', command: process.execPath, args: ['scripts/verify-css-isolation.mjs', '--all', '--strict'] });
}
if (plan.statesProfiles.length) {
  browserSteps.push({
    label: `states (${plan.statesProfiles.length} profiles)`,
    command: process.execPath,
    args: ['scripts/verify-states-many.mjs', '--profiles', plan.statesProfiles.join(','), '--parallel', String(Math.min(3, plan.statesProfiles.length))],
  });
}
if (plan.visualProfiles.length) {
  for (const profile of plan.visualProfiles) {
    browserSteps.push({ label: `visual ${profile}`, command: process.execPath, args: ['scripts/verify-visual.mjs', '--profile', profile] });
  }
}
if (plan.e2eSpecs.length) {
  browserSteps.push({ label: 'E2E mapped specs', command: 'npx', args: ['playwright', 'test', ...plan.e2eSpecs, '--config', 'playwright.config.ts', '--retries=1'] });
}

console.log(`changed files (${files.length}); client=${plan.plan.clientTests.length} server=${plan.plan.serverTests.length} profiles=${plan.statesProfiles.length}${plan.plan.wide ? ' wide' : ''}`);
if (!(await runGroup('Static / type / lint', staticSteps))) process.exit(1);
if (!(await runGroup('Targeted tests', testSteps))) process.exit(1);
if (!(await runGroup('Affected browser checks', browserSteps))) process.exit(1);
console.log('\n✓ verify:affected passed');
