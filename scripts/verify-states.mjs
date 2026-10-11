// 全称状态检查器(2026-10-11 机制改造 · 渲染相位)
//
// 哲学: 组合式系统的真值在级联合闭包(声明×全局级联×状态×主题),本检查器
// 只读浏览器算完的闭包(computed style after forced state),不读任何声明。
// 全称枚举: 无元素清单——自动发现页面上全部可见交互元素,未来元素零成本入管。
//
// 维度(每维独立成断言,selftest 按维度全称):
//   对比度(文字承载体≥4.5/纯边界≥3, alpha 对真实背板合成, WCAG)
//   命中≥24px | 零遮挡(相位限定: 静态相位+各自浮层内部, 命中点在自身子树=通过)
//   零视口越界 | 字号∈令牌集{14,13,12.5,11,10}(从令牌定义推导) | 贴锚(发现式配对,gap 4-8)
// 已知残差(v1 声明出界): :focus-visible(需键盘 Tab 序列) / :active(按下会触发 click) /
//   状态组合(hover+focus 同持) / 仅 /projects 路由(生长从 router 定义推导)
// 禁用态按 WCAG 1.4.3 豁免对比度(规则豁免,非清单)。
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3120';
const API = 'http://127.0.0.1:3110';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const PAGE = process.argv.includes('--page') ? process.argv[process.argv.indexOf('--page') + 1] : '/projects';
const SELFTEST = process.argv.includes('--selftest');
const DEBUG = process.argv.includes('--debug');
const QUICK = process.argv.includes('--quick'); // 迭代用: 单主题/跳滚动位/族上限 25(交付必全量)
const TOKEN_CACHE = '/tmp/verify-boards-token.json';
const FONT_TOKENS = [14, 13, 12.5, 11, 10]; // --b-fs-* + 气泡标题档,从令牌定义推导
const ELEMENT_CAP = 700; // fail-loud 上限: 截断必须响,静默通过=假绿(静态审计是单次 evaluate,数百元素成本低)
const DANGER = /删除|确认|保存|创建|新建|提交|登出|delete|confirm|save|create|submit|signout|trash/i;
const SETTLE = 450; // ≥ transition 0.25s,防插值中间帧(1.42 vs 1.10 事故)

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ── 鉴权: 每次运行全新登录(不复用缓存——缓存 TTL 12min > token 寿命,
// 曾致运行中途 401 → 全局会话过期 AlertDialog 盖屏吃掉后续点击,静默污染量测) ──
const login = await (await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personId: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1' })
})).json();
const auth = { ts: Date.now(), ...(login.data ?? login) };
if (!auth.accessToken) { console.error('login failed'); process.exit(1); }
writeFileSync(TOKEN_CACHE, JSON.stringify(auth));

// 会话过期守卫: 过期对话框出现即响亮中止,绝不带病量测
async function assertNoSessionDialog(page, theme) {
  const expired = await page.evaluate(() =>
    !!document.querySelector('[role="alertdialog"], [data-state="open"].fixed.inset-0') && document.body.dataset.scrollLocked
  );
  if (expired) {
    check(`[${theme}] 会话过期对话框检测`, false, '运行中 token 失效,量测已污染——重跑');
    return true;
  }
  return false;
}

// ── 对比度: alpha 对真实背板合成(上溯祖先链,删除钮红字淡红底=回归用例) ──
const CONTRAST_FN = `
  const luminance = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // 解析归一(2026-10-11 批次二裁决): color-mix 的 computed 输出是 color(srgb r g b)
  // 的 0-1 浮点——曾按 0-255 解析, 琥珀墨对深底 9.6:1 被算成 1.42 整族伪报
  const parse = (s) => {
    if (!s) return null;
    if (/color\\(srgb/i.test(s)) {
      const m = s.match(/[\\d.]+/g);
      if (!m) return null;
      const rgb = m.slice(0, 3).map((v) => Math.round(Number(v) * 255));
      if (m[3] !== undefined && /^color\\(srgb[^/]*\\//.test(s)) rgb.push(Number(m[3])); // / alpha 形式
      return rgb;
    }
    const m = s.match(/[\\d.]+/g);
    return m ? m.map(Number) : null;
  };
  const composite = (bg, over) => {
    // over rgba 叠在 bg rgb 上
    const a = over[3] ?? 1;
    return [0, 1, 2].map((i) => Math.round(over[i] * a + bg[i] * (1 - a)));
  };
  window.__bgInfo = (el) => {
    // 背板走全链到首个不透明层——无层数上限、无白默认(2026-10-11 幻影白事故:
    // 板内行元素真背板在第 8-10 层 unified-tab-container, 8 层上限+白默认曾把
    // 为深底设计的浅灰前景算成 1.0-1.4:1 "违例"; 浅色下白默认碰巧无害, P0
    // 主题修复让深色真渲染后才爆发)。source/level 供 selftest 幻影白维度断言;
    // 全链无背板 → bg:null(unknown——计数上报,不猜白不判违)。
    let chain = [];
    let node = el;
    let source = 'unknown', level = -1;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && (c[3] ?? 1) > 0) {
        chain.push(c);
        if ((c[3] ?? 1) >= 0.999) { source = (node.className?.toString().split(' ')[0] || node.tagName); level = chain.length - 1; break; }
      }
      node = node.parentElement;
    }
    if (level === -1) return { bg: null, source, level };
    // 基座 [255,255,255] 仅是合成数学的中间量——链必终止于不透明层,基座不参与结果
    let bg = [255, 255, 255];
    for (let i = chain.length - 1; i >= 0; i--) bg = composite(bg.slice(0, 3), chain[i]);
    return { bg, source, level };
  };
  window.__effBg = (el) => window.__bgInfo(el).bg ?? [255, 255, 255]; // 兼容旧探针;审计路径先查 bg===null 记 unknown
  // 内容物背板(2026-10-11 悬案1 裁决): 文字/图标画在元素盒内,若 ::before 带
  // 不透明背景(复选框蓝盒),它才是内容的真实背板——链里不含伪元素曾把勾选态
  // 白钩对元素自身 hover 灰底算出 1.1 伪违例(真值=白对蓝盒 3.68)。
  // 边框路径不走此函数(边框画在伪元素盒缘,背板是祖先)——分野是刻意的。
  window.__contentBg = (el) => {
    const base = window.__bgInfo(el).bg;
    if (!base) return null;
    const pb = parse(getComputedStyle(el, '::before').backgroundColor);
    if (pb && (pb[3] ?? 1) > 0.5) return composite(base, pb);
    return base;
  };
  window.__contrast = (el) => {
    const bg = window.__contentBg(el);
    if (!bg) return -1; // 背板未知:调用方须显式跳过(-1 不小于阈值即判过是撒谎,判违也是)
    const fgRaw = parse(getComputedStyle(el).color);
    const fg = fgRaw && (fgRaw[3] ?? 1) < 0.999 ? composite(bg, fgRaw) : (fgRaw ? fgRaw.slice(0, 3) : [0, 0, 0]);
    const L1 = luminance(...fg), L2 = luminance(...bg);
    return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
  };
  window.__borderContrast = (el) => {
    const bg = window.__bgInfo(el).bg;
    if (!bg) return -1;
    const cs = getComputedStyle(el);
    // 视觉边框可能在宿主或 ::before(复选框视觉盒由伪元素绘制)——无框时回落伪元素
    let bc = parseFloat(cs.borderWidth) > 0 ? parse(cs.borderColor) : null;
    if (!bc) {
      const pb = getComputedStyle(el, '::before');
      bc = parseFloat(pb.borderWidth) > 0 ? parse(pb.borderColor) : null;
    }
    if (!bc) return 0;
    const border = (bc[3] ?? 1) < 0.999 ? composite(bg, bc) : bc.slice(0, 3);
    const L1 = luminance(...border), L2 = luminance(...bg);
    return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
  };
  window.__bgContrast = (el) => { // 填充色对(不含自身的)背板——识别组件的可视块
    const bg = window.__bgInfo(el.parentElement || el).bg;
    if (!bg) return -1;
    const own = parse(getComputedStyle(el).backgroundColor);
    const fill = own && (own[3] ?? 1) < 0.999 ? composite(bg, own) : (own ? own.slice(0, 3) : bg);
    const L1 = luminance(...fill), L2 = luminance(...bg);
    return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
  };
`;

const browser = await chromium.launch({ executablePath: CHROME });

// ── 单元素×单状态断言(浏览器侧批处理,减少往返) ──
const AUDIT_FN = (scopeSelector) => `
  (() => {
    const issues = [];
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      // 视口相交过滤: 滚出视口的虚拟行/被粘性表头合法压住的内容不测(否则假 越界/遮挡)
      if (r.top > innerHeight - 2 || r.bottom < 2 || r.left > innerWidth - 2 || r.right < 2) return false;
      // 滚动窗感知(2026-10-11 滚动位伪报裁决): 虚拟化 overscan 行被滚动容器
      // 边缘合法裁掉(几何上 t<0 或超出容器底, 但视口相交过滤拦不住它们)——
      // 量它们=量看不见的内容,滚动位相位曾整族误报"硬裁切 0px"。
      // 走查遇 fixed 祖先即停: fixed 子树逃逸更上层的滚动裁剪(越界注入维
      // 的元素身处被注入为 fixed 的容器内)
      let sn = e.parentElement;
      while (sn && sn !== document.body) {
        const scs = getComputedStyle(sn);
        if (scs.position === 'fixed') break;
        if (/auto|scroll/.test(scs.overflow + scs.overflowY + scs.overflowX)) {
          const sb = sn.getBoundingClientRect();
          if (r.bottom < sb.top + 2 || r.top > sb.bottom - 2 || r.right < sb.left + 2 || r.left > sb.right - 2) return false;
        }
        sn = sn.parentElement;
      }
      const c = getComputedStyle(e);
      return c.visibility !== 'hidden' && c.display !== 'none' && c.pointerEvents !== 'none';
    };
    const label = (e) => {
      const id = e.getAttribute('data-testid') || '';
      const txt = (e.textContent || '').trim().slice(0, 8);
      const t = e.getAttribute('title') || e.getAttribute('aria-label') || '';
      return (id || t || txt || e.tagName).slice(0, 24);
    };
    const scoped = ${scopeSelector ? JSON.stringify(scopeSelector) : 'null'}; // 唯一插值点
    const SEL = 'button, [role="button"], input:not([type=hidden]), select, a, .clickable';
    // 先枚举浮层根再在根内查询——字符串拼接前缀对逗号选择器列表不成立(曾让侧边栏 a 全数混入)
    const seen = new Set();
    const roots = scoped
      ? [...document.querySelectorAll(scoped)].flatMap((root) => [...root.querySelectorAll(SEL)]).filter((e) => (seen.has(e) ? false : seen.add(e)))
      : [...document.querySelectorAll(SEL)];
    let tested = 0, unknownBg = 0, clipped = 0, chromeCovered = 0;
    // 裁切交集(2026-10-11 遮挡三分裁决 + 滚动位伪报修正): 中心点不在可见交集内
    // =裁切/滚出; 违例只认**硬裁器**(hidden/clip)造成的可见<24——软裁器(滚动
    // 容器 auto/scroll)裁空的是滚动折叠/overscan,计数不判违(曾整族误报)
    const clippedAt = (e, cx, cy) => {
      const hards = [], softs = [];
      let firstClipper = null;
      let n = e.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        const ov = \`\${cs.overflow} \${cs.overflowX} \${cs.overflowY}\`;
        if (/hidden|clip|auto|scroll/.test(ov)) {
          const b = n.getBoundingClientRect();
          const soft = /auto|scroll/.test(ov) && !/hidden|clip/.test(ov);
          (soft ? softs : hards).push(b);
          if (!firstClipper) firstClipper = n.className?.toString().split(' ')[0] || n.tagName;
        }
        n = n.parentElement;
      }
      const inter = (list) => list.reduce((acc, b) => ({
        l: Math.max(acc.l, b.left), r: Math.min(acc.r, b.right), t: Math.max(acc.t, b.top), b: Math.min(acc.b, b.bottom)
      }), { l: -1e9, r: 1e9, t: -1e9, b: 1e9 });
      const r0 = e.getBoundingClientRect();
      const clampW = (iv) => Math.max(0, Math.min(iv.r, r0.right) - Math.max(iv.l, r0.left));
      const clampH = (iv) => Math.max(0, Math.min(iv.b, r0.bottom) - Math.max(iv.t, r0.top));
      const hardIv = inter(hards);
      const allIv = inter([...hards, ...softs]);
      return {
        centerOut: cx < allIv.l || cx > allIv.r || cy < allIv.t || cy > allIv.b,
        hardVisibleMin: Math.min(clampW(hardIv), clampH(hardIv)),
        clipper: firstClipper
      };
    };
    for (const e of roots) {
      if (!visible(e)) continue;
      if (e.disabled || e.getAttribute('aria-disabled') === 'true') continue; // WCAG 豁免非活动组件
      if (!scoped && !e.closest('.projects-board')) continue; // v1 范围: 板内(导航/页头按钮不在管辖)
      tested++;
      const r = e.getBoundingClientRect();
      const name = label(e);
      const text = (e.textContent || '').trim();
      const isInput = e.tagName === 'INPUT' || e.tagName === 'SELECT';
      const hasText = text.length > 0 || isInput;
      // 对比度(文字承载≥4.5 / 无文字控件的**边界**≥3——borderColor 对背板合成,不是 color)
      if (hasText) {
        const bi = window.__bgInfo(e);
        if (!bi.bg) { unknownBg++; } // 背板未知:不判过不判违,计数上报(白默认曾制造幻影违例)
        else {
          const ratio = window.__contrast(e);
          if (ratio < 4.5) issues.push({ name, kind: '对比度', detail: \`\${ratio} < 4.5 (fg/bg 合成后,背板@\${bi.source})\` });
        }
      } else {
        // WCAG 1.4.11: 组件用"填充/边界/识别性图形"任一识别即可——逐项测量,
        // 全部可用指标 <3 才违例(曾按首个指标判, 无框图标钮的"填充 1.05"压过了
        // 完好达标的图形通道)
        const pr = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.map(Number) : null; };
        const bgRaw = pr(getComputedStyle(e).backgroundColor);
        const csSelf = getComputedStyle(e);
        const pb = getComputedStyle(e, '::before');
        const hasFill = bgRaw && (bgRaw[3] ?? 1) > 0.5;
        const hasBorder = parseFloat(csSelf.borderWidth) > 0 || parseFloat(pb.borderWidth) > 0;
        const hasGlyph = e.querySelector('svg, img') !== null || parseFloat(csSelf.webkitTextStrokeWidth || 0) > 0;
        const tries = [];
        if (hasFill) tries.push(\`填充\${window.__bgContrast(e)}\`);
        if (hasBorder) tries.push(\`边框\${window.__borderContrast(e)}\`);
        if (hasGlyph) tries.push(\`图形\${window.__contrast(e)}\`);
        if (tries.length && tries.every((s2) => s2.includes('-1'))) unknownBg++;
        else if (tries.length) {
          const nums = tries.map((s2) => parseFloat(s2.replace(/[^\d.-]/g, '')));
          if (nums.every((v) => v < 3)) issues.push({ name, kind: '边界对比', detail: \`\${tries.join('/')} < 3\` });
        }
      }
      // 命中 ≥24px(子元素命中的复合控件看叶子,这里量自身)
      if (Math.min(r.width, r.height) < 24) issues.push({ name, kind: '命中', detail: \`\${Math.round(Math.min(r.width, r.height))}px < 24\` });
      // 字号 ∈ 令牌集(文字承载体)
      if (hasText) {
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (![${FONT_TOKENS.join(',')}].includes(fs)) issues.push({ name, kind: '字号', detail: \`\${fs}px ∉ 令牌集\` });
      }
      // 视口越界: 仅 fixed 族元件(自身或祖先 fixed)的部分探出(>8px)是缺陷——文档流滚出是合法瞬态
      let fn2 = e, fixedFam = false;
      for (let k = 0; k < 6 && fn2; k++, fn2 = fn2.parentElement) { if (getComputedStyle(fn2).position === 'fixed') { fixedFam = true; break; } }
      if (fixedFam) {
        const out = Math.round(Math.max(
          Math.max(r.bottom - innerHeight, 0), Math.max(-r.top, 0), Math.max(-r.left, 0), Math.max(r.right - innerWidth, 0)
        ));
        if (out > 8) issues.push({ name, kind: '越界', detail: \`fixed 探出 \${out}px\` });
      }
      // 遮挡三分(2026-10-11 裁决): ①命中回返祖先/中心被裁切=裁切类(硬裁切可见
      // <24 判违,可滚动折叠计数);②sticky 页框压住滚过内容=合法让位(结构判定,
      // 弃类名清单——.unified-tab-list 曾因清单失配成伪报);③其余他者=真遮挡。
      // 注意 fixed 不在合法之列(批量条/浮层是 fixed——它们盖住别人就是缺陷)。
      const cx = r.left + r.width / 2, cy = Math.max(2, Math.min(innerHeight - 2, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== e && !e.contains(hit)) {
        const clip = clippedAt(e, cx, cy);
        const stickyFam = (() => { let n2 = hit; while (n2 && n2 !== document.body) { if (getComputedStyle(n2).position === 'sticky') return true; n2 = n2.parentElement; } return false; })();
        if (hit.contains(e) || clip.centerOut) {
          if (clip.hardVisibleMin < 24) issues.push({ name, kind: '裁切', detail: \`硬裁切可见 \${Math.round(clip.hardVisibleMin)}px < 24 (\${clip.clipper})\` });
          else clipped++;
        } else if (stickyFam) {
          chromeCovered++;
        } else {
          issues.push({ name, kind: '遮挡', detail: \`被 \${hit.className?.toString().split(' ')[0] || hit.tagName} 盖\` });
        }
      }
    }
    return { issues, tested, unknownBg, clipped, chromeCovered };
  })()
`;

async function auditPhase(page, theme, phase, scopeSelector) {
  const { issues, tested, unknownBg = 0, clipped = 0, chromeCovered = 0 } = await page.evaluate(AUDIT_FN(scopeSelector));
  // fail-loud 上限 + 信息性计数(裁切折叠/页框让位/背板未知——都不判违,但要可见)
  const info = `${clipped ? `, 裁切折叠 ${clipped}` : ''}${chromeCovered ? `, 页框让位 ${chromeCovered}` : ''}${unknownBg ? `, 背板未知 ${unknownBg}` : ''}`;
  check(`[${theme}] ${phase} 元素枚举 ≤${ELEMENT_CAP} (实测 ${tested}${info})`, tested <= ELEMENT_CAP,
    tested > ELEMENT_CAP ? '枚举截断风险——静默通过即假绿,必须人工分片' : '');
  const byEl = new Map();
  for (const i of issues) {
    const key = `${i.name}|${i.kind}`;
    if (!byEl.has(key)) byEl.set(key, i.detail);
  }
  check(`[${theme}] ${phase} 全称断言零违例`, issues.length === 0,
    [...byEl.entries()].slice(0, 6).map(([k, d]) => `${k.split('|')[0]}·${k.split('|')[1]}:${d}`).join(' | '));
  return issues.length;
}

// ── 悬停/focus 态强制(逐元素,真实指针; settle ≥ transition) ──
async function hoverSweep(page, theme) {
  const els = await page.evaluate(() => {
    const fams = new Map();
    let total = 0;
    document.querySelectorAll('.projects-board button, .projects-board [role="button"], .projects-board input, .projects-board select')
      .forEach((e) => {
        if (e.disabled) return;
        const r = e.getBoundingClientRect();
        if (!(r.width && r.height && r.top >= 0 && r.bottom <= innerHeight)) return;
        total++;
        // 族代表去重(2026-10-11 截断决策): 悬停态由 类名×data-state 决定,墨色键
        // 兼容 inline 变体(标签 chip 逐 tag color-mix)——同键悬停一个代表,
        // 成本 ~1/8 而状态覆盖不缩水;曾 90 上限截断 165-172 个元素
        const key = `${String(e.className)}|${e.getAttribute('data-state') ?? ''}|${getComputedStyle(e).color}`;
        if (!fams.has(key)) fams.set(key, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      });
    return { list: [...fams.values()].slice(0, 300), families: fams.size, total };
  });
  check(`[${theme}] 悬停扫族覆盖 ≤300 (${els.total} 元素/${els.families} 族)`, els.families <= 300,
    els.families > 300 ? `族数截断 ${els.families - 300}——静默截断即假绿` : '');
  const bad = [];
  for (const el of els.list) {
    await page.mouse.move(el.x, el.y);
    await page.waitForTimeout(SETTLE);
    const r = await page.evaluate(([x, y]) => {
      const target = document.elementFromPoint(x, y);
      if (!target || target.closest('button,[role="button"],input,select') === null) return null;
      const e = target.closest('button,[role="button"],input,select');
      const text = (e.textContent || '').trim();
      const isInput = e.tagName === 'INPUT' || e.tagName === 'SELECT';
      // 图标钮走 color(1.4.11 图形对象)——曾只查边框读到 0, 每个裸图标钮都是伪报
      const hasGlyph = !!e.querySelector('svg, img');
      const ratio = text || isInput ? window.__contrast(e) : (hasGlyph ? window.__contrast(e) : window.__borderContrast(e));
      return { ratio, need: text || isInput ? 4.5 : 3, label: (e.getAttribute('data-testid') || text || e.tagName).slice(0, 20) };
    }, [el.x, el.y]);
    if (r && r.ratio >= 0 && r.ratio < r.need) bad.push(`${r.label}:${r.ratio}<${r.need}`);
  }
  check(`[${theme}] 悬停态对比度全称零违例`, bad.length === 0, bad.slice(0, 6).join(' | '));
  return bad.length;
}

// 发现循环的环境卫生: 上一个触发器可能(a)导航去了详情页(b)留下未关闭的就地
// 输入框/气泡——都会静默吃掉后续点击。每个触发器前恢复上下文,失败响亮可查。
async function restoreContext(page) {
  const path = new URL(page.url()).pathname;
  if (path !== PAGE) { // 精确匹配——'/projects/:id' 详情页包含 '/projects' 曾令守卫失效
    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await page.evaluate(CONTRAST_FN);
  }
  const hasBar = await page.evaluate(() => !!document.querySelector('[data-testid="req-bulk-bar"]'));
  if (!hasBar) {
    await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.projects-board [role="checkbox"], .projects-board input[type=checkbox]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.bottom <= innerHeight; });
      boxes.slice(0, 2).forEach((e) => e.click());
    });
    await page.waitForTimeout(SETTLE);
  }
  // 清扫: 双 Esc(气泡+输入框 Esc 语义)+ 驱逐残留就地输入(blur 即提交收起)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const lingering = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.inline-edit-input')];
    inputs.forEach((i) => i.blur && i.blur());
    return inputs.length;
  });
  if (lingering > 0) {
    await page.waitForTimeout(200);
    const still = await page.evaluate(() => document.querySelectorAll('.inline-edit-input').length);
    if (still > 0) check('发现循环: 就地输入框无法驱逐', false, `${still} 个残留会吞掉后续点击`);
  }
  await page.waitForTimeout(120);
}

// ── 浮层发现式配对: 点开→测内部元素→贴锚断言→Esc 收 ──
async function discovery(page, theme) {
  // 触发器=按"类名族"采代表(无清单、结构完备): DOM 序截断会饿死靠后的元素
  // (批量条按钮曾因此从不被发现——应用钮 1.10 校准例漏跑);每族至少点一个代表。
  const triggerList = (await page.evaluate(() => {
    const fams = new Map();
    document.querySelectorAll('.projects-board button, .projects-board [role="button"]')
      .forEach((e) => {
        if (e.disabled) return;
        const t = `${e.textContent || ''} ${e.getAttribute('title') || ''} ${e.getAttribute('aria-label') || ''} ${e.getAttribute('data-testid') || ''}`;
        if (/删除|确认|保存|创建|新建|提交|登出|delete|confirm|save|create|submit|signout|trash/i.test(t)) return; // 破坏/提交类只测态不点开
        if (e.closest('a')) return;
        if (e.classList.contains('lifecycle-advance-btn') || e.closest('.lifecycle-cell')) return; // 生命周期推进钮点击即改数据
        const r = e.getBoundingClientRect();
        if (!(r.width && r.top >= 0 && r.bottom <= innerHeight)) return;
        const fam = `${String(e.className).split(' ').sort().join('.')}::${(e.textContent || e.getAttribute('title') || '').trim().slice(0, 6)}`;
        if (!fams.has(fam)) fams.set(fam, { fam, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), inBar: !!e.closest('.req-bulk-bar') });
      });
    const list = [...fams.values()];
    list.sort((a, b) => (b.inBar ? 1 : 0) - (a.inBar ? 1 : 0)); // 条内族(上下文门控,价值最高)排前,防截断
    return list; // 截断在 Node 侧做(QUICK 常量不进浏览器字符串——插值曾炸语法)
  })).slice(0, QUICK ? 25 : 70);
  let anchorFails = 0, layerIssues = 0;
  const anchorFailFams = [];
  for (const t of triggerList) {
    await restoreContext(page);
    // 新鲜度=点击前后差分(签名集),且新元素必须身处浮层容器——侧边栏/页头常驻按钮不得混入
    const beforeSet = (await page.evaluate(() =>
      [...document.querySelectorAll('button,[role="button"]')].map((e) => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${e.getAttribute('data-testid') || ''}`;
      })
    ));
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(SETTLE);
    const info = await page.evaluate((pre) => {
      const preSet = new Set(pre);
      const sig = (e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${e.getAttribute('data-testid') || ''}`; };
      const fresh = [...document.querySelectorAll('button, [role="button"]')].filter((e) => {
        if (preSet.has(sig(e))) return false;
        if (!e.closest('.lc-popover, [role="dialog"], .modal-overlay')) return false; // 必须身处浮层
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= -2 && r.bottom <= innerHeight + 2;
      });
      const pop = [...document.querySelectorAll('.lc-popover')].find((e) => fresh.some((f) => e.contains(f))) || null;
      return { fresh: fresh.length, popRect: pop ? ((r) => ({ t: r.top, b: r.bottom }))(pop.getBoundingClientRect()) : null, freshEls: fresh.slice(0, 12).map((e) => (e.getAttribute('data-testid') || e.textContent.trim().slice(0, 8))) };
    }, beforeSet);
    if (DEBUG) {
      const why = info.fresh > 0 ? '' : await page.evaluate(([x, y]) => {
        const at = document.elementFromPoint(x, y);
        return `at=${at ? `${at.tagName}.${String(at.className).split(' ')[0]}` : 'null'} pops=${document.querySelectorAll('.lc-popover').length} pe=${getComputedStyle(document.body).pointerEvents}`;
      }, [t.x, t.y]);
      console.log(`  [discovery] fam=${t.fam} fresh=${info.fresh} pop=${!!info.popRect}${info.freshEls.length ? ' [' + info.freshEls.slice(0, 3).join(',') + ']' : ''}${why ? ' | ' + why : ''}`);
    }
    if (info.popRect && info.fresh > 0) {
      const tr = await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y)?.closest('button,[role="button"]');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { t: r.top, b: r.bottom };
      }, [t.x, t.y]);
      if (tr) {
        const gapBelow = Math.round(info.popRect.t - tr.b);
        const gapAbove = Math.round(tr.t - info.popRect.b);
        if (!((gapBelow >= 3 && gapBelow <= 9) || (gapAbove >= 3 && gapAbove <= 9))) { anchorFails++; anchorFailFams.push(`${t.fam.split('::')[1] ?? t.fam}(b:${gapBelow}/a:${gapAbove})`); }
      }
      layerIssues += await auditPhase(page, theme, `浮层内部(${info.freshEls[0] ?? ''})`, '.lc-popover');
      // 浮层内悬停扫(应用钮 1.10 校准例在这里被捕获——静态扫时它不在 DOM)
      for (const fe of await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.lc-popover button, .lc-popover [role="button"], .lc-popover input')
          .forEach((e) => {
            if (e.disabled) return;
            const r = e.getBoundingClientRect();
            if (r.width && r.top >= 0 && r.bottom <= innerHeight) out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, label: (e.getAttribute('data-testid') || e.textContent.trim().slice(0, 10) || e.className.split(' ')[0]) });
          });
        return out;
      })) {
        await page.mouse.move(fe.x, fe.y);
        await page.waitForTimeout(SETTLE);
        const r = await page.evaluate(([x, y]) => {
          const e = document.elementFromPoint(x, y)?.closest('button,[role="button"],input');
          if (!e) return null;
          const text = (e.textContent || '').trim();
          const ratio = window.__contrast(e);
          return { ratio, need: text || e.tagName === 'INPUT' ? 4.5 : 3, label: (e.getAttribute('data-testid') || text.slice(0, 12) || e.tagName) };
        }, [fe.x, fe.y]);
        if (r && r.ratio < r.need) { layerIssues++; check(`[${theme}] 浮层内悬停对比度 ${r.label}`, false, `${r.ratio} < ${r.need}`); }
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    if (DEBUG && !(info.popRect && info.fresh > 0)) console.log(`  [discovery] (${t.x},${t.y}) fresh=${info.fresh} pop=${!!info.popRect}`);
    // 模态可能不吃 Esc: 先试关闭钮,再不行响亮中止(绝不盲测)
    const stuck = await page.evaluate(() => !!document.querySelector('[role="dialog"]:not([hidden]), .modal-overlay'));
    if (stuck) {
      const closed = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('[role="dialog"] button, .modal-container button, .modal-overlay button')]
          .find((b) => /关闭|取消|close|cancel|×/i.test(`${b.textContent || ''} ${b.getAttribute('title') || ''} ${b.getAttribute('aria-label') || ''}`));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (closed) await page.waitForTimeout(300);
      const still = await page.evaluate(() => !!document.querySelector('[role="dialog"]:not([hidden]), .modal-overlay'));
      if (still) {
        check(`[${theme}] 发现循环: 浮层/模态无法关闭——中止防盲测`, false, '需人工补关闭机制后重跑');
        break;
      }
    }
  }
  check(`[${theme}] 发现式贴锚配对零断链`, anchorFails === 0, anchorFailFams.slice(0, 4).join(' | ') || `${anchorFails} 处 gap∉[3,9]`);
  return anchorFails + layerIssues;
}

// ── selftest: 按维度注入坏规则,每维必须红(防恒绿——检查器的守卫) ──
if (SELFTEST) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await p.addInitScript(({ a }) => {
    localStorage.setItem('capacinator_current_user', JSON.stringify(a.user ?? { id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('auth_token', a.accessToken);
    localStorage.setItem('capacinator-language', 'zh-CN'); localStorage.setItem('theme', 'light');
    localStorage.removeItem('req-col-widths-v5');
  }, { a: auth });
  await p.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  await p.evaluate(CONTRAST_FN);
  const mutations = [
    ['静态对比度', '.board-ghost-btn { color: #ffffff !important; background: #f3f4f6 !important; }'],
    ['字号', '.board-ghost-btn { font-size: 16px !important; }'],
    ['命中', '.board-ghost-btn { min-height: 0 !important; height: 10px !important; }'],
    ['越界', '.board-search { position: fixed !important; left: -120px !important; top: 40px !important; }'],
  ];
  for (const [dim, css] of mutations) {
    await p.addStyleTag({ content: css });
    await p.waitForTimeout(150);
    const { issues } = await p.evaluate(AUDIT_FN(null));
    const kinds = new Set(issues.map((i) => i.kind));
    const hitMap = { '静态对比度': '对比度', '字号': '字号', '命中': '命中', '越界': '越界' };
    check(`selftest[${dim}] 注入必红`, kinds.has(hitMap[dim]), issues.slice(0, 2).map((i) => `${i.kind}:${i.name}`).join(',') || '未报出=恒绿风险');
    await p.evaluate((c) => { const last = [...document.querySelectorAll('head style')].pop(); if (last?.textContent === c) last.remove(); }, css);
    await p.waitForTimeout(100);
  }
  // 悬停维度: 注入 hover 坏规则后跑悬停扫
  await p.addStyleTag({ content: '.board-ghost-btn:hover { background: #f3f4f6 !important; color: #ffffff !important; }' });
  await p.evaluate(() => { window.__hoverInjected = true; });
  const hoverBad = await hoverSweepForSelftest(p);
  check('selftest[悬停] 注入必红', hoverBad > 0, hoverBad ? '' : '悬停维度未报出');

  // 幻影白维度(2026-10-11 裁决事故): 深色下行元素背板必须解析为深色元素——
  // 曾因 8 层上限+白默认, 为深底设计的浅灰前景全被算成 1.0-1.4:1 伪违例
  {
    const d = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await d.addInitScript(({ a, th }) => {
      localStorage.setItem('capacinator_current_user', JSON.stringify(a.user ?? { id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
      localStorage.setItem('auth_token', a.accessToken); localStorage.setItem('refresh_token', a.refreshToken);
      localStorage.setItem('capacinator-language', 'zh-CN'); localStorage.setItem('theme', th);
      localStorage.removeItem('req-col-widths-v5');
    }, { a: auth, th: 'dark' });
    await d.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
    await d.waitForTimeout(2200);
    const gotTheme = await d.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await d.evaluate(CONTRAST_FN);
    const probe = await d.evaluate(() => {
      const el = document.querySelector('.req-tag--add') || document.querySelector('.req-sr-toggle') || document.querySelector('.projects-version-part');
      if (!el) return { err: 'no probe element' };
      const info = window.__bgInfo(el);
      return { source: info.source, level: info.level, bg: info.bg, ratio: window.__contrast(el) };
    });
    const bgIsDark = Array.isArray(probe.bg) && Math.max(...probe.bg) < 100;
    check('selftest[幻影白] 深色背板解析为深色元素', gotTheme === 'dark' && !probe.err && bgIsDark && probe.source !== 'unknown' && probe.ratio > 4.5,
      probe.err ?? `data-theme=${gotTheme} 背板=${probe.source}@L${probe.level} bg=${JSON.stringify(probe.bg)} 该元素对比度=${probe.ratio}(白默认回潮则骤降到 1.x)`);
    await d.close();
  }

  // 伪元素背板维度(2026-10-11 悬案1): 勾选态复选框的白钩画在 ::before 蓝盒上
  // ——背板链不含伪元素背景时曾读出 1.1 伪违例(真值=白对蓝盒 3.68)
  {
    await p.evaluate(() => {
      const cb = [...document.querySelectorAll('.projects-board [role="checkbox"]')]
        .find((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.bottom <= innerHeight; });
      cb?.click();
    });
    await p.waitForTimeout(300);
    const box = await p.evaluate(() => {
      const cb = [...document.querySelectorAll('.req-checkbox[data-state="checked"]')][0];
      if (!cb) return null;
      const r = cb.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    let ratio = null;
    if (box) {
      await p.mouse.move(box.x, box.y);
      await p.waitForTimeout(450);
      ratio = await p.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y)?.closest('.req-checkbox');
        return e ? window.__contrast(e) : null;
      }, [box.x, box.y]);
    }
    check('selftest[伪元素背板] 勾选态钩子按蓝盒测', ratio !== null && ratio >= 3,
      `ratio=${ratio}(链缺伪元素背景时读 1.1;真值白/蓝盒 3.68)`);
  }
  await p.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nselftest ${results.filter((r) => r.ok).length}/${results.length} 维度有牙齿`);
  await browser.close();
  process.exit(failed ? 1 : 0);
}

async function hoverSweepForSelftest(page) {
  const bad = [];
  const els = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.projects-board button').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width && r.top >= 0 && r.bottom <= innerHeight) out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    return out.slice(0, 40);
  });
  for (const el of els) {
    await page.mouse.move(el.x, el.y);
    await page.waitForTimeout(SETTLE);
    const r = await page.evaluate(([x, y]) => {
      const target = document.elementFromPoint(x, y)?.closest('button');
      if (!target) return null;
      return { ratio: window.__contrast(target), label: (target.textContent || '').trim().slice(0, 12) };
    }, [el.x, el.y]);
    if (r && r.ratio < 3) bad.push(`${r.label}:${r.ratio}`);
  }
  return bad.length;
}

// ── 主流程: 双主题 × (静态+滚动位+悬停+发现) ──
let totalFail = 0;
for (const theme of (QUICK ? ['light'] : ['light', 'dark'])) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await p.addInitScript(({ a, th }) => {
    localStorage.setItem('capacinator_current_user', JSON.stringify(a.user ?? { id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('auth_token', a.accessToken);
    localStorage.setItem('refresh_token', a.refreshToken);
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', th);
    localStorage.removeItem('req-col-widths-v5');
  }, { a: auth, th: theme }); // 键名与解构对齐(P0: 曾传 { theme } 解构 { th } → undefined
  //                          → localStorage.theme="undefined" → 回落 light,深色从未渲染)
  await p.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.evaluate(CONTRAST_FN);
  // 前置断言(状态强制必须自证生效): 主题没渲染成就响亮作废本主题全部结果——
  // 否则"[dark]"是浅色复测而不自知,双主题覆盖静默归零
  const actualTheme = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (actualTheme !== theme) {
    check(`[${theme}] 主题前置断言`, false, `data-theme=${actualTheme} ≠ ${theme},本主题结果作废`);
    await p.close();
    continue;
  }
  if (await assertNoSessionDialog(p, theme)) { await p.close(); continue; }

  totalFail += await auditPhase(p, theme, '静态(首屏)', null);

  // 滚动位(虚拟化窗口补覆盖): 表格容器滚到中/底
  for (const [i, frac] of (QUICK ? [] : [0.5, 1.0]).entries()) {
    await p.evaluate((f) => {
      const t = document.querySelector('.requirements-table');
      if (t) t.scrollTop = (t.scrollHeight - t.clientHeight) * f;
    }, frac);
    await p.waitForTimeout(400);
    totalFail += await auditPhase(p, theme, `滚动位${i + 1}`, null);
    await p.evaluate(() => { const t = document.querySelector('.requirements-table'); if (t) t.scrollTop = 0; });
    await p.waitForTimeout(300);
  }

  totalFail += await hoverSweep(p, theme);
  // 上下文前置(全称原则的推广): 页面上出现的复选框=状态开关,勾选前两个
  // 启用被交互前置 gating 的元素(批量条及其气泡——应用钮 1.10 校准例在此入管)
  if (await assertNoSessionDialog(p, theme)) { await p.close(); continue; }
  const toggled = await p.evaluate(() => {
    const boxes = [...document.querySelectorAll('.projects-board [role="checkbox"], .projects-board input[type=checkbox]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.top >= 0 && r.bottom <= innerHeight; });
    boxes.slice(0, 2).forEach((e) => e.click());
    return boxes.length;
  }).catch(() => 0);
  if (toggled > 0) {
    await p.waitForTimeout(SETTLE);
    totalFail += await auditPhase(p, theme, '选择态静态(批量条)', null);
    totalFail += await hoverSweep(p, theme);
  }
  totalFail += await discovery(p, theme);
  await p.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed${totalFail ? ` (违例 ${totalFail})` : ''}`);
process.exit(failed ? 1 : 0);
