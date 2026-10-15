import {chromium} from 'playwright';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';
import {sourceHash,summarize} from './lib/color-debt.mjs';

if(process.argv.slice(2).some(a=>a!=='--refresh-evidence'))throw Error('Unknown palette audit option');
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try {
  for(const theme of ['light','dark'])for(const width of [1600,1366])for(const mode of ['types','tags','avatars']) {
    const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),page=s.page;
    await page.goto(auditEnvironment.base+'/projects',{waitUntil:'networkidle'});
    await page.evaluate(async mode=>{const m=await import('/client/src/__fixtures__/palette-color-audit.tsx');m.mountPaletteAudit(mode);},mode);
    const selector=mode==='types'?'[role="dialog"] [aria-pressed]':mode==='tags'?'[role="dialog"] .tag-swatch':'#palette-color-audit .req-avatar';
    await page.locator(selector).first().waitFor();await page.evaluate(installContrastHelpers);
    const count=await page.locator(selector).count(),rows=[];
    if(count!==(mode==='types'?10:8))throw Error(`Missing palette coverage ${mode}/${count}`);
    const measure=async(state)=>page.evaluate(({mode,state,selector})=>{
      const api=window.__auditColor,rows=[];
      if(mode==='types'||mode==='tags')for(const e of document.querySelectorAll(selector)) {
        const st=getComputedStyle(e),surface=api.background(e.parentElement),border=api.parse(st.borderColor);
        rows.push({kind:'swatch-boundary',color:st.backgroundColor,categoryRGB:api.parse(st.backgroundColor).slice(0,3),state,foreground:st.borderColor,background:`rgb(${surface.slice(0,3).join(', ')})`,ratio:api.ratio(api.over(surface,border),surface),threshold:3});
      }
      for(const e of document.querySelectorAll(mode==='types'?'[role="dialog"] .text-sm.text-muted-foreground':mode==='tags'?'[role="dialog"] .tag-chip-static':'#palette-color-audit .req-avatar, #palette-color-audit .req-tag')) {
        const st=getComputedStyle(e),bg=api.background(e),fg=api.parse(st.color);
        const raw=st.backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        rows.push({kind:'label',text:e.textContent,color:st.backgroundColor,categoryRGB:raw?raw.slice(1,4).map(Number):api.parse(st.backgroundColor).slice(0,3),state,foreground:st.color,background:`rgb(${bg.slice(0,3).join(', ')})`,ratio:api.ratio(api.over(bg,fg),bg),threshold:4.5});
      }return rows;
    },{mode,state,selector});
    rows.push(...await measure('default'));
    if(mode!=='avatars')for(let i=0;i<count;i++) {
      const target=page.locator(selector).nth(i);await target.click();await target.hover();rows.push(...await measure(`selected-hover-${i}`));await target.focus();rows.push(...await measure(`selected-focus-${i}`));
    }
    if(rows.some(r=>r.ratio<r.threshold))throw Error(`Palette contrast failure ${mode}/${theme}: ${JSON.stringify(rows.filter(r=>r.ratio<r.threshold))}`);
    if(s.writes.length||s.errors.length)throw Error(`Palette audit write/runtime failure ${JSON.stringify(s)}`);
    const artifact=`tests/visual/reports/palette-${mode}-${theme}-${width}.png`;await page.screenshot({path:artifact});
    evidence.push({mode,theme,width,count,rows,artifact,writes:s.writes,errors:s.errors});console.log(`PASS ${mode}/${theme}/${width}: ${rows.length} measurements`);await c.close();
  }
}finally{await browser.close();}
const artifact='tests/visual/reports/palette-color-evidence.json';
saveAuditReport(process.cwd(),'palette-color-evidence',{evidence});
if(process.argv.includes('--refresh-evidence')) {
  const f='tests/visual/color-debt.json',l=JSON.parse(fs.readFileSync(f));
  const paletteFiles=new Set(['client/src/components/modals/ProjectTypeModal.tsx','client/src/components/tags/TagManagerDialog.tsx','client/src/components/boards/EditableCells.tsx']);
  for(const e of l.entries.filter(e=>paletteFiles.has(e.file)&&['pending','accepted-literal'].includes(e.decision))) {
    const mode=e.file.endsWith('/ProjectTypeModal.tsx')?'types':e.file.endsWith('/TagManagerDialog.tsx')?'tags':e.file.endsWith('/EditableCells.tsx')?'avatars':null;
    if(!mode||!['OKABE_ITO','DEFAULT_COLORS'].includes(e.owner))throw Error(`Not an approved categorical palette ${e.file}`);
    Object.assign(e,{kind:'data-color',decision:'accepted-literal',reachability:'actual-component-fixture',semanticRole:mode==='avatars'?'deterministic-category-avatar':'serialized-user-color-choice',reason:mode==='avatars'?'Stable Okabe-Ito identity hue; actual Avatar ink is mixed toward theme ink and measured on its real tinted surface.':'Raw hex is saved as user data and must not change with theme. Actual picker has a neutral identifying boundary and explicit color label/title; category chips use measured WCAG-selected ink.'});
    e.evidence=['light','dark'].map(theme=>{
      const ev=evidence.find(v=>v.mode===mode&&v.theme===theme&&v.width===1600),rgb=[1,3,5].map(i=>parseInt(e.literal.slice(i,i+2),16));
      const matches=ev.rows.filter(r=>r.categoryRGB.every((v,i)=>v===rgb[i]));
      if(!matches.length)throw Error(`Retained literal was not rendered ${e.file}: ${e.literal}`);
      const r=matches.slice().sort((a,b)=>a.ratio/a.threshold-b.ratio/b.threshold)[0];
      return {fingerprint:e.fingerprint,fileHash:sourceHash(fs.readFileSync(e.file)),theme,state:'all-palette-default-selected-hover-focus',profile:'actual-palette-component',viewport:{width:1600,height:900},threshold:r.threshold,ratio:r.ratio,foreground:r.foreground,background:r.background,artifact,artifactHash:sourceHash(fs.readFileSync(artifact)),implementationHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()+'+validated-working-tree',dependencies:Object.fromEntries(['client/src/index.css','client/src/App.css','client/src/lib/project-colors.ts','client/src/__fixtures__/palette-color-audit.tsx','scripts/verify-palette-colors.mjs',e.file].map(f=>[f,sourceHash(fs.readFileSync(f))]))};
    });
  }
  l.summary=summarize(l.entries);fs.writeFileSync(f,JSON.stringify(l,null,2)+'\n');
}
