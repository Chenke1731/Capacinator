#!/usr/bin/env node
/**
 * Security audit entry point.
 *
 *   node scripts/security-audit.mjs --secrets [--staged]
 *   node scripts/security-audit.mjs --deps [--update-baseline]
 *   node scripts/security-audit.mjs --signatures
 *   node scripts/security-audit.mjs --all
 *
 * Exit codes:
 *   0 = pass (warnings allowed)
 *   1 = real finding / new critical-high dependency vulnerability
 *   2 = tool missing or could not run (NOT a pass; callers must not treat as green)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tmp', 'security');
const GITLEAKS_CONFIG = path.join(ROOT, 'gitleaks.toml');
const OSV_BASELINE = path.join(ROOT, 'security', 'osv-baseline.json');
const SIGNATURE_EXCEPTIONS = path.join(ROOT, 'security', 'signature-exceptions.json');
const OSV_REPORT = path.join(TMP, 'osv.json');

const args = process.argv.slice(2);
const has = (name) => args.includes(name);

function ensureTmp() {
  fs.mkdirSync(TMP, { recursive: true });
}

function commandExists(cmd) {
  const r = spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' });
  return r.status === 0;
}

function run(cmd, cmdArgs, opts = {}) {
  // Hooks can run from a Node 18 login shell; force the project Node for npm/npx.
  const PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`;
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
    env: { ...process.env, PATH, ...(opts.env ?? {}) },
  });
}

function secrets() {
  if (!commandExists('gitleaks')) {
    console.error('✗ gitleaks not installed; install v8.30.1 (see scripts/security-audit.mjs header)');
    return 2;
  }
  const staged = has('--staged');
  const cmdArgs = ['git', '--config', GITLEAKS_CONFIG, '--redact', '--no-banner'];
  if (staged) cmdArgs.push('--pre-commit', '--staged');
  const r = run('gitleaks', cmdArgs);
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  return r.status === 0 ? 0 : 1;
}

function parseSeverity(vuln) {
  const raw = vuln.database_specific?.severity ?? vuln.severity?.[0]?.type ?? 'UNKNOWN';
  return String(raw).toUpperCase();
}

function flattenOsv(report) {
  const out = [];
  for (const result of report.results ?? []) {
    for (const pkg of result.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        out.push({
          key: `${pkg.package?.name}@${pkg.package?.version}:${vuln.id}`,
          package: pkg.package?.name,
          version: pkg.package?.version,
          id: vuln.id,
          severity: parseSeverity(vuln),
          summary: (vuln.summary ?? '').replace(/\s+/g, ' ').slice(0, 160),
        });
      }
    }
  }
  return out;
}

function loadBaseline() {
  if (!fs.existsSync(OSV_BASELINE)) return new Set();
  const data = JSON.parse(fs.readFileSync(OSV_BASELINE, 'utf8'));
  return new Set(data.findings ?? []);
}

function deps() {
  if (!commandExists('osv-scanner')) {
    console.error('✗ osv-scanner not installed; install v2.7.1 (see scripts/security-audit.mjs header)');
    return 2;
  }
  ensureTmp();
  const r = run('osv-scanner', ['scan', '-L', 'package-lock.json', '--format', 'json', '--output-file', OSV_REPORT]);
  if (!fs.existsSync(OSV_REPORT)) {
    process.stderr.write(r.stdout ?? '');
    process.stderr.write(r.stderr ?? '');
    console.error('✗ osv-scanner did not produce a report');
    return 2;
  }
  const report = JSON.parse(fs.readFileSync(OSV_REPORT, 'utf8'));
  const all = flattenOsv(report);
  const serious = all.filter((v) => v.severity === 'CRITICAL' || v.severity === 'HIGH');
  const counts = all.reduce((acc, v) => { acc[v.severity] = (acc[v.severity] ?? 0) + 1; return acc; }, {});

  if (has('--update-baseline')) {
    fs.mkdirSync(path.dirname(OSV_BASELINE), { recursive: true });
    fs.writeFileSync(
      OSV_BASELINE,
      `${JSON.stringify({
        note: 'Baseline of existing critical/high findings at adoption time. New findings fail the audit. Re-baseline only after remediation review.',
        updated: new Date().toISOString(),
        counts,
        findings: [...new Set(serious.map((v) => v.key))].sort(),
      }, null, 2)}\n`
    );
    console.log(`✓ wrote ${path.relative(ROOT, OSV_BASELINE)} (${serious.length} critical/high baseline entries)`);
    return 0;
  }

  const baseline = loadBaseline();
  if (all.length === 0 && baseline.size > 0) {
    console.error('✗ osv-scanner returned no results while a non-empty baseline exists; treat as scan-not-run');
    return 2;
  }
  const fresh = serious.filter((v) => !baseline.has(v.key));
  console.log(`OSV: ${all.length} findings; critical/high ${serious.length}; baseline ${baseline.size}; new critical/high ${fresh.length}`);
  if (counts.CRITICAL || counts.HIGH) console.log(`severity counts: ${JSON.stringify(counts)}`);
  if (fresh.length > 0) {
    for (const v of fresh.slice(0, 20)) {
      console.error(`✗ NEW ${v.severity} ${v.key} — ${v.summary}`);
    }
    if (fresh.length > 20) console.error(`… and ${fresh.length - 20} more new findings`);
    console.error('Update the baseline only after triage; fix or document an exception first.');
    return 1;
  }
  console.log('✓ no new critical/high dependency findings vs baseline');
  return 0;
}

function signatures() {
  const r = run('npm', ['audit', 'signatures']);
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(output);
  if (r.status === 0) return 0;

  let allowExpired = false;
  let exceptions = [];
  if (fs.existsSync(SIGNATURE_EXCEPTIONS)) {
    const data = JSON.parse(fs.readFileSync(SIGNATURE_EXCEPTIONS, 'utf8'));
    allowExpired = data.allowExpiredKeys === true;
    exceptions = data.packages ?? [];
  }
  const packages = [...output.matchAll(/(\S+@\S+) has a registry signature/g)].map((m) => m[1]);
  const unexpected = packages.filter((pkg) => !exceptions.includes(pkg));
  if (allowExpired && output.includes('EEXPIREDSIGNATUREKEY') && unexpected.length === 0) {
    console.warn(`⚠ npm audit signatures: ${packages.length} package(s) have expired registry signing keys; documented exception applies.`);
    return 0;
  }
  if (packages.length) console.error(`✗ signature findings not excepted: ${unexpected.join(', ')}`);
  return 1;
}

function main() {
  const codes = [];
  if (has('--secrets')) codes.push(secrets());
  if (has('--deps')) codes.push(deps());
  if (has('--signatures')) codes.push(signatures());
  if (has('--all')) {
    codes.push(secrets(), deps(), signatures());
  }
  if (codes.length === 0) {
    console.log('usage: security-audit.mjs [--secrets [--staged]] [--deps [--update-baseline]] [--signatures] [--all]');
    return 2;
  }
  if (codes.includes(2)) return 2;
  if (codes.includes(1)) return 1;
  return 0;
}

process.exit(main());
