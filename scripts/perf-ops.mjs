/**
 * IP-09 高频操作性能实测（§4: 10–30人、5–15并行事项及三倍数据规模）。
 *
 * 与 perf-baseline.mjs（页面加载 FCP/LCP）互补，本脚本测**操作**：
 * 高频筛选 / SR 树展开 / 换方案 / 批量调整 —— 每项采 请求量、API 分位数、
 * 交互耗时、long-task 卡顿，两档规模（30人/15事 基线档 + ×3 压力档）。
 *
 * 生产前端：build:client + vite preview（/api 代理到隔离后端）。
 * 隔离后端：NODE_ENV=e2e 全新库——受控规模、零 dev 库污染；压完即弃
 * （e2e global setup 下次运行会重建 .e2e-data）。
 *
 * Usage: npm run perf:ops   (PERF_SKIP_BUILD=1 迭代时跳过构建)
 * Output: 控制台表格 + docs/perf/perf-history.jsonl 追加（op 类条目）
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const API_PORT = 3111;
const API = `http://127.0.0.1:${API_PORT}`;
const PREVIEW_PORT = 4174;
const WEB = `http://127.0.0.1:${PREVIEW_PORT}`;
const RUNS = Number(process.env.PERF_RUNS || 5);
const HISTORY = 'docs/perf/perf-history.jsonl';
const HEAD = execSync('git rev-parse --short HEAD').toString().trim();

const children = [];
const cleanup = () => {
  for (const c of children) {
    try { process.kill(-c.pid, 'SIGKILL'); } catch { /* already gone */ }
    try { process.kill(c.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
};
process.on('exit', cleanup);
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
/** 启动前按端口清残(fail→process.exit 曾跳过 finally 泄漏后端/preview) */
const evictPort = async (port) => {
  const { execSync } = await import('node:child_process');
  try {
    const out = execSync(`ss -tlnp 2>/dev/null | grep ':${port} ' | grep -oP 'pid=\\K[0-9]+' | sort -u`).toString().trim();
    for (const pid of out.split('\n').filter(Boolean)) {
      try { process.kill(Number(pid), 'SIGKILL'); console.log(`• evicted stale pid ${pid} on :${port}`); } catch { /* gone */ }
    }
  } catch { /* ss unavailable or no match */ }
};
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10;
};

// ── 1. 后端（隔离 e2e 库）──
await evictPort(API_PORT);
await evictPort(PREVIEW_PORT);
console.log('• starting isolated backend (NODE_ENV=e2e, :3111)...');
const backend = spawn('npx', ['tsx', 'src/server/index.ts'], {
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, NODE_ENV: 'e2e', PORT: String(API_PORT), FORCE_COLOR: '0' },
});
children.push(backend);
{
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(1000);
    try { up = (await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { /* boot */ }
  }
  if (!up) fail('backend did not come up on :3111');
}

// ── 2. 生产前端 ──
if (!process.env.PERF_SKIP_BUILD) {
  console.log('• building client (PERF_SKIP_BUILD=1 to skip)...');
  execSync('npm run build:client', { stdio: 'inherit' });
}
if (!existsSync('dist-client')) fail('dist-client missing — build first');
console.log(`• starting vite preview on :${PREVIEW_PORT} (proxy → ${API})...`);
const preview = spawn('npx', ['vite', 'preview', '--config', 'client-vite.config.ts'], {
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  env: { ...process.env, PREVIEW_PORT: String(PREVIEW_PORT), PORT: String(API_PORT) },
});
children.push(preview);
{
  let up = false;
  for (let i = 0; i < 30 && !up; i++) {
    await sleep(500);
    try { up = (await fetch(`${WEB}/`, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* boot */ }
  }
  if (!up) fail('preview did not come up');
}

// ── 3. 登录 + 种数据 ──
const j = async (r) => { const b = await r.json(); return b.data ?? b; };
const people0 = await j(await fetch(`${API}/api/people?limit=5`));
const loginPerson = people0.find((p) => String(p.id).startsWith('person-e2e-')) || people0[0];
if (!loginPerson) fail('no people in e2e seed');
const login = await j(await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personId: loginPerson.id }),
}));
const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` };
const api = {
  post: (path, body) => fetch(`${API}${path}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) }),
};

const [typesR, subtypesR, locationsR, rolesR] = await Promise.all([
  fetch(`${API}/api/project-types`, { headers: authHeaders }),
  fetch(`${API}/api/project-sub-types`, { headers: authHeaders }),
  fetch(`${API}/api/locations`, { headers: authHeaders }),
  fetch(`${API}/api/roles`, { headers: authHeaders }),
]);
const types = await j(typesR);
const subTypesRaw = await j(subtypesR);
// 响应可能两种形状: 扁平 [subtype...] 或按类型分组 [{project_type_id, sub_types:[...]}]
const subTypes = Array.isArray(subTypesRaw) && subTypesRaw[0]?.sub_types
  ? subTypesRaw.flatMap((g) => g.sub_types || [])
  : subTypesRaw;
const locations = await j(locationsR);
const roles = await j(rolesR);
const typeHasSub = types.map((t) => ({ t, st: subTypes.find((s) => s.project_type_id === t.id) })).find((x) => x.st);
if (!typeHasSub || !locations.length || !roles.length) fail('catalog incomplete (types/subtypes/locations/roles)');
console.log(`• catalogs ok (type=${typeHasSub.t.name}, role=${roles[0].name}, loc=${locations[0].name})`);

const created = { people: [], projects: [] };
const mustOk = async (r, what) => {
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    fail(`seed ${what} → HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  return r;
};
const mkPerson = async (tag, i) => {
  const r = await mustOk(await api.post('/api/people', {
    name: `压测${tag}-${String(i).padStart(3, '0')}`, worker_type: 'FTE',
    default_availability_percentage: 100, default_hours_per_day: 8,
  }), `person#${i}`);
  const p = await j(r); created.people.push(p.id); return p;
};
const mkProject = async (tag, i, parent) => {
  const r = await mustOk(await api.post('/api/projects', {
    name: `${parent ? 'AR' : 'SR'}${tag}-${String(i).padStart(3, '0')}`,
    project_type_id: typeHasSub.t.id, project_sub_type_id: typeHasSub.st.id,
    location_id: locations[0].id, priority: (i % 5) + 1, include_in_demand: true,
    owner_id: created.people[i % created.people.length]?.id ?? loginPerson.id,
    ...(parent ? { parent_id: parent.id } : {}),
  }), `project#${i}`);
  const p = await j(r); created.projects.push(p.id); return p;
};
const mkAssignment = async (person, project, k) => {
  const start = `2026-11-${String((k % 20) + 1).padStart(2, '0')}`;
  const end = `2027-02-${String((k % 20) + 1).padStart(2, '0')}`;
  await mustOk(await api.post('/api/assignments', {
    project_id: project.id, person_id: person.id, role_id: roles[k % roles.length].id,
    allocation_percentage: 20 + (k % 5) * 15, assignment_date_mode: 'fixed',
    start_date: start, end_date: end,
  }), `assignment#${k}`);
};

const seedScale = async (tag, nPeople, nProjects, nAssignments) => {
  console.log(`• seeding ${tag}: +${nPeople}人 +${nProjects}事 +${nAssignments}分配 ...`);
  const people = [];
  for (let i = 0; i < nPeople; i++) people.push(await mkPerson(tag, i));
  const projects = [];
  for (let i = 0; i < nProjects; i++) projects.push(await mkProject(tag, i));
  // SR/AR 树：前 2 个事项各带 2 个 AR 子行（展开操作的标的）
  for (let s = 0; s < 2; s++) {
    for (let c = 0; c < 2; c++) await mkProject(tag, 100 + s * 10 + c, projects[s]);
  }
  for (let k = 0; k < nAssignments; k++) {
    await mkAssignment(people[k % nPeople], projects[k % nProjects], k);
  }
  // 换方案标的：branch 场景
  const sc = await j(await api.post('/api/scenarios', {
    name: `压测方案-${tag}`, scenario_type: 'branch', status: 'active',
    description: 'perf-ops', created_by: loginPerson.id,
  }));
  return { people, projects, scenario: sc };
};

// ── 4. 度量内核 ──
const installObservers = () => page.evaluate(() => {
  window.__perf = { longTasks: [], worst: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__perf.longTasks.push(Math.round(e.duration));
        if (e.duration > window.__perf.worst) window.__perf.worst = Math.round(e.duration);
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported */ }
});

let page;
const apiResourceCount = () => page.evaluate(() =>
  performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/')).length);

/** 一次操作窗口：action 交互 → settle(DOM 条件 + 网络静默) → 采集 */
const measureOp = async (label, action, settle) => {
  const samples = [];
  for (let r = 0; r < RUNS; r++) {
    await page.evaluate(() => { window.__perf = { longTasks: [], worst: 0 }; });
    const resBefore = await apiResourceCount();
    const t0 = Date.now();
    await action();
    await settle();
    const wall = Date.now() - t0;
    const { apiRequests, apiDurations } = await page.evaluate(() => {
      const rs = performance.getEntriesByType('resource').filter((x) => x.name.includes('/api/'));
      return { apiRequests: rs.length, apiDurations: rs.map((x) => Math.round(x.duration)) };
    });
    const perf = await page.evaluate(() => window.__perf);
    samples.push({
      wall,
      requests: apiRequests - resBefore,
      apiMax: apiDurations.length ? Math.max(...apiDurations) : 0,
      longTasks: perf.longTasks.length,
      worstMs: perf.worst || 0,
    });
    await sleep(200);
  }
  const row = {
    op: label, runs: RUNS,
    wallP50: pct(samples.map((s) => s.wall), 50), wallP95: pct(samples.map((s) => s.wall), 95),
    reqMedian: pct(samples.map((s) => s.requests), 50), reqMax: Math.max(...samples.map((s) => s.requests)),
    apiP95: pct(samples.map((s) => s.apiMax), 95),
    longTasksTotal: samples.reduce((a, s) => a + s.longTasks, 0),
    worstLongMs: Math.max(...samples.map((s) => s.worstMs)),
  };
  return row;
};

const waitForQuiet = () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

// ── 5. 操作电池 ──
const battery = async (scaleTag, scenarioName) => {
  const results = [];
  await page.goto(`${WEB}/projects`, { waitUntil: 'networkidle' });
  await page.locator('.requirements-table').waitFor({ timeout: 20000 });
  await page.evaluate(() => { document.querySelector('.requirements-table').scrollTop = 0; });
  await sleep(400);
  // 记住基线场景的显示名(复位选择项用——种子名可能非"基线"二字)
  const baselineName = (await page.locator('.scenario-selector .scenario-name').textContent())?.trim();

  // 5.1 高频筛选：任务视图 chip。action=点选(每次同向);捕获后复位(再点取消)
  const aChip = page.locator('.task-view-chip').nth(1);
  results.push(await measureOp('task-chip-filter', async () => { await aChip.click(); },
    async () => { await waitForQuiet(); }));
  // 复位=显式回"全部"视图(toggle 依赖状态,显式选择不依赖)
  await page.locator('[data-testid="task-view-all"]').click();
  await waitForQuiet();

  // 5.2 高频筛选：搜索框
  const search = page.locator('input[placeholder*="搜索"]').first();
  if (await search.count()) {
    results.push(await measureOp('search-filter', async () => {
      await search.fill(`SR${scaleTag}-0`);
    }, async () => { await page.waitForTimeout(600); await waitForQuiet(); }));
    await search.fill('');
    await waitForQuiet();
  }

  // 5.3 SR 树展开。action=展开;捕获后复位(再点收起)
  const toggle = page.locator('.req-sr-toggle').first();
  if (await toggle.count()) {
    results.push(await measureOp('sr-expand', async () => { await toggle.click(); },
      async () => { await page.waitForTimeout(300); await waitForQuiet(); }));
    await toggle.click().catch(() => undefined); // 复位
    await waitForQuiet();
  }

  // 5.4 换方案：action=切到压测方案(每轮同向);捕获后复位回基线
  results.push(await measureOp('scenario-switch', async () => {
    await page.locator('.scenario-selector .scenario-button').click();
    await page.locator('.scenario-dropdown .scenario-option', { hasText: scenarioName }).first().click();
  }, async () => {
    await page.locator('.scenario-selector .scenario-name', { hasText: scenarioName }).waitFor({ timeout: 10000 });
    await waitForQuiet();
  }));
  // 复位回基线(不计量)——用开局记下的基线显示名
  if (baselineName) {
    await page.locator('.scenario-selector .scenario-button').click();
    await page.locator('.scenario-dropdown .scenario-option', { hasText: baselineName }).first().click();
    await page.locator('.scenario-selector .scenario-name', { hasText: baselineName }).waitFor({ timeout: 10000 }).catch(() => undefined);
    await waitForQuiet();
  }

  // 5.5 批量调整：清选择→勾 5 行→批量优先级首项。批量条在选择期内驻留,
  //     settle=网络静默+600ms(不等条隐藏)。前置=整页重载回到干净全视图
  //     (前面各操作的过滤/树/场景残留一并清除,重载不进计量窗口)
  await page.goto(`${WEB}/projects`, { waitUntil: 'networkidle' });
  await page.locator('.requirements-table').waitFor({ timeout: 20000 });
  await sleep(400);
  {
    const nBoxes = await page.locator('.requirements-row [role="checkbox"]').count();
    if (nBoxes < 5) {
      const scn = await page.locator('.scenario-selector .scenario-name').textContent().catch(() => '?');
      const pressed = await page.locator('.task-view-chip[aria-pressed="true"]').count();
      const dump = await page.evaluate(() => ({
        url: location.href,
        rows: [...document.querySelectorAll('.requirements-row')].slice(0, 6).map((r) =>
          (r.querySelector('.requirements-name-text')?.textContent || '').slice(0, 24)),
        totalRows: document.querySelectorAll('.requirements-row').length,
        searchVal: document.querySelector('input[placeholder*="搜索"]')?.value ?? '(none)',
        counts: [...document.querySelectorAll('.task-view-chip .task-view-count')].map((c) => c.textContent),
      }));
      throw new Error(`bulk 前置不足: 复选框 ${nBoxes} (场景=${scn}, chip=${pressed}) dump=${JSON.stringify(dump)}`);
    }
  }
  results.push(await measureOp('bulk-priority', async () => {
    const close = page.locator('.req-bulk-btn--close');
    if (await close.count()) await close.click().catch(() => undefined); // 清残留选择
    const boxes = page.locator('.requirements-row [role="checkbox"]');
    for (let i = 0; i < 5; i++) await boxes.nth(i).click();
    await page.locator('[data-testid="bulk-priority-btn"]').click();
    await page.locator('.cell-pop-item').first().waitFor({ timeout: 5000 });
    await page.locator('.cell-pop-item').first().click();
  }, async () => {
    await page.waitForTimeout(600);
    await waitForQuiet();
  }));

  return results;
};

// ── 6. 主流程：基线档 → 压力档 ──
const browser = await chromium.launch();
try {
  // 基线档 30人/15事/60分配
  const base = await seedScale('A', 30, 15, 60);
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(({ login, person }) => {
    localStorage.setItem('capacinator_current_user', JSON.stringify(person));
    localStorage.setItem('auth_token', login.accessToken);
    localStorage.setItem('refresh_token', login.refreshToken ?? '');
    localStorage.setItem('capacinator-language', 'zh-CN');
    localStorage.setItem('theme', 'light');
  }, { login, person: login.user ?? loginPerson });
  await installObservers();
  const baseRows = await battery('A', base.scenario.name);

  // 压力档 ×3：补到 90人/45事/180分配
  const stress = await seedScale('B', 60, 30, 120);
  const stressRows = await battery('B', stress.scenario.name);

  // ── 7. 报告 ──
  const all = [
    ...baseRows.map((r) => ({ scale: '30p/15prj', ...r })),
    ...stressRows.map((r) => ({ scale: '90p/45prj (×3)', ...r })),
  ];
  console.log('\n════════ 高频操作实测（生产构建, 1600×900, zh-CN）════════');
  for (const r of all) {
    console.log(
      `[${r.scale}] ${r.op.padEnd(16)} 交互p50/p95 ${String(r.wallP50).padStart(5)}/${String(r.wallP95).padStart(5)}ms`
      + `  请求中位/最大 ${String(r.reqMedian).padStart(2)}/${String(r.reqMax).padStart(2)}`
      + `  API p95 ${String(r.apiP95).padStart(5)}ms`
      + `  longtask ${r.longTasksTotal}次/最差 ${r.worstLongMs}ms`
    );
    appendFileSync(HISTORY, JSON.stringify({
      ts: new Date().toISOString(), head: HEAD, kind: 'ops', page: `ops-${r.op}`,
      scale: r.scale, ...r,
    }) + '\n');
  }
  console.log(`\n• ${all.length} 条已追加到 ${HISTORY}（kind:"ops"）`);
} finally {
  await browser.close().catch(() => undefined);
  cleanup();
}
