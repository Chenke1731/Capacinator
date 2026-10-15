import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import {auditEnvironment,authenticate,setupReadOnlyPage,saveAuditReport} from './lib/ui-profiles.mjs';
import {installContrastHelpers} from './lib/ui-state-audit.mjs';

if(process.argv.length>2)throw Error('Chart audit accepts no options');
const browser=await chromium.launch({executablePath:auditEnvironment.chrome}),auth=await authenticate(),evidence=[];
try {
  for(const theme of ['light','dark'])for(const width of [1600,1366])for(const mode of ['demand','person','report-palette']) {
    const c=await browser.newContext({viewport:{width,height:width===1600?900:768}}),s=await setupReadOnlyPage(c,auth,theme),page=s.page;
    await page.goto(auditEnvironment.base+'/projects',{waitUntil:'networkidle'});
    await page.evaluate(async mode=>{const m=await import('/client/src/__fixtures__/chart-color-audit.tsx');await m.mountChartAudit(mode);},mode);
    const selector=mode==='report-palette'?'#chart-color-audit .recharts-bar-rectangle path':'#chart-color-audit path.recharts-area-curve';
    await page.locator(selector).first().waitFor({state:'attached'});await page.locator('#chart-color-audit .recharts-wrapper').first().waitFor({state:'visible'});await page.waitForTimeout(1200);await page.evaluate(installContrastHelpers);
    const graphics=await page.evaluate(selector=>{
      const api=window.__auditColor;
      return [...document.querySelectorAll(selector)].map(e=>{const st=getComputedStyle(e),color=st.stroke==='none'?st.fill:st.stroke,bg=api.background(e),fg=api.parse(color),svg=e.ownerSVGElement.getBoundingClientRect();return {color,background:bg,ratio:api.ratio(api.over(bg,fg),bg),threshold:3,pathLength:e.getTotalLength(),rendered:svg.width>0&&svg.height>0&&st.display!=='none'&&st.visibility!=='hidden'};});
    },selector);
    if(graphics.length<(mode==='demand'?8:mode==='person'?10:16)||graphics.some(r=>r.ratio<3||!r.rendered||!r.pathLength))throw Error(`Missing/low contrast chart series ${mode}/${theme}: ${JSON.stringify(graphics)}`);
    const svgText=await page.evaluate(()=>[...document.querySelectorAll('#chart-color-audit svg text')].filter(e=>e.textContent.trim()).map(e=>{
      const api=window.__auditColor,st=getComputedStyle(e),bg=api.background(e),fg=api.parse(st.fill);return {text:e.textContent,foreground:st.fill,background:bg,ratio:api.ratio(api.over(bg,fg),bg),threshold:4.5};
    }));
    if(!svgText.length||svgText.some(r=>r.ratio<4.5))throw Error(`SVG axis text contrast failure ${mode}/${theme}: ${JSON.stringify(svgText)}`);
    const first=page.locator('#chart-color-audit .recharts-wrapper').first(),box=await first.boundingBox();
    await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);await page.waitForTimeout(300);
    const axe=await new AxeBuilder({page}).include('#chart-color-audit').withRules(['color-contrast']).analyze();
    if(axe.violations.length)throw Error(`Chart text contrast failure ${mode}/${theme}: ${JSON.stringify(axe.violations.map(v=>v.nodes.map(n=>n.target)))}`);
    const tokenPairs=await page.evaluate(()=>{
      const api=window.__auditColor,host=document.querySelector('#chart-color-audit'),pairs=[];
      for(const surface of ['bg-primary','bg-secondary','bg-tertiary'])for(const series of ['blue','green','amber','purple','pink','red','cyan','lime','orange','gray','indigo','violet']) {
        const e=document.createElement('span');e.style.background=`var(--${surface})`;e.style.color=`var(--series-${series})`;host.append(e);const st=getComputedStyle(e),bg=api.background(e);pairs.push({series,surface,ratio:api.ratio(api.parse(st.color),bg),threshold:3});e.remove();
      }return pairs;
    });
    if(tokenPairs.some(p=>p.ratio<3))throw Error('Series token failed an actual theme surface');
    if(s.errors.length||s.writes.length)throw Error(`Unexpected chart request/runtime error ${JSON.stringify(s.errors)}`);
    const artifact=`tests/visual/reports/chart-${mode}-${theme}-${width}.png`;await page.screenshot({path:artifact});
    evidence.push({mode,theme,width,graphics,svgText,tokenPairs,axe:[],artifact,writes:s.writes,errors:s.errors});console.log(`PASS ${mode}/${theme}/${width}: ${graphics.length} rendered paths, ${svgText.length} SVG labels, 36 surface pairs`);await c.close();
  }
}finally{await browser.close();saveAuditReport(process.cwd(),'chart-color-evidence',{evidence});}
