// 列宽拖拽真机点检: 拖宽生效 / localStorage 持久化(重载后仍在) / 双击重置 / 拖宽超容器出横向滚动。
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'light');
});
await page.goto('http://localhost:3120/projects');
await page.waitForSelector('.requirements-row');

const colWidth = (idx) =>
  page.evaluate((i) => document.querySelectorAll('.requirements-thead > span')[i].getBoundingClientRect().width, idx);

// ── 1. 拖宽标签列 +120 ──
const before = await colWidth(1);
const grip = page.locator('[data-testid="col-grip-tags"]');
const gb = await grip.boundingBox();
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
await page.mouse.down();
await page.mouse.move(gb.x + gb.width / 2 + 120, gb.y + gb.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await colWidth(1);
check('拖宽标签列 +120px 生效', Math.round(after - before) >= 110, `${Math.round(before)}→${Math.round(after)}`);

// ── 2. 持久化: 重载后列宽仍在 ──
await page.reload();
await page.waitForSelector('.requirements-row');
const reloaded = await colWidth(1);
check('重载后自定义列宽保持', Math.abs(reloaded - after) < 2, `重载后 ${Math.round(reloaded)}`);

// ── 3. 双击重置 ──
await page.locator('[data-testid="col-grip-tags"]').dblclick();
await page.waitForTimeout(300);
const resetW = await colWidth(1);
check('双击手柄重置该列', Math.abs(resetW - before) < 4, `${Math.round(resetW)} ≈ 默认 ${Math.round(before)}`);
const storeAfter = await page.evaluate(() => localStorage.getItem('req-col-widths-v1'));
check('重置后持久层同步清空', storeAfter === '{}', storeAfter ?? 'null');

// ── 4. 拖宽多列超出容器 → 横向滚动而非挤压 ──
for (const key of ['col-grip-name', 'col-grip-lifecycle', 'col-grip-staffing']) {
  const g = page.locator(`[data-testid="${key}"]`);
  const b = await g.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 160, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => {
  const el = document.querySelector('.requirements-table');
  return { sw: el.scrollWidth, cw: el.clientWidth };
});
check('超宽出现横向滚动(不挤压他列)', overflow.sw > overflow.cw + 20, `scrollWidth=${overflow.sw} > clientWidth=${overflow.cw}`);
const nameNow = await colWidth(0);
check('拖宽后名称列未被挤压到塌陷', nameNow >= 120, `name=${Math.round(nameNow)}`);

// ── 5. 清理: 重置全部 ──
for (const key of ['col-grip-name', 'col-grip-lifecycle', 'col-grip-staffing', 'col-grip-tags']) {
  await page.locator(`[data-testid="${key}"]`).dblclick();
  await page.waitForTimeout(100);
}
await page.evaluate(() => localStorage.removeItem('req-col-widths-v1'));
check('清理完成(持久层清空)', true);

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? '\n列宽拖拽点检全部通过' : `\n${failed} 项失败`);
process.exit(failed ? 1 : 0);
