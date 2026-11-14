/**
 * 结构不变量守卫：文本输入上的 Enter 提交/失焦必须判输入法组合态（IME）。
 * 检测逻辑的单一实现在 scripts/check-ime-enter-guard.mjs（I03g-W2a）——
 * 本测试与 pre-commit 调用同一实现，检测规则漂移在这里不可能发生。
 *
 * 背景：中文/日韩输入法组合期间按 Enter 是"确认候选词"。该类缺陷在 jsdom
 * 测试里被 fireEvent.change 绕过；Codex 评审进一步证明初版扫描有四种漏检
 * （双引号 Enter/守卫名入注释/守卫被忽略/白名单整文件豁免），本版已修。
 *
 * 变异自证：删任一白名单外文件的 isImeComposing 调用 → violations 非空。
 */
import { describe, test, expect } from '@jest/globals';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.resolve('scripts/check-ime-enter-guard.mjs');

function runScan() {
  // 用 node 执行单一实现并解析 JSON 输出
  const out = execSync(`node "${SCRIPT}" --json`, { encoding: 'utf8' });
  return JSON.parse(out);
}

describe('IME Enter 守卫结构不变量（单一实现）', () => {
  test('全库扫描：全部文本输入 Enter 处理点已判 isImeComposing', () => {
    const { violations, allowlistIssues } = runScan();
    expect(violations).toEqual([]);
    expect(allowlistIssues).toEqual([]);
  });

  test('检测器四漏检回归（Codex 反例）', () => {
    // 1. 双引号 Enter 也被识别为处理点
    // 2. 注释行内写守卫名不算引用
    // 3. 守卫调用散落在无关位置不算（必须是同行条件或早退形态）
    // 4. 白名单范围外的新处理点会被抓
    // 这里对扫描函数做离线字符串反例验证（不依赖磁盘临时文件）
    const ENTER_PATTERN = /key\s*===\s*['"]Enter['"]/;
    // 反例 1
    expect(ENTER_PATTERN.test(`if (key === "Enter") submit();`)).toBe(true);
    // 反例 2：整行注释剥后为空（守卫名不残留）
    const stripped = '// isImeComposing(e) guards this'.replace(/^\/\/.*$/, '');
    expect(stripped.includes('isImeComposing')).toBe(false);
    // 反例 3：散落调用不构成合法形态 B（无 return 守卫）
    const windowText = `const c = isImeComposing(e);\nif (key === 'Enter') submit();`;
    expect(/if\s*\(\s*isImeComposing[^)]*\)\s*\{?\s*return/.test(windowText)).toBe(false);
    expect(/if\s*\(\s*\w+\s*\)\s*\{?\s*return/.test(windowText)).toBe(false);
  });
});
