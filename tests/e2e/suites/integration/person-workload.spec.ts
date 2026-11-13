/**
 * 工作台 v2 浏览器验收（§18）：默认页无常驻任务树；添加分配打开顶部大弹窗；
 * 弹窗显示真实任务表 + 迷你容量热区；跨页多选 → ghost → 调整 → 确认提交 →
 * 泳道更新；1366 无横向溢出；双主题可读。E2E 会真实创建分配，结束时用
 * “撤销创建”清理，避免污染共享 e2e 库。
 */
import { test, expect, tags } from '../../fixtures';

async function firstPerson(apiContext: any) {
  const response = await apiContext.get('/api/people?limit=50');
  const payload = await response.json();
  const people = payload?.data?.data ?? payload?.data ?? [];
  return people.find((person: any) => person.is_active !== false) ?? people[0];
}

test.describe('Person workbench v2 (dialog selection → ghost → commit)', () => {
  test(`${tags.integration} 1366 layout, dialog multi-select, ghost adjust, commit, swimlane update`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const person = await firstPerson(apiContext);
    test.skip(!person, 'No people fixture in e2e database');

    await authenticatedPage.setViewportSize({ width: 1366, height: 768 });
    await authenticatedPage.goto(`/people/${person.id}/workload`);
    await expect(authenticatedPage.getByRole('heading', { name: /Adjust Assignments/i })).toBeVisible();
    await expect(authenticatedPage.getByTestId('pw-total')).toBeVisible();

    // §18 功能：默认页面无常驻任务树（旧 aside 选择器不再存在）
    await expect(authenticatedPage.getByRole('complementary')).toHaveCount(0);

    // 泳道可见 + 1366 无页面级横向溢出
    await expect(authenticatedPage.getByTestId('pw-gantt')).toBeVisible();
    const rootOverflow = await authenticatedPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(rootOverflow.scrollWidth).toBeLessThanOrEqual(rootOverflow.innerWidth + 1);

    // G-01 守卫：bar 计算高度不得超 20px 堆叠间距；同泳道 bar 矩形零相交
    const barGeometry = await authenticatedPage.evaluate(() => {
      const bars = [...document.querySelectorAll<HTMLElement>('[data-testid="pw-gantt-bar"], [data-testid="pw-ghost-bar"]')];
      const oversized = bars.filter((bar) => bar.getBoundingClientRect().height > 20);
      const byTrack = new Map<Element, DOMRect[]>();
      for (const bar of bars) {
        const track = bar.closest('.pw-gantt-lane-track');
        if (!track) continue;
        const list = byTrack.get(track) ?? [];
        list.push(bar.getBoundingClientRect());
        byTrack.set(track, list);
      }
      const overlaps: string[] = [];
      for (const [track, rects] of byTrack) {
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            const intersects = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            if (intersects) overlaps.push((track.previousElementSibling as HTMLElement)?.textContent ?? 'lane');
          }
        }
      }
      return { barCount: bars.length, oversized: oversized.length, overlaps };
    });
    expect(barGeometry.oversized).toBe(0);
    expect(barGeometry.overlaps).toEqual([]);

    // 行级编辑入口仍可用
    const editButtons = authenticatedPage.getByRole('button', { name: 'Edit' });
    if ((await editButtons.count()) > 0) {
      await editButtons.first().click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toBeVisible();
      await authenticatedPage.locator('.pw-row-actions').getByRole('button', { name: 'Cancel' }).click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toHaveCount(0);
    }

    // §18：点“添加分配”打开顶部大弹窗，真实任务表 + 迷你热区可达
    await authenticatedPage.getByTestId('pw-add-assignment').click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByTestId('pw-mini-heat')).toBeVisible();
    await expect(dialog.getByTestId('pw-task-board')).toBeVisible({ timeout: 15000 });

    const overflowInDialog = await authenticatedPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflowInDialog.scrollWidth).toBeLessThanOrEqual(overflowInDialog.innerWidth + 1);

    const checkboxes = dialog.locator('input[type="checkbox"][data-testid^="pw-select-task-"]');
    const checkboxCount = await checkboxes.count();
    test.skip(checkboxCount < 1, 'No selectable leaf tasks in e2e database');

    // 勾选两个任务（不足两个则选一个）
    await checkboxes.first().check();
    if (checkboxCount > 1) {
      await checkboxes.nth(1).check();
    }

    // 统一 fixed 日期，保证草稿可提交
    await dialog.getByLabel('Unified date mode').selectOption('fixed');
    const now = Date.now();
    const iso = (offsetDays: number) => new Date(now + offsetDays * 86400000).toISOString().slice(0, 10);
    await dialog.getByLabel('Start date').fill(iso(7));
    await dialog.getByLabel('End date').fill(iso(37));
    await dialog.getByTestId('pw-add-to-lane').click();
    await expect(dialog).toHaveCount(0);

    // §18：加入泳道后 ghost 出现在泳道；待提交条可达
    const commitBar = authenticatedPage.getByTestId('pw-commit-bar');
    await expect(commitBar).toBeVisible();
    await expect(authenticatedPage.getByTestId('pw-ghost-bar').first()).toBeVisible();

    // ghost 参数面板：调整比例后关闭
    await authenticatedPage.getByTestId('pw-ghost-bar').first().click();
    const allocationInput = authenticatedPage.getByTestId('pw-ghost-inspector').getByLabel('Allocation %');
    await expect(allocationInput).toBeVisible();
    await allocationInput.fill('25');
    await authenticatedPage.getByTestId('pw-ghost-inspector').getByRole('button', { name: 'Done' }).click();

    // §18：超载仍可确认（容量只提醒不阻断）→ 逐条提交成功后进入撤销条
    await authenticatedPage.getByTestId('pw-confirm-assign').click();
    await expect(authenticatedPage.getByTestId('pw-undo-create')).toBeVisible({ timeout: 20000 });
    // 泳道更新：ghost 消失（成功行变实心 committed bar）
    await expect(authenticatedPage.getByTestId('pw-ghost-bar')).toHaveCount(0);

    // 清理：撤销创建，避免污染共享 e2e 库
    await authenticatedPage.getByTestId('pw-undo-create').click();
    await expect(authenticatedPage.getByTestId('pw-commit-bar')).toHaveCount(0, { timeout: 20000 });

    // 泳道可折叠（§18 视觉）
    await authenticatedPage.getByTestId('pw-gantt-toggle').click();
    await expect(authenticatedPage.getByTestId('pw-gantt-heat-compact')).toBeVisible();
  });

  test(`${tags.integration} light and dark themes keep the workload page readable`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const person = await firstPerson(apiContext);
    test.skip(!person, 'No people fixture in e2e database');

    await authenticatedPage.goto(`/people/${person.id}/workload`);
    await authenticatedPage.evaluate(() => localStorage.setItem('theme', 'light'));
    await authenticatedPage.reload();
    const heading = authenticatedPage.getByRole('heading', { name: /Adjust Assignments/i });
    await expect(heading).toBeVisible();
    const lightColor = await heading.evaluate((element) => getComputedStyle(element).color);
    expect(lightColor).not.toBe('rgba(0, 0, 0, 0)');

    await authenticatedPage.evaluate(() => localStorage.setItem('theme', 'dark'));
    await authenticatedPage.reload();
    await expect(heading).toBeVisible();
    await expect(authenticatedPage.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkColor = await heading.evaluate((element) => getComputedStyle(element).color);
    expect(darkColor).not.toBe('rgba(0, 0, 0, 0)');

    // 弹窗在暗色下同样可读（标题 + 热区）
    await authenticatedPage.getByTestId('pw-add-assignment').click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dialogTitleColor = await dialog
      .getByRole('heading', { name: /Select tasks for/i })
      .evaluate((element) => getComputedStyle(element).color);
    expect(dialogTitleColor).not.toBe('rgba(0, 0, 0, 0)');
  });
});
