// Migration immutability gate — committed migrations must never change.
// Edits to an already-run migration don't apply to existing databases
// (schema drift between old and new installs; incident: 024 号 migration
// 曾被追加逻辑). Pure additions (A) are allowed; M/D/R are blocked.
// 例外(2026-10-13 裁决): 从未在任何库成功应用的迁移允许经显式名单删除——
// 铁律防的是"改历史造成新旧装分叉",从未应用过的坏迁移不构成分叉面;
// 保留它反而让所有新环境永久无法初始化。删除必须列名于此并写明依据。
import { execSync } from 'node:child_process';

const MIGRATION_DIR = 'src/server/database/migrations/';

// 显式删除豁免(每项必须附: 为何从未应用 + 删除依据)
const INTENTIONAL_REMOVALS = new Set([
  // 068 重复声明 people.is_active(002 重建 people 时已原生存在),ALTER 在
  // 任何库必炸 duplicate column;提交当日即删,零应用面。功能(停用机制)
  // 全链建于 002 原生列之上,不依赖此文件。
  '068_person_is_active.ts',
]);

// 显式修改豁免(每项必须附: 为何修改对已应用库零影响 + 修复的是什么)。
// 准入门槛比删除更严: 仅限"从未在任何生产路径应用 + 已应用库按名记录
// 不重放 + 修改修复的是执行安全缺陷"三者齐备——如修的是业务语义,
// 出新迁移,不走此门。
const INTENTIONAL_AMENDMENTS = new Set([
  // 071 修复事务包裹下的静默级联删除(dev 库已实际中招,59 条场景分配
  // 被删,从 12:04 备份恢复;生产未部署本版本=零应用面;dev knex_migrations
  // 已记录 071 不重放,knex 也不校验内容 checksum——修改对已应用库零影响)。
  // 修复= config.transaction=false(执行器裸跑) + PRAGMA 自检 fail-loud,
  // 双态守卫测试锁定。修改业务语义的迁移不可走此门(先例即止于此)。
  '071_scenarios_created_by_set_null.ts',
]);

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
  // 显式名单内的整文件删除放行(裁决记录见文件头注释)
  const isIntentionalRemoval = status.startsWith('D') &&
    migrationPaths.length === paths.length &&
    migrationPaths.every((p) => INTENTIONAL_REMOVALS.has(p.slice(MIGRATION_DIR.length)));
  // 显式名单内的修改放行(裁决记录见文件头注释——准入门槛比删除更严)
  const isIntentionalAmendment = status.startsWith('M') &&
    migrationPaths.every((p) => INTENTIONAL_AMENDMENTS.has(p.slice(MIGRATION_DIR.length)));
  if (!isPureAddition && !isIntentionalRemoval && !isIntentionalAmendment) violations.push(line);
}

if (violations.length > 0) {
  console.error('FAIL migration immutability — committed migrations must not be modified/deleted/renamed:');
  violations.forEach((v) => console.error('  ' + v));
  console.error('Create a NEW migration instead: npm run db:migrate:make <name>');
  process.exit(1);
}
console.log('✓ migrations untouched');
