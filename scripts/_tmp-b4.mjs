/* B4 迭代导航页 v1 临时自验证脚本(跑完即删) */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const EXE = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
};

async function newPage(theme) {
  const browser = await chromium.launch({ executablePath: EXE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(([t]) => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', t);
  }, [theme]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  return { browser, context, page, pageErrors };
}

const { browser, page, pageErrors } = await newPage('light');
try {
  await page.goto(`${BASE}/iterations`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.it-card', { timeout: 15000 });

  // ① 3 张迭代卡 + 季度分组 + 11月卡统计
  const cards = page.locator('.it-card');
  ok('① 迭代卡数量=3', (await cards.count()) === 3, `实际 ${await cards.count()}`);
  const quarter = await page.locator('.it-group-title').first().textContent();
  ok('① 季度分组标题 26.RP4', quarter?.trim() === '26.RP4', String(quarter));
  const novHead = page.locator('.it-card-head', { hasText: '门户项目11月迭代' });
  const novSummary = await novHead.locator('.it-card-summary').textContent();
  ok('① 11月卡事项数=3', /3 项/.test(novSummary ?? ''), String(novSummary));
  ok('① 11月卡 SE·MDE·开发人月', /SE 1 .*MDE 1\.2 .*开发 0 人月/.test(novSummary ?? ''), String(novSummary));
  const windowText = await novHead.locator('.it-card-window').textContent();
  ok('① 11月卡窗口 mono 文本', (windowText ?? '').includes('2026-11-01'), String(windowText));

  // ② 展开卡 → 事项清单
  await novHead.click();
  await page.waitForSelector('.it-card-body .it-item-row', { timeout: 8000 });
  const itemNames = await page.locator('.it-card--open .it-item-name').allTextContents();
  ok('② 展开见 3 条事项', itemNames.length === 3 && itemNames.includes('门户首页改版') && itemNames.includes('数据平台升级') && itemNames.includes('门户登录改造'), itemNames.join('/'));
  const stateRow = await page.locator('.it-card--open .it-state-chip').allTextContents();
  ok('② 状态分布中文', stateRow.some((s) => s.includes('设计中')) && stateRow.some((s) => s.includes('已启动迭代')), stateRow.join('|'));

  // ① MDE 负载: 赵设计 强度≈120% 且琥珀
  const zhaoRow = page.locator('.it-load-row--over', { hasText: '赵设计' });
  const zhaoText = await zhaoRow.textContent();
  ok('① MDE 负载含赵设计(琥珀行)', (await zhaoRow.count()) === 1, String(zhaoText));
  ok('① 赵设计 强度≈120%(124%)', /赵设计 · 3 项 · 1\.2 人月 · 强度 124%/.test((zhaoText ?? '').replace(/\s+/g, ' ')), String(zhaoText));

  // ③ 未排池
  const pool = page.locator('.it-unassigned');
  const poolNames = await pool.locator('.it-item-name').allTextContents();
  ok('③ 未排池含 移动端改版+客户门户改版', poolNames.includes('移动端改版') && poolNames.includes('客户门户改版'), poolNames.join('/'));

  // ④ 新建迭代 → 出现 → 删除(空)成功
  await page.getByRole('button', { name: '新建迭代' }).click();
  await page.locator('.it-create-form input[placeholder*="门户项目1月迭代"]').fill('B4验证临时迭代');
  const dates = page.locator('.it-create-form input[type="date"]');
  await dates.nth(0).fill('2027-01-01');
  await dates.nth(1).fill('2027-01-31');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.waitForSelector('.it-card:has-text("B4验证临时迭代")', { timeout: 8000 });
  ok('④ 新建迭代出现', true);
  const newHead = page.locator('.it-card-head', { hasText: 'B4验证临时迭代' });
  await newHead.hover();
  const delBtn = page.locator('.it-card', { hasText: 'B4验证临时迭代' }).locator('.it-icon-btn--danger');
  await delBtn.click(); // 第一次=确认态
  await delBtn.click(); // 第二次=删除
  await page.waitForSelector('.it-card:has-text("B4验证临时迭代")', { state: 'detached', timeout: 8000 });
  ok('④ 空迭代删除成功', true);

  // 截图(浅色)
  await page.screenshot({ path: '/tmp/b4-iterations-light.png', fullPage: true });
} catch (e) {
  ok('执行过程异常', false, String(e).slice(0, 300));
}
ok('⑤ 浅色零 pageerror', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
await browser.close();

// 深色主题
const dark = await newPage('dark');
try {
  await dark.page.goto(`${BASE}/iterations`, { waitUntil: 'networkidle' });
  await dark.page.waitForSelector('.it-card', { timeout: 15000 });
  await dark.page.locator('.it-card-head', { hasText: '门户项目11月迭代' }).click();
  await dark.page.waitForSelector('.it-card-body .it-item-row', { timeout: 8000 });
  await dark.page.screenshot({ path: '/tmp/b4-iterations-dark.png', fullPage: true });
  ok('⑤ 深色渲染+琥珀行存在', (await dark.page.locator('.it-load-row--over').count()) >= 1);
} catch (e) {
  ok('深色执行异常', false, String(e).slice(0, 300));
}
ok('⑤ 深色零 pageerror', dark.pageErrors.length === 0, dark.pageErrors.join(' | ').slice(0, 300));
await dark.browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);
