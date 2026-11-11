import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { getProfile, resolveProfile, prepareProfile, auditEnvironment, authenticate, setupReadOnlyPage, assertProfileReady, saveAuditReport } from './ui-profiles.mjs';

/** Browser-native color conversion handles rgb/oklab/color(srgb), including alpha. */
export function installContrastHelpers() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const parse=value=>{
    if(!value||!CSS.supports('color',value))return null;
    ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);
    const c=[...ctx.getImageData(0,0,1,1).data];return[c[0],c[1],c[2],c[3]/255];
  };
  const over=(base,c)=>c.slice(0,3).map((v,i)=>v*(c[3]??1)+base[i]*(1-(c[3]??1)));
  const background=el=>{
    const layers=[];
    // 2026-11-10（availability 首档）：不透明 backgroundColor 先行短路——
    // form-select 的箭头是 background-image 装饰画在不透明底上，整体 bail
    // 会把可解析的白色底误报 unknown-background。透明/半透明底之上仍有
    // image（渐变填充）时维持 bail：无法合成，见 selftest 渐变案例。
    for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);const c=parse(s.backgroundColor);
      if(c&&c[3]>=.999){layers.push(c);break;}
      if(s.backgroundImage!=='none')return null;
      if(c&&c[3]>0)layers.push(c);}
    if(!layers.length||layers.at(-1)[3]<.999)return null;
    let b=layers.pop().slice(0,3);while(layers.length)b=over(b,layers.pop());return b;
  };
  const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  window.__auditColor={parse,over,background,ratio};
}

function enumerateState({root,fonts}) {
  const nodes=[...document.querySelectorAll(`${root} button, ${root} [role="button"], ${root} input:not([type="hidden"]), ${root} textarea, ${root} select, ${root} a, ${root} .clickable, ${root} [role="treeitem"], ${root} [role="combobox"], ${root} [role="checkbox"], ${root} [role="switch"]`)];
  const suppressed=e=>Boolean(e.closest('[aria-hidden="true"],[inert],[hidden]'))||/^rect\(0px,? 0px,? 0px,? 0px\)$/.test(getComputedStyle(e).clip);
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !suppressed(e)&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none';};
  const selector=e=>{
    if(e.dataset.testid)return`[data-testid="${e.dataset.testid}"]`;
    const parts=[];for(let n=e;n&&n!==document.body&&!n.matches(root);n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.tagName===n.tagName):[];parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(n)+1})`);}
    return parts.join(' > ');
  };
  const rows=[],issues=[];
  for(const e of nodes){if(suppressed(e))continue;const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(s.position==='fixed'&&(r.left < -8||r.right>innerWidth+8||r.top < -8||r.bottom>innerHeight+8))issues.push({selector:selector(e),kind:'viewport'});}
  for(const e of nodes.filter(visible)) {
    const r=e.getBoundingClientRect(),s=getComputedStyle(e),sel=selector(e),bg=window.__auditColor.background(e),fg=window.__auditColor.parse(s.color);
    const text=Boolean(e.textContent.trim()||e.matches('input,select'));
    const disabled=e.disabled||e.getAttribute('aria-disabled')==='true';
    const contrast=bg&&fg?window.__auditColor.ratio(window.__auditColor.over(bg,fg),bg):null;
    // 2026-11-10（录入按钮 hover 越界事故）：容器边界几何——最近滚动/裁剪祖先
    // 的 top + 元素相对其的 offsetTop。用相对量比较可免疫"Playwright 滚动
    // 到视口"造成的整页位移，只捕捉元素自身的悬停位移。
    let clip=null;
    for(let n=e.parentElement;n&&n!==document.body;n=n.parentElement){
      const cs=getComputedStyle(n);
      if(cs.overflowY!=='visible'||cs.overflowX!=='visible'){clip=n.getBoundingClientRect().top;break;}
    }
    const row={selector:sel,family:`${e.className}|${e.getAttribute('data-state')??''}`,text:e.textContent.trim().slice(0,30),foreground:s.color,background:s.backgroundColor,effectiveBackground:bg,contrast,textual:text,disabled,width:r.width,height:r.height,font:parseFloat(s.fontSize),top:r.top,clipTop:clip,offsetTop:clip===null?null:r.top-clip};
    rows.push(row);
    if(!disabled&&contrast===null)issues.push({selector:sel,kind:'unknown-background'});
    if(!disabled&&text&&contrast!==null&&contrast<4.5)issues.push({selector:sel,kind:'text-contrast',ratio:contrast});
    if(!disabled&&Math.min(r.width,r.height)<24)issues.push({selector:sel,kind:'target-size',value:Math.min(r.width,r.height)});
    if(fonts&&text&&!fonts.includes(row.font))issues.push({selector:sel,kind:'font-token',value:row.font});
    const hit=document.elementFromPoint(r.left+r.width/2,Math.min(innerHeight-2,r.top+r.height/2));
    if(!disabled&&hit&&!e.contains(hit)&&hit!==e&&!hit.contains(e))issues.push({selector:sel,kind:'occlusion'});
  }
  // 同排工具栏控件等高（2026-11-10 录入按钮事故）：同一 toolbar/filters/filter-bar
  // 行内的控件高度差 >2px 即报——只有更高的那个会顶到容器边界并在悬停时越界。
  // FilterBar（F-06）：裸 select 无 textContent，filters/filter-bar 行内的
  // input/select/textarea 也计入；普通 toolbar 行仍只比文字控件，避免把搜索框
  // 与自定义图标钮混比。
  const rowGroups=new Map();
  // 行容器按“最近匹配祖先”识别（2026-11-10 D-01 B+）：控件常嵌在
  // .filter-item/.filter-group 里，只看直接父级会漏检（report-filters 实测
  // 36 vs 44 未红）。向上 climb 到最近的 toolbar/filters/filter-bar 容器。
  const rowContainer=(e)=>{
    for(let n=e.parentElement;n&&n!==document.body;n=n.parentElement){
      const cls=String(n.className||'');
      if(/(toolbar|filters|filter-bar)/i.test(cls))return n;
      try{if(n.matches(root))break;}catch{/* selector 非法则继续 climb */}
    }
    return null;
  };
  for(const e of nodes.filter(visible)){
    const p=rowContainer(e);if(!p)continue;
    const cls=String(p.className||'');
    // checkbox/radio 是行内标记而非同排控件（16px 属正常尺寸），不参与等高比较
    if(e.tagName==='INPUT'&&/^(checkbox|radio)$/i.test(e.getAttribute('type')||''))continue;
    const isField=/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
    if(isField&&!/(filters|filter-bar)/i.test(cls))continue;
    if(!isField&&!e.textContent.trim())continue;
    if(e.disabled||e.getAttribute('aria-disabled')==='true')continue;
    let key;try{key=selector(p);}catch{continue;}
    const h=e.getBoundingClientRect().height,g=rowGroups.get(key)??{min:Infinity,max:0};
    g.min=Math.min(g.min,h);g.max=Math.max(g.max,h);rowGroups.set(key,g);
  }
  for(const [sel,g] of rowGroups)if(g.max-g.min>2)issues.push({selector:sel,kind:'row-height-mismatch',value:`${g.min}~${g.max}`});
  return {rows,issues};
}

/**
 * 悬停几何不变量（2026-11-10，新机制切片：悬停位移 × 容器边界）：
 * 对比 default 与 hover 两态的同选择器行——元素相对其裁剪容器向上位移，
 * 且位移后距容器顶边 <4px，即判 hover-crosses-container-top。
 * 只比较 offsetTop（相对量）→ 滚动导致的整页位移不误报。
 */
export function checkHoverGeometry(defaultRows, currentRows){
  const issues=[];
  const baseBySelector=new Map((defaultRows??[]).map(r=>[r.selector,r]));
  for(const row of currentRows??[]){
    const base=baseBySelector.get(row.selector);
    if(!base||row.offsetTop==null||base.offsetTop==null)continue;
    const movedUp=row.offsetTop<base.offsetTop-0.5;
    if(movedUp&&row.offsetTop<4){
      issues.push({selector:row.selector,kind:'hover-crosses-container-top',value:`offset ${row.offsetTop.toFixed(1)} (was ${base.offsetTop.toFixed(1)})`});
    }
  }
  return issues;
}

export function assertCoverage(data,profile){
  if(data.rows.length<profile.minElements||data.rows.length>700)throw new Error(`Coverage failed: ${data.rows.length} elements`);
}

export async function runProfileStates(profileName,{selftest=false,quick=false,recordExisting=false,root=process.cwd()}={}) {
  const auth=await authenticate(),profile=await resolveProfile(getProfile(profileName),auth),browser=await chromium.launch({executablePath:auditEnvironment.chrome});
  const report={profile:profileName,phases:[],writes:[],errors:[]};
  const budgetFile=path.join(root,'tests/visual/state-budget.json');
  const budget=fs.existsSync(budgetFile)?JSON.parse(fs.readFileSync(budgetFile,'utf8')):{};
  const registeredKeys=new Set();
  let failed=false;
  try {
    for(const theme of quick?['light']:['light','dark']) {
      // profile 可按需指定视口（1366 档历史事故高发，见 U06/U16）
      const viewport=profile.viewport??{width:1600,height:900};
      const context=await browser.newContext({viewport});
      const r=await setupReadOnlyPage(context,auth,theme),page=r.page;
      await page.goto(`${auditEnvironment.base}${profile.path}`,{waitUntil:'networkidle'});
      await assertProfileReady(page,profile,auditEnvironment.base);
      await prepareProfile(page,profile);
      await page.evaluate(installContrastHelpers);
      if(await page.locator('html').getAttribute('data-theme')!==theme)throw new Error('Theme did not render');
      let hoverBase=null;
      const capture=async(state)=>{
        const floating=profile.floatingRoot&&await page.locator(profile.floatingRoot).filter({visible:true}).count();
        const root=floating?profile.floatingRoot:profile.root;
        const data=await page.evaluate(enumerateState,{root,fonts:profile.fonts});
        data.scope=root;
        // 2026-11-10 新机制切片：悬停位移 × 容器边界（见 checkHoverGeometry）
        // F-08：focus 态同样可能有 padding+负 margin 外扩，纳入同一断言。
        if(state==='default')hoverBase=data.rows;
        else if(hoverBase&&(state.startsWith('hover')||state==='keyboard-focus'))data.issues.push(...checkHoverGeometry(hoverBase,data.rows));
        // Hover/focus can hide hover-only actions or scroll another control
        // into view. The ready/default scene keeps its profile cardinality;
        // subsequent states still enumerate every visible control and reject 0.
        assertCoverage(data,floating?{...profile,minElements:profile.floatingMin??3}:{...profile,minElements:state==='default'?profile.minElements:1});
        const axe=await new AxeBuilder({page}).include(root).withRules(['color-contrast','target-size']).analyze();
        data.axe=axe.violations.flatMap(v=>v.nodes.map(n=>({rule:v.id,target:n.target,html:n.html})));
        data.issues.push(...data.axe.map(a=>({selector:a.target.join('|'),kind:`axe:${a.rule}`})));
        const keys=[...new Set(data.issues.map(i=>`${i.selector}|${i.kind}`))].sort();
        const key=`${profileName}|${theme}|${state}`;
        // Task C closes color debt: old geometry budgets must never absorb a
        // contrast failure when a new profile/state is first registered.
        const colorProblems=data.issues.filter(i=>i.kind==='text-contrast'||i.kind==='axe:color-contrast');
        const registered=recordExisting&&!colorProblems.length&&!Object.hasOwn(budget,key);
        if(registered){budget[key]=keys;registeredKeys.add(key);}
        // N6（批 C 尾项，2026-11-11）预算腐化提示（不拦门，同 lint:ui ALLOWLIST
        // note 先例）：本相位登记在册但当前未再产出的条目——连续多轮未命中即为
        // 陈旧候选（DOM 变更致 nth-of-type 路径失配），修复后应手术清除。
        const stale=(budget[key]??[]).filter(k=>!keys.includes(k));
        if(stale.length&&!registered)console.log(`note: 预算条目当前未命中(陈旧候选,修复后可手术清除) ${key}: ${stale.length} 条`);
        const added=keys.filter(k=>!(budget[key]??[]).includes(k));
        if((added.length&&!registered||colorProblems.length)&&!selftest)failed=true;
        report.phases.push({theme,state,...data,newIssues:added});
        console.log(`${(added.length&&!registered||colorProblems.length)&&!selftest?'FAIL':'PASS'} ${key}: ${data.rows.length} elements, ${keys.length} existing/current, ${added.length} new, ${colorProblems.length} color${registered?' (first coverage)':''}`);
        return data;
      };
      const initial=await capture('default');
      if(selftest) {
        const first=page.locator(profile.root).locator('button:not(:disabled)').filter({hasText:/\S/}).first();
        await first.evaluate(e=>{e.style.setProperty('color','#fff','important');e.style.setProperty('background','#fff','important');});
        await page.waitForTimeout(600);
        const injected=await page.evaluate(enumerateState,{root:profile.root});
        if(!injected.issues.some(i=>i.kind==='text-contrast'))throw new Error('Contrast injection was not detected');
        await first.evaluate(e=>e.style.setProperty('background-image','linear-gradient(white, black)','important'));
        const gradient=await page.evaluate(enumerateState,{root:profile.root});
        if(!gradient.issues.some(i=>i.kind==='unknown-background'))throw new Error('Unknown gradient background was silently accepted');
        await first.evaluate(e=>e.style.setProperty('background-image','none','important'));
        await first.evaluate(e=>{e.style.position='fixed';e.style.left='-200px';});
        await page.waitForTimeout(450);
        const out=await page.evaluate(enumerateState,{root:profile.root});if(!out.issues.some(i=>i.kind==='viewport'))throw new Error('Out-of-bounds injection was not detected');
        await first.evaluate(e=>{e.style.position='';e.style.left='';});
        // 2026-11-10 悬停越界注入自证：把带裁剪容器的元素上移，必须被
        // checkHoverGeometry 抓到（新切片的变异自证，防恒绿防线）。
        const targetRow=initial.rows.find(r=>r.offsetTop!=null);
        if(!targetRow)throw new Error('Hover-cross selftest: no element inside a clipping container');
        const target=page.locator(profile.root).locator(targetRow.selector).first();
        const targetCount=await target.count();
        if(!targetCount)throw new Error('Hover-cross selftest: target selector missing');
        // 精确上移出容器顶边 10px（而非 -500：移出视口会被可见性过滤排除，
        // 枚举不到就谈不上比较——注入必须留在枚举闭包内）
        const shift=Math.round(targetRow.offsetTop+10);
        await target.evaluate((e,dy)=>{e.style.transform=`translateY(-${dy}px)`;},shift);
        await page.waitForTimeout(200);
        const moved=await page.evaluate(enumerateState,{root:profile.root});
        if(!checkHoverGeometry(initial.rows,moved.rows).some(i=>i.kind==='hover-crosses-container-top'))throw new Error('Hover-cross-container injection was not detected');
        await target.evaluate(e=>{e.style.transform='';});
        await page.waitForTimeout(150);
        await page.locator(profile.root).first().evaluate(e=>e.remove());
        const empty=await page.evaluate(enumerateState,{root:profile.root});if(empty.rows.length!==0)throw new Error('Missing-root injection failed');
        let zeroRejected=false;try{assertCoverage(empty,profile);}catch{zeroRejected=true;}if(!zeroRejected)throw new Error('Zero-coverage guard has no teeth');
        console.log(`SELFTEST PASS ${profileName}/${theme}: contrast, unknown gradient, viewport, hover-cross-container, root/zero coverage`);
        await context.close();continue;
      }
      const representatives=new Map();
      for(const row of initial.rows.filter(x=>!x.disabled))if(!representatives.has(row.family+'|'+row.foreground+'|'+row.background))representatives.set(row.family+'|'+row.foreground+'|'+row.background,row.selector);
      if(!representatives.size)throw new Error('Zero hover families');
      for(const [i,selector] of [...representatives.values()].entries()) {
        const control=page.locator(profile.root).locator(selector).first();
        if(await control.count()&&profile.hoverReveal) {
          const point=await control.evaluate((e,selector)=>{const ancestor=e.closest(selector);if(!ancestor)return null;const r=ancestor.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};},profile.hoverReveal);
          if(point)await page.mouse.move(point.x,point.y);
        }
        if(await control.count()){await control.hover({force:true});await page.waitForTimeout(450);await capture(`hover-${i}`);}
      }
      await page.mouse.move(0,0);
      let focusReached=false;
      for(let i=0;i<100;i++){await page.keyboard.press('Tab');focusReached=await page.evaluate(r=>!!document.activeElement?.closest(r),profile.root);if(focusReached)break;}
      if(!focusReached)throw new Error('Keyboard focus never reached profile root');
      await capture('keyboard-focus');
      if(profile.safeTriggers) {
        const controls=page.locator(profile.root).locator(profile.safeTriggers);
        const count=await controls.count();if(!count||count<(profile.requiredTriggers??1))throw new Error('Required safe triggers not found');if(count>8)throw new Error(`Safe-trigger set exceeds explicit capacity: ${count}; split the prepared states`);
        for(let i=0;i<count;i++){await controls.nth(i).click();await page.waitForTimeout(450);await capture(`opened-${i}`);await page.keyboard.press('Escape');}
      }
      report.writes.push(...r.writes);report.errors.push(...r.errors);
      if(r.writes.length||r.errors.length)failed=true;
      await context.close();
    }
  } finally {await browser.close();}
  if(recordExisting&&registeredKeys.size&&!failed){
    const lock=`${budgetFile}.lock`;let fd;
    for(let i=0;i<100;i++){try{fd=fs.openSync(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(resolve=>setTimeout(resolve,20));}}
    if(fd===undefined)throw new Error('Another profile is writing the budget; retry without resetting it');
    try {
      const latest=fs.existsSync(budgetFile)?JSON.parse(fs.readFileSync(budgetFile,'utf8')):{};
      for(const key of registeredKeys){if(Object.hasOwn(latest,key)&&JSON.stringify(latest[key])!==JSON.stringify(budget[key]))throw new Error(`Concurrent initial baseline conflict ${key}`);latest[key]=budget[key];}
      const temporary=`${budgetFile}.${process.pid}.tmp`;fs.writeFileSync(temporary,`${JSON.stringify(latest,null,2)}\n`);fs.renameSync(temporary,budgetFile);
    }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
  const file=saveAuditReport(root,`states-${profileName}${selftest?'-selftest':''}`,report);
  console.log(`State report: ${path.relative(root,file)}`);
  if(failed)throw new Error('New state violation, browser error, or unexpected write; see report');
  return report;
}
