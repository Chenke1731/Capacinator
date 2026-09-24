// D7 客户端类型债基线(2026-09-23 首测 580): 只降不升,增量治理同 axe-budget 模式
// 零容忍类(D13 教训 2026-09-24): TS2304/TS2552(cannot-find-name)在非测试代码里
// 是运行时雷不是风格债——ClipboardList 在错误堆里躺到 e2e 才炸出整页崩溃。
// 预算再宽松,这一类也必须清零(测试文件的 jsdom global 噪声除外)。
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BUDGET_FILE = 'tests/visual/client-type-budget.json';
let budget;
try { budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).errors; }
catch { budget = 580; }

let out = '';
let count = 0;
try {
  out = execSync('npx tsc --noEmit -p tsconfig.client.json 2>&1', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}
count = (out.match(/error TS/g) || []).length;

// 零容忍: 非测试文件的未定义名
const mines = out
  .split('\n')
  .filter(l => /error TS(2304|2552):/.test(l))
  .filter(l => !l.includes('__tests__'));
if (mines.length > 0) {
  console.error(`FAIL 非测试代码存在 ${mines.length} 处 cannot-find-name(运行时雷,零容忍):`);
  mines.forEach(l => console.error('  ' + l));
  process.exit(1);
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
