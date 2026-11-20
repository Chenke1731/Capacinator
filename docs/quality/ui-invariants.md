# UI Invariants：统一扫描标准（第一批）

Status: active（2026-11-20，试点）
Owner: ui-invariants
Applies to: client UI 布局、动作语义、API 信封、路由 CSS 生命周期

本文件定义**跨页会复发、机器可判定、违反后用户能直接感知**的不变量。它们不是一个新模板，
而是现有五支柱/守卫的机器化补口：每条都有 ID、机制切片、oracle、阈值、严重级别和基线政策。

## 原则

1. **一个 runner，不建十个脚本**：U1/U3/D2 共用 `scripts/verify-invariants.mjs`；U2 是独立的
   只读普查 `scripts/verify-css-isolation.mjs`。
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

## 命令

```bash
# 变异自证（不需要 dev server）
node scripts/verify-invariants.mjs --selftest
node scripts/verify-css-isolation.mjs --selftest

# 静态普查（快，无浏览器）
node scripts/verify-invariants.mjs --id D2,U3 --static-only --json tmp/invariant-audit/static.json

# 改动路由的 1366/1600 双语运行时
node scripts/verify-invariants.mjs --id U1,U3 --changed

# 全量运行时（夜间/里程碑）
node scripts/verify-invariants.mjs --id U1,U3 --all \
  --lang zh-CN,en-US --viewports 1366x768,1600x900 \
  --json tmp/invariant-audit/u1u3-all.json

# 跨路由 CSS 只读普查（SPA pushState/popstate，一次浏览器）
node scripts/verify-css-isolation.mjs --all --json tmp/css-isolation-census/report.json
# 追查某个污染路由的来源
node scripts/verify-css-isolation.mjs --all --trace --trace-route assignments
```

`--strict` 把 warn 也当失败，用于清债后的里程碑；`--verbose` 展开所有 warning。

## 基线与债务

- 基线：`scripts/lib/invariant-baseline.json`（当前 74 个唯一签名，owner `ui-invariants`，到期 2026-12-31）。
- 只允许 `--write-baseline` 在**初次普查**时登记存量；新增告警必须修复，不得再写基线。
- 当前基线内容：
  - U3 native dialog 37 条（Assignments/Availability/AuditLog/People/PersonDetails/ProjectTypes 等）；
  - D2 控制器裸响应 4 条 + 客户端防御解析 41 条（共 45 个 finding，重复代码文本在基线中合并为唯一签名）。
- 到期前必须逐类清债或重新裁决；`expires` 到期后 baseline 条目应删除并转红。

## 当前普查结果（2026-11-20）

- **U1**：1366/1600 全量 0 blocking。warn：Intake 动作列 33%、People en-US 横滚 257/23px、
  person-detail fixture 缺失、2 个表首行 >96px。
- **U3**：运行时 0 blocking（已修 ProjectTypes 展开钮、Availability 月切换钮的 aria/title）。
  warn：8 个动作列仍多文字按钮；native dialog 37 条存量。
- **D2**：4 控制器 + 41 客户端防御解析已登记基线。
- **U2**：11 条路由在累计 SPA 路由序列后出现样式变化；已确认：
  - `Projects -> Assignments`：`.project-info` 从 static 变 sticky、宽 400px；
  - `PersonDetails/ProjectDetail -> Assignments`：`.info-value` 字号/padding/布局变化；
  - 多路由 -> Settings/Locations/Components：`.btn` 的 nowrap/min-height/gap 级联变化。
  11 条污染路由：person-detail、assignments、scenarios、reports、reports-capacity、
  reports-utilization、reports-gaps、audit-log、locations、settings、components。
  这些进入 U2 债务（owner `ui-invariants`，到期 2026-12-31），不在本批修复；
  修复批次必须按 route 回溯并删对应债务。

## 接线

- `verify:pr`：静态 `U3 + D2`（无浏览器，baseline 外新增即红）。
- `verify:t1`：`U1 + U3 --changed`（改动路由，1366/1600 双语）。
- 夜间/里程碑：`U1 + U3 --all`；U2 普查每周或大改后跑一次。
- `verify:t2` / 全量 visual/E2E 仍是里程碑门禁，不被本扫描替代。

## 后续

U4 状态完整性、D1 指标口径、D3 场景隔离、D4 审计覆盖、D5 日期边界尚未进入首批；
它们需要独立 fixture/指标注册表/场景矩阵，不做成同一个 runner 的“万能扫描”。
