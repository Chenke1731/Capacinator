#!/usr/bin/env node
/**
 * Local documentation link checker (I19g).
 *
 * Checks relative links in docs (recursively) and root markdown files. External URLs are not
 * fetched (local-first; lychee can be added later for scheduled link checks).
 *
 * Usage:
 *   node scripts/check-doc-links.mjs            # report; exit 0
 *   node scripts/check-doc-links.mjs --strict   # exit 1 on broken links
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'dist-client', 'dist-electron', 'archived'].includes(entry.name)) return [];
      return walk(full);
    }
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function stripFences(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

const files = [
  ...walk(path.join(ROOT, 'docs')),
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.md')).map((f) => path.join(ROOT, f)),
];

const broken = [];
for (const file of files) {
  const text = stripFences(fs.readFileSync(file, 'utf8'));
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (/^(https?:|mailto:|tel:|#)/i.test(target)) continue;
    target = target.replace(/\s+["'][^"']*["']\s*$/, '');
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split('#')[0];
    if (!target) continue;
    const resolved = target.startsWith('/')
      ? path.join(ROOT, target.slice(1))
      : path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      broken.push({ file: path.relative(ROOT, file), target });
    }
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} broken local doc link(s):`);
  for (const entry of broken.slice(0, 50)) console.error(`  ${entry.file} -> ${entry.target}`);
  if (broken.length > 50) console.error(`  … and ${broken.length - 50} more`);
  process.exit(strict ? 1 : 0);
}
console.log(`✓ no broken local doc links (${files.length} files checked)`);
