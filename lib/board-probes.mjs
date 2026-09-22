/**
 * 共享探针库(2026-09-23) — 定位效率教训的沉淀:
 * 此前列宽/排版审计靠一次性脚本反复重写(选择器猜错、克隆挂 body 丢作用域
 * 量出伪值、localStorage 样板复制)。收敛为可复用原语,scripts/debug-board.mjs
 * 与后续排查共用。
 */

export const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
export const BASE = 'http://127.0.0.1:3120';
export const USER_ID = 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1';

/** 进页标准样板: 登录态/语言/主题/清列宽存储 */
export async function openBoard(browser, { theme = 'light', vw = 1600, vh = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  await page.addInitScript(([t]) => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', t);
    localStorage.removeItem('req-col-widths-v4');
  }, [theme]);
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return page;
}

/** 列宽审计: 轨道 × 内容自然宽(板内克隆,防作用域污染) × 利用率 */
export async function columnAudit(page) {
  return page.evaluate(() => {
    const board = document.querySelector('.projects-board');
    const table = document.querySelector('.requirements-table');
    const row = document.querySelector('.requirements-row:not(.requirements-row--child):not(.requirements-row--sr)');
    if (!board || !table || !row) return { error: '非需求台或无数据行' };
    const KEY = [
      [/requirements-name/, '名称'], [/--number/, '编号'], [/component/, '组件'],
      [/req-cell-center|lifecycle-cell/, '状态'], [/staff/, '人力'], [/req-scale/, '规模'],
      [/version|release/, '版本/交付'], [/--pri|req-pri/, '优先级'], [/owner/, '负责人'], [/actions/, '操作'],
    ];
    const keyOf = (c) => { for (const [re, k] of KEY) if (re.test(c)) return k; return c.slice(0, 10); };
    const tracks = getComputedStyle(row).gridTemplateColumns.split(' ').map(parseFloat);
    const cells = [...row.children].filter((c) => c.getBoundingClientRect().width > 0);
    const cols = tracks.map((tw, i) => {
      const cell = cells[i];
      if (!cell) return null;
      let natural = 0;
      for (const k of [...cell.children].filter((x) => !String(x.className).includes('req-pencil'))) {
        const c = k.cloneNode(true);
        c.style.cssText += ';position:fixed;visibility:hidden;width:auto;max-width:none;min-width:0;left:-9999px;top:0';
        board.appendChild(c);
        natural = Math.max(natural, Math.round(c.getBoundingClientRect().width));
        c.remove();
      }
      if (!natural) natural = Math.round(cell.getBoundingClientRect().width);
      const track = Math.round(tw);
      return { key: keyOf(String(cell.className)), track, natural, util: Math.round((natural / track) * 100) };
    }).filter(Boolean);
    const actions = document.querySelector('.requirements-actions').getBoundingClientRect();
    const tr = table.getBoundingClientRect();
    return {
      vw: window.innerWidth,
      tier: innerWidth >= 1680 ? '全列' : innerWidth >= 1560 ? '中档' : '紧凑',
      hScroll: table.scrollWidth > table.clientWidth + 1,
      deadZone: Math.round(tr.right - 14 - actions.right),
      cols
    };
  });
}

/** 排版审计: 叶子渲染字号/字重/家族档位 + 最小字号 */
export async function typoAudit(page) {
  return page.evaluate(() => {
    const leaf = new Map();
    document.querySelectorAll('.projects-board *').forEach((e) => {
      const ownText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (e.children.length > 0 || (!ownText && !e.matches('input,select'))) return;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const c = getComputedStyle(e);
      const k = `${c.fontSize}|${c.fontWeight}|${c.fontFamily.includes('mono') ? 'mono' : 'sans'}`;
      leaf.set(k, (leaf.get(k) ?? 0) + 1);
    });
    const sizes = [...new Set([...leaf.keys()].map((k) => parseFloat(k.split('|')[0])))];
    return { tiers: [...leaf.entries()].sort(), sizes: sizes.sort((a, b) => a - b), min: Math.min(...sizes) };
  });
}
