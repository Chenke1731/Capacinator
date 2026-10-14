#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanRoot, scanSources, initialLedger, checkLedger, resolveOrphan, summarize, LEDGER_PATH, isProductionFile } from './lib/color-debt.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const known=new Set(['--scan','--init','--check','--selftest','--help','--reason','--base-ref','--resolve-orphan','--resolution','--to','--token','--file']);
const values=new Set(['--reason','--base-ref','--resolve-orphan','--resolution','--to','--token','--file']);
const options={};
for(let i=0;i<args.length;i++) {
  if(!known.has(args[i])) throw new Error(`Unknown argument ${args[i]}`);
  const key=args[i];
  if(values.has(key)) {
    if(!args[i+1]||(args[i+1].startsWith('--')&&key!=='--token')) throw new Error(`Missing value for ${key}`);
    options[key]=args[++i];
  } else options[key]=true;
}
if(options['--help']) {
  console.log('audit-color-debt: --scan [--file path] | --init --reason text | --check [--base-ref ref] | --resolve-orphan fingerprint --resolution rename|delete|tokenize|retired-unused --reason text [--to fingerprint] [--token name] | --selftest');
  process.exit(0);
}
if(options['--selftest']) { const tests=await import('./tests/color-debt.test.mjs');await tests.runSelfTests();process.exit(0); }
if(['--scan','--init','--check','--resolve-orphan'].filter(k=>options[k]).length!==1) throw new Error('Choose exactly one operation; scan/check never write the ledger');
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const target=path.join(root,LEDGER_PATH),scan=scanRoot(root);
if(scan.errors.length) throw new Error(scan.errors.join('\n'));
if(options['--scan']) {
  const entries=options['--file']?scan.entries.filter(e=>e.file===options['--file']):scan.entries;
  if(options['--file']&&(!isProductionFile(options['--file'])||!fs.existsSync(path.join(root,options['--file'])))) throw new Error(`Unknown production source ${options['--file']}`);
  console.log(JSON.stringify({summary:summarize(entries),entries,excluded:scan.excluded,symbolicOccurrences:scan.symbolic.length},null,2));
} else if(options['--init']) {
  if(fs.existsSync(target)) throw new Error('Ledger exists; initialization cannot reset a baseline');
  if(!options['--reason']) throw new Error('Initialization requires --reason');
  const ledger=initialLedger(scan,git('rev-parse','HEAD'),options['--reason']);
  fs.writeFileSync(target,`${JSON.stringify(ledger,null,2)}\n`,{flag:'wx'});
  console.log(JSON.stringify(ledger.summary,null,2));
} else {
  if(!fs.existsSync(target)) throw new Error('No ledger; initialize explicitly before checking');
  const ledger=JSON.parse(fs.readFileSync(target,'utf8'));
  const ref=options['--base-ref']??'HEAD';
  const baseHead=git('rev-parse','--verify',`${ref}^{commit}`);
  if(options['--resolve-orphan']) {
    const updated=resolveOrphan(ledger,options['--resolve-orphan'],{resolution:options['--resolution'],reason:options['--reason'],to:options['--to'],token:options['--token'],baselineHead:baseHead},scan);
    fs.writeFileSync(target,`${JSON.stringify(updated,null,2)}\n`);
    console.log(`Resolved ${options['--resolve-orphan']}: ${options['--resolution']}`);
  } else {
    let baseline;
    const tracked=git('ls-tree','-r','--name-only',baseHead).split('\n');
    if(tracked.includes(LEDGER_PATH)) baseline=JSON.parse(git('show',`${baseHead}:${LEDGER_PATH}`));
    else {
      // The first delivery compares real source at the baseline, never an empty list.
      const files=tracked.filter(f=>f.startsWith('client/src/')&&isProductionFile(f));
      baseline=initialLedger(scanSources(files.map(f=>[f,git('show',`${baseHead}:${f}`)])),baseHead,'first-delivery-source-comparison');
      if(ledger.baselineHead!==baseHead) throw new Error('First-delivery baselineHead does not match comparison commit');
    }
    const issues=checkLedger(scan,ledger,baseline,root);
    if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
    else console.log(`color-debt PASS: ${scan.entries.length} identities / ${summarize(scan.entries).occurrences} occurrences; ${ledger.entries.filter(e=>e.decision==='pending').length} pending classification`);
  }
}
