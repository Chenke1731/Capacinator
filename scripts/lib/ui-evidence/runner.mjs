// UI evidence runner (2026-11-10 MVP)
//
// One read-only browser session:
//   - GETs are fulfilled from the frozen runtime fixture (fail loud on a missing key)
//   - writes are blocked unless a scenario registers an explicit browser-only mock
//   - every mock/blocked write is recorded as evidence
//
// This mirrors scripts/lib/ui-profiles.mjs setupReadOnlyPage(), but adds a
// scenario-owned mock table so a review can submit a form without touching the API.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export const defaultFixture=path.join(repository,'tests/visual/fixtures/runtime-data.json');
export const defaultChrome=process.env.UI_AUDIT_CHROME??'/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

export function loadFixture(file=defaultFixture){
  if(!file)return null;
  if(!fs.existsSync(file))throw new Error(`Fixture not found: ${file}`);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

async function login(api){
  const peopleRes=await fetch(`${api}/api/people?limit=1`);
  if(!peopleRes.ok)throw new Error(`People identity read failed (${peopleRes.status})`);
  const people=await peopleRes.json();
  const person=(people.data?.data??people.data??people)[0];
  if(!person?.id)throw new Error('No usable audit identity');
  const loginRes=await fetch(`${api}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personId:person.id})});
  const payload=await loginRes.json(),auth=payload.data??payload;
  if(!loginRes.ok||!auth.accessToken)throw new Error('Audit login failed');
  return {...auth,user:auth.user??person};
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function createSession({
  base,
  api,
  fixture=defaultFixture,
  viewport={width:1366,height:900},
  theme='light',
  language='zh-CN',
  headless=true,
  chrome=defaultChrome,
  label='',
}){
  const fixtureSet=loadFixture(fixture);
  const auth=await login(api);
  const browser=await chromium.launch({headless,executablePath:chrome});
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const mocks=[],requests=[],writes=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));

  await page.addInitScript(({auth,theme,language})=>{
    localStorage.setItem('capacinator_current_user',JSON.stringify(auth.user));
    localStorage.setItem('auth_token',auth.accessToken);
    if(auth.refreshToken)localStorage.setItem('refresh_token',auth.refreshToken);
    localStorage.setItem('capacinator-language',language);
    localStorage.setItem('theme',theme);
    localStorage.removeItem('req-col-widths-v5');
  },{auth,theme,language});

  if(fixtureSet?.capturedAt)await page.addInitScript(iso=>{
    const OriginalDate=Date,fixed=OriginalDate.parse(iso);
    class AuditDate extends OriginalDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
    window.Date=AuditDate;
  },fixtureSet.capturedAt);

  await page.route('**/api/**',async route=>{
    const request=route.request();
    const method=request.method();
    const url=new URL(request.url());
    const pathname=url.pathname;
    const key=pathname+url.search;
    const payload=request.postData()??null;

    const mock=mocks.find(item=>item.method===method&&item.pathname===pathname);
    if(mock){
      requests.push({method,pathname,search:url.search,payload});
      const result=await mock.handler({request,payload,url});
      if(result?.abort)return route.abort(result.abort);
      return route.fulfill({status:result?.status??200,contentType:'application/json',body:JSON.stringify(result?.body??{})});
    }

    if(['GET','HEAD','OPTIONS'].includes(method)){
      if(fixtureSet&&!pathname.startsWith('/api/auth/')){
        const stored=fixtureSet.responses?.[key];
        if(!stored){errors.push(`Missing read fixture ${key}`);return route.abort('failed');}
        return route.fulfill({status:stored.status??200,contentType:'application/json',json:stored.body});
      }
      return route.continue();
    }

    writes.push({method,pathname,payload});
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'audit-write-blocked',message:'审视写入被隔离'})});
  });

  return {
    base,api,auth,fixtureSet,page,context,browser,requests,writes,errors,label,language,
    mock(method,pathname,handler){mocks.push({method,pathname,handler});},
    clearMocks(){mocks.length=0;},
    async goto(route,{waitUntil='networkidle'}={}){await page.goto(`${base}${route}`,{waitUntil});},
    async waitFor(selector,timeout=15000){await page.locator(selector).first().waitFor({state:'visible',timeout});},
    sleep,
    async close(){await context.close();await browser.close();}
  };
}

export function parsePayload(value){
  if(!value)return null;
  try{return JSON.parse(value);}catch{return value;}
}
