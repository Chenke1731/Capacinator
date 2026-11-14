#!/usr/bin/env node
/**
 * Layout audit（vlmkit 落地，2026-11-14）——advisory 多页布局体检。
 *
 * 触发（唯一可靠路径）：
 *   CI:   pull_request 路径过滤 client/src/** → node scripts/audit-layout.mjs --changed
 *   本地: node scripts/audit-layout.mjs --changed | --pages a,b | --all
 *   试跑选页: node scripts/audit-layout.mjs --changed --dry-run
 *
 * 选页：scripts/layout-audit.config.json
 *   - shared 命中（全局 CSS/i18n/ui 原语/App）→ 全量；
 *   - route.covers 命中 → 对应页面；
 *   - client/src/** 未映射 → 回退全量（不允许静默漏检）。
 *
 * 退出码：0=审计完成（无论有无 findings）；2=审计没跑成（服务/认证/浏览器/vlmkit）。
 * 本脚本不把 findings 当失败——它是 advisory，报告进 artifact。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'scripts/layout-audit.config.json');
const ALLOW_PATH = path.join(ROOT, 'scripts/layout-audit.allow.json');

function fail(message) {
  console.error(`✗ layout audit 未完成：${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { all: false, changed: false, dryRun: false, pages: null, base: process.env.GITHUB_BASE_SHA || null, outDir: null, viewports: null, vlmkit: process.env.VLMKIT_BIN || 'vlmkit', baseUrl: process.env.LAYOUT_AUDIT_BASE_URL || 'http://127.0.0.1:3120', apiUrl: process.env.LAYOUT_AUDIT_API_URL || 'http://127.0.0.1:3110' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail(`${arg} 缺值`);
      i += 1;
      return argv[i];
    };
    if (arg === '--all') out.all = true;
    else if (arg === '--changed') out.changed = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--pages=')) out.pages = arg.slice('--pages='.length).split(',').filter(Boolean);
    else if (arg === '--pages') out.pages = value().split(',').filter(Boolean);
    else if (arg.startsWith('--base=')) out.base = arg.slice('--base='.length);
    else if (arg === '--base') out.base = value();
    else if (arg.startsWith('--out=')) out.outDir = arg.slice('--out='.length);
    else if (arg === '--out') out.outDir = value();
    else if (arg.startsWith('--viewports=')) out.viewports = arg.slice('--viewports='.length).split(',').filter(Boolean);
    else if (arg === '--viewports') out.viewports = value().split(',').filter(Boolean);
    else if (arg.startsWith('--vlmkit=')) out.vlmkit = arg.slice('--vlmkit='.length);
    else if (arg === '--vlmkit') out.vlmkit = value();
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--base-url') out.baseUrl = value();
    else if (arg.startsWith('--api-url=')) out.apiUrl = arg.slice('--api-url='.length);
    else if (arg === '--api-url') out.apiUrl = value();
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/audit-layout.mjs [--changed|--all|--pages a,b] [--dry-run] [--base ref] [--viewports 1366x768,1600x900] [--base-url URL] [--api-url URL] [--vlmkit bin] [--out dir]`);
      process.exit(0);
    } else fail(`未知参数 ${arg}`);
  }
  if (!out.all && !out.pages) out.changed = true;
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const allow = JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8'));
const viewports = args.viewports ?? config.integrity.viewports;
const disabledRules = config.integrity.disabledRules ?? [];
const routeById = new Map(config.routes.map((route) => [route.id, route]));

function globToRegExp(pattern) {
  let source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  source = source.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000\//g, '(?:.*/)?').replace(/\u0000/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp(`^${source}$`);
}
const matches = (pattern, file) => (pattern.includes('*') || pattern.includes('?') ? globToRegExp(pattern).test(file) : pattern === file);

function changedFiles() {
  const files = new Set();
  const git = (a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const bases = [args.base, 'origin/main', 'HEAD'].filter(Boolean);
  let diffed = false;
  for (const base of bases) {
    const result = git(['diff', '--name-only', `${base}...HEAD`]);
    if (result.status === 0) {
      for (const line of result.stdout.split('\n').filter(Boolean)) files.add(line);
      diffed = true;
      break;
    }
  }
  if (!diffed) fail(`无法计算 changed files（base=${args.base ?? 'origin/main'}）；请显式传 --base`);
  for (const extra of [['diff', '--name-only', '--cached'], ['diff', '--name-only']]) {
    const result = git(extra);
    if (result.status === 0) for (const line of result.stdout.split('\n').filter(Boolean)) files.add(line);
  }
  return [...files];
}

function selectPages() {
  if (args.all) return { pages: config.routes.map((route) => route.id), fallback: null, files: [] };
  if (args.pages) {
    const unknown = args.pages.filter((id) => !routeById.has(id));
    if (unknown.length) fail(`未知页面 id: ${unknown.join(', ')}`);
    return { pages: args.pages, fallback: null, files: [] };
  }
  const files = changedFiles();
  const selected = new Set();
  let fallback = null;
  for (const file of files) {
    if (config.exclude.some((entry) => matches(entry.match, file))) continue;
    const shared = config.shared.find((entry) => matches(entry.match, file));
    if (shared) {
      if (shared.pages === '*') fallback = fallback ?? { reason: 'shared-file', file };
      else shared.pages.forEach((id) => selected.add(id));
      continue;
    }
    const hit = config.routes.find((route) => route.covers.some((cover) => matches(cover, file)));
    if (hit) selected.add(hit.id);
    else if (file.startsWith('client/src/')) fallback = fallback ?? { reason: 'unmapped-client-file', file };
  }
  if (fallback) return { pages: config.routes.map((route) => route.id), fallback, files };
  return { pages: [...selected], fallback: null, files };
}

const selection = selectPages();
if (args.dryRun) {
  console.log(JSON.stringify({ selection: selection.pages, fallback: selection.fallback, changedFiles: selection.files }, null, 2));
  process.exit(0);
}
const outDir = path.resolve(ROOT, args.outDir ?? path.join('tmp', 'layout-audit', new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(outDir, { recursive: true });

async function waitFor(url, label) {
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`${label} 不可达: ${url}`);
}

async function resolveFixtures() {
  const fixtures = {};
  const readList = async (endpoint, token) => {
    const response = await fetch(`${args.apiUrl}${endpoint}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) fail(`fixture ${endpoint} 返回 ${response.status}`);
    const body = await response.json();
    const rows = body.data?.data ?? body.data ?? body;
    if (!Array.isArray(rows)) fail(`fixture ${endpoint} 响应不是数组`);
    return rows;
  };
  const people = await readList(config.fixtures.personId.endpoint);
  const person = people.find((row) => row.is_active !== false && row.is_active !== 0) ?? people[0];
  if (!person?.id) fail('没有可用的 person fixture');
  fixtures.personId = person.id;
  const login = await fetch(`${args.apiUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: person.id }) });
  if (!login.ok) fail(`登录失败 ${login.status}`);
  const payload = await login.json();
  const auth = payload.data ?? payload;
  if (!auth.accessToken) fail('登录响应缺 accessToken');
  for (const [name, spec] of Object.entries(config.fixtures)) {
    if (name === 'personId') continue;
    const rows = await readList(spec.endpoint, auth.accessToken);
    const picked = spec.pick === 'first_active' ? rows.find((row) => row.is_active !== false && row.is_active !== 0) : rows[0];
    if (!picked?.id) fail(`fixture ${name} 无可用行`);
    fixtures[name] = picked.id;
  }
  const origin = new URL(args.baseUrl).origin;
  const localStorage = [
    { name: 'capacinator_current_user', value: JSON.stringify(auth.user ?? person) },
    { name: 'auth_token', value: auth.accessToken },
    ...(auth.refreshToken ? [{ name: 'refresh_token', value: auth.refreshToken }] : []),
    { name: 'capacinator-language', value: 'zh-CN' },
    { name: 'theme', value: 'light' },
  ];
  const storagePath = path.join(outDir, 'storage-state.json');
  fs.writeFileSync(storagePath, JSON.stringify({ cookies: [], origins: [{ origin, localStorage }] }));
  return { fixtures, storagePath, person, token: auth.accessToken };
}

const allowArgs = (allow.entries ?? []).map((entry) => {
  const selector = entry.selector ? `@${entry.selector}` : '';
  const viewport = entry.viewport ? `@${entry.viewport}` : '';
  return `${entry.kind}${selector}${viewport};${entry.reason}`;
});

function runVlmkit(page, viewport, storagePath, fixtures) {
  const route = routeById.get(page);
  const routePath = route.path.replace(/\$\{([^}]+)\}/g, (_, name) => {
    if (!fixtures[name]) fail(`route ${page} 需要未解析 fixture: ${name}`);
    return fixtures[name];
  });
  const url = `${args.baseUrl}${routePath}`;
  const vlmkitArgs = ['check', 'integrity', url, '--storage-state', storagePath, '--viewport', viewport, '--wait-until', 'domcontentloaded', '--timeout', '45000', '--json', '--no-ledger'];
  for (const rule of disabledRules) vlmkitArgs.push('--rule', `check.integrity/${rule}=off`);
  for (const entry of allowArgs) vlmkitArgs.push('--allow', entry);
  const result = spawnSync(args.vlmkit, vlmkitArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const stdout = result.stdout ?? '';
  let parsed = null;
  try { parsed = JSON.parse(stdout); } catch {
    const start = stdout.indexOf('{');
    if (start >= 0) { try { parsed = JSON.parse(stdout.slice(start)); } catch {} }
  }
  if (!parsed || !Array.isArray(parsed.findings)) {
    return { page, viewport, url, status: 'infra-error', exitCode: result.status, error: (result.stderr || stdout || '').slice(0, 1200) };
  }
  return { page, viewport, url, status: 'completed', exitCode: result.status, verdict: parsed.verdict, findings: parsed.findings, counts: parsed.counts ?? {}, exempted: parsed.exempted ?? [] };
}

const fixtureData = await resolveFixtures();
await waitFor(`${args.apiUrl}/api/health`, 'API');
await waitFor(args.baseUrl, 'frontend');

// —— 已结束形状人员（2026-11-14 页面审计 F-01 沉淀）：
// 夹具单一化（行全部跨参考日）让"已结束行在泳道消失"这类数据形状缺陷
// 对一切门禁不可见。允许写库的环境（CI 隔离 e2e 栈）临时造一名
// active/ended/paused 三行人员，并对 person-workload 追加一次访问；
// 本地 dev 栈不写库，记录 skipped 原因。
const endedShape = { created: false, reason: 'allow-writes-off（本地 dev 栈禁止写库；CI 设 LAYOUT_AUDIT_ALLOW_WRITES=1）' };
const endedCleanup = { personId: null, assignmentIds: [] };
const authHeaders = { Authorization: `Bearer ${fixtureData.token}`, 'Content-Type': 'application/json' };
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
if (process.env.LAYOUT_AUDIT_ALLOW_WRITES === '1' && fixtureData.fixtures.projectId && fixtureData.fixtures.roleId) {
  try {
    const stamp = Date.now();
    const personRes = await fetch(`${args.apiUrl}/api/people`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: `LayoutAudit Ended ${stamp}`, email: `layout-audit-ended-${stamp}@example.com`, is_active: true }) });
    if (!personRes.ok) throw new Error(`create person ${personRes.status}`);
    const personBody = await personRes.json();
    const created = personBody.data ?? personBody;
    endedCleanup.personId = created.id;
    const mk = async (start, end, allocation, roleId) => {
      const res = await fetch(`${args.apiUrl}/api/assignments`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ person_id: endedCleanup.personId, project_id: fixtureData.fixtures.projectId, role_id: roleId, allocation_percentage: allocation, assignment_date_mode: 'fixed', start_date: start, end_date: end }) });
      if (!res.ok) { const errBody = await res.json().catch(() => ({})); throw new Error(`create assignment ${res.status}: roleId=${roleId} project=${fixtureData.fixtures.projectId} err=${JSON.stringify(errBody)}`); }
      const row = (await res.json()).data ?? {};
      endedCleanup.assignmentIds.push(row.id);
      return row;
    };
    const rolesRes = await fetch(`${args.apiUrl}/api/roles?limit=50`, { headers: authHeaders });
    const rolesBody = await rolesRes.json();
    const roleRows = rolesBody.data?.data ?? rolesBody.data ?? [];
    const roleFor = (i) => roleRows[i % Math.max(roleRows.length, 1)]?.id ?? fixtureData.fixtures.roleId;
    await mk(iso(-7), iso(21), 20, roleFor(0));   // 进行中（跨参考日）
    await mk(iso(-45), iso(-15), 50, roleFor(1)); // 已结束（早于参考日）
    const paused = await mk(iso(-3), iso(30), 10, roleFor(2));
    const pauseRes = await fetch(`${args.apiUrl}/api/assignments/${paused.id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ status: 'paused' }) });
    if (!pauseRes.ok) throw new Error(`pause ${pauseRes.status}`);
    fixtureData.fixtures.personEndedId = endedCleanup.personId;
    endedShape.created = true; endedShape.reason = 'created';
    const base = routeById.get('person-workload');
    if (base && selection.pages.includes('person-workload')) {
      routeById.set('person-workload:ended', { ...base, id: 'person-workload:ended', path: base.path.replace('${personId}', '${personEndedId}') });
      selection.pages.push('person-workload:ended');
    }
  } catch (error) {
    endedShape.reason = `create-failed: ${String(error.message ?? error)}`;
  }
}

const results = [];
try {

  for (const page of selection.pages) {
    for (const viewport of viewports) {
      const result = runVlmkit(page, viewport, fixtureData.storagePath, fixtureData.fixtures);
      results.push(result);
      process.stdout.write(`${result.status === 'completed' ? '·' : '✗'}`);
    }
  }
} finally {
  if (endedCleanup.personId) {
    const warn = (what, status) => console.warn(`⚠ layout-audit 清理失败 ${what}: ${status}`);
    const del = async (url) => {
      const res = await fetch(url, { method: 'DELETE', headers: authHeaders }).catch(() => null);
      return res ? res.status : 'network';
    };
    // 兜底：反查该人员全部分配（创建中断时 ids 可能不全），删行后再删人
    try {
      const listRes = await fetch(`${args.apiUrl}/api/assignments?person_id=${endedCleanup.personId}&limit=200`, { headers: authHeaders });
      const listBody = await listRes.json();
      const rows = listBody.data?.data ?? listBody.data ?? [];
      for (const row of rows) {
        const status = await del(`${args.apiUrl}/api/assignments/${row.id}`);
        if (status >= 400) warn(`assignment ${row.id}`, status);
      }
    } catch (error) {
      warn('assignments list', String(error.message ?? error));
    }
    const personStatus = await del(`${args.apiUrl}/api/people/${endedCleanup.personId}`);
    if (personStatus >= 400) warn(`person ${endedCleanup.personId}`, personStatus);
  }
}
process.stdout.write('\n');

const infraFailures = results.filter((result) => result.status !== 'completed');
const findings = results.flatMap((result) => (result.findings ?? []).map((finding) => ({ ...finding, page: result.page, viewport: result.viewport })));
const byRule = {};
for (const finding of findings) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;

const trigger = {
  generatedAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  apiUrl: args.apiUrl,
  selection: selection.pages,
  selectionFallback: selection.fallback,
  changedFiles: selection.files,
  viewports,
  disabledRules,
  allowEntries: allow.entries?.length ?? 0,
  endedShape,
  results: results.map(({ page, viewport, status, exitCode, verdict }) => ({ page, viewport, status, exitCode, verdict })),
  infraFailures: infraFailures.length,
  findings: findings.length,
  byRule,
};
fs.writeFileSync(path.join(outDir, 'trigger.json'), JSON.stringify(trigger, null, 2));
fs.writeFileSync(path.join(outDir, 'findings.json'), JSON.stringify({ trigger, results, findings }, null, 2));

const lines = [
  '# Layout audit',
  '',
  `- 时间: ${trigger.generatedAt}`,
  `- 目标: ${args.baseUrl} / ${args.apiUrl}`,
  `- 选中页面: ${selection.pages.length ? selection.pages.join(', ') : '（无 UI 变化，未运行）'}`,
  `- 选页依据: ${selection.fallback ? `回退全量（${selection.fallback.reason}: ${selection.fallback.file}）` : args.pages ? '显式 --pages' : args.all ? '显式 --all' : 'changed 映射'}`,
  `- 视口: ${viewports.join(', ')}`,
  `- 禁用规则: ${disabledRules.join(', ') || '无'}`,
  `- findings: ${findings.length}；未能运行: ${infraFailures.length}`,
  `- 已结束形状: ${endedShape.created ? '已创建（person-workload:ended）' : `未创建——${endedShape.reason}`}`,
  '',
  '## 按规则',
  '',
  ...(Object.keys(byRule).length ? Object.entries(byRule).map(([rule, count]) => `- ${rule}: ${count}`) : ['- 无']),
  '',
  '## Findings（最多 40 条）',
  '',
];
if (findings.length === 0) lines.push('无。');
for (const finding of findings.slice(0, 40)) {
  lines.push(`- **${finding.rule}** @ ${finding.viewport} · ${finding.page} — ${finding.message}`);
  if (finding.selector) lines.push(`  - selector: \`${finding.selector}\``);
}
if (infraFailures.length) {
  lines.push('', '## 未能运行', '');
  for (const failure of infraFailures) lines.push(`- ${failure.page} @ ${failure.viewport}: ${failure.error}`);
}
fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');

console.log(`Layout audit: ${selection.pages.length} 页 × ${viewports.length} 视口，findings ${findings.length}，未能运行 ${infraFailures.length}`);
console.log(`报告: ${path.relative(ROOT, path.join(outDir, 'summary.md'))}`);
if (infraFailures.length) fail(`${infraFailures.length} 个页面/视口未能审计（详见 summary.md）`);
