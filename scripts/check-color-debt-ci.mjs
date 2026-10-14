import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const eventBase=process.env.COLOR_DEBT_BASE_REF;
if(eventBase===undefined) throw new Error('CI must explicitly provide COLOR_DEBT_BASE_REF');
// A branch-creation event has an all-zero before SHA, not a missing Git object.
// Compare to the declared initial source baseline in that one documented case.
const branchCreation=/^0{40}$/.test(eventBase)||eventBase==='';
const base=branchCreation?JSON.parse(fs.readFileSync('tests/visual/color-debt.json','utf8')).baselineHead:eventBase;
console.log(`Color guard comparison: ${base}${branchCreation?' (branch creation: declared inventory baseline)':''}`);
execFileSync(process.execPath,['scripts/audit-color-debt.mjs','--check','--base-ref',base],{stdio:'inherit'});
