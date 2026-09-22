// Headless: 需求/问题单/事项 三台 + 需求台信息密度重做
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3120';
const API = 'http://127.0.0.1:3110';
const CHROME = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.addInitScript(() => {
  localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
  localStorage.setItem('capacinator-language', 'zh-CN');
  localStorage.setItem('theme', 'dark');
});

// ── 1. 需求台 (默认 tab) ─────────────────────────────
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 默认态(无拖拽记录)表格必须零横向滚动——横滚只能由用户主动拖宽触发;
// 默认列预算按容器重算(2026-09-22 名称截断审计: 曾默认即溢出,名称贴地板 150px)
{
  await page.evaluate(() => localStorage.removeItem('req-col-widths-v2'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const t = document.querySelector('.requirements-table');
    const name = document.querySelector('.requirements-name');
    const txt = name?.querySelector('.requirements-name-text');
    return {
      scrollW: t.scrollWidth, clientW: t.clientWidth,
      nameW: Math.round(name.getBoundingClientRect().width),
      nameTextW: txt ? Math.round(txt.getBoundingClientRect().width) : 0,
      truncated: txt ? txt.scrollWidth > txt.clientWidth + 1 : false
    };
  });
  check('默认态零横向滚动(1600)', m.scrollW <= m.clientW + 1, `scroll=${m.scrollW}/client=${m.clientW}`);
  check('名称列默认达内容地板(≥210)', m.nameW >= 210, `name=${m.nameW}`);
  check('默认态名称文字不截断', !m.truncated, `text=${m.nameTextW}px${m.truncated ? ' 截断' : ''}`);
}
// 1366 compact 档同样默认零横滚
{
  const p1366 = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await p1366.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', 'dark');
    localStorage.removeItem('req-col-widths-v2');
  });
  await p1366.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await p1366.waitForTimeout(1500);
  const m = await p1366.evaluate(() => {
    const t = document.querySelector('.requirements-table');
    const txt = document.querySelector('.requirements-name-text');
    return { scrollW: t.scrollWidth, clientW: t.clientWidth, truncated: txt ? txt.scrollWidth > txt.clientWidth + 1 : false };
  });
  check('默认态零横向滚动(1366 compact)', m.scrollW <= m.clientW + 1, `scroll=${m.scrollW}/client=${m.clientW}`);
  check('1366 名称文字不截断', !m.truncated);
  await p1366.close();
}

const tabLabels = await page.$$eval('[role="tab"], .unified-tab, [data-tab]', () => []).catch(() => []);
check('需求台默认呈现', (await page.$('.requirements-table')) !== null);

const headers = await page.$$eval('.requirements-thead span', els => els.map(e => e.textContent.trim()));
check('新列集(名称/编号/标签/状态/人力/版本/交付/优先级/负责人/操作)',
  ['项目名称','编号','标签','组件','状态','人力（实＋池）','规模','版本','交付计划','优先级','负责人','操作'].every(h => headers.includes(h)),
  headers.join('|'));

const demandRows = await page.$$eval('.requirements-row', els => els.map(e => e.querySelector('.requirements-name-text')?.textContent));
check('仅需求类事项(3顶层+2AR子行,缓冲池不混入)',
  demandRows.length === 5 && !demandRows.includes('问题单支持') && !demandRows.includes('项目事务'),
  demandRows.join(','));

// 告警短词: 数据平台升级(已启动迭代无LOC) → 未评估 chip
const warnedRow = await page.$('.requirements-row--warned');
const chip = warnedRow ? await warnedRow.$('.lifecycle-warn-chip') : null;
check('告警行淡黄底+短词(短词随实际告警集变化)',
  !!warnedRow && !!chip && /缺池|未评估|无粗估|未回填|未编号/.test((await chip.textContent())),
  chip ? (await chip.textContent()) : 'none');

// 人力列有数字
const staffingCell = await page.$$eval('.req-staff', els => els.map(e => e.textContent.trim()));
check('人力两侧条渲染', staffingCell.length >= 3 && staffingCell.some(s => /[0-9]/.test(s)),
  staffingCell.slice(0, 3).join(' ; '));

// 优先级徽章
const pBadges = await page.$$eval('.req-pri', els => els.map(e => e.textContent));
check('优先级徽章', pBadges.length >= 3 && pBadges.every(p => /^P\d$/.test(p)), pBadges.join(','));

// ── 1.5 人力列: 明文 + 就地调整气泡(P3 开发池 0→0.5→还原) ──
{
  const p3Row = page.locator('.requirements-row', { hasText: '移动端改版' });
  const staffText = (await p3Row.locator('.req-staff').textContent()) ?? '';
  check('人力列明文两行(设计/开发)', staffText.includes('设计') && staffText.includes('开发'), staffText.trim());
  await p3Row.locator('.req-staff').click();
  await page.waitForSelector('.staff-pop', { timeout: 5000 });
  check('点击弹调整气泡', true);
  // 加减号曾因全局 button padding 未重置被压成 0 宽而物理消失(2026-09-22 用户实测),
  // 命中断言(按钮盒够大)/axe(不查SVG)/碰撞检测(零宽不相交)三层全部免疫——图标物理尺寸必须单独断言
  const svgSizes = await page.$$eval('.staff-pop svg', els => els.map(e => {
    const r = e.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  }));
  check('池步进器加减号物理可见(≥10px)', svgSizes.length >= 4 && svgSizes.every(s => parseInt(s) >= 10), svgSizes.join(' '));
  const stepperLabels = await page.$$eval('.staff-pop .staff-stepper-label', els => els.map(e => e.textContent.trim()));
  check('步进器自带"池"标签', stepperLabels.length === 2 && stepperLabels.every(t2 => t2 === '池'), stepperLabels.join(','));
  const howHint = (await page.$$eval('.staff-pop .lc-popover-hint', els => els.map(e => e.textContent.trim())))[0] ?? '';
  check('气泡顶部声明编辑模型(FTE/只调池/实名去向)', howHint.includes('池占位') && howHint.includes('实名'), howHint.slice(0, 40));
  const devPlus = page.locator('.staff-pop-row', { hasText: '开发' }).locator('button[title="+0.5"]');
  await devPlus.click();
  await page.waitForTimeout(1500);
  const P3ID = 'project-1789912193228-89aoh4wyx';
  const poolsResp = await page.request.get(`${API}/api/pool-demands/project/${P3ID}`);
  const pools = ((await poolsResp.json()).data ?? []).filter((x) => x.status === 'open');
  check('开发池 +0.5 落库', pools.some((x) => Number(x.headcount) === 0.5),
    JSON.stringify(pools.map((x) => [x.role_name, x.headcount])));
  await page.keyboard.press('Escape');
}

// ── 1.7 SR→AR 折叠行: SR 存在/计数/分布/折叠(演示数据: 客户门户改版 分解 2 AR) ──
{
  const srRow = page.locator('.requirements-row--sr', { hasText: '客户门户改版' });
  const srCount = await srRow.count();
  check('SR 折叠头行存在', srCount === 1);
  if (srCount === 1) {
    const chip = (await srRow.locator('.req-sr-chip').textContent()) ?? '';
    const childCount = await page.locator('.requirements-row--child').count();
    check('SR 计数胶囊 = 子行数', chip.includes(`${childCount}`), `chip=${chip} children=${childCount}`);
    const dist = await srRow.locator('.req-state-dist-item').count();
    check('SR 状态分布渲染', dist >= 1);
    // 折叠/展开(2026-09-22 修正: 折叠归箭头钮,SR 行点击进详情)
    await srRow.locator('.req-sr-toggle').click();
    await page.waitForTimeout(250);
    const collapsed = await page.locator('.requirements-row--child').count();
    await srRow.locator('.req-sr-toggle').click();
    await page.waitForTimeout(250);
    const reopened = await page.locator('.requirements-row--child').count();
    check('SR 箭头折叠/再展开', collapsed === 0 && reopened === childCount, `${childCount}->${collapsed}->${reopened}`);
    // 汇总=子行之和(规模): SR 的 KLOC = 各子行 KLOC 之和
    const srKloc = await srRow.locator('.req-scale-kloc').textContent().catch(() => null);
    const childKlocs = [];
    for (const c of await page.locator('.requirements-row--child').all()) {
      const k = await c.locator('.req-scale-kloc').textContent().catch(() => null);
      if (k) childKlocs.push(parseFloat(k));
    }
    const sum = Math.round(childKlocs.reduce((a, b) => a + b, 0) * 10) / 10;
    check('SR 规模汇总 = 子行之和(无评估则同为 —)',
      childKlocs.length === 0 ? srKloc === null : srKloc != null && parseFloat(srKloc) === sum,
      `SR=${srKloc} Σ子行=${sum}(${childKlocs.join('+')})`);
  }
}

// ── 1.8 编号列(2026-09-22 裁决: SR/AR 统一,混排世界粒度自述) ──
{
  // 子行带 AR 号;数据平台升级(迭代中无编号)应现"未编号"告警短词
  const childNums = await page.$$eval('.requirements-row--child .req-number-part', els => els.map(e => e.textContent.trim()));
  check('子行编号列显示 AR 号', childNums.some(n => n.includes('AR-2026')), childNums.join(','));

  const noNum = await page.$$eval('.requirements-row--warned', rows => rows.some(r => r.textContent.includes('未编号')));
  check('迭代中无编号 → 未编号告警', noNum);

  // 子类型撤内联(常量重复零信息);筛选可用
  const subInline = await page.$$('.requirements-subtype');
  check('子类型不再内联名称格', subInline.length === 0);
  await page.selectOption('[data-testid="subtype-filter"]', '标准需求');
  await page.waitForTimeout(300);
  const subRows = await page.$$eval('.requirements-row .requirements-name-text', els => els.map(e => e.textContent.trim()));
  check('子类型筛选可用(标准需求全量)', subRows.length === 5, `${subRows.length} 行`);
  await page.selectOption('[data-testid="subtype-filter"]', '');

  // SR 行编号就地填写 SR 号(混排: 顶层/SR/子行行为一致)
  const srRow2 = page.locator('.requirements-row--sr', { hasText: '客户门户改版' });
  await srRow2.locator('.req-number-part').click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('SR-26-001');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const SRID = 'project-1789912193111-zikdnz8c5'; // 客户门户改版
  const srResp = await page.request.get(`${API}/api/projects/${SRID}`);
  const srNum = ((await srResp.json()).data?.external_number) ?? null;
  check('SR 行编号填写落库(SR-26-001)', srNum === 'SR-26-001', `num=${srNum}`);
}

// ── 2. 版本内联编辑(平铺) → 工具栏版本筛选 ───────────
const p1Row = page.locator('.requirements-row', { hasText: '客户门户改版' });
await p1Row.locator('.projects-version-part').first().click();
await page.waitForTimeout(300);
await page.keyboard.press('Control+a');
await page.keyboard.type('B');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
// release part
await p1Row.locator('.projects-version-part').nth(1).click();
await page.waitForTimeout(300);
await page.keyboard.press('Control+a');
await page.keyboard.type('26.RP4');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);

// 2026-09-22 裁决: 不做版本分组头(两列已携带信息),版本维度改由筛选表达
check('平铺呈现: 无版本分组头',
  (await page.$('.requirements-group-header')) === null && (await page.$('.requirements-release-header')) === null);
const verParts = await p1Row.locator('.projects-version-part').allTextContents();
check('版本两段落库显示(B / 26.RP4)',
  (verParts[0] ?? '').trim() === 'B' && (verParts[1] ?? '').trim() === '26.RP4', verParts.map(v => v.trim()).join(' | '));

// 工具栏无裸 i18n 键
const tagBtnText = (await page.$eval('.board-ghost-btn', el => el.textContent.trim())) ?? '';
check('工具栏文案已翻译(无 tags.manage 裸键)', /^[\u4e00-\u9fa5]/.test(tagBtnText) && !/[a-z]+\.[a-z]/i.test(tagBtnText), tagBtnText);

// 表头与内容同轴(状态/优先级/操作居中)
const colAligns = await page.$$eval('.requirements-thead span.col-c', els => els.map(e => getComputedStyle(e).textAlign));
check('表头居中列与内容同轴', colAligns.length === 3 && colAligns.every(a => a === 'center'), colAligns.join(','));

// 版本筛选(替代分组): 产品版本=B 只留 B 的树; 未排=筛出未排版本事项; 交付计划同理
const nameTexts = () => page.$$eval('.requirements-row .requirements-name-text', els => els.map(e => e.textContent.trim()));
await page.selectOption('[data-testid="product-filter"]', 'B');
await page.waitForTimeout(400);
const rowsB = await nameTexts();
check('产品版本筛选=B(未排事项隐藏)', rowsB.includes('客户门户改版') && !rowsB.includes('数据平台升级'), rowsB.join(','));
await page.selectOption('[data-testid="product-filter"]', '__none__');
await page.waitForTimeout(400);
const rowsNone = await nameTexts();
check('产品版本筛选=未排(B 树隐藏)', rowsNone.includes('数据平台升级') && !rowsNone.includes('客户门户改版'), rowsNone.join(','));
await page.selectOption('[data-testid="product-filter"]', ''); // 清产品筛选,单一变量验证交付计划筛选
await page.selectOption('[data-testid="release-filter"]', '26.RP4');
await page.waitForTimeout(400);
const rowsRp = await nameTexts();
check('交付计划筛选=26.RP4', rowsRp.includes('客户门户改版') && !rowsRp.includes('移动端改版'), rowsRp.join(','));
await page.click('[data-testid="reset-filters"]');
await page.waitForTimeout(400);
const rowsReset = await nameTexts();
check('重置筛选恢复全量', rowsReset.includes('客户门户改版') && rowsReset.includes('数据平台升级') && rowsReset.includes('移动端改版'), `${rowsReset.length} 行`);

// 状态就地推进仍在(客户门户改版已分解为 SR,快按钮在普通行/子行上)
const quick = page.locator('.requirements-row:not(.requirements-row--sr) .lifecycle-quick-btn').first();
check('状态快捷键保留', (await quick.count()) >= 1, (await quick.textContent().catch(() => '')) ?? '');

// ── 2.5 引用码闭环: 详情页 chip + 搜索定位(2026-09-22 裁决,不加内部编码) ──
{
  // SR 行点击同样进详情(2026-09-22 修正);顺带覆盖 SR 详情可达性
  const p1 = page.locator('.requirements-row--sr', { hasText: '客户门户改版' });
  await p1.locator('.requirements-name-text').click();
  await page.waitForSelector('.project-ref-code', { timeout: 8000 });
  const chip = (await page.$eval('.project-ref-code', el => el.textContent.trim()));
  check('详情页引用码 chip(纯数字序号)', /^#\d+$/.test(chip), chip);
  await page.goBack();
  await page.waitForTimeout(1200);
  await page.fill('[data-testid="search-input"]', chip);
  await page.waitForTimeout(400);
  const hit = await page.$$eval('.requirements-row .requirements-name-text', els => els.map(e => e.textContent.trim()));
  check('搜索框粘贴引用码 → 精确定位该行(树保留)', hit.includes('客户门户改版') && !hit.includes('移动端改版'), hit.join(','));
  await page.fill('[data-testid="search-input"]', '');

  // 空外部号行显示 #序号(截图指代永不落空);外部号可直接搜索
  const p5 = page.locator('.requirements-row', { hasText: '移动端改版' });
  const fallback = (await p5.locator('.req-number-part').textContent())?.trim() ?? '';
  check('编号列空外部号 → 弱化 #序号', /^#\d+$/.test(fallback), fallback);
  await page.fill('[data-testid="search-input"]', 'SR-26-001'); // 1.8 段刚填的外部号
  await page.waitForTimeout(400);
  const hitExt = await page.$$eval('.requirements-row .requirements-name-text', els => els.map(e => e.textContent.trim()));
  check('搜索外部号(SR-26-001) → 定位 SR 行', hitExt.includes('客户门户改版') && !hitExt.includes('移动端改版'), hitExt.join(','));
  await page.fill('[data-testid="search-input"]', '');
}

// ── 3. 问题单台 ─────────────────────────────────────
await page.click('[role="tab"]:has-text("问题单"), a:has-text("问题单"), button:has-text("问题单")').catch(async () => {
  await page.goto(`${BASE}/projects?tab=tickets`, { waitUntil: 'networkidle' });
});
await page.waitForTimeout(1800);
const ticketsCard = await page.$('.tickets-card');
const ticketsStat = await page.textContent('.tickets-stat').catch(() => '');
check('问题单台: 缓冲卡+人数统计', !!ticketsCard && /\d+ 人/.test(ticketsStat), ticketsStat.trim().slice(0, 40));
const ticketsLedger = await page.$('.tickets-ledger-note');
check('台账占位说明', !!ticketsLedger);

// ── 4. 事项台 ──────────────────────────────────────
await page.goto(`${BASE}/projects?tab=affairs`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const affairRows = await page.$$eval('.affairs-row', els => els.map(e => e.textContent.slice(0, 30)));
check('事项台行卡(项目事务+零星)', affairRows.length >= 1 && affairRows.some(r => r.includes('项目事务')), affairRows.join(' ; ').slice(0, 60));
const monthStat = await page.textContent('.affairs-stat--month').catch(() => '');
check('本月消耗人月', /本月 [\d.]+ 人月/.test(monthStat), monthStat.trim());

// 展开明细
await page.click('.affairs-row').catch(() => {});
await page.waitForTimeout(800);
const affairDetail = await page.$('.affairs-detail');
check('事项展开分配明细', !!affairDetail);

// ── 5. 视口预算看护(2026-09-21 教训: 审计粒度=用户消费单位=视口,不是组件) ──
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
{
  const toolbar = await page.$('.projects-toolbar');
  const filter = await page.$('.filter-bar');
  const firstRow = await page.$('.requirements-row');
  const rows = await page.$$('.requirements-row');
  const tb = toolbar ? Math.round((await toolbar.boundingBox()).height) : 0;
  const fb = filter ? Math.round((await filter.boundingBox()).height) : 0;
  const ry = firstRow ? Math.round((await firstRow.boundingBox()).y) : 9999;
  let visible = 0;
  for (const r of rows) { const b = await r.boundingBox(); if (b.y + b.height <= 900) visible++; }
  check('首屏包装克制(单行工具栏 ≤ 56px)', tb <= 56, `toolbar=${tb}`);
  check('首条数据在 y<450 进入视口', ry < 450, `y=${ry}`);
  check('首屏可见数据行 ≥ 需求总数一半', visible >= Math.ceil(rows.length / 2), `${visible}/${rows.length}`);
  await page.screenshot({ path: '/tmp/boards-fullpage-1600.png', fullPage: false });
}

// ── 6. 视觉秩序 20 维清单抽检(字号/分隔线/行高/圆角/命中目标) ──
{
  const metrics = await page.evaluate(() => {
    const board = document.querySelector('.projects-board');
    const sizes = new Set(), radii = new Set();
    let rules = 0, minHit = 999, minFont = Infinity;
    board.querySelectorAll('*').forEach(el => {
      const c = getComputedStyle(el);
      if (el.textContent?.trim() || el.matches('button,input,select')) {
        sizes.add(c.fontSize);
        // 口径与 sizes 一致(有文字或是控件);最小字号单独记账,档位少≠没有超小档
        minFont = Math.min(minFont, parseFloat(c.fontSize));
      }
      if (c.borderRadius !== '0px' && c.borderRadius !== '50%') radii.add(c.borderRadius);
      for (const side of ['Top', 'Bottom']) {
        if (parseFloat(c[`border${side}Width`]) > 0 && c[`border${side}Color`] !== 'rgba(0, 0, 0, 0)') rules++;
      }
    });
    board.querySelectorAll('button').forEach(b => {
      const r = b.getBoundingClientRect();
      if (r.width > 0) minHit = Math.min(minHit, Math.round(Math.min(r.width, r.height)));
    });
    const rows = Array.from(board.querySelectorAll('.requirements-row')).map(r => Math.round(r.getBoundingClientRect().height));
    return { fontSizes: sizes.size, radii: radii.size, hRules: rules, minHit, minFont, rows };
  });
  check(`字号档位 ≤ 4 (${metrics.fontSizes})`, metrics.fontSizes <= 4);
  // 2026-09-22 .text-muted 被页面 CSS 覆盖压到 9.35px 事故: 最小字号单独设防
  check(`无 11px 以下文字 (min=${Math.round(metrics.minFont * 10) / 10}px)`, metrics.minFont >= 11);
  check(`圆角档位 ≤ 4 (${metrics.radii})`, metrics.radii <= 4);
  // 预算 24: 行分隔(行×2)+表头 2+工具栏控件边框(搜索+5 下拉+按钮,控件非分隔线,
  // 2026-09-22 版本/交付计划筛选上线后 16→20,控件数驱动,非视觉噪声)
  check(`水平分隔线 ≤ 24 (${metrics.hRules})`, metrics.hRules <= 24);
  check(`最小命中目标 ≥ 24px (${metrics.minHit})`, metrics.minHit >= 24);
  const uniform = metrics.rows.length > 0 && metrics.rows.every(h => Math.abs(h - metrics.rows[0]) <= 1);
  check(`数据行高统一 40±1 (${metrics.rows.join(',')})`, uniform && Math.abs(metrics.rows[0] - 40) <= 1);
}

// ── 6.2 几何碰撞: 可见元素两两不相交(防"内容溢出盒子"型重叠) ──
const collisionProbe = () => {
  const bad = [];
  document.querySelectorAll('.requirements-row, .requirements-thead, .board-toolbar').forEach((scope) => {
    const els = Array.from(scope.querySelectorAll('button, span, input, select')).filter((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const c = getComputedStyle(e);
      if (c.visibility === 'hidden' || c.display === 'none') return false;
      return (e.textContent && e.textContent.trim()) || e.matches('button,input,select');
    });
    // 可见矩形: 与所有 overflow!=visible 祖先求交——被裁剪的"幽灵矩形"不算碰撞
    // (2026-09-22: 标签格 +1 被自身 overflow:hidden 裁剪,未裁矩形压到邻列,检测器误报)
    const visRect = (el) => {
      let r = el.getBoundingClientRect();
      let p = el.parentElement;
      while (p && p !== scope.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          const pr = p.getBoundingClientRect();
          r = { left: Math.max(r.left, pr.left), right: Math.min(r.right, pr.right), top: Math.max(r.top, pr.top), bottom: Math.min(r.bottom, pr.bottom) };
        }
        p = p.parentElement;
      }
      return r;
    };
    for (let a = 0; a < els.length; a++) for (let b = a + 1; b < els.length; b++) {
      if (els[a].contains(els[b]) || els[b].contains(els[a])) continue;
      const [A, B] = [visRect(els[a]), visRect(els[b])];
      if (A.right - A.left < 2 || B.right - B.left < 2) continue;
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ox > 2 && oy > 2) bad.push(`${(els[a].textContent || '').trim().slice(0, 6)}×${(els[b].textContent || '').trim().slice(0, 6)} ${ox.toFixed(0)}x${oy.toFixed(0)}px`);
    }
  });
  return [...new Set(bad)];
};
{
  // 灵敏度自证: 压力注入超宽徽章,检测器必须能抓到
  const stress = await page.addStyleTag({ content: '.projects-board .lifecycle-badge-btn { min-width: 190px !important; }' });
  await page.waitForTimeout(150);
  const stressed = await page.evaluate(collisionProbe);
  check('碰撞检测器灵敏度(压力注入可检出)', stressed.length > 0, `${stressed.length} 处`);
  await stress.evaluate((el) => el.remove());
  await page.waitForTimeout(150);
  const collisions = await page.evaluate(collisionProbe);
  check('行内零元素重叠', collisions.length === 0, collisions.slice(0, 3).join(' | '));
  // 图标塌陷检测: "一维为零另一维正常"的 svg = 内容盒被吃光的物理证据
  // (display:none 的图标两维皆零,不在此列)
  const collapsedIcons = await page.$$eval('svg', els =>
    els.filter(e => {
      const r = e.getBoundingClientRect();
      return (r.width < 2 && r.height >= 8) || (r.height < 2 && r.width >= 8);
    }).map(e => e.getAttribute('class') || 'svg')
  );
  check('全页无塌陷图标(零宽/零高)', collapsedIcons.length === 0, collapsedIcons.slice(0, 3).join(','));
}

// ── 6.5 浅色主题巡检(用户实际使用的主题) ────────────
// 教训(2026-09-22): 主页面的 addInitScript(theme:dark) 在每次导航都会执行,
// 早先"setItem(light)+goto"的切法实际一直在量深色页(靠巧合通过)。
// 必须开独立浅色页,且先断言页面真的是浅色——守卫自身也要防呆。
{
  const lightPage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await lightPage.addInitScript(() => {
    localStorage.setItem('capacinator_current_user', JSON.stringify({ id: 'eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', name: '陈主管' }));
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', 'light');
  });
  await lightPage.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  await lightPage.waitForTimeout(1800);
  const realTheme = await lightPage.evaluate(() => document.documentElement.dataset.theme ?? '(none)');
  check('浅色: 页面确为浅色主题(防呆)', realTheme === 'light', `data-theme=${realTheme}`);
  const lightTagBtn = (await lightPage.$eval('.board-ghost-btn', el => el.textContent.trim())) ?? '';
  check('浅色: 工具栏文案无裸键', !/[a-z]+\.[a-z]/i.test(lightTagBtn), lightTagBtn);
  const lum = await lightPage.$eval('.projects-board .lifecycle-state-badge', (el) => {
    const [r, g, b] = (getComputedStyle(el).color.match(/\d+/g) ?? [0, 0, 0]).map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  });
  check('浅色: 状态徽章文字压深(亮度<0.55)', lum < 0.55, `lum=${lum.toFixed(2)}`);
  const sep = await lightPage.$eval('.requirements-row', el => getComputedStyle(el).borderBottomColor !== 'rgba(0, 0, 0, 0)');
  check('浅色: 行分隔线可见', sep);
  // 最小字号在浅色页同口径复查(用户实际主题;主题变量理论上可改字号,不靠深色页兜底)
  const lightMinFont = await lightPage.evaluate(() => {
    let min = Infinity;
    document.querySelectorAll('.projects-board *').forEach(el => {
      const c = getComputedStyle(el);
      if (el.textContent?.trim() || el.matches('button,input,select')) min = Math.min(min, parseFloat(c.fontSize));
    });
    return min === Infinity ? 0 : Math.round(min * 10) / 10;
  });
  check('浅色: 无 11px 以下文字', lightMinFont >= 11, `min=${lightMinFont}px`);
  const lightCollisions = await lightPage.evaluate(collisionProbe);
  check('浅色: 行内零元素重叠', lightCollisions.length === 0, lightCollisions.slice(0, 3).join(' | '));
  await lightPage.screenshot({ path: '/tmp/demand-board-light.png' });
  await lightPage.evaluate(() => localStorage.setItem('theme', 'dark'));
  await lightPage.close();
}
// ── 7. 全程零错误 + 零弹窗 ────────────────────────────
check('零页面错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
const dialogs = await page.$$('dialog[open], [role="dialog"]');
check('零模态弹窗', dialogs.length === 0);

await page.screenshot({ path: '/tmp/demand-board.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
