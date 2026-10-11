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
  const parse = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.map(Number) : null; };
  const composite = (bg, over) => {
    // over rgba 叠在 bg rgb 上
    const a = over[3] ?? 1;
    return [0, 1, 2].map((i) => Math.round(over[i] * a + bg[i] * (1 - a)));
  };
  window.__effBg = (el) => {
    let chain = [];
    let node = el;
    for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && (c[3] ?? 1) > 0) {
        chain.push(c);
        if ((c[3] ?? 1) >= 0.999) break;
      }
    }
    let bg = [255, 255, 255, 1];
    for (let i = chain.length - 1; i >= 0; i--) bg = composite(bg.slice(0, 3), chain[i]);
    return bg.slice(0, 3);
  };
  window.__contrast = (el) => {
    const bg = window.__effBg(el);
    const fgRaw = parse(getComputedStyle(el).color);
    const fg = fgRaw && (fgRaw[3] ?? 1) < 0.999 ? composite(bg, fgRaw) : (fgRaw ? fgRaw.slice(0, 3) : [0, 0, 0]);
    const L1 = luminance(...fg), L2 = luminance(...bg);
    return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
  };
  window.__borderContrast = (el) => {
    const bg = window.__effBg(el);
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
    const own = parse(getComputedStyle(el).backgroundColor);
    const bg = window.__effBg(el.parentElement || el);
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
    let tested = 0;
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
        const ratio = window.__contrast(e);
        if (ratio < 4.5) issues.push({ name, kind: '对比度', detail: \`\${ratio} < 4.5 (fg/bg 合成后)\` });
      } else {
        // WCAG 1.4.11: 组件可用"填充/边界/识别性图形"任一识别——填充→边框→图标色(currentColor)逐级回落
        const pr = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.map(Number) : null; };
        const bgRaw = pr(getComputedStyle(e).backgroundColor);
        const csSelf = getComputedStyle(e);
        const pb = getComputedStyle(e, '::before');
        const hasFill = bgRaw && (bgRaw[3] ?? 1) > 0.5;
        const hasBorder = parseFloat(csSelf.borderWidth) > 0 || parseFloat(pb.borderWidth) > 0;
        const hasGlyph = e.querySelector('svg, img') !== null || parseFloat(csSelf.webkitTextStrokeWidth || 0) > 0;
        let ratio = 0, via = '?';
        if (hasFill) { ratio = window.__bgContrast(e); via = '填充'; }
        else if (hasBorder) { ratio = window.__borderContrast(e); via = '边框'; }
        else if (hasGlyph) { ratio = window.__contrast(e); via = '图形'; }
        if (ratio < 3) issues.push({ name, kind: '边界对比', detail: \`\${via} \${ratio} < 3\` });
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
      // 遮挡: 中心命中点须落自身交互子树; 常驻 chrome(表头/标签条/工具栏/侧栏)压住滚过内容是合法的
      const cx = r.left + r.width / 2, cy = Math.max(2, Math.min(innerHeight - 2, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      const legalChrome = hit?.closest('header, .app-header, .unified-tab, .projects-toolbar, .sidebar, .board-count');
      if (hit && hit !== e && !e.contains(hit) && !legalChrome) issues.push({ name, kind: '遮挡', detail: \`被 \${hit.className?.toString().split(' ')[0] || hit.tagName} 盖\` });
    }
    return { issues, tested };
  })()
`;

async function auditPhase(page, theme, phase, scopeSelector) {
  const { issues, tested } = await page.evaluate(AUDIT_FN(scopeSelector));
  // fail-loud 上限
  check(`[${theme}] ${phase} 元素枚举 ≤${ELEMENT_CAP} (实测 ${tested})`, tested <= ELEMENT_CAP,
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
    const out = [];
    document.querySelectorAll('.projects-board button, .projects-board [role="button"], .projects-board input, .projects-board select')
      .forEach((e) => {
        if (e.disabled) return;
        const r = e.getBoundingClientRect();
        if (r.width && r.height && r.top >= 0 && r.bottom <= innerHeight) {
          out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, label: (e.getAttribute('data-testid') || e.textContent || '').trim().slice(0, 20) });
        }
      });
    return out.slice(0, 90); // 逐元素真实指针的成本上限
  });
  const bad = [];
  for (const el of els) {
    await page.mouse.move(el.x, el.y);
    await page.waitForTimeout(SETTLE);
    const r = await page.evaluate(([x, y]) => {
      const target = document.elementFromPoint(x, y);
      if (!target || target.closest('button,[role="button"],input,select') === null) return null;
      const e = target.closest('button,[role="button"],input,select');
      const text = (e.textContent || '').trim();
      const isInput = e.tagName === 'INPUT' || e.tagName === 'SELECT';
      const ratio = text || isInput ? window.__contrast(e) : window.__borderContrast(e);
      return { ratio, need: text || isInput ? 4.5 : 3, label: (e.getAttribute('data-testid') || text || e.tagName).slice(0, 20) };
    }, [el.x, el.y]);
    if (r && r.ratio < r.need) bad.push(`${r.label}:${r.ratio}<${r.need}`);
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
        if (!((gapBelow >= 3 && gapBelow <= 9) || (gapAbove >= 3 && gapAbove <= 9))) anchorFails++;
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
  check(`[${theme}] 发现式贴锚配对零断链`, anchorFails === 0, `${anchorFails} 处 gap∉[3,9]`);
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
