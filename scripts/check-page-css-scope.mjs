#!/usr/bin/env node
/**
 * B 类守卫（2026-11-13 I02p 事故）：页面 CSS 作用域基线。
 *
 * 每个登记的页面 CSS，其新增顶层选择器必须以页面根类开头
 * （如 `.person-details .section-header`），否则随全局 CSS 常驻会与其它
 * 页面同名类互踩。存量未作用域选择器冻结在
 * scripts/lib/page-css-scope-baseline.json；新增未作用域选择器即红。
 *
 * 已登记页面（逐步扩表）：
 *   People / PersonDetails / Dashboard / Assignments / Locations / Iterations
 * 未登记页面由 A 类重复类守卫兜底；新页面接入时在 PAGE_ROOTS 增加根类并
 * 运行 --write-baseline 冻结存量。
 *
 * 用法：
 *   node scripts/check-page-css-scope.mjs
 *   node scripts/check-page-css-scope.mjs --write-baseline
 *   node scripts/check-page-css-scope.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(root, 'scripts/lib/page-css-scope-baseline.json');

/** 页面 CSS → 允许的作用域根类（selector 必须以 `.<root>` 开头） */
export const PAGE_ROOTS = {
  'client/src/pages/People.css': ['.people-page'],
  'client/src/pages/PersonDetails.css': ['.person-details'],
  'client/src/pages/Dashboard.css': ['.dashboard-page'],
  'client/src/pages/Assignments.css': ['.assignments-page'],
  'client/src/pages/Locations.css': ['.locations-page'],
  'client/src/pages/Iterations.css': ['.iterations-page'],
};

/** 尚未接入页面根类作用域的存量页面（冻结；新页面必须登记 PAGE_ROOTS） */
export const LEGACY_UNSCOPED_PAGES = new Set([
  'client/src/pages/AuditLog.css',
  'client/src/pages/Import.css',
  'client/src/pages/IntakeInbox.css',
  'client/src/pages/ProjectDetail.css',
  'client/src/pages/ProjectRoadmap.css',
  'client/src/pages/Projects.css',
  'client/src/pages/ProjectTypeDetails.css',
  'client/src/pages/ProjectTypes.css',
  'client/src/pages/Roles.css',
  'client/src/pages/Scenarios.css',
]);

function stripCssComments(text) {
  return String(text).replace(/\/\*[\s\S]*?\*\//g, '');
}

export function collectPageSelectors(files) {
  const byFile = new Map();
  for (const { rel, text } of files) {
    const selectors = new Set();
    const clean = stripCssComments(text);
    for (const m of clean.matchAll(/([^{}]+)\{/g)) {
      const selector = m[1].trim();
      if (!selector || selector.startsWith('@')) continue;
      for (const raw of selector.split(',')) {
        const item = raw.replace(/\s+/g, ' ').trim();
        if (item) selectors.add(item);
      }
    }
    byFile.set(rel, selectors);
  }
  return byFile;
}

function isScoped(selector, roots) {
  return roots.some((rootClass) =>
    new RegExp(`^${rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s.:#\\[])`).test(selector)
  );
}

export function classifyPageScope(current, roots = PAGE_ROOTS, baseline = {}) {
  const errors = [];
  for (const [rel, selectors] of current) {
    const allowedRoots = roots[rel];
    if (!allowedRoots) continue;
    const frozen = new Set(baseline[rel] ?? []);
    for (const selector of selectors) {
      if (isScoped(selector, allowedRoots)) continue;
      if (frozen.has(selector)) continue;
      errors.push(`${rel}: 新增未作用域选择器「${selector}」——请写成 ${allowedRoots[0]} ${selector} 或唯一类名`);
    }
  }
  return errors;
}

function loadPageFiles() {
  const files = [];
  for (const rel of Object.keys(PAGE_ROOTS)) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) files.push({ rel, text: fs.readFileSync(abs, 'utf8') });
  }
  return files;
}

function selfTest() {
  let pass = 0;
  const total = 4;
  const roots = { 'a.css': ['.a-page'] };
  const current = new Map([
    ['a.css', new Set(['.a-page .title', '.legacy', '.legacy', '.new-unscoped'])],
  ]);
  const errors = classifyPageScope(current, roots, { 'a.css': ['.legacy'] });
  if (errors.length === 1 && errors[0].includes('.new-unscoped')) pass++;
  else console.error('SELF_TEST 1 失败: 新未作用域选择器未拦', errors);
  const ok = classifyPageScope(new Map([['a.css', new Set(['.a-page .title', '.legacy'])]]), roots, { 'a.css': ['.legacy'] });
  if (ok.length === 0) pass++;
  else console.error('SELF_TEST 2 失败: 合法作用域/基线误报', ok);
  const noRoot = classifyPageScope(new Map([['b.css', new Set(['.x'])]]), roots, {});
  if (noRoot.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 未登记文件不应报错', noRoot);
  const composedRoot = classifyPageScope(new Map([['a.css', new Set(['.a-page.title', '.a-page:hover'])]]), roots, {});
  if (composedRoot.length === 0) pass++;
  else console.error('SELF_TEST 4 失败: 根类复合选择器误报', composedRoot);
  console.log(`SELF_TEST check-page-css-scope: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-page-css-scope.mjs')) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  const current = collectPageSelectors(loadPageFiles());
  if (process.argv.includes('--write-baseline')) {
    const out = {};
    for (const [rel, selectors] of [...current.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out[rel] = [...selectors].sort();
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n');
    console.log(`✓ baseline written: ${Object.keys(out).length} page CSS files`);
    process.exit(0);
  }

  const baseline = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const errors = classifyPageScope(current, PAGE_ROOTS, baseline);
  const pageCss = fs
    .readdirSync(path.join(root, 'client/src/pages'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => `client/src/pages/${name}`);
  for (const rel of pageCss) {
    if (!PAGE_ROOTS[rel] && !LEGACY_UNSCOPED_PAGES.has(rel)) {
      errors.push(`${rel}: 新页面 CSS 未登记页面根类（PAGE_ROOTS）——请先加根类并建立作用域，再 --write-baseline`);
    }
  }
  if (errors.length) {
    console.error('✗ Page CSS scope guard: 新增未作用域选择器（全局常驻 CSS 会跨页泄漏）：');
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log(`✓ Page CSS scope guard: ${current.size} 个页面无新增未作用域选择器`);
}
