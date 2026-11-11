#!/usr/bin/env node
// i18n 死键普查（批 C 入库、批 D 四修正，2026-11-11）：报告型工具，不自动删除。
// 删除纪律（批 D 评审）：本报告 JSON 是删除的唯一凭证集——叙述性数字不入执行依据；
// 双语言同步删除（zh-CN 清单镜像 en-US）；删除后本工具复跑必须为 0。
//
// 消费判定（按保守前缀折叠，多保留不误删）：
// 1. 静态全文引用：src.includes('ns:key')
// 2. 模板前缀消费（批 D G-1）：源码任何 `ns:prefix${` 出现即把 ns:prefix.
//    标记为消费——不要求 t( 直缀（LifecycleBanner helper-return、ImportUnified
//    const 赋值两类写法实测漏网过 t( 锚版）
// 3. 复数/区间折叠（批 D D1）：key_one/_other/_few/_many/_zero/_two 或 _N-M
//    后缀折叠为基键再比对（i18next 运行时由 t(base,{count}) 解析）
// 4. 常量组映射（批 D D3）：启动时正则解析 enum-labels.ts 的 ENUM_GROUPS
//    字面量（'enums:<group>'），出现的组前缀标记消费——源即真相零镜像，
//    组将来删除后重跑即可判死
// 残余盲区（文件头声明，逐键复核兜底）：key 数组/反射消费、服务端消费。
import fs from 'node:fs';
import path from 'node:path';
const dir='client/src/i18n/locales/zh-CN';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
const srcFiles=[];
const walk=d=>{for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory()&&!p.includes('node_modules')&&!p.includes('__tests__')&&!p.includes('locales'))walk(p);else if(/\.(tsx?|jsx?)$/.test(f)&&!p.includes('locales'))srcFiles.push(p);}};
walk('client/src');
const src=srcFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n');
// 修正①：去掉 t\(\s* 锚——任意 ns:prefix${ 即消费
const dynamicPrefixes=[...src.matchAll(/[`']([a-zA-Z-]+):([a-zA-Z0-9_.-]*)\$\{/g)].map(m=>m[1]+':'+m[2]);
// 修正②：运行时解析 ENUM_GROUPS 常量组（enum-labels.ts）
const enumSrc=fs.readFileSync('client/src/lib/enum-labels.ts','utf8');
const enumGroups=[...enumSrc.matchAll(/'([a-zA-Z-]+):([a-zA-Z0-9_.-]+)'/g)].map(m=>m[1]+':'+m[2]);
for(const g of enumGroups)dynamicPrefixes.push(g);
// 修正③：复数/区间后缀折叠
const PLURAL=/^(.*)_(one|other|few|many|zero|two|\d+-\d+)$/;
const foldKey=k=>{const m=k.match(PLURAL);return m?m[1]:k;};
let total=0,dead=0;const report=[];
for(const f of files){
 const ns=f.replace('.json','');
 const j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 const flat=[];(function rec(o,prefix){for(const k of Object.keys(o)){const key=prefix?prefix+'.'+k:k;typeof o[k]==='object'&&o[k]!==null?rec(o[k],key):flat.push(key);}})(j,'');
 for(const key of flat){
  total++;
  const full=ns+':'+key;
  const candidates=[full,ns+':'+foldKey(key)];
  const used=candidates.some(c=>src.includes(c))||dynamicPrefixes.some(p=>full.startsWith(p+'.')||full===p||full.startsWith(p));
  if(!used){dead++;report.push(full);}
 }
}
// 修正④：报告按命名空间分组
const byNs={};for(const k of report){const ns=k.split(':')[0];(byNs[ns]??=[]).push(k.split(':').slice(1).join(':'));}
console.log(`i18n 死键普查: ${dead}/${total} 候选（判定规则见文件头）`);
for(const ns of Object.keys(byNs).sort())console.log(`  ${ns}: ${byNs[ns].length}`);
fs.writeFileSync('tests/visual/reports/i18n-dead-keys.json',JSON.stringify({scannedAt:new Date().toISOString(),total,dead,byNamespace:byNs,report},null,1)+'\n');
console.log('report: tests/visual/reports/i18n-dead-keys.json');
