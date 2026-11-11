#!/usr/bin/env node
/**
 * INV-1 审计白名单守卫（I01v/D16，EXP-B07；评审 R1 两态形）。
 *
 * 事故：demand_intake 六处审计调用全被 isTableAudited 静默跳过（enhancedAuditMiddleware
 * :182-185 只打 debug 日志），设计稿 §4.4 的 INTAKE_* 承诺必然落空。
 *
 * 两态设计（评审 R1）：方案首版"全量断言 in-code 表名 ⊆ 白名单并集"落地即红——
 * 普查发现在编控制器另有 6 个表名不在任何白名单（project_actual_investments /
 * project_design_estimations / project_estimations / role_planners /
 * user_permissions / user_role_permissions，存量静默跳过）。守卫不得静默冻结
 * 活缺陷：
 *   - 主断言（门禁）：REQUIRED_TABLES（本批新增审计面）必须 ⊆ 白名单并集。
 *   - 普查报告（非门禁）：所有控制器审计表名中不在并集的条目逐条输出，
 *     供台账立 D 行裁决加白与否。
 *
 * 用法：
 *   node scripts/check-audit-whitelist.mjs              # 检查（pre-commit）
 *   node scripts/check-audit-whitelist.mjs --self-test  # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 本批新增审计面（新表接入审计时在此登记——登记即门禁） */
export const REQUIRED_TABLES = ['demand_intake'];

/** .env 行解析：AUDIT_ENABLED_TABLES=a,b,c  # 注释 */
export function parseEnvTables(content) {
  const m = content.match(/^AUDIT_ENABLED_TABLES=(.*)$/m);
  if (!m) return [];
  return m[1]
    .split('#')[0]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** config/index.ts 默认数组解析：enabledTables: getEnvList('AUDIT_ENABLED_TABLES', [...]) */
export function parseConfigDefault(content) {
  const m = content.match(
    /enabledTables:\s*getEnvList\(\s*'AUDIT_ENABLED_TABLES'\s*,\s*\[([^\]]*)\]/
  );
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** 控制器审计调用点表名：logAuditEvent?.('table', ...) / logAuditEvent('table', ...) */
export function scanAuditCalls(source) {
  const out = [];
  const re = /logAuditEvent\??\.?\(\s*'([a-z_]+)'/g;
  let m;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

/** 主断言 + 普查报告 */
export function evaluate({ whitelist, calls, required = REQUIRED_TABLES }) {
  const set = new Set(whitelist);
  const errors = required.filter((t) => !set.has(t));
  const census = [...new Set(calls)].filter((t) => !set.has(t)).sort();
  return { errors, census };
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

function readWhitelistUnion() {
  const union = new Set(parseConfigDefault(fs.readFileSync(path.join(root, 'src/server/config/index.ts'), 'utf8')));
  for (const f of fs.readdirSync(root)) {
    if (/^\.env(\..+)?$/.test(f) && !f.endsWith('.local')) {
      try {
        const tables = parseEnvTables(fs.readFileSync(path.join(root, f), 'utf8'));
        for (const t of tables) union.add(t);
      } catch {
        /* ignore unreadable */
      }
    }
  }
  return [...union];
}

function selfTest() {
  let pass = 0;
  const total = 4;
  // 1. .env 解析（含注释剥离）
  const env = parseEnvTables('AUDIT_ENABLED_TABLES=people, projects,demand_intake  # note');
  if (JSON.stringify(env) === JSON.stringify(['people', 'projects', 'demand_intake'])) pass++;
  else console.error('SELF_TEST 1 失败: env 解析', env);
  // 2. config 默认解析
  const cfg = parseConfigDefault(
    "enabledTables: getEnvList('AUDIT_ENABLED_TABLES', ['people', 'demand_intake']),"
  );
  if (JSON.stringify(cfg) === JSON.stringify(['people', 'demand_intake'])) pass++;
  else console.error('SELF_TEST 2 失败: config 解析', cfg);
  // 3. 调用点扫描 + 门禁：白名单缺 required → 红
  const calls = scanAuditCalls(
    "await logAuditEvent?.('demand_intake', id, 'INTAKE_CREATE'); logAuditEvent?.('role_planners', id, 'CREATE');"
  );
  const bad = evaluate({ whitelist: ['people'], calls, required: ['demand_intake'] });
  if (calls.length === 2 && bad.errors.includes('demand_intake') && bad.census.includes('role_planners')) pass++;
  else console.error('SELF_TEST 3 失败: 门禁/普查', { calls, bad });
  // 4. 真实仓库：REQUIRED 必须已 ⊆ 并集（漏接线即红）
  const real = evaluate({ whitelist: readWhitelistUnion(), calls: [], required: REQUIRED_TABLES });
  if (real.errors.length === 0) pass++;
  else console.error('SELF_TEST 4 失败: 真实白名单缺 required', real.errors);
  console.log(`SELF_TEST check-audit-whitelist: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-audit-whitelist.mjs')) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const whitelist = readWhitelistUnion();
  const files = walk(path.join(root, 'src/server'));
  const calls = [];
  for (const f of files) {
    const found = scanAuditCalls(fs.readFileSync(f, 'utf8'));
    if (found.length) calls.push(...found);
  }
  const { errors, census } = evaluate({ whitelist, calls });
  if (census.length) {
    console.log(`普查：在编控制器审计表名不在白名单并集（存量静默跳过，待台账 D 行裁决）：`);
    for (const t of census) console.log(`  - ${t}`);
  }
  if (errors.length) {
    console.error(`✗ INV-1 失败：新增审计表未入白名单并集：${errors.join(', ')}`);
    process.exit(1);
  }
  console.log(
    `✓ INV-1 通过：本批审计面 ⊆ 白名单并集（并集 ${whitelist.length} 表；存量普查违例 ${census.length} 条已报告）`
  );
}
