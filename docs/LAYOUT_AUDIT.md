# Layout audit（vlmkit）定位与触发

**定位：布局完整性审计（advisory），不是 UI 验收门禁。**
它只回答“目标视口下有没有确定性的布局破损”；审美、业务语义、状态互斥、设计令牌仍由 UI 契约、`verify:states`、`verify:visual`、E2E 和人工评审负责。

## 触发点

| 场景 | 命令 | 阻塞 |
|---|---|---|
| **push 含 client/src 变更**（本地） | `git push` → `.githooks/pre-push` → `audit-layout --changed` | findings 不拦；环境缺失警告放行，`REQUIRE_LAYOUT_AUDIT=1` 拦截，`SKIP_LAYOUT_AUDIT=1` 显式跳过 |
| PR 改动 `client/src/**` | CI `layout-audit` → `node scripts/audit-layout.mjs --changed` | 否；findings 进 artifact + **PR 评论（`<!-- layout-audit -->` 同评论更新）+ `::warning` 注解** |
| **每次 CI（同一 workflow）** | `node scripts/audit-typography.mjs --all` | **是**：字号下限/标题一致性守卫，违规 exit 1 |
| 本地改 UI 后 | `npm run audit:layout:changed` / `npm run audit:typography` | 后者本地也红 |
| 指定页面 | `npm run audit:layout -- --pages person-workload,projects` | 否 |
| 发版前/每周一 | `npm run audit:layout -- --all`（CI schedule 自动） | 否 |
| 新增页面/路由 | pre-commit `verify:layout-map` 强制补映射 | **是**（否则触发会漏页） |

**不放进 pre-commit 的浏览器审计**：它需要登录态、浏览器和 1–10 分钟；pre-commit 只跑 <1s 的映射守卫。

## 选页规则

`scripts/layout-audit.config.json`：

- `shared` 命中（全局 CSS、`App.tsx`、`components/ui`、i18n）→ **全量**；
- `route.covers` 命中 → 对应页面；
- `client/src/**` 未映射 → **回退全量**（`selectionFallback.reason=unmapped-client-file`），绝不静默漏检；
- `scripts/check-layout-audit-map.mjs` 守卫：页面文件、App 路由、covers 文件、allow 条目必须完整。

## 数据形状：已结束行（F-01 沉淀）

夹具单一化（所有人员的行都跨参考日）曾让"已结束行在泳道整体消失"对一切门禁不可见。
`LAYOUT_AUDIT_ALLOW_WRITES=1`（仅 CI 隔离 e2e 栈启用；本地 dev 栈禁写）时，
脚本临时创建一名三行人员（进行中/已结束/paused，角色轮换避免业务键冲突），
对 `person-workload` 追加一次 `person-workload:ended` 访问，结束后按
"列分配 → 删行 → 删人"清理并响亮报警；本地跳过时原因写入 `trigger.json.endedShape`。

## 规则与 allow

- 默认保留：`text-clipped`、`container-protrusion`、`occluded-text`、稳定的 `js-error`、纵向溢出；
- 默认关闭：`near-misalignment`、`nested-scroll`、`clipped-content`（本项目有意的图表/滚动容器噪音）；
- `scripts/layout-audit.allow.json` 每条必须含 `kind/reason/owner/expires`；过期条目由守卫拦下；不得 allow `js-error/degenerate-render/unstyled-page/redirected`。

## 退出码与证据

- `0`：审计完成（无论有无 findings）；
- `2`：审计没跑成（服务/登录/浏览器/vlmkit）——不能当通过。
- 证据：`tmp/layout-audit/<timestamp>/summary.md`、`findings.json`、`trigger.json`；CI 上传 artifact 14 天。

## Typography guard（确定性，阻塞）

`scripts/audit-typography.mjs`（`npm run audit:typography`）：对整页**可见文本（含 aria-hidden）**
断言 R1 字号 ≥ minPx（默认 10）与 R2 同级标题字号唯一；main 作用域，双主题无关。
与 vlmkit 的关系：vlmkit 是 advisory 布局体检，本脚本是确定性守卫，违规 exit 1。
校准自证：`--min-px 11` 必须红（当前泳道 10px 文本 ≥15 处）。

## 视口

`1366x768`、`1600x900`。768 高是现有 visual 矩阵未覆盖、但真实暴露 sidebar footer 溢出的视口。

## VLM 与 MCP

- VLM 功能（`check copy --vlm`、`heal`）**不启用**：隐私、确定性、自动改码风险。
- MCP 只是个人即时调用入口；正式流程以 `npm run audit:layout` 和 CI artifact 为准。
