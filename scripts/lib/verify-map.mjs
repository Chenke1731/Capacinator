/**
 * Change-to-check map for `scripts/verify-tier.mjs` (I19c).
 *
 * Every page under client/src/pages must have an entry here (the map guard
 * `scripts/check-verify-map.mjs` enforces it). Entries may explicitly say
 * `no-profile` / `no-e2e` with a reason; silence is not allowed.
 */

const E2E = 'tests/e2e/suites';

export const pageEntries = {
  Dashboard: { profiles: ['dashboard', 'dashboard-1366'], e2e: [`${E2E}/features/dashboard/dashboard-charts.spec.ts`] },
  Projects: { profiles: ['projects'], e2e: [`${E2E}/core/navigation.spec.ts`] },
  ProjectsUnified: { profiles: ['projects'], e2e: [`${E2E}/core/navigation.spec.ts`] },
  ProjectDetail: { profiles: ['project-detail', 'project-detail-phases', 'project-detail-tagged'], e2e: [], reason: 'no dedicated project-detail spec' },
  ProjectNew: { profiles: [], e2e: [], reason: 'form covered by component tests; no dedicated e2e' },
  ProjectRoadmap: { profiles: ['roadmap'], e2e: [] },
  ProjectTypes: { profiles: ['project-types', 'project-types-1366', 'project-types-hierarchy'], e2e: [] },
  ProjectTypeDetails: { profiles: ['project-type-detail', 'phase-template'], e2e: [] },
  Iterations: { profiles: ['iterations', 'iterations-1366'], e2e: [] },
  People: { profiles: ['people', 'people-1366'], e2e: [`${E2E}/crud/people.spec.ts`] },
  PeopleUnified: { profiles: ['people', 'people-1366'], e2e: [`${E2E}/crud/people.spec.ts`] },
  PersonDetails: { profiles: ['person-detail'], e2e: [`${E2E}/integration/person-details-theme.spec.ts`, `${E2E}/crud/people.spec.ts`] },
  PersonNew: { profiles: [], e2e: [`${E2E}/crud/people.spec.ts`], reason: 'create flow covered by CRUD people spec' },
  PersonWorkload: { profiles: ['person-workload'], e2e: [`${E2E}/integration/person-workload.spec.ts`] },
  Availability: { profiles: ['people-availability'], e2e: [`${E2E}/tables/people-availability.spec.ts`] },
  Assignments: { profiles: ['assignments', 'assignments-1366'], e2e: [`${E2E}/crud/assignments.spec.ts`, `${E2E}/tables/assignment-inline-editing.spec.ts`, `${E2E}/integration/assignment-workflows.spec.ts`] },
  Scenarios: { profiles: ['scenarios', 'scenarios-1366', 'scenarios-rich'], e2e: [`${E2E}/scenarios/basic-operations.spec.ts`, `${E2E}/scenarios/scenario-comparison.spec.ts`, `${E2E}/scenarios/data-integrity.spec.ts`] },
  ReportsUnified: { profiles: ['reports', 'reports-1366', 'reports-capacity', 'reports-gaps', 'reports-utilization'], e2e: [`${E2E}/reports/capacity-report-accuracy.spec.ts`, `${E2E}/reports/demand-report-accuracy.spec.ts`, `${E2E}/reports/gaps-analysis-accuracy.spec.ts`, `${E2E}/reports/utilization-report-accuracy.spec.ts`] },
  ReportsTabContent: { profiles: ['reports', 'reports-1366', 'reports-capacity', 'reports-gaps', 'reports-utilization'], e2e: [`${E2E}/reports/capacity-report-accuracy.spec.ts`, `${E2E}/reports/demand-report-accuracy.spec.ts`, `${E2E}/reports/gaps-analysis-accuracy.spec.ts`, `${E2E}/reports/utilization-report-accuracy.spec.ts`] },
  Settings: { profiles: ['settings', 'settings-1366', 'settings-appearance'], e2e: [`${E2E}/tables/settings-permissions.spec.ts`] },
  Components: { profiles: ['components'], e2e: [] },
  ImportUnified: { profiles: ['import', 'import-export'], e2e: [`${E2E}/features/import-export/complex-import-scenarios.spec.ts`, `${E2E}/features/import-export/export-scenario.spec.ts`] },
  Locations: { profiles: ['locations'], e2e: [] },
  AuditLog: { profiles: ['audit-log'], e2e: [] },
  Roles: { profiles: [], e2e: [`${E2E}/crud/roles.spec.ts`], reason: 'list page; detail is RoleDetails' },
  RoleDetails: { profiles: ['role-detail'], e2e: [`${E2E}/crud/role-details.spec.ts`] },
  IntakeInbox: { profiles: ['intake', 'intake-1366'], e2e: [], reason: 'component/API coverage; no active e2e spec' },
  AffairsBoard: { profiles: [], e2e: [], reason: 'component-only board rendered by Projects' },
  TicketsBoard: { profiles: [], e2e: [], reason: 'component-only board rendered by Projects' },
};

/** Every profile in scripts/lib/ui-profiles.mjs must have a page owner. */
export const profileOwners = {
  assignments: 'Assignments',
  'assignments-1366': 'Assignments',
  'audit-log': 'AuditLog',
  components: 'Components',
  dashboard: 'Dashboard',
  'dashboard-1366': 'Dashboard',
  import: 'ImportUnified',
  'import-export': 'ImportUnified',
  intake: 'IntakeInbox',
  'intake-1366': 'IntakeInbox',
  iterations: 'Iterations',
  'iterations-1366': 'Iterations',
  locations: 'Locations',
  people: 'PeopleUnified',
  'people-1366': 'PeopleUnified',
  'people-availability': 'Availability',
  'person-detail': 'PersonDetails',
  'person-workload': 'PersonWorkload',
  'phase-template': 'ProjectTypeDetails',
  'project-detail': 'ProjectDetail',
  'project-detail-phases': 'ProjectDetail',
  'project-detail-tagged': 'ProjectDetail',
  'project-type-detail': 'ProjectTypeDetails',
  'project-types': 'ProjectTypes',
  'project-types-1366': 'ProjectTypes',
  'project-types-hierarchy': 'ProjectTypes',
  projects: 'ProjectsUnified',
  reports: 'ReportsUnified',
  'reports-1366': 'ReportsUnified',
  'reports-capacity': 'ReportsUnified',
  'reports-gaps': 'ReportsUnified',
  'reports-utilization': 'ReportsUnified',
  roadmap: 'ProjectRoadmap',
  'role-detail': 'RoleDetails',
  scenarios: 'Scenarios',
  'scenarios-1366': 'Scenarios',
  'scenarios-rich': 'Scenarios',
  settings: 'Settings',
  'settings-1366': 'Settings',
  'settings-appearance': 'Settings',
};

const WORKLOAD_PROFILES = ['person-workload'];
const INTAKE_PROFILES = ['intake', 'intake-1366'];

export const U4_PAGE_IDS = ['people', 'assignments', 'projects', 'reports', 'dashboard'];
const U4_PROFILE_ALIASES = {
  'people-1366': 'people',
  'assignments-1366': 'assignments',
  'dashboard-1366': 'dashboard',
  'reports-1366': 'reports',
  'reports-capacity': 'reports',
  'reports-gaps': 'reports',
  'reports-utilization': 'reports',
};

/** Map UI profiles (including viewport/report-tab variants) onto the U4 page matrix. */
export function u4PagesFor(profiles, wide = false) {
  if (wide) return [...U4_PAGE_IDS];
  return [...new Set(profiles.map((profile) => U4_PROFILE_ALIASES[profile] ?? profile).filter((profile) => U4_PAGE_IDS.includes(profile)))];
}

const base = () => ({
  clientTests: [],
  serverTests: [],
  integrationTests: [],
  profiles: [],
  e2e: [],
  eslintFiles: [],
  wide: false,
  full: false,
  reasons: [],
});

const uniq = (items) => [...new Set(items)];

/** Classify one changed path. Throws for a genuinely unknown top-level path. */
export function classifyChangedFile(file) {
  const p = file.replace(/\\/g, '/');
  const out = base();
  out.reasons.push(p);

  if (p === 'package.json' || p === 'package-lock.json' || p === 'pnpm-lock.yaml') {
    out.full = true;
    out.reasons.push('dependency manifest');
    return out;
  }

  if (p.startsWith('client/src/pages/')) {
    const basename = p.split('/').pop().replace(/\.(tsx?|css)$/, '');
    const entry = pageEntries[basename];
    if (!entry) throw new Error(`Unmapped page: ${p} (add it to scripts/lib/verify-map.mjs pageEntries)`);
    out.clientTests.push(p);
    out.eslintFiles.push(p);
    out.profiles.push(...(entry.profiles ?? []));
    out.e2e.push(...(entry.e2e ?? []));
    if (entry.reason) out.reasons.push(entry.reason);
    return out;
  }

  if (p.startsWith('client/src/components/workload/')) {
    out.clientTests.push(p);
    out.eslintFiles.push(p);
    out.profiles.push(...WORKLOAD_PROFILES);
    return out;
  }
  if (p.startsWith('client/src/components/intake/')) {
    out.clientTests.push(p);
    out.eslintFiles.push(p);
    out.profiles.push(...INTAKE_PROFILES);
    return out;
  }
  if (
    p.startsWith('client/src/components/ui/') ||
    p.startsWith('client/src/styles/') ||
    p.startsWith('client/src/i18n/') ||
    p === 'client/src/index.css' ||
    p === 'client/src/App.css' ||
    p === 'client/src/App.tsx'
  ) {
    out.clientTests.push(p);
    out.eslintFiles.push(p);
    out.wide = true;
    out.reasons.push('global UI surface → full state matrix');
    return out;
  }
  if (p.startsWith('client/src/components/')) {
    out.clientTests.push(p);
    out.eslintFiles.push(p);
    out.wide = true;
    out.reasons.push('component without a profile hint → escalate to T1 full states');
    return out;
  }
  if (p.startsWith('client/src/')) {
    out.clientTests.push(p);
    out.eslintFiles.push(p);
    return out;
  }

  if (p.startsWith('shared/')) {
    out.clientTests.push(p);
    out.serverTests.push(p);
    out.eslintFiles.push(p);
    return out;
  }

  if (p.startsWith('src/server/database/') || p.startsWith('migrations/')) {
    out.serverTests.push(p);
    out.integrationTests.push(p);
    out.eslintFiles.push(p);
    return out;
  }
  if (p.startsWith('src/server/') || p === 'src/server/index.ts') {
    out.serverTests.push(p);
    out.eslintFiles.push(p);
    return out;
  }

  if (p.startsWith('tests/unit/client/')) {
    out.clientTests.push(p);
    return out;
  }
  if (p.startsWith('tests/unit/server/') || p.startsWith('tests/unit/meta/')) {
    out.serverTests.push(p);
    return out;
  }
  if (p.startsWith('tests/integration/')) {
    out.integrationTests.push(p);
    return out;
  }
  if (p.startsWith('tests/e2e/')) {
    out.e2e.push(p);
    return out;
  }

  if (
    p.startsWith('scripts/') ||
    p.startsWith('docs/') ||
    p.startsWith('.zcode/') ||
    p.startsWith('tests/visual/') ||
    p.startsWith('tmp/') ||
    p.startsWith('test-results/') ||
    p.startsWith('dist/') ||
    p.startsWith('dist-client/') ||
    p.startsWith('dist-electron/') ||
    p.startsWith('.e2e-data/') ||
    p.startsWith('.githooks/') ||
    p.startsWith('.github/') ||
    p.startsWith('security/') ||
    p.startsWith('ssl/') ||
    p.startsWith('.env') ||
    p === 'gitleaks.toml' ||
    p === '.gitleaksignore' ||
    p === '.nvmrc' ||
    p === 'tsconfig.client.json' ||
    p === '.gitignore' ||
    p === 'CLAUDE.md' ||
    p === 'AGENTS.md'
  ) {
    out.reasons.push('meta/tooling file');
    return out;
  }

  throw new Error(`Unmapped path: ${p} (add it to scripts/lib/verify-map.mjs)`);
}

export function classifyFiles(files) {
  const merged = base();
  const mergedReasons = [];
  for (const file of files) {
    const one = classifyChangedFile(file);
    for (const key of ['clientTests', 'serverTests', 'integrationTests', 'profiles', 'e2e', 'eslintFiles']) {
      merged[key].push(...one[key]);
    }
    merged.wide ||= one.wide;
    merged.full ||= one.full;
    mergedReasons.push(...one.reasons);
  }
  for (const key of ['clientTests', 'serverTests', 'integrationTests', 'profiles', 'e2e', 'eslintFiles']) {
    merged[key] = uniq(merged[key]);
  }
  merged.reasons = uniq(mergedReasons);
  return merged;
}

/** Self-test used by verify-tier --self-test and the map guard. */
export function selfTest() {
  const batch = classifyChangedFile('client/src/lib/batchShift.ts');
  if (!batch.clientTests.includes('client/src/lib/batchShift.ts') || batch.profiles.length) {
    throw new Error('self-test failed: client/lib should map to client tests without profiles');
  }
  const page = classifyChangedFile('client/src/pages/PersonWorkload.tsx');
  if (!page.profiles.includes('person-workload')) throw new Error('self-test failed: PersonWorkload profile');
  if (!page.e2e.some((s) => s.includes('person-workload'))) throw new Error('self-test failed: PersonWorkload e2e');
  const shared = classifyChangedFile('shared/types/index.ts');
  if (!shared.clientTests.length || !shared.serverTests.length) throw new Error('self-test failed: shared must map to both sides');
  const workloadComponent = classifyChangedFile('client/src/components/workload/WorkloadGantt.tsx');
  if (!workloadComponent.profiles.includes('person-workload')) throw new Error('self-test failed: workload component');
  const globalCss = classifyChangedFile('client/src/index.css');
  if (!globalCss.wide) throw new Error('self-test failed: global CSS must escalate');
  if (u4PagesFor(['reports-1366', 'reports-capacity']).join(',') !== 'reports') {
    throw new Error('self-test failed: report profile variants must collapse to one U4 page');
  }
  if (u4PagesFor(['person-workload']).length !== 0) throw new Error('self-test failed: non-U4 pages must not map');
  if (u4PagesFor([], true).length !== U4_PAGE_IDS.length) throw new Error('self-test failed: wide changes must map all U4 pages');
  const userConfig = classifyChangedFile('.zcode/config.json');
  if (userConfig.clientTests.length || userConfig.profiles.length || userConfig.wide) {
    throw new Error('self-test failed: .zcode is user/tooling metadata and must not map to UI gates');
  }
  let threw = false;
  try { classifyChangedFile('unknown-root/thing.ts'); } catch { threw = true; }
  if (!threw) throw new Error('self-test failed: unknown path must throw');
  for (const pageName of Object.keys(pageEntries)) {
    const entry = pageEntries[pageName];
    if ((!entry.profiles || entry.profiles.length === 0) && !entry.reason) {
      throw new Error(`self-test failed: ${pageName} has neither profiles nor reason`);
    }
  }
  console.log(`✓ verify-map self-test passed (${Object.keys(pageEntries).length} pages, ${Object.keys(profileOwners).length} profiles)`);
}
