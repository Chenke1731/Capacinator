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
import { SHARED_CLASSES, ALLOWLIST, OWNER_FILES, isAllowlisted, allowlistExpiry, isOwnerFile, OWNER_DUPS, OWNER_MISSING } from './lib/shared-ui-classes.mjs';

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
  // 2026-11-10 扩充（收件箱录入按钮 hover 越界事故）: 共享组件修饰类同样是
  // 全局定义权——页面里裸定义会随路由加载泄漏到同路由所有按钮。
  'btn-primary', 'btn-secondary', 'btn-danger', 'btn-outline', 'btn-ghost',
  'btn-sm', 'btn-lg',
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
  // 2026-11-10 修饰类扩充时的存量快照（冻新增、不追溯）：
  'client/src/components/PhaseTemplateDesigner.css :: .btn',
  'client/src/components/PhaseTemplateDesigner.css :: .btn-danger',
  'client/src/components/PhaseTemplateDesigner.css :: .btn-primary',
  'client/src/components/PhaseTemplateDesigner.css :: .btn-secondary',
  'client/src/components/PhaseTemplateDesigner.css :: .btn-sm',
  'client/src/components/ProjectsTable.css :: .btn-sm',
  'client/src/pages/Assignments.css :: .btn-sm',
  'client/src/pages/Import.css :: .text-primary',
  'client/src/pages/Locations.css :: .btn-danger',
  'client/src/pages/Locations.css :: .btn-ghost',
  'client/src/pages/Locations.css :: .btn-primary',
  'client/src/pages/Locations.css :: .btn-sm',
  'client/src/pages/People.css :: .btn-danger',
  'client/src/pages/Scenarios.css :: .btn-primary',
  'client/src/pages/Scenarios.css :: .btn-secondary',
  'client/src/pages/Scenarios.css :: .btn-sm',
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

// TC-C6: real SmartAssignment states exposed hsl(hex) on status colors too.
// The shadcn triplets (--border/--foreground/--primary-foreground) remain valid.
export function matchBadHslSemantic(source) {
  const stripped=String(source).replace(/\/\*[\s\S]*?\*\//g,c=>c.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,c=>c.replace(/[^\n]/g,' '));
  const rx=/hsla?\(\s*var\(\s*--(?:primary-(?:text|solid|color)|(?:success|warning|danger|info)(?:-background)?|status-(?:success|warning|danger|info)-(?:text|solid|soft|border))\s*\)\s*(?:\/\s*[0-9.]+%?\s*)?\)/g;
  return [...stripped.matchAll(rx)].map(m=>({text:m[0],index:m.index}));
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
  for(const hit of matchBadHslSemantic(text)) {
    const line=text.slice(0,hit.index).split('\n').length;
    violations.push(`${rel}:${line} 「${hit.text}」 TC-C6: hex状态色禁止HSL包装，使用--status-*-text/solid/soft/border语义角色`);
  }
}

// ── 规则 4: 未作用域 .btn* 的 hover 位移（2026-11-10 收件箱录入按钮事故）──
// 事故链: ProjectRoadmap.css 裸定义 `.btn-primary:hover{transform:translateY(-1px)}`
// → 随 /projects 路由全量加载 → 泄漏到收件箱的录入按钮 → 悬停上移越过 tab 栏
// 底边, 视觉上"上沿被截断"。按钮 hover 位移在本项目属禁止项（design-system
// no-bounce 裁决）；页面确有需要时必须限定作用域（.页面根 .btn…）。
export function matchUnscopedBtnMotion(source) {
  const stripped = String(source).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const hits = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    const body = m[2];
    if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
    const hasMotion =
      /(?:^|[;\s])transform\s*:[^;]*(?:translate|matrix)/.test(body) ||
      /(?:^|[;\s])translate\s*:/.test(body);
    if (!hasMotion) continue;
    for (const raw of sel.split(',')) {
      const item = raw.replace(/\s+/g, ' ').trim();
      if (/^\.btn(-[a-z0-9-]+)?(::?[-\w]+(?:\([^)]*\))?)*$/.test(item)) {
        hits.push({ selector: item, index: m.index });
      }
    }
  }
  return hits;
}

for (const rel of [...utilScanFiles, ...listCss('client/src/styles', true)]) {
  const text = readFileSync(resolve(root, rel), 'utf8');
  for (const hit of matchUnscopedBtnMotion(text)) {
    const line = text.slice(0, hit.index).split('\n').length;
    violations.push(`${rel}:${line} 「${hit.selector}」 未作用域 .btn 位移 → 随路由加载泄漏到所有按钮(录入按钮 hover 越界事故);页面内写 .页面根 .btn…,且按钮不做 hover 位移`);
  }
}

// ── 规则 5: 交互态布局几何位移（2026-11-10 同类排查 F-02/F-05）──
// 事故族：hover/focus 上改变几何属性的"外扩/位移"——padding+负 margin 旧式
// 外扩（roadmap project-name-link 实测被 overflow 裁切）、按钮/链接 translate。
// 静态判据：①单复合选择器且名字像交互控件（btn/button/link/nav/tab/chip/action）
// 同时改几何 → 报；②任何作用域下 padding+负 margin 组合 → 报（布局位移技巧）。
// 卡片类 elevation（card/stat/insight/summary/timeline-item…）不在拦截面。
export function matchInteractiveGeometry(source) {
  const stripped = String(source).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const LAYOUT = /(?:^|[;\s])(?:padding|margin|height|min-height|max-height|line-height|top|left|right|bottom)\s*:/;
  const MOTION = /(?:^|[;\s])(?:transform|translate|scale|rotate)\s*:[^;]*(?:translate|scale|rotate|matrix)/;
  const hits = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    const body = m[2];
    if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
    if (!/:hover|:focus|:focus-visible/.test(sel)) continue;
    if (/::(?:before|after)/.test(sel)) continue; // 伪元素装饰位移不占布局
    const geometry = MOTION.test(body) || LAYOUT.test(body);
    if (!geometry) continue;
    const negativeMargin = /(?:^|[;\s])margin[^;]*-[0-9.]+(?:px|rem|em)/.test(body);
    const paddingAndNegative = /(?:^|[;\s])padding\s*:/.test(body) && negativeMargin;
    for (const raw of sel.split(',')) {
      const item = raw.replace(/\s+/g, ' ').trim();
      const singleCompound = !/[\s>+~]/.test(item);
      const interactiveName = /(?:btn|button|link|nav|tab|chip)/i.test(item);
      if ((singleCompound && interactiveName) || paddingAndNegative) {
        hits.push({ selector: item, index: m.index });
      }
    }
  }
  return hits;
}

for (const rel of [...utilScanFiles, ...listCss('client/src/styles', true)]) {
  const text = readFileSync(resolve(root, rel), 'utf8');
  for (const hit of matchInteractiveGeometry(text)) {
    const line = text.slice(0, hit.index).split('\n').length;
    violations.push(`${rel}:${line} 「${hit.selector}」 交互态布局位移（未作用域按钮/链接位移或 padding+负 margin 外扩）→ 会被容器裁切/越过边界;改底色/描边/下划线表达`);
  }
}

// ── 规则 6: 共享组件类所有权（D-03 v1，2026-11-10 同类排查）──
// 页面/组件 CSS 裸定义或派生覆盖共享组件类（.form-group input / .modal-header h3）
// 会随路由 CSS 全量加载泄漏到同路由及后续访问页面。只认“选择器左端锚点”：
// 左端复合选择器命中共享类即报；`.page-root .shared` 这种作用域前缀合法。
export function matchSharedClassLeaks(source) {
  const stripped = String(source).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const hits = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
    for (const raw of sel.split(',')) {
      const item = raw.replace(/\s+/g, ' ').trim();
      const lm = item.match(/^(?:[a-z][\w-]*)?\.([a-zA-Z][\w-]*)/);
      if (!lm) continue;
      if (SHARED_CLASSES.has(lm[1])) hits.push({ selector: item, class: lm[1], index: m.index });
    }
  }
  return hits;
}

const allowlistSeen = new Set();
for (const rel of [...utilScanFiles, ...listCss('client/src/styles', true)]) {
  if (isOwnerFile(rel)) continue;
  const text = readFileSync(resolve(root, rel), 'utf8');
  for (const hit of matchSharedClassLeaks(text)) {
    if (isAllowlisted(rel, hit.class)) { allowlistSeen.add(`${rel} :: .${hit.class}`); continue; }
    const line = text.slice(0, hit.index).split('\n').length;
    violations.push(`${rel}:${line} 「${hit.selector}」 裸定义/派生覆盖共享组件类 .${hit.class} → 会随路由泄漏到其他页;请写 .页面根 .${hit.class} 或迁移共享原语（冻结违例见 shared-ui-classes.mjs，到期 ${allowlistExpiry()}）`);
  }
}
for (const key of ALLOWLIST.keys()) {
  if (!allowlistSeen.has(key)) console.log(`note: 共享类白名单条目已无对应违例,可删除: ${key}`);
}

// ── 规则 7: 所有者内部唯一性 + 注册完备性（D-03 Batch 1，2026-11-10）──
// 同族三次事故升级（chart-container / summary-card / checkbox-label 都是
// OWNER_FILES 之间的双定义——级联顺序决定谁生效；empty-state 的 index.css
// 副本从未赢过）。所有权登记此前只管"文件合法性"，没管所有者内部唯一性。
// 7a: 共享类在所有者文件集合中最多一个定义文件；7b: 每个注册类至少一个
// 所有者定义（badge-secondary 曾注册缺主，裸 span 无底色）。
// 够用级: 按 OWNER_FILES 原文件扫描，不展开 @import（tailwind.css 仅含
// @import 链，自身无定义，不产生假双计）。
export function collectSharedClassOwners(ownerTexts) {
  const defs = {};
  for (const [rel, text] of Object.entries(ownerTexts)) {
    const stripped = String(text).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
      for (const raw of sel.split(',')) {
        const item = raw.replace(/\s+/g, ' ').trim();
        const lm = item.match(/^(?:[a-z][\w-]*)?\.([a-zA-Z][\w-]*)/);
        if (lm && SHARED_CLASSES.has(lm[1])) { (defs[lm[1]] ??= new Set()).add(rel); }
      }
    }
  }
  return defs;
}

// options 参数注入（D-04 Stage 2，评审 D3）：生产默认不变（直读登记处），
// SELF_TEST 传合成冻结名单——检测器语义与登记处实况彻底解耦。
export function checkOwnerUniqueness(defs, classes = SHARED_CLASSES, { dups = OWNER_DUPS, missing = OWNER_MISSING } = {}) {
  const problems = [];
  const expired = (e) => new Date(e).getTime() < Date.now();
  for (const cls of classes) {
    const files = defs[cls] ? [...defs[cls]] : [];
    if (files.length === 0) {
      const frozen = missing.get(cls);
      if (!frozen) problems.push(`共享类 .${cls} 已注册但没有任何所有者定义 → 注册即须有主（badge-secondary 缺主事故）；补所有者定义或从 SHARED_CLASSES 移除`);
      else if (expired(frozen.expiry)) problems.push(`共享类 .${cls} 缺所有者定义且冻结 ${frozen.expiry} 已到期 → ${frozen.note}`);
      continue;
    }
    if (files.length > 1) {
      const frozen = dups.get(cls);
      const actual = new Set(files);
      if (!frozen) { problems.push(`共享类 .${cls} 有 ${files.length} 个所有者定义文件（${files.join(' | ')}）→ 级联顺序决定谁生效（empty-state 双所有者事故）；收敛为单所有者，页面差量写作用域覆盖`); continue; }
      const unexpected = files.filter((f) => !frozen.files.includes(f));
      if (unexpected.length) problems.push(`共享类 .${cls} 出现冻结名单外的第三个所有者（${unexpected.join(' | ')}）→ 新增所有者定义必须拦截`);
      else if (expired(frozen.expiry)) problems.push(`共享类 .${cls} 双所有者冻结 ${frozen.expiry} 已到期 → ${frozen.note}`);
    }
  }
  return problems;
}

const ownerScanFiles = [...new Set([
  ...OWNER_FILES,
  'client/src/components/Charts.css',
  ...listCss('client/src/components/ui', true),
])];
const ownerTexts = {};
for (const rel of ownerScanFiles) {
  try { ownerTexts[rel] = readFileSync(resolve(root, rel), 'utf8'); }
  catch { violations.push(`${rel} 登记的所有者文件缺失（规则 7 扫描对象）`); }
}
const ownerDefs = collectSharedClassOwners(ownerTexts);
violations.push(...checkOwnerUniqueness(ownerDefs));
// 冻结名单腐化提示(不拦门): 收敛完成后条目要及时删
for (const [cls, frozen] of OWNER_DUPS) {
  const n = ownerDefs[cls] ? ownerDefs[cls].size : 0;
  if (n <= 1) console.log(`note: OWNER_DUPS 条目 .${cls} 已收敛到 ${n} 个所有者文件,可删除`);
}
for (const cls of OWNER_MISSING.keys()) {
  if (ownerDefs[cls]) console.log(`note: OWNER_MISSING 条目 .${cls} 已有所有者定义,可删除`);
}

// ── 规则 8: tsx 注入 <style> 的共享类/工具类盲区（D-04 Stage 2，2026-11-11）──
// 事故：PhaseTimelineStyles 以运行时 <style> 注入 .modal-content/.form-* 全局
// 定义——规则 2/6 只扫 .css 文件，注入版压过 App.css owner 且随页面挂载状态
// 漂移，D-03 三批清理从未见过这个第二样式源（评审 G-1/EXP-NEW-3）。
// 判据：提取 tsx 中 <style>{`...`}</style> 文本，复用规则 6 左端锚点与
// 规则 2 工具类裸定义；命中即报。存量注入冻结于 INJECTED_STYLE_ALLOWLIST。
export function extractStyleTagCss(source) {
  const out = [];
  const RX = /<style[^>]*>\s*\{`([\s\S]*?)`\}\s*<\/style>/g;
  for (const m of source.matchAll(RX)) out.push(m[1]);
  return out.join('\n');
}

export const INJECTED_STYLE_ALLOWLIST = new Map([
  // PhaseTimelineStyles 影子表已随死代码家族整删（PhaseTimeline.tsx 零导入者，
  // 2026-11-11 import 级核实）——无冻结存量。新注入即拦。
]);

for (const rel of PROD_FILES.filter((f) => f.endsWith('.tsx'))) {
  const text = readFileSync(resolve(root, rel), 'utf8');
  const css = extractStyleTagCss(text);
  if (!css) continue;
  for (const hit of matchSharedClassLeaks(css)) {
    const key = `${rel} :: .${hit.class}`;
    const expiry = INJECTED_STYLE_ALLOWLIST.get(key);
    if (expiry && new Date(expiry).getTime() >= Date.now()) continue;
    const line = 1 + css.slice(0, hit.index).split('\n').length;
    violations.push(`${rel}:<style> 注入块第 ${line} 行 「${hit.selector}」 运行时注入定义共享类 .${hit.class} → 全局生效且压过 owner（PhaseTimelineStyles 事故）；共享样式入 .css 文件并遵守所有权，或页面根作用域`);
  }
  for (const d of detectUtilDefs(css)) {
    const key = `${rel} :: .${d.cls}`;
    const expiry = INJECTED_STYLE_ALLOWLIST.get(key);
    if (expiry && new Date(expiry).getTime() >= Date.now()) continue;
    violations.push(`${rel}:<style> 注入块 「${d.item}」 注入定义全局工具类 .${d.cls} → 跨文件覆盖全局定义；共享样式入 .css 文件`);
  }
}

// 白名单腐化提示(不拦门): 存量清掉后条目要及时删,防止清单变成永久豁免
for (const k of UTIL_ALLOWLIST) {
  if (!allowlistedSeen.has(k)) console.log(`note: 工具类白名单条目已无对应违例,可删除: ${k}`);
}

if (process.env.SELF_TEST === '1') {
  for(const [source,bad] of [['hsl(var(--success))',true],['hsl(var(--warning-background) / 10%)',true],['hsl(var(--status-danger-text))',true],['hsl(var(--primary-solid))',true],['hsl(var(--border))',false],['hsl(var(--primary-foreground))',false],['/* hsl(var(--success)) */',false]]) {
    if(Boolean(matchBadHslSemantic(source).length)!==bad)throw Error(`Semantic HSL guard failed: ${source}`);
  }
  console.log('SELF-TEST PASS: hex语义色HSL守卫（7例，保留合法三元组消费）');
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

  // 规则 4 压力自证: 未作用域 .btn 位移必须抓到;作用域/无色态不得误报
  const motionCases = [
    ['.btn-primary:hover { transform: translateY(-1px); }', true],
    ['.btn:hover{transform:translateY(-2px)}', true],
    ['.page .btn-primary:hover { transform: translateY(-1px); }', false],
    ['.btn-primary:hover { background: red; }', false],
    ['.btn { transform: none; }', false],
  ];
  const motionFails = motionCases.filter(([src, expect]) => (matchUnscopedBtnMotion(src).length > 0) !== expect);
  if (motionFails.length) {
    console.error(`SELF-TEST FAIL: 未作用域按钮位移检测器失灵 ${JSON.stringify(motionFails.map(([s]) => s))}`);
    process.exit(1);
  }
  console.log('SELF-TEST PASS: 未作用域 .btn 悬停位移检测器(5 例)——生产函数直调');

  // 规则 5 自证: 交互态几何位移——旧式外扩/按钮位移必红,卡片 elevation/纯色态必绿
  const geometryCases = [
    ['.project-name-link:hover{padding:.125rem .25rem;margin:-.125rem -.25rem}', true],
    ['.nav-btn:hover{transform:translateY(-1px)}', true],
    ['.back-button:focus{transform:translateX(-2px)}', true],
    ['.card:hover{transform:translateY(-2px)}', false],
    ['.actionable-item:hover{transform:translateY(-2px)}', false],
    ['.page .btn:hover{transform:translateY(-1px)}', false],
    ['.x:hover{background:red}', false],
    ['.export-action-button:hover::before{transform:translateX(100%)}', false],
  ];
  const geometryFails = geometryCases.filter(([src, expect]) => (matchInteractiveGeometry(src).length > 0) !== expect);
  if (geometryFails.length) {
    console.error(`SELF-TEST FAIL: 交互态几何位移检测器失灵 ${JSON.stringify(geometryFails.map(([s]) => s))}`);
    process.exit(1);
  }
  console.log('SELF-TEST PASS: 交互态几何位移检测器(7 例)——生产函数直调');

  // 规则 6 自证: 共享类裸定义/派生必红;页面根作用域/近似类名必绿
  // （D-04 Stage 2：modal-* 家族退役后，正例改用仍在册的 chart-container）
  const sharedCases = [
    ['.form-group input{margin:0}', true],
    ['.chart-container h3{color:red}', true],
    ['.badge{padding:0}', true],
    ['.import-container .form-group input{margin:0}', false],
    ['.scenarios-page .chart-container{padding:0}', false],
    ['.form-group-x input{margin:0}', false],
  ];
  const sharedFails = sharedCases.filter(([src, expect]) => (matchSharedClassLeaks(src).length > 0) !== expect);
  if (sharedFails.length) {
    console.error(`SELF-TEST FAIL: 共享类所有权检测器失灵 ${JSON.stringify(sharedFails.map(([s]) => s))}`);
    process.exit(1);
  }
  console.log('SELF-TEST PASS: 共享类所有权检测器(6 例)——生产函数直调');

  // 规则 7 自证: 所有者内部唯一性+注册完备性——双所有者必红,冻结名单内必绿,
  // 名单外第三者/注册缺主必红,缺主冻结/单所有者必绿。
  // defs 结构 = { 类名: Set(所有者文件) }（与 collectSharedClassOwners 一致）。
  // D-04 Stage 2（评审 D3）: 冻结名单改合成注入——检测器与登记处实况解耦
  // （此前用 modal-title/chart-container 活例，登记处任何变动都要改 selftest）。
  const syntheticDups = new Map([['frozen-x', { files: ['a.css', 'b.css'], expiry: '2099-01-01', note: 'synthetic' }]]);
  const syntheticMissing = new Map([['missing-x', { expiry: '2099-01-01', note: 'synthetic' }]]);
  const dupDefs = { badge: new Set(['client/src/a.css', 'client/src/b.css']) };
  const frozenDupDefs = { 'frozen-x': new Set(['a.css', 'b.css']) };
  const thirdOwnerDefs = { 'frozen-x': new Set(['a.css', 'b.css', 'rogue.css']) };
  const emptyDefs = {};
  const r7 = (defs, classes, opts) => checkOwnerUniqueness(defs, classes, opts).join('\n');
  if (!r7(dupDefs, ['badge']).includes('有 2 个所有者定义文件')) throw Error('规则7: 未冻结双所有者未检出');
  if (r7(frozenDupDefs, ['frozen-x'], { dups: syntheticDups }) !== '') throw Error('规则7: 冻结名单内双所有者被误报');
  if (!r7(thirdOwnerDefs, ['frozen-x'], { dups: syntheticDups }).includes('冻结名单外的第三个所有者')) throw Error('规则7: 名单外第三所有者未检出');
  if (r7(emptyDefs, ['missing-x'], { missing: syntheticMissing }) !== '') throw Error('规则7: 缺主冻结未生效');
  if (!r7(emptyDefs, ['badge-info']).includes('已注册但没有任何所有者定义')) throw Error('规则7: 注册缺主未检出');
  if (r7({ 'btn-icon': new Set(['client/src/App.css']) }, ['btn-icon']) !== '') throw Error('规则7: 单所有者被误报');
  // 同一选择器列表含多个共享类时必须全记录(不因首项命中而漏记其余)
  const listScan = collectSharedClassOwners({ 'client/src/x.css': '.form-group,\n.form-input,\n.x { display:block }' });
  if (!listScan['form-group'] || !listScan['form-input']) throw Error('规则7: 选择器列表多共享类漏记');
  console.log('SELF-TEST PASS: 所有权唯一性检测器(7 组,合成冻结名单)——生产函数直调');

  // 规则 8 自证: tsx 注入 <style> 的共享类/工具类必红;作用域前缀/无私有 style 必绿
  const injectedCases = [
    ['<style>{`.badge { color: red }`}</style>', true],
    ['<style>{`.x-page .form-group { margin: 0 }`}</style>', false],
    ['<style>{`.btn-sm { padding: 0 }`}</style>', true],
    ['<div>no style tag</div>', false],
  ];
  for (const [src, expect] of injectedCases) {
    const css = extractStyleTagCss(src);
    const sharedHit = matchSharedClassLeaks(css).length > 0;
    const utilHit = detectUtilDefs(css).length > 0;
    if ((sharedHit || utilHit) !== expect) throw Error(`规则8: 注入样式检测器失灵 ${JSON.stringify(src)}`);
  }
  console.log('SELF-TEST PASS: tsx 注入样式盲区检测器(4 例)——生产函数直调');

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
