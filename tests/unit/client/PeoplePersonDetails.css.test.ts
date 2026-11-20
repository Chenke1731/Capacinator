/**
 * 2026-11-13 事故回归：从 People 进入 PersonDetails 后，工作负载标题变白不可见。
 *
 * 根因：People.css 中遗留了一整套 .insights-section/.insight-card/... 规则
 * （People 页已不使用），其中 `.insights-section .section-header h2 {
 * color: var(--bg-primary) }` 在未分层 CSS 中以更高特异度覆盖
 * PersonDetails.css 的 `.section-header h2 { color: var(--text-primary) }`。
 *
 * 本测试守住：通用 insights 类只允许 PersonDetails.css 定义；People.css
 * 不得再出现 insights-section 根规则。
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const peopleCss = stripComments(readFileSync(resolve(ROOT, 'client/src/pages/People.css'), 'utf8'));
const detailsCss = stripComments(readFileSync(resolve(ROOT, 'client/src/pages/PersonDetails.css'), 'utf8'));

describe('People/PersonDetails insights CSS ownership', () => {
  test('People.css 不得定义 insights-section 根规则（防跨页泄漏）', () => {
    expect(peopleCss).not.toMatch(/\.insights-section\s*\{/);
    expect(peopleCss).not.toMatch(/\.insights-section\s+\.section-header/);
    expect(peopleCss).not.toMatch(/\.insights-grid\s*\{/);
    expect(peopleCss).not.toMatch(/\.insight-card\s*\{/);
  });

  test('PersonDetails.css 保留可读的标题色', () => {
    const block = detailsCss.match(/(?:^|\n)(?::where\(\.person-details\)|\.person-details)\s+\.section-header h2\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/color:\s*var\(--text-primary\)/);
  });
});
