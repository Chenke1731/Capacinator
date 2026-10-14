import { chromium } from 'playwright';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import { auditEnvironment, authenticate, setupReadOnlyPage, getProfile, resolveProfile, assertProfileReady, prepareProfile, saveAuditReport } from './lib/ui-profiles.mjs';
import { installContrastHelpers } from './lib/ui-state-audit.mjs';
import {sourceHash} from './lib/color-debt.mjs';

if(process.argv.slice(2).some(a=>a!=='--refresh-evidence'))throw new Error('Unknown timeline audit option');

const auth=await authenticate(),browser=await chromium.launch({executablePath:auditEnvironment.chrome});
const evidence=[];
try {
  for(const theme of ['light','dark'])for(const width of [1600,1366]) {
    const context=await browser.newContext({viewport:{width,height:width===1600?900:768}});
    const session=await setupReadOnlyPage(context,auth,theme),page=session.page;
    for(const profileName of ['roadmap','project-detail-phases']) {
      const p=await resolveProfile(getProfile(profileName),auth);
      await page.goto(auditEnvironment.base+p.path,{waitUntil:'networkidle'});
      await assertProfileReady(page,p,auditEnvironment.base);await prepareProfile(page,p);
      if(!await page.locator('.interactive-timeline').count())throw new Error('Actual timeline missing');
      const actualArtifact=`tests/visual/reports/timeline-${profileName}-${theme}-${width}.png`;
      await page.screenshot({path:actualArtifact});
      evidence.push({theme,width,profile:profileName,artifact:actualArtifact,actualTimelineCount:await page.locator('.interactive-timeline').count()});
    }
    await page.evaluate(async()=>{const m=await import('/client/src/__fixtures__/timeline-color-audit.tsx');m.mountTimelineAudit();});
    await page.locator('#timeline-color-audit [data-timeline-item]').first().waitFor();
    await page.evaluate(installContrastHelpers);await page.waitForTimeout(300);
    const colors=await page.evaluate(()=>{
      const api=window.__auditColor;
      return [...document.querySelectorAll('#timeline-color-audit [data-timeline-item],#timeline-color-audit [data-timeline-handle]')].map(e=>{
        const s=getComputedStyle(e),bg=api.background(e),fg=api.parse(s.color);
        return {item:e.getAttribute('data-timeline-item'),handle:e.getAttribute('data-timeline-handle'),state:e.closest('[data-handle-set]')?.getAttribute('data-handle-set')??'default',foreground:s.color,background:s.backgroundColor,ratio:api.ratio(api.over(bg,fg),bg),threshold:4.5,border:s.borderColor,borderRatio:s.borderStyle==='none'?null:api.ratio(api.parse(s.borderColor),bg)};
      });
    });
    if(colors.length!==15||colors.some(c=>c.ratio<4.5||(c.item&&c.borderRatio<3)))throw new Error(`Palette contrast failure ${theme}: ${JSON.stringify(colors)}`);
    const marker=await page.evaluate(colors=>{
      const e=document.querySelector('#timeline-color-audit [data-timeline-today]'),s=getComputedStyle(e),body=getComputedStyle(document.body),api=window.__auditColor;
      const inks=['--solid-foreground','--solid-shade'].map(token=>api.parse(body.getPropertyValue(token)));
      return {opacity:s.opacity,shadow:s.boxShadow,minimumEdgeContrast:Math.min(...colors.filter(c=>c.item).map(c=>Math.max(...inks.map(ink=>api.ratio(ink,api.parse(c.background)))))),threshold:3};
    },colors);
    if(marker.opacity!=='1'||!marker.shadow.includes('rgb(255, 255, 255)')||!marker.shadow.includes('rgb(0, 0, 0)')||marker.minimumEdgeContrast<3)throw new Error('Today marker lost its two-tone contrast');
    const dependencies=await page.evaluate(()=>[...document.querySelectorAll('[data-dependency-audit] text')].map(e=>{
      const s=getComputedStyle(e),plate=e.previousElementSibling,api=window.__auditColor,bg=api.parse(getComputedStyle(plate).fill),fg=api.parse(s.fill);
      return {type:e.textContent,foreground:s.fill,background:getComputedStyle(plate).fill,ratio:api.ratio(fg,bg),threshold:4.5};
    }));
    if(dependencies.length!==5||dependencies.some(d=>d.ratio<4.5))throw new Error('Dependency annotations are unreadable');
    // Exercise every status role against its real primary/secondary and soft surfaces.
    const tokens=await page.evaluate(()=>{
      const api=window.__auditColor,host=document.querySelector('#timeline-color-audit'),rows=[];
      for(const role of ['success','warning','danger','info'])for(const surface of ['bg-primary','bg-secondary',`status-${role}-soft`,`status-${role}-solid`]){
        const e=document.createElement('span');e.textContent=role;e.style.background=`var(--${surface})`;e.style.color=surface.endsWith('-solid')?'var(--solid-foreground)':`var(--status-${role}-text)`;host.append(e);
        const s=getComputedStyle(e),bg=api.background(e),fg=api.parse(s.color);rows.push({role,surface,foreground:s.color,background:s.backgroundColor,ratio:api.ratio(api.over(bg,fg),bg),threshold:4.5});e.remove();
      }return rows;
    });
    if(tokens.some(t=>t.ratio<4.5))throw new Error(`Status contrast failure ${theme}: ${JSON.stringify(tokens)}`);
    const artifact=`tests/visual/reports/timeline-palette-${theme}-${width}.png`;
    await page.screenshot({path:artifact});
    evidence.push({theme,width,profile:'actual-component-fixture',state:'default+hover',artifact,colors,marker,dependencies,tokens,writes:session.writes,errors:session.errors});
    if(session.writes.length||session.errors.length)throw new Error('Read-only fixture failed');
    console.log(`PASS ${theme}/${width}: actual roadmap/detail timelines, 15 palette/handle labels and 16 status pairs`);
    await context.close();
  }
}finally{await browser.close();}
const artifact=saveAuditReport(process.cwd(),'timeline-color-evidence',{evidence});
// Refresh only the three explicitly classified data exceptions. New identities,
// changed literals or counts still require a separate, reviewable decision.
if(process.argv.includes('--refresh-evidence')) {
  const file='tests/visual/color-debt.json',ledger=JSON.parse(fs.readFileSync(file));
  for(const e of ledger.entries.filter(e=>['client/src/lib/project-colors.ts','client/src/components/phase-manager/types.ts'].includes(e.file)&&e.decision==='accepted-literal')) {
    const phasePalette=e.file.endsWith('/types.ts');
    if(!phasePalette&&!['#000000','#ffffff','#6b7280'].includes(e.literal))throw new Error('Unapproved retained data color');
    e.evidence=['light','dark'].map(theme=>{
      const colors=evidence.find(v=>v.theme===theme&&v.width===1600&&v.colors).colors;
      const phaseName=e.owner.replace(/^['"]|['"]$/g,'');
      const rows=colors.filter(c=>phasePalette?c.item===phaseName:e.literal==='#000000'?c.foreground==='rgb(0, 0, 0)':c.item==='custom');
      const actual=rows.sort((a,b)=>a.ratio-b.ratio)[0];
      if(phasePalette){const rgb=[1,3,5].map(i=>parseInt(e.literal.slice(i,i+2),16));if(!actual||actual.background!==`rgb(${rgb.join(', ')})`)throw new Error('Retained data literal does not match its actual phase');}
      return {fingerprint:e.fingerprint,fileHash:sourceHash(fs.readFileSync(e.file)),theme,state:'nine-color-production-component',profile:'actual-component-fixture',viewport:{width:1600,height:900},threshold:4.5,ratio:actual.ratio,foreground:actual.foreground,background:actual.background,artifact:'tests/visual/reports/timeline-color-evidence.json',artifactHash:sourceHash(fs.readFileSync(artifact)),implementationHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()+'+validated-working-tree',dependencies:Object.fromEntries(['client/src/index.css','client/src/components/phase-manager/types.ts','client/src/components/InteractiveTimeline.tsx'].map(f=>[f,sourceHash(fs.readFileSync(f))]))};
    });
  }
  fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');
}
