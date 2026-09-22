// 全站结构守卫: 塌陷图标 / 叶子级碰撞 / i18n 裸键 / 横向溢出 / 页面错误 —— 14 路由 × 双主题全必须为零。
// axe 对比度计数只报告不失败(债务由 verify-visual 预算与审计报告管理)。
// 用法: node scripts/verify-site.mjs
// 来源: 2026-09-22 全站审计发现两处 P0 均在 verify-visual 四页矩阵之外——本守卫补上矩阵缺口。
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const USER = JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' });
const API = 'http://127.0.0.1:3110/api';

const projId = ((await (await fetch(`${API}/projects?limit=1`)).json()).data?.[0]?.id) ?? '';
const PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'projects-需求台', path: '/projects' },
  { name: 'projects-问题单台', path: '/projects?tab=tickets' },
  { name: 'projects-事项台', path: '/projects?tab=affairs' },
  { name: 'projects-路线图', path: '/projects?tab=roadmap' },
  { name: 'projects-类型', path: '/projects?tab=types' },
  { name: '项目详情', path: `/projects/${projId}` },
  { name: 'people', path: '/people' },
  { name: '人员详情', path: '/people/eb8ecaf7-44a3-4384-a74b-2c18e9e894b1' },
  { name: 'assignments', path: '/assignments' },
  { name: 'scenarios', path: '/scenarios' },
  { name: 'settings', path: '/settings' },
  { name: 'reports', path: '/reports' },
  { name: 'audit-log', path: '/audit-log' },
];

const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
const contrastInfo = [];

for (const p of PAGES) {
  for (const theme of ['light', 'dark']) {
    const tag = `${p.name}(${theme})`;
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 60)));
    await page.addInitScript(([user, t]) => {
      localStorage.setItem('capacinator_current_user', user);
      localStorage.setItem('capacinator-language', 'zh-CN');
      localStorage.setItem('theme', t);
    }, [USER, theme]);
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => { await document.fonts.ready; });

    const c = await page.evaluate(() => {
      const out = {};
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const bare = new Set();
      let n;
      while ((n = walker.nextNode())) {
        const m = n.textContent?.match(/\b([a-z-]{3,}:[a-z][a-zA-Z.]{3,})\b/);
        if (m && n.textContent.trim()) bare.add(m[1]);
      }
      out.bare = [...bare];
      out.collapsed = [...document.querySelectorAll('svg')].filter((s) => {
        const r = s.getBoundingClientRect();
        return (r.width < 2 && r.height >= 8) || (r.height < 2 && r.width >= 8);
      }).length;
      const leaves = [...document.querySelectorAll('span,button,td,th,a')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width && r.height && getComputedStyle(e).visibility !== 'hidden';
      });
      let collisions = 0;
      for (let i = 0; i < leaves.length && collisions < 3; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
          const a = leaves[i].getBoundingClientRect(), b = leaves[j].getBoundingClientRect();
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) { collisions++; break; }
        }
      }
      out.collisions = collisions;
      out.overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return out;
    });

    let axeCount = -1;
    try {
      const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      axeCount = r.violations.reduce((s, v) => s + v.nodes.length, 0);
    } catch { /* 报告为 -1 */ }
    if (axeCount > 0) contrastInfo.push(`${tag}:${axeCount}`);

    const bad = [];
    if (c.bare.length) bad.push(`裸键:${c.bare.slice(0, 3).join(',')}`);
    if (c.collapsed) bad.push(`塌陷图标×${c.collapsed}`);
    if (c.collisions) bad.push(`碰撞×${c.collisions}`);
    if (c.overflow) bad.push('横向溢出');
    if (errors.length) bad.push(`页面错误:${errors[0]}`);
    if (bad.length) {
      failed++;
      console.log(`FAIL ${tag} — ${bad.join(' | ')}`);
    } else {
      console.log(`PASS ${tag} (对比度 ${axeCount >= 0 ? axeCount : 'n/a'})`);
    }
    await context.close();
  }
}
await browser.close();
console.log(`\n${failed === 0 ? '全站结构守卫通过' : `${failed} 个组合失败`}`);
if (contrastInfo.length) console.log(`对比度债务(报告不失败): ${contrastInfo.join(' ')}`);
process.exit(failed ? 1 : 0);
