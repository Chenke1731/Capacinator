#!/usr/bin/env node
/**
 * 夜审 crontab 安装器（幂等）：默认每日 02:30 运行本地夜审，日志追加
 * tmp/audit-nightly.log。--remove 卸载；--hour H/--minute M 自定义时间。
 * 条目带标记行 `# capacinator-audit-nightly (auto)`，重复执行只替换不叠加。
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const remove = argv.includes('--remove');
const hour = argv.includes('--hour') ? argv[argv.indexOf('--hour') + 1] : '2';
const minute = argv.includes('--minute') ? argv[argv.indexOf('--minute') + 1] : '30';
const MARK = '# capacinator-audit-nightly (auto)';

const current = (() => {
  try { return execSync('crontab -l', { encoding: 'utf8' }); } catch { return ''; }
})();
const kept = current.split('\n').filter((line) => line.trim() && line.trim() !== MARK && !line.includes('scripts/audit-nightly.mjs'));
if (remove) {
  execSync('crontab -', { input: kept.length ? kept.join('\n') + '\n' : '' });
  console.log('✓ 已移除 capacinator 夜审 crontab 条目');
  process.exit(0);
}
const entry = `${minute} ${hour} * * * cd ${ROOT} && ${process.execPath} ${path.join(ROOT, 'scripts/audit-nightly.mjs')} >> ${path.join(ROOT, 'tmp/audit-nightly.log')} 2>&1`;
const next = [...kept, MARK, entry].join('\n') + '\n';
execSync('crontab -', { input: next });
console.log(`✓ 夜审 cron 已安装（每日 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}）`);
console.log(`  ${entry}`);
