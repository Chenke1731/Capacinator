# Layout audit（vlmkit）定位与触发

**定位：布局完整性审计（advisory），不是 UI 验收门禁。**
它只回答“目标视口下有没有确定性的布局破损”；审美、业务语义、状态互斥、设计令牌仍由 UI 契约、`verify:states`、`verify:visual`、E2E 和人工评审负责。

## 触发点

| 场景 | 命令 | 阻塞 |
|---|---|---|
| PR 改动 `client/src/**` | CI `layout-audit` → `node scripts/audit-layout.mjs --changed` | 否；findings 只进 artifact |
| 本地改 UI 后 | `npm run audit:layout:changed` | 否 |
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

## 规则与 allow

- 默认保留：`text-clipped`、`container-protrusion`、`occluded-text`、稳定的 `js-error`、纵向溢出；
- 默认关闭：`near-misalignment`、`nested-scroll`、`clipped-content`（本项目有意的图表/滚动容器噪音）；
- `scripts/layout-audit.allow.json` 每条必须含 `kind/reason/owner/expires`；过期条目由守卫拦下；不得 allow `js-error/degenerate-render/unstyled-page/redirected`。

## 退出码与证据

- `0`：审计完成（无论有无 findings）；
- `2`：审计没跑成（服务/登录/浏览器/vlmkit）——不能当通过。
- 证据：`tmp/layout-audit/<timestamp>/summary.md`、`findings.json`、`trigger.json`；CI 上传 artifact 14 天。

## 视口

`1366x768`、`1600x900`。768 高是现有 visual 矩阵未覆盖、但真实暴露 sidebar footer 溢出的视口。

## VLM 与 MCP

- VLM 功能（`check copy --vlm`、`heal`）**不启用**：隐私、确定性、自动改码风险。
- MCP 只是个人即时调用入口；正式流程以 `npm run audit:layout` 和 CI artifact 为准。
