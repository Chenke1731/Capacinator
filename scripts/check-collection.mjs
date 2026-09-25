// Collection guard (design §5.1): per-config EXACT counts + archived-zero.
// Drift in EITHER direction is red — a minimum-only floor would have blessed
// the archived zombies (anchored at zombie-inclusive 76); exact anchoring is
// what exposes them. "0 tests green" and "zombie resurrection" both die here.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FLOOR_FILE = 'tests/e2e/.collection-floor.json';
const CONFIGS = {
  main: 'playwright.config.ts',
  scenario: 'playwright.scenario.config.ts',
};

let expected;
try {
  expected = JSON.parse(readFileSync(FLOOR_FILE, 'utf8'));
} catch {
  console.error(`FAIL cannot read ${FLOOR_FILE}`);
  process.exit(1);
}

let failed = false;
for (const [name, config] of Object.entries(CONFIGS)) {
  const out = execSync(
    `npx playwright test --config=${config} --list 2>&1 || true`,
    { encoding: 'utf8' }
  );
  const m = out.match(/Total: (\d+) tests? in (\d+) files?/);
  const actual = m ? parseInt(m[1], 10) : 0;

  if (!(name in expected)) {
    console.error(`FAIL config "${name}" missing from ${FLOOR_FILE}`);
    failed = true;
    continue;
  }
  if (actual !== expected[name]) {
    console.error(`FAIL ${name}: collected ${actual}, expected exactly ${expected[name]} — drift in either direction is a ledger break (zombies in or tests lost)`);
    failed = true;
  } else {
    console.log(`OK ${name}: ${actual} tests (exact)`);
  }

  // archived-zero: no config may collect anything under archived/
  const archivedHits = out.split('\n').filter(l => l.includes('› archived/'));
  if (archivedHits.length > 0) {
    console.error(`FAIL ${name}: collected ${archivedHits.length} test(s) from archived/ (zombies):`);
    archivedHits.slice(0, 5).forEach(l => console.error('  ' + l.trim()));
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('✅ collection ledger intact');
