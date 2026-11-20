#!/usr/bin/env node
/**
 * Run several verify-states profiles with bounded parallelism.
 *
 * Usage:
 *   node scripts/verify-states-many.mjs --profiles people,assignments,reports
 *   node scripts/verify-states-many.mjs --profiles people,assignments --parallel 2 --quick
 *   node scripts/verify-states-many.mjs --selftest
 *
 * Each profile keeps its own report file; browser contexts are independent.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { profiles } from './lib/ui-profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const valid = new Set(['--profiles', '--parallel', '--quick', '--dry-run', '--selftest', '--help']);
for (let i = 0; i < argv.length; i += 1) {
  if (!valid.has(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
  if (['--profiles', '--parallel'].includes(argv[i])) {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${argv[i]}`);
    i += 1;
  }
}

export function parseProfiles(raw) {
  return [...new Set(String(raw ?? '').split(',').map((item) => item.trim()).filter(Boolean))];
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function selftest() {
  const checks = [
    ['parse/dedupe', JSON.stringify(parseProfiles('people, assignments,people')) === JSON.stringify(['people', 'assignments'])],
    ['chunk 2', JSON.stringify(chunk(['a', 'b', 'c'], 2)) === JSON.stringify([['a', 'b'], ['c']])],
    ['chunk 3', JSON.stringify(chunk(['a', 'b', 'c'], 3)) === JSON.stringify([['a', 'b', 'c']])],
    ['known profile', Boolean(profiles.people)],
    ['unknown profile', !profiles['not-a-profile']],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} selftest ${name}`);
  return checks.every(([, ok]) => ok);
}

if (has('--selftest')) process.exit(selftest() ? 0 : 1);
if (has('--help')) {
  console.log(`verify-states-many: --profiles a,b,c [--parallel N] [--quick] [--dry-run] [--selftest]`);
  console.log(`profiles: ${Object.keys(profiles).join(', ')}`);
  process.exit(0);
}

const profilesToRun = parseProfiles(value('--profiles'));
if (!profilesToRun.length) throw new Error('--profiles is required');
const unknown = profilesToRun.filter((name) => !profiles[name]);
if (unknown.length) throw new Error(`Unknown profile(s): ${unknown.join(', ')}`);
const parallel = Math.max(1, Math.min(6, Number(value('--parallel') ?? 3)));
const quick = has('--quick');
const dryRun = has('--dry-run');

function runOne(profile) {
  return new Promise((resolve) => {
    const started = Date.now();
    const args = ['scripts/verify-states.mjs', '--profile', profile, ...(quick ? ['--quick'] : [])];
    if (dryRun) {
      console.log(`[dry-run] node ${args.join(' ')}`);
      resolve({ profile, ok: true, seconds: 0, output: '' });
      return;
    }
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => {
      resolve({ profile, ok: false, seconds: (Date.now() - started) / 1000, output: `${output}\n${error.message}` });
    });
    child.on('exit', (code) => {
      resolve({ profile, ok: code === 0, seconds: (Date.now() - started) / 1000, output });
    });
  });
}

const startedAll = Date.now();
const results = [];
for (const batch of chunk(profilesToRun, parallel)) {
  const batchResults = await Promise.all(batch.map(runOne));
  for (const result of batchResults) {
    results.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.profile} ${result.seconds.toFixed(1)}s`);
    if (!result.ok) {
      const lines = result.output.split('\n').filter(Boolean);
      console.log(lines.slice(-30).map((line) => `  ${line}`).join('\n'));
    }
  }
}
const failed = results.filter((result) => !result.ok);
const wall = ((Date.now() - startedAll) / 1000).toFixed(1);
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} verify-states-many: ${results.length - failed.length}/${results.length} passed, wall=${wall}s, parallel=${parallel}`);
process.exit(failed.length ? 1 : 0);
