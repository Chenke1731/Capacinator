import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const defaultFixtureFile=process.env.UI_AUDIT_FIXTURES??path.join(repository,'tests/visual/fixtures/runtime-data.json');
let fixtureFile=defaultFixtureFile;
const captureFixtures=process.argv.includes('--capture-fixtures');
let fixtureSet=fs.existsSync(fixtureFile)?JSON.parse(fs.readFileSync(fixtureFile,'utf8')):null;
if(captureFixtures&&!fixtureSet)fixtureSet={version:1,capturedAt:new Date().toISOString(),responses:{}};

// Independent scene captures may discover different GETs. Merge only this
// response/entity under a lock; never overwrite another process's fixture set.
function persistFixture(update) {
  fs.mkdirSync(path.dirname(fixtureFile),{recursive:true});
  const lock=`${fixtureFile}.lock`;let descriptor;
  try {
    descriptor=fs.openSync(lock,'wx');
    const stored=fs.existsSync(fixtureFile)?JSON.parse(fs.readFileSync(fixtureFile,'utf8')):fixtureSet;
    if(stored.capturedAt!==fixtureSet.capturedAt)throw new Error('Concurrent fixture clocks differ; capture scenes sequentially');
    update(stored);
    const temporary=`${fixtureFile}.${process.pid}.tmp`;fs.writeFileSync(temporary,`${JSON.stringify(stored,null,2)}\n`);fs.renameSync(temporary,fixtureFile);
    fixtureSet=stored;
  } finally {if(descriptor!==undefined){fs.closeSync(descriptor);fs.unlinkSync(lock);}}
}

// Roots are real production DOM. Profiles describe setup, never excuse a failed measurement.
export const profiles = {
  projects: {path:'/projects',root:'.projects-board',ready:'[data-testid="requirements-table"]',minElements:20,scroll:'.requirements-table',fonts:[10,11,12.5,13,14]},
  roadmap: {path:'/projects?tab=roadmap',root:'.project-roadmap',ready:'.interactive-timeline',minElements:8,scroll:'.timeline-scroll-container',safeTriggers:'.nav-btn, .today-btn, .zoom-controls button',requiredTriggers:5},
  'project-detail': {path:'/projects/project-1789912193111-zikdnz8c5',root:'main > .max-w-7xl',ready:'.chart-container .chart-tab',minElements:8,safeTriggers:'.chart-tab'},
  'project-detail-phases': {path:'/projects/:audit-id',entity:'phased-project',root:'main > .max-w-7xl',ready:'.project-phase-timeline .timeline-container',minElements:5,safeTriggers:'.chart-tab',scrollInto:'.chart-container'},
  'phase-template': {path:'/project-types/:audit-id',entity:'phased-type',root:'.phase-template-designer',ready:'.phases-table',minElements:3,safeTriggers:'.add-phase-btn',requiredTriggers:1},
  'project-type-detail': {path:'/project-types/:audit-id',entity:'phased-type',root:'.role-details-page',ready:'.project-type-header',minElements:5},
  'project-detail-tagged': {path:'/projects/project-1789912193028-uo604tadh',root:'main > .max-w-7xl',ready:'.tag-badge',minElements:3},
  scenarios: {path:'/scenarios',root:'.scenarios-page',ready:'.hierarchy-row',minElements:5,safeTriggers:'.page-header > button, .filter-button, .action-button.edit',requiredTriggers:3,floatingRoot:'[role="dialog"]',floatingMin:3},
  'scenarios-rich': {path:'/scenarios',root:'.scenarios-page',ready:'.hierarchy-row.branch',minElements:10,safeTriggers:'.page-header > button, .filter-button, .hierarchy-row.baseline .action-button.edit, .hierarchy-row.branch .action-button.compare, .hierarchy-row.branch .action-button.merge',requiredTriggers:5,floatingRoot:'[role="dialog"]',floatingMin:3,fixture:'tests/visual/fixtures/scenarios.json'},
  import: {path:'/import',root:'.import-container',ready:'.import-card',minElements:3,safeTriggers:'.settings-preview .btn-ghost'},
  'import-export': {path:'/import?tab=export',root:'.import-container',ready:'.export-section',minElements:4},
  'project-types': {path:'/projects?tab=types',root:'.unified-tab-content .page-container',ready:'.view-mode-toggle',minElements:5},
  'project-types-hierarchy': {path:'/projects?tab=types&view=hierarchy',root:'.unified-tab-content .page-container',ready:'.hierarchy-view',minElements:5},
  iterations: {path:'/iterations',root:'.iterations-page',ready:'.it-card-head',minElements:3,hoverReveal:'.it-card-head'},
  reports: {path:'/reports',root:'.reports-tab-content',ready:'.page-header',minElements:5},
  'reports-capacity': {path:'/reports?tab=capacity',root:'.reports-tab-content',ready:'.page-header',minElements:5},
  'reports-utilization': {path:'/reports?tab=utilization',root:'.reports-tab-content',ready:'.page-header',minElements:5},
  'reports-gaps': {path:'/reports?tab=gaps',root:'.reports-tab-content',ready:'.page-header',minElements:5},
  locations: {path:'/locations',root:'.page-container',ready:'table',minElements:2},
  'audit-log': {path:'/audit-log',root:'.page-container',ready:'.audit-stats',minElements:3},
  'person-detail': {path:'/people/eb8ecaf7-44a3-4384-a74b-2c18e9e894b1',root:'.person-details',ready:'.person-details-content',minElements:3},
  'role-detail': {path:'/roles/501d8abc-0c77-45e9-98c8-7832302e63cb',root:'.role-details-page',ready:'.role-content',minElements:3},
  people: {path:'/people',root:'main',ready:'table',minElements:5},
  assignments: {path:'/assignments',root:'main',ready:'table',minElements:5},
  'assignment-recommendations': {path:'/assignments?tab=recommendations',root:'.page-container',ready:'.recommendations-container',minElements:3},
  dashboard: {path:'/dashboard',root:'main',ready:'.stats-grid',minElements:3},
  settings: {path:'/settings',root:'.unified-tab-container',ready:'.settings-section',minElements:5},
  'settings-appearance': {path:'/settings?tab=appearance',root:'.unified-tab-container',ready:'.theme-selector',minElements:5},
};

export function getProfile(name, page) {
  const entry=name?profiles[name]:page?Object.values(profiles).find(p=>p.path===page):profiles.projects;
  if(!entry) throw new Error(`Unsupported UI profile/page: ${name??page}`);
  return {name:Object.keys(profiles).find(n=>profiles[n]===entry),...entry};
}
export function matchesPage(actual, expected, base) {
  const a=new URL(actual,base),e=new URL(expected,base);
  return a.origin===e.origin&&a.pathname===e.pathname&&[...e.searchParams].every(([k,v])=>a.searchParams.get(k)===v);
}
export async function resolveProfile(profile,auth){
  const requested=process.env.UI_AUDIT_FIXTURES?defaultFixtureFile:profile.fixture?path.join(repository,profile.fixture):defaultFixtureFile;
  if(profile.fixture&&captureFixtures)throw new Error('Controlled scene fixtures cannot be overwritten by live capture');
  if(requested!==fixtureFile){if(!fs.existsSync(requested))throw new Error(`Missing scene fixture ${requested}`);fixtureFile=requested;fixtureSet=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));}
  if(!profile.entity)return profile;
  let id=fixtureSet?.entities?.[profile.entity];
  if(!id){
    if(fixtureSet&&!captureFixtures)throw new Error(`Missing entity fixture ${profile.entity}; capture explicitly`);
    const kind=profile.entity==='phased-project'?'projects':'project-types';
    const read=async endpoint=>{const r=await fetch(`${auditEnvironment.api}/api/${endpoint}`,{headers:{Authorization:`Bearer ${auth.accessToken}`}});if(!r.ok)throw new Error(`Entity read failed ${endpoint}`);return r.json();};
    const payload=await read(`${kind}?limit=100`),rows=payload.data?.data??payload.data??payload;
    for(const row of [...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
      const detail=await read(`${kind}/${row.id}`),item=detail.data??detail;
      if(profile.entity==='phased-type'){
        if(item.parent_id)continue;
        const phases=await read(`project-type-hierarchy/${row.id}/phases`);
        if(phases.data?.length){id=row.id;break;}
      }else if(item.phases?.length){id=row.id;break;}
    }
    if(!id)throw new Error(`No non-empty phase fixture for ${kind}`);
    if(captureFixtures)persistFixture(stored=>{stored.entities??={};stored.entities[profile.entity]=id;});
  }
  return {...profile,path:profile.path.replace(':audit-id',id)};
}
export async function prepareProfile(page,profile){
  if(profile.scrollInto)await page.locator(profile.scrollInto).first().scrollIntoViewIfNeeded();
  if(profile.name==='iterations') {
    const target=page.locator('.it-card-head').filter({hasText:'11月迭代'});
    if(await target.count()!==1)throw Error('Expected the frozen November iteration with nonempty workload');
    await target.click();await page.locator('.it-load-row--over').waitFor({state:'visible'});
  }
  if(profile.name==='project-types-hierarchy') {
    const toggles=page.locator('.expand-toggle');
    if(await toggles.count()!==4)throw Error('Hierarchy fixture must contain four real parents');
    for(let i=0;i<4;i++)await toggles.nth(i).click();
    if(await page.locator('.project-type-row.sub-type').count()!==4)throw Error('Hierarchy must render each child exactly once');
    // Clicking the last parent can scroll both nested containers by a few pixels
    // before React remounts the row. The default scene starts at the same origin
    // in every viewport; preserve the clicks and reset only their scroll effects.
    await page.mouse.move(0,0);
    await page.locator('.hierarchy-view').evaluate(async root=>{
      for(let e=root;e;e=e.parentElement)e.scrollTo({top:0,left:0,behavior:'instant'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      for(let e=root;e;e=e.parentElement)if(e.scrollTop!==0||e.scrollLeft!==0)throw Error('Hierarchy default scene did not return to its scroll origin');
    });
  }
}
export async function assertProfileReady(page, profile, base) {
  if(!matchesPage(page.url(),profile.path,base)) throw new Error(`Wrong page: ${page.url()} expected ${profile.path}`);
  await page.locator(profile.root).first().waitFor({state:'visible',timeout:15000});
  await page.locator(profile.ready).first().waitFor({state:'visible',timeout:15000});
  if(await page.locator('.page-error,[data-testid="error-message"]').count()) throw new Error('Page has a loading error');
  if(await page.locator('[role="alertdialog"]').filter({visible:true}).count())throw new Error('Unexpected session/confirmation overlay covers the audit page');
}
export const auditEnvironment = {
  base:process.env.UI_AUDIT_BASE??'http://127.0.0.1:3120',
  api:process.env.UI_AUDIT_API??'http://127.0.0.1:3110',
  chrome:process.env.UI_AUDIT_CHROME??'/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
};
export async function authenticate() {
  const res=await fetch(`${auditEnvironment.api}/api/people?limit=1`);
  if(!res.ok) throw new Error(`People identity read failed (${res.status})`);
  const people=await res.json();
  const person=(people.data?.data??people.data??people)[0];
  if(!person?.id) throw new Error('No usable audit identity');
  const loginRes=await fetch(`${auditEnvironment.api}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personId:person.id})});
  const payload=await loginRes.json(),auth=payload.data??payload;
  if(!loginRes.ok||!auth.accessToken) throw new Error('Audit login failed');
  return {...auth,user:auth.user??person};
}
export async function setupReadOnlyPage(context,auth,theme) {
  const page=await context.newPage(),writes=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({auth,theme})=>{
    localStorage.setItem('capacinator_current_user',JSON.stringify(auth.user));
    localStorage.setItem('auth_token',auth.accessToken);
    if(auth.refreshToken)localStorage.setItem('refresh_token',auth.refreshToken);
    localStorage.setItem('capacinator-language','zh-CN');localStorage.setItem('theme',theme);
    localStorage.removeItem('req-col-widths-v5');
  },{auth,theme});
  if(fixtureSet)await page.addInitScript(iso=>{
    const OriginalDate=Date,fixed=OriginalDate.parse(iso);
    class AuditDate extends OriginalDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
    window.Date=AuditDate;
  },fixtureSet.capturedAt);
  await page.route('**/api/**',async route=>{
    if(route.request().method()==='GET'&&fixtureSet&&!new URL(route.request().url()).pathname.startsWith('/api/auth/')){
      const url=new URL(route.request().url()),key=url.pathname+url.search;
      if(captureFixtures){
        // Extend a frozen scene without silently changing already-reviewed data.
        const existing=fixtureSet.responses[key];
        if(existing)return route.fulfill({status:existing.status,contentType:'application/json',json:existing.body});
        const response=await route.fetch();
        if(!response.ok())throw new Error(`Cannot capture failed read ${key} (${response.status()})`);
        const payload=await response.json();persistFixture(stored=>{stored.responses[key]={status:response.status(),body:payload};});
        return route.fulfill({response,json:payload});
      }
      const stored=fixtureSet.responses[key];
      if(!stored){errors.push(`Missing read fixture ${key}`);return route.abort('failed');}
      return route.fulfill({status:stored.status,contentType:'application/json',json:stored.body});
    }
    if(['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.continue();
    writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'audit-write-blocked',message:'审视写入被隔离'})});
  });
  return {page,writes,errors};
}
export function saveAuditReport(root,name,report) {
  const dir=path.join(root,'tests/visual/reports');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`${name}.json`);fs.writeFileSync(file,`${JSON.stringify(report,null,2)}\n`);
  return file;
}
