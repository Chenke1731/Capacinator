#!/usr/bin/env node
/**
 * 台账完整性检查（docs/plans/2026-10-14-capacinator-improvement-plan.md）。
 *
 * 规则：
 * 1. 表内编号唯一：同一张表（连续表格行组成的块）内，行首编号只允许指向一个任务。
 *    —— 跨表复用合法：§3 工作包 / §7 汇总 / §7 子任务登记 / §9 导航是同一任务的
 *    多张视图，同编号跨表出现是台账约定，不计数。
 *    —— 同表复用仅限历史「半边拆批」（一个 §9 任务拆多条交付行），以 HALVES
 *    白名单显式豁免；新任务需要多行交付时，有意识地扩白名单，不许静默复用。
 *    立项依据：2026-11-11 三次撞号实证（I01o、I01q、I01s），均为并行会话
 *    顺序领号未查台账——约定已失效，机械检查兜底。
 * 2. --next <前缀>：打印该编号族下一个空闲后缀（字母族 a-z 顺延，数字族两位递增）。
 * 3. --status：输出待领/进行中子任务与待裁决 D 项的紧凑快照，代替全文通读。
 *
 * 退出码：0 = 通过；1 = 有错误。
 * 用法：
 *   node scripts/check-ledger.mjs                 # 唯一性检查（pre-commit 用）
 *   node scripts/check-ledger.mjs --next I01      # 领号
 *   node scripts/check-ledger.mjs --status        # 快照
 *   node scripts/check-ledger.mjs --self-test     # 自测
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = path.join(root, 'docs/plans/2026-10-14-capacinator-improvement-plan.md');

/** 行首编号：大写字母开头、含数字、可带连字符；末尾可带单个小写字母（子任务序号） */
const ID_RE = /^[A-Z][A-Z0-9-]*\d+[a-z]?$/;

/** 历史「半边拆批」豁免：这些编号在 §7 子任务表合法拥有多条交付行（2026-10 交付期约定） */
const HALVES = new Set(['IP-06a', 'IP-06c', 'IP-02e']);

/** 解析表格行 → { line, block, id, firstCell, secondCell }；block=逻辑表块序号。
 *  空行不拆表（§7 子任务登记行之间隔空行是台账书写约定——2026-11-11 I01t
 *  撞号漏检的根因：空行把登记表拆成了单行块，同表检查失效）；
 *  只有非空且非表格行（标题/正文）才结束一个表块。 */
export function parseRows(text) {
  const rows = [];
  let block = 0;
  let inTable = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.startsWith('|')) {
      if (raw.trim() !== '') inTable = false; // 空行保留在同表块内
      return;
    }
    if (!inTable) {
      block += 1;
      inTable = true;
    }
    const cells = raw.split('|').slice(1);
    const firstCell = (cells[0] ?? '').trim();
    const secondCell = (cells[1] ?? '').trim();
    // 子任务行首格形如 "I01s / 标题"；编号取 " /" 前的 token
    const head = firstCell.split(/\s+\/\s+/)[0].trim();
    const id = ID_RE.test(head) ? head : null;
    rows.push({ line: i + 1, block, id, firstCell, secondCell, raw });
  });
  return rows;
}

/** 规则 1：同一表块内行首编号重复即错误（HALVES 豁免） */
export function findDuplicates(rows) {
  const seen = new Map(); // `${block}|${id}` -> lines
  for (const r of rows) {
    if (!r.id || HALVES.has(r.id)) continue;
    const key = `${r.block}|${r.id}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.line);
  }
  return [...seen.entries()]
    .filter(([key, lines]) => lines.length > 1)
    .map(([key, lines]) => ({ id: key.split('|')[1], block: Number(key.split('|')[0]), lines }));
}

/** 规则 2：前缀族下一个空闲编号（跨表全量计数——领号对全台账负责） */
export function nextFree(rows, prefix) {
  if (!/^[A-Z][A-Z0-9-]*\d*$/.test(prefix)) {
    return { error: `非法前缀 "${prefix}"（须大写字母开头，如 I01、IP-06、D）` };
  }
  const suffixes = rows
    .filter((r) => r.id && r.id.startsWith(prefix) && r.id.length > prefix.length)
    .map((r) => r.id.slice(prefix.length));
  const letters = suffixes.filter((s) => /^[a-z]$/.test(s));
  const digits = suffixes.filter((s) => /^\d+$/.test(s));
  if (digits.length > 0 && letters.length > 0) {
    return { error: `前缀 ${prefix} 同时存在字母/数字后缀（${suffixes.join(',')}），人工裁决` };
  }
  if (digits.length > 0 || (letters.length === 0 && !/[A-Z]\d{2}$/.test(prefix))) {
    // 数字族（D/U/S…）或无法从存量推断字母族的新前缀
    const width = Math.max(2, ...digits.map((d) => d.length));
    for (let n = 1; n <= 99; n++) {
      const cand = String(n).padStart(width, '0');
      if (!digits.includes(cand)) return { next: prefix + cand };
    }
    return { error: `前缀 ${prefix} 数字后缀 01-99 已用尽` };
  }
  for (let c = 97; c <= 122; c++) { // a-z
    const cand = String.fromCharCode(c);
    if (!letters.includes(cand)) return { next: prefix + cand };
  }
  return { error: `前缀 ${prefix} 字母后缀 a-z 已用尽` };
}

/** 规则 3：待领/进行中子任务 + 待裁决 D 项 */
export function statusDigest(rows) {
  const OPEN = /待处理|待领|进行中|待验收/;
  const openTasks = rows.filter((r) => r.id && r.firstCell.includes(' / ') && OPEN.test(r.secondCell));
  const pendingD = rows.filter((r) => r.id && /^D\d+$/.test(r.id) && r.raw.includes('**待裁决**'));
  return { openTasks, pendingD };
}

function runCheck(text) {
  const rows = parseRows(text);
  const dups = findDuplicates(rows);
  for (const d of dups) {
    console.error(`✗ 表块 ${d.block} 内编号重复: ${d.id} 出现在行 ${d.lines.join('、')}`);
  }
  return { rows, dups };
}

function selfTest() {
  let pass = 0;
  const total = 11;
  const fail = [];
  const expect = (name, cond) => (cond ? pass++ : fail.push(name));

  // 组1：同表重复检出
  {
    const rows = parseRows('| I01a / 甲 |\n| I01a / 乙 |\n| D01 | 描述 |\n');
    expect('同表重复检出', findDuplicates(rows).length === 1 && findDuplicates(rows)[0].id === 'I01a');
  }
  // 组2：跨表复用合法（标题/正文拆块）
  {
    const rows = parseRows('## §3\n| IP-01 | 工作包 |\n\n## §7\n| IP-01 | 汇总 |\n');
    expect('跨表复用合法', findDuplicates(rows).length === 0);
  }
  // 组2b：空行不拆表——登记行隔空行仍属同表（I01t 撞号漏检根因的回归钉）
  {
    const rows = parseRows('| I01p / 甲 |\n\n| I01t / 乙 |\n\n| I01t / 丙 |\n');
    expect('空行不拆表', findDuplicates(rows).length === 1 && findDuplicates(rows)[0].id === 'I01t');
  }
  // 组3：单元格内引用不计数
  {
    const rows = parseRows('| I01a / 甲（见 D01 行） |\n| 备注提及 I01a 但首格是文字 |\n');
    expect('引用不计数', findDuplicates(rows).length === 0);
  }
  // 组4：HALVES 豁免
  {
    const rows = parseRows('| IP-06c / R07（面板半边） |\n| IP-06c / R08（版本绑定半边） |\n');
    expect('半边拆批豁免', findDuplicates(rows).length === 0);
  }
  // 组5：字母族领号
  {
    const rows = parseRows('| I01a / x |\n| I01b / x |\n');
    expect('字母族顺延', nextFree(rows, 'I01').next === 'I01c');
    const full = parseRows(Array.from({ length: 26 }, (_, i) => `| I01${String.fromCharCode(97 + i)} / x |`).join('\n'));
    expect('字母族用尽报错', !!nextFree(full, 'I01').error);
  }
  // 组6：数字族领号
  {
    const rows = parseRows('| D01 | a |\n| D02 | b |\n| D03 | c |\n');
    expect('数字族顺延', nextFree(rows, 'D').next === 'D04');
  }
  // 组7：快照
  {
    const rows = parseRows(
      '| I01x / 任务甲 | 待处理 / — |\n| I01y / 任务乙 | 完成 / C |\n| D18 | x **待裁决** x |\n| D19 | 已裁决 |\n'
    );
    const { openTasks, pendingD } = statusDigest(rows);
    expect('快照含待处理', openTasks.length === 1 && openTasks[0].id === 'I01x');
    expect('快照含待裁决', pendingD.length === 1 && pendingD[0].id === 'D18');
  }
  // 组8：非法前缀
  expect('非法前缀拒绝', !!nextFree([], 'i01').error);

  console.log(`SELF_TEST check-ledger: ${pass}/${total} 组通过`);
  if (fail.length) {
    for (const f of fail) console.error(`✗ 自测失败: ${f}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
} else if (args.includes('--next')) {
  const prefix = args[args.indexOf('--next') + 1];
  const text = fs.readFileSync(LEDGER, 'utf8');
  const { rows } = runCheck(text);
  const r = nextFree(rows, prefix ?? '');
  if (r.error) {
    console.error(`✗ ${r.error}`);
    process.exit(1);
  }
  console.log(`${r.next}（前缀 ${prefix} 的下一个空闲编号；全台账已用 ${rows.filter((x) => x.id && x.id.startsWith(prefix)).length} 个）`);
} else if (args.includes('--status')) {
  const text = fs.readFileSync(LEDGER, 'utf8');
  const { rows, dups } = runCheck(text);
  const { openTasks, pendingD } = statusDigest(rows);
  console.log(`== 台账快照（${path.relative(root, LEDGER)}）==`);
  console.log(`待领/进行中子任务 ${openTasks.length} 项：`);
  for (const t of openTasks) {
    const title = t.firstCell.split(/\s+\/\s+/).slice(1).join(' / ').slice(0, 52);
    const st = t.secondCell.split(' / ')[0];
    console.log(`  ${t.id.padEnd(8)} [${st}] ${title}`);
  }
  console.log(`待裁决 ${pendingD.length} 项：${pendingD.map((d) => d.id).join('、') || '无'}`);
  if (dups.length) {
    console.error(`✗ 存在 ${dups.length} 个表内重复编号，先修复再领号`);
    process.exit(1);
  }
  console.log('✓ 表内编号唯一性通过');
} else {
  if (!fs.existsSync(LEDGER)) {
    console.error(`✗ 台账不存在: ${path.relative(root, LEDGER)}`);
    process.exit(1);
  }
  const { dups } = runCheck(fs.readFileSync(LEDGER, 'utf8'));
  if (dups.length) {
    console.error(`✗ verify:ledger 失败：${dups.length} 个表内编号重复`);
    process.exit(1);
  }
  console.log('✓ verify:ledger 通过：表内编号唯一（跨表视图复用合法，HALVES 白名单豁免半边拆批）');
}
