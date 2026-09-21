// Headless: popover anchoring across row positions and viewport heights
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });

async function probe(viewportH, rowName) {
  const page = await browser.newPage({ viewport: { width: 1500, height: viewportH } });
  await page.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
  });
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  const badge = page.locator('table tbody tr', { hasText: rowName }).locator('.lifecycle-badge-btn');
  await badge.click();
  await page.waitForSelector('.lc-popover', { timeout: 5000 });
  await page.waitForTimeout(300); // layout-effect reposition settles

  // Anchor = the whole lifecycle cell (what the popover attaches to), post-click
  const anchorBox = await page.locator('table tbody tr', { hasText: rowName }).locator('.lifecycle-cell').boundingBox();
  const popBox = await page.locator('.lc-popover').boundingBox();
  const overlap = popBox && anchorBox &&
    popBox.y < anchorBox.y + anchorBox.height &&
    popBox.y + popBox.height > anchorBox.y;
  const inViewport = popBox && popBox.y >= 0 && popBox.y + popBox.height <= viewportH;
  // adjacency: popover vertical edge within ~12px of the anchor's row band
  const adjacent = popBox && anchorBox &&
    (Math.abs(popBox.y - (anchorBox.y + anchorBox.height)) <= 14 ||
     Math.abs(anchorBox.y - (popBox.y + popBox.height)) <= 14);

  await page.keyboard.press('Escape');
  await page.close();
  return { anchorBox, popBox, overlap, inViewport, adjacent };
}

// 1. Tall viewport, middle row → below, adjacent, not covering the row
{
  const r = await probe(900, '数据平台升级');
  check('900px 中部行: 气泡在视口内', !!r.inViewport, JSON.stringify(r.popBox));
  check('900px 中部行: 紧贴锚点(上/下沿)', !!r.adjacent,
    `anchor y=${r.anchorBox?.y.toFixed(0)} pop y=${r.popBox?.y.toFixed(0)} h=${r.popBox?.height?.toFixed(0)}`);
}

// 2. SHORT viewport (laptop ~700px), middle-lower row — the reported bug:
//    must stay adjacent to the anchor, not fly to the page top
{
  const r = await probe(700, '数据平台升级');
  check('700px 中部行: 气泡在视口内', !!r.inViewport, JSON.stringify(r.popBox));
  check('700px 中部行: 紧贴锚点(上/下沿)', !!r.adjacent,
    `anchor y=${r.anchorBox?.y.toFixed(0)} pop y=${r.popBox?.y.toFixed(0)} h=${r.popBox?.height?.toFixed(0)}`);
}

// 3. Short viewport, LAST row (移动端改版) → flip above or clamp, never detached
{
  const r = await probe(700, '移动端改版');
  check('700px 末行: 气泡在视口内', !!r.inViewport, JSON.stringify(r.popBox));
  check('700px 末行: 紧贴锚点(上/下沿)', !!r.adjacent,
    `anchor y=${r.anchorBox?.y.toFixed(0)} pop y=${r.popBox?.y.toFixed(0)} h=${r.popBox?.height?.toFixed(0)}`);
}

// 4. Schedule form popover (tallest) on the last row, short viewport
{
  const page = await browser.newPage({ viewport: { width: 1500, height: 700 } });
  await page.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
  });
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const row = page.locator('table tbody tr', { hasText: '客户门户改版' });
  const badge = row.locator('.lifecycle-badge-btn');
  // 客户门户改版 is in_iteration → badge popover has 退回设计…/取消 (short)
  await badge.click();
  await page.waitForSelector('.lc-popover', { timeout: 5000 });
  await page.waitForTimeout(300);
  const anchorBox = await row.locator('.lifecycle-cell').boundingBox();
  const popBox = await page.locator('.lc-popover').boundingBox();
  const adjacent = popBox && anchorBox &&
    (Math.abs(popBox.y - (anchorBox.y + anchorBox.height)) <= 14 ||
     Math.abs(anchorBox.y - (popBox.y + popBox.height)) <= 14);
  check('700px 已启动迭代行徽章气泡: 紧贴锚点', !!adjacent,
    `anchor y=${anchorBox?.y.toFixed(0)} pop y=${popBox?.y.toFixed(0)} h=${popBox?.height?.toFixed(0)}`);
  check('700px 已启动迭代行徽章气泡: 在视口内', !!popBox && popBox.y >= 0 && popBox.y + popBox.height <= 700);
  await page.keyboard.press('Escape');
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
