# Scripts 索引

> 本目录有大量历史一次性脚本。新增脚本必须在 `package.json`、hooks、夜审或本文件登记；
> 未被任何入口引用的脚本视为**候选归档**，不要直接当维护工具使用。

## 当前维护入口（由 npm / hooks 驱动）

- **开发/服务**：`start-dev.ts`、`stop-dev.ts`、`dev-logs.ts`、`prod-server.ts`、`e2e-server.ts`
- **验证**：`verify-tier.mjs`、`verify-affected.mjs`、`verify-states-many.mjs`、`verify-state-completeness.mjs`、`verify-invariants.mjs`、`verify-css-isolation.mjs`、`verify-pr.mjs`、`verify-doctor.mjs`、`check-verify-map.mjs`、`check-architecture.mjs`、`verify-visual*.mjs`、`verify-states.mjs`、`verify-cache-keys.mjs`、`check-collection.mjs`
  - 迭代期统一用 `node scripts/verify-affected.mjs --changed`（按改动映射 lint/typecheck/Jest/U1/U3/states/U4；CSS 改动追加 U2 strict）；批末才跑 `verify:pr` 和全量 visual。
- **安全**：`security-audit.mjs`、`rotate-encryption-key.mjs`、`setup-env.mjs`
- **审计/布局**：`audit-layout.mjs`、`audit-typography.mjs`、`audit-nightly.mjs`、`audit-color-debt.mjs`、`lint-ui-css.mjs`
- **性能**：`perf-baseline.mjs`、`perf-ops.mjs`
- **数据库/种子**：`db:*` 入口、`seed-*.ts`、`import-excel.js`

## 历史/一次性脚本

`fix-*`、`walkthrough-*`、`spotcheck-*`、`update-*`、`migrate-to-git.ts` 等属于历史修复/调试记录，
仅在对应事故复盘时参考；不要在新流程中调用。归档前先 `git grep <脚本名>` 查文档/脚本间引用。

## 工具配置

- `knip.jsonc`：死代码/依赖报告（`npm run quality:knip`；report-only）。
- `.dependency-cruiser.cjs`：分层/循环依赖规则；基线 `.dependency-cruiser-known-violations.json`；
  `npm run verify:arch` 只拦新增违例。
