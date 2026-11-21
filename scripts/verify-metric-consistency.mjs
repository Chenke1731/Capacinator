#!/usr/bin/env node
/**
 * D1 — cross-surface metric consistency checker.
 *
 * The bug class: the same user-visible number rendered by two pages with
 * different endpoints/windows/units ("8 over-allocated" here, "6" there).
 * This checker replays each surface's EXACT query (registry pins the code
 * source), extracts the values and compares surface-vs-surface — never
 * against hand-baked constants, so the census stays self-maintaining.
 *
 * must-equal            → values must match; any drift is a defect.
 * documented-difference → a note explaining the divergence (window/unit) is
 *                         mandatory; values are still reported for eyeballing
 *                         whether the divergence is defensible.
 *
 * Usage:
 *   node scripts/verify-metric-consistency.mjs            # census against the live dev stack
 *   node scripts/verify-metric-consistency.mjs --json tmp/d1.json
 *   node scripts/verify-metric-consistency.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEnvironment, authenticate } from './lib/ui-profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name) => argv[argv.indexOf(name) + 1];
const valid = new Set(['--json', '--selftest', '--help']);
for (let i = 0; i < argv.length; i += 1) {
  if (!valid.has(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
  if (argv[i] === '--json') i += 1;
}
if (has('--help')) {
  console.log('verify-metric-consistency: [--json FILE] [--selftest]');
  process.exit(0);
}

// ── pure helpers (selftest surface) ────────────────────────────────────────
export function resolveTemplate(query) {
  const now = new Date();
  // toISOString is UTC — at UTC+8 late evening a local month-start would
  // shift back a day. Format from local components instead (mirrors
  // getDefaultReportDateRange's toISODateString semantics).
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthPlus3End = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  return query
    .replaceAll('{today}', iso(now))
    .replaceAll('{monthStart}', iso(monthStart))
    .replaceAll('{monthPlus3End}', iso(monthPlus3End));
}

export function extractPath(payload, dotPath) {
  if (!dotPath) return payload;
  return dotPath.split('.').reduce((node, key) => {
    if (node == null) return undefined;
    if (key === 'length') return Array.isArray(node) ? node.length : undefined;
    return node[key];
  }, payload);
}

export function compareMetric(entry, surfaceValues) {
  // surfaceValues: [{page, value}] where value is scalar, or the raw array
  // for join/count strategies (arrays resolved per surface by the caller).
  const issues = [];
  const report = { id: entry.id, consistency: entry.consistency, surfaces: surfaceValues.map((s) => ({ page: s.page, value: s.value })) };
  if (entry.consistency === 'documented-difference' && !entry.note) {
    issues.push(`${entry.id}: documented-difference requires a note explaining the divergence`);
    return { ok: false, issues, report };
  }
  const first = surfaceValues[0]?.value;
  if (entry.consistency === 'documented-difference') {
    // Divergence is legitimate — the note carries the reason; report and pass.
    return { ok: true, issues: [], report };
  }
  for (const surface of surfaceValues.slice(1)) {
    if (entry.strategy === 'scalar') {
      if (Number(surface.value) !== Number(first)) {
        issues.push(`${entry.id}: ${surfaceValues[0].page}=${first} vs ${surface.page}=${surface.value}`);
      }
    } else if (entry.strategy === 'per-person-pct') {
      const tolerance = entry.tolerance ?? 0.5;
      const left = new Map(first.map((row) => [row.person_id, row.pct]));
      let compared = 0;
      let maxDelta = 0;
      for (const row of surface.value) {
        const other = left.get(row.person_id);
        if (other === undefined) continue;
        compared += 1;
        maxDelta = Math.max(maxDelta, Math.abs(other - row.pct));
      }
      report.join = { compared, maxDelta };
      if (compared === 0) issues.push(`${entry.id}: no overlapping person_id between surfaces`);
      else if (maxDelta > tolerance) issues.push(`${entry.id}: max per-person delta ${maxDelta.toFixed(2)}pp exceeds tolerance ${tolerance}`);
    } else if (entry.strategy === 'count-over-100') {
      if (Number(surface.value) !== Number(first)) {
        issues.push(`${entry.id}: ${surfaceValues[0].page}=${first} vs ${surface.page}=${surface.value} over-allocated`);
      }
    } else if (entry.strategy === 'per-person-count') {
      const tolerance = entry.tolerance ?? 0;
      const left = new Map(first.map((row) => [row.person_id, row.count]));
      let compared = 0;
      let maxDelta = 0;
      for (const row of surface.value) {
        const other = left.get(row.person_id);
        if (other === undefined) continue;
        compared += 1;
        if (!Number.isFinite(other) || !Number.isFinite(row.count)) {
          issues.push(`${entry.id}: non-finite count for ${row.person_id} (left=${other} right=${row.count})`);
          continue;
        }
        maxDelta = Math.max(maxDelta, Math.abs(other - row.count));
      }
      report.join = { compared, maxDelta };
      if (compared === 0) issues.push(`${entry.id}: no overlapping person_id between surfaces`);
      else if (maxDelta > tolerance) issues.push(`${entry.id}: max per-person count delta ${maxDelta} exceeds tolerance ${tolerance}`);
    }
  }
  return { ok: issues.length === 0, issues, report };
}

function rowsFor(entry, surface, payload) {
  const array = extractPath(payload, surface.extract);
  if (!Array.isArray(array)) throw new Error(`${entry.id}/${surface.page}: extract path "${surface.extract}" is not an array`);
  if (entry.strategy === 'per-person-count') {
    if (surface.groupBy === 'person_id+project_id') {
      // Count DISTINCT projects per person — the utilization endpoint's
      // project_count deduplicates by project while raw assignment rows
      // do not (沈设计 7 rows / 4 projects, first census finding).
      const perPerson = new Map();
      for (const row of array) {
        const personId = row.person_id;
        if (!perPerson.has(personId)) perPerson.set(personId, new Set());
        perPerson.get(personId).add(row.project_id);
      }
      return [...perPerson.entries()].map(([person_id, projects]) => ({ person_id, count: projects.size }));
    }
    return array.map((row) => ({
      person_id: row[surface.idPath ?? 'person_id'],
      count: Number(row[surface.countPath]),
    }));
  }
  return array.map((row) => ({
    person_id: row[surface.idPath ?? 'person_id'],
    pct: Number(row[surface.pctPath]),
  }));
}

// ── selftest: mutation-prove the comparison core ───────────────────────────
function selftest() {
  const checks = [];
  const check = (name, ok) => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} selftest ${name}`); };
  const scalarEntry = { id: 't.scalar', consistency: 'must-equal', strategy: 'scalar' };
  check('scalar equal passes', compareMetric(scalarEntry, [
    { page: 'a', value: 12 },
    { page: 'b', value: 12 },
  ]).ok);
  check('scalar drift fails', !compareMetric(scalarEntry, [
    { page: 'a', value: 12 },
    { page: 'b', value: 11 },
  ]).ok);
  const diffEntry = { id: 't.diff', consistency: 'documented-difference', note: 'window differs', strategy: 'scalar', surfaces: [] };
  check('documented difference passes with note', compareMetric(diffEntry, [
    { page: 'a', value: 100 },
    { page: 'b', value: 80 },
  ]).ok);
  check('documented difference without note fails', !compareMetric({ ...diffEntry, note: undefined }, [
    { page: 'a', value: 100 },
    { page: 'b', value: 80 },
  ]).ok);
  const pctEntry = { id: 't.pct', consistency: 'must-equal', strategy: 'per-person-pct', tolerance: 0.5 };
  check('per-person within tolerance passes', compareMetric(pctEntry, [
    { page: 'a', value: [{ person_id: 'p1', pct: 80 }, { person_id: 'p2', pct: 120 }] },
    { page: 'b', value: [{ person_id: 'p1', pct: 80.2 }, { person_id: 'p2', pct: 120 }] },
  ]).ok);
  check('per-person drift fails', !compareMetric(pctEntry, [
    { page: 'a', value: [{ person_id: 'p1', pct: 80 }] },
    { page: 'b', value: [{ person_id: 'p1', pct: 95 }] },
  ]).ok);
  check('no overlap fails', !compareMetric(pctEntry, [
    { page: 'a', value: [{ person_id: 'p1', pct: 80 }] },
    { page: 'b', value: [{ person_id: 'p9', pct: 80 }] },
  ]).ok);
  check('template resolves dates', /^\d{4}-\d{2}-\d{2}$/.test(resolveTemplate('{today}')) && resolveTemplate('{monthStart}').endsWith('-01'));
  check('extract walks arrays', extractPath({ data: { data: [1, 2, 3] } }, 'data.data.length') === 3);
  return checks.every(Boolean);
}

if (has('--selftest')) process.exit(selftest() ? 0 : 1);

// ── census ─────────────────────────────────────────────────────────────────
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/lib/invariants/d1-registry.json'), 'utf8'));
const auth = await authenticate();
const headers = { Authorization: `Bearer ${auth.accessToken}` };

const findings = [];
for (const entry of registry.metrics) {
  const surfaceValues = [];
  for (const surface of entry.surfaces) {
    const url = `${auditEnvironment.api}${resolveTemplate(surface.endpoint)}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${entry.id}/${surface.page}: ${surface.endpoint} → ${response.status}`);
    const payload = await response.json();
    let value;
    if (entry.strategy === 'scalar') value = extractPath(payload, surface.extract);
    else if (entry.strategy === 'per-person-pct') value = rowsFor(entry, surface, payload);
    else if (entry.strategy === 'per-person-count') value = rowsFor(entry, surface, payload);
    else if (entry.strategy === 'count-over-100') {
      value = rowsFor(entry, surface, payload).filter((row) => row.pct > 100).length;
    }
    if (value === undefined) throw new Error(`${entry.id}/${surface.page}: extract path "${surface.extract}" resolved undefined`);
    surfaceValues.push({ page: surface.page, value });
  }
  const verdict = compareMetric(entry, surfaceValues);
  findings.push(verdict);
  const detail = verdict.report.join ? ` (join: ${verdict.report.join.compared} people, maxΔ ${verdict.report.join.maxDelta.toFixed(2)}pp)` : '';
  console.log(`${verdict.ok ? 'PASS' : 'FAIL'} ${entry.id} [${entry.consistency}]${detail}`);
  for (const s of verdict.report.surfaces) console.log(`    ${s.page}: ${typeof s.value === 'number' ? s.value : Array.isArray(s.value) ? `${s.value.length} rows` : s.value}`);
  for (const issue of verdict.issues) console.log(`    ! ${issue}`);
}

const failed = findings.filter((f) => !f.ok);
if (has('--json')) {
  const file = path.resolve(ROOT, value('--json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2)}\n`);
  console.log(`report: ${path.relative(ROOT, file)}`);
}
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} D1 metric consistency: ${findings.length - failed.length}/${findings.length} consistent`);
process.exit(failed.length ? 1 : 0);
