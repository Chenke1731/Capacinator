/**
 * I02w：人员工作负载编辑器浏览器验收（1366 最低宽度）。
 * jsdom 只覆盖逻辑；本 spec 覆盖两栏布局、容量条、任务树预备态、
 * 行级编辑入口与双主题可见性。
 */
import { test, expect, tags } from '../../fixtures';

async function firstPerson(apiContext: any) {
  const response = await apiContext.get('/api/people?limit=50');
  const payload = await response.json();
  const people = payload?.data?.data ?? payload?.data ?? [];
  return people.find((person: any) => person.is_active !== false) ?? people[0];
}

test.describe('Person workload editor (I02w)', () => {
  test(`${tags.integration} 1366 layout, capacity summary, row edit and task picker`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const person = await firstPerson(apiContext);
    test.skip(!person, 'No people fixture in e2e database');

    await authenticatedPage.setViewportSize({ width: 1366, height: 768 });
    await authenticatedPage.goto(`/people/${person.id}/workload`);
    await expect(authenticatedPage.getByRole('heading', { name: /Adjust Assignments/i })).toBeVisible();
    await expect(authenticatedPage.getByTestId('pw-total')).toBeVisible();
    await expect(authenticatedPage.getByRole('heading', { name: 'Counted in current workload', exact: true })).toBeVisible();
    await expect(authenticatedPage.getByRole('complementary', { name: /Add assignment/i })).toBeVisible();

    const rootOverflow = await authenticatedPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(rootOverflow.scrollWidth).toBeLessThanOrEqual(rootOverflow.innerWidth + 1);

    const treeItems = authenticatedPage.getByRole('treeitem');
    await expect(treeItems.first()).toBeVisible({ timeout: 10000 });
    const enabledTask = authenticatedPage
      .locator('[role="treeitem"]:not([aria-disabled="true"]):not([aria-expanded])')
      .first();
    expect(await enabledTask.count()).toBeGreaterThan(0);
    await enabledTask.click();
    await expect(authenticatedPage.getByLabel('Date mode')).toBeVisible();

    const editButtons = authenticatedPage.getByRole('button', { name: 'Edit' });
    if ((await editButtons.count()) > 0) {
      await editButtons.first().click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toBeVisible();
      await authenticatedPage.locator('.pw-row-actions').getByRole('button', { name: 'Cancel' }).click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toHaveCount(0);
    }
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
  });
});
