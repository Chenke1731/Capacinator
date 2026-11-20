#!/usr/bin/env node
/**
 * U4 — state completeness matrix for the five core data pages.
 *
 * States: loading, empty, server error (500), forbidden (403).
 * The page must expose a visible state, not a blank screen or a false zero.
 *
 * Usage:
 *   node scripts/verify-state-completeness.mjs --pages people,assignments,projects,reports,dashboard
 *   node scripts/verify-state-completeness.mjs --selftest
 *   node scripts/verify-state-completeness.mjs --json tmp/u4.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { auditEnvironment, authenticate, setupReadOnlyPage } from './lib/ui-profiles.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const valid = new Set(['--pages', '--states', '--json', '--strict', '--selftest', '--help']);
for (let i = 0; i < argv.length; i += 1) {
  if (!valid.has(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
  if (['--pages', '--states', '--json'].includes(argv[i])) {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${argv[i]}`);
    i += 1;
  }
}

const PAGES = {
  people: {
    path: '/people',
    target: /\/api\/people(\?|$)/,
    emptyBody: { data: [] },
  },
  assignments: {
    path: '/assignments',
    target: /\/api\/assignments(\?|$)/,
    emptyBody: { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
  },
  projects: {
    path: '/projects',
    target: /\/api\/projects\/board-feed(\?|$)/,
    emptyBody: { success: true, data: { data: [] } },
  },
  reports: {
    path: '/reports',
    target: /\/api\/reporting\/demand(\?|$)/,
    emptyBody: {
      success: true,
      data: {
        demandData: [],
        byProject: [],
        byRole: [],
        timeline: [],
        summary: { total_hours: 0, peak_month: null, project_count: 0, role_count: 0 },
      },
    },
    emptyMode: 'zero',
    emptyReady: '.report-container h4, .report-container .report-summary-card',
  },
  dashboard: {
    path: '/dashboard',
    target: /\/api\/reporting\/dashboard(\?|$)/,
    emptyBody: {
      success: true,
      data: {
        summary: { projects: 0, people: 0, roles: 0 },
        projectHealth: {},
        capacityGaps: {},
        utilization: {},
        availability: {},
        design_watch: [],
        lifecycle_summary: {},
      },
    },
    emptyMode: 'zero',
    emptyReady: '.stats-grid',
  },
};

function parseList(raw, allowed, label) {
  const values = String(raw ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const unknown = values.filter((item) => !allowed.includes(item));
  if (unknown.length) throw new Error(`Unknown ${label}: ${unknown.join(', ')}`);
  return values;
}

const pages = parseList(value('--pages') ?? Object.keys(PAGES).join(','), Object.keys(PAGES), 'page');
const states = parseList(value('--states') ?? 'loading,empty,error,forbidden', ['loading', 'empty', 'error', 'forbidden'], 'state');

export function classifySnapshot(snapshot) {
  const text = snapshot.text || '';
  return {
    rootVisible: snapshot.rootVisible,
    loading: snapshot.loading || /loading|加载|处理中/i.test(text),
    error: snapshot.error || /failed|error|错误|失败|重试|retry|forbidden|无权限|禁止/i.test(text),
    empty: snapshot.empty || /no data|no projects|no .*found|empty|暂无|没有|无匹配/i.test(text),
    emptyReady: snapshot.emptyReady,
    textLength: text.replace(/\s+/g, ' ').trim().length,
  };
}

function selftest() {
  const checks = [
    ['loading', classifySnapshot({ text: 'Loading…', rootVisible: true }).loading],
    ['error', classifySnapshot({ text: 'Failed to load', rootVisible: true }).error],
    ['empty', classifySnapshot({ text: 'No projects', rootVisible: true }).empty],
    ['blank', !classifySnapshot({ text: '', rootVisible: false }).loading],
    ['skeleton', classifySnapshot({ text: '', rootVisible: true, loading: true }).loading],
    ['page configs', Object.values(PAGES).every((page) => page.target instanceof RegExp && page.emptyBody)],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} selftest ${name}`);
  return checks.every(([, ok]) => ok);
}

if (has('--selftest')) process.exit(selftest() ? 0 : 1);
if (has('--help')) {
  console.log(`verify-state-completeness: --pages ${Object.keys(PAGES).join('|')} --states loading,empty,error,forbidden [--json file] [--strict] [--selftest]`);
  process.exit(0);
}

async function runState(browser, auth, pageConfig, pageId, state) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const session = await setupReadOnlyPage(context, auth, 'light', { language: 'en-US' });
    const page = session.page;
    await page.route(pageConfig.target, async (route) => {
      if (state === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return route.continue();
      }
      const status = state === 'forbidden' ? 403 : 500;
      if (state === 'empty') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageConfig.emptyBody) });
      }
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: state === 'forbidden' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',
          message: state === 'forbidden' ? 'Injected forbidden state' : 'Injected server error',
        }),
      });
    });
    await page.goto(`${auditEnvironment.base}${pageConfig.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('main, .page-container, .projects-board', { state: 'visible', timeout: 15000 });
    if (state === 'loading') {
      await page.waitForFunction(
        () => Boolean(document.querySelector('.animate-spin, .req-skeleton, .skeleton, [data-loading="true"]')) ||
          /\bloading\b|加载中/i.test(document.body.innerText || ''),
        undefined,
        { timeout: 8000 }
      ).catch(() => {});
      await page.waitForTimeout(100);
    } else if (state === 'error' || state === 'forbidden') {
      await page.waitForFunction(
        () => Boolean(document.querySelector('[role="alert"]')) || /failed|error|forbidden|无权限|禁止/i.test(document.body.innerText || ''),
        undefined,
        { timeout: 15000 }
      ).catch(() => {});
    } else {
      await page.waitForFunction(
        ({ emptyReady }) =>
          Boolean(document.querySelector('.empty-state, .requirements-empty, .table-empty, [data-testid*="empty"]')) ||
          Boolean(emptyReady && document.querySelector(emptyReady)) ||
          /no data|no .*found|empty|暂无|没有|无匹配/i.test(document.body.innerText || ''),
        { emptyReady: pageConfig.emptyReady ?? '' },
        { timeout: 8000 }
      ).catch(() => {});
    }
    const snapshot = await page.evaluate(({ emptyReady }) => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const main = document.querySelector('main, .page-container, .projects-board');
      return {
        text: document.body.innerText || '',
        rootVisible: Boolean(main && visible(main)),
        loading: Boolean([...document.querySelectorAll('.animate-spin, .req-skeleton, .skeleton, [data-loading="true"], [aria-busy="true"], .loading, .spinner')].some(visible)),
        error: Boolean([...document.querySelectorAll('[role="alert"], .error-message, .page-error, [data-testid*="error"]')].some(visible)),
        empty: Boolean([...document.querySelectorAll('.empty-state, .requirements-empty, .table-empty, [data-testid*="empty"]')].some(visible)),
        emptyReady: Boolean(emptyReady && [...document.querySelectorAll(emptyReady)].some(visible)),
      };
    }, { emptyReady: pageConfig.emptyReady ?? '' });
    const classified = classifySnapshot(snapshot);
    let ok = true;
    let reason = '';
    if (!classified.rootVisible) { ok = false; reason = 'page root not visible'; }
    else if (state === 'loading' && !classified.loading) { ok = false; reason = 'no visible loading state'; }
    else if ((state === 'error' || state === 'forbidden') && !classified.error) { ok = false; reason = 'no visible error/retry state'; }
    else if (state === 'empty') {
      ok = pageConfig.emptyMode === 'zero'
        ? classified.textLength > 80 && classified.emptyReady && !classified.error && !classified.loading
        : classified.empty && !classified.error;
      if (!ok) reason = pageConfig.emptyMode === 'zero' ? 'empty/zero state is blank, loading, or shows error' : 'no visible empty state';
    }
    return { page: pageId, state, ok, reason, snapshot: classified };
  } catch (error) {
    return { page: pageId, state, ok: false, reason: String(error.message).slice(0, 240) };
  } finally {
    await context.close();
  }
}

const auth = await authenticate();
const browser = await chromium.launch({ executablePath: auditEnvironment.chrome });
const findings = [];
try {
  for (const pageId of pages) {
    for (const state of states) {
      const result = await runState(browser, auth, PAGES[pageId], pageId, state);
      findings.push(result);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${pageId} ${state}${result.reason ? ` — ${result.reason}` : ''}`);
    }
  }
} finally {
  await browser.close();
}

const failed = findings.filter((finding) => !finding.ok);
if (has('--json')) {
  const file = path.resolve(ROOT, value('--json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2) + '\n');
  console.log(`report: ${path.relative(ROOT, file)}`);
}
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} U4 state completeness: ${findings.length - failed.length}/${findings.length} passed`);
process.exit(has('--strict') && failed.length ? 1 : 0);
