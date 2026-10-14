import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanSources, initialLedger, checkLedger, resolveOrphan } from '../lib/color-debt.mjs';

export async function runSelfTests() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'capacinator-color-audit-'));
  try {
    const source='/* #f00\n red */\n:root { --accent: #ff0000; }\n.a, .b { color: red; box-shadow: 0 0 2px rgba(1,2,3,.4), 0 0 1px #abcd; background: var(--x, #fff); }';
    const files=[['client/src/a.css',source],['client/src/View.tsx','const x = { color: "#f00", shadow: "linear-gradient(red, blue)" }; // #abcdef\nconst notColor="project-#123";'],['client/src/__tests__/a.test.ts','const x="#f00";']];
    const scan=scanSources(files);
    assert.equal(scan.errors.length,0);
    assert.equal(scan.entries.reduce((n,e)=>n+e.count,0),8);
    assert.equal(scan.entries.find(e=>e.kind==='token-definition').literal,'#ff0000');
    assert.equal(scan.entries.find(e=>e.file.endsWith('a.css')&&e.literal==='red').locations[0].line,4);
    assert.equal(scan.excluded.length,1);
    const old=initialLedger(scan,'baseline','selftest');
    assert.deepEqual(checkLedger(scan,structuredClone(old),old,root),[]);
    const shifted=scanSources(files.map(([f,s])=>[f,'\n\n'+s]));
    assert.deepEqual(checkLedger(shifted,structuredClone(old),old,root),[]);
    const extra=scanSources([...files,['client/src/new.css','.new {color:#abc123;}']]);
    assert(checkLedger(extra,old,old,root).some(x=>x.startsWith('Unregistered')));
    const repeated=scanSources(files.map(([f,s])=>[f,f.endsWith('a.css')?s+'\n.a, .b {color:red;}':s]));
    const altered=structuredClone(old);altered.entries=repeated.entries;altered.summary=initialLedger(repeated,'baseline','selftest').summary;
    assert(checkLedger(repeated,altered,old,root).some(x=>x.startsWith('Unapproved new/increased')));
    const removed=scanSources(files.filter(([f])=>!f.endsWith('View.tsx')));
    assert(checkLedger(removed,old,old,root).some(x=>x.startsWith('Orphan')));
    let resolved=structuredClone(old);
    for(const e of old.entries.filter(x=>x.file.endsWith('View.tsx'))) resolved=resolveOrphan(resolved,e.fingerprint,{resolution:'retired-unused',reason:'unused module',baselineHead:'baseline'},removed);
    assert.deepEqual(checkLedger(removed,resolved,old,root),[]);
    const renamed=scanSources([['client/src/a.css',source.replace('.a, .b','.renamed')],...files.slice(1)]);
    let ren=structuredClone(old);
    for(const e of old.entries.filter(x=>x.owner==='.a, .b')) {
      const dest=renamed.entries.find(x=>x.owner==='.renamed'&&x.literal===e.literal);
      ren=resolveOrphan(ren,e.fingerprint,{resolution:'rename',reason:'selector rename',to:dest.fingerprint,baselineHead:'baseline'},renamed);
    }
    assert.deepEqual(checkLedger(renamed,ren,old,root),[]);
    assert(ren.entries.filter(x=>x.owner==='.renamed').every(x=>x.decision==='pending'&&!x.evidence.length));
    assert.throws(()=>resolveOrphan(structuredClone(old),old.entries[0].fingerprint,{resolution:'delete',reason:'still present'},scan));
    const corrupt=structuredClone(old);corrupt.summary.occurrences--;
    assert(checkLedger(scan,corrupt,old,root).some(x=>x.includes('Summary')));
    const exempt=structuredClone(old);exempt.entries.find(x=>x.literal==='red').decision='accepted-literal';
    assert(checkLedger(scan,exempt,old,root).some(x=>x.includes('evidence')));
    const disguised=structuredClone(old);const consumer=disguised.entries.find(x=>x.literal==='red');consumer.kind='token-definition';consumer.decision='not-debt';consumer.reason='fake exemption';
    assert(checkLedger(scan,disguised,old,root).some(x=>x.includes('disguised')));
    assert(scanSources([['client/src/b.css','.b {color:red;']]).errors.length);
    console.log('color-debt SELFTEST PASS: parsing, definitions, original locations, exclusions, new/duplicate/orphan gates, rename/retirement, stale evidence, corrupt totals and parse failure');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
