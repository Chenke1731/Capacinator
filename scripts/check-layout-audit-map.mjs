#!/usr/bin/env node
/**
 * Layout audit 触发映射守卫（vlmkit 落地，2026-11-14）。
 *
 * vlmkit 的“准确触发”不靠评审记忆：CI 以宽路径触发审计脚本，脚本靠本映射
 * 选页；未映射的 client/src 变化会回退全量。本守卫保证映射不会腐烂：
 * - 每个 client/src/pages/*.tsx 必须被 route.covers 覆盖或显式 exclude；
 * - App.tsx 的每个非重定向路由必须有对应 route（按段数/静态段匹配）；
 * - covers 中的精确文件必须存在；
 * - allow 条目必须带 reason/owner/expires，且不得过期/未知规则。
 *
 * 用法：node scripts/check-layout-audit-map.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'scripts/layout-audit.config.json');
const ALLOW = path.join(ROOT, 'scripts/layout-audit.allow.json');
const APP = path.join(ROOT, 'client/src/App.tsx');
const PAGES_DIR = path.join(ROOT, 'client/src/pages');

const INTEGRITY_RULES = new Set([
  'js-error', 'degenerate-render', 'broken-image', 'failed-stylesheet',
  'broken-font', 'text-collision', 'text-clipped', 'collapsed-container',
  'page-overflow-x', 'clipped-content', 'nested-scroll', 'unstyled-page',
  'container-protrusion', 'invisible-text', 'low-contrast-text',
  'near-misalignment', 'occluded-text', 'redirected', 'stale-har-fixture',
]);

const problems = [];
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { problems.push(`${path.relative(ROOT, file)} 无法解析: ${error.message}`); return null; }
};

const hasGlob = (value) => /[*?]/.test(value);
const config = readJson(CONFIG);
const allow = readJson(ALLOW);

if (config) {
  const routeIds = new Set();
  for (const route of config.routes ?? []) {
    if (!route.id || !route.path) problems.push(`route 缺 id/path: ${JSON.stringify(route)}`);
    if (routeIds.has(route.id)) problems.push(`route id 重复: ${route.id}`);
    routeIds.add(route.id);
    for (const cover of route.covers ?? []) {
      if (hasGlob(cover)) continue;
      if (!fs.existsSync(path.join(ROOT, cover))) {
        problems.push(`route ${route.id} 的 covers 文件不存在: ${cover}`);
      }
    }
  }
  for (const shared of config.shared ?? []) {
    if (shared.pages !== '*' && (!Array.isArray(shared.pages) || shared.pages.some((id) => !routeIds.has(id)))) {
      problems.push(`shared 规则 pages 含未知 route: ${JSON.stringify(shared)}`);
    }
  }

  const covered = new Set();
  for (const route of config.routes ?? []) {
    for (const cover of route.covers ?? []) {
      if (!hasGlob(cover)) covered.add(cover);
    }
  }
  for (const excluded of config.exclude ?? []) {
    if (!excluded.match || !excluded.reason) problems.push(`exclude 条目缺 match/reason: ${JSON.stringify(excluded)}`);
    if (!hasGlob(excluded.match)) covered.add(excluded.match);
  }
  for (const file of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.tsx'))) {
    const relative = path.posix.join('client/src/pages', file);
    if (!covered.has(relative)) {
      problems.push(`页面文件未被审计映射覆盖: ${relative}（加到 route.covers 或显式 exclude+理由）`);
    }
  }

  // App.tsx 路由：重定向路由不要求审计页；其余必须有映射。
  const redirects = new Set(['/', '/roadmap', '/roles', '/resource-templates', '/allocations', '/project-types', '/availability', '/assignments/:id', '*']);
  const appSource = fs.readFileSync(APP, 'utf8');
  const appPaths = [...appSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  const normalize = (value) => value.replace(/\$\{[^}]+\}/g, ':param').split('/').filter(Boolean);
  const mapped = (config.routes ?? []).map((route) => normalize(route.path));
  for (const appPath of appPaths) {
    if (redirects.has(appPath)) continue;
    const segments = normalize(appPath);
    const hit = mapped.some((candidate) =>
      candidate.length === segments.length &&
      candidate.every((segment, index) => segment === ':param' || segments[index] === ':param' || segment === segments[index])
    );
    if (!hit) problems.push(`App 路由无审计映射: ${appPath}（补 route 或加入 redirects 白名单）`);
  }
}

if (allow) {
  const entries = allow.entries ?? [];
  if (!Array.isArray(entries)) problems.push('layout-audit.allow.json.entries 必须是数组');
  for (const entry of entries) {
    if (!INTEGRITY_RULES.has(entry.kind)) problems.push(`allow 未知规则 kind: ${JSON.stringify(entry)}`);
    if (!entry.reason || String(entry.reason).trim().length < 4) problems.push(`allow 缺实质 reason: ${JSON.stringify(entry)}`);
    if (!entry.owner) problems.push(`allow 缺 owner: ${JSON.stringify(entry)}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')) problems.push(`allow 缺 expires(YYYY-MM-DD): ${JSON.stringify(entry)}`);
    else if (new Date(`${entry.expires}T23:59:59Z`).getTime() < Date.now()) {
      problems.push(`allow 条目已过期，需复核或删除: ${JSON.stringify(entry)}`);
    }
  }
}

if (problems.length > 0) {
  console.error('✗ Layout audit 映射守卫失败：');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`✓ Layout audit 映射守卫通过：${config.routes.length} 个路由，页面文件全覆盖，allow 条目 ${allow.entries?.length ?? 0}`);
