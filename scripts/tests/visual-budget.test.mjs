import assert from 'node:assert/strict';
import {assessAxe,pixelOperation} from '../lib/visual-budget.mjs';
export function runVisualSelfTests(){
  const violation=target=>[{id:'color-contrast',nodes:[{target:[target]}]}];
  const budget={page:1},exceptions={page:['color-contrast|[".old"]']};
  assert(assessAxe(violation('.old'),'page',budget,exceptions).ok);
  assert(!assessAxe(violation('.new'),'page',budget,exceptions).ok);
  const before=JSON.stringify(budget);
  assert(!assessAxe([{id:'color-contrast',nodes:[{target:['.old']},{target:['.new']}]}],'page',budget,exceptions,{recordExisting:true}).ok);
  assert.equal(JSON.stringify(budget),before);
  assert.equal(pixelOperation({update:false,baselineExists:false}),'missing');
  assert.equal(pixelOperation({update:true,baselineExists:true}),'update');
  const initial={},newExceptions={};assert(assessAxe(violation('.old'),'new',initial,newExceptions,{recordExisting:true}).ok);
  assert(!assessAxe(violation('.new'),'new',initial,newExceptions,{recordExisting:true}).ok);
  console.log('visual SELFTEST PASS: equal-count replacement, raised budget, missing baseline, explicit first registration');
}
