#!/usr/bin/env node
/**
 * dependency-cruiser gate (I19d).
 *
 * Known circulars are baselined in .dependency-cruiser-known-violations.json;
 * only NEW violations fail. Missing tool = exit 2 (not a pass).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = ['--config', '.dependency-cruiser.cjs', 'client/src', 'src/server', 'shared', 'src/electron', '--ignore-known', '--output-type', 'err'];
// Hooks may be invoked from a Node 18 login shell; force the project Node for
// npx/depcruise (dependency-cruiser 18 needs node:util.styleText).
const PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`;
const r = spawnSync('npx', ['depcruise', ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH } });
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
if (r.error || r.status === null) {
  console.error('✗ dependency-cruiser could not run; install it with `npm install`');
  process.exit(2);
}
if (r.status !== 0) {
  console.error('✗ architecture violations found (new vs baseline)');
  process.exit(1);
}
console.log('✓ architecture check passed (no new violations vs baseline)');
