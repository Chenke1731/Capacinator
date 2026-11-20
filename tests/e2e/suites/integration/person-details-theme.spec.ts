/**
 * C 类守卫（2026-11-13 I02p 事故）：People → PersonDetails 路由切换后的
 * 标题对比度。静态归属测试只能锁文件内容；这个 bug 只在 People.css 已
 * 全局加载后再进入 PersonDetails 时出现，必须按真实导航序列检查计算色。
 */
import { test, expect, tags } from '../../fixtures';

function parseRgb(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

test.describe('PersonDetails theme after People navigation (I02p)', () => {
  test(`${tags.integration} heading remains readable after People.css is loaded`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    // 先在 People 页触发 People.css 全局加载，再走真实路由进入详情页。
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
    const firstRow = authenticatedPage.locator('tbody tr').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'No people fixture to navigate');
      return;
    }
    // Action-column densification (7c9e761) removed the per-row View button;
    // rows navigate to the detail page on click since.
    await firstRow.click();
    await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });

    const heading = authenticatedPage.locator('.insights-section .section-header h2').first();
    await expect(heading).toBeVisible();

    const colors = await heading.evaluate((el) => {
      const style = getComputedStyle(el);
      let node: HTMLElement | null = el as HTMLElement;
      let background = 'rgba(0, 0, 0, 0)';
      while (node) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (candidate && candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          background = candidate;
          break;
        }
        node = node.parentElement;
      }
      return { color: style.color, background };
    });

    const fg = parseRgb(colors.color);
    const bg = parseRgb(colors.background);
    expect(fg, `unparseable heading color ${colors.color}`).not.toBeNull();
    expect(bg, `unparseable heading background ${colors.background}`).not.toBeNull();
    expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
  });
});
