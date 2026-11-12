#!/usr/bin/env node
/**
 * INV-2 / G4 数值读取缺省守卫（I01v，EXP-B05；评审 R2 双栏形）。
 *
 * 事故族（reproduced ×3+）：`field || 30` 吞显式 0 天模板（D17）、
 * `|| 100` 吞显式 0% 可用率（C09/BR-F03）、`|| 8` 吞显式 0 工时（BR-F07）。
 * 规则：生产代码禁止 `|| <非零数字字面量>` 未分类出现——null 才缺省（??），
 * 显式 0 是合法值。
 *
 * 双栏（评审 R2：守卫首版"仅参数缺省合法"与实况不符——非参数类活命中
 * 已修/挂账）：
 *   - LEGAL：参数缺省类（分页 parse、除数护栏、换算率兜底、HTTP 状态、
 *     maxCount 等）——语义上确实是"无值→默认"，逐条注理由。
 *   - FROZEN：存量缺陷冻结——必须引用台账行；销账条件写在理由里。
 * 未分类命中即红（新代码不允许静默落 ||）；冻结条目失效（代码已修）只提示
 * 清理，不拦。
 *
 * 扫描器剥离注释（块注释保行号）；已知局限：字符串字面量内的 `//`
 * （URL）会被当行注释——数字上下文罕见，评审触及处人工核（EXP-B04 同式）。
 *
 * 用法：
 *   node scripts/check-numeric-defaults.mjs              # 检查（pre-commit）
 *   node scripts/check-numeric-defaults.mjs --self-test  # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 合法参数缺省（key = 相对路径::|| 字面量） */
export const LEGAL = new Map([
  ['src/server/api/controllers/SimpleController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/SimpleController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/ProjectPhasesController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/ProjectPhasesController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/AvailabilityController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/AvailabilityController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/PeopleController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/PeopleController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/ResourceTemplatesController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/ResourceTemplatesController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/ProjectsController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/ProjectsController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/ProjectsController.ts::|| 500', 'loc_rate 换算率兜底（0=未配置，除零护栏）'],
  ['src/server/api/controllers/ImportController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/ImportController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/DemandController.ts::|| 6', 'forecast months 查询参数缺省'],
  ['src/server/api/controllers/AssignmentsController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/AssignmentsController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/ProjectTypesController.ts::|| 1', '分页 page 缺省'],
  ['src/server/api/controllers/ProjectTypesController.ts::|| 50', '分页 limit 缺省'],
  ['src/server/api/controllers/IterationsController.ts::|| 500', 'loc_rate 换算率兜底（0=未配置，除零护栏）'],
  ['src/server/services/git/GitRepositoryService.ts::|| 50', 'git log maxCount 参数缺省'],
  ['src/server/services/demand/DemandCalculationService.ts::|| 1', '除零护栏（分母缺省）'],
  ['src/server/services/audit/AuditService.ts::|| 50', '分页 limit 缺省'],
  ['src/server/services/intake/IntakeService.ts::|| 1', '分页 page 缺省'],
  ['src/server/services/intake/IntakeService.ts::|| 50', '分页 limit 缺省'],
  ['src/server/services/import/ImportError.ts::|| 1', '错误上下文行/列缺省（vscode 式位置）'],
  ['src/server/services/import/ExcelImporter.ts::|| 3', '导入文件 priority 解析缺省（0/空=未填→P3，优先级域无 0 档）'],
  ['src/server/services/import/ExcelImporterV2.ts::|| 3', '导入文件 priority 解析缺省（同上，V2 链路）'],
  ['src/server/middleware/enhancedErrorHandler.ts::|| 500', 'HTTP 状态码缺省'],
]);

/** 存量缺陷冻结（必须引用台账行；销账条件写理由）— I02a 后清零 */
export const FROZEN = new Map();

/** 剥离注释（块注释保行号；行注释遮蔽 `//` 之后同行内容） */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** 命中：{line, literal}；仅 || 非零数字字面量（||0 对数值≡??0 不扫） */
export function scanNumericFallbacks(source) {
  const stripped = stripComments(source);
  const hits = [];
  const re = /\|\|\s*([1-9][0-9]*)\b/g;
  let m;
  while ((m = re.exec(stripped))) {
    hits.push({
      line: stripped.slice(0, m.index).split('\n').length,
      literal: Number(m[1]),
      key: `|| ${Number(m[1])}`,
    });
  }
  return hits;
}

/** 分类：未分类→errors；冻结→frozen；合法→ok；失效冻结条目→stale */
export function classify({ hits, relPath, legal = LEGAL, frozen = FROZEN }) {
  const errors = [];
  const frozenHit = [];
  for (const h of hits) {
    const key = `${relPath}::${h.key}`;
    if (frozen.has(key)) {
      frozenHit.push({ ...h, key });
      continue;
    }
    if (legal.has(key)) continue;
    errors.push({ ...h, key });
  }
  const seen = new Set(hits.map((h) => `${relPath}::${h.key}`));
  const stale = [...frozen.keys()].filter((k) => k.startsWith(`${relPath}::`) && !seen.has(k));
  return { errors, frozenHit, stale };
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
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
  const total = 5;
  // 1. 未分类 ||30 → 红
  const hits = scanNumericFallbacks('const d = row.duration || 30;');
  const c1 = classify({ hits, relPath: 'src/x.ts' });
  if (hits.length === 1 && c1.errors.length === 1) pass++;
  else console.error('SELF_TEST 1 失败: 未分类未拦', { hits, c1 });
  // 2. 注释剥除（docblock 内 ||100 不命中）
  const commented = scanNumericFallbacks('/** 旧实现 `|| 100` 回退 */\nconst x = y;\n// tail || 30');
  if (commented.length === 0) pass++;
  else console.error('SELF_TEST 2 失败: 注释误报', commented);
  // 3. ||0 不扫（数值上 ≡??0）
  const zero = scanNumericFallbacks('const x = row.value || 0;');
  if (zero.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: ||0 误报', zero);
  // 4. 合法/冻结分类
  const legalMap = new Map([['src/a.ts::|| 50', 'pagination']]);
  const frozenMap = new Map([['src/b.ts::|| 30', 'frozen ref']]);
  const c4 = classify({
    hits: [
      { line: 1, literal: 50, key: '|| 50' },
      { line: 2, literal: 30, key: '|| 30' },
    ],
    relPath: 'src/a.ts',
    legal: legalMap,
    frozen: frozenMap,
  });
  if (c4.errors.length === 1 && c4.errors[0].key === 'src/a.ts::|| 30') pass++;
  else console.error('SELF_TEST 4 失败: 分类错误', c4);
  // 5. 失效冻结条目提示
  const c5 = classify({ hits: [], relPath: 'src/b.ts', legal: legalMap, frozen: frozenMap });
  if (c5.stale.length === 1) pass++;
  else console.error('SELF_TEST 5 失败: 失效条目未提示', c5);
  console.log(`SELF_TEST check-numeric-defaults: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-numeric-defaults.mjs')) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const errors = [];
  const frozenHits = [];
  const staleAll = [];
  for (const file of walk(path.join(root, 'src/server'))) {
    const rel = path.relative(root, file);
    const hits = scanNumericFallbacks(fs.readFileSync(file, 'utf8'));
    if (!hits.length) continue;
    const { errors: e, frozenHit, stale } = classify({ hits, relPath: rel });
    errors.push(...e.map((x) => ({ file: rel, ...x })));
    frozenHits.push(...frozenHit.map((x) => ({ file: rel, ...x })));
    staleAll.push(...stale);
  }
  if (frozenHits.length) {
    console.log(`冻结（存量缺陷，带台账引用）：`);
    for (const f of frozenHits) console.log(`  ${f.file}:${f.line}  ${FROZEN.get(f.key).split('（')[0]}`);
  }
  if (staleAll.length) {
    console.log(`提示：失效冻结条目（代码已修，可清理）：${staleAll.join(', ')}`);
  }
  if (errors.length) {
    console.error(`✗ INV-2 失败：未分类的 || 非零数字缺省（null→??，显式 0 是合法值）：`);
    for (const e of errors) console.error(`  ${e.file}:${e.line}  ${e.key}`);
    process.exit(1);
  }
  console.log(
    `✓ INV-2 通过：|| 非零数字命中全部归类（合法 ${LEGAL.size} / 冻结 ${FROZEN.size}）`
  );
}
