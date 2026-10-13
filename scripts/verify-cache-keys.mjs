// 缓存键配对静态守卫(2026-10-13 全库审计元问题):
//   守卫盲区——渲染闭包有 verify-states,缓存闭包(React Query 键)零防线;
//   本次审计的全部客户端 P0(共享键投毒/失效缺口)都落在此盲区。
// 机制切片: 数据层键配对(静态);触发时机: 提交时刻(经 .githooks/pre-commit)。
// 两类缺陷:
//   A. 撞键——同一键基被不同 api 端点的 queryFn 声明(先入缓存方毒化另一端);
//   B. 悬空失效——invalidateQueries 的键基不前缀匹配任何已声明查询键基
//      (改名/写错即回滚失效静默失败)。
// 已知残余(声明不盖): 同键基不同运行时实参(如 roadmap() vs roadmap(filters))
//   静态不可分辨,需运行期防线——见 verify-states 浮层走查。
// 用法: node scripts/verify-cache-keys.mjs   (exit 1 = 有违例)
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const ARG = '«arg»';

// ── 1. 求值 queryKeys 工厂(用项目 typescript 转译后动态 import——正则剥
//      TS 语法在多行参数类型上必碎,不重蹈) ────────────────────────────────
async function loadQueryKeys() {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const src = readFileSync(join(ROOT, 'client/src/lib/queryKeys.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const tmp = join(ROOT, 'node_modules/.tmp-query-keys.mjs');
  const { writeFileSync, rmSync } = await import('fs');
  writeFileSync(tmp, js);
  try {
    const mod = await import(`${tmp}?t=${Date.now()}`);
    if (!mod.queryKeys) throw new Error('queryKeys 未导出(检查 queryKeys.ts 的 export)');
    return mod.queryKeys;
  } finally {
    rmSync(tmp, { force: true });
  }
}
const queryKeys = await loadQueryKeys();

function resolveFactoryExpr(expr) {
  const m = expr.match(/^queryKeys\.([A-Za-z_$][\w$.]*?)\s*(?:\((.*)\))?\s*;?$/s);
  if (!m) return null;
  let cur = queryKeys;
  for (const seg of m[1].split('.')) {
    if (cur == null) return null;
    cur = cur[seg];
  }
  if (typeof cur === 'function') {
    try { cur = cur(); } catch { return null; } // 实参不可得 → 占位
  }
  if (!Array.isArray(cur)) return null;
  return cur.map((v) => (typeof v === 'string' ? v : ARG));
}

// ── 2. 表达式 → 键基(尾部占位剪除) ─────────────────────────────────────
function parseLiteralArray(text) {
  // 顶层逗号切分(括号/引号感知);字符串保留,其余一律占位
  const parts = [];
  let depth = 0, buf = '', inStr = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { buf += c; if (c === inStr && text[i - 1] !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"') { inStr = c; buf += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) parts.push(buf.trim());
  if (parts.some((p) => p.includes('...'))) return null; // 展开不可静态解
  return parts.map((p) => {
    const sm = p.match(/^(['"])(.*)\1$/);
    return sm ? sm[2] : ARG;
  });
}

function sigOf(expr) {
  const e = expr.trim();
  const arr = e.startsWith('[')
    ? parseLiteralArray(e.replace(/^\[/, '').replace(/\]$/, ''))
    : resolveFactoryExpr(e);
  return arr && arr.length ? arr : null;
}

function trimArgs(arr) {
  const a = [...arr];
  while (a.length && a[a.length - 1] === ARG) a.pop();
  return a;
}

// 引号感知剥注释——守卫吃注释文本会把"api.projects.getPhases 不存在"这类
// 说明注释当真实调用(首轮实证),字符串字面量原样保留
function stripComments(src) {
  let out = '', inStr = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === inStr && src[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; out += c; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out;
}

// ── 3. 扫描源码 ────────────────────────────────────────────────────────
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name.startsWith('.') || name.endsWith('.test.') || name === 'queryKeys.ts') continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const queries = [];   // {file, base, endpoint}
const invalidations = []; // {file, base, expr}
const unresolvable = [];

for (const file of walk(join(ROOT, 'client/src'))) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const rel = relative(ROOT, file);

  // queryKey 声明 + 邻近 queryFn 的 api 端点
  const keyRe = /queryKey:\s*/g;
  let m;
  while ((m = keyRe.exec(src))) {
    // invalidateQueries({ queryKey: X }) 里的 queryKey 不是查询声明——
    // 若不排除,每个失效键都自证为"已声明查询",悬空失效检查永不可能红
    // (变异自证实证: 伪键 ['mutation-bogus-key'] 竟 PASS)
    if (src.slice(Math.max(0, m.index - 60), m.index).includes('invalidate')) continue;
    const expr = readBalanced(src, keyRe.lastIndex);
    if (!expr) continue;
    // 窗口止于下一个键声明/mutation 边界——防止把后随 useMutation 或裸
    // 辅助函数(如 validateUpdates)的 api 调用误记到本查询头上(两轮实证)
    let end = keyRe.lastIndex + 900;
    const bounds = ['useMutation', 'mutationFn', 'onSuccess', 'onError', 'queryKey:']
      .map((tok) => src.indexOf(tok, keyRe.lastIndex))
      .filter((i) => i > 0);
    if (bounds.length) end = Math.min(end, ...bounds);
    const window = src.slice(keyRe.lastIndex, end);
    const qfIdx = window.indexOf('queryFn');
    const tail = qfIdx >= 0 ? window.slice(qfIdx) : '';
    const endpoints = [...new Set([...tail.matchAll(/api\.([a-zA-Z]+)\.([a-zA-Z]+)/g)].map((x) => `api.${x[1]}.${x[2]}`))];
    const norm = sigOf(expr);
    if (!norm) { unresolvable.push(`${rel}: ${expr.slice(0, 50)}`); continue; }
    queries.push({
      file: rel,
      sig: norm,                       // 全签名(含参数位)——撞键按它分组
      base: trimArgs(norm),            // 剪尾参——失效前缀匹配用
      endpoints: endpoints.length ? endpoints : ['(unattributed)']
    });
  }

  // invalidateQueries({ queryKey: X
  const invRe = /invalidateQueries\(\{\s*queryKey:\s*/g;
  while ((m = invRe.exec(src))) {
    const expr = readBalanced(src, invRe.lastIndex);
    if (!expr) continue;
    const norm = sigOf(expr);
    if (!norm) { unresolvable.push(`${rel}: invalidate ${expr.slice(0, 50)}`); continue; }
    invalidations.push({ file: rel, base: trimArgs(norm), expr: expr.slice(0, 60) });
  }
}

function readBalanced(src, from) {
  // 从 from 读一个平衡的表达式(到顶层逗号/右括号收口)
  let depth = 0, out = '', inStr = null;
  for (let i = from; i < src.length && out.length < 300; i++) {
    const c = src[i];
    if (inStr) { out += c; if (c === inStr && src[i - 1] !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"') { inStr = c; out += c; continue; }
    if (c === '\n' && depth === 0) break;
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) {
      if (depth === 0) break;
      depth--;
    }
    if (c === ',' && depth === 0) break;
    out += c;
  }
  return out.trim() || null;
}

// ── 4. 两类检查 ────────────────────────────────────────────────────────
const findings = [];

// A. 撞键: 同全签名不同端点(参数位保留——projectTypes.list() 与
//    list(filters, viewMode) 运行时是不同键,剪尾参会把两者误并为同键)。
//    多态豁免: 单个 queryFn 内部按条件分叉多个端点(viewMode 分流)属合法
//    ——仅当分叉需要两个以上查询才能凑出时不豁免
const bySig = new Map();
for (const q of queries) {
  const k = q.sig.join('|');
  if (!bySig.has(k)) bySig.set(k, []);
  bySig.get(k).push(q);
}
for (const [k, group] of bySig) {
  const union = [...new Set(group.flatMap((q) => q.endpoints).filter((e) => !e.startsWith('(')))];
  if (union.length > 1 && !group.some((q) => union.every((e) => q.endpoints.includes(e)))) {
    findings.push(`撞键 [${k.split('|').join(', ')}]: ${union.join(' vs ')} ← ${[...new Set(group.map((q) => q.file))].join(', ')}`);
  }
}

// B. 悬空失效: 失效键基与任何查询键基互不前缀
const queryBases = [...new Set(queries.map((q) => q.base.join('|')))];
for (const inv of invalidations) {
  const ik = inv.base.join('|');
  const ok = queryBases.some((qb) => qb === ik || qb.startsWith(ik + '|') || ik.startsWith(qb + '|'));
  if (!ok) findings.push(`悬空失效 [${inv.base.join(', ')}] (${inv.expr}) ← ${inv.file} — 不前缀匹配任何已声明查询键`);
}

// ── 5. 报告 ────────────────────────────────────────────────────────────
console.log(`扫描: ${queries.length} 查询声明 / ${invalidations.length} 失效调用 / ${unresolvable.length} 不可静态解(豁免)`);
if (unresolvable.length) {
  console.log('  豁免明细(仅提示):');
  for (const u of unresolvable.slice(0, 8)) console.log(`    - ${u}`);
}
if (findings.length) {
  console.error(`\nFAIL — ${findings.length} 处缓存键违例:`);
  for (const f of findings) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('PASS — 无撞键、无悬空失效');
