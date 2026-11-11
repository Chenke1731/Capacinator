// Prepared import states exercise the production UI. The only accepted write
// is fulfilled in this browser; it cannot reach the API or modify a database.
export async function prepareImportState(page,profile,state,session) {
  if(profile.name!=='import'||!state.startsWith('import-'))throw Error('Unsupported import state/profile');
  if(state==='import-advanced') {
    await page.locator('.settings-preview .btn-ghost').click();
    await page.locator('.advanced-settings').waitFor({state:'visible'});
    await page.locator('.import-options input[type="checkbox"]').first().check();
    return;
  }
  const supported=['import-file','import-success','import-error','import-running'];
  if(!supported.includes(state))throw Error('Unknown import state');
  await page.locator('input[type="file"]').setInputFiles({name:'color-audit.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('UI color fixture; never parsed or persisted by the server')});
  await page.locator('.file-selected').waitFor({state:'visible'});
  if(state==='import-file')return;
  // 批 C（2026-11-11）：import 页已改 分析→确认 两步流（首个 .upload-btn=
  // 分析 POST /import/analyze，确认钮 disabled 由 analysis.wouldSucceed 门控）。
  // 受控场景两步都走浏览器内 mock，analyze 返回可确认的分析负载。
  await page.route('**/api/import/analyze',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    session.mockedWrites??=[];
    session.mockedWrites.push({method:'POST',path:'/api/import/analyze',state,persisted:false});
    await route.fulfill({status:200,contentType:'application/json',json:{success:true,message:'颜色验收：受控分析',analysis:{summary:{totalChanges:8,wouldCreate:{locations:1,projectTypes:1,phases:1,roles:1,people:1,projects:1,standardAllocations:1,assignments:1},wouldUpdate:{},wouldDelete:{}},conflicts:[],warnings:[],errors:[],preview:{newEntities:[],modifiedEntities:[],deletedEntities:[],duplicates:[]},riskAssessment:{level:'low',factors:[],recommendations:[]},dryRun:true,wouldSucceed:true},options:{},fileInfo:{name:'color-audit.xlsx',size:64,formatVersion:'v2'}}});
  });
  await page.locator('.upload-btn').first().click();
  await page.locator('.import-preview, .preview, .advanced-settings').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
  // 确认导入钮（第二个 upload-btn）：等它可用
  const confirmBtn=page.locator('.upload-btn:not(.btn-outline)').nth(1);
  await confirmBtn.waitFor({state:'visible',timeout:10000});
  session.mockedWrites=[];
  await page.route('**/api/import/excel',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    session.mockedWrites.push({method:'POST',path:'/api/import/excel',state,persisted:false});
    const response={status:state==='import-error'?400:200,contentType:'application/json',json:state==='import-error'?{message:'颜色验收：受控错误',errors:['工作表 projects 第2行：角色不存在']}:{success:true,message:'颜色验收：受控成功',imported:{locations:1,projectTypes:1,phases:1,roles:1,people:1,projects:1,standardAllocations:1,assignments:1},warnings:['颜色验收：受控警告']}};
    if(state==='import-running')await new Promise(resolve=>{session.releaseMock=async()=>{await route.fulfill(response);resolve();};});
    else await route.fulfill(response);
  });
  // 批 C（2026-11-11）：两步流——此处点击的是"确认导入"钮（第二个非 outline
  // 的 .upload-btn），上传 mock 见上
  await confirmBtn.click();
  if(state==='import-running')await page.locator('[role="progressbar"]').waitFor({state:'visible'});
  else {await page.locator(`.import-result.${state==='import-error'?'error':'success'}`).last().waitFor({state:'visible'});await page.locator('.import-result').last().scrollIntoViewIfNeeded();}
  if(session.mockedWrites.length!==1)throw Error('Import fixture did not intercept exactly one browser-only request');
}
