import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sourceHash} from '../lib/color-debt.mjs';

const paths=['tests/visual/axe-budget.json','tests/visual/axe-exceptions.json',...['light','dark'].flatMap(t=>[1600,1366].map(w=>`tests/visual/__screenshots__/projects-${t}-${w}.png`))];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,sourceHash(fs.readFileSync(p))]));
const before=hashes();let failed=false;
try{execFileSync(process.execPath,['scripts/verify-visual.mjs','--profile','projects','--inject-svg-test-violation'],{env:{...process.env,UPDATE_BASELINES:'1'},stdio:'pipe'});}catch(e){assert.equal(e.status,1);failed=true;}
assert(failed,'The visible aria-hidden SVG regression must fail independently of axe');
assert.deepEqual(hashes(),before,'SVG regression must not change pixel or accessibility baselines');
const report=JSON.parse(fs.readFileSync('tests/visual/reports/visual-projects-default-svg-injection.json'));
assert.equal(report.combinations,4);
for(const e of report.evidence){assert.equal(e.axe.count,0);assert(e.svgAxisText.some(r=>r.text==='Injected SVG regression'&&r.ratio<4.5));assert(e.checks.some(c=>!c.ok&&c.name.startsWith('基线')));}
fs.writeFileSync('tests/visual/reports/svg-update-selftest.json',JSON.stringify({combinations:4,axeViolations:0,svgRegressionsDetected:4,pixelAndAxeBudgetsUnchanged:true,hashes:before},null,2)+'\n');
console.log('SVG SELFTEST PASS: axe sees zero; native SVG guard rejects all four combinations; UPDATE changes no baseline/budget');
