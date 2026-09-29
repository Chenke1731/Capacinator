/**
 * Analytics-grade seed (2026-09-29): ~30 demands engineered to cover every
 * statistical dimension — the dataset the upcoming analysis work runs on.
 *
 * Coverage matrix (see SEED_MATRIX below):
 * - all 8 lifecycle states, all 4 components + unassigned bucket
 * - priorities 1-5, SR→AR trees (4 SRs with 2-3 ARs), standalone rows
 * - versions, iterations (existing 3), tags (外包/跨团队/预留 combos + none)
 * - estimation shapes (kloc only / both / overridden / none)
 * - assignments at varying percentages (workload analytics input)
 *
 * Full-fidelity path: API create → lifecycle transition (state machine)
 * → field updates → AR decomposition → assignments. Idempotent-ish:
 * wipes previously-seeded rows by name prefix first.
 */
const API = 'http://127.0.0.1:3110/api';
const PREFIX = '分析-';

const j = async (path, opts) => {
  const res = await fetch(API + path, opts);
  const body = await res.json().catch(() => ({}));
  const msg = String(body.message || body.error || '');
  if (!res.ok && !/already|已经在/.test(msg)) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
  }
  return body;
};
const POST = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const PUT = (body) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ---- metadata ----
const subGroups = (await j('/project-sub-types')).data;
const demandGroup = subGroups.find(g => g.project_type_name.startsWith('需求交付'));
const sub = demandGroup.sub_types[0];
const typeId = demandGroup.project_type_id;
const comps = (await j('/components')).data;
const compByName = Object.fromEntries(comps.map(c => [c.name, c.id]));
const iters = (await j('/iterations')).data ?? (await j('/iterations'));
const iterByName = Object.fromEntries((Array.isArray(iters) ? iters : iters.data ?? []).map(i => [i.name, i.id]));
const people = ((await j('/people?limit=50')).data?.data) ?? [];
const roles = ((await j('/roles?limit=50')).data?.data) ?? [];

// ---- wipe previous seed ----
const existing = (await j('/projects/board-feed')).data?.data ?? [];
for (const p of existing.filter(p => p.name.startsWith(PREFIX))) {
  // dissolve AR children first (parent delete is RESTRICTed by children)
  for (const c of existing.filter(x => x.parent_id === p.id)) await j(`/projects/${c.id}`, { method: 'DELETE' });
  await j(`/projects/${p.id}`, { method: 'DELETE' });
}
console.log('wiped previous seed');

// ---- the matrix: [name, state, component|null, priority, version, iter|null, kloc, pm, override, tags] ----
const M = [
  // delivered ×5
  ['报表-图表导出', 'delivered', '报表引擎', 2, 'V2.5', '门户项目10月迭代', 12, 3.5, 0, [7]],
  ['报表-透视表性能', 'delivered', '报表引擎', 3, 'V2.5', '门户项目10月迭代', 8, null, 0, []],
  ['平台-会话改造', 'delivered', 'HCCL_平台组', 2, 'V2.5', '门户项目10月迭代', 15, 4, 0, [18]],
  ['驱动-采集断连重试', 'delivered', 'HCCL_驱动组', 4, null, null, null, null, 0, []],
  ['调度-节假日排除', 'delivered', '调度组', 3, 'V2.5', null, 5, 1.5, 1, []],
  // in_iteration ×4
  ['报表-移动端适配', 'in_iteration', '报表引擎', 2, 'V3.0', '门户项目11月迭代', 20, 6, 0, []],
  ['平台-登录双因素', 'in_iteration', 'HCCL_平台组', 1, 'V3.0', '门户项目11月迭代', null, null, 0, [7, 18]],
  ['驱动-新传感器接入', 'in_iteration', 'HCCL_驱动组', 3, 'V3.0', '门户项目11月迭代', 10, 3, 0, []],
  ['报表-订阅推送', 'in_iteration', '报表引擎', 4, 'V3.1', '门户项目11月迭代', 6, null, 0, []],
  // scheduled ×4
  ['平台-权限矩阵重构', 'scheduled', 'HCCL_平台组', 2, 'V3.0', '门户项目12月迭代', 30, 9, 0, [18]],
  ['调度-优先级抢占', 'scheduled', '调度组', 2, 'V3.0', '门户项目12月迭代', 12, 4, 0, []],
  ['报表-数据脱敏', 'scheduled', '报表引擎', 1, 'V3.0', '门户项目12月迭代', 18, null, 0, []],
  ['门户-消息中心', 'scheduled', null, 3, 'V3.1', '门户项目12月迭代', 8, 2.5, 0, []],
  // backlog ×3
  ['平台-审计流水查询', 'backlog', 'HCCL_平台组', 3, null, null, null, null, 0, []],
  ['报表-自定义指标', 'backlog', '报表引擎', 3, 'V3.1', null, 25, null, 0, []],
  ['驱动-固件升级链路', 'backlog', 'HCCL_驱动组', 4, null, null, null, null, 0, [7]],
  // designing ×4
  ['平台-多租户隔离', 'designing', 'HCCL_平台组', 1, 'V3.1', null, 45, 14, 0, [18]],
  ['报表-实时大屏', 'designing', '报表引擎', 2, 'V3.1', null, 22, 7, 1, []],
  ['调度-资源画像', 'designing', '调度组', 3, 'V3.1', null, 9, null, 0, []],
  ['门户-暗色主题', 'designing', null, 5, null, null, 4, 1, 0, []],
  // pending_rat ×4 (fresh)
  ['报表-导出中心', 'pending_rat', '报表引擎', 3, null, null, null, null, 0, []],
  ['平台-网关限流', 'pending_rat', 'HCCL_平台组', 2, null, null, null, null, 0, []],
  ['驱动-遥测协议V2', 'pending_rat', 'HCCL_驱动组', 3, null, null, null, null, 0, [7]],
  ['门户-新手引导', 'pending_rat', null, 5, null, null, null, null, 0, []],
  // nok ×2
  ['报表-OLAP加速', 'nok', '报表引擎', 2, null, null, null, null, 0, []],
  ['平台-存储分层', 'nok', 'HCCL_平台组', 3, null, null, null, null, 0, [18]],
  // cancelled ×4
  ['调度-跨集群', 'cancelled', '调度组', 3, null, null, null, null, 0, []],
  ['报表-语音播报', 'cancelled', '报表引擎', 5, null, null, null, null, 0, []],
  ['驱动-蓝牙直连', 'cancelled', 'HCCL_驱动组', 4, null, null, null, null, 0, [7]],
  ['平台-工单集成', 'cancelled', null, 4, null, null, null, null, 0, []],
];
// SR parents with AR decomposition (state via parent; children inherit component)
const TREES = [
  { parent: '平台-微前端拆壳', state: 'scheduled', comp: 'HCCL_平台组', prio: 1, ver: 'V3.1', iter: '门户项目12月迭代', kloc: 60, pm: 18,
    ars: [['壳工程搭建', 10, 3], ['子应用接入规范', 8, 2.5], ['灰度发布机制', 12, 4]] },
  { parent: '报表-建模工作台', state: 'designing', comp: '报表引擎', prio: 2, ver: 'V3.1', iter: null, kloc: 50, pm: null,
    ars: [['拖拽画布', 20, 6], ['公式引擎', 18, null]] },
  { parent: '调度-混部调度器', state: 'backlog', comp: '调度组', prio: 2, ver: null, iter: null, kloc: null, pm: null,
    ars: [['在线离线混部', 15, 5]] },
  { parent: '平台-开放API网关', state: 'in_iteration', comp: 'HCCL_平台组', prio: 1, ver: 'V3.0', iter: '门户项目11月迭代', kloc: 35, pm: 11, tags: [18],
    ars: [['鉴权中心', 12, 4], ['流量控制', 10, 3], ['计量计费', 8, 2.5]] },
];

// ---- create + decorate ----
const created = [];
for (const [name, state, comp, prio, ver, iter, kloc, pm, ovr, tags] of M) {
  let row = (await j('/projects', POST({
    name: PREFIX + name, project_type_id: typeId, project_sub_type_id: sub.id,
    priority: prio, component_id: comp ? compByName[comp] : null,
  }))).data ?? {};
  const id = row.id ?? row?.data?.id;
  const fields = { product_version: ver || null, iteration_id: iter ? iterByName[iter] : null };
  if (tags.length) fields.tag_ids = tags;
  await j(`/projects/${id}`, PUT(fields));
  if (kloc != null) await j(`/projects/${id}`, PUT({ estimated_kloc: kloc }));
  if (pm != null) await j(`/projects/${id}`, PUT({ estimated_pm: pm }));
  // state machine to the target state
  await j(`/projects/${id}/lifecycle/transition`, POST({ to: state }));
  created.push({ id, name, state, comp, prio });
}
for (const t of TREES) {
  let row = (await j('/projects', POST({
    name: PREFIX + t.parent, project_type_id: typeId, project_sub_type_id: sub.id,
    priority: t.prio, component_id: compByName[t.comp],
  }))).data ?? {};
  const pid = row.id ?? row?.data?.id;
  await j(`/projects/${pid}`, PUT({
    product_version: t.ver || null, iteration_id: t.iter ? iterByName[t.iter] : null,
    ...(t.tags ? { tag_ids: t.tags } : {}),
  }));
  if (t.kloc != null) await j(`/projects/${pid}`, PUT({ estimated_kloc: t.kloc }));
  if (t.pm != null) await j(`/projects/${pid}`, PUT({ estimated_pm: t.pm }));
  await j(`/projects/${pid}/lifecycle/transition`, POST({ to: t.state }));
  for (const [arName, kloc, pm] of t.ars) {
    let c = (await j('/projects', POST({
      name: `${PREFIX}${t.parent}:${arName}`, project_type_id: typeId, project_sub_type_id: sub.id,
      priority: t.prio, component_id: compByName[t.comp], parent_id: pid,
    }))).data ?? {};
    const cid = c.id ?? c?.data?.id;
    if (kloc != null) await j(`/projects/${cid}`, PUT({ estimated_kloc: kloc }));
    if (pm != null) await j(`/projects/${cid}`, PUT({ estimated_pm: pm }));
    await j(`/projects/${cid}/lifecycle/transition`, POST({ to: t.state === 'backlog' ? 'backlog' : t.state }));
  }
  created.push({ id: pid, name: t.parent, state: t.state, comp: t.comp, prio: t.prio });
}
console.log(`created: ${created.length} top-level (+9 ARs inside TREES)`);

// ---- assignments: put people on active work (workload analytics input) ----
const roleSE = roles.find(r => r.name === 'SE');
const roleDev = roles.find(r => /开发|MDE|DEV/i.test(r.name || '')) ?? roles[0];
const active = created.filter(c => ['in_iteration', 'scheduled', 'designing'].includes(c.state));
let ai = 0;
for (const p of active.slice(0, 8)) {
  for (let k = 0; k < 2; k++) {
    const person = people[(ai * 2 + k) % people.length];
    const role = k === 0 ? roleSE : roleDev;
    if (!person || !role) break;
    await j('/assignments', POST({
      person_id: person.id, project_id: p.id, role_id: role.id,
      allocation_percentage: [25, 40, 50, 60, 80][(ai + k) % 5],
      start_date: '2026-11-01', end_date: '2026-12-31', status: 'active',
    })).catch(e => console.log(`  assignment skip: ${e.message.slice(0, 60)}`));
  }
  ai++;
}
console.log('assignments seeded');

// ---- verify distribution ----
const feed = (await j('/projects/board-feed')).data?.data ?? [];
const seeded = feed.filter(p => p.name.startsWith(PREFIX));
const by = (fn) => seeded.reduce((m, p) => (m[fn(p)] = (m[fn(p)] || 0) + 1, m), {});
console.log('seeded rows:', seeded.length);
console.log('states:', JSON.stringify(by(p => p.lifecycle_state)));
console.log('components:', JSON.stringify(by(p => p.component_id ? (comps.find(c => c.id === p.component_id)?.name ?? '?') : '未归属')));
console.log('priorities:', JSON.stringify(by(p => p.priority)));
console.log('versions:', JSON.stringify(by(p => p.product_version ?? '—')));
console.log('with AR children:', seeded.filter(p => p.parent_id).length);
