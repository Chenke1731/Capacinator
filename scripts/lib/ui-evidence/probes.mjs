// Evidence probes: page-side measurements for the intake pilot.
// Every probe returns plain JSON; no assertions live here so the same evidence
// can be re-read after a fix or a mutation.
import {parsePayload} from './runner.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export const intakeSelectors={
  target:'[data-testid="inbox-capture-btn"]',
  ancestors:['.unified-tab-content','.intake-toolbar','.intake-filters'],
  rowControls:['.intake-filters .intake-filter','.intake-filters .btn'],
  captureDialog:'[data-testid="quick-capture-dialog"]',
  captureText:'[data-testid="intake-text"]',
  captureRef:'[data-testid="intake-ref"]',
  captureFinish:'[data-testid="intake-finish"]',
  captureChips:'[data-testid="intake-parsed-chips"]',
  captureSubmit:'[data-testid="intake-submit"]',
  captureError:'[data-testid="intake-capture-error"]',
  deleteButton:'[data-testid^="intake-delete-"]',
  confirmDialog:'[data-testid="confirm-dialog"]',
  legacyModal:'.modal',
  closeButton:'.dialog-close-btn, .modal-close',
};

async function measureTarget(page,{targetSelector,ancestorSelectors,rowControls}){
  return page.evaluate(({targetSelector,ancestorSelectors,rowControls})=>{
    const info=el=>{
      if(!el)return null;
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return {
        tag:el.tagName?el.tagName.toLowerCase():null,
        cls:typeof el.className==='string'?el.className.slice(0,120):'',
        testid:el.getAttribute?.('data-testid')??null,
        text:(el.textContent||'').trim().slice(0,80),
        ariaLabel:el.getAttribute?.('aria-label')??null,
        title:el.getAttribute?.('title')??null,
        rect:{x:+r.x.toFixed(2),y:+r.y.toFixed(2),top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)},
        computed:{height:cs.height,minHeight:cs.minHeight,transform:cs.transform,translate:cs.translate,boxShadow:cs.boxShadow,outline:`${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,outlineOffset:cs.outlineOffset,position:cs.position,overflow:cs.overflow,overflowX:cs.overflowX,overflowY:cs.overflowY,paddingTop:cs.paddingTop,borderTopWidth:cs.borderTopWidth,zIndex:cs.zIndex,pageTopGap:cs.getPropertyValue('--page-top-gap').trim()},
        scroll:{scrollTop:el.scrollTop,clientTop:el.clientTop,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight}
      };
    };
    const target=document.querySelector(targetSelector);
    if(!target)throw new Error(`Missing target ${targetSelector}`);
    const ancestors=ancestorSelectors.map(selector=>{
      const el=document.querySelector(selector);
      return el?{selector,...info(el)}:{selector,missing:true};
    });
    const rows=rowControls.map(selector=>({selector,elements:[...document.querySelectorAll(selector)].map(info)}));
    const r=target.getBoundingClientRect();
    const topY=Math.max(0,Math.min(innerHeight-1,r.top+0.5));
    const topEl=document.elementFromPoint(r.left+r.width/2,topY);
    return {
      viewport:{width:innerWidth,height:innerHeight},
      target:{selector:targetSelector,...info(target)},
      ancestors,
      rows,
      elementAtTop:topEl?{tag:topEl.tagName.toLowerCase(),cls:typeof topEl.className==='string'?topEl.className.slice(0,120):'',testid:topEl.getAttribute('data-testid'),text:(topEl.textContent||'').trim().slice(0,60),isTarget:topEl===target||target.contains(topEl)}:null,
      activeElement:info(document.activeElement)
    };
  },{targetSelector,ancestorSelectors,rowControls});
}

export async function captureTarget(page,{shotDir,width}){
  await page.locator(intakeSelectors.target).first().waitFor({state:'visible'});
  const staticState=await measureTarget(page,{
    targetSelector:intakeSelectors.target,
    ancestorSelectors:intakeSelectors.ancestors,
    rowControls:intakeSelectors.rowControls,
  });

  const ancestorTop=staticState.ancestors.find(a=>a.selector==='.unified-tab-content')?.rect?.top??staticState.target.rect.top;
  const clip={
    x:Math.max(0,Math.floor(staticState.target.rect.left-40)),
    y:Math.max(0,Math.floor(ancestorTop-40)),
    width:Math.max(1,Math.min(staticState.viewport.width-Math.max(0,Math.floor(staticState.target.rect.left-40)),Math.ceil(staticState.target.rect.width+80))),
    height:Math.max(1,Math.min(staticState.viewport.height-Math.max(0,Math.floor(ancestorTop-40)),160)),
  };

  await page.locator(intakeSelectors.target).first().hover();
  await wait(400);
  const hoverState=await measureTarget(page,{
    targetSelector:intakeSelectors.target,
    ancestorSelectors:intakeSelectors.ancestors,
    rowControls:intakeSelectors.rowControls,
  });
  const shot=`${shotDir}/target-hover-${width}.png`;
  await page.screenshot({path:shot,clip});

  await page.mouse.move(0,0);
  await wait(400);
  await page.locator(intakeSelectors.target).first().focus();
  await wait(120);
  const focusState=await measureTarget(page,{
    targetSelector:intakeSelectors.target,
    ancestorSelectors:intakeSelectors.ancestors,
    rowControls:intakeSelectors.rowControls,
  });

  return {static:staticState,hover:hoverState,focus:focusState,shot};
}

async function readCaptureFields(page){
  return page.evaluate(({ref,finish,chips})=>({
    ref:document.querySelector(ref)?.value??null,
    finish:document.querySelector(finish)?.value??null,
    chips:(document.querySelector(chips)?.textContent||'').trim(),
  }),{ref:intakeSelectors.captureRef,finish:intakeSelectors.captureFinish,chips:intakeSelectors.captureChips});
}

export async function captureCaptureDialog(page,session){
  await page.locator(intakeSelectors.target).first().click();
  await page.locator(intakeSelectors.captureDialog).waitFor({state:'visible'});
  await page.locator(intakeSelectors.captureText).fill('SR123456 用户登录改造 2026-11-30');
  await wait(300);

  const autoFilled=await readCaptureFields(page);
  await page.locator(intakeSelectors.captureRef).fill('');
  await page.locator(intakeSelectors.captureFinish).fill('');
  await wait(150);
  const cleared=await readCaptureFields(page);

  session.mock('POST','/api/intake',()=>({
    status:200,
    body:{success:true,data:{id:'evidence-capture'},warnings:[]},
  }));
  await page.locator(intakeSelectors.captureSubmit).click();
  await wait(700);

  const request=[...session.requests].reverse().find(item=>item.method==='POST'&&item.pathname==='/api/intake');
  const dialogOpenAfterSubmit=await page.locator(intakeSelectors.captureDialog).isVisible().catch(()=>false);
  const errorText=await page.locator(intakeSelectors.captureError).allInnerTexts().catch(()=>[]);

  if(dialogOpenAfterSubmit){
    await page.keyboard.press('Escape');
    await wait(250);
  }

  return {
    autoFilled,
    cleared,
    payload:parsePayload(request?.payload??null),
    request:request??null,
    dialogOpenAfterSubmit,
    errorText,
  };
}

export async function captureDeleteDialog(page,{injectRemoveRole=false}={}){
  const deleteButton=page.locator(intakeSelectors.deleteButton).first();
  const count=await page.locator(intakeSelectors.deleteButton).count();
  if(count===0)throw new Error('No intake rows: seed the fixture/DB before running the delete-dialog step');
  const trigger=await deleteButton.evaluate(el=>({testid:el.getAttribute('data-testid'),text:(el.textContent||'').trim()}));

  await deleteButton.click();
  const anyDialog=page.locator(`${intakeSelectors.confirmDialog}, ${intakeSelectors.legacyModal}`).first();
  await anyDialog.waitFor({state:'visible'});
  const dialogSelector=await anyDialog.evaluate((el,{radix,legacy})=>el.getAttribute('data-testid')==='confirm-dialog'?radix:legacy,{radix:intakeSelectors.confirmDialog,legacy:intakeSelectors.legacyModal});
  const dialogLocator=page.locator(dialogSelector).first();

  if(injectRemoveRole)await page.evaluate(selector=>{
    const modal=document.querySelector(selector);
    modal?.removeAttribute('role');
    modal?.removeAttribute('aria-modal');
  },dialogSelector);

  const modal=await page.evaluate(({dialogSelector})=>{
    const info=el=>{
      if(!el)return null;
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return {
        tag:el.tagName?el.tagName.toLowerCase():null,
        cls:typeof el.className==='string'?el.className.slice(0,120):'',
        testid:el.getAttribute?.('data-testid')??null,
        text:(el.textContent||'').trim().slice(0,80),
        ariaLabel:el.getAttribute?.('aria-label')??null,
        title:el.getAttribute?.('title')??null,
        rect:{x:+r.x.toFixed(2),y:+r.y.toFixed(2),top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)},
        computed:{height:cs.height,minHeight:cs.minHeight,transform:cs.transform,translate:cs.translate,boxShadow:cs.boxShadow,outline:`${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,outlineOffset:cs.outlineOffset,position:cs.position,overflow:cs.overflow,overflowX:cs.overflowX,overflowY:cs.overflowY,paddingTop:cs.paddingTop,borderTopWidth:cs.borderTopWidth,zIndex:cs.zIndex,pageTopGap:cs.getPropertyValue('--page-top-gap').trim()},
        scroll:{scrollTop:el.scrollTop,clientTop:el.clientTop,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight}
      };
    };
    const m=document.querySelector(dialogSelector);
    const close=m?.querySelector('.dialog-close-btn,.modal-close');
    const title=m?.querySelector('h2,.modal-title');
    const active=document.activeElement;
    const labelledby=m?.getAttribute('aria-labelledby');
    const labelledEl=labelledby?document.getElementById(labelledby):null;
    const siblings=[...document.body.children].filter(el=>m&&!el.contains(m));
    const rendered=el=>{
      const tag=el.tagName?el.tagName.toLowerCase():'';
      if(['script','style','link','meta','template','noscript'].includes(tag))return false;
      if(el.getAttribute('aria-live')||el.getAttribute('role')==='status')return false;
      const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden')return false;
      const r=el.getBoundingClientRect();
      return r.width>0&&r.height>0;
    };
    const backgroundSiblings=siblings.map(el=>({
      tag:el.tagName?el.tagName.toLowerCase():null,
      cls:typeof el.className==='string'?el.className.slice(0,80):'',
      role:el.getAttribute('role'),
      ariaLive:el.getAttribute('aria-live'),
      ariaHidden:el.getAttribute('aria-hidden'),
      inert:el.hasAttribute('inert'),
      rendered:rendered(el),
    }));
    const relevant=siblings.filter(rendered);
    const backgroundIsolated=relevant.length>0&&relevant.every(el=>el.getAttribute('aria-hidden')==='true'||el.hasAttribute('inert'));
    return {
      attributes:{
        role:m?.getAttribute('role')??null,
        ariaModal:m?.getAttribute('aria-modal')??null,
        ariaLabelledby:labelledby??null,
        ariaLabel:m?.getAttribute('aria-label')??null,
        class:m?.className??null,
      },
      ariaLabelledbyText:(labelledEl?.textContent||'').trim(),
      backgroundIsolated,
      backgroundSiblings,
      heading:(title?.textContent||'').trim(),
      close:info(close),
      initialFocus:info(active),
      initialFocusInside:!!(m&&active&&m.contains(active)),
    };
  },{dialogSelector});

  const ariaSnapshot=await dialogLocator.ariaSnapshot().catch(error=>`ERR ${error.message}`);
  const focusTrace=[];
  for(let i=0;i<8;i++){
    focusTrace.push(await page.evaluate(({dialogSelector})=>{
      const info=el=>{
        if(!el)return null;
        return {
          tag:el.tagName?el.tagName.toLowerCase():null,
          text:(el.textContent||'').trim().slice(0,40),
          testid:el.getAttribute?.('data-testid')??null,
          ariaLabel:el.getAttribute?.('aria-label')??null,
          title:el.getAttribute?.('title')??null,
          cls:typeof el.className==='string'?el.className.slice(0,80):'',
        };
      };
      const m=document.querySelector(dialogSelector);
      const e=document.activeElement;
      return {...info(e),insideModal:!!(m&&e&&m.contains(e))};
    },{dialogSelector}));
    await page.keyboard.press('Tab');
    await wait(80);
  }

  await page.keyboard.press('Escape');
  await wait(300);
  const stillOpen=await dialogLocator.isVisible().catch(()=>false);
  if(stillOpen)await page.locator(`${dialogSelector} .dialog-close-btn, ${dialogSelector} .modal-close`).first().click().catch(()=>{});
  const afterClose=await page.evaluate(()=>{
    const e=document.activeElement;
    if(!e)return null;
    return {
      tag:e.tagName?e.tagName.toLowerCase():null,
      text:(e.textContent||'').trim().slice(0,40),
      testid:e.getAttribute?.('data-testid')??null,
      ariaLabel:e.getAttribute?.('aria-label')??null,
      title:e.getAttribute?.('title')??null,
      cls:typeof e.className==='string'?e.className.slice(0,80):'',
    };
  });

  return {
    dialogSelector,
    trigger,
    modal,
    ariaSnapshot:String(ariaSnapshot).slice(0,6000),
    focusTrace,
    afterClose,
    closedByEscape:!stillOpen,
  };
}

const evidenceRow={
  id:'intake-evidence-row',
  title:'证据行',
  raw_text:null,
  source_channel:'internal',
  source_ref:'AUD-E1',
  requester:'张三',
  priority_hint:3,
  expected_start:'2026-12-01',
  expected_finish:'2026-12-31',
  note:null,
  status:'new',
  reject_reason:null,
  converted_project_id:null,
  converted_at:null,
  created_by:null,
  created_at:'2026-11-10T07:15:53.407Z',
  updated_at:'2026-11-10T07:15:53.407Z',
};
const countsBody=newCount=>({success:true,data:{new:newCount,converted:0,rejected:0,by_source:{internal:newCount}}});

const reloadIntake=async page=>{
  await page.reload({waitUntil:'networkidle'});
  await page.locator('table.intake-table').waitFor({state:'visible',timeout:15000});
};

export async function captureStates(page,session,{shotDir,width}){
  if(!session.fixtureSet)throw new Error('states step requires the runtime fixture; do not use --fixture none');
  await page.setViewportSize({width:1366,height:900});
  const states={};

  session.clearMocks();
  session.mock('GET','/api/intake/counts',()=>({status:500,body:{error:'counts failed'}}));
  await reloadIntake(page);
  await page.waitForTimeout(500);
  states.countsError=await page.evaluate(()=>({
    countsText:(document.querySelector('[data-testid="intake-counts"]')?.textContent||'').trim(),
    rows:document.querySelectorAll('tr.intake-row').length,
    alertTexts:[...document.querySelectorAll('[role="alert"],[data-testid="intake-error"]')].map(el=>(el.textContent||'').trim()).filter(Boolean),
  }));

  session.clearMocks();
  await reloadIntake(page);
  session.mock('GET','/api/intake',()=>({status:200,body:{success:true,data:[]}}));
  await page.getByTestId('intake-search').fill('不存在的关键字');
  await page.waitForFunction(()=>document.querySelectorAll('tr.intake-row').length===0,null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(300);
  states.noMatch=await page.evaluate(()=>({
    countsText:(document.querySelector('[data-testid="intake-counts"]')?.textContent||'').trim(),
    rows:document.querySelectorAll('tr.intake-row').length,
    emptyText:(document.querySelector('[data-testid="intake-empty"]')?.textContent||'').trim(),
    errorText:(document.querySelector('[data-testid="intake-error"]')?.textContent||'').trim(),
  }));
  await page.getByTestId('intake-search').fill('');
  session.clearMocks();

  const bulkRows=Array.from({length:200},(_,index)=>({...evidenceRow,id:`intake-bulk-${index}`,title:`批量需求 ${index+1}`,source_ref:`AUD-B${index+1}`}));
  session.mock('GET','/api/intake',()=>({status:200,body:{success:true,data:bulkRows}}));
  session.mock('GET','/api/intake/counts',()=>({status:200,body:countsBody(209)}));
  await page.reload({waitUntil:'networkidle'});
  await page.locator('table.intake-table').waitFor({state:'visible',timeout:15000});
  await page.waitForFunction(()=>document.querySelectorAll('tr.intake-row').length===200,null,{timeout:10000}).catch(()=>{});
  states.bulk=await page.evaluate(()=>({
    countsText:(document.querySelector('[data-testid="intake-counts"]')?.textContent||'').trim(),
    rows:document.querySelectorAll('tr.intake-row').length,
    pagerText:(document.querySelector('[data-testid*="pagination"], .pagination, nav[aria-label*="page" i]')?.textContent||'').trim(),
    hasPager:!!document.querySelector('[data-testid*="pagination"], .pagination, nav[aria-label*="page" i]'),
  }));

  session.clearMocks();
  session.fixtureSet.responses['/api/intake?status=new&limit=200']={status:200,body:{success:true,data:[{...evidenceRow}]}};
  session.fixtureSet.responses['/api/intake/counts']={status:200,body:countsBody(1)};
  await page.setViewportSize({width:1366,height:900});
  await reloadIntake(page);
  states.responsive=await page.evaluate(()=>({
    viewport:{width:innerWidth,height:innerHeight},
    hiddenColumns:{
      requester:getComputedStyle(document.querySelector('.intake-col-requester')??document.body).display,
      expected:getComputedStyle(document.querySelector('.intake-col-expected')??document.body).display,
    },
    rowText:(document.querySelector('tr.intake-row')?.textContent||'').trim().slice(0,300),
  }));
  await page.locator('[data-testid^="intake-toggle-"]').first().click();
  await page.waitForTimeout(300);
  states.responsive.detailText=(await page.locator('tr.intake-detail-row').innerText().catch(()=>'' )).trim().slice(0,800);

  return states;
}

export async function captureTriage(page,session){
  if(!session.fixtureSet)throw new Error('triage step requires the runtime fixture; do not use --fixture none');
  session.clearMocks();
  session.fixtureSet.responses['/api/intake?status=new&limit=200']={status:200,body:{success:true,data:[{...evidenceRow,id:'intake-triage-evidence',title:'期望开始行',source_ref:'AUD-TRIAGE'}]}};
  session.fixtureSet.responses['/api/intake/counts']={status:200,body:countsBody(1)};
  session.fixtureSet.responses['/api/project-sub-types']={status:200,body:{success:true,data:[{project_type_id:'type-evidence',project_type_name:'需求交付',sub_types:[{id:'sub-evidence',name:'标准需求',is_active:1}]}]}};
  session.fixtureSet.responses['/api/people?is_active=true&limit=500']={status:200,body:{data:[]}};
  session.mock('POST','/api/intake/intake-triage-evidence/convert',()=>({
    status:200,
    body:{success:true,data:{project:{id:'project-evidence',name:'期望开始行'},intake:{id:'intake-triage-evidence'},baseline:'unset',baseline_reason:'no_expected_start',phase_count:0,external_number_linked:null,baseline_warnings:[]}},
  }));

  await reloadIntake(page);
  await page.locator('[data-testid="intake-convert-intake-triage-evidence"]').click();
  await page.locator('[data-testid="intake-triage-dialog"]').waitFor({state:'visible'});
  await page.waitForTimeout(600);

  const dialog=await page.evaluate(()=>({
    title:document.querySelector('[data-testid="triage-title"]')?.value??null,
    start:document.querySelector('[data-testid="triage-start"]')?.value??null,
    finish:document.querySelector('[data-testid="triage-finish"]')?.value??null,
    note:(document.querySelector('[data-testid="triage-baseline-note"]')?.textContent||'').trim(),
  }));

  await page.getByTestId('triage-subtype').click();
  await page.waitForTimeout(150);
  await page.getByRole('option').first().click();
  await page.waitForTimeout(150);
  await page.getByTestId('triage-submit').click();
  await page.waitForTimeout(800);

  const request=[...session.requests].reverse().find(item=>item.method==='POST'&&item.pathname==='/api/intake/intake-triage-evidence/convert');
  const dialogOpenAfterSubmit=await page.locator('[data-testid="intake-triage-dialog"]').isVisible().catch(()=>false);
  const errorText=await page.locator('[data-testid="triage-error"]').allInnerTexts().catch(()=>[]);
  if(dialogOpenAfterSubmit){
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  return {
    row:{id:'intake-triage-evidence',title:'期望开始行',expected_start:evidenceRow.expected_start,expected_finish:evidenceRow.expected_finish,requester:evidenceRow.requester},
    dialog,
    payload:parsePayload(request?.payload??null),
    request:request??null,
    dialogOpenAfterSubmit,
    errorText,
  };
}
