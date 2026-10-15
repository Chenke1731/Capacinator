import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';

if(process.argv.length>2)throw Error('Assignment audit accepts no options');
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try {
  for(const theme of ['light','dark'])for(const width of [1600,1366])for(const mode of ['overload','recommended','manual']) {
    const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),page=s.page;
    await page.goto(auditEnvironment.base+'/projects',{waitUntil:'networkidle'});
    const mockedReads=[];
    await page.route(/\/api\/project-phases\?project_id=assignment-color-project$/,async route=>{
      if(route.request().method()!=='GET')return route.fallback();
      mockedReads.push({method:'GET',path:'/api/project-phases',fixture:'controlled empty phases for the synthetic project'});
      return route.fulfill({status:200,contentType:'application/json',json:{data:[]}});
    });
    await page.evaluate(async mode=>{const m=await import('/client/src/__fixtures__/assignment-color-audit.tsx');m.mountAssignmentAudit(mode);},mode);
    await page.locator('[role="dialog"] .assignment-form').waitFor();
    if(mode==='overload'&&await page.locator('.assignment-item').count()!==2)throw Error('Overload fixture did not render both valid/missing-ID rows');
    if(mode==='recommended'&&await page.locator('.recommendation-item,.recommendation-card').count()<1)throw Error('Recommendation fixture is empty');
    const phases=[];
    const controls=page.locator('[role="dialog"] button:not([role="tab"])').filter({visible:true}),count=await controls.count();
    if(count<3)throw Error('Assignment controls were not rendered');
    for(let i=-1;i<count;i++) {
      const disabled=i>=0&&await controls.nth(i).isDisabled();
      if(i>=0){await controls.nth(i).hover();if(!disabled)await controls.nth(i).focus();await page.waitForTimeout(250);}
      const axe=await new AxeBuilder({page}).include('[role="dialog"]').withRules(['color-contrast']).analyze();
      if(axe.violations.length)throw Error(`Assignment ${mode}/${theme}: ${JSON.stringify(axe.violations.flatMap(v=>v.nodes.map(n=>({target:n.target,html:n.html}))))}`);
      phases.push({state:i<0?'default':disabled?`disabled-hover-${i}`:`hover-focus-${i}`,disabled,axe:[]});
    }
    const tabs=page.locator('[role="dialog"] [role="tab"]');
    if(await tabs.count()!==2)throw Error('Expected both recommendation/manual tabs');
    for(let i=0;i<2;i++) {
      await tabs.nth(i).click();await page.waitForTimeout(300);
      const axe=await new AxeBuilder({page}).include('[role="dialog"]').withRules(['color-contrast']).analyze();
      if(axe.violations.length)throw Error(`Assignment tab ${i}/${mode}/${theme}: ${JSON.stringify(axe.violations.flatMap(v=>v.nodes.map(n=>n.target)))}`);
      phases.push({state:`tab-${i}`,axe:[]});
    }
    await tabs.nth(mode==='recommended'?0:1).click();
    const artifact=`tests/visual/reports/assignment-${mode}-${theme}-${width}.png`;await page.screenshot({path:artifact});
    if(s.errors.length||s.writes.length)throw Error(`Unexpected assignment request/runtime ${JSON.stringify(s.errors)}`);
    evidence.push({mode,theme,width,phases,artifact,mockedReads,writes:s.writes,errors:s.errors});console.log(`PASS ${mode}/${theme}/${width}: ${phases.length} states, no assignment/delete callbacks`);await c.close();
  }
}finally{await browser.close();saveAuditReport(process.cwd(),'assignment-color-evidence',{evidence});}
