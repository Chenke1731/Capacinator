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

// 真登录(2026-09-29): 虚拟化后交互断言需要 click,Login 遮罩从此会挡
// 未登录脚本——旧"只塞 user 无 token"在纯 evaluate 时代侥幸工作。
// token 缓存 12min 复用: login 严档 10/15min,反复跑守卫不吃光配额。
import { readFileSync, writeFileSync } from 'node:fs';
const TOKEN_CACHE = '/tmp/verify-boards-token.json';
let auth = null;
try {
  const c = JSON.parse(readFileSync(TOKEN_CACHE, 'utf-8'));
  if (Date.now() - c.ts < 12 * 60 * 1000) auth = c;
} catch { /* no cache */ }
if (!auth) {
  const people = await (await fetch(`${API}/api/people?limit=5`)).json();
  const person = (people.data ?? people)[0];
  const login = await (await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1' }),
  })).json();
  const payload = login.data ?? login;
  if (!payload?.accessToken) {
    console.error(`login failed: ${login.message || login.error || JSON.stringify(login).slice(0, 120)}`);
    process.exit(1);
  }
  auth = { ts: Date.now(), ...payload };
  writeFileSync(TOKEN_CACHE, JSON.stringify(auth));
}
await page.addInitScript((a) => {
  localStorage.setItem('capacinator_current_user', JSON.stringify(a.user ?? { id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('auth_token', a.accessToken);
  localStorage.setItem('refresh_token', a.refreshToken);
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'dark');
  localStorage.removeItem('req-col-widths-v4');
}, auth);
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// ── 1. 三断点列预算 ──
for (const [w, expectCols, label] of [[1600, 13, '中档(藏组件)'], [1680, 14, '全列'], [1366, 9, '紧凑(迭代列0宽)']]) {
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
    const realNames = [...document.querySelectorAll('.requirements-name-text')].filter(e => !e.textContent.includes('load-'));
    const truncated = realNames.some(e => e.scrollWidth > e.clientWidth + 1);
    const allTitled = realNames.filter(e => e.scrollWidth > e.clientWidth + 1).every(e => (e.title || '').trim() === e.textContent.trim());
    const n = [...document.querySelectorAll('.requirements-thead > span')].filter(e => e.getBoundingClientRect().width > 0).length;
    return { s: t.scrollWidth, c: t.clientWidth, truncated, allTitled, n };
  });
  check(`${label} 零横滚`, m.s <= m.c + 1, `s=${m.s}/c=${m.c}`);
  check(`${label} 列数=${expectCols}`, m.n === expectCols, String(m.n));
  if (w >= 1680) check(`${label} 截断行有 title 兜底`, !m.truncated || m.allTitled); // 全列 14 列+gap 实测超容,带附件真名截断是设计内形态(ellipsis),title 全文是硬兜底
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
  // 编辑热区全量扫描(2026-09-29): SE/MDE 空值曾缩到 17px 漏网——单元素断言
  // 只护住量过的那个,按类名族全量扫才能防"同类新格件漏加 width:100%"
  const minEditHit = await page.evaluate(() => {
    const selectors = ['.req-role--se', '.req-role--mde', '.req-effort', '.req-kloc', '.req-number-part', '.req-primary', '.req-pri.req-editable', '.req-tag--filter'];
    let worst = { w: 999, sel: '?', txt: '', missed: [] };
    for (const sel of selectors) {
      let hit = 0;
      document.querySelectorAll(sel).forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width > 0) { hit++; if (r.width < worst.w) worst = { w: Math.round(r.width), sel, txt: (e.textContent || '').trim().slice(0, 4), missed: [] }; }
      });
      // selector self-check: a renamed class would otherwise never match
      // and leave worst.w at 999 — the guard silently always-green
      if (hit === 0) worst.missed.push(sel);
    }
    return worst;
  });
  check(`编辑热区全量 ≥24px (最窄 ${minEditHit.sel}«${minEditHit.txt}» ${minEditHit.w}px)`, minEditHit.w >= 24);
  check('热区选择器全部命中(改名即红,防恒绿静默失效)', (minEditHit.missed ?? []).length === 0,
    `未命中: ${(minEditHit.missed ?? []).join(', ')}`);
  // 专项: 空 SE/MDE 格("—")宽度必须与列宽同级(曾缩到 17px)。
  // 虚拟化下须该行在视口内才量得到,可见范围无空格时跳过不误报。
  const emptyRole = await page.evaluate(() => {
    for (const sel of ['.req-role--se', '.req-role--mde']) {
      for (const e of document.querySelectorAll(sel)) {
        const t = (e.textContent || '').trim();
        if (t === '—' || t === '-' || t === '') {
          return { sel, w: Math.round(e.getBoundingClientRect().width) };
        }
      }
    }
    return null;
  });
  if (emptyRole) {
    check(`空 SE/MDE 热区 ≥40px (${emptyRole.sel} ${emptyRole.w}px)`, emptyRole.w >= 40);
  }
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
  const lines = await page.$$eval('.req-iter-val', els => els.map(e => e.textContent.trim()));
  check('迭代尾行(挂接行+SR派生+未排)', lines.filter(l => l.includes('11-01~11-30')).length >= 3 && lines.some(l => l.includes('未排')), lines.join(','));
  const row = page.locator('.requirements-row', { hasText: '移动端改版' });
  // 虚拟化: 目标行大概率不在初始视口,scrollIntoViewIfNeeded 也等不到
  // (元素不在 DOM)——用产品自己的搜索把目标树筛进视口再交互
  await page.fill('[data-testid="search-input"]', '移动端改版');
  await row.waitFor({ timeout: 8000 });
  await row.locator('.req-iter-val.req-editable').first().click();
  await page.waitForSelector('.iter-pop', { timeout: 5000 });
  await page.locator('.iter-pop-item', { hasText: '11月' }).click();
  await page.waitForTimeout(2000);
  const after = await row.locator('.req-iter-val').first().textContent();
  check('换挂迭代 UI/落库同步', after.includes('11-01'), after.trim());
  // 清搜索恢复全量视图(后续断言不承接受筛态)
  await page.fill('[data-testid="search-input"]', '');
  await page.waitForTimeout(400);
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
  check('详情引用码(CAP-N|#N)', /^(CAP-)?\d+$|^#\d+$/.test(chip), chip);
  await page.goBack(); await page.waitForTimeout(1200);
  await page.fill('[data-testid="search-input"]', chip);
  await page.waitForTimeout(400);
  const hit = await page.$$eval('.requirements-row .requirements-name-text', els => els.map(e => e.textContent.trim()));
  check('#N 搜索精确定位', hit.includes('数据平台升级'), hit.join(','));
  await page.fill('[data-testid="search-input"]', '');
}

// ── 8. ＋AR 与 SR 折叠 ──
{
  await page.locator('.requirements-row', { hasText: '移动端改版' }).first().waitFor({ timeout: 8000 }); // goBack 重挂后虚拟行尚未入 DOM
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
  check(`字号 ≤4 档 (${metrics.sizes})`, metrics.sizes <= 4);
  check(`无 10px 以下文字 (min=${metrics.minFont})`, metrics.minFont >= 10);
  // ── 排版矩阵守卫(2026-09-23): 逐元素断言 (字号,字重,字族) 组合在契约白名单内 ──
  // 白名单外 = FAIL,报告元素类名——纸面契约从此可执行
  const typoMatrix = await page.evaluate(() => {
    /* 二字重终态(2026-09-23 用户"w600 太高"裁决): 400=正文,500=一切强调;
       w600 全灭——与 ONES 对齐(显式字重仅 400+9%,无 600) */
    /* 单一字体终态(2026-09-23 用户"统一字体"裁决): mono 全灭,一切继承 body sans;
       契约简化为 4 档组合(字号×字重),字族维度消失 */
    const CONTRACT = [
      { fs: 14, fw: 400 },
      { fs: 14, fw: 500 },  // 名称列(.requirements-name-text)——注释早已声明,清单漏列
      { fs: 12.5, fw: 400 },
      { fs: 12.5, fw: 500 },  // 名称/主按钮(14/w500)之外无 w500 数据行元素
      { fs: 11, fw: 400 },
      { fs: 11, fw: 500 },
      { fs: 10, fw: 500 },
    ];
    const bad = [];
    document.querySelectorAll('.projects-board span, .projects-board button').forEach((e) => {
      const txt = (e.textContent || '').trim();
      if (!txt && !e.matches('button')) return;
      const rc = e.getBoundingClientRect();
      if (!rc.width || !rc.height) return;
      const c = getComputedStyle(e);
      if (c.display === 'none' || c.visibility === 'hidden') return;
      const fs = parseFloat(c.fontSize);
      const fw = parseInt(c.fontWeight);
      const hit = CONTRACT.some(k => k.fs === fs && k.fw === fw);
      if (!hit) {
        const cls = String(e.className).split(' ')[0].slice(0, 20) || e.tagName;
        bad.push(`${cls}«${txt.slice(0, 8)}» ${fs}px/w${fw}`);
      }
    });
    return bad;
  });
  check(`排版矩阵零偏差 (${typoMatrix.length} 违例)`, typoMatrix.length === 0, typoMatrix.slice(0, 3).join(', '));
  // 弹窗锚定守卫(2026-09-29): 虚拟行的 transform 祖先曾令 fixed 弹窗漂移
  // (useCellPopover 视口坐标失效,弹窗漂到页面异常位置无法编辑)。
  // 断言: 打开标签弹窗后,其视口位置必须在锚点正下方(dx≤8, gap 4~20)。
  {
    const chipSel = '.requirements-row:has([data-testid="tags-edit-btn"]) .req-tag--filter';
    const chip = page.locator(chipSel).first();
    if (await chip.count()) {
      const cb = await chip.boundingBox();
      await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
      await page.waitForTimeout(300);
      const pencil = page.locator('[data-testid="tags-edit-btn"]:visible').first();
      if (await pencil.isVisible().catch(() => false)) {
        await pencil.click();
        await page.waitForTimeout(500);
        const pop = await page.locator('.tags-pop').boundingBox().catch(() => null);
        if (pop) {
          const anchorBox = await chip.boundingBox();
          const dx = Math.abs(pop.x - anchorBox.x);
          const gap = pop.y - (anchorBox.y + anchorBox.height);
          check(`弹窗锚定在触点正下方 (dx=${Math.round(dx)}, gap=${Math.round(gap)})`,
            dx <= 8 && gap >= 2 && gap <= 24);
        } else {
          check('弹窗锚定: 弹窗未打开', false);
        }
      } else {
        check('弹窗锚定守卫: 铅笔不可见(跳过)', true); // hover 竞态时跳过不误报
      }
    }
  }

  // ── 结构不变量守卫(2026-09-29 待排序事故): 全库 DOM 扫描——
  // 任何 computed position:fixed 的元素,其祖先链不得含 transform 容器
  // (虚拟行 translateY 劫持 fixed 的包含块=漂移)。不依赖任何组件清单,
  // 未来新增弹出物自动入护。单点锚定断言只验证交互质量,覆盖证明只认这个。
  // 覆盖两个打开态: 标签弹窗(上文已开) + 生命周期弹窗(此处打开)。
  {
    const lcBadge = page.locator('.lifecycle-badge-btn').first();
    if (await lcBadge.count()) {
      await lcBadge.scrollIntoViewIfNeeded().catch(() => {});
      await lcBadge.click().catch(() => {});
      await page.waitForTimeout(600);
      const lcOpen = await page.evaluate(() => !!document.querySelector('.lc-popover'));
      const bad = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          if (getComputedStyle(el).position !== 'fixed') continue;
          for (let a = el.parentElement; a; a = a.parentElement) {
            if (getComputedStyle(a).transform !== 'none') {
              out.push(`${(el.className || el.tagName).toString().slice(0, 36)}`);
              break;
            }
          }
        }
        return [...new Set(out)];
      });
      check(`fixed 弹出物无 transform 祖先(标签+生命周期双开态) (${bad.length} 违例${lcOpen ? '' : '⚠生命周期弹窗未开'})`,
        bad.length === 0 && lcOpen, bad.join(', ').slice(0, 120));
      await page.keyboard.press('Escape').catch(() => {});
    } else {
      check('fixed 结构扫描: 无生命周期徽章(跳过)', true);
    }
  }
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
  check(`行高两档 {40,43} (${metrics.rowH})`, metrics.rowH.length <= 2 && metrics.rowH.every(h => h === 40 || h === 43));
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
