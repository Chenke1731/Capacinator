// Headless verification: 人力线 (person page inline adjust + pause/resume)
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'dark');
});

const personId = '5b734589-1c45-4b20-b380-2af910cd583b'; // 张前端
await page.goto(`${BASE}/people/${personId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 1. assignments table shows rows incl. scenario-written ones (upcoming too)
const rows = await page.$$eval('table tbody tr', (els) => els.map((e) => e.textContent || ''));
const hasThree = rows.filter((r) => r.includes('问题单支持') || r.includes('项目事务') || r.includes('数据平台升级'));
check('person page shows all 3 assignments (incl. upcoming)', hasThree.length >= 3, `matched=${hasThree.length}`);

// 2. inline edit affordance on allocation (scope to the assignments table row)
const rowHandle = await page.$('table tbody tr:has-text("数据平台升级")');
const rowEditable = rowHandle ? await rowHandle.$('.inline-editable') : null;
check('allocation inline-edit affordance in assignments row', !!rowEditable);

// 3. pause button on a row
const pauseBtn = await page.$('table button:has-text("暂停")');
check('pause action present', !!pauseBtn);

// 4. pause → API status flips; resume restores
if (pauseBtn) {
  await page.click('table button:has-text("暂停")');
  await page.waitForTimeout(1500);
  const resp = await page.request.get(`${API}/api/people/${personId}`);
  const body = await resp.json();
  const data = body.data ?? body;
  const pausedOk = (data.assignments || []).some((a) => a.status === 'paused');
  check('pause flips assignment status', pausedOk);
  const resumeBtn = await page.$('table button:has-text("恢复")');
  check('resume action appears', !!resumeBtn);
  if (resumeBtn) {
    await page.click('table button:has-text("恢复")');
    await page.waitForTimeout(1500);
    const resp2 = await page.request.get(`${API}/api/people/${personId}`);
    const body2 = await resp2.json();
    const data2 = body2.data ?? body2;
    check(
      'resume restores active',
      ((data2.assignments || []).length > 0) && (data2.assignments || []).every((a) => a.status === 'active')
    );
  }
} else {
  check('pause flips assignment status', false, 'no pause button');
}

// 5. inline allocation edit flow (click → input appears → Esc cancels)
if (rowEditable) {
  await page.click('table tbody tr:has-text("数据平台升级") .inline-editable');
  await page.waitForTimeout(300);
  const input = await page.$('.inline-edit-input');
  check('inline edit input opens on click', !!input);
  if (input) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('escape closes without saving', !(await page.$('.inline-edit-input')));
  }
} else {
  check('inline edit input opens on click', false);
}

// 6. allocation chart section renders (人力线消耗可视化)
await page.waitForTimeout(1500);
const chartVisible = await page.$('.recharts-wrapper, .recharts-surface');
check('allocation timeline chart renders', !!chartVisible);

// 7. zero page errors
check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await page.screenshot({ path: '/tmp/person-line.png', fullPage: false });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
