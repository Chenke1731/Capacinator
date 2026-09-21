// 顺序敏感导航扫描: 同一浏览器上下文里按对抗顺序遍历主路由,
// 断言零页面错误 + 每页内容真实渲染(共享缓存键投毒只在特定访问顺序下爆)
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });

// 每条序列一个全新上下文(缓存隔离), 顺序即攻击面
const SEQUENCES = [
  {
    name: '序列1: 项目↔人员↔分配 交叉往返',
    stops: [
      ['/projects', '需求'],
      ['/people', '人员'],
      ['/projects', '需求'],
      ['/assignments', '分配'],
      ['/people', '人员'],
      ['/reports', '报表'],
      ['/projects', '需求'],
    ]
  },
  {
    name: '序列2: 分配先行(people/phases 键先写)',
    stops: [
      ['/assignments', '分配'],
      ['/projects', '需求'],
      ['/people', '人员'],
      ['/projects', '需求'],
    ]
  },
  {
    name: '序列3: 详情与人员穿插',
    stops: [
      ['/projects/project-1789912193111-zikdnz8c5', '客户门户改版'],
      ['/people', '人员'],
      ['/projects/project-1789912193228-89aoh4wyx', '移动端改版'],
      ['/projects', '需求'],
    ]
  },
  {
    name: '序列4: 三台 tab 轮转',
    stops: [
      ['/projects?tab=tickets', '问题单'],
      ['/projects?tab=affairs', '事项'],
      ['/projects?tab=demand', '需求'],
      ['/projects?tab=tickets', '问题单'],
    ]
  }
];

for (const seq of SEQUENCES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await page.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', 'dark');
  });

  let seqOk = true;
  for (const [url, marker] of seq.stops) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const body = (await page.textContent('body').catch(() => '')) || '';
    const rendered = body.includes(marker) && body.trim().length > 60;
    if (!rendered || errs.length > 0) {
      seqOk = false;
      check(`${seq.name} @ ${url}`, false,
        `marker=${marker} rendered=${rendered} errs=${errs[0] ?? 0}`);
      break;
    }
  }
  if (seqOk) check(`${seq.name} 全程零错误零白屏`, true);
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
