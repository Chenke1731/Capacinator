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
import { getProfile, resolveProfile, prepareProfile, auditEnvironment, authenticate, setupReadOnlyPage, assertProfileReady, saveAuditReport } from './lib/ui-profiles.mjs';
import { assessAxe, pixelOperation } from './lib/visual-budget.mjs';

const BASE = auditEnvironment.base;
const CHROME = auditEnvironment.chrome;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'visual');
const SHOT_DIR = path.join(DIR, '__screenshots__');
const BUDGET_FILE = path.join(DIR, 'axe-budget.json');
const EXCEPTIONS_FILE = path.join(DIR, 'axe-exceptions.json');
const argv=process.argv.slice(2),value=k=>argv.includes(k)?argv[argv.indexOf(k)+1]:undefined;
const valid=new Set(['--profile','--page','--state','--selftest','--help','--record-existing-axe','--capture-fixtures','--inject-test-violation']);
for(let i=0;i<argv.length;i++){if(!valid.has(argv[i]))throw new Error(`Unknown argument ${argv[i]}`);if(['--profile','--page','--state'].includes(argv[i])){if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error(`Missing value for ${argv[i]}`);i++;}}
if(argv.includes('--selftest')){const t=await import('./tests/visual-budget.test.mjs');t.runVisualSelfTests();process.exit(0);}
if(argv.includes('--help')){console.log('verify-visual: [--profile name|--page path] [--state default|hover|focus|phase-hover|phase-edit|create|edit|filter|merge|merge-confirm|compare|compare-results] [--record-existing-axe] [--capture-fixtures]; UPDATE_BASELINES=1 only updates pixels; branch states require scenarios-rich');process.exit(0);}
const UPDATE = process.env.UPDATE_BASELINES==='1';
const REGISTER=argv.includes('--record-existing-axe');
if(value('--profile')&&value('--page'))throw new Error('Select either profile or page');
const FILTER=value('--profile')?getProfile(value('--profile')):value('--page')?getProfile(undefined,value('--page')):null;
const requestedState=value('--state');
const preparedStates=['default','hover','focus','phase-hover','phase-edit','create','edit','filter','merge','merge-confirm','compare','compare-results'];
if(requestedState&&!FILTER)throw new Error('A state requires an explicit profile');
if(requestedState&&!preparedStates.includes(requestedState))throw new Error(`Unsupported prepared state ${requestedState}`);
if(['create','edit','filter','merge','merge-confirm','compare','compare-results'].includes(requestedState)&&!FILTER?.name.startsWith('scenarios'))throw new Error('Scenario states require a scenario profile');
if(['merge','merge-confirm','compare','compare-results'].includes(requestedState)&&FILTER?.name!=='scenarios-rich')throw new Error('Branch states require the controlled scenarios-rich fixture');
if(requestedState?.startsWith('phase-')&&FILTER.name!=='project-detail-phases')throw new Error('Phase states require project-detail-phases');
if(argv.includes('--inject-test-violation')&&(!FILTER||REGISTER))throw new Error('Injection requires a single profile and cannot register exceptions');

// 矩阵: 页面 × 主题 × 视口(核心页加测 1366)
const PAGES = [
  { name: 'projects', path: '/projects', widths: [1600,1366] },
  { name: 'people', path: '/people' },
  { name: 'assignments', path: '/assignments' },
  { name: 'dashboard', path: '/dashboard' },
  // 2026-10 任务B: 路线图入矩阵——151 处主色消费修复的回归防线
  // (真实路由: /projects?tab=roadmap;/projects/roadmap 是重定向)
  { name: 'roadmap', path: '/projects?tab=roadmap', widths: [1600,1366] },
  // 任务B 复审收口: 项目详情页(图表页签样式加载链事故页——reports.css
  // 不在详情页加载,曾出白字白底 1.05:1)。用固定种子行,断链类问题再犯即红
  { name: 'project-detail', path: '/projects/project-1789912193111-zikdnz8c5' },
  { name: 'project-detail-phases', widths: [1600,1366], states: ['default','phase-hover','phase-edit'] },
  { name: 'scenarios', widths: [1600,1366] },
  { name: 'scenarios-rich', widths: [1600,1366], states:['default','create','filter','merge-confirm','compare-results'] },
];
const COMBOS = [];
const selected=FILTER?[{name:FILTER.name,path:FILTER.path,widths:[1600,1366],states:[requestedState??'default']}]:PAGES;
for (const p of selected) for(const state of p.states??['default']) for (const theme of ['dark', 'light']) for(const w of p.widths??[1600]) COMBOS.push({ ...p, state, theme, w, h:w===1600?900:768 });
if(!COMBOS.length)throw new Error('No visual combinations selected');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
fs.mkdirSync(SHOT_DIR, { recursive: true });
const budget = fs.existsSync(BUDGET_FILE) ? JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')) : {};
const originalBudget=JSON.stringify(budget);
const exceptions=fs.existsSync(EXCEPTIONS_FILE)?JSON.parse(fs.readFileSync(EXCEPTIONS_FILE,'utf8')):{};
const auth=await authenticate();
const evidence=[];
try {
for (const combo of COMBOS) {
  const STATE=combo.state;
  const comboStart=results.length;
  const tag = `${combo.name}${STATE==='default'?'':`-${STATE}`}-${combo.theme}-${combo.w}`;
  const context = await browser.newContext({ viewport: { width: combo.w, height: combo.h } });
  const profile=await resolveProfile(getProfile(combo.name),auth);
  const session=await setupReadOnlyPage(context,auth,combo.theme);
  const page = session.page;
  await page.goto(`${BASE}${profile.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await assertProfileReady(page,profile,BASE);
  await prepareProfile(page,profile);
  if(await page.locator('html').getAttribute('data-theme')!==combo.theme)throw new Error(`Theme not rendered ${tag}`);
  if(STATE!=='default') {
    if(['create','edit','filter','merge','merge-confirm','compare','compare-results'].includes(STATE)) {
      if(STATE==='create')await page.locator('.scenarios-page .page-header > button').click();
      else if(STATE==='edit')await page.locator('.hierarchy-row.baseline .action-button.edit').click();
      else if(STATE==='filter')await page.locator('.filter-button').click();
      else if(STATE.startsWith('merge')){await page.locator('.hierarchy-row.branch .action-button.merge').click();await page.locator('[role="dialog"]').waitFor();if(STATE==='merge-confirm')await page.locator('#confirm-merge').click();}
      else {await page.locator('.hierarchy-row.branch .action-button.compare').click();await page.locator('[role="dialog"]').waitFor();if(STATE==='compare-results'){await page.locator('#compare-scenario-select').selectOption('baseline-0000-0000-0000-000000000000');await page.getByRole('dialog').locator('.comparison-actions button').click();await page.locator('.comparison-results').waitFor();}}
      await page.locator(STATE==='filter'?'.filter-dropdown-content':'[role="dialog"]').waitFor({state:'visible'});
    } else {
    const phaseState=STATE.startsWith('phase-');
    const target=page.locator(profile.root).locator(phaseState?'.timeline-container > div:has(> span[style*="white-space"])':combo.name.startsWith('project-detail')?'.chart-tab':'.today-btn, button').first();
    if(phaseState){
      const point=await page.locator(profile.root).evaluate(root=>{
        for(const e of root.querySelectorAll('.timeline-container > div:has(> span[style*="white-space"])')){
          const r=e.getBoundingClientRect(),c=e.parentElement.getBoundingClientRect();
          const left=Math.max(0,r.left,c.left),right=Math.min(innerWidth,r.right,c.right),top=Math.max(42,r.top,c.top),bottom=Math.min(innerHeight,r.bottom,c.bottom);
          if(right-left>12&&bottom-top>12)return{x:(left+right)/2,y:(top+bottom)/2};
        }
        return null;
      });
      if(!point)throw new Error('No visible phase intersects the prepared viewport');
      if(STATE==='phase-hover')await page.mouse.move(point.x,point.y);
      else {await page.mouse.dblclick(point.x,point.y);await page.locator('.modal-overlay').waitFor({state:'visible'});}
    }
    else if(STATE==='hover')await target.hover();
    else {let entered=false;for(let i=0;i<100;i++){await page.keyboard.press('Tab');entered=await page.evaluate(s=>!!document.activeElement?.closest(s),profile.root);if(entered)break;}if(!entered)throw new Error('Focus preparation missed profile');}
    }
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.head.appendChild(style);
  });
  await page.waitForTimeout(300);
  if(argv.includes('--inject-test-violation'))await page.evaluate(()=>{
    const e=document.createElement('button');e.id='audit-injected-bad-contrast';e.textContent='Injected contrast regression';
    e.style.cssText='position:fixed;left:400px;top:400px;z-index:2147483647;color:#eeeeee;background:white;font-size:16px;border:0;padding:12px';document.body.append(e);
  });

  // 1. axe: 对比度 + 命中目标(WCAG 工业规则),按预算控制存量
  const axe = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'target-size'])
    .analyze()
    .catch((e) => ({ violations: [], error: String(e) }));
  const key = `${combo.name}${STATE==='default'?'':`-${STATE}`}-${combo.theme}`;
  const verdict=assessAxe(axe.violations,key,budget,exceptions,{recordExisting:REGISTER});
  const nViol=verdict.count,cap=verdict.cap;
  check(
    `axe ${tag}: 对比度/命中目标违规 ≤ 预算`,
    !axe.error && verdict.ok,
    axe.error ? `axe出错:${axe.error.slice(0, 40)}` : `${nViol}/${cap} new=${verdict.added.length}`
  );

  // 2. 几何: 碰撞 + 页面横向溢出
  const collisionScope=await page.locator('[role="dialog"]').filter({visible:true}).count()?'[role="dialog"]':await page.locator('.modal-overlay').count()?'.modal-overlay':STATE==='filter'?'.filter-dropdown-content':await page.locator('.unified-tab-content').count()?'.unified-tab-content':profile.root;
  if(!await page.locator(collisionScope).count())throw new Error(`Missing collision root ${collisionScope}`);
  const collisions = await findCollisions(page, collisionScope);
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
  const operation=pixelOperation({update:UPDATE,baselineExists:fs.existsSync(file)});
  if (operation==='update') {
    const eligible=results.slice(comboStart).every(r=>r.ok)&&session.writes.length===0&&session.errors.length===0;
    if(eligible)fs.writeFileSync(file, PNG.sync.write(cur));
    check(`基线 ${tag}: ${eligible?'已采集':'前置失败,拒绝更新'}`, eligible);
  } else if(operation==='missing') {
    check(`基线 ${tag}: 缺失,须显式采集`,false);
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
  check(`只读与运行 ${tag}`,session.writes.length===0&&session.errors.length===0,[...session.writes,...session.errors].join(' | '));
  evidence.push({tag,profile:combo.name,path:profile.path,theme:combo.theme,state:STATE,viewport:{width:combo.w,height:combo.h},axe:{count:nViol,cap,added:verdict.added,identities:axe.violations.flatMap(v=>v.nodes.map(n=>({rule:v.id,target:n.target,html:n.html})))},collisions,overflow,writes:session.writes,errors:session.errors,checks:results.slice(comboStart),artifact:path.relative(process.cwd(),file)});
  await context.close();
}

if (REGISTER) {
  if(results.every(r=>r.ok)) {
    fs.writeFileSync(BUDGET_FILE, `${JSON.stringify(budget,null,2)}\n`);
    fs.writeFileSync(EXCEPTIONS_FILE, `${JSON.stringify(exceptions,null,2)}\n`);
  }
} else if(JSON.stringify(budget)!==originalBudget)throw new Error('Pixel update mutated accessibility budgets');
} finally {await browser.close();}
saveAuditReport(process.cwd(),`visual-${FILTER?.name??'matrix'}-${requestedState??'default'}${argv.includes('--inject-test-violation')?'-injection':''}`,{combinations:COMBOS.length,checks:results.length,updatePixels:UPDATE,registerExistingAxe:REGISTER,evidence});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}
