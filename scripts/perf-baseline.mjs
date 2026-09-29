/**
 * Performance baseline (P3, optimization plan 2026-09-28) — measure the
 * production bundle, not dev mode (dev carries ~350ms of tooling
 * overhead that says nothing about real experience).
 *
 * What it does:
 *   1. builds the client (skip with PERF_SKIP_BUILD=1 when iterating)
 *   2. spawns `vite preview` (port 4173, /api proxied to 3110)
 *   3. logs in for real (personId → token) so pages render REAL data —
 *      the demand table currently holds 100+ projects and that is
 *      exactly the load this baseline exists to observe
 *   4. for each page: fresh context × N runs, collects FCP / LCP /
 *      domInteractive / loadEventEnd via PerformanceObserver + timing
 *   5. appends one JSONL line per page to docs/perf/perf-history.jsonl
 *
 * Usage: npm run perf:baseline
 * Requires: backend on 3110 with seeded data.
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env.PERF_API || 'http://127.0.0.1:3110';
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4173);
const WEB = `http://127.0.0.1:${PREVIEW_PORT}`;
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const RUNS = Number(process.env.PERF_RUNS || 3);
const HISTORY = 'docs/perf/perf-history.jsonl';

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// ---------- 0. preconditions ----------
try { await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) }); }
catch { fail(`backend not reachable at ${API} — start it first (npm run dev:server)`); }

if (!process.env.PERF_SKIP_BUILD) {
  console.log('• building client (PERF_SKIP_BUILD=1 to skip)...');
  execSync('npm run build:client', { stdio: 'inherit' });
}
if (!existsSync('dist-client')) fail('dist-client missing — build first');

// real login so data actually renders
const people = await (await fetch(`${API}/api/people?limit=5`)).json();
const person = (people.data ?? people)[0];
if (!person) fail('no people in backend — seed data first');
const login = await (await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personId: person.id }),
})).json();
const tok = login.data ?? login;

// ---------- 1. preview server ----------
console.log(`• starting vite preview on :${PREVIEW_PORT}...`);
const preview = spawn('npx', ['vite', 'preview', '--config', 'client-vite.config.ts'], {
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, PREVIEW_PORT: String(PREVIEW_PORT) },
});
try {
  await sleep(2500);
  const res = await fetch(`${WEB}/`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) fail(`preview not up (HTTP ${res.status})`);
} catch { fail('preview did not come up'); }

// ---------- 2. measure ----------
const PAGES = [
  ['dashboard', '/dashboard'],
  ['demand-table', '/projects?tab=demand'],
];
const METRIC_JS = `(() => new Promise(resolve => {
  const t = performance.getEntriesByType('navigation')[0] || {};
  const paint = performance.getEntriesByType('paint');
  const fcp = (paint.find(p => p.name === 'first-contentful-paint') || {}).startTime;
  new PerformanceObserver(list => {
    const entries = list.getEntries();
    resolve({
      fcp: fcp ?? null,
      lcp: entries.length ? entries[entries.length - 1].startTime : null,
      domInteractive: t.domInteractive ?? null,
      loadEventEnd: t.loadEventEnd ?? null,
    });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => resolve({
    fcp: fcp ?? null, lcp: null,
    domInteractive: t.domInteractive ?? null, loadEventEnd: t.loadEventEnd ?? null,
  }), 20000);
}))()`;

// Wait for data-driven rows to appear and STABILIZE — a fixed 1.5s wait
// closed the collection window mid-render at 1000 rows and recorded a
// "faster" LCP than reality (548ms while the table actually settled at
// 7.3s). Anchor selector per page: the demand table is a div grid
// (.requirements-row), the dashboard renders stat cards.
const ROW_ANCHOR = { dashboard: '.stats-grid, .dashboard, main', 'demand-table': '.requirements-row' };
const waitForRows = async (page, anchor) => {
  const start = Date.now();
  let prev = -1, stable = 0;
  while (Date.now() - start < 30000) {
    await page.waitForTimeout(400);
    const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, anchor).catch(() => 0);
    if (n > 0 && n === prev) { if (++stable >= 5) return Date.now() - start; } else stable = 0;
    prev = n;
  }
  return null;
};

const median = (arr) => {
  const xs = arr.filter(v => v != null).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : null;
};

mkdirSync('docs/perf', { recursive: true });
const head = execSync('git rev-parse --short HEAD').toString().trim();
const results = [];

const browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined });
try {
  for (const [name, path] of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const page = await ctx.newPage();
      await page.addInitScript(([user, accessToken, refreshToken]) => {
        localStorage.setItem('capacinator_current_user', user);
        localStorage.setItem('auth_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('capacinator-language', 'zh-CN');
      }, [JSON.stringify({ id: person.id, name: person.name, email: person.email }), tok.accessToken, tok.refreshToken]);
      await page.goto(`${WEB}${path}`, { waitUntil: 'load', timeout: 30000 });
      const settleMs = await waitForRows(page, ROW_ANCHOR[name]); // data rows render AND stabilize
      const m = await page.evaluate(METRIC_JS);
      m.rowsSettleMs = settleMs;
      if (name === 'demand-table') {
        // fling scroll: worst main-thread block — guards the fixed-height
        // virtualization win (640ms → 153ms); regression shows in trend
        m.fling = await page.evaluate(async () => {
          let longTasks = 0, worst = 0;
          const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) { longTasks++; worst = Math.max(worst, e.duration); } });
          obs.observe({ entryTypes: ['longtask'] });
          const el = document.querySelector('.requirements-table');
          if (el) {
            for (let i = 0; i < 20; i++) { el.scrollTop += 1500; await new Promise(r => requestAnimationFrame(r)); }
          }
          await new Promise(r => setTimeout(r, 400));
          obs.disconnect();
          return { longTasks, worstMs: Math.round(worst) };
        });
      }
      // virtualized boards render only the viewport — record the DOM row
      // count so a regression back to full rendering is visible in trends
      m.domRows = await page.evaluate((sel) => document.querySelectorAll(sel).length, ROW_ANCHOR[name]).catch(() => null);
      runs.push(m);
      await ctx.close();
    }
    const row = {
      ts: new Date().toISOString(), head, page: name, runs: RUNS,
      fcp: median(runs.map(r => r.fcp)),
      lcp: median(runs.map(r => r.lcp)),
      domInteractive: median(runs.map(r => r.domInteractive)),
      loadEventEnd: median(runs.map(r => r.loadEventEnd)),
      // full-DOM settle time — at 1000 rows the viewport LCP stays fast
      // (~750ms) while the whole table keeps building for seconds;
      // virtualization caps this at first-viewport render (~27 DOM rows).
      rowsSettleMs: median(runs.map(r => r.rowsSettleMs)),
      domRows: median(runs.map(r => r.domRows)),
      flingLongTasks: median(runs.map(r => r.fling?.longTasks)),
      flingWorstMs: median(runs.map(r => r.fling?.worstMs)),
    };
    results.push(row);
    appendFileSync(HISTORY, JSON.stringify(row) + '\n');
    console.log(`\n📊 ${name} (median of ${RUNS}, ms)`);
    console.log(`   FCP ${row.fcp?.toFixed(0)} | LCP ${row.lcp?.toFixed(0)} | domInteractive ${row.domInteractive?.toFixed(0)} | load ${row.loadEventEnd?.toFixed(0)}${row.flingWorstMs ? ` | fling worst ${row.flingWorstMs}ms (${row.flingLongTasks} long tasks)` : ''}`);
  }
} finally {
  await browser.close();
  try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* already gone */ }
}
console.log(`\n✓ appended to ${HISTORY} (${results.length} entries this run)`);
