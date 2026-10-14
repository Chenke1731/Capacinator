import {chromium} from 'playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try{for(const theme of ['light','dark'])for(const width of [1600,1366]){
 const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),p=s.page;
 await p.goto(auditEnvironment.base+'/projects',{waitUntil:'networkidle'});
 await p.evaluate(async()=>{const m=await import('/client/src/__fixtures__/notification-color-audit.tsx');m.mountNotificationAudit();});
 await p.locator('#notification-color-audit [role="status"]').waitFor();await p.waitForTimeout(250);await p.evaluate(installContrastHelpers);
 const rows=await p.evaluate(()=>[...document.querySelectorAll('#notification-color-audit .req-error-toast')].map(e=>{
  const a=window.__auditColor,s=getComputedStyle(e),bg=a.background(e),fg=a.parse(s.color),border=a.parse(s.borderColor);
  return{role:e.getAttribute('role'),foreground:s.color,background:bg,opacity:a.parse(s.backgroundColor)?.[3],textRatio:bg&&fg?a.ratio(a.over(bg,fg),bg):null,borderRatio:bg&&border?a.ratio(a.over(bg,border),bg):null};
 }));
 if(rows.length!==2||rows.some(r=>r.opacity!==1||r.textRatio===null||r.textRatio<4.5||r.borderRatio===null||r.borderRatio<3))throw Error(JSON.stringify({theme,width,rows}));
 const artifact=`tests/visual/reports/notifications-${theme}-${width}.png`;await p.screenshot({path:artifact});
 if(s.writes.length||s.errors.length)throw Error('Notification fixture was not read-only');
 evidence.push({theme,width,rows,artifact,state:'production-presentation-controlled-error-and-success',businessErrorSubscription:'U02 remains outside Task C'});
 console.log(`PASS notifications ${theme}/${width}: actual production presentation, text >=4.5, border >=3`);await c.close();
}}finally{await browser.close();}
saveAuditReport(process.cwd(),'notification-color-evidence',{evidence});
