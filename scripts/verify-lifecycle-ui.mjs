// Headless UI verification of the lifecycle/staffing batch (dev server 3120)
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
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

// Find P3 (pending_rat) via API
const projectsResp = await page.request.get('http://127.0.0.1:3110/api/projects?limit=50');
const projectsData = await projectsResp.json();
const p3 = projectsData.data.find((p) => p.lifecycle_state === 'pending_rat');
const p1 = projectsData.data.find((p) => p.name === '客户门户改版');
check('fixtures ready', !!p3 && !!p1, `P3=${p3?.name}(${p3?.lifecycle_state}) P1=${p1?.lifecycle_state}`);

// 1. ProjectDetail banner on P3 (design side, stepper + AR input + buttons)
await page.goto(`${BASE}/projects/${p3.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.lifecycle-banner', { timeout: 10000 });
const badge = await page.textContent('.lifecycle-state-badge');
check('banner current state badge', badge?.includes('待RAT') || badge?.includes('NOK') || badge?.includes('设计中'), `badge=${badge}`);
const stepperLabels = await page.$$eval('.lifecycle-step-label', (els) => els.map((e) => e.textContent));
check('stepper 7 states', stepperLabels.length === 7, stepperLabels.join(','));
const hasNumberInput = await page.$('.lifecycle-number-input');
check('编号就地输入框存在(SR/AR 统一)', !!hasNumberInput);
const gate = await page.$('.lifecycle-gate');
check('gate marker present', !!gate);
const actionBtns = await page.$$eval('.lifecycle-actions button', (els) => els.map((e) => e.textContent));
check('design-side actions', actionBtns.some((b) => b.includes('进入设计')) && actionBtns.some((b) => b.includes('裁决取消')), actionBtns.join('|'));

// 2. Stepper advance inline: 进入设计 (one click, no dialog)
await page.click('.lifecycle-actions button:has-text("进入设计")');
await page.waitForTimeout(1200);
const badge2 = await page.textContent('.lifecycle-state-badge');
check('advance to 设计中 (one click)', badge2?.includes('设计中'), `badge=${badge2}`);
const dialogs = await page.$$('dialog[open], [role="dialog"]');
check('zero modal dialogs used', dialogs.length === 0);

// 3. Design estimation panel visible (评估 section auto-switched)
await page.click('text=评估').catch(() => {});
await page.waitForTimeout(600);
const designForm = await page.$('#de-pm');
check('design rough estimation form shown', !!designForm);

// 4. Staffing section: side summary + pool button
const summary = await page.textContent('.staffing-summary');
check('staffing side summary strip', !!summary && (summary.includes('设计侧') || summary.includes('开发侧')), summary?.slice(0, 80));
const addPoolBtn = await page.$('button:has-text("池占位")');
check('add pool button present', !!addPoolBtn);

// 5. Advance P3: 准入 without AR → backlog
await page.click('.lifecycle-actions button:has-text("准入")');
await page.waitForTimeout(1200);
const badge3 = await page.textContent('.lifecycle-state-badge');
check('admit one-click → 待排序 (no AR needed)', badge3?.includes('待排序'), `badge=${badge3}`);

// 6. 排序 inline form appears; fill pool 2 devs and confirm
await page.click('.lifecycle-actions button:has-text("排序")');
await page.waitForSelector('.lifecycle-expand', { timeout: 5000 });
check('schedule inline form (no modal)', (await page.$$('.lifecycle-expand')).length > 0);
await page.fill('.lifecycle-expand input[type="number"]', '2');
await page.click('.lifecycle-expand button:has-text("确认排序")');
await page.waitForTimeout(1500);
const badge4 = await page.textContent('.lifecycle-state-badge');
check('scheduled with pool created', badge4?.includes('已排序'), `badge=${badge4}`);
const poolRow = await page.$('.staffing-row--pool');
check('pool row in staffing table', !!poolRow);

// 7. Projects list: state badge + filter
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const listBadges = await page.$$eval('.lifecycle-state-badge', (els) => els.map((e) => e.textContent));
check('projects list lifecycle badges', listBadges.length >= 2, listBadges.slice(0, 6).join(','));

// 8. Restore P3 to pending_rat via API-level SQL is not possible; use direct DB later.
// (Restoration handled by the caller after this script.)

// 9. P1 detail: in_iteration banner + reopen expansion
await page.goto(`${BASE}/projects/${p1.id}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.lifecycle-banner', { timeout: 10000 });
const p1badge = await page.textContent('.lifecycle-state-badge');
check('P1 shows in_iteration', p1badge?.includes('已启动迭代'), `badge=${p1badge}`);
await page.click('.lifecycle-actions button:has-text("退回设计")');
await page.waitForTimeout(600);
const reopenOpts = await page.$$eval('.lifecycle-expand-options button', (els) => els.map((e) => e.textContent));
check('reopen inline 3 options', reopenOpts.length === 3 && reopenOpts.join().includes('暂停'), reopenOpts.join('|'));
await page.click('.lifecycle-expand-options button:has-text("仅退回")');
await page.waitForTimeout(1200);
const p1badge2 = await page.textContent('.lifecycle-state-badge');
check('reopen keep → 设计中', p1badge2?.includes('设计中'), `badge=${p1badge2}`);

// 10. Zero page errors across the walkthrough
check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await page.screenshot({ path: '/tmp/lifecycle-ui-p1.png', fullPage: false });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
