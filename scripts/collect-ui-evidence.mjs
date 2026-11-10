#!/usr/bin/env node
// UI evidence bundle MVP (2026-11-10)
//
// Usage:
//   node scripts/collect-ui-evidence.mjs --scenario intake --only target \
//     --base http://127.0.0.1:3121 --api http://127.0.0.1:3111 \
//     --out /tmp/ui-evidence/head --label HEAD
//
// The runner is read-only: GETs come from the frozen runtime fixture, writes
// are blocked unless the scenario registers a browser-only mock. The output is
// evidence.json + summary.md + shots/*.png, consumed by the UI reviewer.
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSession,defaultFixture} from './lib/ui-evidence/runner.mjs';
import {evaluateAll,INVARIANTS_VERSION} from './lib/ui-evidence/invariants.mjs';
import {renderSummary} from './lib/ui-evidence/summary.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const value=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:undefined;
const has=name=>argv.includes(name);
const valid=new Set(['--scenario','--base','--api','--out','--only','--viewport','--theme','--fixture','--inject','--label','--expect-fail','--headed','--help']);
for(let i=0;i<argv.length;i++){
  if(!valid.has(argv[i]))throw new Error(`Unknown argument ${argv[i]}`);
  if(['--scenario','--base','--api','--out','--only','--viewport','--theme','--fixture','--inject','--label'].includes(argv[i])){
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error(`Missing value for ${argv[i]}`);
    i++;
  }
}
if(has('--help')){
  console.log(`collect-ui-evidence: --scenario intake [--only target|capture|delete|all] [--base url] [--api url] [--out dir] [--viewport 1366x900] [--theme light|dark] [--fixture file|none] [--inject hover-lift|remove-role] [--label text] [--expect-fail] [--headed]`);
  process.exit(0);
}

const scenarioName=value('--scenario')??'intake';
const scenario=(await import(`./lib/ui-evidence/scenarios/${scenarioName}.mjs`)).default;
const base=value('--base')??process.env.UI_AUDIT_BASE??'http://127.0.0.1:3120';
const api=value('--api')??process.env.UI_AUDIT_API??'http://127.0.0.1:3110';
const theme=value('--theme')??'light';
if(!['light','dark'].includes(theme))throw new Error(`Unsupported theme ${theme}`);
const viewportValue=value('--viewport')??'1366x900';
const match=/^(\d+)x(\d+)$/.exec(viewportValue);
if(!match)throw new Error(`Invalid --viewport ${viewportValue}; expected WIDTHxHEIGHT`);
const viewport={width:Number(match[1]),height:Number(match[2])};
const fixtureValue=value('--fixture');
const fixture=fixtureValue==='none'?null:fixtureValue??defaultFixture;
const inject=value('--inject')??'none';
if(!['none','hover-lift','remove-role'].includes(inject))throw new Error(`Unsupported --inject ${inject}`);
const label=value('--label')??'';
const rawOnly=value('--only')??'all';
const only=rawOnly==='all'?scenario.steps.map(step=>step.id):rawOnly.split(',').map(item=>item.trim()).filter(Boolean);
if(only.length===0)throw new Error('No steps selected; use --only target|capture|delete|all');
const unknownSteps=only.filter(id=>!scenario.steps.some(step=>step.id===id));
if(unknownSteps.length)throw new Error(`Unknown step(s): ${unknownSteps.join(', ')}`);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const outDir=path.resolve(value('--out')??path.join('/tmp/ui-evidence',`${scenarioName}-${label||'run'}-${stamp}`));
const shotDir=path.join(outDir,'shots');
fs.mkdirSync(shotDir,{recursive:true});

let gitSha='unknown';
try{gitSha=execSync('git rev-parse --short HEAD',{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{gitSha=process.env.GIT_SHA??'unknown';}

const startedAt=new Date().toISOString();
const started=Date.now();
const session=await createSession({
  base,api,fixture,viewport,theme,
  language:'zh-CN',
  headless:!has('--headed'),
  label,
});
const ctx={session,viewport,theme,inject,shotDir,outDir};
const evidence={};
const timings={};
const stepErrors=[];

try{
  try{
    await session.goto(scenario.path);
    await session.waitFor(scenario.ready);
  }catch(error){
    stepErrors.push({step:'navigation',message:error.message});
  }
  if(!stepErrors.some(item=>item.step==='navigation')){
    for(const step of scenario.steps){
      if(!only.includes(step.id))continue;
      const stepStart=Date.now();
      try{
        evidence[step.id]=await step.run(ctx);
      }catch(error){
        stepErrors.push({step:step.id,message:error.message});
        evidence[step.id]={error:error.message};
      }
      timings[step.id]=Date.now()-stepStart;
    }
  }
}finally{
  await session.close();
}

const durationMs=Date.now()-started;
const meta={
  scenario:scenarioName,
  label,
  gitSha,
  page:scenario.path,
  base,
  api,
  viewport,
  theme,
  language:session.language??'zh-CN',
  invariantsVersion:INVARIANTS_VERSION,
  auth:{personId:session.auth?.user?.id??null,userName:session.auth?.user?.name??null},
  fixture:fixture??'(live)',
  fixtureCapturedAt:session.fixtureSet?.capturedAt??null,
  inject,
  startedAt,
  durationMs,
  steps:timings,
  stepErrors,
  requests:session.requests,
  blockedWrites:session.writes,
  pageErrors:session.errors,
};
const baseVerdict=evaluateAll(evidence,{steps:only,meta});
const extras=[];
if(stepErrors.length)extras.push({
  id:'step-errors',
  severity:'P1',
  ok:false,
  detail:stepErrors.map(item=>`${item.step}: ${item.message}`).join(' | '),
});
if(session.errors.length)extras.push({
  id:'page-errors',
  severity:'P1',
  ok:false,
  detail:session.errors.slice(0,3).join(' | '),
});
if(session.writes.length)extras.push({
  id:'unmocked-writes',
  severity:'P2',
  ok:false,
  warnOnly:true,
  detail:session.writes.map(item=>`${item.method} ${item.pathname}`).join(' | '),
});
const checks=[...baseVerdict.checks,...extras];
const blocking=checks.filter(item=>!item.ok&&!item.warnOnly&&item.severity!=='P2').length;
const warnings=checks.filter(item=>!item.ok&&(item.warnOnly||item.severity==='P2')).length;
const verdict={
  ...baseVerdict,
  checks,
  blocking,
  warnings,
  status:blocking?'fail':warnings?'warn':'pass',
  passed:checks.filter(item=>item.ok).length,
  total:checks.length,
};
fs.writeFileSync(path.join(outDir,'evidence.json'),`${JSON.stringify({meta,evidence,verdict},null,2)}\n`);
const summary=renderSummary({meta,evidence,verdict,outDir});
fs.writeFileSync(path.join(outDir,'summary.md'),summary);

console.log(summary);
console.log(`Evidence: ${path.join(outDir,'evidence.json')}`);
if(has('--expect-fail')){
  process.exit(verdict.status==='fail'?0:1);
}
process.exit(verdict.status==='fail'?1:0);
