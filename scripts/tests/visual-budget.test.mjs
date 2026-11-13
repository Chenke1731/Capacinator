import assert from 'node:assert/strict';
import {assessAxe,pixelOperation,isNeutralBackdrop} from '../lib/visual-budget.mjs';
import {parseShard,applyShard,shardSuffix} from '../lib/visual-shard.mjs';
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
  const strictBudget={},strictExceptions={};
  assert(!assessAxe(violation('.bad'),'closed',strictBudget,strictExceptions,{recordExisting:true,rejectColors:true}).ok);
  assert.deepEqual(strictBudget,{});assert.deepEqual(strictExceptions,{});
  assert(isNeutralBackdrop([0,0,0,191]));assert(isNeutralBackdrop([0,0,0,217]));
  assert(!isNeutralBackdrop([245,158,11,64]));assert(!isNeutralBackdrop([0,0,0,0]));
  assert.deepEqual(parseShard(undefined),{index:1,total:1});
  assert.deepEqual(parseShard('2/4'),{index:2,total:4});
  for(const invalid of ['0/4','5/4','1/0','1','x/4','1/x'])assert.throws(()=>parseShard(invalid));
  const combos=Array.from({length:10},(_,i)=>i);
  assert.deepEqual(applyShard(combos,{index:2,total:3}),[1,4,7]);
  const seen=new Set();
  for(let i=1;i<=3;i++)for(const combo of applyShard(combos,{index:i,total:3})){assert(!seen.has(combo));seen.add(combo);}
  assert.equal(seen.size,combos.length);
  assert.equal(shardSuffix({index:1,total:1}),'');
  assert.equal(shardSuffix({index:2,total:3}),'-shard-2-of-3');
  console.log('visual SELFTEST PASS: equal-count replacement, raised budget, missing baseline, explicit first registration, shard partition');
}
