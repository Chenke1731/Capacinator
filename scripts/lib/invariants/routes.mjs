/**
 * Route inventory for verify-invariants.
 *
 * The curated list is intentionally explicit: verify-map.pageEntries is the
 * source of truth for "which page owns which profiles", while this list adds
 * the handful of list/tab routes that have no visual profile yet.
 *
 * Detail routes (2026-11-20): static-ID detail pages read `path` straight from
 * the profiles table (IDs stay single-sourced there). `:audit-id` entity routes
 * carry a `profile` field instead — the runner resolves the real ID via
 * resolveProfile at runtime. Entity profiles never declare their own fixture,
 * so resolution cannot switch the process-wide fixture scene mid-run (unlike
 * person-workload/scenarios-rich, whose static paths are used verbatim here).
 * project-detail-phases resolves onto the same page as project-detail, adding
 * nothing to whole-page U1/U3 measurement, so it deliberately has no entry.
 */
import { spawnSync } from 'node:child_process';
import { profiles } from '../ui-profiles.mjs';
import { pageEntries } from '../verify-map.mjs';

export const curatedRoutes = [
  { id: 'dashboard', path: '/dashboard', ready: '.stats-grid' },
  { id: 'projects', path: '/projects', ready: '[data-testid="requirements-table"]' },
  { id: 'projects-intake', path: '/projects?tab=intake', ready: 'table.intake-table' },
  { id: 'project-types', path: '/projects?tab=types', ready: '.view-mode-toggle' },
  { id: 'project-types-hierarchy', path: '/projects?tab=types&view=hierarchy', ready: '.hierarchy-view' },
  { id: 'project-type-detail', profile: 'project-type-detail', ready: '.project-type-header' },
  { id: 'phase-template', profile: 'phase-template', ready: '.phases-table' },
  { id: 'project-roadmap', path: '/projects?tab=roadmap', ready: '.interactive-timeline' },
  { id: 'project-detail', path: '/projects/project-1789912193111-zikdnz8c5', ready: '.chart-container .chart-tab' },
  { id: 'project-detail-tagged', path: profiles['project-detail-tagged'].path, ready: '.tag-badge' },
  { id: 'iterations', path: '/iterations', ready: '.it-card-head' },
  { id: 'people', path: '/people', ready: 'table' },
  { id: 'roles', path: '/people?tab=roles', ready: 'table' },
  { id: 'role-detail', path: profiles['role-detail'].path, ready: '.role-content' },
  { id: 'availability', path: '/people?tab=availability', ready: '.calendar-view' },
  { id: 'availability-list', path: '/people?tab=availability&view=list', ready: 'table' },
  { id: 'person-detail', path: '/people/eb8ecaf7-44a3-4384-a74b-2c18e9e894b1', ready: '.person-details-content' },
  { id: 'person-workload', path: profiles['person-workload'].path, ready: '[data-testid="pw-total"]' },
  { id: 'assignments', path: '/assignments', ready: 'table' },
  { id: 'scenarios', path: '/scenarios', ready: '.hierarchy-row' },
  { id: 'reports', path: '/reports', ready: '.page-header' },
  { id: 'reports-capacity', path: '/reports?tab=capacity', ready: '.page-header' },
  { id: 'reports-utilization', path: '/reports?tab=utilization', ready: '.page-header' },
  { id: 'reports-gaps', path: '/reports?tab=gaps', ready: '.page-header' },
  { id: 'audit-log', path: '/audit-log', ready: '.audit-stats' },
  { id: 'locations', path: '/locations', ready: 'table' },
  { id: 'settings', path: '/settings', ready: '.settings-section' },
  { id: 'import', path: '/import', ready: '.import-card' },
  { id: 'components', path: '/components', ready: 'table' },
];

const uniqueByPath = (routes) => {
  const seen = new Set();
  return routes.filter((route) => {
    const key = route?.path ?? (route?.profile ? `@${route.profile}` : '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function routesForProfiles(names) {
  return names.flatMap((name) => {
    const profile = profiles[name];
    if (!profile?.path) return [];
    // Entity routes keep a profile reference; the runner swaps in the resolved
    // ID (static paths never need resolution and must not trigger it — see the
    // header comment about fixture-scene switching).
    if (profile.path.includes(':')) return [{ id: name, profile: name, ready: profile.ready }];
    return [{ id: name, path: profile.path, ready: profile.ready }];
  });
}

function changedFiles() {
  const run = (args) => {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  };
  const all = new Set([
    ...run(['diff', '--name-only']),
    ...run(['diff', '--cached', '--name-only']),
    ...run(['ls-files', '--others', '--exclude-standard']),
  ]);
  return [...all];
}

const PAGE_ROUTE_HINTS = {
  Roles: '/people?tab=roles',
};

function routesForChangedFiles(files) {
  const routes = [];
  let global = false;
  for (const file of files) {
    if (!file.startsWith('client/src/')) continue;
    if (
      file.startsWith('client/src/components/ui/') ||
      file.startsWith('client/src/styles/') ||
      file === 'client/src/index.css' ||
      file === 'client/src/App.css' ||
      file === 'client/src/App.tsx'
    ) {
      global = true;
      continue;
    }
    const basename = file.split('/').pop().replace(/\.(tsx?|css)$/, '');
    if (PAGE_ROUTE_HINTS[basename]) {
      routes.push({ id: basename, path: PAGE_ROUTE_HINTS[basename] });
      continue;
    }
    const entry = pageEntries[basename];
    if (!entry) {
      global = true;
      continue;
    }
    routes.push(...routesForProfiles(entry.profiles ?? []));
  }
  return global ? curatedRoutes : uniqueByPath(routes);
}

export function resolveRoutes({ changed = false, files = [], all = false, route, profile } = {}) {
  if (route) return uniqueByPath([{ id: route, path: route }]);
  if (profile) {
    const routes = routesForProfiles([profile]);
    if (!routes.length) throw new Error(`Profile has no static route: ${profile}`);
    return uniqueByPath(routes);
  }
  if (files.length) {
    const routes = routesForChangedFiles(files);
    return routes.length ? uniqueByPath(routes) : curatedRoutes;
  }
  if (changed) {
    const changedList = changedFiles();
    const routes = routesForChangedFiles(changedList);
    return routes.length ? uniqueByPath(routes) : curatedRoutes;
  }
  if (all) return curatedRoutes;
  return curatedRoutes;
}
