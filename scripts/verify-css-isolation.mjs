#!/usr/bin/env node
/**
 * U2 — cross-route CSS isolation census (read-only, one-time / nightly).
 *
 * The bug class: a lazy route CSS file stays in the document after SPA
 * navigation and changes a shared class on another route. Static ownership
 * guards cannot see the computed cascade; full page reloads hide it because
 * the previous document is gone. This script:
 *   1. captures a fresh fingerprint for every route (full load, new context);
 *   2. walks the routes in one SPA session (pushState + popstate) and compares
 *      each route's fingerprint to its fresh baseline;
 *   3. optionally traces a polluted route back to individual source routes.
 *
 * Usage:
 *   node scripts/verify-css-isolation.mjs --all
 *   node scripts/verify-css-isolation.mjs --all --trace --json tmp/u2.json
 *   node scripts/verify-css-isolation.mjs --selftest
 *
 * Exit: 0 = census completed (advisory), 1 = runner failure, 2 = coverage failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { auditEnvironment, authenticate, setupReadOnlyPage, getProfile, resolveProfile, profiles } from './lib/ui-profiles.mjs';
import { resolveRoutes } from './lib/invariants/routes.mjs';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts/lib/css-duplicate-baseline.json');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const valid = new Set(['--all', '--route', '--trace', '--trace-route', '--json', '--strict', '--selftest', '--settle', '--help']);
for (let i = 0; i < argv.length; i += 1) {
  if (!valid.has(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
  if (['--route', '--trace-route', '--json', '--settle'].includes(argv[i])) {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${argv[i]}`);
    i += 1;
  }
}
if (has('--help')) {
  console.log('verify-css-isolation: --all [--trace] [--trace-route NAME] [--route PATH] [--json FILE] [--settle MS] [--strict] [--selftest]');
  process.exit(0);
}

const settle = Number(value('--settle') ?? 350);
const duplicateClasses = Object.keys(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')));
const sentinelClasses = [
  'btn', 'badge', 'card', 'page-header', 'header-actions', 'table', 'table-actions',
  'status-indicator', 'tab-button', 'modal', 'modal-content', 'page-container',
];
const classes = [...new Set([...duplicateClasses, ...sentinelClasses])];

function captureFingerprint(classesToCapture) {
  const props = [
    'color', 'backgroundColor', 'borderColor', 'borderRadius', 'fontSize', 'fontWeight',
    'lineHeight', 'display', 'position', 'whiteSpace', 'textAlign', 'zIndex',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'flexDirection', 'gap', 'transform', 'opacity',
  ];
  const out = {};
  for (const cls of classesToCapture) {
    const nodes = [...document.querySelectorAll(`.${CSS.escape(cls)}`)].slice(0, 60);
    const entries = nodes.map((el, index) => {
      const style = getComputedStyle(el);
      const values = {};
      for (const prop of props) values[prop] = style[prop];
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        values,
      };
    });
    if (entries.length) out[cls] = entries;
  }
  return out;
}

export function diffFingerprints(before, after) {
  const diffs = [];
  for (const cls of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const left = before[cls] || [];
    const right = after[cls] || [];
    if (left.length !== right.length) {
      diffs.push({ class: cls, index: -1, property: 'count', before: left.length, after: right.length });
      continue;
    }
    for (let i = 0; i < left.length; i += 1) {
      for (const property of new Set([...Object.keys(left[i].values), ...Object.keys(right[i].values)])) {
        if (left[i].values[property] !== right[i].values[property]) {
          diffs.push({
            class: cls,
            index: i,
            tag: left[i].tag || right[i].tag,
            text: left[i].text || right[i].text,
            property,
            before: left[i].values[property],
            after: right[i].values[property],
          });
        }
      }
    }
  }
  return diffs;
}

// ── Static definition census (2026-11-20, dump→grep 两步变零步) ──
// When a route comes back polluted, the operator needs the definition sites of
// every flagged class — previously a manual grep chain (and the habit of only
// grepping high-frequency classes cost a full --trace run). Candidate listing
// only: `:where(...)` detection follows the project scoping convention, other
// descendant scoping still shows as unscoped for a human to judge; ambiguous
// cases keep --trace as the runtime fallback.
let cssInventoryCache = null;
function cssInventory() {
  if (cssInventoryCache) return cssInventoryCache;
  const dir = path.join(ROOT, 'client/src');
  const texts = new Map();
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(current, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.css')) {
        const rel = `client/src/${prefix}${entry.name}`;
        texts.set(rel, fs.readFileSync(path.join(current, entry.name), 'utf8'));
      }
    }
  };
  walk(dir, '');
  cssInventoryCache = texts;
  return texts;
}

export function definitionSites(cls, texts) {
  const sites = [];
  const token = new RegExp(`(?:^|[\\s,>+~])\\.${cls}(?![\\w-])`);
  for (const [file, raw] of texts) {
    // Strip comments but keep line breaks so indices still map to real lines.
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim();
      if (!selector || selector.startsWith('@') || selector.includes('@')) continue;
      if (![...selector.split(',')].some((part) => token.test(` ${part.trim()}`))) continue;
      sites.push({
        file,
        // Line of the "{" — the selector capture starts right after the
        // previous rule's "}" and swallows intervening newlines, so
        // match.index under-reports the line.
        line: text.slice(0, match.index + match[1].length).split('\n').length,
        selector: selector.replace(/\s+/g, ' ').slice(0, 120),
        scoped: selector.includes(':where('),
      });
    }
  }
  return sites;
}

async function waitReady(page, route) {
  if (route.ready) await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });
  await page.waitForTimeout(settle);
}

async function navigateSpa(page, route) {
  await page.evaluate((pathName) => {
    history.pushState({}, '', pathName);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route.path);
  await waitReady(page, route);
}

async function captureFresh(browser, auth, route) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const session = await setupReadOnlyPage(context, auth, 'light');
    await session.page.goto(`${auditEnvironment.base}${route.path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitReady(session.page, route);
    return { fingerprint: await session.page.evaluate(captureFingerprint, classes), errors: session.errors };
  } finally {
    await context.close();
  }
}

async function runCensus() {
  const routes = resolveRoutes({ all: true });
  if (value('--route')) routes.splice(0, routes.length, { id: 'route', path: value('--route') });
  const auth = await authenticate();
  // Entity routes (`:audit-id`) resolve to real IDs here, mirroring the
  // invariant runner; sibling profiles landing on the same page measure once.
  const resolvedSeen = new Set();
  for (let index = routes.length - 1; index >= 0; index -= 1) {
    const route = routes[index];
    const resolved = route.profile ? await resolveProfile(getProfile(route.profile), auth) : null;
    const routePath = resolved?.path ?? route.path;
    if (resolvedSeen.has(routePath)) {
      console.log(`SKIP ${route.id}: resolves to already-measured ${routePath}`);
      routes.splice(index, 1);
      continue;
    }
    resolvedSeen.add(routePath);
    routes[index] = { ...route, path: routePath, ready: route.ready ?? resolved?.ready };
  }
  const browser = await chromium.launch({ executablePath: auditEnvironment.chrome });
  const report = { generatedAt: new Date().toISOString(), routes: routes.length, baselines: {}, polluted: [], errors: [], trace: {} };
  try {
    for (const route of routes) {
      try {
        const fresh = await captureFresh(browser, auth, route);
        report.baselines[route.id] = fresh.fingerprint;
        if (fresh.errors.length) report.errors.push({ route: route.id, errors: fresh.errors.slice(0, 5) });
        console.log(`baseline ${route.id}: ${Object.keys(fresh.fingerprint).length} class groups`);
      } catch (error) {
        report.errors.push({ route: route.id, errors: [String(error.message)] });
        console.log(`SKIP ${route.id}: ${error.message}`);
      }
    }

    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    try {
      const session = await setupReadOnlyPage(context, auth, 'light');
      const page = session.page;
      await page.goto(`${auditEnvironment.base}${routes[0].path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await waitReady(page, routes[0]);
      for (let index = 0; index < routes.length; index += 1) {
        const route = routes[index];
        if (index > 0) {
          try {
            await navigateSpa(page, route);
          } catch (error) {
            report.errors.push({ route: route.id, errors: [`SPA navigation failed: ${error.message}`] });
            continue;
          }
        }
        const fingerprint = await page.evaluate(captureFingerprint, classes);
        const diffs = diffFingerprints(report.baselines[route.id] || {}, fingerprint);
        if (diffs.length) {
          const flaggedClasses = [...new Set(diffs.map((diff) => diff.class))];
          const sources = Object.fromEntries(flaggedClasses.map((cls) => [cls, definitionSites(cls, cssInventory())]));
          report.polluted.push({ route: route.id, path: route.path, diffs: diffs.slice(0, 40), total: diffs.length, sources });
          console.log(`POLLUTED ${route.id}: ${diffs.length} style diffs`);
          for (const cls of flaggedClasses) {
            const listing = sources[cls].length
              ? sources[cls].map((site) => `${site.file}:${site.line}${site.scoped ? ' [scoped]' : ' [unscoped]'}`).join(' | ')
              : 'no css definition (inline style / runtime-injected)';
            console.log(`  .${cls} defined: ${listing}`);
          }
        } else {
          console.log(`PASS ${route.id}`);
        }
      }
    } finally {
      await context.close();
    }

    if (has('--trace')) {
      const onlyRoute = value('--trace-route');
      for (const polluted of report.polluted) {
        if (onlyRoute && polluted.route !== onlyRoute) continue;
        const target = routes.find((route) => route.id === polluted.route);
        const culprits = [];
        for (const source of routes) {
          if (source.id === polluted.route) continue;
          const traceContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
          try {
            const session = await setupReadOnlyPage(traceContext, auth, 'light');
            const page = session.page;
            await page.goto(`${auditEnvironment.base}${source.path}`, { waitUntil: 'networkidle', timeout: 30000 });
            await waitReady(page, source);
            await navigateSpa(page, target);
            const diffs = diffFingerprints(report.baselines[target.id] || {}, await page.evaluate(captureFingerprint, classes));
            if (diffs.length) culprits.push({ source: source.id, total: diffs.length, diffs: diffs.slice(0, 10) });
          } catch (error) {
            culprits.push({ source: source.id, error: String(error.message).slice(0, 160) });
          } finally {
            await traceContext.close();
          }
        }
        report.trace[polluted.route] = culprits;
        console.log(`TRACE ${polluted.route}: ${culprits.length} candidate source(s)`);
      }
    }
  } finally {
    await browser.close();
  }
  return report;
}

async function selftest() {
  const before = { btn: [{ tag: 'button', text: 'Save', values: { color: 'rgb(0,0,0)', paddingTop: '4px' } }] };
  const after = { btn: [{ tag: 'button', text: 'Save', values: { color: 'rgb(255,0,0)', paddingTop: '4px' } }] };
  const diffs = diffFingerprints(before, after);
  const color = diffs.find((diff) => diff.property === 'color' && diff.class === 'btn');
  const count = diffFingerprints({ btn: [] }, { btn: [{ tag: 'button', text: '', values: {} }] });
  // Route-shape contract (2026-11-20 undefined-URL incident): the inventory is
  // shared by every consumer, so any entry must be navigable — a concrete
  // path, or a profile reference that exists and carries no own fixture (a
  // fixture-bearing profile would swap the process-wide scene mid-run). This
  // turns a browser-only failure into a static red.
  const inventory = resolveRoutes({ all: true });
  const shapeOk = inventory.length > 20 && inventory.every((route) =>
    (route.path && !route.path.includes(':')) ||
    (route.profile && profiles[route.profile] && !getProfile(route.profile).fixture));
  const synthetic = new Map([['a.css', ':where(.r) .demo{color:red}\n/* .demo noise */\n.demo{color:blue}\n.b .demo,.demo-x{margin:0}']]);
  const sites = definitionSites('demo', synthetic);
  const sitesOk = sites.length === 3
    && sites.filter((site) => site.scoped).length === 1
    && sites.some((site) => site.line === 3 && !site.scoped)
    && sites.some((site) => site.line === 4);
  let browser;
  let browserOk = false;
  let browserDiff;
  let browserError = '';
  try {
    browser = await chromium.launch({ executablePath: auditEnvironment.chrome });
    const page = await browser.newPage();
    await page.setContent('<!doctype html><style>.btn{color:rgb(0,0,0)}</style><button class="btn">Save</button>');
    const first = await page.evaluate(captureFingerprint, ['btn']);
    await page.addStyleTag({ content: '.btn{color:rgb(255,0,0)}' });
    const second = await page.evaluate(captureFingerprint, ['btn']);
    browserDiff = diffFingerprints(first, second);
    // Computed-style rgb() spacing is browser-version dependent; compare
    // space-insensitively so a serialization tweak can't rot this check.
    const compact = (value) => String(value).replace(/\s/g, '');
    browserOk = browserDiff.some((diff) => diff.property === 'color' && compact(diff.before) === 'rgb(0,0,0)' && compact(diff.after) === 'rgb(255,0,0)');
  } catch (error) {
    browserError = String(error.message).slice(0, 200);
  } finally {
    await browser?.close();
  }
  console.log(`${color ? 'PASS' : 'FAIL'} selftest detects property change`);
  console.log(`${count.length === 1 && count[0].property === 'count' ? 'PASS' : 'FAIL'} selftest detects element count change`);
  console.log(`${shapeOk ? 'PASS' : 'FAIL'} selftest route inventory shape (${inventory.length} routes)`);
  console.log(`${sitesOk ? 'PASS' : 'FAIL'} selftest static definition census`);
  console.log(`${browserOk ? 'PASS' : 'FAIL'} selftest captures computed-style change in a real browser${browserError ? ` — ${browserError}` : ''}`);
  return Boolean(color) && count.length === 1 && shapeOk && sitesOk && browserOk;
}

if (has('--selftest')) process.exit(await selftest() ? 0 : 1);

const report = await runCensus();
if (has('--json')) {
  const file = path.resolve(ROOT, value('--json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`report: ${path.relative(ROOT, file)}`);
}
console.log(`\n${report.polluted.length ? 'FINDINGS' : 'PASS'} U2 census: ${report.polluted.length} polluted route(s), ${report.errors.length} coverage error(s)`);
if (has('--strict') && report.polluted.length) process.exit(1);
process.exit(report.errors.length && !report.polluted.length ? 2 : 0);
