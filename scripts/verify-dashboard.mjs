// 视口预算看护: 仪表盘 (2026-09-21 协议落地——审计粒度=用户消费单位=视口)
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });

for (const width of [1600, 1366]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', 'dark');
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const m = async (sel) => {
    const e = await page.$(sel);
    return e ? await e.boundingBox() : null;
  };

  const toolbar = await m('.dashboard-toolbar');
  const stats = await m('.stats-grid');
  const kpis = await m('.enhanced-kpis .grid');
  const charts = await m('.charts-grid');

  check(`${width}px 工具栏克制(≤90px)`, !!toolbar && toolbar.height <= 90, `h=${Math.round(toolbar?.height ?? -1)}`);
  check(`${width}px 统计卡尽早出现(y<420)`, !!stats && stats.y < 420, `y=${Math.round(stats?.y ?? -1)}`);
  check(`${width}px KPI 四卡一行(≤400px 高)`, !!kpis && kpis.height <= 400, `h=${Math.round(kpis?.height ?? -1)}`);
  check(`${width}px 图表区进首屏(y<900)`, !!charts && charts.y < 900, `y=${Math.round(charts?.y ?? -1)}`);
  check(`${width}px 零页面错误`, pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  if (width === 1600) await page.screenshot({ path: '/tmp/verify-dashboard.png' });
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
