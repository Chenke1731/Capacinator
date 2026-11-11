#!/usr/bin/env node
/**
 * G2 旧表写入守卫（I01v，EXP-B01；backend-review 场一 BR-F02）。
 *
 * 事故链（同族≥2）：①V2 导入曾写旧表 project_assignments（IP-05d 修）；
 * ②AssignmentRecalculationService 全服务读写旧表且零生产调用——运行时
 * 旧表 0 行，切片读侧完全不可见（BR-F02，D18 待裁决）。
 *
 * 断言：src/server 生产代码禁止对 `project_assignments` 的写操作
 * （insert/update/del/delete/increment/decrement）。
 * 白名单类别（EXP-B01 裁决）：迁移 / import / backup（restore）/ 工具端点，
 * 逐条挂理由；AssignmentRecalculationService 属冻结条目（D18 处置后销账）。
 *
 * 用法：
 *   node scripts/check-legacy-table-writes.mjs              # 检查（pre-commit）
 *   node scripts/check-legacy-table-writes.mjs --self-test  # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 白名单（相对仓库根）：理由必须指向裁决/台账行；冻结条目须带销账条件 */
export const ALLOWLIST = new Map([
  [
    'src/server/services/AssignmentRecalculationService.ts',
    '冻结（D18 待裁决）：BR-F02 死服务零生产调用但读写旧表；处置裁决后销账',
  ],
  [
    'src/server/api/controllers/AssignmentsController.ts',
    '工具端点 deleteTestData：仅清理 Test_ 前缀夹具行的 .del()（非业务写路径）',
  ],
  [
    'src/server/services/git/ScenarioExporter.ts',
    'git 备份/恢复 legacy 链路：还原时机先清空再 batchInsert 旧表（EXP-B01 白名单类别 backup/restore）',
  ],
  [
    'src/server/services/lifecycle/LifecycleService.ts',
    '生命周期 pause/release 对旧表保持并行兼容写（主写 spa；旧表运行时 0 行，双写为 legacy 兼容，随旧表退役销账）',
  ],
]);

/**
 * 扫描旧表写点：`db|trx|knex|conn|connection('project_assignments')` 起，截到语句
 * 结束（分号）或 400 字符内出现写方法名即命中。读操作（select/where/first/…）
 * 不命中。启发式局限：写方法若在更远链尾（>400 字符）会漏——评审触及旧表
 * 读写时人工核对（EXP-B04 同式强度注记）。
 */
export function scanLegacyWrites(source) {
  const violations = [];
  const callRe = /\b(?:this\.)?(?:db|trx|knex|conn|connection)\(\s*'project_assignments'\s*\)/g;
  const writeRe = /\.(insert|update|del|delete|increment|decrement)\s*\(/;
  let m;
  while ((m = callRe.exec(source))) {
    const tail = source.slice(m.index, m.index + 400);
    const stmt = tail.split(/;\s*\n/)[0];
    if (writeRe.test(stmt)) {
      violations.push({
        line: source.slice(0, m.index).split('\n').length,
        snippet: stmt.replace(/\s+/g, ' ').slice(0, 120).trim(),
      });
    }
  }
  return violations;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 白名单类别=迁移/seed/import/backup：迁移与种子目录整类豁免（EXP-B01）
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      if (entry.name === 'migrations' || entry.name === 'seeds') continue;
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
  // 1. 直接写 → 命中
  const w = scanLegacyWrites("await trx('project_assignments').where('id', id).update({ a: 1 });");
  if (w.length === 1 && w[0].line === 1) pass++;
  else console.error('SELF_TEST 1 失败: update 未命中', w);
  // 2. 读操作 → 不命中
  const r = scanLegacyWrites("const rows = await this.db('project_assignments').select('*');");
  if (r.length === 0) pass++;
  else console.error('SELF_TEST 2 失败: 读误报', r);
  // 3. 新表（scenario_project_assignments）→ 不命中
  const s = scanLegacyWrites("await db('scenario_project_assignments').insert({ id: 1 });");
  if (s.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 新表误报', s);
  // 4. 白名单文件 → 豁免；同内容放在非白名单路径 → 红（由调用方按路径豁免，此处验证扫描本体稳定）
  const allowed = scanLegacyWrites("await trx('project_assignments').del();");
  if (allowed.length === 1 && ALLOWLIST.has('src/server/services/AssignmentRecalculationService.ts')) pass++;
  else console.error('SELF_TEST 4 失败: del 未命中或白名单缺失', allowed);
  console.log(`SELF_TEST check-legacy-table-writes: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-legacy-table-writes.mjs')) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const violations = [];
  for (const file of walk(path.join(root, 'src/server'))) {
    const rel = path.relative(root, file);
    if (ALLOWLIST.has(rel)) continue;
    for (const v of scanLegacyWrites(fs.readFileSync(file, 'utf8'))) {
      violations.push({ file: rel, ...v });
    }
  }
  if (violations.length) {
    console.error(`✗ G2 失败：生产代码写旧表 project_assignments（运行时 0 行，切片读侧不可见）：`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    process.exit(1);
  }
  console.log(
    `✓ G2 通过：旧表零未授权写点（白名单 ${ALLOWLIST.size} 条：冻结 1=AssignmentRecalculationService/D18、工具 1、备份 1、生命周期兼容双写 1；迁移/seed 目录整类豁免）`
  );
}
