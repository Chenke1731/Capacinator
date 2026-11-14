#!/usr/bin/env node
/**
 * Completeness guard for scripts/lib/verify-map.mjs (I19c).
 *
 * - every page under client/src/pages has an entry (profiles or explicit reason)
 * - every UI profile in ui-profiles.mjs has an owner page
 * - every e2e spec path referenced by the map exists
 * - verify-map's self-test passes
 *
 * This is the "new page cannot silently fall out of verification" gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageEntries, profileOwners, selfTest } from './lib/verify-map.mjs';
import { profiles } from './lib/ui-profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const pages = fs.readdirSync(path.join(ROOT, 'client/src/pages'))
  .filter((f) => f.endsWith('.tsx') && !f.startsWith('__'))
  .map((f) => f.replace(/\.tsx$/, ''));

for (const page of pages) {
  const entry = pageEntries[page];
  if (!entry) {
    errors.push(`page ${page} has no verify-map entry`);
    continue;
  }
  const hasProfiles = Array.isArray(entry.profiles) && entry.profiles.length > 0;
  if (!hasProfiles && !entry.reason) {
    errors.push(`page ${page} has no profiles and no reason`);
  }
}

for (const [profile, owner] of Object.entries(profileOwners)) {
  if (!profiles[profile]) errors.push(`profileOwners references unknown profile ${profile}`);
  if (!pageEntries[owner]) errors.push(`profile ${profile} owner page ${owner} is not in pageEntries`);
  else if (!(pageEntries[owner].profiles ?? []).includes(profile)) {
    errors.push(`profile ${profile} owner ${owner} does not list it`);
  }
}

for (const profile of Object.keys(profiles)) {
  if (!profileOwners[profile]) errors.push(`profile ${profile} has no owner in profileOwners`);
}

for (const [page, entry] of Object.entries(pageEntries)) {
  if (!pages.includes(page)) errors.push(`pageEntries has stale page ${page}`);
  for (const spec of entry.e2e ?? []) {
    if (!fs.existsSync(path.join(ROOT, spec))) errors.push(`page ${page} references missing e2e spec ${spec}`);
  }
}

try {
  selfTest();
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length) {
  console.error('✗ verify-map guard failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`✓ verify-map guard passed (${pages.length} pages, ${Object.keys(profiles).length} profiles, ${Object.keys(pageEntries).length} entries)`);
