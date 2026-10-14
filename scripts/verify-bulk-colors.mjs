import {chromium} from 'playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';
if(process.argv.length>2)throw new Error('verify-bulk-colors takes no CLI arguments');
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try{for(const theme of ['light','dark'])for(const width of [1600,1366]){
 const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),p=s.page;
 await p.goto(auditEnvironment.base+'/projects',{waitUntil:'networkidle'});
 await p.evaluate(async()=>{const m=await import('/client/src/__fixtures__/bulk-color-audit.tsx');m.mountBulkAudit();});
 await p.locator('#bulk-color-audit [data-testid="req-bulk-bar"]').waitFor();await p.evaluate(installContrastHelpers);
 const measure=async state=>{
  await p.waitForTimeout(200);
  const rows=await p.evaluate(()=>[...document.querySelectorAll('#bulk-color-audit button,.bulk-tag-pop button,.bulk-pv-pop button')].map(e=>{const a=window.__auditColor,s=getComputedStyle(e),bg=a.background(e),fg=a.parse(s.color);return{selector:e.className,text:e.textContent,disabled:e.disabled,foreground:s.color,background:bg,ratio:bg&&fg?a.ratio(a.over(bg,fg),bg):null};}));
  if(rows.length<7||rows.some(r=>!r.disabled&&r.text.trim()&&(r.ratio===null||r.ratio<4.5)))throw Error(JSON.stringify({theme,width,state,rows}));
  evidence.push({theme,width,state,rows});
 };
 await measure('default');
 await p.locator('#bulk-color-audit [data-testid="bulk-delete-btn"]').click();await measure('delete-confirmation');await p.locator('#bulk-color-audit [data-testid="bulk-delete-btn"]').hover();await measure('delete-confirmation-hover');
 await p.locator('#bulk-color-audit [data-testid="bulk-tags-btn"]').click();await p.locator('.bulk-tag-pop').waitFor();await measure('tags-unselected');
 await p.locator('.bulk-tags-section').first().getByRole('button',{name:'UI审计·添加',exact:true}).click();await p.locator('.bulk-tags-section').last().getByRole('button',{name:'UI审计·移除',exact:true}).click();await measure('tags-add-remove');
 for(const selector of ['.bulk-tag-chip--on','.bulk-tag-chip--off','.bulk-apply-btn']){await p.locator('.bulk-tag-pop '+selector).hover();await measure('hover-'+selector);}
 if(await p.locator('.bulk-tag-chip:disabled').count()!==2)throw Error('Mutually exclusive tag decisions lost disabled state');
 await p.mouse.move(0,0);await p.screenshot({path:`tests/visual/reports/bulk-tags-${theme}-${width}.png`});
 await p.keyboard.press('Escape');await p.locator('#bulk-color-audit [data-testid="bulk-product_version-btn"]').click();await p.locator('.bulk-pv-pop').waitFor();await measure('clear-version');await p.locator('.bulk-pv-pop .bulk-apply-btn').hover();await measure('clear-version-hover');
 await p.keyboard.press('Escape');await p.evaluate(async()=>{const m=await import('/client/src/__fixtures__/bulk-color-audit.tsx');m.mountBulkAudit(true);});await p.waitForTimeout(200);await measure('pending');
 if(await p.locator('#bulk-color-audit button:disabled').count()<6||s.writes.length||s.errors.length)throw Error('Read-only or pending state failed');
 console.log(`PASS bulk ${theme}/${width}: confirmation, on/off/disabled tags, apply and clear hover; zero callbacks/writes`);await c.close();
}}finally{await browser.close();}
saveAuditReport(process.cwd(),'bulk-color-evidence',{evidence});
