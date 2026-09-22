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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:3120/projects');
  await page.waitForSelector('.requirements-row');
  await page.waitForTimeout(500);
  const sr = page.locator('.requirements-row--sr');
  const srCount = await sr.count();
  const childCount = await page.locator('.requirements-row--child').count();
  const chip = srCount ? await sr.first().locator('.req-sr-chip').textContent() : '';
  const dist = srCount ? (await sr.first().locator('.req-state-dist-item').allTextContents()).join(' ') : '';
  console.log(`${theme}: SR=${srCount} children=${childCount} chip="${chip}" dist="${dist}" errors=${errors.length}`);
  if (theme === 'light') {
    // 折叠/展开 + 分解按钮存在性
    const expanded = await page.locator('.requirements-row--child').count();
    await sr.first().click();
    await page.waitForTimeout(250);
    const collapsedNow = await page.locator('.requirements-row--child').count();
    await sr.first().click();
    await page.waitForTimeout(250);
    const reExpanded = await page.locator('.requirements-row--child').count();
    const decompBtn = await sr.first().locator('[title="分解出 AR"]').count();
    console.log(`collapse: ${expanded}->${collapsedNow}->${reExpanded}, decomposeBtn=${decompBtn}`);
    // AR 号就地
    const child = page.locator('.requirements-row--child').first();
    const arText = await child.locator('.req-ar-part').textContent();
    console.log('child AR:', arText.trim());
    await page.screenshot({ path: '/tmp/b2-board-light.png' });
  }
  await page.close();
}
await browser.close();
