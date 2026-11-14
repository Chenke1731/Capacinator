#!/usr/bin/env node
/**
 * 接线守卫（I03g-W3b）——防止"规则存在但触发器脱钩"。
 *
 * 断言四方互引（以契约规则 ID 为锚，不以复述文本为锚——Codex C-2 漂移教训）：
 *   1. 契约 docs/UI_GENERATION_CONTRACT.md 存在三个 judged 节，且每节含全部规则 ID
 *      （IX-1..6 / DV-1..8 / CP-1..4）；
 *   2. 评审员提示词 .zcode/agents/frontend-ui-reviewer.md 引用三节标题 + ID 区间；
 *   3. ui-review skill .zcode/skills/ui-review/SKILL.md 领域清单含 ID 区间引用；
 *   4. ui-preflight skill .zcode/skills/ui-preflight/SKILL.md 引用契约（judged 层入口）。
 *
 * 限度声明（必须写在报告里）：本守卫守的是**互引完整**，守不住"评审被派发"本身
 * ——四方互引齐全而漏派一次评审时，本守卫仍绿。触发硬化是流程约定（CLAUDE.md
 * 信号表"UI diff 交付"强制行），不是本脚本的能力。
 *
 * 用法：node scripts/check-ui-contract-wiring.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const CONTRACT = resolve(ROOT, 'docs/UI_GENERATION_CONTRACT.md');
const REVIEWER = resolve(ROOT, '.zcode/agents/frontend-ui-reviewer.md');
const SKILL = resolve(ROOT, '.zcode/skills/ui-review/SKILL.md');
const PREFLIGHT = resolve(ROOT, '.zcode/skills/ui-preflight/SKILL.md');

const JUDGED_SECTIONS = [
  { title: '交互与状态判据', ids: ['IX-1','IX-2','IX-3','IX-4','IX-5','IX-6','IX-7'] },
  { title: '数据可视化契约', ids: ['DV-1','DV-2','DV-3','DV-4','DV-5','DV-6','DV-7','DV-8'] },
  { title: '界面文案契约', ids: ['CP-1','CP-2','CP-3','CP-4'] },
];

function read(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

const problems = [];
const contract = read(CONTRACT);
if (!contract) {
  problems.push('契约文件缺失: docs/UI_GENERATION_CONTRACT.md');
} else {
  // 多步手势/状态矩阵是 IX-7 的落地载体：缺任一锚点=流程结构件被删
  for (const anchor of ['交互状态矩阵', '重复同一手势']) {
    if (!contract.includes(anchor)) {
      problems.push(`契约缺多步手势结构件「${anchor}」→ IX-7 失去生成前约束载体`);
    }
  }
  for (const section of JUDGED_SECTIONS) {
    if (!contract.includes(`## ${section.title}`)) {
      problems.push(`契约缺少 judged 节「${section.title}」→ 节被删或改名时接线守卫必须同步`);
    } else {
      for (const id of section.ids) {
        if (!contract.includes(id)) {
          problems.push(`契约 §${section.title} 缺规则 ID ${id} → 删规则必须同步更新本守卫的 ID 清单`);
        }
      }
    }
  }
}

const reviewer = read(REVIEWER);
if (!reviewer) {
  problems.push('评审员提示词缺失: .zcode/agents/frontend-ui-reviewer.md');
} else {
  for (const section of JUDGED_SECTIONS) {
    if (!reviewer.includes(section.title)) {
      problems.push(`评审员提示词未引用节「${section.title}」→ 三查漏节即规则悬空`);
    }
  }
  // ID 区间引用（至少出现 IX-1/DV-1/CP-1 起始锚）
  for (const anchor of ['IX-1', 'DV-1', 'CP-1']) {
    if (!reviewer.includes(anchor)) {
      problems.push(`评审员提示词缺 ID 起始锚 ${anchor} → 以 ID 为锚的引用断链`);
    }
  }
  if (!reviewer.includes('重复手势')) {
    problems.push('评审员提示词缺「重复手势」走查要求 → IX-7 在交付评审无执行入口');
  }
  // 必填块声明
  if (!reviewer.includes('Mode:') || !reviewer.includes('DEGRADED')) {
    problems.push('评审员提示词缺 Mode/DEGRADED 必填块声明 → 报告模板退化为可选');
  }
}

const skill = read(SKILL);
if (!skill) {
  problems.push('ui-review skill 缺失: .zcode/skills/ui-review/SKILL.md');
} else {
  for (const anchor of ['DV-1', 'CP-1', 'IX-1']) {
    if (!skill.includes(anchor)) {
      problems.push(`ui-review skill 领域清单缺 ID 引用 ${anchor} → 派发协议与契约脱钩`);
    }
  }
  if (!skill.includes('重复手势')) {
    problems.push('ui-review skill 未要求重复手势走查 → 派发协议与 IX-7 脱钩');
  }
  // 触发条件必须含交付前强制
  if (!skill.includes('UI diff 交付前必须')) {
    problems.push('ui-review skill 触发条件未声明"UI diff 交付前必须"→ 派发仍是软条件');
  }
}

const preflight = read(PREFLIGHT);
if (!preflight) {
  problems.push('ui-preflight skill 缺失: .zcode/skills/ui-preflight/SKILL.md');
} else if (!preflight.includes('UI_GENERATION_CONTRACT')) {
  problems.push('ui-preflight skill 未引用契约 → 生成前协议入口断链');
} else {
  if (!preflight.includes('交互状态矩阵')) {
    problems.push('ui-preflight skill 缺「交互状态矩阵」生成前步骤 → IX-7 入口断链');
  }
  if (!preflight.includes('重复手势')) {
    problems.push('ui-preflight skill 缺「重复手势」交付走查要求 → IX-7 验证断链');
  }
}

if (problems.length > 0) {
  console.error('✗ 接线守卫（judged 层互引）：');
  for (const p of problems) console.error(`  ${p}`);
  console.error('  → 限度声明：本守卫守互引完整，守不住"评审被派发"——派发硬化在 CLAUDE.md 信号表');
  process.exit(1);
}

console.log('✓ 接线守卫通过：契约三节 × 评审员提示词 × ui-review skill × ui-preflight 互引完整（ID 锚）');
console.log('  限度：互引完整 ≠ 评审发生；派发硬化在 CLAUDE.md 信号表"UI diff 交付"强制行');
