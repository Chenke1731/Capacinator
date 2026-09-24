// Migration immutability gate — committed migrations must never change.
// Edits to an already-run migration don't apply to existing databases
// (schema drift between old and new installs; incident: 024 号 migration
// 曾被追加逻辑). Pure additions (A) are allowed; M/D/R are blocked.
import { execSync } from 'node:child_process';

const MIGRATION_DIR = 'src/server/database/migrations/';

let staged;
try {
  staged = execSync('git diff --cached --name-status', { encoding: 'utf8' });
} catch {
  process.exit(0); // not a git staging context — nothing to guard
}

const violations = [];
for (const line of staged.split('\n').filter(Boolean)) {
  const cols = line.split('\t');
  const status = cols[0];
  const paths = cols.slice(1);
  const migrationPaths = paths.filter((p) => p.startsWith(MIGRATION_DIR));
  if (migrationPaths.length === 0) continue;

  // A new migration file is always fine (all listed paths are additions)
  const isPureAddition = status.startsWith('A') && migrationPaths.length === paths.length;
  if (!isPureAddition) violations.push(line);
}

if (violations.length > 0) {
  console.error('FAIL migration immutability — committed migrations must not be modified/deleted/renamed:');
  violations.forEach((v) => console.error('  ' + v));
  console.error('Create a NEW migration instead: npm run db:migrate:make <name>');
  process.exit(1);
}
console.log('✓ migrations untouched');
