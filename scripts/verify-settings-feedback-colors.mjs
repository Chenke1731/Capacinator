import {chromium} from 'playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';
if(process.argv.length>2)throw new Error('verify-settings-feedback-colors takes no CLI arguments');
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try{for(const theme of ['light','dark'])for(const width of [1600,1366])for(const result of ['success','error']){
 const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),p=s.page,mocks=[];
 await p.route('**/api/settings/system',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  mocks.push({method:'POST',path:'/api/settings/system',response:result==='success'?200:503,persisted:false});
  await route.fulfill({status:result==='success'?200:503,contentType:'application/json',json:result==='success'?{success:true,data:{}}:{error:'UI审计：模拟保存失败'}});
 });
 await p.goto(auditEnvironment.base+'/settings',{waitUntil:'networkidle'});await p.locator('.settings-actions .btn-primary').waitFor();
 await p.locator('.settings-actions .btn-primary').click();await p.locator(`.save-message.${result}`).waitFor();await p.evaluate(installContrastHelpers);
 const row=await p.locator(`.save-message.${result}`).evaluate(e=>{const a=window.__auditColor,s=getComputedStyle(e),bg=a.background(e),fg=a.parse(s.color);return{foreground:s.color,background:bg,ratio:bg&&fg?a.ratio(a.over(bg,fg),bg):null,threshold:4.5};});
 if(row.ratio===null||row.ratio<4.5||mocks.length!==1||s.writes.length||s.errors.length)throw Error(JSON.stringify({theme,width,result,row,mocks}));
 const artifact=`tests/visual/reports/settings-feedback-${result}-${theme}-${width}.png`;await p.screenshot({path:artifact});
 evidence.push({theme,width,result,row,artifact,mocks,proof:'Actual settings save UI with declared in-browser response; no persistence proof'});
 console.log(`PASS settings feedback ${result}/${theme}/${width}: ${row.ratio.toFixed(2)}:1, exactly one declared mock, zero external writes`);await c.close();
}}finally{await browser.close();}
saveAuditReport(process.cwd(),'settings-feedback-color-evidence',{evidence});
