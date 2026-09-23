// 无头看护: 需求台(2026-09-23 板卡重构后) + 迭代闭环
// 依赖 demo 数据: sqlite3 data/capacinator.db < scripts/reset-demo-lifecycle.sql
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
  localStorage.removeItem('req-col-widths-v4');
});
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// ── 1. 三断点列预算 ──
for (const [w, expectCols, label] of [[1600, 12, '中档(藏组件)'], [1680, 13, '全列'], [1366, 9, '紧凑']]) {
  const p2 = await browser.newPage({ viewport: { width: w, height: 900 } });
  await p2.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN'); localStorage.setItem('theme', 'dark');
    localStorage.removeItem('req-col-widths-v4');
  });
  await p2.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1600);
  const m = await p2.evaluate(() => {
    const t = document.querySelector('.requirements-table');
    const truncated = [...document.querySelectorAll('.requirements-name-text')].some(e => e.scrollWidth > e.clientWidth + 1);
    const n = [...document.querySelectorAll('.requirements-thead > span')].filter(e => e.getBoundingClientRect().width > 0).length;
    return { s: t.scrollWidth, c: t.clientWidth, truncated, n };
  });
  check(`${label} 零横滚`, m.s <= m.c + 1, `s=${m.s}/c=${m.c}`);
  check(`${label} 列数=${expectCols}`, m.n === expectCols, String(m.n));
  check(`${label} 名称不截断`, !m.truncated);
  await p2.close();
}

// ── 2. 新列集 ──
const headers = await page.$$eval('.requirements-thead > span', els => els.filter(e => e.getBoundingClientRect().width > 0).map(e => e.textContent.trim()));
check('新列集(代码规模/人力/SE/MDE/实名投入)',
  ['代码规模', '人力(人月)', 'SE', 'MDE', '实名投入'].every(h => headers.includes(h)), headers.join('|'));

// ── 3. 状态单胶囊 ──
{
  const capsules = await page.$$eval('.lifecycle-capsule', els => els.length);
  const adv = await page.$eval('.lifecycle-advance-btn', el => Math.round(Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)));
  const advTitle = await page.$eval('.lifecycle-advance-btn', el => el.getAttribute('title') || '');
  check('状态单胶囊存在', capsules >= 4, String(capsules));
  check('› 命中 ≥24px', adv >= 24, `${adv}px`);
  check('› 有推进提示', /推进到/.test(advTitle), advTitle);
  check('SR 行状态分布位', (await page.$('.req-state-dist')) !== null);
}

// ── 4. 评估链四格 ──
{
  const mdeCell = await page.$$eval('.req-role--mde', els => els.map(e => e.textContent.trim()).filter(Boolean));
  check('MDE 格渲染(赵设计+人月)', mdeCell.some(t => t.includes('赵设计')), mdeCell.slice(0, 3).join(','));
  const effort = await page.$$eval('.req-effort', els => els.map(e => e.textContent.trim()));
  check('人力(人月)格渲染', effort.length >= 5, effort.slice(0, 3).join(','));
  const kloc = await page.$$eval('.req-kloc', els => els.map(e => e.textContent.trim()));
  check('代码规模格渲染', kloc.length >= 5, kloc.slice(0, 3).join(','));
}

// ── 5. 迭代尾行 + 换挂闭环 ──
{
  const lines = await page.$$eval('.req-release-iter', els => els.map(e => e.textContent.trim()));
  check('迭代尾行(挂接行+SR派生+未排)', lines.filter(l => l.includes('11-01~11-30')).length >= 3 && lines.some(l => l.includes('未排')), lines.join(','));
  const row = page.locator('.requirements-row', { hasText: '移动端改版' });
  await row.locator('.req-release-iter').click();
  await page.waitForSelector('.iter-pop', { timeout: 5000 });
  await page.locator('.iter-pop-item', { hasText: '11月' }).click();
  await page.waitForTimeout(2000);
  const after = await row.locator('.req-release-iter').textContent();
  check('换挂迭代 UI/落库同步', after.includes('11-01'), after.trim());
}

// ── 6. 实名投入格 ──
{
  const primaries = await page.$$eval('.req-primary', els => els.map(e => e.textContent.trim()));
  check('实名投入格(人+窗口)', primaries.some(t => /11-01/.test(t)) && primaries.some(t => t.includes('未投入')), primaries.slice(0, 4).join(','));
}

// ── 7. 计数口径 + 引用码闭环 ──
{
  const count = await page.$eval('.board-count', el => el.textContent.trim());
  check('计数含 AR 口径', /共 \d+ 项需求/.test(count) && /含 \d+ 个 AR|0/.test(count) || /·/.test(count), count);
  const plain = page.locator('.requirements-row:not(.requirements-row--sr):not(.requirements-row--child)', { hasText: '数据平台升级' });
  await plain.locator('.requirements-name-text').click();
  await page.waitForSelector('.project-ref-code', { timeout: 8000 });
  const chip = await page.$eval('.project-ref-code', el => el.textContent.trim());
  check('详情引用码(#N)', /^#\d+$/.test(chip), chip);
  await page.goBack(); await page.waitForTimeout(1200);
  await page.fill('[data-testid="search-input"]', chip);
  await page.waitForTimeout(400);
  const hit = await page.$$eval('.requirements-row .requirements-name-text', els => els.map(e => e.textContent.trim()));
  check('#N 搜索精确定位', hit.includes('数据平台升级'), hit.join(','));
  await page.fill('[data-testid="search-input"]', '');
}

// ── 8. ＋AR 与 SR 折叠 ──
{
  const arCount = await page.evaluate(() => {
    const inSr = !!document.querySelector('.requirements-row--sr .req-ar-add');
    const plain = [...document.querySelectorAll('.requirements-row:not(.requirements-row--sr):not(.requirements-row--child)')]
      .find(r => r.textContent.includes('移动端改版'));
    return { inSr, inPlain: !!plain?.querySelector('.req-ar-add') };
  });
  check('＋AR 在名称格(SR+普通行)', arCount.inSr && arCount.inPlain);
  const sr = page.locator('.requirements-row--sr', { hasText: '客户门户改版' });
  await sr.locator('.req-sr-toggle').click(); await page.waitForTimeout(250);
  const folded = await page.locator('.requirements-row--child').count();
  await sr.locator('.req-sr-toggle').click(); await page.waitForTimeout(250);
  check('SR 箭头折叠/展开', folded === 0 && (await page.locator('.requirements-row--child').count()) === 2);
}

// ── 9. 排版契约(3 档+最小 11) ──
{
  const metrics = await page.evaluate(() => {
    const sizes = new Set();
    let minFont = 999;
    document.querySelectorAll('.projects-board *').forEach(el => {
      if (el.textContent?.trim() || el.matches('button,input,select')) {
        const c = getComputedStyle(el);
        if (c.visibility === 'hidden' || c.display === 'none') return;
        sizes.add(c.fontSize);
        minFont = Math.min(minFont, parseFloat(c.fontSize));
      }
    });
    const rows = [...document.querySelectorAll('.requirements-row')].map(r => Math.round(r.getBoundingClientRect().height));
    return { sizes: sizes.size, minFont, rowH: [...new Set(rows)] };
  });
  check(`字号 ≤3 档 (${metrics.sizes})`, metrics.sizes <= 3);
  check(`无 11px 以下文字 (min=${metrics.minFont})`, metrics.minFont >= 11);
  // 色彩纪律(2026-09-23 借鉴裁决 B): 每行饱和底色元素 ≤5,防"满行皆重点=无重点"
  const colorMax = await page.evaluate(() => {
    const sat = (e) => {
      const bg = getComputedStyle(e).backgroundColor;
      const m = bg.match(/[\d.]+/g);
      if (!m || m[3] === '0') return false;
      return Math.max(+m[0], +m[1], +m[2]) - Math.min(+m[0], +m[1], +m[2]) > 12;
    };
    let worst = 0;
    document.querySelectorAll('.requirements-row').forEach((r) => {
      // 头像(身份标识)不计入——纪律管的是状态信号泛滥,身份色同 Jira 头像
      worst = Math.max(worst, [...r.querySelectorAll('*')].filter((e) => !String(e.className).includes('req-avatar') && e.getBoundingClientRect().width > 0 && sat(e)).length);
    });
    return worst;
  });
  check(`行内彩色元素纪律 ≤5/行 (max=${colorMax})`, colorMax <= 5);
  check(`行高恒 40 (${metrics.rowH})`, metrics.rowH.length === 1 && metrics.rowH[0] === 40);
}

// ── 10. 几何碰撞 + 塌陷图标 ──
{
  const bad = await page.evaluate(() => {
    const out = [];
    // 可见矩形: 与所有 overflow!=visible 祖先求交——被裁剪的幽灵矩形不算重叠
    // (2026-09-22 教训,重写守卫时曾丢失)
    const visRect = (el) => {
      let r = el.getBoundingClientRect();
      let p = el.parentElement;
      while (p) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const pr = p.getBoundingClientRect();
          r = { left: Math.max(r.left, pr.left), right: Math.min(r.right, pr.right), top: Math.max(r.top, pr.top), bottom: Math.min(r.bottom, pr.bottom) };
        }
        p = p.parentElement;
      }
      return r;
    };
    document.querySelectorAll('.requirements-row, .requirements-thead').forEach((scope) => {
      const els = [...scope.querySelectorAll('button, span, input, select')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width && r.height && ((e.textContent && e.textContent.trim()) || e.matches('button,input,select'));
      });
      for (let a = 0; a < els.length; a++) for (let b = a + 1; b < els.length; b++) {
        if (els[a].contains(els[b]) || els[b].contains(els[a])) continue;
        const A = visRect(els[a]), B = visRect(els[b]);
        if (A.right - A.left < 8 || B.right - B.left < 8) continue; // 裁剪后的窄条不构成可见重叠
        const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ox > 2 && oy > 2) out.push((els[a].textContent || '').trim().slice(0, 5) + '×' + (els[b].textContent || '').trim().slice(0, 5));
      }
    });
    return [...new Set(out)];
  });
  check('行内零重叠', bad.length === 0, bad.slice(0, 2).join(' | '));
  const collapsed = await page.$$eval('svg', els => els.filter(e => { const r = e.getBoundingClientRect(); return (r.width < 2 && r.height >= 8) || (r.height < 2 && r.width >= 8); }).length);
  check('无塌陷图标', collapsed === 0);
}

// ── 11. 零错误零弹窗 ──
check('零页面错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
check('零模态弹窗', (await page.$$('dialog[open], [role="dialog"]')).length === 0);

await page.screenshot({ path: '/tmp/boards-final-dark.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
