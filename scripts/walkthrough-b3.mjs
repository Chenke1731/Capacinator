import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'light');
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const PID = 'project-1789912193169-c7bg4iere';
await page.goto(`http://localhost:3120/projects/${PID}`);
await page.waitForTimeout(1500);
// 展开投入履历
const section = page.locator('text=投入履历').first();
await section.click().catch(() => {});
await page.waitForTimeout(700);
const tableVisible = await page.locator('[data-testid="actuals-table"]').isVisible().catch(() => false);
console.log('table visible:', tableVisible);
if (tableVisible) {
  await page.locator('button', { hasText: '快照本月' }).first().click();
  await page.waitForTimeout(1000);
  const rowCount = await page.locator('.actuals-row').count();
  const thisRow = page.locator('.actuals-row').first();
  const monthTxt = await thisRow.locator('.actuals-month').textContent();
  const planned = await thisRow.locator('.actuals-num').first().textContent();
  const source = await thisRow.locator('.actuals-source').textContent();
  console.log('rows:', rowCount, '| first:', monthTxt, 'planned:', planned, 'source:', source.trim());
  await thisRow.locator('.actuals-edit').click();
  await page.waitForTimeout(250);
  const input = thisRow.locator('input.inline-edit-input');
  await input.fill('1.2');
  await input.press('Enter');
  await page.waitForTimeout(1000);
  const dev = await page.locator('.actuals-row').first().locator('.actuals-dev').textContent();
  const src2 = await page.locator('.actuals-row').first().locator('.actuals-source').textContent();
  console.log('after manual: dev=', dev.trim(), 'source=', src2.trim());
  await page.screenshot({ path: '/tmp/b3-panel-light.png' });
  // 清理: 删除该月
  await page.locator('.actuals-row').first().locator('.actuals-del').click();
  await page.waitForTimeout(700);
}
console.log('errors:', errors.length, errors.slice(0, 2));
await browser.close();
