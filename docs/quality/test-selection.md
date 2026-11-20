# Test Selection Card：分级测试的决策函数

Status: proposed（2026-11-18，试点中）
Owner: Claude/ZCode 会话
Applies to: 所有代码/UI/契约/工具链改动

## 为什么要有这张卡

T0/T1/T2 只描述**执行时机和成本档位**，不回答"这个改动为什么需要这一档"。若把层级当成安全等级，每个局部修复都会被推到全量验证，形成"验证占 60-67%"的既有审计结论。

分级测试的正确决策函数是：

> 先列出可预见故障模式，再为每个故障模式选择**能让它显形的最低成本 oracle**；只有低层环境无法复现该故障时才升级，所有故障模式都有会红的测试后停止。

层级不是声望，证据才是。

## 理论依据

- **Risk-Based Testing**：测试强度由 `风险 = 故障概率 × 影响面` 决定，不由"是不是 UI/后端"决定。
- **Test Pyramid / Testing Trophy**：大量便宜单元/组件测试，少量集成，更少 E2E，全量回归留给里程碑。
- **Oracle Problem**：测试只能回答它能观察的问题。SQLite 类型亲和性需要真实 SQLite；浮层遮挡需要真实浏览器几何；输入归一化只需要纯函数。
- **FMEA**：每个机制切片先问"会怎么坏、用户看到什么、什么测试让坏法显形"。
- **边际信息增益**：一个测试值得跑的条件不是"可能有用"，而是它能排除一个尚未排除的故障假设。若更便宜的测试已能排除同一假设，高成本测试被支配，不跑。

## Test Selection Card（写码前必填）

```text
## Test Selection Card

Changed:
  一句话说明改动。

Fault hypotheses:
  H1: 该改动可能怎样坏。
  H2: 还可能怎样坏。

Oracles:
  H1 → 哪个测试/检查会让 H1 变红（最低成本环境）。
  H2 → 哪个测试/检查会让 H2 变红。

Not run:
  states/visual/E2E/verify:pr 等——逐项写"观察不到哪个 H"或"更低成本测试已覆盖"。

Stop condition:
  每个 H 都有一个会红的 oracle，且没有剩余未覆盖故障假设。
```

硬规则：

1. 每个测试必须绑定一个故障假设；说不出它会红的原因就不跑。
2. 高层测试必须证明一个低层无法证明的故障假设。
3. `verify:pr` 是批末/提交点动作，不是每个小修后的默认动作。
4. 共享面（全局 CSS、共享组件、API 契约、缓存键、审计/verify 工具）单独成批，不混入局部 UI 修复。

## 升级与停止

| 改动面 | 最低充分 oracle | 允许升级的条件 |
|---|---|---|
| 局部逻辑/文案/禁用条件 | targeted Jest + typecheck | 触碰共享组件、契约或异步状态 |
| CSS/布局几何 | lint:ui + `verify-invariants --id U1,U3 --changed` + 受影响 states profile | 默认像素外观变化才 visual；新浮层/裁剪才浏览器几何/E2E |
| 跨路由/共享 CSS | `verify-css-isolation --all --strict`（CSS/共享原语改动）+ lint:ui 所有权守卫 | 非 CSS 页面改动不跑；新共享类/重复 owner 仍由 lint:ui 拦 |
| API 契约/信封 | `verify-invariants --id D2 --static-only` + targeted integration | 新端点多契约面才全量后端回归 |
| 交互状态机/手势 | 状态×事件矩阵 + 重复手势测试 + focused review | 新页面、共享原语或跨页行为才 full review |
| 浮层/贴锚/遮挡 | 贴锚/遮挡/焦点 targeted 浏览器测试 + states floatingRoot | 跨页面/新导航路径才 E2E 套件 |
| 服务端契约/数据库语义 | 真实 schema 集成测试 | 影响多契约面才全量后端回归 |
| 审计/verify 工具链 | selftest + 变异自证 + 受影响 profile | 独立提交；必要时才全量 |

停止条件是"所有 H 有专属且会红的 oracle"，不是"所有可用门禁都绿"。

## 案例

### 输入归一化 bug（如 `2026-12-1` 被拒）

故障假设：归一化错误、错误文案不清晰。
Oracle：`normalizeIsoDateInput` 单测 + WorkloadRangePanel 用例。
不跑 states/visual/verify:pr：它们观察不到这两个 H，且默认关闭态像素不变。

### 锚定浮层（如日历从 inline 改 popover）

新增故障假设：不贴锚、视口越界、被裁剪、外点不关、焦点不回。
Oracle：贴锚/遮挡/焦点 targeted 浏览器测试 + states floatingRoot + 一条几何 E2E。
不跑全页面 E2E/verify:pr：未改变既有流程；共享审计工具误报另开批修。

### SQLite 布尔过滤 bug（`is_approved='true'`）

故障假设：字符串绑定与 SQLite 0/1 存储不匹配。
Oracle：真实 migrations + SQLite 集成测试（修前红）。
Mock controller 单测不可作为 oracle：它复现不了数据库类型亲和性。

### 表格列宽预算（动作列把表头/行压成竖排）

故障假设：动作列 min-content 超出预算时，自动布局优先压数据列，表头换行、行高膨胀；共享类（如全局 `.status-indicator`）泄漏进页面单元格；en-US 长词放大问题。
Oracle：1366/1600 浏览器几何测试——表头行数、表头/行高上限、动作列宽与占比、按钮是否溢出单元格。
像素基线不能充当这个 oracle：它只证明"和上次一样"，会把坏布局冻结成正确；先过绝对几何阈值，再采基线。
反例：People 五文本按钮动作列实测 min-content≈456px，表头 80.5px、行高 82px；压缩动作列后同为 1366 视口表头 48px、行高 74–78px。

### 跨路由 CSS 残留（共享类在 A→B 后变样）

故障假设：页面 A 的懒加载 CSS 在 SPA 切到 B 后仍常驻，覆盖 B 的共享类（`.project-info`、`.btn`、`.info-value`、`.status-indicator`）。
Oracle：`verify-css-isolation --all --trace`：先 fresh 每路由 computed-style 指纹，再同一 SPA 会话累计导航比对；必要时按源路由回溯。
不使用 full reload：它会销毁前一路由的 document，天然看不到残留。
像素基线不能覆盖：同一路由在新会话里可能完全正常，只有路由顺序触发时才变。

### 动作语义与 API 信封

故障假设：图标按钮无可访问名/小目标；动作列堆多个文字按钮；native confirm 绕过主题/焦点；新端点裸数组、客户端重新长出防御解析。
Oracle：`verify-invariants --id U3`（静态 native dialog + DOM 动作）+ `--id D2 --static-only`（控制器/客户端 AST）。

## 代理预算

Explore/评审子代理派发时必须给预算和问题清单；无预算的"全面查一遍"会自然扩展成审计。

- Explore 默认 ≤20 次工具调用 / ≤5 分钟；已知文件直接读，不再全库扫。
- focused review 默认 ≤20 次工具调用 / ≤6 分钟，只查本卡 H 对应机制。
- full review 仅用于新页面、共享原语、跨页行为或 focused review 发现 P1/共享面风险后的升级。

试点期间不新增 pre-commit 拦截。连续两次仍全量跑或漏跑专属 oracle，再考虑结构化检查器。
