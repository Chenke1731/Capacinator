// Headless: full lifecycle chain advanced FROM THE LIST PAGE (never enters detail)
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const API = 'http://127.0.0.1:3110';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// Trace every transition request to its project — must only ever be P3
page.on('request', (r) => {
  if (r.url().includes('lifecycle/transition')) {
    const projectId = r.url().split('/projects/')[1].split('/lifecycle')[0];
    if (!projectId.includes('89aoh4wyx')) {
      results.push({ name: `UNEXPECTED transition on ${projectId}`, ok: false });
      console.log(`FAIL UNEXPECTED transition on ${projectId}: ${r.postData()}`);
    }
  }
});

await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'dark');
});

const state = async () => {
  const resp = await page.request.get(`${API}/api/projects?limit=50`);
  const body = await resp.json();
  const rows = body.data ?? body;
  const p = rows.find((r) => r.name === '移动端改版');
  return p?.lifecycle_state;
};

await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);

// Row-scoped helpers
const row = () => page.locator('.requirements-row', { hasText: '移动端改版' });
const badge = () => row().locator('.lifecycle-badge-btn');
const quick = () => row().locator('.lifecycle-quick-btn');
const badgeText = async () => (await badge().textContent())?.trim();

check('list shows 待RAT badge + quick button', (await badgeText()) === '待RAT');

// 1. One click: 待RAT → 设计中
await quick().click();
await page.waitForTimeout(1500);
check('one-click 进入设计', (await state()) === 'designing', `state=${await state()}`);
await page.waitForTimeout(1200); // table refetch

// 2. One click: 准入 → 待排序
check('quick button now 准入', (await quick().textContent()) === '准入');
await quick().click();
await page.waitForTimeout(1500);
check('one-click 准入', (await state()) === 'backlog', `state=${await state()}`);
await page.waitForTimeout(1200);

// 3. 排序 popover form: default 开发×2, confirm → 已排序 + pool created
check('quick button now 排序', (await quick().textContent()) === '排序');
await quick().click();
await page.waitForSelector('.lc-popover', { timeout: 5000 });
const headcount = await page.inputValue('.lc-popover input[type="number"]');
check('schedule popover form (default 2)', headcount === '2');
const roleSel = await page.$eval('.lc-popover select', (el) => el.selectedOptions[0]?.textContent);
check('role defaulted to 开发', roleSel === '开发', `role=${roleSel}`);
await page.click('.lc-popover button:has-text("确认排序")');
await page.waitForTimeout(1800);
check('scheduled via popover', (await state()) === 'scheduled', `state=${await state()}`);
const poolResp = await page.request.get(`${API}/api/pool-demands/project/${(await (await page.request.get(`${API}/api/projects?limit=50`)).json()).data.find((r) => r.name === '移动端改版').id}`);
const pools = (await poolResp.json()).data ?? [];
check('pool created from list (开发×2 open)', pools.some((p) => p.status === 'open' && p.headcount === 2));
await page.waitForTimeout(1200);

// 4. Badge popover: full flow-free selector (all 8 states)
await badge().click();
await page.waitForSelector('.lc-state-list', { timeout: 5000 });
const popText = await page.textContent('.lc-popover');
check('badge popover has full selector', popText.includes('设计中') && popText.includes('裁决取消') && popText.includes('当前'));
// reopen drill-down via the 设计中 row (dev-side → designing offers the 3 options)
await page.click('.lc-state-list button:has-text("设计中")');
await page.waitForTimeout(400);
const reopenText = await page.textContent('.lc-popover');
check('reopen 3 options inline', reopenText.includes('暂停开发分配') && reopenText.includes('释放开发分配') && reopenText.includes('仅退回'));
// close via Escape without acting
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes popover', (await page.$$('.lc-popover')).length === 0);

// 5. One click: 启动迭代
await quick().click();
await page.waitForTimeout(1500);
check('one-click 启动迭代', (await state()) === 'in_iteration', `state=${await state()}`);
await page.waitForTimeout(1200);

// 6. One click: 交付 → pool auto-cancelled
await quick().click();
await page.waitForTimeout(1500);
check('one-click 交付', (await state()) === 'delivered', `state=${await state()}`);
const poolResp2 = await page.request.get(`${API}/api/pool-demands/project/${(await (await page.request.get(`${API}/api/projects?limit=50`)).json()).data.find((r) => r.name === '移动端改版').id}`);
const pools2 = (await poolResp2.json()).data ?? [];
check('delivered auto-cancelled pool', pools2.every((p) => p.status !== 'open'));

// 7. Terminal: no quick button, popover says terminal
await page.waitForTimeout(1200);
check('terminal row has no quick button', (await row().locator('.lifecycle-quick-btn').count()) === 0);

// 8. Zero modals + zero page errors throughout
const dialogs = await page.$$('dialog[open], [role="dialog"]');
check('zero modal dialogs', dialogs.length === 0);
check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await page.screenshot({ path: '/tmp/list-lifecycle.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
