#!/usr/bin/env node
/**
 * G-E 写点注册表守卫（I02a，D18 路线 B；I02j 返修强化）。
 *
 * 背景：computed_start_date/computed_end_date 是「调度输入的派生缓存」。
 * 任何修改调度输入（阶段时间线 start/end、项目 aspiration、分配
 * assignment_date_mode/start/end/phase_id）的写路径都必须刷新受影响的
 * computed 行，否则读侧（利用率/缺口/看板）继续使用旧边界——P0 F1 的
 * 265% vs 145% 即此漂移（2026-10-22 起）。
 *
 * 静态断言（字面量启发式，与 G2 同强度口径）：
 *   1. 生产代码 update project_phases_timeline 且语句含 start_date/end_date，
 *      或 update projects 且语句含 aspiration_start/aspiration_finish：
 *      写点之后 REFRESH_WINDOW_LINES 行内必须出现对应刷新调用，否则红。
 *      spread 形态（`update({ ...payload })`）在写点前 120 行内出现调度
 *      字段名时同样视为敏感写点（防 P2-1 的"文件级 includes 假阴性"）。
 *   2. project_phases_timeline 的 del/delete 必须登记在 DELETE_GUARDED
 *      （Q1 引用护栏或清库/恢复路径），否则红。
 *   3. scenario_project_assignments 的 computed_* 写点（含 insert，以及
 *      带 spread 的 update/insert）必须登记在 COMPUTED_WRITERS。
 *   4. REFRESH_WIRED / EXEMPT / DELETE_GUARDED 条目必须在扫描中真实命中，
 *      否则报"惰性条目"红——登记表不养死条目（EXP-B12 同族）。
 *
 * 扫描不到的形状（raw SQL、别名表名、动态表名、跨语句拼接）与 G2 相同，
 * 评审触及调度输入写点时人工核。
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
const REFRESH_WINDOW_LINES = 120;
const LOOKBACK_CHARS = 1500;

/** 已接线的调度输入写点（文件中必须真实命中写点，且每个敏感写点附近有刷新调用） */
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
    'src/server/services/git/ScenarioExporter.ts',
    'git 快照恢复：整库级 restore 后由快照自带 computed 值，非增量写',
  ],
]);

/** project_phases_timeline 删除点：必须有引用护栏或属清库/恢复路径 */
export const DELETE_GUARDED = new Map([
  [
    'src/server/api/controllers/ProjectPhasesController.ts',
    'delete 前统计 phase 模式分配引用，409 阻止（Q1）',
  ],
  [
    'src/server/services/CustomPhaseManagementService.ts',
    'deletePhase 前统计 phase 模式分配引用，阻止删除（Q1）',
  ],
  [
    'src/server/api/controllers/TestDataController.ts',
    'e2e/测试数据清理端点：只删 Test_ 前缀项目的阶段，非业务写路径',
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
  const tail = source.slice(index, index + 1500);
  return tail.split(/;\s*\n/)[0];
}

/** 剥离注释（保留行号/字符位）：注释里提到刷新调用不算接线。
 *  状态机而非正则——源码字符串/注释里出现 `//`、`/*`（如
 *  `POST /projects/:id/lifecycle/*`）时，正则会把后续代码整段吞掉。 */
export function stripComments(source) {
  const out = source.split('');
  let state = 'code';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '*') {
        out[i] = ' ';
        out[i + 1] = ' ';
        state = 'block';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        state = 'line';
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        state = ch;
      }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        state = 'code';
        i += 2;
        continue;
      }
      if (ch !== '\n') out[i] = ' ';
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') {
        state = 'code';
        i += 1;
        continue;
      }
      out[i] = ' ';
      i += 1;
      continue;
    }
    // 字符串态：保留内容（避免把字符串里的 // 当注释），处理转义
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === state) {
      state = 'code';
    }
    i += 1;
  }
  return out.join('');
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function containsAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

/** 敏感 spread：写点前 LOOKBACK_CHARS 内出现调度字段名（或已知载荷变量） */
function hasSchedulingContext(source, index) {
  const lookback = source.slice(Math.max(0, index - LOOKBACK_CHARS), index);
  return containsAny(lookback, [
    'start_date',
    'end_date',
    'aspiration_start',
    'aspiration_finish',
    'timelineUpdateData',
    'sanitizedData',
  ]);
}

/** 刷新调用是否在写点之后 REFRESH_WINDOW_LINES 行内 */
function hasRefreshWithinWindow(source, index, refresh) {
  const writeLine = lineOf(source, index);
  let from = index;
  while (from < source.length) {
    const found = source.indexOf(refresh, from);
    if (found < 0) return false;
    const distance = lineOf(source, found) - writeLine;
    if (distance < 0) {
      from = found + refresh.length;
      continue;
    }
    return distance <= REFRESH_WINDOW_LINES;
  }
  return false;
}

/**
 * 扫描单文件：
 * - inputWrites: [{table, line, kind}] 敏感 update（literal/spread）
 * - inserts: [{table, line}] 目标表 insert（用于惰性条目核验）
 * - deletes: [{line, table}]
 * - computedWrites: [{line, kind}]
 */
export function scanSchedulingWrites(source) {
  const inputWrites = [];
  const inserts = [];
  const deletes = [];
  const computedWrites = [];

  for (const target of INPUT_TARGETS) {
    const callRe = new RegExp(
      `\\b(?:this\\.)?(?:db|trx|knex|conn|connection)\\(\\s*'${target.table}'\\s*\\)`,
      'g'
    );
    let m;
    while ((m = callRe.exec(source))) {
      const stmt = statementAt(source, m.index);
      const line = lineOf(source, m.index);
      if (/\.insert\s*\(/.test(stmt)) {
        inserts.push({ table: target.label, line });
        continue;
      }
      if (/\.(del|delete)\s*\(/.test(stmt)) {
        deletes.push({ table: target.label, line });
        continue;
      }
      if (!/\.update\s*\(/.test(stmt)) continue;
      const literal = containsAny(stmt, target.fields);
      const spread =
        /\.update\s*\(\s*\{[\s\S]*?\.\.\./.test(stmt) ||
        /\.update\s*\(\s*[A-Za-z_$][\w$]*\s*\)/.test(stmt);
      if (literal) {
        inputWrites.push({ table: target.label, line, kind: 'literal' });
      } else if (spread && hasSchedulingContext(source, m.index)) {
        inputWrites.push({ table: target.label, line, kind: 'spread' });
      }
    }
  }

  const computedRe =
    /\b(?:this\.)?(?:db|trx|knex|conn|connection)\(\s*'scenario_project_assignments'\s*\)/g;
  let c;
  while ((c = computedRe.exec(source))) {
    const stmt = statementAt(source, c.index);
    if (!/\.(?:update|insert)\s*\(/.test(stmt)) continue;
    const literal = containsAny(stmt, ['computed_start_date', 'computed_end_date']);
    const spread = /\.(?:update|insert)\s*\(\s*\{[\s\S]*?\.\.\./.test(stmt);
    if (literal || spread) {
      computedWrites.push({ line: lineOf(source, c.index), kind: literal ? 'literal' : 'spread' });
    }
  }

  return { inputWrites, inserts, deletes, computedWrites };
}

export function classifyFile({
  relPath,
  source,
  wired = REFRESH_WIRED,
  exempt = EXEMPT,
  deletes = DELETE_GUARDED,
  computedWriters = COMPUTED_WRITERS,
}) {
  const code = stripComments(source);
  const scan = scanSchedulingWrites(code);
  const errors = [];

  // 1) 敏感写点：逐点要求刷新调用在窗口内
  for (const write of scan.inputWrites) {
    if (exempt.has(relPath)) continue; // 豁免文件（insert-only 初始化）不要求刷新
    if (!wired.has(relPath)) {
      errors.push({
        kind: 'unregistered-input-write',
        file: relPath,
        line: write.line,
        message: `${write.table} 敏感 ${write.kind} 写点未登记刷新接线/豁免`,
      });
      continue;
    }
    const refresh = write.table === 'projects' ? PROJECT_REFRESH : PHASE_REFRESH;
    const writeIndex = code.split('\n').slice(0, write.line - 1).join('\n').length;
    if (!hasRefreshWithinWindow(code, writeIndex, refresh)) {
      errors.push({
        kind: 'missing-refresh-call',
        file: relPath,
        line: write.line,
        message: `写点后 ${REFRESH_WINDOW_LINES} 行内找不到 ${refresh}`,
      });
    }
  }

  // 2) 时间线删除点
  for (const del of scan.deletes) {
    if (del.table !== 'project_phases_timeline') continue;
    if (!deletes.has(relPath)) {
      errors.push({
        kind: 'unregistered-timeline-delete',
        file: relPath,
        line: del.line,
        message: '删除阶段时间线未登记引用护栏/清库路径',
      });
    }
  }

  // 3) computed 写点
  for (const write of scan.computedWrites) {
    if (!computedWriters.has(relPath)) {
      errors.push({
        kind: 'unregistered-computed-write',
        file: relPath,
        line: write.line,
        message: `${write.kind} 写 computed_* 但不在来源白名单`,
      });
    }
  }

  // 4) 惰性条目：登记表必须被真实写点命中
  const fileHasAnyWrite =
    scan.inputWrites.length > 0 || scan.inserts.length > 0 || scan.deletes.length > 0;
  if (wired.has(relPath) && scan.inputWrites.length === 0) {
    errors.push({
      kind: 'stale-wired-entry',
      file: relPath,
      line: 1,
      message: '登记为刷新接线但扫描不到任何敏感 update 写点',
    });
  }
  if (exempt.has(relPath) && !fileHasAnyWrite) {
    errors.push({
      kind: 'stale-exempt-entry',
      file: relPath,
      line: 1,
      message: '登记为豁免但扫描不到任何目标表写点',
    });
  }
  if (
    deletes.has(relPath) &&
    !scan.deletes.some((d) => d.table === 'project_phases_timeline')
  ) {
    errors.push({
      kind: 'stale-delete-entry',
      file: relPath,
      line: 1,
      message: '登记为删除护栏但扫描不到 project_phases_timeline 删除点',
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
  const total = 7;

  // 1. 未登记的阶段更新时间线 → 红
  const e1 = classifyFile({
    relPath: 'src/x/unregistered.ts',
    source: "await db('project_phases_timeline').where('id', 1).update({ start_date: '2026-01-01' });",
    wired: new Map(),
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  if (e1.some((e) => e.kind === 'unregistered-input-write')) pass++;
  else console.error('SELF_TEST 1 失败: 未登记写点未拦', e1);

  // 2. 已登记但写点后无刷新调用 → 红
  const wiredMap = new Map([['src/x/wired.ts', 'fixture']]);
  const e2 = classifyFile({
    relPath: 'src/x/wired.ts',
    source: "await trx('project_phases_timeline').where('id', 1).update({ end_date: '2026-02-01' });",
    wired: wiredMap,
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  if (e2.some((e) => e.kind === 'missing-refresh-call')) pass++;
  else console.error('SELF_TEST 2 失败: 缺刷新未拦', e2);

  // 3. 已登记且刷新紧随写点 → 绿
  const e3 = classifyFile({
    relPath: 'src/x/wired.ts',
    source:
      "await trx('project_phases_timeline').where('id', 1).update({ start_date: '2026-01-01' });\n" +
      'await service.recalculateForPhaseTimelineChange(projectId, [phaseId], { trx });',
    wired: wiredMap,
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  if (e3.length === 0) pass++;
  else console.error('SELF_TEST 3 失败: 正常接线误报', e3);

  // 4. 豁免机制：空豁免表红；登记豁免绿
  const e4a = classifyFile({
    relPath: 'src/x/init.ts',
    source: "await conn('project_phases_timeline').where('id', 1).update({ start_date: '2026-01-01' });",
    wired: new Map(),
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  const e4b = classifyFile({
    relPath: 'src/x/init.ts',
    source: "await conn('project_phases_timeline').where('id', 1).update({ start_date: '2026-01-01' });",
    wired: new Map(),
    exempt: new Map([['src/x/init.ts', 'fixture init']]),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  if (e4a.length > 0 && e4b.length === 0) pass++;
  else console.error('SELF_TEST 4 失败: 豁免机制未验证', { e4a, e4b });

  // 5. 未登记的 computed spread 写入 → 红
  const e5 = classifyFile({
    relPath: 'src/x/rogue.ts',
    source:
      "await db('scenario_project_assignments').where('id', 1).update({ ...patch });",
    wired: new Map(),
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  if (e5.some((e) => e.kind === 'unregistered-computed-write')) pass++;
  else console.error('SELF_TEST 5 失败: computed spread 写点未拦', e5);

  // 6. 未登记的时间线删除 → 红；登记后绿
  const delSource = "await trx('project_phases_timeline').where('id', 1).del();";
  const e6a = classifyFile({
    relPath: 'src/x/del.ts',
    source: delSource,
    wired: new Map(),
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  const e6b = classifyFile({
    relPath: 'src/x/del.ts',
    source: delSource,
    wired: new Map(),
    exempt: new Map(),
    deletes: new Map([['src/x/del.ts', 'fixture guard']]),
    computedWriters: new Map(),
  });
  if (e6a.some((e) => e.kind === 'unregistered-timeline-delete') && e6b.length === 0) pass++;
  else console.error('SELF_TEST 6 失败: 删除护栏未验证', { e6a, e6b });

  // 7. spread update 的敏感上下文：近处有调度字段 → 要求刷新；无字段 → 不敏感
  const e7a = classifyFile({
    relPath: 'src/x/spread.ts',
    source:
      "const patch = { start_date: '2026-01-01' };\nawait trx('projects').where('id', 1).update({ ...patch });",
    wired: new Map([['src/x/spread.ts', 'fixture']]),
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  const e7b = classifyFile({
    relPath: 'src/x/spread.ts',
    source: "await trx('projects').where('id', 1).update({ ...scalarPatch });",
    wired: new Map(),
    exempt: new Map(),
    deletes: new Map(),
    computedWriters: new Map(),
  });
  if (e7a.some((e) => e.kind === 'missing-refresh-call') && e7b.length === 0) pass++;
  else console.error('SELF_TEST 7 失败: spread 敏感判定错误', { e7a, e7b });

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
    `✓ G-E 通过：调度输入写点 ${REFRESH_WIRED.size} 接线 / ${EXEMPT.size} 豁免；时间线删除 ${DELETE_GUARDED.size} 护栏；computed 写点 ${COMPUTED_WRITERS.size} 白名单`
  );
}
