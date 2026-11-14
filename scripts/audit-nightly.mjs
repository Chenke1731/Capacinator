#!/usr/bin/env node
/**
 * 本地夜审（2026-11-14，用户裁决：无 GitHub CI 诉求，CI 全部本地化）。
 * 取代 .github/workflows/layout-audit.yml 的全部步骤：
 *   1) layout-audit map guard（阻塞）
 *   2) vlmkit 布局体检 --all（advisory；LAYOUT_AUDIT_ALLOW_WRITES=1 启用
 *      "已结束形状"临时人员；--strict 时 findings 也失败）
 *   3) typography guard --all（阻塞）
 * 自起隔离 e2e 栈（API 3111 / Vite 3122）；若端口上已有 e2e 栈则复用，
 * 只清理自己拉起的进程。报告落在 tmp/audit-nightly/<日期>/（gitignored），
 * 状态行追加 tmp/audit-nightly.log。
 *
 * 用法： node scripts/audit-nightly.mjs [--pages a,b] [--strict] [--keep-stack]
 * 定时： npm run audit:nightly:cron（安装/刷新 crontab，默认每日 02:30）
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const API = 'http://127.0.0.1:3111';
const WEB = 'http://127.0.0.1:3122';
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const keepStack = args.includes('--keep-stack');
const pagesArg = args.includes('--pages') ? args[args.indexOf('--pages') + 1] : null;
const dateTag = new Date().toISOString().slice(0, 10);
const outDir = path.join(ROOT, 'tmp', 'audit-nightly', dateTag);
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
  if (apiOk || webOk) { console.error(`✗ 3111/3122 只有单边可用且不是完整 e2e 栈（api=${apiOk} web=${webOk}）；先清理残留（pkill -f "PORT=3111" 等）再重试`); return false; }
  const envBase = { ...process.env, PATH: pathWithNode };
  const api = spawn('npx', ['tsx', 'src/server/index.ts'], { cwd: ROOT, env: { ...envBase, NODE_ENV: 'e2e', PORT: '3111', FORCE_COLOR: '0' }, detached: true, stdio: 'ignore' });
  const web = spawn('npx', ['vite', '--config', 'client-vite.config.ts', '--port', '3122', '--strictPort'], { cwd: ROOT, env: { ...envBase, VITE_E2E: '1', PORT: '3111' }, detached: true, stdio: 'ignore' });
  spawned.push(api.pid, web.pid);
  const ok = (await waitOk(`${API}/api/health`, 'API')) && (await waitOk(WEB, '前端'));
  return ok;
};
const stopStack = () => {
  if (keepStack || !spawned.length) return;
  for (const pid of spawned) { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} } }
};

const blocking = [];
const notes = [];
const ok = await startStack();
if (!ok) { console.error('✗ 夜审未运行：隔离栈不可用'); process.exit(1); }
try {
  console.log(`── [1/3] layout map guard ──`);
  const map = run('node', ['scripts/check-layout-audit-map.mjs']);
  console.log(map.out.trim().split('\n').slice(-1)[0]);
  if (map.code !== 0) blocking.push('map-guard');

  console.log(`── [2/3] vlmkit 布局体检（${pagesArg ? pagesArg : '全量'}，advisory）──`);
  const layout = run('node', ['scripts/audit-layout.mjs', ...(pagesArg ? ['--pages', pagesArg] : ['--all']), '--base-url', WEB, '--api-url', API, '--out', path.join(outDir, 'layout')], { LAYOUT_AUDIT_ALLOW_WRITES: '1' });
  const layoutFindings = /findings (\d+)/.exec(layout.out)?.[1] ?? '?';
  console.log(layout.out.trim().split('\n').slice(-2).join('\n'));
  if (layout.code === 2) blocking.push('layout-infra');
  if (strict && Number(layoutFindings) > 0) blocking.push('layout-findings(strict)');
  if (Number(layoutFindings) > 0) notes.push(`⚠ 布局 findings ${layoutFindings}（advisory）→ ${path.relative(ROOT, path.join(outDir, 'layout', 'summary.md'))}`);

  console.log(`── [3/3] typography guard（${pagesArg ? pagesArg : '全量'}，阻塞）──`);
  const typo = run('node', ['scripts/audit-typography.mjs', ...(pagesArg ? ['--pages', pagesArg] : ['--all']), '--base-url', WEB, '--api-url', API, '--out', path.join(outDir, 'typography')]);
  console.log(typo.out.trim().split('\n').slice(-2).join('\n'));
  if (typo.code !== 0) blocking.push('typography');
} finally {
  stopStack();
}

const verdict = blocking.length ? `FAIL（${blocking.join(', ')}）` : 'PASS';
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
console.log(`\n夜审 ${verdict}；报告 ${path.relative(ROOT, path.join(outDir, 'summary.md'))}${notes.length ? '\n' + notes.join('\n') : ''}`);
process.exit(blocking.length ? 1 : 0);
