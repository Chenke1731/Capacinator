#!/usr/bin/env node
/**
 * IME Enter 守卫（I03g-W2a）—— tests/unit/meta/ime-enter-guard.test.ts 与
 * pre-commit 共用的单一检测实现（Codex 评审四漏检修复版）。
 *
 * 漏检修复（Codex 内存反例验证）：
 *  1. 双引号 Enter（key === "Enter"）同样算处理点；
 *  2. 守卫名出现在注释行不算引用（先剥注释再匹配）；
 *  3. 守卫调用必须真实包裹判断（isImeComposing(e) 出现在同一处理函数体内，
 *     我们无法静态证明返回值被使用，但要求它出现在 key==='Enter' 同一行的
 *     条件表达式或同函数块内——退而求其次：与 Enter 判断同行或在函数体
 *     开头独立 return 守卫两种合法形态，散落在无关位置不算）；
 *  4. 白名单豁免定位到具体处理点（行号锚），不是整文件——白名单文件新增
 *     处理点必须红。
 *
 * 用法：node scripts/check-ime-enter-guard.mjs [--json]
 * 退出码 0=通过，1=违规。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'src');

/**
 * 白名单：非文本输入的键盘激活（Enter/Space 触发点击），IME 组合态不适用。
 * 每项格式：{ file: '相对路径', reason: '理由', lines?: [起始行, 结束行] }——
 * lines 省略时默认 [1, 200]（文件头部激活区）；新增处理点超出范围即红（漏检 4 修复）。
 */
const ACTIVATION_ALLOWLIST = [
  { file: 'pages/Dashboard.tsx', reason: '图表/卡片 role=button 的键盘激活（Enter/Space），非文本输入', lines: [240, 450] },
  { file: 'components/ui/CollapsibleSection.tsx', reason: '可折叠区头部激活，非文本输入', lines: [35, 55] },
  { file: 'components/dashboard/EnhancedKPIs.tsx', reason: 'KPI 磁贴导航激活，非文本输入', lines: [225, 245] },
  { file: 'components/dashboard/CriticalAlertsPanel.tsx', reason: '告警条目导航激活，非文本输入', lines: [82, 100] },
  { file: 'hooks/useTimelineEvents.ts', reason: '时间轴阶段手柄的键盘快捷操作（Enter/Space），非文本输入', lines: [625, 650] },
];

/** 本守卫自身与 IME 原语注释不算处理点 */
const SELF_AND_UTIL = new Set(['lib/ime.ts']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(tsx?|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(CLIENT_SRC, file).split(path.sep).join('/');
}

/**
 * 剥离注释行（保留代码行内的注释片断不做处理——守卫名写在行内注释的
 * 情形由"同行条件表达式"规则间接覆盖：同行必须真实包含 isImeComposing 调用，
 * 注释写守卫名不构成调用语法）。
 */
function stripCommentLines(lines) {
  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return '';
    // 行内注释：去掉 // 之后的内容再判断（保守：只处理行内 // 注释）
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  });
}

const ENTER_PATTERN = /key\s*===\s*['"]Enter['"]/;

export function scanImeEnterGuard() {
  const violations = [];
  for (const file of walk(CLIENT_SRC)) {
    const relPath = rel(file);
    if (SELF_AND_UTIL.has(relPath)) continue;

    const source = readFileSync(file, 'utf8');
    const lines = stripCommentLines(source.split('\n'));

    lines.forEach((line, index) => {
      if (!ENTER_PATTERN.test(line)) return;
      const lineNumber = index + 1;

      // 漏检 4 修复：白名单按行号范围豁免，超范围即红
      const allowEntry = ACTIVATION_ALLOWLIST.find((entry) => entry.file === relPath);
      if (allowEntry) {
        const [start, end] = allowEntry.lines ?? [1, 200];
        if (lineNumber >= start && lineNumber <= end) return;
      }

      // 合法形态 A：同一行条件表达式内引用守卫（含逻辑非包裹）
      if (line.includes('isImeComposing')) return;

      // 合法形态 B：守卫作为函数体开头的独立早退（±10 行窗口内且在 Enter 之前）
      const windowStart = Math.max(0, index - 10);
      const windowText = lines.slice(windowStart, index + 1).join('\n');
      // 漏检 3 修复：守卫必须构成 return 守卫或条件包裹的独立语句（不是散落字符串）
      // 形态 B1：if (isImeComposing(e)) return; （含嵌套括号）
      if (/if\s*\(\s*isImeComposing\([^)]*\)\s*\)\s*\{?\s*return/.test(windowText)) return;
      // 形态 B2：const c = isImeComposing(e); if (c) return;
      if (/isImeComposing\([^)]*\)\s*(return|;)/.test(windowText) && !line.includes('isImeComposing')) {
        if (/if\s*\(\s*\w+\s*\)\s*\{?\s*return/.test(windowText)) return;
      }

      violations.push({ file: relPath, line: lineNumber, snippet: line.trim().slice(0, 80) });
    });
  }

  // 白名单腐化检测：条目必须仍存在 Enter 处理点（且在声明的范围内）
  const allowlistIssues = [];
  for (const entry of ACTIVATION_ALLOWLIST) {
    if (!entry.reason || entry.reason.length === 0) {
      allowlistIssues.push({ file: entry.file, issue: 'missing reason' });
      continue;
    }
    try {
      const source = readFileSync(path.join(CLIENT_SRC, entry.file), 'utf8');
      const lines = stripCommentLines(source.split('\n'));
      const [start, end] = entry.lines ?? [1, 200];
      const hasEnterInRange = lines.some(
        (line, i) => i + 1 >= start && i + 1 <= end && ENTER_PATTERN.test(line)
      );
      if (!hasEnterInRange) {
        allowlistIssues.push({ file: entry.file, issue: `no Enter handler in declared range [${start},${end}] — allowlist rotted` });
      }
    } catch {
      allowlistIssues.push({ file: entry.file, issue: 'file not found' });
    }
  }

  return { violations, allowlistIssues };
}

// CLI 入口（测试 import 时不执行）
if (process.argv[1] && process.argv[1].endsWith('check-ime-enter-guard.mjs')) {
  const { violations, allowlistIssues } = scanImeEnterGuard();
  const asJson = process.argv.includes('--json');
  if (asJson) {
    console.log(JSON.stringify({ violations, allowlistIssues }, null, 2));
  } else {
    if (violations.length > 0) {
      console.error(`✗ IME Enter 守卫：${violations.length} 个处理点未判 isImeComposing（漏检 1-3 已修）：`);
      for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
    }
    if (allowlistIssues.length > 0) {
      console.error(`✗ IME Enter 守卫白名单腐化：`);
      for (const a of allowlistIssues) console.error(`  ${a.file}: ${a.issue}`);
    }
    if (violations.length === 0 && allowlistIssues.length === 0) {
      console.log('✓ IME Enter 守卫通过：全部文本输入 Enter 处理点已判 isImeComposing');
    }
  }
  process.exit(violations.length > 0 || allowlistIssues.length > 0 ? 1 : 0);
}
