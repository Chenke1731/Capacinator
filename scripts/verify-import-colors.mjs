import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,getProfile,assertProfileReady,saveAuditReport} from './lib/ui-profiles.mjs';
import {prepareImportState} from './lib/ui-prepared-states.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';

if(process.argv.length>2)throw Error('Import color audit accepts no options');
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try {
  for(const theme of ['light','dark'])for(const width of [1600,1366])for(const state of ['default','import-advanced','import-file','import-success','import-error','import-running']) {
    const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),page=s.page,profile=getProfile('import');
    await page.goto(auditEnvironment.base+profile.path,{waitUntil:'networkidle'});await assertProfileReady(page,profile,auditEnvironment.base);
    if(state!=='default')await prepareImportState(page,profile,state,s);
    await page.evaluate(installContrastHelpers);const phases=[];
    for(const phase of ['default','hover','focus']) {
      const target=page.locator(state==='import-file'?'.upload-btn':state==='import-error'?'.import-card .bg-card button':'.settings-preview .btn-ghost').first();
      if(phase==='hover')await target.hover();if(phase==='focus')await target.focus();await page.waitForTimeout(250);
      const axe=await new AxeBuilder({page}).include('.import-container').withRules(['color-contrast']).analyze();
      if(axe.violations.length)throw Error(`Import ${state}/${phase}/${theme}: ${JSON.stringify(axe.violations.map(v=>v.nodes.map(n=>n.target)))}`);
      const graphics=await page.evaluate(()=>[...document.querySelectorAll('.import-container [role="progressbar"] > div')].map(e=>{
        const api=window.__auditColor,fg=api.parse(getComputedStyle(e).backgroundColor),bg=api.background(e.parentElement);return {foreground:getComputedStyle(e).backgroundColor,background:bg,ratio:api.ratio(api.over(bg,fg),bg),threshold:3};
      }));
      if(graphics.some(r=>r.ratio<3))throw Error(`Progress fill lacks contrast ${JSON.stringify(graphics)}`);
      phases.push({phase,axe:[],graphics});
    }
    if(s.writes.length||s.errors.length)throw Error(`Import audit leaked a write or runtime error ${JSON.stringify(s.errors)}`);
    const artifact=`tests/visual/reports/import-states-${state}-${theme}-${width}.png`;await page.screenshot({path:artifact});
    evidence.push({state,theme,width,phases,artifact,mockedWrites:s.mockedWrites??[],writes:s.writes,errors:s.errors});
    if(s.releaseMock)await s.releaseMock();await c.close();console.log(`PASS ${state}/${theme}/${width}: static/hover/focus, browser-only mocks`);
  }
}finally{await browser.close();saveAuditReport(process.cwd(),'import-color-evidence',{evidence});}
