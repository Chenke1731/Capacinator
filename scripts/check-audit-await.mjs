#!/usr/bin/env node
/**
 * INV-4 审计调用 await 守卫（I01v/F4，EXP-B08）。
 *
 * 事故：DemandIntakeController 7 处 logAuditEvent 未 await。中间件实现是
 * catch 后 rethrow——浮动 Promise 失败即 UnhandledRejection，dev/test 进程
 * exit(1)（探针实证）；createBatch 200 条=200 个浮动 Promise 放大面。
 *
 * 断言：src/server 生产中所有 `.logAuditEvent` 直接调用点前必须有 await。
 * 守卫强度限制（EXP-B04 同式注记）：只拦直接成员调用；`const f = req.logAuditEvent`
 * 别名后调用、`req['logAuditEvent']` 方括号访问、`logBulkAuditEvents` 均不在
 * 扫描面（现有 logBulk 调用点均 await，人工核）；评审触及审计接线时须核对。
 *
 * 用法：
 *   node scripts/check-audit-await.mjs              # 检查（pre-commit）
 *   node scripts/check-audit-await.mjs --self-test  # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 返回未 await 的调用点 [{line, snippet}] */
export function scanFloatingAuditCalls(source) {
  const violations = [];
  const callRe = /\.logAuditEvent\??\.\s*\(/g;
  let m;
  while ((m = callRe.exec(source))) {
    const before = source.slice(Math.max(0, m.index - 120), m.index);
    const awaited = /\bawait\s[^;]*$/.test(before);
    if (!awaited) {
      const line = source.slice(0, m.index).split('\n').length;
      const start = Math.max(0, m.index - 40);
      violations.push({
        line,
        snippet: source.slice(start, m.index + 30).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return violations;
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
  // 1. 浮动调用 → 红
  const bad = scanFloatingAuditCalls(
    "      (req as any).logAuditEvent?.('demand_intake', id, 'CREATE', undefined, row);"
  );
  if (bad.length === 1 && bad[0].line === 1) pass++;
  else console.error('SELF_TEST 1 失败: 浮动调用未拦', bad);
  // 2. await 调用 → 绿
  const good = scanFloatingAuditCalls(
    "      await (req as any).logAuditEvent?.('demand_intake', id, 'INTAKE_CREATE');"
  );
  if (good.length === 0) pass++;
  else console.error('SELF_TEST 2 失败: await 调用误报', good);
  // 3. 多行 await → 绿
  const multiline = scanFloatingAuditCalls(
    "      await (req as any).logAuditEvent?.(\n        'demand_intake', id, 'INTAKE_REJECT'\n      );"
  );
  if (multiline.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 多行 await 误报', multiline);
  // 4. 非调用成员访问（无括号）不误报
  const memberOnly = scanFloatingAuditCalls('      if ((req as any).logAuditEvent) {');
  if (memberOnly.length === 0) pass++;
  else console.error('SELF_TEST 4 失败: 成员访问误报', memberOnly);
  console.log(`SELF_TEST check-audit-await: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-audit-await.mjs')) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const violations = [];
  for (const file of walk(path.join(root, 'src/server'))) {
    for (const v of scanFloatingAuditCalls(fs.readFileSync(file, 'utf8'))) {
      violations.push({ file: path.relative(root, file), ...v });
    }
  }
  if (violations.length) {
    console.error(`✗ INV-4 失败：logAuditEvent 调用未 await（浮动 Promise 失败即进程退出）：`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    process.exit(1);
  }
  console.log('✓ INV-4 通过：所有 logAuditEvent 调用点均 await');
}
