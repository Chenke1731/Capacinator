/**
 * 2026-11-13 事故回归：SmartAssignmentModal 掉到页面底部。
 *
 * 根因：Tailwind v4 utilities 在 @layer，未分层组件 CSS 的
 * `.smart-assignment-modal { position: relative }` 覆盖了 DialogContent
 * 原语的 `fixed`，弹窗退出固定定位、落入文档流底部。jsdom 不做布局，
 * 只能用 CSS 契约测试守住这条不变量。放在 tests/unit/client（不占
 * client/src 的 typecheck 面）以便读取 Node 文件系统。
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(
  resolve(__dirname, '../../../client/src/components/modals/SmartAssignmentModal.css'),
  'utf8'
);

function rootBlocks(): string[] {
  return [...css.matchAll(/\.smart-assignment-modal\s*\{([^}]*)\}/g)].map((m) => m[1]);
}

function withoutComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('SmartAssignmentModal CSS contract', () => {
  test('不得覆盖 DialogContent 的定位属性（fixed/inset/transform）', () => {
    const blocks = rootBlocks().map(withoutComments);
    expect(blocks.length).toBeGreaterThan(0);
    for (const body of blocks) {
      expect(body).not.toMatch(/\bposition\s*:/);
      expect(body).not.toMatch(/\binset\s*:/);
      expect(body).not.toMatch(/\btransform\s*:/);
    }
  });

  test('必须有视口高度上限与滚动，避免居中后上下裁切', () => {
    const all = rootBlocks().map(withoutComments).join('\n');
    expect(all).toMatch(/max-height:\s*90dvh/);
    expect(all).toMatch(/overflow-y:\s*auto/);
  });
});
