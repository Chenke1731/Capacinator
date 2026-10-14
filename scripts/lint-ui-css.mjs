#!/usr/bin/env node
// UI 生成契约静态防线(契约维度 1/4): 已知反模式在写代码当下就报,不等守卫。
// 规则 1: 按钮类选择器的规则块内出现定宽 width: Npx 而没有同块 padding
// → border-box 下全局 button padding(0.6em 1.2em) 会吃光内容盒, svg 塌成 0 宽。
// (2026-09-22 人力气泡加减号物理消失事故的静态化)
//
// 规则 2(2026-09-22 .text-muted 跨文件同名类事故的静态化): 页面/组件 CSS 禁止
// "裸定义"全局工具类(.text-muted/.text-primary/.../.btn)。定义权只属于全局样式表
// (App.css/index.css);页面里只允许作用域覆盖(.xxx-page .text-muted),不允许
// 选择器列表中"独立成项"的裸定义(含 :hover/:disabled 等伪类态,同样跨文件覆盖)。
//
// 自证: SELF_TEST=1 注入已知反模式,断言能抓到(压力自证,同 verify-boards 碰撞检测器)。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'client/src/App.css',
  'client/src/index.css',
  ...process.argv.slice(2)
];

const violations = [];
for (const rel of files) {
  let text;
  try {
    text = readFileSync(resolve(root, rel), 'utf8');
  } catch {
    continue;
  }
  // 逐规则块解析(够用级: 不处理嵌套 @block 内层选择器差异,@media 内规则按原选择器算)
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(text))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const body = m[2];
    if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
    const isBtnish = /-btn\b|button\b/.test(sel);
    if (!isBtnish) continue;
    const hasFixedWidth = /(^|[^-])width:\s*\d+(\.\d+)?px/.test(body);
    const hasPadding = /padding(-top|-right|-bottom|-left|-inline|-block)?:/.test(body);
    const hasMinWidthOnly = /min-width:/.test(body) && !hasFixedWidth;
    if (hasFixedWidth && !hasPadding && !hasMinWidthOnly) {
      const line = text.slice(0, m.index).split('\n').length;
      violations.push(`${rel}:${line} 「${sel.split('\n').pop().trim()}」 定宽按钮未同块重置 padding → 内容盒会被全局 padding 吃光(图标塌 0 宽)`);
    }
  }
}

// ── 规则 2: 页面/组件 CSS 禁止"裸定义"全局工具类 ──────────────────
const GLOBAL_UTIL_CLASSES = [
  'text-muted', 'text-primary', 'text-secondary', 'text-success',
  'text-warning', 'text-danger', 'text-info', 'btn',
];
// 增量拦截: 存量违例登记在册只拦新增,清单格式 "文件 :: 类名"(同文件同类多规则合并一条)。
// 2026-09-22 扫描快照: .text-muted 已从 Locations.css/Import.css 清出(那次只清了它),
// 其余为历史遗留裸定义,待各页改写为作用域覆盖后逐条删除。
const UTIL_ALLOWLIST = [
  'client/src/pages/Assignments.css :: .text-secondary',
  'client/src/pages/AuditLog.css :: .btn',
  'client/src/pages/Import.css :: .btn',
  'client/src/pages/Import.css :: .text-primary',
  'client/src/pages/Locations.css :: .btn',
  'client/src/pages/People.css :: .text-success',
  'client/src/pages/People.css :: .text-warning',
  'client/src/pages/People.css :: .text-danger',
  'client/src/pages/People.css :: .text-info',
  'client/src/pages/ProjectRoadmap.css :: .btn',
  'client/src/components/InteractiveTimeline.css :: .btn',
  'client/src/components/PhaseTemplateDesigner.css :: .btn',
  'client/src/components/ProjectPhaseManager.css :: .btn',
];

function listCss(relDir, recursive) {
  const abs = resolve(root, relDir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { recursive })
    .filter((p) => p.endsWith('.css'))
    .map((p) => `${relDir}/${String(p).replaceAll('\\', '/')}`.replaceAll('//', '/'))
    .sort();
}

// "裸定义" = 选择器列表中独立成项: 整项就是该类名(可带伪类后缀),无作用域祖先。
// .xxx-page .text-muted(后代覆盖)/.btn-primary(类名不精确匹配)都不算。
function bareGlobalUtilClass(item) {
  const m = item.match(/^\.([a-zA-Z-]+)((?:::?[-\w]+(?:\([^)]*\))?)*)$/);
  return m && GLOBAL_UTIL_CLASSES.includes(m[1]) ? m[1] : null;
}

function detectUtilDefs(text) {
  const out = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(text))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
    const line = text.slice(0, m.index).split('\n').length;
    for (const rawItem of sel.split(',')) {
      const item = rawItem.replace(/\s+/g, ' ').trim();
      const cls = bareGlobalUtilClass(item);
      if (cls) out.push({ line, item, cls });
    }
  }
  return out;
}

const utilScanFiles = [
  ...listCss('client/src/pages', false),
  ...listCss('client/src/components', true),
];
const allowlistedSeen = new Set();
for (const rel of utilScanFiles) {
  const text = readFileSync(resolve(root, rel), 'utf8');
  for (const d of detectUtilDefs(text)) {
    const key = `${rel} :: .${d.cls}`;
    if (UTIL_ALLOWLIST.includes(key)) { allowlistedSeen.add(key); continue; }
    violations.push(`${rel}:${d.line} 「${d.item}」 裸定义全局工具类 .${d.cls} → 跨文件同名类会覆盖全局定义(.text-muted 曾把全站弱化文字压到 9.35px);页面内覆盖请写 .xxx-page .${d.cls}`);
  }
}
// ── 主色令牌误配(2026-09-23 迭代页隐形按钮事故) ──
// --primary-text 语义 = "浅色背景上的主色文字";实心 --primary 底上用它,
// 浅色主题两令牌同值(#4f46e5) → 底字同色完全隐形。实心主色底一律白字。
// 2026-10 任务B收口③: 淡染豁免只判**背景声明本身**——此前判整个规则块,
// 实心底+淡色阴影的组合会被误放行(评审注入复现)。
for (const rel of [...utilScanFiles, 'client/src/App.css', 'client/src/index.css']) {
  const text = readFileSync(resolve(root, rel), 'utf8');
  for (const m of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const body = m[2];
    const hasPrimaryBg = /background[^;]*var\(--primary\)/.test(body);
    if (hasPrimaryBg && !isTintBackground(body) && /[^-]color:[^;]*var\(--primary-text\)/.test(body)) {
      const line = text.slice(0, m.index).split('\n').length;
      const sel = m[1].trim().split('\n').pop().trim();
      violations.push(`${rel}:${line} 「${sel}」 实心主色底配 --primary-text 文字 → 浅色主题同值隐形(迭代页按钮事故);实心主色底用白字`);
    }
  }
}

// ── hsl(var(--primary)) 家族禁令(2026-10 任务B: 双令牌统一) ──
// body 层 --primary 是 index.css hex(事实标准);hsl(hex)=IACVT 无效色回退继承,
// 曾全库 59 处主色静默变灰。精确匹配完整令牌(--primary 后紧跟 ) 或 /),
// 不误拦 --primary-foreground(根层三元组存活,hsl() 包装是合法路径);
// 2026-10 任务B收口②: 递归扫描全部生产源码(评审注入证明硬编码清单漏检
// 新增 TSX),正则容忍空白变体(hsl( var(--primary) ))与百分比透明(/ 10%)。
// 检测逻辑提取为导出函数——SELF_TEST 直接调生产函数,避免"测试通过、生产已变"。
export function matchBadHslPrimary(source) {
  // 注释清理用等长空格替换(保留换行)——字符索引与原文对齐,主循环按原文
  // 算行号才不偏移(评审: 三行注释后违规曾报成第 3 行,实际第 4 行)。
  const stripped = String(source)
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));
  const RX = /hsl\(\s*var\(\s*--primary\s*\)\s*(?:\/\s*(?:[0-9.]+%?\s*)?)?\)/g;
  const hits = [];
  let m;
  while ((m = RX.exec(stripped)) !== null) hits.push({ text: m[0], index: m.index });
  return hits;
}
/** 淡染豁免只判背景声明(收口③): 返回该规则块是否为"淡染背景" */
export function isTintBackground(ruleBody) {
  const bgDecl = (String(ruleBody).match(/background[^;]*var\(--primary\)[^;]*/) || [''])[0];
  if (!bgDecl) return false;
  const tintM = bgDecl.match(/color-mix\([^)]*var\(--primary\)\s*(\d+)%/);
  return !!(tintM && parseInt(tintM[1], 10) <= 50);
}

const PROD_FILES = execSync(
  `find client/src -type f \\( -name '*.css' -o -name '*.tsx' -o -name '*.ts' \\) -not -path '*__tests__*' -not -path '*.test.*'`,
  { cwd: root, encoding: 'utf8' }
).trim().split('\n').filter(Boolean);
for (const rel of PROD_FILES) {
  const text = readFileSync(resolve(root, rel), 'utf8');
  for (const hit of matchBadHslPrimary(text)) {
    const line = text.slice(0, hit.index).split('\n').length;
    violations.push(`${rel}:${line} 「${hit.text}」 body 层 --primary 是 hex——hsl(hex)=无效色回退继承(任务B 统一);文字用 var(--primary-text),背景/描边用 var(--primary),透明度用 color-mix`);
  }
}

// 白名单腐化提示(不拦门): 存量清掉后条目要及时删,防止清单变成永久豁免
for (const k of UTIL_ALLOWLIST) {
  if (!allowlistedSeen.has(k)) console.log(`note: 工具类白名单条目已无对应违例,可删除: ${k}`);
}

if (process.env.SELF_TEST === '1') {
  // 压力自证: 复现事故原样的反模式,必须被抓到
  const buggy = `
.staff-stepper-btn { display:inline-flex; width: 26px; height: 24px; border:none; }
`;
  process.argv.push('/dev/stdin');
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let mm;
  const hits = [];
  while ((mm = ruleRe.exec(buggy))) {
    const sel = mm[1].trim();
    const body = mm[2];
    if (!/-btn\b/.test(sel)) continue;
    if (/(^|[^-])width:\s*\d+px/.test(body) && !/padding/.test(body)) hits.push(sel);
  }
  if (hits.length === 0) {
    console.error('SELF-TEST FAIL: 注入的已知反模式未被检出,检测器失灵');
    process.exit(1);
  }
  console.log(`SELF-TEST PASS: 检出注入反模式 ${hits.join(', ')}`);

  // 规则 3 压力自证: 主色令牌误配——实心主色底配 --primary-text 必须抓到,纯文字用不误报
  const mixOk = '.link { color: var(--primary-text); }';
  const mixBad = '.btn-x { background: var(--primary); color: var(--primary-text); }';
  const test = (t) => /background[^;]*var\(--primary\)/.test(t) && /[^-]color:[^;]*var\(--primary-text\)/.test(t);
  if (!test(mixBad) || test(mixOk)) {
    console.error('SELF-TEST FAIL: 主色令牌误配检测器失灵');
    process.exit(1);
  }
  console.log('SELF-TEST PASS: 主色令牌误配检测器(检出+不误报)');

  // 规则 2 压力自证: 伪造页面 CSS——裸定义必须抓到,后代覆盖/类名前缀不精确不得误报
  const pageLike = [
    '.text-muted { font-size: 9.35px; }',        // 事故原样的裸定义: 必须抓到
    '.loc-page .text-muted { color: inherit; }', // 作用域后代覆盖: 合法
    '.text-muted-x { color: red; }',             // 类名不精确匹配(.btn≠.btn-primary 同理): 不算
    '.btn, .btn:hover { padding: 0; }',          // 列表项独立成项(含伪类态): 必须抓到
  ].join('\n');
  const got = detectUtilDefs(pageLike).map((d) => d.cls);
  const miss = ['text-muted', 'btn'].filter((c) => !got.includes(c));
  const extra = got.filter((c) => !['text-muted', 'btn'].includes(c));
  if (miss.length || extra.length) {
    console.error(`SELF-TEST FAIL: 工具类检测器失灵 miss=[${miss}] 误报=[${extra}]`);
    process.exit(1);
  }
  // 白名单自证: 同样违例登记在册时不得产生新违例(增量拦截语义)
  const fakeKey = (cls) => `fake/pages.css :: .${cls}`;
  const stillNew = detectUtilDefs(pageLike).filter((d) => ![fakeKey('text-muted'), fakeKey('btn')].includes(fakeKey(d.cls)));
  if (stillNew.length) {
    console.error(`SELF-TEST FAIL: 白名单未生效,存量违例仍被误报 ${stillNew.length} 条`);
    process.exit(1);
  }
  console.log('SELF-TEST PASS: 页面 CSS 工具类裸定义检测器(检出+不误报+白名单增量拦截)');

  // 任务B收口②③: 主色 hsl 家族检测器——评审注入案例入仓,直接调生产函数
  const hslCases = [
    ['hsl(var(--primary))', true],
    ['hsl( var(--primary) )', true],
    ['hsl(var(--primary) / 0.1)', true],
    ['hsl(var(--primary) / 10%)', true],
    ['hsl(var(--primary)/0.9)', true],
    ['/* hsl(var(--primary)) */ .ok {}', false],
    ['hsl(var(--primary-foreground))', false],
    ['hsl(var(--border))', false],
  ];
  const hslFails = hslCases.filter(([src, expect]) => (matchBadHslPrimary(src).length > 0) !== expect);
  if (hslFails.length) {
    console.error(`SELF-TEST FAIL: 主色 hsl 检测器失灵 ${JSON.stringify(hslFails)}`);
    process.exit(1);
  }
  // 行号断言(评审第3轮: 多行注释后违规不得偏移)——等长空格替换保索引对齐
  const lineSrc = '/* line1\nline2\nline3 */\n.bad { color: hsl(var(--primary)); }';
  const lineHit = matchBadHslPrimary(lineSrc)[0];
  const lineNo = lineSrc.slice(0, lineHit.index).split('\n').length;
  if (lineNo !== 4) {
    console.error(`SELF-TEST FAIL: 多行注释后行号偏移(报 ${lineNo},期望 4)`);
    process.exit(1);
  }
  const tintCases = [
    ['background: var(--primary); box-shadow: 0 0 4px color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary-text);', false, '实心底+淡阴影不得豁免'],
    ['background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary-text);', true, '真淡染底应豁免'],
    ['color: var(--primary-text);', false, '无背景声明不豁免'],
  ];
  const tintFails = tintCases.filter(([body, expect]) => isTintBackground(body) !== expect);
  if (tintFails.length) {
    console.error(`SELF-TEST FAIL: 淡染豁免检测器失灵 ${JSON.stringify(tintFails.map(([, , d]) => d))}`);
    process.exit(1);
  }
  console.log('SELF-TEST PASS: 主色 hsl 检测器(8 例)+淡染豁免(3 例)——生产函数直调');
  process.exit(violations.length ? 1 : 0);
}

if (violations.length) {
  console.error(`lint:ui FAIL — ${violations.length} 处反模式:`);
  for (const v of violations) console.error('  ' + v);
  console.error('\n修复: 规则块内显式写 padding(图标按钮通常 padding: 0),或改 min-width 让内容撑开。');
  console.error('契约: docs/UI_GENERATION_CONTRACT.md 维度 1/4');
  process.exit(1);
}
console.log('lint:ui PASS — 无已知 CSS 反模式');
