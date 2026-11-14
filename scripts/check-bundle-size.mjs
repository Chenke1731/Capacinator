#!/usr/bin/env node
/**
 * Bundle size budget (I19e).
 *
 * Reads the production client build (`dist-client/assets/*.js`), gzips each
 * chunk, and compares total + largest chunk against `bundle-budget.json`.
 * 10% headroom is allowed; --update writes a new baseline after a reviewed build.
 *
 * Usage:
 *   npm run build:client && node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --update
 *   node scripts/check-bundle-size.mjs --self-test
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist-client', 'assets');
const BUDGET = path.join(ROOT, 'bundle-budget.json');
const HEADROOM = 1.1;

export function measureDir(dir) {
  if (!fs.existsSync(dir)) throw new Error(`missing directory: ${dir}; run \`npm run build:client\` first`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  if (!files.length) throw new Error(`no .js files in ${dir}; run \`npm run build:client\` first`);
  const chunks = files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file));
    return { file, gzipBytes: zlib.gzipSync(raw).length };
  });
  const totalGzipBytes = chunks.reduce((sum, c) => sum + c.gzipBytes, 0);
  const largest = chunks.reduce((a, b) => (b.gzipBytes > a.gzipBytes ? b : a));
  return { chunks, totalGzipBytes, largest };
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capacinator-bundle-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.js'), 'console.log("a");'.repeat(100));
    fs.writeFileSync(path.join(dir, 'b.js'), 'console.log("b");'.repeat(400));
    const result = measureDir(dir);
    if (result.chunks.length !== 2) throw new Error('self-test: expected 2 chunks');
    if (result.totalGzipBytes <= result.largest.gzipBytes) throw new Error('self-test: total must exceed largest');
    if (result.largest.file !== 'b.js') throw new Error('self-test: largest chunk should be b.js');
    console.log('✓ bundle-size self-test passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return 0;
  }
  const current = measureDir(DIST);
  const summary = {
    totalGzipBytes: current.totalGzipBytes,
    largestChunkGzipBytes: current.largest.gzipBytes,
    largestChunk: current.largest.file,
    chunks: current.chunks.length,
    updated: new Date().toISOString(),
  };

  if (process.argv.includes('--update')) {
    fs.writeFileSync(BUDGET, `${JSON.stringify({ ...summary, note: 'Baseline for 10% headroom gate; update only after reviewing the stats.html diff.' }, null, 2)}\n`);
    console.log(`✓ wrote ${path.relative(ROOT, BUDGET)}: total ${kb(summary.totalGzipBytes)}, largest ${kb(summary.largestChunkGzipBytes)} (${summary.largestChunk})`);
    return 0;
  }

  if (!fs.existsSync(BUDGET)) {
    console.error(`✗ ${path.relative(ROOT, BUDGET)} missing; run with --update after a reviewed build`);
    return 2;
  }
  const budget = JSON.parse(fs.readFileSync(BUDGET, 'utf8'));
  const failures = [];
  if (current.totalGzipBytes > budget.totalGzipBytes * HEADROOM) {
    failures.push(`total ${kb(current.totalGzipBytes)} > budget ${kb(budget.totalGzipBytes)} × ${HEADROOM}`);
  }
  if (current.largest.gzipBytes > budget.largestChunkGzipBytes * HEADROOM) {
    failures.push(`largest ${kb(current.largest.gzipBytes)} > budget ${kb(budget.largestChunkGzipBytes)} × ${HEADROOM}`);
  }
  console.log(`bundle: total ${kb(current.totalGzipBytes)} (budget ${kb(budget.totalGzipBytes)}), largest ${kb(current.largest.gzipBytes)} (budget ${kb(budget.largestChunkGzipBytes)}, ${current.largest.file})`);
  if (failures.length) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    return 1;
  }
  console.log('✓ bundle size within budget');
  return 0;
}

process.exit(main());
