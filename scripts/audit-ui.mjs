// 全站 UI 审计(2026-09-22): 用生成契约五支柱对全部路由做机器巡检。
// 只读不写: 裸键(D6)/塌陷图标(D4)/碰撞(D5)/对比度(B·D)/横向溢出(D2)/字号档位(战术3)。
// 用法: node scripts/audit-ui.mjs   (浅色另存截图供人眼走查: /tmp/audit-shots/)
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const USER = JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' });
const API = 'http://127.0.0.1:3110/api';

// 动态取详情页 id
const projId = ((await (await fetch(`${API}/projects?limit=1`)).json()).data?.[0]?.id) ?? '';
const personId = 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1';

const PAGES = [
  { name: 'dashboard', path: '/dashboard', core: true },
  { name: 'projects-需求台', path: '/projects', core: true },
  { name: 'projects-问题单台', path: '/projects?tab=tickets' },
  { name: 'projects-事项台', path: '/projects?tab=affairs' },
  { name: 'projects-路线图', path: '/projects?tab=roadmap' },
  { name: 'projects-类型', path: '/projects?tab=types' },
  { name: '项目详情', path: `/projects/${projId}`, core: true },
  { name: 'people', path: '/people', core: true },
  { name: '人员详情', path: `/people/${personId}`, core: true },
  { name: 'assignments', path: '/assignments', core: true },
  { name: 'scenarios', path: '/scenarios' },
  { name: 'settings', path: '/settings' },
  { name: 'reports', path: '/reports' },
  { name: 'audit-log', path: '/audit-log' },
];

const browser = await chromium.launch({ executablePath: CHROME });
fs.mkdirSync('/tmp/audit-shots', { recursive: true });
const report = [];

for (const p of PAGES) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 80)));
    await page.addInitScript(([user, t]) => {
      localStorage.setItem('capacinator_current_user', user);
      localStorage.setItem('capacinator-language', 'zh-CN');
      localStorage.setItem('theme', t);
    }, [USER, theme]);
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 20000 });
    } catch (e) {
      report.push({ page: p.name, theme, fatal: String(e).slice(0, 60) });
      await context.close();
      continue;
    }
    await page.waitForTimeout(1600);
    await page.evaluate(async () => { await document.fonts.ready; });

    const checks = await page.evaluate(() => {
      const out = {};
      // D6 裸键: 可见文本里的 i18n 键形态
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const bare = new Set();
      let n;
      while ((n = walker.nextNode())) {
        const t = n.textContent;
        if (!t || !t.trim()) continue;
        const m = t.match(/\b([a-z-]{3,}:[a-z][a-zA-Z.]{3,})\b/);
        if (m) bare.add(m[1]);
      }
      out.bareKeys = [...bare].slice(0, 5);
      // D4 塌陷图标
      out.collapsedIcons = [...document.querySelectorAll('svg')]
        .filter((s) => {
          const r = s.getBoundingClientRect();
          return (r.width < 2 && r.height >= 8) || (r.height < 2 && r.width >= 8);
        }).map((s) => (s.getAttribute('class') || 'svg').replace('lucide lucide-', 'Ⓛ')).slice(0, 5);
      // 战术3 字号档位
      const fs = new Set();
      document.querySelectorAll('button,span,div,td,th,p,a,label,h1,h2,h3,h4').forEach((e) => {
        if (e.children.length === 0 && e.textContent?.trim()) {
          const r = e.getBoundingClientRect();
          if (r.width > 8 && r.height > 8) fs.add(getComputedStyle(e).fontSize);
        }
      });
      out.fontTiers = fs.size;
      // 战术1 主色按钮计数(粗略: 背景为 accent 的按钮)
      out.overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return out;
    });

    // D5 碰撞(叶子级, 全页)
    const collisions = await page.evaluate(() => {
      const leaves = [...document.querySelectorAll('button,span,td,th,input,select,a,label')].filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const c = getComputedStyle(e);
        if (c.visibility === 'hidden' || c.display === 'none') return false;
        return [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) || e.matches('button,input,select,a');
      });
      const bad = [];
      for (let i = 0; i < leaves.length && bad.length < 800; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          const a = leaves[i].getBoundingClientRect(), b = leaves[j].getBoundingClientRect();
          if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2) {
            const d = (e) => (e.getAttribute('data-testid') || e.className?.toString?.().slice(0, 30) || e.tagName).slice(0, 40);
            bad.push(`${d(leaves[i])} × ${d(leaves[j])}`);
          }
        }
      }
      return bad.slice(0, 4);
    });

    // B/D 对比度(axe)
    let axeCount = -1;
    try {
      const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      axeCount = r.violations.reduce((s, v) => s + v.nodes.length, 0);
    } catch { /* keep -1 */ }

    if (theme === 'light') {
      await page.screenshot({ path: `/tmp/audit-shots/${p.name}.png`, fullPage: false });
    }
    report.push({
      page: p.name, theme, core: p.core,
      bareKeys: checks.bareKeys, collapsedIcons: checks.collapsedIcons,
      collisions, axe: axeCount, fontTiers: checks.fontTiers,
      overflowX: checks.overflowX, pageErrors: errors.slice(0, 2)
    });
    await context.close();
  }
}
await browser.close();

// 汇总打印
const issues = report.filter((r) =>
  r.fatal || (r.bareKeys?.length) || (r.collapsedIcons?.length) || (r.collisions?.length) || r.axe > 0 || r.overflowX || r.fontTiers > 8 || (r.pageErrors?.length)
);
console.log(`\n===== 全站审计: ${report.length} 组合, 其中 ${issues.length} 组合有发现 =====`);
for (const r of issues) {
  const bits = [];
  if (r.fatal) bits.push(`FATAL:${r.fatal}`);
  if (r.bareKeys?.length) bits.push(`裸键×${r.bareKeys.length}: ${r.bareKeys.join(',')}`);
  if (r.collapsedIcons?.length) bits.push(`塌陷图标: ${r.collapsedIcons.join(',')}`);
  if (r.collisions?.length) bits.push(`碰撞×N: ${r.collisions.slice(0, 2).join(' | ')}`);
  if (r.axe > 0) bits.push(`对比度违规:${r.axe}`);
  if (r.overflowX) bits.push('横向溢出');
  if (r.fontTiers > 8) bits.push(`字号档位:${r.fontTiers}`);
  if (r.pageErrors?.length) bits.push(`页面错误:${r.pageErrors.join(';')}`);
  console.log(`[${r.core ? '核心' : '次'}] ${r.page}(${r.theme}): ${bits.join(' || ')}`);
}
fs.writeFileSync('/tmp/audit-report.json', JSON.stringify(report, null, 2));
console.log('\n明细: /tmp/audit-report.json; 浅色截图: /tmp/audit-shots/');
