// 全站对比度违规全量明细(选择器/类名/前景/背景/文本) → 按模式分组修
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = ' ' || 'http://127.0.0.1:3120';
const API = 'http://127.0.0.1:3110/api';
const projId = ((await (await fetch(`${API}/projects?limit=1`)).json()).data?.[0]?.id) ?? '';
const PAGES = [
  ['dashboard', '/dashboard'], ['需求台', '/projects'], ['问题单台', '/projects?tab=tickets'],
  ['事项台', '/projects?tab=affairs'], ['路线图', '/projects?tab=roadmap'], ['类型', '/projects?tab=types'],
  ['项目详情', `/projects/${projId}`], ['people', '/people'],
  ['人员详情', '/people/eb8ecaf7-44a3-4384-a74b-2c18e9e894b1'],
  ['assignments', '/assignments'], ['settings', '/settings'], ['reports', '/reports'], ['audit-log', '/audit-log'],
];
const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
const all = [];
for (const [name, path] of PAGES) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
      localStorage.setItem('capacinator-language', 'zh-CN');
      localStorage.setItem('theme', t);
    }, theme);
    await page.goto(`http://127.0.0.1:3120${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    let r;
    try { r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze(); } catch { await context.close(); continue; }
    for (const v of r.violations) {
      for (const n of v.nodes) {
        const info = await page.evaluate((sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const s = getComputedStyle(e);
          // 找最近的不透明背景
          let bgEl = e, bg = 'rgba(0, 0, 0, 0)';
          for (let k = 0; k < 6 && bgEl; k++) {
            bg = getComputedStyle(bgEl).backgroundColor;
            if (bg && !bg.includes('0, 0, 0, 0)')) break;
            bgEl = bgEl.parentElement;
          }
          return {
            text: (e.textContent || '').trim().slice(0, 16),
            cls: (e.className?.toString?.() || e.tagName).slice(0, 60),
            fg: s.color,
            bg,
            fontSize: s.fontSize, weight: s.fontWeight
          };
        }, n.target[0]).catch(() => null);
        if (info) all.push({ page: name, theme, ...info });
      }
    }
    await context.close();
  }
}
await browser.close();
// 按 类名+fg+bg 分组计数
const groups = {};
for (const x of all) {
  const k = `[${x.theme}] ${x.cls} fg=${x.fg} bg=${x.bg}`;
  const g = (groups[k] = groups[k] || { n: 0, pages: new Set(), texts: new Set(), fs: x.fontSize, fw: x.weight });
  g.n++;
  g.pages.add(x.page);
  if (g.texts.size < 3) g.texts.add(x.text);
}
const sorted = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
for (const [k, g] of sorted) {
  console.log(`×${g.n} ${k} ${g.fs}/${g.fw} 页:${[...g.pages].slice(0, 5).join(',')} 文:${[...g.texts].join('/')}`);
}
console.log(`\n总计 ${all.length} 条, ${sorted.length} 个模式`);
