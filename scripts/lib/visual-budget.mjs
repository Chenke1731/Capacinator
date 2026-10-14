/** Named exceptions cannot be traded for new nodes, even when their totals match. */
export function axeIdentities(violations) {
  return [...new Set(violations.flatMap(v=>v.nodes.map(n=>`${v.id}|${JSON.stringify(n.target)}`)))].sort();
}
export function assessAxe(violations,key,budgets,exceptions,{recordExisting=false}={}) {
  const identities=axeIdentities(violations),count=violations.reduce((s,v)=>s+v.nodes.length,0);
  const existing=Object.hasOwn(budgets,key),cap=budgets[key]??0;
  if(recordExisting&&!Object.hasOwn(exceptions,key)) {
    if(existing&&count>cap)return {ok:false,count,cap,added:identities,reason:'Existing budget cannot increase'};
    if(!existing)budgets[key]=count;
    exceptions[key]=identities;
  }
  const added=identities.filter(x=>!(exceptions[key]??[]).includes(x));
  return {ok:count<=(budgets[key]??0)&&added.length===0,count,cap:budgets[key]??0,added};
}
export function pixelOperation({update,baselineExists}) {
  if(update)return'update';
  if(!baselineExists)return'missing';
  return'compare';
}
