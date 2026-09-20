#!/usr/bin/env node
/**
 * Step 0 configuration for 交付领域 capacity planning (docs/REQUIREMENTS_zh-CN.md)
 *
 * - Backs up current (E2E residue) data to docs/e2e-data-backup-<date>.json
 * - Clears E2E residue
 * - Creates dictionary: roles (SE/开发/测试预留/交付管理), phases (设计/开发/测试/交付),
 *   project types (需求交付 + child 标准需求, [预留] buffers, 零星事项),
 *   resource templates (SE×设计 50%, 开发×开发 150%)
 * - Creates placeholder people: 1 主管(登录身份) + 2 SE + 8 开发
 * - Mounts capacity buffers: 问题单 30% (开发), 项目事务 25% (SE+开发)
 * - Creates 3 virtual demand projects with demo assignments
 *
 * Idempotency: re-running skips entities that already exist (matched by name).
 * Usage: node scripts/configure-step0.mjs [--api http://localhost:3110]
 */
const API = process.argv.includes('--api')
  ? process.argv[process.argv.indexOf('--api') + 1]
  : 'http://localhost:3110/api';
const BACKUP_FILE = `docs/e2e-data-backup-${new Date().toISOString().slice(0, 10)}.json`;

const log = (...a) => console.log('[step0]', ...a);

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}
const unwrap = (d) => (Array.isArray(d) ? d : (d?.data && Array.isArray(d.data) ? d.data : (Array.isArray(d?.data?.data) ? d.data.data : d?.data ?? d)));

async function listAll(path) {
  try { return unwrap(await req('GET', path)) ?? []; } catch (e) { log(`GET ${path} failed: ${e.message}`); return []; }
}

async function main() {
  // ---------------------------------------------------------------- cleanup
  log('backing up current data to', BACKUP_FILE);
  const backup = {};
  for (const key of ['roles', 'phases', 'project-types', 'people', 'projects', 'locations', 'assignments', 'scenarios']) {
    backup[key] = await listAll(`/${key}`);
  }
  const fs = await import('node:fs');
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));

  log('clearing E2E residue...');
  for (const a of backup.assignments ?? []) { try { await req('DELETE', `/assignments/${a.id}`); } catch {} }
  for (const p of backup.projects ?? []) { try { await req('DELETE', `/projects/${p.id}`); } catch {} }
  for (const person of backup.people ?? []) { try { await req('DELETE', `/people/${person.id}`); } catch {} }
  // child types first
  const types = backup['project-types'] ?? [];
  for (const t of types.filter((x) => x.parent_type_id)) { try { await req('DELETE', `/project-types/${t.id}`); } catch {} }
  for (const t of types.filter((x) => !x.parent_type_id)) { try { await req('DELETE', `/project-types/${t.id}`); } catch {} }
  for (const r of backup.roles ?? []) { try { await req('DELETE', `/roles/${r.id}`); } catch {} }
  for (const ph of backup.phases ?? []) { try { await req('DELETE', `/phases/${ph.id}`); } catch {} }
  for (const l of backup.locations ?? []) { try { await req('DELETE', `/locations/${l.id}`); } catch {} }
  // ensure exactly one baseline scenario exists (no renames — avoid fragile 404 paths)
  const scenarios = backup.scenarios ?? [];
  if (scenarios.length > 0) {
    const baseline = scenarios.find((s) => s.scenario_type === 'baseline') ?? scenarios[0];
    for (const s of scenarios) {
      if (s.id !== baseline.id) { try { await req('DELETE', `/scenarios/${s.id}`); } catch {} }
    }
  }
  // baseline scenario is ensured after people exist (needs created_by)

  // ---------------------------------------------------------------- dictionary
  const ensureRole = async (name, description) => {
    const existing = (await listAll('/roles')).find((r) => r.name === name);
    if (existing) return existing;
    await req('POST', '/roles', { name, description });
    return (await listAll('/roles')).find((r) => r.name === name);
  };
  const roleSE = await ensureRole('SE', '需求分析+方案设计(全包)');
  const roleDev = await ensureRole('开发', '开发工程师');
  await ensureRole('测试', '预留角色:独立测试人力,不在本系统跟踪消耗,阶段配比保持 0');
  await ensureRole('交付管理', '人力主管登录身份,不参与产能统计');

  const ensurePhase = async (name, orderIndex) => {
    const existing = (await listAll('/phases')).find((p) => p.name === name);
    if (existing) return existing;
    await req('POST', '/phases', { name, order_index: orderIndex });
    return (await listAll('/phases')).find((p) => p.name === name);
  };
  const phDesign = await ensurePhase('设计', 1);
  const phDev = await ensurePhase('开发', 2);
  await ensurePhase('测试', 3);
  await ensurePhase('交付', 4);

  const existingLocations = await listAll('/locations');
  let locHQ = existingLocations.find((l) => l.name === '总部');
  if (!locHQ) {
    await req('POST', '/locations', { name: '总部', description: '默认地点(占位)' });
    locHQ = (await listAll('/locations')).find((l) => l.name === '总部');
  }

  const ensureType = async (name, parentId) => {
    const match = (t) => t.name === name && (t.parent_id ?? t.parent_type_id ?? null) === (parentId ?? null);
    const existing = (await listAll('/project-types')).find(match);
    if (existing) return existing;
    await req('POST', parentId ? `/project-type-hierarchy/${parentId}/children` : '/project-types',
      { name, description: name.startsWith('[预留]') ? '容量预留常驻条目(非业务需求)' : '' });
    return (await listAll('/project-types')).find(match);
  };
  const typeDemand = await ensureType('需求交付');
  const typeStd = await ensureType('标准需求', typeDemand.id);
  const typeTickets = await ensureType('[预留] 问题单支持');
  const typeAffairs = await ensureType('[预留] 项目事务');
  const typeMisc = await ensureType('零星事项');

  // project_sub_types: what projects actually reference (belongs to the PARENT type)
  const ensureSubType = async (name, parentTypeId) => {
    const subs = await listAll(`/project-sub-types?project_type_id=${parentTypeId}`);
    const existing = (subs ?? []).find((t) => t.name === name);
    if (existing) return existing;
    await req('POST', '/project-sub-types', { project_type_id: parentTypeId, name, description: name });
    return (await listAll(`/project-sub-types?project_type_id=${parentTypeId}`)).find((t) => t.name === name);
  };
  const subStd = await ensureSubType('标准需求', typeDemand.id);
  const subTickets = await ensureSubType('问题单池', typeTickets.id);
  const subAffairs = await ensureSubType('日常事务', typeAffairs.id);
  await ensureSubType('零星记录', typeMisc.id);

  // phase template on the parent type (skip if already attached)
  const attachPhase = async (phaseId, orderIndex) => {
    try {
      await req('POST', `/project-type-hierarchy/${typeDemand.id}/phases`, { phaseId, orderIndex });
      log(`phase attached order=${orderIndex}`);
    } catch (e) { if (e.status !== 409 && e.status !== 400) throw e; }
  };
  await attachPhase(phDesign.id, 1);
  await attachPhase(phDev.id, 2);

  // resource templates live on the child type: SE×设计 50%, 开发×开发 150% (测试/交付零配比)
  const ensureTemplate = async (phaseId, roleId, pct) => {
    const existing = (await listAll(`/resource-templates?project_type_id=${typeStd.id}`))
      .find((t) => t.phase_id === phaseId && t.role_id === roleId);
    if (existing) return existing;
    return req('POST', '/resource-templates', {
      project_type_id: typeStd.id, phase_id: phaseId, role_id: roleId, allocation_percentage: pct,
    });
  };
  await ensureTemplate(phDesign.id, roleSE.id, 50);
  await ensureTemplate(phDev.id, roleDev.id, 150);
  void subTickets; void subAffairs;

  // ---------------------------------------------------------------- people
  const ensurePerson = async (name, roleId) => {
    const existing = (await listAll('/people')).find((p) => p.name === name);
    if (existing) return existing;
    await req('POST', '/people', {
      name, email: `${encodeURIComponent(name)}@placeholder.local`,
      location_id: locHQ.id, worker_type: 'FTE',
      default_availability_percentage: 100, default_hours_per_day: 8,
    });
    const created = (await listAll('/people')).find((p) => p.name === name);
    await req('POST', `/people/${created.id}/roles`, { role_id: roleId, is_primary: true, proficiency_level: 4 });
    return created;
  };

  const mgr = await ensurePerson('陈主管', (await listAll('/roles')).find((r) => r.name === '交付管理').id);
  const se1 = await ensurePerson('沈设计', roleSE.id);
  const se2 = await ensurePerson('韩架构', roleSE.id);
  const devNames = ['王开发', '李后端', '张前端', '赵全栈', '钱后端', '孙前端', '周开发', '吴开发'];
  const devs = [];
  for (const n of devNames) devs.push(await ensurePerson(n, roleDev.id));
  const pid = (p) => p.id ?? p.data?.id;

  // ensure THE fixed-ID baseline scenario exists — the server falls back to this
  // id ('baseline-0000-...') when no X-Scenario-Id header is sent, so the row
  // with this exact id must exist (restores the seeded invariant).
  {
    const FIXED = 'baseline-0000-0000-0000-000000000000';
    const live = (await listAll('/scenarios')) ?? [];
    for (const sc of live) {
      if (sc.id !== FIXED) { try { await req('DELETE', `/scenarios/${sc.id}`); } catch {} }
    }
    if (!live.some((sc) => sc.id === FIXED)) {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database('data/capacinator.db');
      db.prepare(`INSERT INTO scenarios (id, name, description, scenario_type, status, created_by, created_at, updated_at)
                  VALUES (?, '基线', '正式计划', 'baseline', 'active', ?, ?, ?)`)
        .run(FIXED, pid(mgr), Date.now(), Date.now());
      db.close();
      log('fixed-id baseline scenario restored');
    }
  }

  // ---------------------------------------------------------------- projects + buffers
  const ensureProject = async (name, typeId, extra = {}) => {
    const existing = (await listAll('/projects')).find((p) => p.name === name);
    if (existing) return existing;
    const { parentTypeId, status: _skip, ...rest } = extra;
    await req('POST', '/projects', {
      name, project_type_id: parentTypeId ?? typeId, project_sub_type_id: typeId, location_id: locHQ.id,
      priority: 2, include_in_demand: true, ...rest,
    });
    return (await listAll('/projects')).find((p) => p.name === name);
  };
  const typeByName = async (n) => (await listAll('/project-types')).find((t) => t.name === n);

  const pTickets = await ensureProject('[预留] 问题单支持', subTickets.id, { priority: 3, parentTypeId: typeTickets.id, description: '常驻容量预留:按月看单量调整比例' });
  const pAffairs = await ensureProject('[预留] 项目事务', subAffairs.id, { priority: 3, parentTypeId: typeAffairs.id, description: '常驻容量预留:会议/评审/支持' });
  const pPortal = await ensureProject('客户门户改版', subStd.id, { priority: 1, parentTypeId: typeDemand.id, description: '虚拟高优需求:演示 SE 设计 + 开发投入' });
  const pData = await ensureProject('数据平台升级', subStd.id, { priority: 2, parentTypeId: typeDemand.id, description: '虚拟中优需求:排队中' });
  await ensureProject('移动端改版', subStd.id, { priority: 3, parentTypeId: typeDemand.id, description: '虚拟低优需求:暂不排产' });

  // generate per-project demand from templates
  for (const p of [pPortal, pData]) {
    try { await req('POST', `/project-allocations/${pid(p)}/initialize`); } catch (e) { log(`alloc init ${p.name}: ${e.message}`); }
  }

  // ---------------------------------------------------------------- assignments
  const D = (s) => s; // dates are plain YYYY-MM-DD strings
  const existingAssignments = await listAll('/assignments');
  const ensureAssignment = async (project, person, role, pct, start, end, note) => {
    if (existingAssignments.some((a) => a.project_id === pid(project) && a.person_id === pid(person))) return;
    await req('POST', '/assignments', {
      project_id: pid(project), person_id: pid(person), role_id: role.id,
      allocation_percentage: pct, assignment_date_mode: 'fixed',
      start_date: D(start), end_date: D(end), notes: note ?? '',
    });
  };
  const RANGE = ['2026-10-01', '2026-12-31'];
  for (const d of devs) await ensureAssignment(pTickets, d, roleDev, 30, ...RANGE, '问题单预留(占位 30%,按月校准)');
  for (const p of [se1, se2, ...devs]) await ensureAssignment(pAffairs, p, p === se1 || p === se2 ? roleSE : roleDev, 25, ...RANGE, '事务预留(占位 25%)');

  // demo demand work: 李后端→105% (red), 王开发→95% (amber), 张前端→85%, SE1→75%
  await ensureAssignment(pPortal, se1, roleSE, 50, '2026-09-21', '2026-10-20', '门户设计');
  await ensureAssignment(pPortal, devs[0], roleDev, 40, '2026-10-01', '2026-11-30', '门户开发');
  await ensureAssignment(pPortal, devs[1], roleDev, 50, '2026-10-01', '2026-11-30', '门户开发(演示超负荷)');
  await ensureAssignment(pData, se2, roleSE, 30, '2026-10-01', '2026-11-15', '平台设计');
  await ensureAssignment(pData, devs[2], roleDev, 30, '2026-11-01', '2026-12-15', '前端支持');

  // ---------------------------------------------------------------- summary
  const people = await listAll('/people');
  const assignments = await listAll('/assignments');
  log('DONE ✓');
  log(`people=${people.length} (期望 11) assignments=${assignments.length} (期望 ${8 + 10 + 5})`);
  const byPerson = {};
  for (const a of assignments) byPerson[a.person_id] = (byPerson[a.person_id] ?? 0) + (a.allocation_percentage ?? 0);
  const util = people.map((p) => `${p.name}:${byPerson[p.id] ?? 0}%`).join('  ');
  log('utilization:', util);
}

main().catch((e) => { console.error('[step0] FAILED:', e); process.exit(1); });
