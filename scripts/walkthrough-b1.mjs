import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript((t) => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', t);
    localStorage.removeItem('req-col-widths-v1');
  }, theme);
  await page.goto('http://localhost:3120/projects');
  await page.waitForSelector('.requirements-row');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/b1-board-${theme}.png` });
  // 组件气泡
  const row = page.locator('.requirements-row', { hasText: '数据平台升级' });
  await row.locator('[data-testid="component-edit-btn"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/b1-component-pop-${theme}.png` });
  await page.keyboard.press('Escape');
  // 人力气泡(实名名单)
  await row.locator('.req-staff').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/b1-staff-pop-${theme}.png` });
  await page.close();
}
await browser.close();
console.log('shots done');
