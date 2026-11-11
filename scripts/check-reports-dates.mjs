#!/usr/bin/env node
/**
 * G3 reports 日期序列化守卫（I01v，EXP-B02；交付评审 F3 补齐）。
 *
 * 事故族：R05/toISOString 的 UTC 位移让本地零点倒退一天（报告月桶边界
 * 2027-01-01→2026-12-31 实测=BR-F04）。修复批已把 reports 服务全部裸写
 * 收敛到 toISODateLocal；本守卫防止回潮。
 *
 * 断言：src/server/services/reports/**.ts 不得出现 `toISOString().split('T')[0]`
 * ——日期串必须走 toISODateLocal/storedDateToIso 统一原语。
 * 守卫强度限制（EXP-B04 同式）：仅该目录、仅该写法（split 前可含空白/引号
 * 变体）；其他目录同类写法不在本守卫范围（按需另立）。
 *
 * 用法：
 *   node scripts/check-reports-dates.mjs              # 检查（pre-commit 聚合内）
 *   node scripts/check-reports-dates.mjs --self-test  # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = path.join(root, 'src/server/services/reports');

/** 剥离注释（块注释保行号；行注释遮蔽同行） */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** 命中：toISOString() 后紧跟 .split('T')[0]（允许空白与引号变体） */
export function scanBareIsoDates(source) {
  const stripped = stripComments(source);
  const hits = [];
  const re = /toISOString\(\)\s*\.\s*split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/g;
  let m;
  while ((m = re.exec(stripped))) {
    hits.push({
      line: stripped.slice(0, m.index).split('\n').length,
      snippet: stripped.slice(m.index, m.index + 60).split('\n')[0],
    });
  }
  return hits;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(p, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

function selfTest() {
  let pass = 0;
  const total = 4;
  // 1. 裸写 → 红
  const bad = scanBareIsoDates("const d = new Date().toISOString().split('T')[0];");
  if (bad.length === 1 && bad[0].line === 1) pass++;
  else console.error('SELF_TEST 1 失败: 裸写未拦', bad);
  // 2. 注释内不误报
  const commented = scanBareIsoDates('/** 旧实现 new Date().toISOString().split(\'T\')[0] */\nconst x = 1;');
  if (commented.length === 0) pass++;
  else console.error('SELF_TEST 2 失败: 注释误报', commented);
  // 3. toISODateLocal 调用 → 绿
  const good = scanBareIsoDates('const d = toISODateLocal(new Date());');
  if (good.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 合法原语误报', good);
  // 4. 引号变体 → 红
  const variant = scanBareIsoDates('const d = x.toISOString().split("T")[0];');
  if (variant.length === 1) pass++;
  else console.error('SELF_TEST 4 失败: 双引号变体未拦', variant);
  console.log(`SELF_TEST check-reports-dates: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-reports-dates.mjs')) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const violations = [];
  for (const file of walk(REPORTS_DIR)) {
    for (const v of scanBareIsoDates(fs.readFileSync(file, 'utf8'))) {
      violations.push({ file: path.relative(root, file), ...v });
    }
  }
  if (violations.length) {
    console.error(`✗ G3 失败：reports 服务出现 toISOString().split('T')[0] 裸写（UTC 位移会倒退一天）：`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    process.exit(1);
  }
  console.log('✓ G3 通过：reports 服务零 toISOString().split 裸写（统一 toISODateLocal）');
}
