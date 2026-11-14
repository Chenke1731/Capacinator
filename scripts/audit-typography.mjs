#!/usr/bin/env node
/**
 * Typography guard（2026-11-14，页面审计沉淀）——确定性别号/标题一致性守卫。
 *
 * 为什么存在：verify:states 的字号维度只枚举"可见交互元素"，aria-hidden 装饰文本
 * （如 minimap 月份标签 9px）与跨组件标题不一致（泳道 H2 15.2px vs 区块 H2 18px）
 * 都在机器盲区（EXP 候选：守卫枚举面 × aria-hidden 文本）。本脚本对整页可见文本
 * （含 aria-hidden）做两条确定性断言：
 *   R1 下限：所有可见文本 computed font-size ≥ minPx（默认 10）；
 *   R2 标题一致：同一页面内同一标题级（h1..h4）的 computed 字号必须唯一。
 *
 * 与 vlmkit layout-audit 的关系：后者是 advisory 布局体检；本脚本是确定性守卫，
 * 违规即 exit 1（进 CI 阻塞），不复用 VLM。
 *
 * 用法：
 *   node scripts/audit-typography.mjs --all
 *   node scripts/audit-typography.mjs --pages person-workload,dashboard
 *   node scripts/audit-typography.mjs --all --min-px 12   # 校准/自红
 * 退出码：0=通过；1=存在违规；2=没跑成（服务/登录/浏览器）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const ROOT = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/layout-audit.config.json'), 'utf8'));

function fail(message) {
  console.error(`✗ typography guard 未完成：${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { all: false, pages: null, minPx: 10, baseUrl: process.env.LAYOUT_AUDIT_BASE_URL || 'http://127.0.0.1:3120', apiUrl: process.env.LAYOUT_AUDIT_API_URL || 'http://127.0.0.1:3110', outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail(`${arg} 缺值`); i += 1; return argv[i]; };
    if (arg === '--all') out.all = true;
    else if (arg.startsWith('--pages=')) out.pages = arg.slice('--pages='.length).split(',').filter(Boolean);
    else if (arg === '--pages') out.pages = value().split(',').filter(Boolean);
    else if (arg.startsWith('--min-px=')) out.minPx = Number(arg.slice('--min-px='.length));
    else if (arg === '--min-px') out.minPx = Number(value());
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--base-url') out.baseUrl = value();
    else if (arg.startsWith('--api-url=')) out.apiUrl = arg.slice('--api-url='.length);
    else if (arg === '--api-url') out.apiUrl = value();
    else if (arg.startsWith('--out=')) out.outDir = arg.slice('--out='.length);
    else if (arg === '--out') out.outDir = value();
    else if (arg === '--help' || arg === '-h') { console.log('Usage: audit-typography [--all|--pages a,b] [--min-px 10] [--base-url URL] [--api-url URL] [--out dir]'); process.exit(0); }
    else fail(`未知参数 ${arg}`);
  }
  if (!out.all && !out.pages) out.all = true;
  if (!Number.isFinite(out.minPx) || out.minPx <= 0) fail('--min-px 必须是正数');
  return out;
}

const args = parseArgs(process.argv.slice(2));
const routeById = new Map(CONFIG.routes.map((route) => [route.id, route]));
const pages = args.all ? CONFIG.routes.map((route) => route.id) : args.pages;
const unknown = pages.filter((id) => !routeById.has(id));
if (unknown.length) fail(`未知页面 id: ${unknown.join(', ')}`);

const outDir = path.resolve(ROOT, args.outDir ?? path.join('tmp', 'typography-audit', new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(outDir, { recursive: true });

async function loginAndFixtures() {
  const peopleRes = await fetch(`${args.apiUrl}${CONFIG.fixtures.personId.endpoint}`);
  if (!peopleRes.ok) fail(`people fixture ${peopleRes.status}`);
  const peopleBody = await peopleRes.json();
  const people = peopleBody.data?.data ?? peopleBody.data ?? peopleBody;
  const person = people.find((row) => row.is_active !== false && row.is_active !== 0) ?? people[0];
  if (!person?.id) fail('没有可用 person fixture');
  const loginRes = await fetch(`${args.apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: person.id }) });
  if (!loginRes.ok) fail(`登录失败 ${loginRes.status}`);
  const loginBody = await loginRes.json();
  const auth = loginBody.data ?? loginBody;
  if (!auth.accessToken) fail('登录响应缺 accessToken');
  const fixtures = { personId: person.id };
  for (const [name, spec] of Object.entries(CONFIG.fixtures)) {
    if (name === 'personId') continue;
    const res = await fetch(`${args.apiUrl}${spec.endpoint}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    if (!res.ok) fail(`fixture ${name} ${res.status}`);
    const body = await res.json();
    const rows = body.data?.data ?? body.data ?? body;
    const picked = spec.pick === 'first_active' ? rows.find((row) => row.is_active !== false && row.is_active !== 0) : rows[0];
    if (!picked?.id) fail(`fixture ${name} 无可用行`);
    fixtures[name] = picked.id;
  }
  const origin = new URL(args.baseUrl).origin;
  const storagePath = path.join(outDir, 'storage-state.json');
  fs.writeFileSync(storagePath, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [
    { name: 'capacinator_current_user', value: JSON.stringify(auth.user ?? person) },
    { name: 'auth_token', value: auth.accessToken },
    ...(auth.refreshToken ? [{ name: 'refresh_token', value: auth.refreshToken }] : []),
    { name: 'capacinator-language', value: 'zh-CN' },
    { name: 'theme', value: 'light' },
  ] }] }));
  return { fixtures, storagePath };
}

const SWEEP = ({ minPx }) => {
  const scope = document.querySelector('main') || document.body;
  const textOf = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
  const below = [];
  const headingSizes = {};
  for (const el of scope.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    const size = parseFloat(cs.fontSize);
    if (!Number.isFinite(size)) continue;
    if (/^H[1-4]$/.test(tag)) {
      (headingSizes[tag] ??= new Set()).add(size);
    }
    if (textOf(el) && size < minPx) {
      below.push({ tag, cls: String(el.className).slice(0, 60), fs: cs.fontSize, text: (el.textContent || '').trim().slice(0, 24) });
    }
  }
  const headingConflicts = Object.entries(headingSizes)
    .filter(([, sizes]) => sizes.size > 1)
    .map(([tag, sizes]) => ({ tag, sizes: [...sizes] }));
  return { below, headingConflicts };
};

const { fixtures, storagePath } = await loginAndFixtures();
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: storagePath, viewport: { width: 1600, height: 900 } });
const violations = [];
for (const page of pages) {
  const route = routeById.get(page);
  const routePath = route.path.replace(/\$\{([^}]+)\}/g, (_, name) => {
    if (!fixtures[name]) fail(`route ${page} 缺 fixture ${name}`);
    return fixtures[name];
  });
  const url = `${args.baseUrl}${routePath}`;
  const tab = await context.newPage();
  try {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await tab.waitForLoadState('networkidle').catch(() => {});
    await tab.waitForTimeout(400);
    const result = await tab.evaluate(SWEEP, { minPx: args.minPx });
    for (const hit of result.below) violations.push({ rule: 'font-below-min', page, ...hit });
    for (const conflict of result.headingConflicts) violations.push({ rule: 'heading-size-conflict', page, ...conflict });
    process.stdout.write(violations.length ? '✗' : '·');
  } catch (error) {
    fail(`页面 ${page} 打不开：${error.message}`);
  } finally {
    await tab.close();
  }
}
await browser.close();
process.stdout.write('\n');

const report = { generatedAt: new Date().toISOString(), minPx: args.minPx, pages, violations };
fs.writeFileSync(path.join(outDir, 'typography.json'), JSON.stringify(report, null, 2));
const lines = ['# Typography guard', '', `- minPx=${args.minPx}，页面 ${pages.length}，违规 ${violations.length}`, ''];
for (const v of violations.slice(0, 40)) {
  const detail = v.rule === 'font-below-min' ? `${v.fs} < ${args.minPx}px @ ${v.tag}.${v.cls} "${v.text}"` : `${v.tag} 多种字号: ${v.sizes.join(' / ')}`;
  lines.push(`- [${v.rule}] ${v.page} — ${detail}`);
}
fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
console.log(`Typography guard: ${pages.length} 页，违规 ${violations.length}（minPx=${args.minPx}）`);
console.log(`报告: ${path.relative(ROOT, path.join(outDir, 'summary.md'))}`);
if (violations.length) process.exit(1);
