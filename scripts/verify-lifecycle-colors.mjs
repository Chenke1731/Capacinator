import fs from 'node:fs';
import {chromium} from 'playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';

const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try {
 for(const theme of ['light','dark'])for(const width of [1600,1366]) {
  const context=await browser.newContext({viewport:{width,height:width===1600?900:768}}),session=await setupReadOnlyPage(context,auth,theme),page=session.page;
  await page.goto(auditEnvironment.base+'/projects',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{const m=await import('/client/src/__fixtures__/lifecycle-color-audit.tsx');m.mountLifecycleAudit();});
  await page.locator('[data-lifecycle-audit="cancelled"] .lifecycle-banner').waitFor();await page.evaluate(installContrastHelpers);
  const measure=async state=>{
   const rows=await page.evaluate(()=>[...document.querySelectorAll('#lifecycle-color-audit .lifecycle-state-badge,#lifecycle-color-audit .lifecycle-step-label,#lifecycle-color-audit .lifecycle-gate,#lifecycle-color-audit .lifecycle-warning-title,#lifecycle-color-audit .lifecycle-warning-items,#lifecycle-color-audit button:not(:disabled)')].map(e=>{
    const s=getComputedStyle(e),api=window.__auditColor,bg=api.background(e),fg=api.parse(s.color);
    return {category:e.closest('[data-lifecycle-audit]').dataset.lifecycleAudit,selector:e.className,text:e.textContent,foreground:s.color,background:bg,ratio:bg&&fg?api.ratio(api.over(bg,fg),bg):null,threshold:4.5};
   }));
   if(rows.length<90||rows.some(r=>r.ratio===null||r.ratio<4.5))throw new Error(JSON.stringify({theme,width,state,bad:rows.filter(r=>r.ratio===null||r.ratio<4.5)}));
   evidence.push({theme,width,state,rows});
  };
  await measure('default');
  const primary=page.locator('[data-lifecycle-audit="pending_rat"] .lifecycle-btn-primary');await primary.hover();await page.waitForTimeout(180);await measure('primary-hover');
  const cancel=page.locator('[data-lifecycle-audit="pending_rat"] .lifecycle-btn-danger');await cancel.click();await page.waitForTimeout(180);await measure('cancel-confirmation');await cancel.hover();await page.waitForTimeout(180);await measure('cancel-confirmation-hover');
  await page.mouse.move(0,0);await page.screenshot({path:`tests/visual/reports/lifecycle-${theme}-${width}.png`});
  if(session.writes.length||session.errors.length)throw new Error(JSON.stringify(session));
  console.log(`PASS lifecycle ${theme}/${width}: 8 categories, labels, warnings, primary hover and local cancellation confirmation`);await context.close();
 }
}finally{await browser.close();}
saveAuditReport(process.cwd(),'lifecycle-color-evidence',{evidence});
