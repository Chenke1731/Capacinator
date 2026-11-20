#!/usr/bin/env node
/**
 * UI invariant runner — first wave: U1 text fit, U3 action safety, D2 envelope.
 *
 * Usage:
 *   node scripts/verify-invariants.mjs --id U1,U3 --changed
 *   node scripts/verify-invariants.mjs --id U1,U3 --all
 *   node scripts/verify-invariants.mjs --id D2
 *   node scripts/verify-invariants.mjs --id U1 --route /people --lang zh-CN,en-US
 *   node scripts/verify-invariants.mjs --selftest
 *
 * Exit: 0 = no blocking finding (warnings allowed), 1 = blocking finding,
 *       2 = runner/coverage failure (route missing, browser unavailable).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { auditEnvironment, authenticate, setupReadOnlyPage } from './lib/ui-profiles.mjs';
import { resolveRoutes } from './lib/invariants/routes.mjs';
import { measurePage } from './lib/invariants/runtime-metrics.mjs';
import { evaluateU1, evaluateLongContent } from './lib/invariants/u1-text-fit.mjs';
import { evaluateU3, scanNativeDialogs, nativeDialogFindings, findNativeDialogsInText } from './lib/invariants/u3-action-safety.mjs';
import { scanD2, d2Findings, scanControllerText, scanClientDefensiveText } from './lib/invariants/d2-api-envelope.mjs';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts/lib/invariant-baseline.json');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const valid = new Set([
  '--id', '--changed', '--files', '--all', '--route', '--profile', '--lang', '--viewports',
  '--theme', '--strict', '--json', '--selftest', '--settle', '--help',
  '--write-baseline', '--static-only', '--verbose', '--stress',
]);
for (let i = 0; i < argv.length; i += 1) {
  if (!valid.has(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
  if (['--id', '--files', '--route', '--profile', '--lang', '--viewports', '--theme', '--json', '--settle'].includes(argv[i])) {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${argv[i]}`);
    i += 1;
  }
}
if (has('--help')) {
  console.log(`verify-invariants: --id U1,U3,D2 [--changed|--files a,b|--all|--route PATH|--profile NAME] [--lang zh-CN,en-US] [--viewports 1366x768,1600x900] [--theme light] [--strict] [--verbose] [--stress] [--static-only] [--json FILE] [--write-baseline] [--selftest]`);
  process.exit(0);
}

const ids = (value('--id') ?? 'U1,U3,D2').split(',').map((id) => id.trim()).filter(Boolean);
for (const id of ids) if (!['U1', 'U3', 'D2'].includes(id)) throw new Error(`Unsupported invariant ${id}`);
const languages = (value('--lang') ?? 'zh-CN,en-US').split(',').map((lang) => lang.trim()).filter(Boolean);
const viewports = (value('--viewports') ?? '1366x768,1600x900').split(',').map((item) => {
  const match = /^(\d+)x(\d+)$/.exec(item.trim());
  if (!match) throw new Error(`Invalid viewport ${item}; expected WIDTHxHEIGHT`);
  return { width: Number(match[1]), height: Number(match[2]) };
});
const theme = value('--theme') ?? 'light';
const settle = Number(value('--settle') ?? 350);
const strict = has('--strict');
const stress = has('--stress');

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { entries: {} };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

const baseline = loadBaseline();
const baselineKey = (finding) => {
  if (finding.file) return `${finding.id}|${finding.rule}|${finding.file}|${String(finding.text || '').replace(/\s+/g, ' ').trim()}`;
  return `${finding.id}|${finding.rule}|${finding.route}|${finding.language}|${finding.viewport}|${finding.selector}`;
};
const isBaselined = (finding) => Boolean(baseline.entries?.[baselineKey(finding)]);

function report(findings) {
  const active = findings.filter((finding) => !isBaselined(finding));
  const blocking = active.filter((finding) => finding.severity === 'fail' || (strict && finding.severity === 'warn'));
  const verbose = has('--verbose');
  const warnings = active.filter((finding) => finding.severity === 'warn');
  const infos = active.filter((finding) => finding.severity === 'info');
  for (const finding of active.filter((item) => item.severity === 'fail')) {
    const where = finding.route === '*' ? finding.selector : `${finding.route} ${finding.viewport} ${finding.language}`;
    console.log(`FAIL ${finding.id} ${where} ${finding.rule}: ${finding.message}`);
  }
  if (verbose) {
    for (const finding of [...warnings, ...infos]) {
      const where = finding.route === '*' ? finding.selector : `${finding.route} ${finding.viewport} ${finding.language}`;
      console.log(`${finding.severity === 'warn' ? 'WARN' : 'INFO'} ${finding.id} ${where} ${finding.rule}: ${finding.message}`);
    }
  } else {
    const groups = new Map();
    for (const finding of warnings) {
      const key = `${finding.id}|${finding.rule}`;
      const group = groups.get(key) ?? { count: 0, sample: finding };
      group.count += 1;
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const [id, rule] = key.split('|');
      console.log(`WARN ${id} ${rule}: ${group.count} occurrence(s) — e.g. ${group.sample.selector}: ${group.sample.message}`);
    }
    if (infos.length) {
      const infoGroups = new Map();
      for (const finding of infos) {
        const key = `${finding.id}|${finding.rule}`;
        const group = infoGroups.get(key) ?? { count: 0, sample: finding };
        group.count += 1;
        infoGroups.set(key, group);
      }
      for (const [key, group] of infoGroups) {
        const [id, rule] = key.split('|');
        console.log(`INFO ${id} ${rule}: ${group.count} occurrence(s) — e.g. ${group.sample.selector}: ${group.sample.message}`);
      }
    }
  }
  return { active, blocking };
}

async function runStatic(idsToRun) {
  const findings = [];
  if (idsToRun.includes('U3')) {
    const dialogs = scanNativeDialogs(path.join(ROOT, 'client/src'));
    findings.push(...nativeDialogFindings(dialogs));
  }
  if (idsToRun.includes('D2')) {
    findings.push(...d2Findings(scanD2({ root: ROOT })));
  }
  return findings;
}

async function runRuntime(idsToRun) {
  const routes = resolveRoutes({
    changed: has('--changed'),
    files: (value('--files') ?? '').split(',').map((file) => file.trim()).filter(Boolean),
    all: has('--all'),
    route: value('--route'),
    profile: value('--profile'),
  });
  if (!routes.length) throw new Error('No routes resolved');
  const auth = await authenticate();
  const browser = await chromium.launch({ executablePath: auditEnvironment.chrome });
  const findings = [];
  const started = Date.now();
  try {
    for (const route of routes) {
      for (const language of languages) {
        for (const viewport of viewports) {
          const context = await browser.newContext({ viewport });
          const routeLabel = `${route.id} ${viewport.width}x${viewport.height} ${language}`;
          try {
            const session = await setupReadOnlyPage(context, auth, theme, { language });
            const page = session.page;
            await page.goto(`${auditEnvironment.base}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
            if (route.ready) {
              await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 15000 });
            }
            await page.evaluate(() => document.fonts.ready);
            await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });
            await page.waitForTimeout(settle);
            if (session.errors.length) {
              findings.push({
                id: 'U1', severity: 'warn', route: route.id, path: route.path, language,
                viewport: `${viewport.width}x${viewport.height}`, rule: 'page-error',
                selector: route.path, text: '', expected: 'no page errors', actual: session.errors.join(' | ').slice(0, 240),
                message: `页面运行错误：${session.errors[0]}`,
              });
            }
            const metrics = await page.evaluate(measurePage);
            const contextInfo = { route, language, viewport };
            if (idsToRun.includes('U1')) findings.push(...evaluateU1(metrics, contextInfo));
            if (idsToRun.includes('U1') && stress) {
              await page.evaluate(() => {
                const token = 'VeryLongUnbrokenContentValueWithoutSpaces';
                for (const table of document.querySelectorAll('table')) {
                  const row = table.querySelector('tbody tr');
                  if (!row) continue;
                  for (const cell of [...row.querySelectorAll('td')].slice(0, -1)) {
                    if (cell.querySelector('button, input, select, textarea, [role="button"]')) continue;
                    cell.textContent = token.repeat(3);
                  }
                }
              });
              await page.waitForTimeout(100);
              const stressMetrics = await page.evaluate(measurePage);
              findings.push(...evaluateLongContent(stressMetrics, contextInfo));
            }
            if (idsToRun.includes('U3')) findings.push(...evaluateU3(metrics, contextInfo));
            const routeFindings = findings.filter((finding) => finding.route === route.id && finding.language === language && finding.viewport === `${viewport.width}x${viewport.height}`);
            const fails = routeFindings.filter((finding) => finding.severity === 'fail').length;
            console.log(`${fails ? 'FAIL' : 'PASS'} ${routeLabel}: ${routeFindings.length} finding(s), ${fails} blocking`);
          } catch (error) {
            findings.push({
              id: 'U1', severity: 'fail', route: route.id, path: route.path, language,
              viewport: `${viewport.width}x${viewport.height}`, rule: 'route-load',
              selector: route.path, text: '', expected: 'route ready', actual: String(error.message).slice(0, 240),
              message: `路由无法量测：${error.message}`,
            });
            console.log(`FAIL ${routeLabel}: route-load — ${error.message}`);
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\nruntime: ${((Date.now() - started) / 1000).toFixed(1)}s, ${routes.length} route(s)`);
  return findings;
}

function writeBaseline(findings) {
  const entries = {};
  for (const finding of findings) {
    entries[baselineKey(finding)] = {
      owner: 'ui-invariants',
      reason: 'initial rollout debt',
      recorded: new Date().toISOString().slice(0, 10),
      expires: '2026-12-31',
    };
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ version: 1, entries }, null, 2) + '\n');
  console.log(`baseline written: ${Object.keys(entries).length} finding(s) -> ${path.relative(ROOT, BASELINE_PATH)}`);
}

async function selftest() {
  const checks = [];
  const check = (name, condition, detail = '') => {
    checks.push({ name, ok: condition });
    console.log(`${condition ? 'PASS' : 'FAIL'} selftest ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const u1Metrics = {
    tables: [{
      index: 0, selector: 'table', width: 800, wrapperWidth: 800, scrollWidth: 800, clientWidth: 800,
      horizontalScroll: 0, headerHeight: 70, rowHeight: 80,
      headers: [{ selector: 'th', text: 'Long header', width: 40, height: 70, lines: 2, whiteSpace: 'normal' }],
      action: {
        header: 'Actions', width: 400, ratio: 0.5, visible: false,
        buttons: [{ selector: 'button', text: '', name: 'Edit', iconOnly: true, width: 30, height: 24, overflowsCell: true }],
        textButtonCount: 1,
      },
    }],
    buttons: [{ selector: 'button', text: 'A long button', name: 'A long button', context: 'page-header', iconOnly: false, width: 50, height: 24, lines: 2, overflow: false, disabled: false }],
    tabs: [{ selector: '.tab', text: 'Long tab', width: 40, height: 24, lines: 2, overflow: true }],
    badges: [{ selector: '.badge', text: 'Badge', width: 30, height: 20, lines: 2, overflow: false }],
  };
  const u1 = evaluateU1(u1Metrics, { route: { id: 'selftest', path: '/selftest' }, language: 'en-US', viewport: { width: 1366, height: 768 } });
  check('U1 detects header wrap', u1.some((finding) => finding.rule === 'header-wrap'));
  check('U1 detects hidden action', u1.some((finding) => finding.rule === 'action-hidden'));
  check('U1 detects oversized action ratio', u1.some((finding) => finding.rule === 'action-ratio' && finding.severity === 'fail'));
  check('U1 detects button wrap', u1.some((finding) => finding.rule === 'button-wrap'));

  const longContent = evaluateLongContent({
    tables: [{
      selector: 'table', action: null,
      dataCells: [{ index: 0, selector: 'td', text: 'long token', hasControl: false, overflowX: 'visible', scrollWidth: 300, clientWidth: 100 }],
    }],
  }, { route: { id: 'selftest', path: '/selftest' }, language: 'en-US', viewport: { width: 1366, height: 768 } });
  check('U1 detects long-content overflow', longContent.some((finding) => finding.rule === 'long-content-overflow'));

  const u3Metrics = {
    tables: [{ selector: 'table', action: { header: 'Actions', textButtonCount: 3 } }],
    buttons: [
      { selector: 'button.icon-no-name', text: '', name: '', iconOnly: true, width: 30, height: 24 },
      { selector: 'button.icon-small', text: '', name: 'Edit', iconOnly: true, width: 18, height: 18 },
      { selector: 'button.text', text: 'Edit', name: 'Edit', iconOnly: false, width: 60, height: 24 },
    ],
  };
  const u3 = evaluateU3(u3Metrics, { route: { id: 'selftest', path: '/selftest' }, language: 'en-US', viewport: { width: 1366, height: 768 } });
  check('U3 detects icon without name', u3.some((finding) => finding.rule === 'icon-name'));
  check('U3 detects small icon target', u3.some((finding) => finding.rule === 'icon-target'));
  check('U3 detects multiple text actions', u3.some((finding) => finding.rule === 'action-text-buttons'));
  check('U3 detects native confirm', findNativeDialogsInText('fixture.tsx', 'window.confirm("x"); alert("y");').length === 2);

  const controller = scanControllerText('fixture.ts', 'res.json([1, 2]); res.json(rows); res.json({ data: rows }); res.json({ success: true }); res.json({ message: "x" });');
  check('D2 flags bare array', controller.findings.some((finding) => finding.code.includes('res.json([1, 2])')));
  check('D2 accepts envelopes', controller.findings.filter((finding) => finding.code.includes('data: rows') || finding.code.includes('success: true')).length === 0);
  check('D2 flags message-only response', controller.findings.some((finding) => finding.code.includes('message: "x"')));
  const defensive = scanClientDefensiveText('fixture.ts', 'const rows = Array.isArray(payload) ? payload : payload?.data || [];');
  check('D2 flags defensive parse', defensive.length === 1);

  const browser = await chromium.launch({ executablePath: auditEnvironment.chrome });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><style>
      table{width:260px;border-collapse:collapse} th{width:44px;white-space:normal} td{border:1px solid #ccc}
      .actions button{width:30px;height:24px}
    </style><table><thead><tr><th>Very Long Header</th><th>Actions</th></tr></thead><tbody><tr>
      <td>row</td><td class="actions"><button title="Edit"><svg width="14" height="14"></svg></button><button><svg width="14" height="14"></svg></button></td>
    </tr></tbody></table>`);
    const metrics = await page.evaluate(measurePage);
    check('measurePage detects header lines', metrics.tables[0]?.headers[0]?.lines > 1, JSON.stringify(metrics.tables[0]?.headers[0]));
    check('measurePage detects icon-only button without name', metrics.buttons.some((button) => button.iconOnly && button.name === ''));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((checkItem) => !checkItem.ok);
  console.log(`\nSELFTEST ${failed.length ? 'FAIL' : 'PASS'}: ${checks.length - failed.length}/${checks.length}`);
  return failed.length === 0;
}

if (has('--selftest')) {
  process.exit(await selftest() ? 0 : 1);
}

const staticFindings = await runStatic(ids);
const runtimeIds = ids.filter((id) => id === 'U1' || id === 'U3');
const runtimeFindings = runtimeIds.length && !has('--static-only') ? await runRuntime(runtimeIds) : [];
const findings = [...staticFindings, ...runtimeFindings];
const { active, blocking } = report(findings);

if (has('--json')) {
  const file = path.resolve(ROOT, value('--json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), active, blocking: blocking.length, baseline: path.relative(ROOT, BASELINE_PATH) }, null, 2) + '\n');
  console.log(`report: ${path.relative(ROOT, file)}`);
}
if (has('--write-baseline')) writeBaseline(findings);

const blockingCount = blocking.length;
const warnings = active.filter((finding) => finding.severity === 'warn').length;
const infos = active.filter((finding) => finding.severity === 'info').length;
console.log(`\n${blockingCount ? 'FAIL' : 'PASS'} invariants ${ids.join(',')}: ${blockingCount} blocking, ${warnings} warning(s), ${infos} info${strict ? ' (strict)' : ''}`);
process.exit(blockingCount ? 1 : 0);
