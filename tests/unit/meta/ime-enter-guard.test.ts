/**
 * 结构不变量守卫：文本输入上的 Enter 提交/失焦必须判输入法组合态（IME）。
 *
 * 背景（2026-11-14，UI UX Pro Max 120 条清单 gap 分析）：中文/日文/韩文输入法
 * 组合期间按 Enter 是"确认候选词"，不是"提交"；未守卫的 Enter 提交会把拼音/
 * 半截文本提交出去。该类缺陷在 jsdom 测试里被 fireEvent.change 绕过，长期不可见。
 *
 * 覆盖证明只认全库扫描（三步法第 3 步）：本测试遍历 client/src 全部源码，
 * 每个 `key === 'Enter'` 处理点必须在同处理块内引用 isImeComposing，除非文件在
 * 显式白名单（非文本输入的键盘激活，逐条注明理由）。单点行为断言（某个弹窗的
 * 组合态测试）不能替代本扫描。
 *
 * 变异自证：删除任一白名单外文件的 isImeComposing 调用 → 本测试红。
 */
import { describe, test, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const CLIENT_SRC = path.resolve('client/src');

/** 非文本输入的键盘激活（Enter/Space 触发点击），IME 组合态不适用——逐条理由 */
const ACTIVATION_ALLOWLIST = new Map<string, string>([
  ['client/src/pages/Dashboard.tsx', '图表/卡片 role=button 的键盘激活（Enter/Space），非文本输入'],
  ['client/src/components/ui/CollapsibleSection.tsx', '可折叠区头部激活，非文本输入'],
  ['client/src/components/dashboard/EnhancedKPIs.tsx', 'KPI 磁贴导航激活，非文本输入'],
  ['client/src/components/dashboard/CriticalAlertsPanel.tsx', '告警条目导航激活，非文本输入'],
  ['client/src/hooks/useTimelineEvents.ts', '时间轴阶段手柄的键盘快捷操作（Enter/Space），非文本输入'],
]);

/** 本守卫自身与 IME 原语注释不算处理点 */
const SELF_AND_UTIL = new Set(['client/src/lib/ime.ts']);

function walk(dir: string, out: string[] = []): string[] {
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

function rel(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join('/');
}

describe('IME Enter 守卫结构不变量', () => {
  test('全库扫描：每个 key === Enter 处理点必须引用 isImeComposing（白名单除外）', () => {
    const violations: string[] = [];
    for (const file of walk(CLIENT_SRC)) {
      const relPath = rel(file);
      if (SELF_AND_UTIL.has(relPath)) continue;
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      // 去掉纯注释行（含 key === 'Enter' 的说明文字不算处理点）
      const codeLines = lines.map((line) => (line.trim().startsWith('//') || line.trim().startsWith('*') ? '' : line));
      const inAllowlist = ACTIVATION_ALLOWLIST.has(relPath);
      codeLines.forEach((line, index) => {
        if (!line.includes("key === 'Enter'")) return;
        if (inAllowlist) return;
        // 同处理块窗口：前后 10 行内出现 isImeComposing 即视为已守卫
        const windowStart = Math.max(0, index - 10);
        const windowEnd = Math.min(codeLines.length, index + 11);
        const windowText = codeLines.slice(windowStart, windowEnd).join('\n');
        if (!windowText.includes('isImeComposing')) {
          violations.push(`${relPath}:${index + 1}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  test('白名单每个条目必须仍存在 Enter 处理点（防白名单腐化）', () => {
    for (const [relPath, reason] of ACTIVATION_ALLOWLIST) {
      expect(reason.length).toBeGreaterThan(0);
      const source = readFileSync(path.resolve(relPath), 'utf8');
      expect(source).toContain("key === 'Enter'");
    }
  });
});
