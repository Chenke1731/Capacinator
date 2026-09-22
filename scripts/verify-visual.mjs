// 视觉防线: 像素基线 diff + axe 规则扫描 + 几何碰撞,主题×视口矩阵。
// 用法:
//   node scripts/verify-visual.mjs                 # 对比基线(基线缺失的组合自动报警)
//   UPDATE_BASELINES=1 node scripts/verify-visual.mjs   # (重新)采集基线——仅在页面确认无问题时用
// 基线锁定的是采集当日的数据内容;用户改了演示数据导致的 diff 属"内容变化",需人工判断是否回归。
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCollisions, findOverflow } from './lib/layout-guards.mjs';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'visual');
const SHOT_DIR = path.join(DIR, '__screenshots__');
const BUDGET_FILE = path.join(DIR, 'axe-budget.json');
const UPDATE = !!process.env.UPDATE_BASELINES;
const USER = JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' });

// 矩阵: 页面 × 主题 × 视口(核心页加测 1366)
const PAGES = [
  { name: 'projects', path: '/projects' },
  { name: 'people', path: '/people' },
  { name: 'assignments', path: '/assignments' },
  { name: 'dashboard', path: '/dashboard' },
];
const COMBOS = [];
for (const p of PAGES) for (const theme of ['dark', 'light']) COMBOS.push({ ...p, theme, w: 1600, h: 900 });
for (const theme of ['dark', 'light']) COMBOS.push({ name: 'projects', path: '/projects', theme, w: 1366, h: 768 });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
fs.mkdirSync(SHOT_DIR, { recursive: true });
const budget = fs.existsSync(BUDGET_FILE) ? JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')) : {};

for (const combo of COMBOS) {
  const tag = `${combo.name}-${combo.theme}-${combo.w}`;
  const context = await browser.newContext({ viewport: { width: combo.w, height: combo.h } });
  const page = await context.newPage();
  await page.addInitScript(([user, theme]) => {
    localStorage.setItem('capacinator_current_user', user);
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', theme);
  }, [USER, combo.theme]);
  await page.goto(`${BASE}${combo.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.head.appendChild(style);
  });
  await page.waitForTimeout(300);

  // 1. axe: 对比度 + 命中目标(WCAG 工业规则),按预算控制存量
  const axe = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'target-size'])
    .analyze()
    .catch((e) => ({ violations: [], error: String(e) }));
  const key = `${combo.name}-${combo.theme}`;
  const nViol = axe.violations.reduce((s, v) => s + (v.nodes?.length ?? 0), 0);
  const cap = budget[key] ?? nViol;
  if (UPDATE && !axe.error) budget[key] = nViol;
  check(
    `axe ${tag}: 对比度/命中目标违规 ≤ 预算`,
    !axe.error && nViol <= cap,
    axe.error ? `axe出错:${axe.error.slice(0, 40)}` : `${nViol}/${cap}${axe.violations.map((v) => `${v.id}:${v.nodes.length}`).join(' ')}`
  );

  // 2. 几何: 碰撞 + 页面横向溢出
  const collisions = await findCollisions(page, '.unified-tab-content');
  check(`碰撞 ${tag}: 零重叠`, collisions.length === 0, collisions.slice(0, 3).join(' | '));
  const overflow = await findOverflow(page);
  check(`溢出 ${tag}: 无横向滚动`, overflow.length === 0, overflow.join(' | '));

  // 3. 像素基线 diff(遮住页头时钟——它每秒都变)
  const shot = await page.screenshot();
  const file = path.join(SHOT_DIR, `${tag}.png`);
  const grayClock = async (png) => {
    const el = await page.$('.time-display');
    if (!el) return png;
    const { x, y, width, height } = await el.boundingBox();
    const s = png.width / combo.w;
    for (let py = Math.max(0, y * s); py < Math.min(png.height, (y + height) * s); py++) {
      for (let px = Math.max(0, x * s); px < Math.min(png.width, (x + width) * s); px++) {
        const i = (png.width * Math.round(py) + Math.round(px)) << 2;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 128;
      }
    }
    return png;
  };
  const cur = await grayClock(PNG.sync.read(shot));
  if (UPDATE || !fs.existsSync(file)) {
    fs.writeFileSync(file, PNG.sync.write(cur));
    check(`基线 ${tag}: 已采集`, true);
  } else {
    const base = PNG.sync.read(fs.readFileSync(file));
    const { width, height } = base;
    const diff = new PNG({ width, height });
    const n = pixelmatch(base.data, cur.data, diff.data, width, height, {
      threshold: 0.1,
      includeAA: false,
      alpha: 0.2,
    });
    const ratio = n / (width * height);
    const ok = ratio <= 0.005;
    if (!ok) fs.writeFileSync(path.join(SHOT_DIR, `${tag}.diff.png`), PNG.sync.write(diff));
    check(`像素 ${tag}: 与基线一致(≤0.5%)`, ok, `diff=${(ratio * 100).toFixed(2)}%${ok ? '' : `, 明细见 __screenshots__/${tag}.diff.png`}`);
  }
  await context.close();
}

if (UPDATE) fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}
