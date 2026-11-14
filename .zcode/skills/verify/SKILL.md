---
name: verify
description: Capacinator 变更验证调度。改完代码、提交前或合并前使用：按变更选择 T0/T1/T2，调用 findRelatedTests、states/E2E 映射、架构与安全门禁；exit 2 = 不能覆盖/没跑成，不是通过。
---

# /verify 调度

规则正本在 `CLAUDE.md` / `docs/plans/2026-11-14-tooling-efficiency-plan.md`；本 skill 只做调度，不复制规则。

## 快速选择

- **T0（批内迭代）**：`npm run verify:t0 -- --files <changed>`
  - doctor + 对应 typecheck + changed-file ESLint + `jest --findRelatedTests` + 最多 2 个 `verify-states --quick`。
  - 全局 CSS/未知组件/依赖清单变更：T0 会 exit 2，升级 T1。
- **T1（批末/提交前）**：`npm run verify:t1`
  - T0 + 受影响 profile 全量 states + `verify:cache` + 映射到的 Playwright specs。
- **T2（里程碑/合并前）**：`npm run verify:t2`（先 `--dry-run` 看清单）
  - 全量 lint/typecheck/Jest/collection/redline/visual 分片/主+场景 E2E。

## 常用门禁

```bash
npm run verify:doctor        # 环境就绪
npm run verify:map           # 页面/profile/E2E 映射完整性
npm run verify:arch          # 新增循环/跨层依赖
npm run verify:pr -- --skip-e2e   # 本地 PR 门禁（含 build+bundle）
npm run security:audit       # gitleaks + OSV baseline + signatures
```

## 失败处理

1. `exit 2` = 不能覆盖或工具没跑成；**不要**当通过，先修环境或升级 tier。
2. 未知文件/新页面映射失败：在 `scripts/lib/verify-map.mjs` 补页面/profile/E2E（guard 会拦）。
3. 新出现的架构违例：先修；确认是历史存量才更新 `.dependency-cruiser-known-violations.json`（评审后）。
4. 安全/依赖新告警：不要直接把 baseline 改绿；先 triage、修复或写例外。
