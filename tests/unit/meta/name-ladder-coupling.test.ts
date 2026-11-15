/**
 * 参数耦合守卫（EXP-NEW，2026-11-15 Batch1 盲评候选 → Batch1 B1-1 回归沉淀）：
 * 名称列挤压梯的 @container 触发线必须 ≥ 任何默认档 name 轨宽。
 *
 * 背景：46933c1（预算含 gap 修正使默认 name 轨宽 186）与 9bb212d（触发线
 * 降 176）参数脱耦，+AR 分解钮在默认档被裁 0px（ff44e6c 修复）。两参数
 * 分属两个文件、无编译期关联——本守卫把耦合变成断言。
 *
 * 变异自证：把 App.css 触发线降到 <186，或把 name def 任一档提到 >阈值
 * → 本测试必红。
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectsSrc = readFileSync(path.resolve('client/src/pages/Projects.tsx'), 'utf8');
const appCss = readFileSync(path.resolve('client/src/App.css'), 'utf8');

function parseNameDefs(): number[] {
  const m = projectsSrc.match(/key:\s*'name',\s*def:\s*\[(\d+),\s*(\d+),\s*(\d+)\]/);
  expect(m).toBeTruthy();
  return [Number(m![1]), Number(m![2]), Number(m![3])];
}

function parseLadderThreshold(): number | null {
  // 找包含 .requirements-name-text 规则的 @container 块的 max-width
  for (const block of appCss.split('@container').slice(1)) {
    if (block.includes('.requirements-name-text')) {
      const wm = block.match(/\(max-width:\s*(\d+)px\)/);
      return wm ? Number(wm[1]) : null;
    }
  }
  return null;
}

describe('name squeeze-ladder × default track width coupling (EXP-NEW)', () => {
  test('梯子触发线 ≥ 任何默认档 name 轨宽（否则保护集在默认档失效）', () => {
    const nameDefs = parseNameDefs();
    const threshold = parseLadderThreshold();
    expect(threshold).not.toBeNull();
    const widest = Math.max(...nameDefs);
    expect(threshold!).toBeGreaterThanOrEqual(widest);
  });

  test('守卫锚点自检：两个源文件仍含被解析的标记（防重构后静默失效）', () => {
    expect(projectsSrc).toMatch(/key:\s*'name',\s*def:\s*\[\d+,\s*\d+,\s*\d+\]/);
    expect(appCss).toMatch(/@container[^{]*\{[\s\S]*?\.requirements-name-text/);
  });
});
