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
  session.mockedWrites=[];
  await page.route('**/api/import/excel',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    session.mockedWrites.push({method:'POST',path:'/api/import/excel',state,persisted:false});
    const response={status:state==='import-error'?400:200,contentType:'application/json',json:state==='import-error'?{message:'颜色验收：受控错误',errors:['工作表 projects 第2行：角色不存在']}:{success:true,message:'颜色验收：受控成功',imported:{locations:1,projectTypes:1,phases:1,roles:1,people:1,projects:1,standardAllocations:1,assignments:1},warnings:['颜色验收：受控警告']}};
    if(state==='import-running')await new Promise(resolve=>{session.releaseMock=async()=>{await route.fulfill(response);resolve();};});
    else await route.fulfill(response);
  });
  await page.locator('.upload-btn').click();
  if(state==='import-running')await page.locator('[role="progressbar"]').waitFor({state:'visible'});
  else {await page.locator(`.import-result.${state==='import-error'?'error':'success'}`).waitFor({state:'visible'});await page.locator('.import-result').scrollIntoViewIfNeeded();}
  if(session.mockedWrites.length!==1)throw Error('Import fixture did not intercept exactly one browser-only request');
}
