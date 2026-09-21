// Headless: 需求/问题单/事项 三台 + 需求台信息密度重做
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

await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'dark');
});

// ── 1. 需求台 (默认 tab) ─────────────────────────────
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const tabLabels = await page.$$eval('[role="tab"], .unified-tab, [data-tab]', () => []).catch(() => []);
check('需求台默认呈现', (await page.$('.requirements-table')) !== null);

const headers = await page.$$eval('.requirements-thead span', els => els.map(e => e.textContent.trim()));
check('新列集(名称/状态/人力/版本/优先级/负责人/操作)',
  ['项目名称','状态','人力','版本','优先级','负责人','操作'].every(h => headers.includes(h)),
  headers.join('|'));

const demandRows = await page.$$eval('.requirements-row', els => els.map(e => e.querySelector('.requirements-name-text')?.textContent));
check('仅需求类事项(3项,缓冲池不混入)', demandRows.length === 3 && !demandRows.includes('问题单支持') && !demandRows.includes('项目事务'),
  demandRows.join(','));

// 告警短词: 数据平台升级(已启动迭代无LOC) → 未评估 chip
const warnedRow = await page.$('.requirements-row--warned');
const chip = warnedRow ? await warnedRow.$('.lifecycle-warn-chip') : null;
check('告警行淡黄底+短词(短词随实际告警集变化)',
  !!warnedRow && !!chip && /缺池|未评估|无粗估|未回填/.test((await chip.textContent())),
  chip ? (await chip.textContent()) : 'none');

// 人力列有数字
const staffingCell = await page.$$eval('.projects-staffing', els => els.map(e => e.textContent.trim()));
check('人力两侧条渲染', staffingCell.length >= 3 && staffingCell.some(s => /[0-9]/.test(s)),
  staffingCell.slice(0, 3).join(' ; '));

// 优先级徽章
const pBadges = await page.$$eval('.projects-priority', els => els.map(e => e.textContent));
check('优先级徽章', pBadges.length >= 3 && pBadges.every(p => /^P\d$/.test(p)), pBadges.join(','));

// ── 2. 版本内联编辑 → 分组出现 ────────────────────────
const p1Row = page.locator('.requirements-row', { hasText: '客户门户改版' });
await p1Row.locator('.projects-version-part').first().click();
await page.waitForTimeout(300);
await page.keyboard.press('Control+a');
await page.keyboard.type('B');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
// release part
await p1Row.locator('.projects-version-part').nth(1).click();
await page.waitForTimeout(300);
await page.keyboard.press('Control+a');
await page.keyboard.type('26.RP4');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);

const groupHeaders = await page.$$eval('.requirements-group-header strong', els => els.map(e => e.textContent));
check('版本编辑后出现产品分组', groupHeaders.includes('B') && groupHeaders.includes('未排版本'), groupHeaders.join(','));
const releaseHeaders = await page.$$eval('.requirements-release-header', els => els.map(e => e.textContent.trim()));
check('RP 交付节奏子分组', releaseHeaders.some(r => r.includes('26.RP4')), releaseHeaders.map(r=>r.slice(0,10)).join(','));

// 分组折叠
await page.click('.requirements-group-header'); // first group (B)
await page.waitForTimeout(400);
const collapsedHidden = await page.$('.requirements-release');
check('分组可折叠', collapsedHidden === null || (await page.$$eval('.requirements-group', els => els.some(e => e.querySelector('.requirements-release') === null))));
await page.click('.requirements-group-header');
await page.waitForTimeout(300);

// 状态就地推进仍在
const quick = p1Row.locator('.lifecycle-quick-btn');
check('状态快捷键保留', (await quick.count()) >= 1, await quick.textContent() ?? '');

// ── 3. 问题单台 ─────────────────────────────────────
await page.click('[role="tab"]:has-text("问题单"), a:has-text("问题单"), button:has-text("问题单")').catch(async () => {
  await page.goto(`${BASE}/projects?tab=tickets`, { waitUntil: 'networkidle' });
});
await page.waitForTimeout(1800);
const ticketsCard = await page.$('.tickets-card');
const ticketsStat = await page.textContent('.tickets-stat').catch(() => '');
check('问题单台: 缓冲卡+人数统计', !!ticketsCard && /\d+ 人/.test(ticketsStat), ticketsStat.trim().slice(0, 40));
const ticketsLedger = await page.$('.tickets-ledger-note');
check('台账占位说明', !!ticketsLedger);

// ── 4. 事项台 ──────────────────────────────────────
await page.goto(`${BASE}/projects?tab=affairs`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const affairRows = await page.$$eval('.affairs-row', els => els.map(e => e.textContent.slice(0, 30)));
check('事项台行卡(项目事务+零星)', affairRows.length >= 1 && affairRows.some(r => r.includes('项目事务')), affairRows.join(' ; ').slice(0, 60));
const monthStat = await page.textContent('.affairs-stat--month').catch(() => '');
check('本月消耗人月', /本月 [\d.]+ 人月/.test(monthStat), monthStat.trim());

// 展开明细
await page.click('.affairs-row').catch(() => {});
await page.waitForTimeout(800);
const affairDetail = await page.$('.affairs-detail');
check('事项展开分配明细', !!affairDetail);

// ── 5. 视口预算看护(2026-09-21 教训: 审计粒度=用户消费单位=视口,不是组件) ──
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
{
  const toolbar = await page.$('.projects-toolbar');
  const filter = await page.$('.filter-bar');
  const firstRow = await page.$('.requirements-row');
  const rows = await page.$$('.requirements-row');
  const tb = toolbar ? Math.round((await toolbar.boundingBox()).height) : 0;
  const fb = filter ? Math.round((await filter.boundingBox()).height) : 0;
  const ry = firstRow ? Math.round((await firstRow.boundingBox()).y) : 9999;
  let visible = 0;
  for (const r of rows) { const b = await r.boundingBox(); if (b.y + b.height <= 900) visible++; }
  check('首屏包装克制(工具栏+筛选 ≤ 160px)', tb + fb <= 160, `toolbar=${tb} filter=${fb}`);
  check('首条数据在 y<450 进入视口', ry < 450, `y=${ry}`);
  check('首屏可见数据行 ≥ 需求总数一半', visible >= Math.ceil(rows.length / 2), `${visible}/${rows.length}`);
  await page.screenshot({ path: '/tmp/boards-fullpage-1600.png', fullPage: false });
}

// ── 6. 全程零错误 + 零弹窗 ────────────────────────────
check('零页面错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
const dialogs = await page.$$('dialog[open], [role="dialog"]');
check('零模态弹窗', dialogs.length === 0);

await page.screenshot({ path: '/tmp/demand-board.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
