#!/usr/bin/env node
/**
 * A 类守卫（2026-11-13 I02p 事故）：跨文件重复 class 基线。
 *
 * 背景：People.css 遗留 `.insights-section .section-header h2` 等通用类规则，
 * 与 PersonDetails.css 同名类冲突；People.css 全局常驻后以更高特异度把
 * 浅色主题标题压成白字。现有 lint:ui 只检查已知共享类，覆盖不到页面级
 * 通用类，因此需要“新增重复即红”的通用防线。
 *
 * 策略：扫描 client/src 下全部 CSS 的顶层简单 class 选择器；当前重复清单
 * 冻结在 scripts/lib/css-duplicate-baseline.json。之后：
 *  - 新出现一个重复 class（不在基线）→ 红；
 *  - 已有重复 class 新增一个 owner 文件 → 红；
 *  - 清理重复（owner 减少）→ 绿。
 * 基线只冻结存量，不鼓励继续扩散；清理后可用 --write-baseline 缩表。
 *
 * 已知局限：只看顶层“简单 class”选择器（`.foo`/`.foo:hover`）；复合选择器
 * 由 B 类页面作用域守卫覆盖。
 *
 * 用法：
 *   node scripts/check-css-duplicates.mjs
 *   node scripts/check-css-duplicates.mjs --write-baseline
 *   node scripts/check-css-duplicates.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(root, 'scripts/lib/css-duplicate-baseline.json');

export function stripCssComments(text) {
  return String(text).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 提取顶层简单 class（返回 class -> Set(file)） */
export function collectClassOwners(files) {
  const owners = new Map();
  for (const { rel, text } of files) {
    const clean = stripCssComments(text);
    for (const m of clean.matchAll(/([^{}]+)\{/g)) {
      const selector = m[1].trim();
      if (!selector || selector.startsWith('@')) continue;
      for (const raw of selector.split(',')) {
        const item = raw.replace(/\s+/g, ' ').trim();
        const match = item.match(/^\.([A-Za-z0-9_-]+)(?::[-\w]+(?:\([^)]*\))?)*$/);
        if (!match) continue;
        const cls = match[1];
        if (!owners.has(cls)) owners.set(cls, new Set());
        owners.get(cls).add(rel);
      }
    }
  }
  return owners;
}

export function duplicateMap(owners) {
  return new Map(
    [...owners.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([cls, files]) => [cls, [...files].sort()])
  );
}

export function classifyDuplicates(current, baseline) {
  const errors = [];
  for (const [cls, files] of current) {
    const frozen = baseline[cls];
    if (!frozen) {
      errors.push(`新增跨文件重复 class .${cls}: ${files.join(', ')}`);
      continue;
    }
    for (const file of files) {
      if (!frozen.includes(file)) {
        errors.push(`.${cls} 新增 owner 文件 ${file}（基线 owner: ${frozen.join(', ')}）`);
      }
    }
  }
  return errors;
}

function loadCssFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      loadCssFiles(abs, acc);
    } else if (entry.name.endsWith('.css')) {
      acc.push({ rel: path.relative(root, abs).replaceAll('\\', '/'), text: fs.readFileSync(abs, 'utf8') });
    }
  }
  return acc;
}

function selfTest() {
  let pass = 0;
  const total = 4;
  const fixture = [
    { rel: 'a.css', text: '.dup { color: red } .only-a { color: blue }' },
    { rel: 'b.css', text: '.dup { color: green } .newdup { color: black }' },
    { rel: 'c.css', text: '.newdup { color: white }' },
  ];
  const owners = collectClassOwners(fixture);
  const dups = duplicateMap(owners);
  if (dups.get('dup')?.join(',') === 'a.css,b.css') pass++;
  else console.error('SELF_TEST 1 失败: 重复提取错误', [...dups]);
  const e1 = classifyDuplicates(dups, { dup: ['a.css', 'b.css'] });
  if (e1.length === 1 && e1[0].includes('.newdup')) pass++;
  else console.error('SELF_TEST 2 失败: 新重复未拦', e1);
  const e2 = classifyDuplicates(dups, { dup: ['a.css', 'b.css'], newdup: ['b.css', 'c.css'] });
  if (e2.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 基线内重复误报', e2);
  const e3 = classifyDuplicates(new Map([['dup', ['a.css', 'b.css', 'c.css']]]), { dup: ['a.css', 'b.css'] });
  if (e3.length === 1 && e3[0].includes('新增 owner')) pass++;
  else console.error('SELF_TEST 4 失败: 新增 owner 未拦', e3);
  console.log(`SELF_TEST check-css-duplicates: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-css-duplicates.mjs')) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  const current = duplicateMap(collectClassOwners(loadCssFiles(path.join(root, 'client/src'))));
  if (process.argv.includes('--write-baseline')) {
    const sorted = Object.fromEntries([...current.entries()].sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`✓ baseline written: ${Object.keys(sorted).length} duplicate classes`);
    process.exit(0);
  }

  const baseline = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const errors = classifyDuplicates(current, baseline);
  if (errors.length) {
    console.error('✗ CSS duplicate guard: 新增跨文件重复 class（会随路由全局泄漏）：');
    for (const error of errors) console.error(`  ${error}`);
    console.error('修复：把页面 CSS 选择器收敛到页面根类下（如 .person-details .section-header）或改用唯一类名；清理后运行 --write-baseline 缩表。');
    process.exit(1);
  }
  console.log(`✓ CSS duplicate guard: ${current.size} 个存量重复 class 均在基线内，无新增 owner`);
}
