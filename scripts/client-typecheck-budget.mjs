// D7 客户端类型债基线(2026-09-23 首测 580): 只降不升,增量治理同 axe-budget 模式
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BUDGET_FILE = 'tests/visual/client-type-budget.json';
let budget;
try { budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).errors; }
catch { budget = 580; }

let count = 0;
try {
  const out = execSync('npx tsc --noEmit -p tsconfig.client.json 2>&1', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  count = (out.match(/error TS/g) || []).length;
} catch (e) {
  count = ((e.stdout || '').match(/error TS/g) || []).length;
}

if (count > budget) {
  console.error(`FAIL 客户端类型错误 ${count} > 基线 ${budget}(修复须同步降基线)`);
  process.exit(1);
}
if (count < budget) {
  writeFileSync(BUDGET_FILE, JSON.stringify({ errors: count, note: '只降不升;降到 0 后此脚本改为硬门禁', updated: new Date().toISOString() }, null, 2) + '\n');
  console.log(`PASS ${count} ≤ 基线 ${budget},基线已下调至 ${count}`);
} else {
  console.log(`PASS ${count} = 基线 ${budget}`);
}
