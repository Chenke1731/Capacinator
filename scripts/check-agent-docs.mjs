#!/usr/bin/env node
/**
 * Drift guard for the generated AGENTS.md mirror (I19h).
 * Fails when CLAUDE.md changed without `npm run agents:sync`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const agentsPath = path.join(ROOT, 'AGENTS.md');
if (!fs.existsSync(agentsPath)) {
  console.error('✗ AGENTS.md missing; run `npm run agents:sync`');
  process.exit(1);
}
const agents = fs.readFileSync(agentsPath, 'utf8');
const expected = agents.startsWith('<!-- GENERATED FILE:')
  ? `<!-- GENERATED FILE: edit CLAUDE.md, then run \`npm run agents:sync\`. -->\n<!-- This mirror exists so Codex/other AGENTS.md readers get the same rules. -->\n\n${source}`
  : null;
if (expected === null) {
  console.error('✗ AGENTS.md is not a generated mirror; run `npm run agents:sync`');
  process.exit(1);
}
if (agents !== expected) {
  console.error('✗ AGENTS.md is stale; run `npm run agents:sync` and commit the mirror');
  process.exit(1);
}
console.log('✓ AGENTS.md matches CLAUDE.md');
