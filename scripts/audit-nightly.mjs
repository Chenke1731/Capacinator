#!/usr/bin/env node
/**
 * 本地夜审（2026-11-14，用户裁决：无 GitHub CI 诉求，CI 全部本地化）。
 * 取代 .github/workflows/layout-audit.yml 的全部步骤：
 *   1) layout-audit map guard（阻塞）
 *   2) vlmkit 布局体检 --all（advisory；LAYOUT_AUDIT_ALLOW_WRITES=1 启用
 *      "已结束形状"临时人员；--strict 时 findings 也失败）
 *   3) typography guard --all（阻塞）
 * 自起隔离 e2e 栈（API 3131 / Vite 3132）并使用独立数据库
 * `.e2e-data/audit-nightly.db`——换端口不换 DB 会在启动时删掉正在跑的
 * Playwright e2e 库（init-e2e.ts 会 unlink 目标文件）。若端口上已有完整
 * 夜审栈则复用；只清理自己拉起的进程。报告落在
 * tmp/audit-nightly/<日期>/（gitignored），状态行追加 tmp/audit-nightly.log。
 *
 * 用法： node scripts/audit-nightly.mjs [--pages a,b] [--strict] [--keep-stack]
 * 定时： npm run audit:nightly:cron（安装/刷新 crontab，默认每日 02:30）
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// 独占端口 3131/3132：3111/3122 是 Playwright e2e webServer 的端口——夜审若复用它，
// ended 形状会往正在跑的 e2e 套件里写临时人员，且栈可能被 Playwright 中途拆掉。
const API = process.env.AUDIT_NIGHTLY_API ?? 'http://127.0.0.1:3131';
const WEB = process.env.AUDIT_NIGHTLY_WEB ?? 'http://127.0.0.1:3132';
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const keepStack = args.includes('--keep-stack');
const pagesArg = args.includes('--pages') ? args[args.indexOf('--pages') + 1] : null;
const dateTag = new Date().toISOString().slice(0, 10);
const outDir = path.join(ROOT, 'tmp', 'audit-nightly', dateTag);
const AUDIT_DB = path.join(ROOT, '.e2e-data', 'audit-nightly.db');
const NIGHTLY_LOCK = path.join(ROOT, '.e2e-data', 'audit-nightly.lock');

const acquireLock = () => {
  fs.mkdirSync(path.dirname(NIGHTLY_LOCK), { recursive: true });
  if (fs.existsSync(NIGHTLY_LOCK)) {
    const pid = Number(fs.readFileSync(NIGHTLY_LOCK, 'utf8').trim());
    let alive = false;
    if (pid) { try { process.kill(pid, 0); alive = true; } catch {} }
    if (alive) {
      console.error(`✗ another audit-nightly is already running (pid ${pid}); refusing to start`);
      process.exit(1);
    }
    fs.rmSync(NIGHTLY_LOCK, { force: true });
  }
  fs.writeFileSync(NIGHTLY_LOCK, String(process.pid));
};
const releaseLock = () => {
  try {
    if (fs.readFileSync(NIGHTLY_LOCK, 'utf8').trim() === String(process.pid)) {
      fs.rmSync(NIGHTLY_LOCK, { force: true });
    }
  } catch {}
};
process.on('exit', releaseLock);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const nodeBinDir = path.dirname(process.execPath);
const pathWithNode = `${nodeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

const run = (cmd, cmdArgs, env = {}) => {
  // vlmkit 的 shebang 是 `env node`：必须把本进程的 node（≥20）放到 PATH 最前，
  // 否则落到系统 node18 → Playwright 拒启（实测 infra-error）。
  const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: pathWithNode, ...env }, maxBuffer: 32 * 1024 * 1024 });
  return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

const waitOk = async (url, label, ms = 90000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`✗ ${label} 不可达：${url}`);
  return false;
};

const spawned = [];
const startStack = async () => {
  const apiOk = await fetch(`${API}/api/health`).then((r) => r.json().catch(() => null)).then((b) => b?.environment === 'e2e').catch(() => false);
  const webOk = await fetch(WEB).then((r) => r.ok).catch(() => false);
  if (apiOk && webOk) { console.log('· 复用已运行的 e2e 栈（3111/3122）'); return true; }
  if (apiOk || webOk) { console.error(`✗ ${API}/${WEB} 只有单边可用且不是完整 e2e 栈（api=${apiOk} web=${webOk}）；先清理残留再重试`); return false; }
  const envBase = { ...process.env, PATH: pathWithNode };
  const api = spawn('npx', ['tsx', 'src/server/index.ts'], { cwd: ROOT, env: { ...envBase, NODE_ENV: 'e2e', PORT: new URL(API).port, E2E_DB_PATH: AUDIT_DB, AUDIT_NIGHTLY_DB: AUDIT_DB, FORCE_COLOR: '0' }, detached: true, stdio: 'ignore' });
  const web = spawn('npx', ['vite', '--config', 'client-vite.config.ts', '--port', new URL(WEB).port, '--strictPort'], { cwd: ROOT, env: { ...envBase, VITE_E2E: '1', PORT: new URL(API).port }, detached: true, stdio: 'ignore' });
  spawned.push(api.pid, web.pid);
  const ok = (await waitOk(`${API}/api/health`, 'API')) && (await waitOk(WEB, '前端'));
  return ok;
};
const stopStack = () => {
  if (keepStack || !spawned.length) return;
  for (const pid of spawned) { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} } }
  // npx→tsx/vite 进程组偶发漏杀（实测 vite 残留 3132）：组信号后按端口兜底强杀
  setTimeout(() => {
    for (const port of [new URL(API).port, new URL(WEB).port]) {
      try { spawnSync(`fuser -k ${port}/tcp`.split(' '), { stdio: 'ignore' }); } catch {}
    }
  }, 2500);
};

const blocking = [];
const notes = [];
acquireLock();
const ok = await startStack();
if (!ok) { console.error('✗ 夜审未运行：隔离栈不可用'); process.exit(1); }
try {
  console.log(`── [1/4] layout map guard ──`);
  const map = run('node', ['scripts/check-layout-audit-map.mjs']);
  console.log(map.out.trim().split('\n').slice(-1)[0]);
  if (map.code !== 0) blocking.push('map-guard');

  console.log(`── [2/4] vlmkit 布局体检（${pagesArg ? pagesArg : '全量'}，advisory）──`);
  const layout = run('node', ['scripts/audit-layout.mjs', ...(pagesArg ? ['--pages', pagesArg] : ['--all']), '--base-url', WEB, '--api-url', API, '--out', path.join(outDir, 'layout')], { LAYOUT_AUDIT_ALLOW_WRITES: '1' });
  const layoutFindings = /findings (\d+)/.exec(layout.out)?.[1] ?? '?';
  console.log(layout.out.trim().split('\n').slice(-2).join('\n'));
  if (layout.code === 2) blocking.push('layout-infra');
  if (strict && Number(layoutFindings) > 0) blocking.push('layout-findings(strict)');
  if (Number(layoutFindings) > 0) notes.push(`⚠ 布局 findings ${layoutFindings}（advisory）→ ${path.relative(ROOT, path.join(outDir, 'layout', 'summary.md'))}`);

  console.log(`── [3/4] typography guard（${pagesArg ? pagesArg : '全量'}，阻塞）──`);
  const typo = run('node', ['scripts/audit-typography.mjs', ...(pagesArg ? ['--pages', pagesArg] : ['--all']), '--base-url', WEB, '--api-url', API, '--out', path.join(outDir, 'typography')]);
  console.log(typo.out.trim().split('\n').slice(-2).join('\n'));
  if (typo.code !== 0) blocking.push('typography');

  console.log(`── [4/4] docs local links（阻塞）──`);
  const links = run('node', ['scripts/check-doc-links.mjs', '--strict']);
  console.log(links.out.trim().split('\n').slice(-2).join('\n'));
  if (links.code !== 0) blocking.push('docs-links');
} finally {
  stopStack();
}

const verdict = blocking.length ? `FAIL（${blocking.join(', ')}）` : 'PASS';

// ---- 呈现层：结构化抽取 → 与上次 diff → history → 自包含 HTML → latest → 保留期 ----
const readJsonSafe = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const layoutData = readJsonSafe(path.join(outDir, 'layout', 'findings.json'));
const typoData = readJsonSafe(path.join(outDir, 'typography', 'typography.json'));
const findingsBy = new Map(); // key -> {rule,page,message,viewports:Set}
for (const f of layoutData?.findings ?? []) {
  const key = `${f.rule}|${f.page}|${String(f.message ?? '').slice(0, 90)}`;
  const hit = findingsBy.get(key) ?? { rule: f.rule, page: f.page, message: f.message, selector: f.selector, viewports: new Set() };
  hit.viewports.add(f.viewport); findingsBy.set(key, hit);
}
const statePath = path.join(ROOT, 'tmp', 'audit-nightly', '.state.json');
const prevState = readJsonSafe(statePath);
const prevKeys = new Set(prevState?.keys ?? []);
const currentKeys = new Set(findingsBy.keys());
const added = [...currentKeys].filter((k) => !prevKeys.has(k)).map((k) => findingsBy.get(k));
const resolved = [...prevKeys].filter((k) => !currentKeys.has(k));
const kept = [...currentKeys].filter((k) => prevKeys.has(k)).map((k) => findingsBy.get(k));
fs.writeFileSync(statePath, JSON.stringify({ date: dateTag, keys: [...currentKeys] }, null, 2));
const exempted = (layoutData?.results ?? []).reduce((sum, r) => sum + (r.exempted?.length ?? 0), 0);

const historyPath = path.join(ROOT, 'tmp', 'audit-nightly', 'history.json');
const history = readJsonSafe(historyPath) ?? [];
history.push({ date: dateTag, verdict, findings: currentKeys.size, added: added.length, resolved: resolved.length, exempted, typo: typoData?.violations?.length ?? 0, blocking });
fs.writeFileSync(historyPath, JSON.stringify(history.slice(-90), null, 2));

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rowsHtml = (list) => list.map((f) => `<tr><td>${esc(f.rule)}</td><td>${esc(f.page)}</td><td>${esc([...f.viewports].join(' / '))}</td><td>${esc(f.message)}</td><td><code>${esc(f.selector ?? '')}</code></td></tr>`).join('');
const histRows = history.slice(-14).reverse().map((h) => `<tr><td>${h.date}</td><td class="${h.verdict === 'PASS' ? 'ok' : 'bad'}">${h.verdict}</td><td>${h.findings}</td><td>${h.added}</td><td>${h.resolved}</td><td>${h.typo}</td></tr>`).join('');
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>夜审 ${dateTag}</title>
<style>body{font:14px/1.6 system-ui;margin:0;padding:24px;background:#f8fafc;color:#0f172a}main{max-width:1080px;margin:auto}h1{font-size:20px}h2{font-size:16px;margin-top:28px;border-left:4px solid #2563eb;padding-left:8px}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}th,td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left;vertical-align:top}th{background:#f1f5f9}code{font-size:12px}.banner{padding:12px 16px;border-radius:8px;font-weight:600}.pass{background:#dcfce7;color:#166534}.fail{background:#fee2e2;color:#991b1b}.muted{color:#64748b}.tag{display:inline-block;margin:0 6px 6px 0;padding:2px 8px;border-radius:99px;background:#e0e7ff;font-size:12px}</style>
<main><h1>Capacinator 夜审报告 <span class="muted">${dateTag}</span></h1>
<div class="banner ${blocking.length ? 'fail' : 'pass'}">${verdict}${notes.length ? ' · 布局 findings ' + currentKeys.size + '（advisory）' : ''}</div>
<p class="muted">页面 ${pagesArg ?? '全量'} · 已结束形状 ${layoutData?.trigger?.endedShape?.created ? '已启用' : '未启用'} · 豁免 ${exempted} 条 · 基线对比：${prevState ? '与 ' + prevState.date : '首次（下次起显示 新增/消解）'}</p>
<h2>自上次变化</h2><p><span class="tag">新增 ${added.length}</span><span class="tag">持续 ${kept.length}</span><span class="tag">已消解 ${resolved.length}</span></p>
${added.length ? '<h3>🆕 新增</h3><table><tr><th>规则</th><th>页面</th><th>视口</th><th>说明</th><th>selector</th></tr>' + rowsHtml(added) + '</table>' : ''}
${kept.length ? '<h3>⏳ 持续存在</h3><table><tr><th>规则</th><th>页面</th><th>视口</th><th>说明</th><th>selector</th></tr>' + rowsHtml(kept) + '</table>' : ''}
${resolved.length ? '<h3>✅ 已消解</h3><ul>' + resolved.map((k) => '<li><code>' + esc(k.split('|')[0]) + '</code> ' + esc(k.split('|')[1]) + '</li>').join('') + '</ul>' : ''}
${(typoData?.violations?.length ?? 0) > 0 ? '<h2>字号/标题违规（阻塞）</h2><ul>' + typoData.violations.map((v) => '<li>' + esc(v.rule) + ' · ' + esc(v.page) + ' — ' + esc(v.fs ?? v.sizes?.join('/')) + ' ' + esc(v.cls ?? v.text ?? '') + '</li>').join('') + '</ul>' : ''}
<h2>历史（最近 ${Math.min(14, history.length)} 次）</h2><table><tr><th>日期</th><th>结论</th><th>findings</th><th>新增</th><th>消解</th><th>字号违规</th></tr>${histRows}</table>
<p class="muted">明细：<a href="layout/summary.md">vlmkit summary</a> · <a href="typography/summary.md">typography summary</a> · 原始 <a href="layout/findings.json">findings.json</a>；本报告为本地自包含文件，直接浏览器打开。</p></main>`;
fs.writeFileSync(path.join(outDir, 'report.html'), html);
const latest = path.join(ROOT, 'tmp', 'audit-nightly', 'latest');
try { fs.rmSync(latest, { force: true }); fs.symlinkSync(outDir, latest, 'dir'); } catch { fs.cpSync(outDir, path.join(ROOT, 'tmp', 'audit-nightly', 'latest-dir'), { recursive: true }); }
for (const dir of fs.readdirSync(path.join(ROOT, 'tmp', 'audit-nightly')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(0, -30)) fs.rmSync(path.join(ROOT, 'tmp', 'audit-nightly', dir), { recursive: true, force: true });

const summary = [
  `# Nightly audit ${dateTag} — ${verdict}`,
  '',
  `- 布局：${path.relative(ROOT, path.join(outDir, 'layout', 'summary.md'))}`,
  `- 字号/标题：${path.relative(ROOT, path.join(outDir, 'typography', 'summary.md'))}`,
  ...(notes.length ? ['', ...notes] : []),
  ...(blocking.length ? ['', `阻塞项：${blocking.join(', ')}`] : []),
].join('\n');
fs.writeFileSync(path.join(outDir, 'summary.md'), summary + '\n');
fs.appendFileSync(path.join(ROOT, 'tmp', 'audit-nightly.log'), `${new Date().toISOString()} ${verdict}${notes.length ? ' | ' + notes.join(' ; ') : ''}${blocking.length ? ' | ' + blocking.join(',') : ''}\n`);
console.log(`\n夜审 ${verdict}；报告 ${path.relative(ROOT, path.join(outDir, 'report.html'))}（稳定入口 tmp/audit-nightly/latest/report.html）\n新增 ${added.length} · 持续 ${kept.length} · 已消解 ${resolved.length}${notes.length ? '\n' + notes.join('\n') : ''}`);
process.exit(blocking.length ? 1 : 0);
