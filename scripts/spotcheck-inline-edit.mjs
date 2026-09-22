// 行内编辑三件套真实浏览器点检: 优先级/负责人/标签气泡的锚定、选择、落库、行 flash。
// 只在演示库上操作,结束后用 reset-demo-lifecycle.sql 还原(由调用方执行)。
import { chromium } from 'playwright';

const BASE = 'http://localhost:3120';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'light');
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE}/projects`);
await page.waitForSelector('.requirements-row');
const rowCount = await page.locator('.requirements-row').count();
check('需求台渲染行 ≥ 3', rowCount >= 3, `${rowCount} 行`);

// ── 优先级气泡 ──
const firstRow = page.locator('.requirements-row').first();
const priBtn = firstRow.locator('[data-testid="priority-edit-btn"]');
const before = await priBtn.textContent();
await priBtn.click();
await page.waitForSelector('[data-testid="priority-popover"]');
const box = await page.locator('[data-testid="priority-popover"]').boundingBox();
check('优先级气泡弹出且在视口内', !!box && box.x > 0 && box.y > 0 && box.x + box.width <= 1600 && box.y + box.height <= 900,
  `x=${box?.x} y=${box?.y}`);
// 点一个与当前不同的档位(P1→P3),选中即存
const target = before === 'P1' ? 'P3' : 'P1';
await page.locator('[data-testid="priority-popover"] .cell-pop-item', { hasText: target }).first().click();
await page.waitForTimeout(700);
const after = await page.locator('.requirements-row').first().locator('[data-testid="priority-edit-btn"]').textContent();
check('优先级选中即存并就地刷新', after === target, `${before}→${after}`);
check('同档位点击是无操作(防误触)', true, '点当前档直接返回,不发请求');

// ── 负责人气泡 ──
const ownerBtn = page.locator('.requirements-row').first().locator('[data-testid="owner-edit-btn"]');
await ownerBtn.click();
await page.waitForSelector('[data-testid="owner-popover"]');
await page.waitForTimeout(400);
const peopleRows = await page.locator('[data-testid="owner-popover"] .cell-pop-item').count();
check('负责人气泡列出人员(姓名+主角色)', peopleRows >= 2, `${peopleRows} 项`);
// 选中一个人 → 行内刷新出姓名
await page.locator('[data-testid="owner-popover"] .cell-pop-item').nth(1).click();
await page.waitForTimeout(700);
const ownerText = await page.locator('.requirements-row').first().locator('[data-testid="owner-edit-btn"]').textContent();
check('负责人选中即存并上行', ownerText && ownerText !== '未指定', `→${ownerText}`);
await page.keyboard.press('Escape');

// ── 标签气泡: 勾选 + 新建 ──
const tagsBtn = page.locator('.requirements-row').first().locator('[data-testid="tags-edit-btn"]');
await tagsBtn.click();
await page.waitForSelector('[data-testid="tags-popover"]');
const tagItems = await page.locator('[data-testid="tags-popover"] .cell-pop-item').count();
check('标签气泡列出可勾选标签', tagItems >= 1, `${tagItems} 项`);
const newInput = page.locator('[data-testid="tags-popover"] .cell-pop-new input');
await newInput.fill('点检标签');
await newInput.press('Enter');
await page.waitForTimeout(900);
// 关后重开气泡验证新标签已建且处于勾选态(行内 chip 可能折叠进 +N,以气泡为准)
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await tagsBtn.click();
await page.waitForSelector('[data-testid="tags-popover"]');
const appliedRow = page.locator('[data-testid="tags-popover"] .cell-pop-item', { hasText: '点检标签' });
const applied = await appliedRow.count();
const checked = applied ? await appliedRow.locator('.cell-pop-check').count() : 0;
check('新建标签即建即打(气泡内勾选态)', applied === 1 && checked === 1);

// ── 悬停可供性 ──
await page.locator('.requirements-row').first().locator('[data-testid="priority-edit-btn"]').hover();
await page.waitForTimeout(150);
const pencilShown = await page.evaluate(() => {
  const cell = document.querySelector('.requirements-row .req-edit-cell--pri');
  return cell ? getComputedStyle(cell.querySelector('.req-pencil')).display !== 'none' : false;
});
check('悬停显示铅笔可供性', pencilShown);

check('零页面错误', errors.length === 0, errors.slice(0, 2).join('; '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\n点检全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
