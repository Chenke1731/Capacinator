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
    for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c[3]>0){layers.push(c);if(c[3]>=.999)break;}}
    if(!layers.length||layers.at(-1)[3]<.999)return null;
    let b=layers.pop().slice(0,3);while(layers.length)b=over(b,layers.pop());return b;
  };
  const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  window.__auditColor={parse,over,background,ratio};
}

function enumerateState({root,fonts}) {
  const nodes=[...document.querySelectorAll(`${root} button, ${root} [role="button"], ${root} input:not([type="hidden"]), ${root} select, ${root} a, ${root} .clickable`)];
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none';};
  const selector=e=>{
    if(e.dataset.testid)return`[data-testid="${e.dataset.testid}"]`;
    const parts=[];for(let n=e;n&&n!==document.body&&!n.matches(root);n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.tagName===n.tagName):[];parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(n)+1})`);}
    return parts.join(' > ');
  };
  const rows=[],issues=[];
  for(const e of nodes){const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(s.position==='fixed'&&(r.left < -8||r.right>innerWidth+8||r.top < -8||r.bottom>innerHeight+8))issues.push({selector:selector(e),kind:'viewport'});}
  for(const e of nodes.filter(visible)) {
    const r=e.getBoundingClientRect(),s=getComputedStyle(e),sel=selector(e),bg=window.__auditColor.background(e),fg=window.__auditColor.parse(s.color);
    const text=Boolean(e.textContent.trim()||e.matches('input,select'));
    const disabled=e.disabled||e.getAttribute('aria-disabled')==='true';
    const contrast=bg&&fg?window.__auditColor.ratio(window.__auditColor.over(bg,fg),bg):null;
    const row={selector:sel,family:`${e.className}|${e.getAttribute('data-state')??''}`,text:e.textContent.trim().slice(0,30),foreground:s.color,background:s.backgroundColor,effectiveBackground:bg,contrast,textual:text,disabled,width:r.width,height:r.height,font:parseFloat(s.fontSize)};
    rows.push(row);
    if(!disabled&&contrast===null)issues.push({selector:sel,kind:'unknown-background'});
    if(!disabled&&text&&contrast!==null&&contrast<4.5)issues.push({selector:sel,kind:'text-contrast',ratio:contrast});
    if(!disabled&&Math.min(r.width,r.height)<24)issues.push({selector:sel,kind:'target-size',value:Math.min(r.width,r.height)});
    if(fonts&&text&&!fonts.includes(row.font))issues.push({selector:sel,kind:'font-token',value:row.font});
    const hit=document.elementFromPoint(r.left+r.width/2,Math.min(innerHeight-2,r.top+r.height/2));
    if(!disabled&&hit&&!e.contains(hit)&&hit!==e&&!hit.contains(e))issues.push({selector:sel,kind:'occlusion'});
  }
  return {rows,issues};
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
      const context=await browser.newContext({viewport:{width:1600,height:900}});
      const r=await setupReadOnlyPage(context,auth,theme),page=r.page;
      await page.goto(`${auditEnvironment.base}${profile.path}`,{waitUntil:'networkidle'});
      await assertProfileReady(page,profile,auditEnvironment.base);
      await prepareProfile(page,profile);
      await page.evaluate(installContrastHelpers);
      if(await page.locator('html').getAttribute('data-theme')!==theme)throw new Error('Theme did not render');
      const capture=async(state)=>{
        const data=await page.evaluate(enumerateState,{root:profile.root,fonts:profile.fonts});
        assertCoverage(data,profile);
        const axe=await new AxeBuilder({page}).include(profile.root).withRules(['color-contrast','target-size']).analyze();
        data.axe=axe.violations.flatMap(v=>v.nodes.map(n=>({rule:v.id,target:n.target,html:n.html})));
        data.issues.push(...data.axe.map(a=>({selector:a.target.join('|'),kind:`axe:${a.rule}`})));
        const keys=[...new Set(data.issues.map(i=>`${i.selector}|${i.kind}`))].sort();
        const key=`${profileName}|${theme}|${state}`;
        const registered=recordExisting&&!Object.hasOwn(budget,key);
        if(registered){budget[key]=keys;registeredKeys.add(key);}
        const added=keys.filter(k=>!(budget[key]??[]).includes(k));
        if(added.length&&!registered&&!selftest)failed=true;
        report.phases.push({theme,state,...data,newIssues:added});
        console.log(`${added.length&&!registered&&!selftest?'FAIL':'PASS'} ${key}: ${data.rows.length} elements, ${keys.length} existing/current, ${added.length} new${registered?' (first coverage)':''}`);
        return data;
      };
      const initial=await capture('default');
      if(selftest) {
        const first=page.locator(profile.root).locator('button:not(:disabled)').filter({hasText:/\S/}).first();
        await first.evaluate(e=>{e.style.setProperty('color','#fff','important');e.style.setProperty('background','#fff','important');});
        await page.waitForTimeout(600);
        const injected=await page.evaluate(enumerateState,{root:profile.root});
        if(!injected.issues.some(i=>i.kind==='text-contrast'))throw new Error('Contrast injection was not detected');
        await first.evaluate(e=>{e.style.position='fixed';e.style.left='-200px';});
        await page.waitForTimeout(450);
        const out=await page.evaluate(enumerateState,{root:profile.root});if(!out.issues.some(i=>i.kind==='viewport'))throw new Error('Out-of-bounds injection was not detected');
        await page.locator(profile.root).first().evaluate(e=>e.remove());
        const empty=await page.evaluate(enumerateState,{root:profile.root});if(empty.rows.length!==0)throw new Error('Missing-root injection failed');
        let zeroRejected=false;try{assertCoverage(empty,profile);}catch{zeroRejected=true;}if(!zeroRejected)throw new Error('Zero-coverage guard has no teeth');
        console.log(`SELFTEST PASS ${profileName}/${theme}: contrast, viewport, root/zero coverage`);
        await context.close();continue;
      }
      const representatives=new Map();
      for(const row of initial.rows.filter(x=>!x.disabled))if(!representatives.has(row.family+'|'+row.foreground+'|'+row.background))representatives.set(row.family+'|'+row.foreground+'|'+row.background,row.selector);
      if(!representatives.size)throw new Error('Zero hover families');
      for(const [i,selector] of [...representatives.values()].entries()) {
        const control=page.locator(profile.root).locator(selector).first();
        if(await control.count()){await control.hover({force:true});await page.waitForTimeout(450);await capture(`hover-${i}`);}
      }
      await page.mouse.move(0,0);
      let focusReached=false;
      for(let i=0;i<100;i++){await page.keyboard.press('Tab');focusReached=await page.evaluate(r=>!!document.activeElement?.closest(r),profile.root);if(focusReached)break;}
      if(!focusReached)throw new Error('Keyboard focus never reached profile root');
      await capture('keyboard-focus');
      if(profile.safeTriggers) {
        const controls=page.locator(profile.root).locator(profile.safeTriggers);
        const count=await controls.count();if(count>8)throw new Error(`Safe-trigger set exceeds explicit capacity: ${count}; split the prepared states`);
        for(let i=0;i<count;i++){await controls.nth(i).click();await page.waitForTimeout(450);await capture(`opened-${i}`);await page.keyboard.press('Escape');}
      }
      report.writes.push(...r.writes);report.errors.push(...r.errors);
      if(r.writes.length||r.errors.length)failed=true;
      await context.close();
    }
  } finally {await browser.close();}
  if(recordExisting&&registeredKeys.size){
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
