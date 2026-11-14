#!/usr/bin/env node
/**
 * Generate AGENTS.md from CLAUDE.md (I19h).
 *
 * CLAUDE.md stays canonical for Claude Code/ZCode; Codex and other agents read
 * AGENTS.md. The mirror is generated to avoid two hand-maintained rulebooks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const header = [
  '<!-- GENERATED FILE: edit CLAUDE.md, then run `npm run agents:sync`. -->',
  '<!-- This mirror exists so Codex/other AGENTS.md readers get the same rules. -->',
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'AGENTS.md'), `${header}\n${source}`);
console.log('✓ AGENTS.md synced from CLAUDE.md');
