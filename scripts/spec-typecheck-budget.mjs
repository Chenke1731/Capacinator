// Spec typecheck budget (design §4 L0): same pattern as client budget.
// Zero-tolerance for TS2304/TS2552 (cannot-find-name = runtime mines).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BUDGET_FILE = 'tests/visual/spec-type-budget.json';
let budget;
try { budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).errors; }
catch { budget = 234; }

let out = '';
try {
  out = execSync('npx tsc --noEmit -p tsconfig.spec.json 2>&1', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}
const count = (out.match(/error TS/g) || []).length;

const mines = out
  .split('\n')
  .filter(l => /error TS(2304|2552):/.test(l))
  .filter(l => !l.includes('__tests__'));
if (mines.length > 0) {
  console.error(`FAIL spec cannot-find-name — runtime mines, zero tolerance (${mines.length}):`);
  mines.forEach(l => console.error('  ' + l));
  process.exit(1);
}

if (count > budget) {
  console.error(`FAIL spec type errors ${count} > 基线 ${budget}`);
  process.exit(1);
}
if (count < budget) {
  writeFileSync(BUDGET_FILE, JSON.stringify({ errors: count, note: '只降不升', updated: new Date().toISOString() }, null, 2) + '\n');
  console.log(`PASS ${count} ≤ 基线 ${budget}, 基线已下调至 ${count}`);
} else {
  console.log(`PASS ${count} = 基线 ${budget}`);
}
