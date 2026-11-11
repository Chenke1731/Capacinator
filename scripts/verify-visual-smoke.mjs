#!/usr/bin/env node
/**
 * visual 冒烟（批 T，2026-11-11）：任何 verify:visual 全量运行（18-25 min/轮）
 * 之前，先用 3 个代表组合在 ~4-6 min 内暴露 harness 层的陈旧假设。
 *
 * 背景（耗时审计批 C 实录）：visual 复活时四个独立陈旧假设（死 profile、
 * .modal-overlay 锚、import 两步流、缺夹具键）在 4 次全量尝试里**串行**
 * 暴露，每次 20+ min。三个冒烟组合分别覆盖三类假设面：
 *   ① --page /projects            —— 页矩阵 + 碰撞 + 预算（死档/profile 假设）
 *   ② project-detail-phases + phase-edit —— 预备态 + Radix 锚（状态机假设）
 *   ③ import + import-file        —— 两步流 + mock 信封（最易腐烂的预备态）
 *
 * 用法：node scripts/verify-visual-smoke.mjs（不加 npm 别名——package.json
 * 属用户并行文件）。任一组合失败即中止并指出假设面，修完再跑全量。
 */
import { execSync } from 'node:child_process';

const SMOKE = [
  { label: '页矩阵+碰撞（profile/路径假设面）', args: ['--page', '/projects'] },
  { label: '预备态+Radix 锚（状态机假设面）', args: ['--profile', 'project-detail-phases', '--state', 'phase-edit'] },
  { label: 'import 两步流（mock 信封假设面）', args: ['--profile', 'import', '--state', 'import-file'] },
];

for (const { label, args } of SMOKE) {
  console.log(`\n── 冒烟: ${label}  (node scripts/verify-visual.mjs ${args.join(' ')})`);
  try {
    execSync(`node scripts/verify-visual.mjs ${args.join(' ')}`, { stdio: 'inherit' });
  } catch {
    console.error(`\n✗ 冒烟失败: ${label}\n  该组合暴露了 harness 陈旧假设——修完再跑全量（全量 18-25 min/轮，别拿它试错）。`);
    process.exit(1);
  }
}
console.log('\n冒烟 PASS ×3 —— 可以跑全量 verify:visual。');
