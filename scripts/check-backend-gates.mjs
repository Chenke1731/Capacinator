#!/usr/bin/env node
/**
 * 后端门禁聚合（I01v 批0 地基，评审 Q5）：一次调用四个守卫，pre-commit 单点。
 *   INV-1 check-audit-whitelist.mjs   审计表名 ⊆ 白名单并集 + 存量普查
 *   INV-4 check-audit-await.mjs      logAuditEvent 必 await（EXP-B08）
 *   G2    check-legacy-table-writes.mjs  旧表 project_assignments 禁写（EXP-B01）
 *   INV-2 check-numeric-defaults.mjs || 非零数字缺省归类（EXP-B05 双栏）
 *
 * SELF_TEST 不进 pre-commit（~秒级但非提交声明面），CI/手动用 --self-test。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selftest = process.argv.includes('--self-test');

const GATES = [
  ['INV-1', 'check-audit-whitelist.mjs'],
  ['INV-4', 'check-audit-await.mjs'],
  ['G2', 'check-legacy-table-writes.mjs'],
  ['G3', 'check-reports-dates.mjs'],
  ['INV-2', 'check-numeric-defaults.mjs'],
];

for (const [label, script] of GATES) {
  const args = [path.join(root, 'scripts', script)];
  if (selftest) args.push('--self-test');
  console.log(`── ${label} ${script}${selftest ? ' --self-test' : ''}`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`✗ 后端门禁失败：${label} ${script}`);
    process.exit(1);
  }
}
console.log(`✓ 后端门禁聚合通过（INV-1/INV-4/G2/G3/INV-2${selftest ? '，含 SELF_TEST' : ''}）`);
