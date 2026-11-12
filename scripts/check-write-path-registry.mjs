#!/usr/bin/env node
/**
 * G-E 写点注册表守卫（I02a，D18 路线 B）。
 *
 * 背景：computed_start_date/computed_end_date 是「调度输入的派生缓存」。
 * 任何修改调度输入（阶段时间线 start/end、项目 aspiration、分配
 * assignment_date_mode/start/end/phase_id）的写路径都必须刷新受影响的
 * computed 行，否则读侧（利用率/缺口/看板）继续使用旧边界——P0 F1 的
 * 265% vs 145% 即此漂移（2026-10-22 起）。
 *
 * 静态断言（字面量启发式，与 G2 同强度口径）：
 *   1. 生产代码 update project_phases_timeline 且语句含 start_date/end_date：
 *      文件必须出现 recalculateForPhaseTimelineChange，或登记为豁免（插入
 *      新阶段/无既有分配的初始化路径）。
 *   2. 生产代码 update projects 且语句含 aspiration_start/aspiration_finish：
 *      文件必须出现 recalculateForProjectDateChange，或登记豁免。
 *   3. 生产代码写 scenario_project_assignments 的 computed_* 列：文件必须在
 *      COMPUTED_WRITERS 白名单（写路径原语/刷新服务/复制合并保真）。
 *
 * 扫描不到的形状（raw SQL、别名表名、跨语句拼接）与 G2 相同，评审触及
 * 调度输入写点时人工核。
 *
 * 用法：
 *   node scripts/check-write-path-registry.mjs              # 检查（pre-commit）
 *   node scripts/check-write-path-registry.mjs --self-test  # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PHASE_REFRESH = 'recalculateForPhaseTimelineChange';
const PROJECT_REFRESH = 'recalculateForProjectDateChange';

/** 已接线的调度输入写点（必须同时出现对应刷新调用） */
export const REFRESH_WIRED = new Map([
  [
    'src/server/api/controllers/ProjectPhasesController.ts',
    'update/bulkUpdate 同事务刷新 phase 模式分配；delete 有 409 引用护栏',
  ],
  [
    'src/server/api/controllers/ProjectsController.ts',
    'update 的 aspiration 变化同事务刷新 project 模式分配；custom phase 端点委托已接线服务',
  ],
  [
    'src/server/services/CustomPhaseManagementService.ts',
    'add/update phase 同事务刷新被移动阶段的分配；delete 有引用护栏',
  ],
  [
    'src/server/services/ProjectPhaseCascadeService.ts',
    'cascade/updateProjectPhases 同事务刷新受影响阶段分配',
  ],
]);

/**
 * 豁免写点：写入的调度输入不可能已有引用分配（新建/初始化），或写入的是
 * 场景拷贝（scenario_projects 与全局 projects 分离）。理由必须说明为什么
 * 不存在需要刷新的引用行。
 */
export const EXEMPT = new Map([
  [
    'src/server/services/projects/phaseInheritance.ts',
    '新建项目时初始化阶段时间线（insert），此刻尚无任何分配行',
  ],
  [
    'src/server/services/import/ExcelImporterV2.ts',
    '导入新建项目/阶段时间线（insert），分配随导入新装',
  ],
  [
    'src/server/services/intake/IntakeConversionService.ts',
    '需求转项目：新项目/阶段初始化（insert），无既有分配',
  ],
  [
    'src/server/services/import/clearTables.ts',
    '清库/恢复前删除，之后由导入链路重建，无存量引用',
  ],
  [
    'src/server/services/git/ScenarioExporter.ts',
    'git 快照恢复：整库级 restore 后由快照自带 computed 值，非增量写',
  ],
]);

/** computed_* 列写点白名单（每处都必须能说明 computed 来源） */
export const COMPUTED_WRITERS = new Map([
  [
    'src/server/api/controllers/AssignmentsController.ts',
    '分配创建/更新/批量写路径：经 calc/assignmentDates 原语计算后落库',
  ],
  [
    'src/server/services/AssignmentRecalculationService.ts',
    '刷新服务：调度输入变化后重算 computed',
  ],
  [
    'src/server/api/controllers/ScenariosController.ts',
    '场景分支/合并：按源行事实复制 computed（快照保真，不重算）',
  ],
  [
    'src/server/services/import/ExcelImporterV2.ts',
    'Excel 导入新装 fixed 模式分配：computed 直接取导入起止（无既有行可漂移）',
  ],
]);

const INPUT_TARGETS = [
  {
    table: 'project_phases_timeline',
    fields: ['start_date', 'end_date'],
    refresh: PHASE_REFRESH,
    label: 'project_phases_timeline',
  },
  {
    table: 'projects',
    fields: ['aspiration_start', 'aspiration_finish'],
    refresh: PROJECT_REFRESH,
    label: 'projects',
  },
];

function statementAt(source, index) {
  const tail = source.slice(index, index + 1200);
  return tail.split(/;\s*\n/)[0];
}

function containsAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * 扫描单文件：
 * - inputWrites: [{table, line}] update 语句命中调度输入列
 * - computedWrites: [{line}] 写 scenario_project_assignments 的 computed_*
 */
export function scanSchedulingWrites(source) {
  const inputWrites = [];
  const computedWrites = [];

  for (const target of INPUT_TARGETS) {
    const callRe = new RegExp(
      `\\b(?:this\\.)?(?:db|trx|knex|conn|connection)\\(\\s*'${target.table}'\\s*\\)`,
      'g'
    );
    let m;
    while ((m = callRe.exec(source))) {
      const stmt = statementAt(source, m.index);
      if (!/\.update\s*\(/.test(stmt)) continue;
      if (!containsAny(stmt, target.fields)) continue;
      inputWrites.push({
        table: target.label,
        line: source.slice(0, m.index).split('\n').length,
      });
    }
  }

  const computedRe =
    /\b(?:this\.)?(?:db|trx|knex|conn|connection)\(\s*'scenario_project_assignments'\s*\)/g;
  let c;
  while ((c = computedRe.exec(source))) {
    const stmt = statementAt(source, c.index);
    if (!/\.(?:update|insert)\s*\(/.test(stmt)) continue;
    if (!containsAny(stmt, ['computed_start_date', 'computed_end_date'])) continue;
    computedWrites.push({ line: source.slice(0, c.index).split('\n').length });
  }

  return { inputWrites, computedWrites };
}

export function classifyFile({
  relPath,
  source,
  wired = REFRESH_WIRED,
  exempt = EXEMPT,
  computedWriters = COMPUTED_WRITERS,
}) {
  const { inputWrites, computedWrites } = scanSchedulingWrites(source);
  const errors = [];

  if (inputWrites.length > 0 && !exempt.has(relPath)) {
    if (!wired.has(relPath)) {
      errors.push({
        kind: 'unregistered-input-write',
        file: relPath,
        line: inputWrites[0].line,
        message: '修改调度输入但未登记刷新接线/豁免',
      });
    } else {
      const refresh = inputWrites[0].table === 'projects' ? PROJECT_REFRESH : PHASE_REFRESH;
      if (!source.includes(refresh)) {
        errors.push({
          kind: 'missing-refresh-call',
          file: relPath,
          line: inputWrites[0].line,
          message: `登记为接线但文件中找不到 ${refresh}`,
        });
      }
    }
  }

  if (computedWrites.length > 0 && !computedWriters.has(relPath)) {
    errors.push({
      kind: 'unregistered-computed-write',
      file: relPath,
      line: computedWrites[0].line,
      message: '写 computed_* 但不在来源白名单',
    });
  }

  return errors;
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

  // 1. 未登记的阶段更新时间线 → 红
  const fixtureWired = new Map();
  const e1 = classifyFile({
    relPath: 'src/x/unregistered.ts',
    source: "await db('project_phases_timeline').where('id', 1).update({ start_date: '2026-01-01' });",
    wired: fixtureWired,
    exempt: new Map(),
    computedWriters: new Map(),
  });
  if (e1.length === 1 && e1[0].kind === 'unregistered-input-write') pass++;
  else console.error('SELF_TEST 1 失败: 未登记写点未拦', e1);

  // 2. 已登记但缺刷新调用 → 红
  const wiredMap = new Map([['src/x/wired.ts', 'fixture']]);
  const e2 = classifyFile({
    relPath: 'src/x/wired.ts',
    source: "await trx('project_phases_timeline').where('id', 1).update({ end_date: '2026-02-01' });",
    wired: wiredMap,
    exempt: new Map(),
    computedWriters: new Map(),
  });
  if (e2.length === 1 && e2[0].kind === 'missing-refresh-call') pass++;
  else console.error('SELF_TEST 2 失败: 缺刷新未拦', e2);

  // 3. 已登记且带刷新调用 → 绿
  const e3 = classifyFile({
    relPath: 'src/x/wired.ts',
    source:
      "await trx('project_phases_timeline').where('id', 1).update({ start_date: '2026-01-01' });\n" +
      'await service.recalculateForPhaseTimelineChange(projectId, [phaseId], { trx });',
    wired: wiredMap,
    exempt: new Map(),
    computedWriters: new Map(),
  });
  if (e3.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 正常接线误报', e3);

  // 4. 豁免文件 → 绿（insert 初始化路径本就不该扫为 update；这里给 update 也豁免）
  const exemptMap = new Map([['src/x/init.ts', 'new project init']]);
  const e4 = classifyFile({
    relPath: 'src/x/init.ts',
    source: "await conn('project_phases_timeline').insert({ start_date: '2026-01-01' });",
    wired: new Map(),
    exempt: exemptMap,
    computedWriters: new Map(),
  });
  if (e4.length === 0) pass++;
  else console.error('SELF_TEST 4 失败: 豁免/插入误报', e4);

  // 5. 未登记的 computed 写入 → 红
  const e5 = classifyFile({
    relPath: 'src/x/rogue.ts',
    source:
      "await db('scenario_project_assignments').where('id', 1).update({ computed_start_date: null });",
    wired: new Map(),
    exempt: new Map(),
    computedWriters: new Map(),
  });
  if (e5.length === 1 && e5[0].kind === 'unregistered-computed-write') pass++;
  else console.error('SELF_TEST 5 失败: computed 写点未拦', e5);

  console.log(`SELF_TEST check-write-path-registry: ${pass}/${total} 组通过`);
  return pass === total;
}

if (process.argv[1]?.endsWith('check-write-path-registry.mjs')) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const errors = [];
  for (const file of walk(path.join(root, 'src/server'))) {
    const rel = path.relative(root, file);
    errors.push(
      ...classifyFile({ relPath: rel, source: fs.readFileSync(file, 'utf8') })
    );
  }
  if (errors.length) {
    console.error('✗ G-E 失败：调度输入写点未接线/未登记（computed 会漂移）：');
    for (const e of errors) console.error(`  ${e.file}:${e.line}  [${e.kind}] ${e.message}`);
    process.exit(1);
  }
  console.log(
    `✓ G-E 通过：调度输入写点 ${REFRESH_WIRED.size} 接线 / ${EXEMPT.size} 豁免；computed 写点 ${COMPUTED_WRITERS.size} 白名单`
  );
}
