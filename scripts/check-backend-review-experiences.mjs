#!/usr/bin/env node
/**
 * 后端评审经验库完整性检查（docs/backend-review/experiences.md）。
 *
 * 镜像 scripts/check-ui-review-experiences.mjs，仅两点不同：
 * 1. 目标文件为 docs/backend-review/experiences.md；
 * 2. id 格式为 EXP-BNN（B 前缀区分后端域）。
 *
 * 规则（与 backend-reviewer 提示词 §9 对齐）：
 * 1. 每条经验必须有 id/source/class/disposition/status；
 * 2. GUARD 必须有 guard + verification（断言草案与变异自证）；
 * 3. DECISION 必须引用 decision；
 * 4. NIT 必须有 expires，过期未 retired 即失败；
 * 5. 同 class 出现 ≥2 次：禁止 NIT，且必须至少一条 GUARD（同族升级）；
 * 6. status=enforced：guard 不得为 proposed、verification 不得为 pending，
 *    且不得残留 checklist_item（禁止人机双源）。
 *
 * 退出码：0 = 通过；1 = 有错误。用法：node scripts/check-backend-review-experiences.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs/backend-review/experiences.md');

if (!fs.existsSync(file)) {
  console.error(`✗ 经验库不存在: ${path.relative(root, file)}`);
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const blocks = [...raw.matchAll(/```yaml exp\r?\n([\s\S]*?)```/g)].map((m) => m[1]);

const entries = blocks.map((block, index) => {
  const entry = { __index: index + 1 };
  for (const line of block.split(/\r?\n/)) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (m) entry[m[1]] = m[2].trim();
  }
  return entry;
});

const errors = [];
const fail = (entry, msg) => {
  errors.push(`${entry.id ?? `#${entry.__index}`}: ${msg}`);
};

const DISPOSITIONS = new Set(['GUARD', 'DECISION', 'NIT']);
const STATUSES = new Set(['candidate', 'enforced', 'retired']);
const seenIds = new Set();
const classCounts = new Map();

const today = new Date().toISOString().slice(0, 10);

for (const entry of entries) {
  if (!entry.id) {
    fail(entry, '缺少 id');
    continue;
  }
  if (!/^EXP-B\d{2,3}$/.test(entry.id)) fail(entry, `id 格式应为 EXP-BNN，实际 ${entry.id}`);
  if (seenIds.has(entry.id)) fail(entry, `id 重复 ${entry.id}`);
  seenIds.add(entry.id);

  for (const key of ['source', 'class', 'disposition', 'status']) {
    if (!entry[key]) fail(entry, `缺少 ${key}`);
  }
  if (entry.disposition && !DISPOSITIONS.has(entry.disposition)) {
    fail(entry, `disposition 非法: ${entry.disposition}（应为 GUARD|DECISION|NIT）`);
  }
  if (entry.status && !STATUSES.has(entry.status)) {
    fail(entry, `status 非法: ${entry.status}（应为 candidate|enforced|retired）`);
  }

  if (entry.class) classCounts.set(entry.class, (classCounts.get(entry.class) ?? 0) + 1);

  if (entry.disposition === 'GUARD') {
    if (!entry.guard) fail(entry, 'GUARD 缺少 guard（断言草案）');
    if (!entry.verification) fail(entry, 'GUARD 缺少 verification（变异自证）');
  }
  if (entry.disposition === 'DECISION' && !entry.decision) {
    fail(entry, 'DECISION 缺少 decision（裁决引用）');
  }
  if (entry.disposition === 'NIT') {
    if (!entry.expires) fail(entry, 'NIT 缺少 expires');
    else if (entry.expires < today && entry.status !== 'retired') {
      fail(entry, `NIT 已过期（${entry.expires}）——必须 retired 或升级`);
    }
  }

  if (entry.status === 'enforced') {
    if (/^proposed/i.test(entry.guard ?? '')) fail(entry, 'enforced 条目 guard 仍为 proposed');
    if (/^pending/i.test(entry.verification ?? '')) fail(entry, 'enforced 条目 verification 仍为 pending');
    if (entry.checklist_item) fail(entry, 'enforced 条目仍残留 checklist_item（禁止人机双源）');
  }
}

for (const [cls, count] of classCounts) {
  if (count < 2) continue;
  const family = entries.filter((e) => e.class === cls);
  for (const e of family) {
    if (e.disposition === 'NIT') {
      fail(e, `同族第 ${count} 次禁止 NIT（class=${cls}）——必须升级为 GUARD`);
    }
  }
  if (!family.some((e) => e.disposition === 'GUARD')) {
    fail(family[0], `同族第 ${count} 次必须至少一条 GUARD（class=${cls}）`);
  }
}

const summary = {
  entries: entries.length,
  guard: entries.filter((e) => e.disposition === 'GUARD').length,
  decision: entries.filter((e) => e.disposition === 'DECISION').length,
  nit: entries.filter((e) => e.disposition === 'NIT').length,
  enforced: entries.filter((e) => e.status === 'enforced').length,
};

console.log(
  `扫描 ${summary.entries} 条经验：GUARD ${summary.guard} / DECISION ${summary.decision} / NIT ${summary.nit}；enforced ${summary.enforced}`
);

if (errors.length > 0) {
  console.error(`✗ ${errors.length} 处违规：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('PASS — 经验库结构完整');
