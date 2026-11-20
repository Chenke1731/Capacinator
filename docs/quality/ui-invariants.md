# UI Invariants：统一扫描标准（第一批）

Status: active（2026-11-20，试点）
Owner: ui-invariants
Applies to: client UI 布局、动作语义、API 信封、路由 CSS 生命周期

本文件定义**跨页会复发、机器可判定、违反后用户能直接感知**的不变量。它们不是一个新模板，
而是现有五支柱/守卫的机器化补口：每条都有 ID、机制切片、oracle、阈值、严重级别和基线政策。

## 原则

1. **一个 runner，不建十个脚本**：U1/U3/D2 共用 `scripts/verify-invariants.mjs`；U2 是独立的
   只读普查 `scripts/verify-css-isolation.mjs`；U4 需要按页拦截网络，独立为
   `scripts/verify-state-completeness.mjs`。
2. **绝对阈值优先于像素基线**：像素 diff 只证明“和上次一样”，不能证明“这次排得下”。
3. **新告警不得直接写进 baseline**：baseline 只冻结已登记存量，必须带 owner/expiry。
4. **每条守卫必须有变异自证**：`--selftest` 注入违规必须红。
5. **只有跨页爆炸半径 + 确定性 oracle + 可修**三条同时满足，才升级为 blocking。

## 第一批不变量

| ID | 机制切片 | 不变量 | Oracle | 级别 |
|---|---|---|---|---|
| **U1** | text-length × auto-layout × viewport × locale | 1366/1600、zh/en 下，表头/动作按钮/Tab/徽标单行；动作列不溢出、不因横向滚动完全不可见 | `verify-invariants --id U1` | fail：表头换行、表头高 >56、动作按钮溢出；warn：动作列占比 >30%、表格横滚、行高 >96 |
| **U2** | css-global-lifetime × route-order | 路由 A 的 CSS 残留到 B 后，B 的共享类 computed style 不得变化 | `verify-css-isolation --all [--trace]` | 普查期为 advisory；确认后按 route 登记债务 |
| **U3** | control-semantics × destructive-action | 图标按钮有可访问名且目标 ≥24×24；动作列不超过 1 个文字主操作；禁止 native confirm/alert/prompt | `verify-invariants --id U3` | fail：无名称/小目标/native dialog（baseline 外）；warn：多文字动作 |
| **D2** | response-shape × client-fallback | 列表 `{data,pagination}`、单实体 `{data}`、写 `{success}`、错 `{error,message}`；客户端不得新增 `Array.isArray(payload) ? payload : payload?.data` | `verify-invariants --id D2 --static-only` | fail：baseline 外的新违规 |
| **U4** | data-state × network-outcome | People/Assignments/Projects/Reports/Dashboard 在 loading/empty/500/403 下必须显示对应状态；失败不得伪装成空列表或 0 值 | `verify-state-completeness --pages ... --strict` | fail：页面空白、无 loading、无错误/重试、错误态显示假零 |

### U1 阈值

- 表头文本行数必须为 1；表头行高 ≤56px。
- 动作列宽 / 表宽：表宽 ≥600px 时，>40% fail，>30% warn；表宽 <600px 只看绝对溢出，不用比例。
- 动作按钮不得溢出动作单元格。
- 动作列在初始视口不可见：有横向滚动时先记 warn（en-US 长表头场景），无滚动时 fail。
- 文字按钮只检查 `page-header / action / dialog` 上下文；board chip、数据卡内的多行按钮是内容，不是动作列。
- Tab 必须单行；按钮标签换行 fail，文字裁切 warn（有 `title` 可接受）。

### U3 阈值

- 图标按钮：`aria-label` / `aria-labelledby` / `title` / img alt 至少一个；有名称才可通过。
- 图标按钮目标 <24×24 fail。
- 动作列文字按钮 >1 warn（主操作 + 图标化次级操作）。
- native `confirm()/alert()/prompt()` fail；存量登记在 baseline，新出现即红。

### D2 判定

- 控制器 `res.json(...)`：对象字面量含 `data/success/error` 为合规；数组字面量、无信封对象、
  `{ message }` 裸响应为违规；标识符/调用表达式为 unknown，不直接判红。
- 客户端条件表达式 `Array.isArray(x) ? x : x?.data` 为防御解析，baseline 外新增即红。

### U4 判定

- 每页按目标端点拦截：`loading` 延迟响应 3s，`empty` 返回页型空信封，`500/403` 返回错误信封。
- 页面根（`main/.page-container` 等）必须可见；`loading` 必须有可见 spinner/skeleton/loading 文案；
  `empty` 必须有页型空态，或零值页（Reports/Dashboard）渲染非空摘要且不显示错误；
  `500/403` 必须有 `role="alert"`/错误文案，能重试的页面必须给出重试入口。
- 断言的失败语义是“状态缺失或失败伪装成 0”，不是像素外观；外观仍由 visual/states 承担。
- 五页配置（端点/空信封）内嵌在 `scripts/verify-state-completeness.mjs`，新增页必须补配置与 selftest。

## 命令

```bash
# 迭代期统一入口：按改动映射 lint/typecheck/Jest/U1/U3/states；CSS 改动追加 U2 strict
node scripts/verify-affected.mjs --changed
node scripts/verify-affected.mjs --changed --dry-run

# 变异自证（不需要 dev server）
node scripts/verify-invariants.mjs --selftest
node scripts/verify-css-isolation.mjs --selftest
node scripts/verify-states-many.mjs --selftest

# 静态普查（快，无浏览器）
node scripts/verify-invariants.mjs --id D2,U3 --static-only --json tmp/invariant-audit/static.json

# 改动路由的 1366/1600 双语运行时
node scripts/verify-invariants.mjs --id U1,U3 --changed

# 详情路由（含 :audit-id 实体路由，运行时经 resolveProfile 换真 ID）
node scripts/verify-invariants.mjs --id U1,U3 --profile phase-template
node scripts/verify-invariants.mjs --id U1,U3 --route /roles/501d8abc-0c77-45e9-98c8-7832302e63cb

# U4 五页状态矩阵（loading/empty/500/403；--strict 作为闸）
node scripts/verify-state-completeness.mjs --pages people,assignments,projects,reports,dashboard --strict
node scripts/verify-state-completeness.mjs --pages reports --states error,forbidden --json tmp/u4-reports.json
node scripts/verify-state-completeness.mjs --selftest

# 全量运行时（夜间/里程碑）
node scripts/verify-invariants.mjs --id U1,U3 --all \
  --lang zh-CN,en-US --viewports 1366x768,1600x900 \
  --json tmp/invariant-audit/u1u3-all.json

# 长内容压力：首行数据替换为无空格长 token，检查单元格溢出/动作列可达性
node scripts/verify-invariants.mjs --id U1 --all --stress --lang zh-CN,en-US --viewports 1366x768

# 跨路由 CSS 只读普查（SPA pushState/popstate，一次浏览器）
node scripts/verify-css-isolation.mjs --all --json tmp/css-isolation-census/report.json
# CSS/共享原语改动时作为阻塞闸（T1 已接线）
node scripts/verify-css-isolation.mjs --all --strict
# 追查某个污染路由的来源
node scripts/verify-css-isolation.mjs --all --trace --trace-route assignments
```

`--strict` 把 warn 也当失败，用于清债后的里程碑；`--verbose` 展开所有 warning。

## 基线与债务

- 基线：`scripts/lib/invariant-baseline.json`（当前 0 个签名，owner `ui-invariants`，到期 2026-12-31）。
- 只允许 `--write-baseline` 在**初次普查**时登记存量；新增告警必须修复，不得再写基线。
- 当前基线内容：空。
  - U3 native dialog 已清零；
  - D2 所有客户端防御解析已收敛到 `client/src/lib/apiPayload.ts` 的 `asList` 单一兼容边界；
  - 本批触碰的控制器（Import 2、ProjectPhaseDependencies、TestData）响应已补信封字段。
- 到期前必须逐类清债或重新裁决；`expires` 到期后 baseline 条目应删除并转红。

## 当前普查结果（2026-11-20）

- **U1**：1366/1600 全量 0 blocking、0 warning；仅 4 条 info（People en-US 横向滚动/动作列需横滚）。
  `--stress` 长内容模式 0 blocking、0 warning，28 条动作列需横滚 info。
- **U1 详情路由扩面（2026-11-20）**：curated 24→29，补 role-detail / project-type-detail /
  phase-template / project-detail-tagged / person-workload。`:audit-id` 实体路由由 runner
  经 `resolveProfile` 解析（实体 profile 无独立 fixture，不会切换进程场景）；同页兄弟路由
  （project-detail-phases≈project-detail）解析后去重不重复量测。扩面首跑清掉三处真债：
  `.resource-templates-table th` 行高 57→55px（超 56 契约 1px，纵向 padding 16→15）；
  `.phases-table th` en-US DEFAULT/MIN/MAX DAYS 换行（补 `white-space:nowrap`，
  1366 en-US 残留 12px 横滚 info）；person-workload 所需 3 个 GET 补进 runtime-data 场景。
- **U3**：运行时 0 blocking、0 warning；37 条 native dialog 已全部迁移（alert→toast，confirm→ConfirmDialog）；
  Intake/ProjectTypes/Roles 动作列已压缩为图标 + 单个文字主操作。
- **D2**：**0 finding**；所有 legacy 防御解析已收敛到 `asList`，控制器裸响应已清。
- **U2**：SPA 普查（29 路由，含详情/实体路由）**0 polluted、0 coverage error**。
  - `.project-info`、`.project-name`、`.info-value`、`.inline-editable`、`.btn*`、`.charts-grid` 等
    已按 `:where(page-root)` 收敛（特异性与原来的裸选择器一致，避免压过 App.css dark 覆盖）；
  - `ProjectDetail`/`AuditLog`/`Roles` 根类已补齐，供 scope 使用；
  - 2026-11-20 详情路由入普查后清掉新暴露的共享类泄漏（全部真修，未登记基线）：
    `PhaseTemplateDesigner.css` 的 `.actions-cell`/`.phase-name`、`ProjectTypeDetails.css` 的
    `.section-header`(+h2)/`.header-content`/死代码 `.form-grid`、`ProjectRoadmap.css` 的
    死规则 `.phase-name`（经 ProjectsUnified 在 /projects 即加载，是 phase-template 污染源）。
    `ProjectTypeDetails` 根补 `project-type-details-page` 锚类（与 RoleDetails 共用
    `.role-details-page`，不能拿共用根当锚）；
  - U2 不再有污染债；CSS/共享原语改动在 T1 以 `--strict` 阻塞。
- **U4**：五页 × 四状态 **20/20 通过**（2026-11-20）。
  - 修复 Reports：`capacity/utilization/demand/gaps` 查询补 `error` 解构；错误时以
    `role="alert"` 错误块替换报告内容并提供 Retry，避免失败静默显示 0/空报表。
  - Projects loading 使用 `.req-skeleton`（已纳入加载态识别）；People/Assignments/Dashboard
    沿用既有 spinner/空态/错误态。

## 接线

- `verify:pr`：静态 `U3 + D2`（无浏览器，baseline 外新增即红）。
- `verify:t1`：`U1 + U3 --changed`（改动路由，1366/1600 双语）；CSS/共享原语改动追加
  `verify-css-isolation --all --strict`；改动映射到五核心页时追加 U4 状态矩阵。
- `verify-affected`：页面改动映射到对应 U4 页（含 `-1366`/report-tab 变体折叠）；
  共享 UI 改动跑五页全矩阵；`--skip-u4` 仅用于明确不触碰状态面的改动。
- 夜间/里程碑：`U1 + U3 --all` + `U1 --stress`；U4 五页矩阵；U2 普查每周或大改后跑一次。
- `verify:t2` / 全量 visual/E2E 仍是里程碑门禁，不被本扫描替代。

## 后续

U4 已覆盖五核心数据页的四类网络状态；其余页面按需扩配置。D1 指标口径、D3 场景隔离、
D4 审计覆盖、D5 日期边界尚未进入首批；它们需要独立 fixture/指标注册表/场景矩阵，
不做成同一个 runner 的“万能扫描”。
