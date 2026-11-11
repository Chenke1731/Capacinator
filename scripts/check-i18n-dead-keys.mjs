#!/usr/bin/env node
// i18n 死键普查（批 C 尾项，2026-11-11）：报告型工具，不自动删除。
// 已知盲区（删除前必须逐键过审）：动态构造变体（t(`ns:${x}.y`) 的非常规写法）、
// i18next 复数/上下文后缀、服务端消费（本工具只扫 client/src）、
// key 数组/反射消费。343 候选（2026-11-11 首扫）删除属评审后继项。
import fs from 'node:fs';
import path from 'node:path';
const dir='client/src/i18n/locales/zh-CN';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
const srcFiles=[];
const walk=d=>{for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory()&&!p.includes('node_modules')&&!p.includes('__tests__')&&!p.includes('locales'))walk(p);else if(/\.(tsx?|jsx?)$/.test(f)&&!p.includes('locales'))srcFiles.push(p);}};
walk('client/src');
const src=srcFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const dynamicPrefixes=[...src.matchAll(/t\(\s*[`']([a-zA-Z-]+):([a-zA-Z0-9_.-]*)\$\{/g)].map(m=>m[1]+':'+m[2]);
let total=0,dead=0;const report=[];
for(const f of files){
 const ns=f.replace('.json','');
 const j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 const flat=[];(function rec(o,prefix){for(const k of Object.keys(o)){const key=prefix?prefix+'.'+k:k;typeof o[k]==='object'&&o[k]!==null?rec(o[k],key):flat.push(key);}})(j,'');
 for(const key of flat){
  total++;
  const full=ns+':'+key;
  if(!src.includes(full)&&!dynamicPrefixes.some(p=>full.startsWith(p))){dead++;report.push(full);}
 }
}
console.log(`i18n 死键普查: ${dead}/${total} 候选（盲区见文件头注释；删除需逐键评审）`);
fs.writeFileSync('tests/visual/reports/i18n-dead-keys.json',JSON.stringify({scannedAt:new Date().toISOString(),total,dead,report},null,1)+'\n');
console.log('report: tests/visual/reports/i18n-dead-keys.json');
