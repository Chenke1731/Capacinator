/**
 * Smoke guard — 一条命令拦截"服务没起来 / 起了一半 / 页面白屏"类事故。
 *
 * 背景:后端曾因重启时端口互踩(EADDRINUSE)静默退出,前端 vite 还活着,
 * 用户表现是"进不去"——没有任何环节报警。此脚本把用户主路径变成可执行断言。
 *
 * 用法:npm run verify:smoke
 * 前置:后端(3110)与前端(3120)应当已启动;本脚本失败 = 发布阻断。
 */
import { chromium } from 'playwright';

const API = process.env.SMOKE_API || 'http://127.0.0.1:3110';
const WEB = process.env.SMOKE_WEB || 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const USER = JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管', email: 'manager@placeholder.local' });

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

// ---------- 1. 后端接口层 ----------
for (const ep of ['/api/health', '/api/people', '/api/scenarios', '/api/projects', '/api/tags']) {
  try {
    const res = await fetch(`${API}${ep}`, { signal: AbortSignal.timeout(5000) });
    check(`API ${ep}`, res.status === 200, `HTTP ${res.status}`);
  } catch (e) {
    check(`API ${ep}`, false, String(e).slice(0, 60));
  }
}

// ---------- 2. 用户主路径(浏览器) ----------
let page;
try {
  const browser = await chromium.launch({ executablePath: CHROME });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 120)));

  await page.addInitScript((user) => {
    localStorage.setItem('capacinator_current_user', user);
    localStorage.setItem('capacinator-language', 'zh-CN');
  }, USER);

  const routes = [
    ['/', '仪表盘', 60],          // [路径, 应包含文字, 最小文本量]
    ['/projects', '项目', 60],
    ['/people', '人员', 60],
    ['/assignments', '分配', 60],
    ['/reports', '报表', 40],
  ];
  for (const [path, keyword, minText] of routes) {
    try {
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1200);
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
      check(`页面 ${path || '/'} 渲染`, text.includes(keyword) && text.length > minText,
        text.length <= minText ? `疑似白屏(${text.length}字)` : `未见「${keyword}」`);
    } catch (e) {
      check(`页面 ${path || '/'} 渲染`, false, String(e).slice(0, 60));
    }
  }
  check('全程无 JS 崩溃', pageErrors.length === 0, pageErrors[0] || '');
  await browser.close();
} catch (e) {
  check('浏览器冒烟', false, String(e).slice(0, 80));
}

// ---------- 结论 ----------
if (failures.length) {
  console.error(`\n❌ 冒烟未通过(${failures.length} 项):${failures.join(' / ')}`);
  process.exit(1);
}
console.log('\n✅ 冒烟全部通过');
