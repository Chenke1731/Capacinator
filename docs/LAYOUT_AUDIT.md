# Layout audit（vlmkit）定位与触发

**定位：布局完整性审计（advisory），不是 UI 验收门禁。**
它只回答“目标视口下有没有确定性的布局破损”；审美、业务语义、状态互斥、设计令牌仍由 UI 契约、`verify:states`、`verify:visual`、E2E 和人工评审负责。

## 触发点（全部本地，无 GitHub Actions）

| 场景 | 命令 | 阻塞 |
|---|---|---|
| push 含 `client/src` 变更 | `.githooks/pre-push` → `audit-layout --changed` | findings 不拦；环境缺失警告放行，`REQUIRE_LAYOUT_AUDIT=1` 拦截，`SKIP_LAYOUT_AUDIT=1` 跳过 |
| 本地改 UI 后 | `npm run audit:layout:changed` / `npm run audit:typography` | typography 违规 exit 1 |
| 指定页面 | `npm run audit:layout -- --pages person-workload,projects` | 否 |
| **每晚 03:17（本机 cron）** | `npm run audit:layout:nightly` | layout advisory；typography 违规 exit 1；没跑成 exit 2 |
| 手动全量 | `npm run audit:layout -- --all` | 否 |
| 新增页面/路由 | pre-commit `verify:layout-map` 强制补映射 | **是**（否则触发会漏页） |

夜间任务启动**隔离 e2e 栈**（API 3131 / Web 3132，避开 dev 3110/3120 与现有 e2e 3111/3122），
结束后自动清理；不依赖开发者是否开着 dev 栈。报告在 `tmp/layout-audit/nightly-<ts>/`，
`tmp/layout-audit/latest/` 指向最近一次。

## 选页规则

`scripts/layout-audit.config.json`：

- `shared` 命中（全局 CSS、`App.tsx`、`components/ui`、i18n）→ **全量**；
- `route.covers` 命中 → 对应页面；
- `client/src/**` 未映射 → **回退全量**（`selectionFallback.reason=unmapped-client-file`），绝不静默漏检；
- `scripts/check-layout-audit-map.mjs` 守卫：页面文件、App 路由、covers 文件、allow 条目必须完整。

## 数据形状：已结束行（F-01 沉淀）

夹具单一化（所有人员的行都跨参考日）曾让“已结束行在泳道整体消失”对一切门禁不可见。
`LAYOUT_AUDIT_ALLOW_WRITES=1`（仅隔离 e2e 栈启用；dev 栈禁写）时，脚本临时创建一名三行人员
（进行中/已结束/paused，角色轮换避免业务键冲突），对 `person-workload` 追加一次
`person-workload:ended` 访问，结束后按“列分配 → 删行 → 删人”清理并响亮报警。
夜间任务自动设置该开关；手动对 dev 栈运行时跳过并写入 `trigger.json.endedShape`。

## 规则与 allow

- 默认保留：`text-clipped`、`container-protrusion`、`occluded-text`、稳定的 `js-error`、纵向溢出；
- 默认关闭：`near-misalignment`、`nested-scroll`、`clipped-content`（本项目有意的图表/滚动容器噪音）；
- `scripts/layout-audit.allow.json` 每条必须含 `kind/reason/owner/expires`；过期条目由守卫拦下；不得 allow `js-error/degenerate-render/unstyled-page/redirected`。

## 退出码与证据

- `0`：审计完成（无论有无 findings）；
- `2`：审计没跑成（服务/登录/浏览器/vlmkit）——不能当通过。
- 夜间任务：typography 违规额外 exit 1。
- 证据：`tmp/layout-audit/nightly-<ts>/{layout,typography}/summary.md`、`findings.json`、`trigger.json`；`latest/summary.md` 为最近一次。

## Typography guard（确定性，阻塞）

`scripts/audit-typography.mjs`（`npm run audit:typography`）：对整页**可见文本（含 aria-hidden）**
断言 R1 字号 ≥ minPx（默认 10）与 R2 同级标题字号唯一；main 作用域，双主题无关。
与 vlmkit 的关系：vlmkit 是 advisory 布局体检，本脚本是确定性守卫，违规 exit 1。
校准自证：`--min-px 11` 必须红（当前泳道 10px 文本 ≥15 处）。

## 视口

`1366x768`、`1600x900`。768 高是现有 visual 矩阵未覆盖、但真实暴露 sidebar footer 溢出的视口。

## VLM 与 MCP

- VLM 功能（`check copy --vlm`、`heal`）**不启用**：隐私、确定性、自动改码风险。
- MCP 只是个人即时调用入口；正式流程以 `npm run audit:layout` 和本地报告为准。
- 不依赖 GitHub Actions；CI workflow 已移除。
