import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import colorNames from 'color-name';
import ts from 'typescript';
import { uiReachability } from './ui-reachability.mjs';

export const SCANNER_VERSION = 1;
export const LEDGER_PATH = 'tests/visual/color-debt.json';
const colorFunctions = new Set(['rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color','device-cmyk']);
const symbols = new Set(['transparent','currentcolor','inherit','initial','unset','revert','revert-layer']);
const kinds = new Set(['token-definition','neutral-literal','semantic-color','data-color','library-color','unknown','non-color']);
const decisions = new Set(['pending','fix','tokenize','accepted-literal','retained-unused','not-debt']);
export const sourceHash = value => createHash('sha256').update(value).digest('hex');
export const isProductionFile = file => /\.(css|tsx?)$/.test(file) && !/(^|\/)(__tests__|__mocks__|__fixtures__)(\/|$)|\.(test|spec)\./.test(file);
const normalize = value => String(value).trim().replace(/\s+/g, ' ');

export function productionFiles(root) {
  const included = [], excluded = [];
  function walk(dir) {
    for (const item of fs.readdirSync(path.join(root,dir), {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = `${dir}/${item.name}`;
      if (item.isDirectory()) walk(file);
      else if (/\.(css|tsx?)$/.test(file)) (isProductionFile(file)?included:excluded).push(file);
    }
  }
  walk('client/src');
  return {included,excluded};
}

function isNeutral(literal) {
  let rgb;
  if (/^#[\da-f]+$/i.test(literal)) {
    let hex=literal.slice(1);
    if(hex.length<=4) hex=[...hex].map(x=>x+x).join('');
    rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  } else if(colorNames[literal.toLowerCase()]) rgb=colorNames[literal.toLowerCase()];
  else if(/^rgba?\(/i.test(literal)) {
    const c=literal.slice(literal.indexOf('(')+1).match(/[-+]?(?:\d*\.)?\d+%?/g);
    if(c?.length>=3) rgb=c.slice(0,3).map(x=>parseFloat(x)*(x.endsWith('%')?2.55:1));
  }
  return rgb && Math.max(...rgb)-Math.min(...rgb)<=12;
}

/** Nested colors and var fallbacks count; comments and URL payloads do not. */
export function colorsInValue(value) {
  const colors=[], symbolic=[];
  valueParser(value).walk(node=>{
    if(node.type==='function') {
      const name=node.value.toLowerCase();
      if(['url','attr'].includes(name)) return false;
      if(colorFunctions.has(name)) {
        const literal=valueParser.stringify(node);
        if(/\bvar\s*\(/i.test(literal)) return;
        colors.push({literal,offset:node.sourceIndex});
        return false;
      }
      return;
    }
    if(node.type!=='word') return;
    // Template tails can end in an unmatched ')' because their opening
    // function is in an earlier interpolated fragment: `${ink} 55%, #111827)`.
    // value-parser preserves that closing delimiter in the word token.
    const word=node.value.toLowerCase().replace(/\)+$/,'');
    if(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(word)||Object.hasOwn(colorNames,word)) colors.push({literal:node.value.slice(0,word.length),offset:node.sourceIndex});
    else if(symbols.has(word)) symbolic.push({literal:node.value,offset:node.sourceIndex});
  });
  return {colors,symbolic};
}

function cssContext(node) {
  const parents=[];
  for(let n=node.parent;n&&n.type!=='root';n=n.parent) parents.unshift(n.type==='atrule'?`@${n.name} ${normalize(n.params)}`:normalize(n.selector??''));
  return parents;
}
function tsContext(node,source) {
  const names=[];
  for(let n=node.parent;n;n=n.parent) {
    if((ts.isVariableDeclaration(n)||ts.isPropertyAssignment(n)||ts.isPropertyDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n))&&n.name) names.unshift(normalize(n.name.getText(source)));
    else if(ts.isJsxAttribute(n)) names.unshift(`jsx:${n.name.getText(source)}`);
  }
  return names.length?names:['anonymous-string'];
}

export function scanSources(sources) {
  const records=new Map(),excluded=[],errors=[],symbolic=[],variables=[];
  function add(file,source,context,owner,property,value,start,definition=false) {
    const parsed=colorsInValue(value);
    valueParser(value).walk(node=>{
      if(node.type==='function'&&['url','attr'].includes(node.value.toLowerCase()))return false;
      if(node.type==='function'&&node.value.toLowerCase()==='var'){
        const name=node.nodes.find(n=>n.type==='word')?.value;
        if(name?.startsWith('--'))variables.push({file,context,owner,property,name});
      }
    });
    for(const c of parsed.colors) {
      const literal=normalize(c.literal).toLowerCase();
      const fingerprint=sourceHash(JSON.stringify([file,context,owner,property,literal]));
      const index=start+c.offset,before=source.slice(0,index);
      const location={line:before.split('\n').length,column:index-before.lastIndexOf('\n')};
      const kind=definition?'token-definition':isNeutral(literal)?'neutral-literal':file.endsWith('.css')?'semantic-color':'unknown';
      if(!records.has(fingerprint)) records.set(fingerprint,{
        fingerprint,file,context,owner,property,literal,locations:[],count:0,kind,reachability:'unverified',
        decision:definition?'not-debt':'pending',semanticRole:null,
        reason:definition?'CSS custom-property definition; render validation is separate.':null,evidence:[]
      });
      const e=records.get(fingerprint);e.count++;e.locations.push(location);
    }
    for(const c of parsed.symbolic) symbolic.push({file,owner,property,literal:c.literal});
  }
  for(const [file,source] of [...sources].sort(([a],[b])=>a.localeCompare(b))) {
    if(!isProductionFile(file)){excluded.push({file,reason:'test/mock/fixture or unsupported source extension'});continue;}
    try {
      if(file.endsWith('.css')) {
        postcss.parse(source,{from:file}).walkDecls(node=>{
          const c=cssContext(node);
          const start=node.source.start.offset+node.prop.length+(node.raws.between??':').length;
          add(file,source,c.slice(0,-1),c.at(-1)??':root',node.prop,node.value,start,node.prop.startsWith('--'));
        });
      } else {
        const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
        if(ast.parseDiagnostics.length) throw new Error(ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText,'\n'));
        function visit(node) {
          if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)) {
            const c=tsContext(node,ast),start=node.getStart(ast)+1;
            add(file,source,c.slice(0,-1),c.at(-1),c.at(-1),source.slice(start,node.end-1),start);
          } else if(ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)) {
            const c=tsContext(node,ast),raw=node.text,parsed=colorsInValue(raw);
            if(parsed.colors.length||/\bvar\s*\(/i.test(raw)) add(file,source,c.slice(0,-1),c.at(-1),c.at(-1),raw,node.getStart(ast)+1);
            else if(/\b(?:rgb|hsl|oklch|color)\(/i.test(raw)) errors.push(`${file}: dynamic color template requires an explicit parser adapter`);
          }
          ts.forEachChild(node,visit);
        }
        visit(ast);
      }
    } catch(error){errors.push(`${file}: ${error.message}`);}
  }
  return {entries:[...records.values()].sort((a,b)=>`${a.file}|${a.fingerprint}`.localeCompare(`${b.file}|${b.fingerprint}`)),excluded,errors,symbolic,variables};
}
export function scanRoot(root) {
  const f=productionFiles(root);
  const scan=scanSources(f.included.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
  scan.excluded.push(...f.excluded.map(file=>({file,reason:'test/mock/fixture'})));
  return scan;
}
export function summarize(entries) {
  const byKind={},byDecision={},byFile={};
  for(const e of entries){byKind[e.kind]=(byKind[e.kind]??0)+e.count;byDecision[e.decision]=(byDecision[e.decision]??0)+e.count;byFile[e.file]=(byFile[e.file]??0)+e.count;}
  return {occurrences:entries.reduce((n,e)=>n+e.count,0),identities:entries.length,uniqueColors:new Set(entries.map(e=>e.literal)).size,files:Object.keys(byFile).length,byKind,byDecision,byFile};
}
export function initialLedger(scan,head,reason) {
  if(scan.errors.length) throw new Error(scan.errors.join('\n'));
  return {schemaVersion:1,scannerVersion:SCANNER_VERSION,baselineHead:head,initializationReason:reason,entries:scan.entries,resolutions:[],additions:[],summary:summarize(scan.entries),excluded:scan.excluded};
}
function validEvidence(e,root) {
  if(!e.reason||!e.semanticRole||!e.evidence?.length) return false;
  if(!['light','dark'].every(theme=>e.evidence.some(v=>v.theme===theme)))return false;
  return e.evidence.every(v=>{
    const artifact=v.artifact&&path.resolve(root,v.artifact);
    return v.fingerprint===e.fingerprint&&v.fileHash&&v.state&&v.profile&&v.viewport?.width&&v.viewport?.height&&v.implementationHead&&
      v.foreground&&v.background&&Number.isFinite(v.threshold)&&v.threshold>=3&&Number.isFinite(v.ratio)&&v.ratio>=v.threshold&&
      artifact&&fs.existsSync(artifact)&&v.artifactHash===sourceHash(fs.readFileSync(artifact))&&
      v.fileHash===sourceHash(fs.readFileSync(path.join(root,e.file),'utf8'))&&v.dependencies&&Object.keys(v.dependencies).length>0&&
      Object.entries(v.dependencies).every(([file,hash])=>fs.existsSync(path.join(root,file))&&sourceHash(fs.readFileSync(path.join(root,file)))===hash);
  });
}

/** Identity comparison prevents an unrelated deletion from hiding a new literal. */
export function checkLedger(scan,ledger,baseline,root) {
  const issues=[...scan.errors];
  if(baseline.governanceComplete&&!ledger.governanceComplete)issues.push('Completed color governance cannot be reopened by dropping its classification gate');
  if(ledger.governanceComplete&&ledger.entries.some(e=>e.decision==='pending'||e.decision==='fix'||e.decision==='tokenize'))issues.push('Completed color governance requires zero unclassified or unresolved consumers');
  if(ledger.schemaVersion!==1||ledger.scannerVersion!==SCANNER_VERSION) issues.push('Unsupported ledger/scanner version');
  const current=new Map(scan.entries.map(e=>[e.fingerprint,e])),recorded=new Map(ledger.entries.map(e=>[e.fingerprint,e])),old=new Map(baseline.entries.map(e=>[e.fingerprint,e]));
  const reachability=ledger.entries.some(e=>e.decision==='retained-unused')?uiReachability(root):null;
  if(reachability?.errors.length)issues.push(...reachability.errors);
  if(recorded.size!==ledger.entries.length) issues.push('Duplicate ledger fingerprints');
  for(const e of scan.entries) {
    const item=recorded.get(e.fingerprint);
    if(!item){issues.push(`Unregistered color ${e.file}:${e.locations[0].line} ${e.literal}`);continue;}
    if(item.count!==e.count||item.file!==e.file||item.literal!==e.literal||JSON.stringify(item.context)!==JSON.stringify(e.context)||item.owner!==e.owner||item.property!==e.property) issues.push(`Ledger/source mismatch ${e.fingerprint}`);
    if(!kinds.has(item.kind)||!decisions.has(item.decision)) issues.push(`Invalid classification ${e.fingerprint}`);
    if(item.kind==='token-definition'&&e.kind!=='token-definition') issues.push(`Consumer disguised as definition ${e.fingerprint}`);
    if(item.kind==='non-color'&&e.file.endsWith('.css')&&/^(?:color|background|border|fill|stroke|outline|box-shadow|text-shadow)/.test(e.property)) issues.push(`Color property disguised as non-color ${e.fingerprint}`);
    if(item.decision==='not-debt'&&(!item.reason||!['token-definition','non-color'].includes(item.kind))) issues.push(`Invalid not-debt exemption ${e.fingerprint}`);
    if(item.decision==='accepted-literal'&&!validEvidence(item,root)) issues.push(`Missing/stale evidence ${e.fingerprint}`);
    if(item.decision==='retained-unused') {
      const proof=item.unusedEvidence;
      if(!item.reason||!item.semanticRole||!proof?.futureDisposition||proof.entry!=='client/src/main.tsx'||
        !fs.existsSync(path.join(root,e.file))||proof.fileHash!==sourceHash(fs.readFileSync(path.join(root,e.file)))||
        !reachability||reachability.errors.length||reachability.files.includes(e.file))issues.push(`Invalid/stale unused disposition ${e.fingerprint}`);
    }
    if(item.kind==='non-color'&&item.classificationSourceHash&&item.classificationSourceHash!==sourceHash(fs.readFileSync(path.join(root,e.file))))issues.push(`Stale non-color classification ${e.fingerprint}`);
    const prior=old.get(e.fingerprint);
    if((!prior||e.count>prior.count)&&e.kind!=='token-definition') {
      const rename=ledger.resolutions.find(r=>r.resolution==='rename'&&r.to===e.fingerprint&&old.has(r.fingerprint));
      const approved=ledger.additions.find(a=>a.fingerprint===e.fingerprint&&a.reason&&a.count===e.count);
      if(rename&&(current.has(rename.fingerprint)||current.get(rename.to).count!==old.get(rename.fingerprint).count)) issues.push(`Invalid rename bypass ${e.fingerprint}`);
      if(!rename&&!(approved&&item.decision==='accepted-literal'&&validEvidence(item,root))) issues.push(`Unapproved new/increased color ${e.fingerprint}`);
    }
  }
  for(const e of ledger.entries) if(!current.has(e.fingerprint)) issues.push(`Orphan still in ledger ${e.fingerprint}`);
  for(const prior of baseline.entries) {
    if(current.has(prior.fingerprint)&&current.get(prior.fingerprint).count>=prior.count) continue;
    const r=ledger.resolutions.find(x=>x.fingerprint===prior.fingerprint&&x.reason&&x.count===prior.count&&x.baselineHead);
    if(!r||!['rename','delete','tokenize','retired-unused'].includes(r.resolution)){issues.push(`Unresolved orphan/decrease ${prior.fingerprint}`);continue;}
    if(r.resolution==='rename'&&(!r.to||!current.has(r.to)||current.get(r.to).count!==prior.count)) issues.push(`Invalid rename mapping ${prior.fingerprint}`);
    if(r.resolution==='retired-unused'&&fs.existsSync(path.join(root,prior.file))) issues.push(`Retired file still exists ${prior.file}`);
    if(r.resolution==='tokenize'&&!scan.variables.some(v=>v.file===prior.file&&v.owner===prior.owner&&v.property===prior.property&&JSON.stringify(v.context)===JSON.stringify(prior.context)&&v.name===r.token)) issues.push(`Tokenize resolution has no matching consumer ${prior.fingerprint} ${r.token??''}`);
  }
  if(JSON.stringify(ledger.summary)!==JSON.stringify(summarize(ledger.entries))) issues.push('Summary must be derived from ledger entries');
  return issues;
}
export function resolveOrphan(ledger,fingerprint,{resolution,reason,to,token,baselineHead},scan) {
  const item=ledger.entries.find(e=>e.fingerprint===fingerprint);
  if(!item) throw new Error(`No recorded entry ${fingerprint}`);
  if(scan.entries.some(e=>e.fingerprint===fingerprint)) throw new Error('Source still contains this fingerprint; do not clear live debt');
  if(!['rename','delete','tokenize','retired-unused'].includes(resolution)||!reason) throw new Error('Resolution and reason are required');
  if(resolution==='rename'&&(!to||!scan.entries.some(e=>e.fingerprint===to))) throw new Error('Rename requires an existing destination');
  if(resolution==='tokenize'&&!token?.startsWith('--')) throw new Error('Tokenize requires a CSS token');
  ledger.resolutions.push({fingerprint,file:item.file,literal:item.literal,count:item.count,resolution,reason,baselineHead,...(to?{to}:{}),...(token?{token}:{})});
  ledger.entries=ledger.entries.filter(e=>e.fingerprint!==fingerprint);
  if(to&&!ledger.entries.some(e=>e.fingerprint===to)) ledger.entries.push({...scan.entries.find(e=>e.fingerprint===to),decision:'pending',evidence:[]});
  ledger.entries.sort((a,b)=>`${a.file}|${a.fingerprint}`.localeCompare(`${b.file}|${b.fingerprint}`));
  ledger.summary=summarize(ledger.entries);
  return ledger;
}
