# 实施计划审视（2026-11-15）

> 结论先行：语料里的 P0/P1 清单**不能直接当实施清单**。现场核对后，原计划 7 项里有 3 项已实现或大半实现、1 项无缺陷证据、2 项高风险/无承载面。真正建议现在做的只有 **4 个小切面 + 1 个契约债替换**，且先跑复现清单再生产。
> 本文件只做审视，**没有改任何业务代码**。
> **2026-11-15 更新**：Batch 0 四路实测已完成，裁决与最终批次见 §8/§9（对 §1–§5 的部分结论有修正）。

## 0. 审视方法

每条过四问：

1. 有没有真实缺陷/痛点（台账/事故/可复现）？
2. 现有代码是否已经覆盖（file:line 核对）？
3. 改动是否可逆、可隔离？
4. 是否新增配置面/维护面？

证据优先级：现场代码 > 台账/事故 > 调研语料（只作灵感，不作实施依据）。

## 1. 逐项裁决

| 原计划项 | 代码现状 | 必要性 | 裁决 |
|---|---|---|---|
| 折叠列 + 列设置持久化 | 已有三档列预算 + 4 个列预设 + 宽度持久化 + URL preset + RowDetailDrawer | 机制已在，只差复现确认 | **不新建**；复现 U06/U16，仍截断则微调预算 |
| 批量选择作用域 | BulkActionBar 已显示总数/可见/隐藏 + 清除隐藏 + SR/AR 分项 + 删除确认分项 | 已实现 | **verify-only**，不立项 |
| 导入错误反馈 | ImportUnified 1183 行，预览/分析/部分错误/重复校验/模板下载已有 | 大部分已实现 | **先查缺口**，只做增强 |
| 空态原语收编 | 无共享组件，但 App.css 是单一 owner；页面级变体是设计选择 | 无缺陷证据 | **机会式**，触碰页面时再做 |
| 无权限空态 | 无场景证据 | 产品未定 | **不做** |
| 甘特分栏/缩放/键盘 | 近期刚修 today line/标签/重叠；24px 文本未量测 | 功能+高风险 | **先 spike**，不进本批 |
| Agent 工作台 | 方向级 | 无承载 | **不做** |

## 2. 已被现有代码消化的（不要重做）

### 2.1 列折叠/列设置持久化

`Projects.tsx` 已具备：

- **三档列预算**（`REQ_COLUMNS` def[3]）：全列 1376≤1380@1680；中档藏组件 1284≤1300@1600；紧凑藏组件/编号/交付/实名 1012≤1066@1366。
- **4 个列预设**（`COL_PRESET_IDS`: default/estimate/staffing/delivery）+ `COL_PRESET_HIDDEN` + `COL_PRESET_STORE='req-col-preset-v1'` + URL `?preset=`。
- **列宽拖拽持久化**（`req-col-widths-v5`，列集变更才 bump）。
- **隐藏字段承接**：`RowDetailDrawer`（不靠 title，符合 IX-4）。

结论：不要引入 ProTable `columnsState` 或迁移 TanStack Table。U06/U16 若仍复现，是**列宽预算微调**，不是新功能。

### 2.2 批量选择作用域

`BulkActionBar.tsx` 已实现：

- `count`、`visibleCount/hiddenCount` 显示；
- 隐藏选中项的一键清除（`onClearHidden`）；
- 删除确认带 `count/srCount/arCount` 分项文案（`bulkDeleteConfirmBreakdown`）；
- 选中行的版本分布/迭代冲突摘要。

结论：U18 的主体已落地。只剩一个 15 分钟的核查：**删除确认文案是否显式包含"隐藏 N 条"**；不含则补一个插值，不立项。

### 2.3 导入错误反馈

`ImportUnified.tsx`（1183 行）已有：

- 预览/分析（`analyzeImport`）+ 上传（`uploadExcel`）；
- `importProgress.addError/fail`，部分成功也逐条收错误；
- 重复校验文案（`validateDuplicates`）；
- 模板下载/场景导出（`api.import.getTemplate/exportTemplate/exportScenario`）。

结论：语料里的导入 SOP 大部分已存在。真正可能缺的是**错误行定位、失败行导出重导、重复覆盖/跳过策略**——先拿一个坏文件实测，确认缺口再决定是否做，不按 SOP 全量重写。

### 2.4 空态

- `index.css:349` 明确 `.empty-state` 已收口到 `App.css:840` 单一 owner；
- `ProjectTypes.css`、`Locations.css`、`Dashboard.css` 是页面级变体，不是四套并列 owner。

结论：没有"四套实现互踩"的证据，不做全量收编。若要引入 shadcn Empty，作为新共享组件，在**实际触碰页面**时逐页迁移，不动全局 CSS。

## 3. 建议保留的 4+1 项（具体方案）

### A. Badge 色语言对齐（P0，最小）

- **价值**：成功/警告徽标绕过主题 token，浅色主题下发虚/与 `.badge-success` 两套色。
- **现状**：`badge.tsx:18-22` 硬编码 `bg-green-700`/`bg-yellow-700`；`index.css:1564/1568` 已有 `--status-success-solid: #047857`、`--status-warning-solid: #b45309`。
- **方案**：success/warning variant 改用 `bg-[var(--status-success-solid)]` / `bg-[var(--status-warning-solid)]`，hover 用 `color-mix(... 90%, var(--solid-shade))` 保持压深；不改尺寸/圆角。
- **使用面**：`PersonDetails.tsx:195/242`、`PersonWorkload.tsx:2311`、`UtilizationReport.tsx:71`、`GapsReport.tsx:198`（动态 variant）。
- **验证**：`verify:colors`、双主题截图、Badge 单测/快照；grep 动态 variant。
- **风险**：低；回滚单文件。
- **分级**：A1（视觉可读性，无计算影响）。

### B. ProjectDetail 重试保留上下文（P0，小）

- **价值**：错误页 `window.location.reload()` 丢筛选/滚动/返回栈。
- **现状**：`ProjectDetail.tsx:321`。
- **方案**：取该页 `useQuery` 的 `refetch`，按钮调用 refetch；保留"返回项目列表"作为次选。若页面有多个 query，一并 refetch 或只 refetch 主实体。
- **验证**：mock 失败 → 点重试 → 断言 refetch 调用且 URL/筛选不变；e2e 可选。
- **风险**：低。
- **分级**：A1（错误路径功能受损，数据正确）。

### C. LoadingSpinner 防闪（P1，小）

- **价值**：快速请求也会立刻闪全页 spinner（14 处实际挂载）。
- **现状**：`LoadingSpinner.tsx` 单组件，无 delay。
- **方案**：组件内加 250ms 延迟挂载（`useEffect` + timeout），或加 `delayMs` prop 默认 250；保留 opt-out。
- **验证**：fake timers 单测（<250ms 不渲染、≥250ms 渲染）；检查现有测试是否断言立即出现。
- **风险**：中低；测试期望需同步。
- **分级**：A0/A1（观感）。

### D. Dashboard 饼图 → 100% 堆叠条（P1，契约债）

- **价值**：`Dashboard.tsx:256` 项目健康占比仍用饼图，违反 DV-4。
- **现状**：4 类（OVERDUE/ACTIVE/PLANNING/其他），带点击跳转与 aria/tooltip。
- **方案**：换横向 100% 堆叠条或分组条形；保留 4 类颜色（Okabe-Ito）、点击跳转、键盘可达、tooltip 文案。
- **验证**：截图、对比度、键盘/读屏文案；`verify:colors`。
- **风险**：低中（图表视觉变化）。
- **分级**：A1（契约/可读性）。

### E.（P2，可并入 A）`alert.tsx` 图标定位

- `alert.tsx:7` 仍是绝对定位 + `pl-7` 魔法数；上游已改 grid。纯样式清理，和 A 同批做，低优先。

## 4. 验证先行清单（Batch 0，0.5 天，不改代码）

1. **1366/1600 复现 U06/U16**：默认预设下名称列是否仍截断；若已修，删除该项；若仍截断，定位是列宽预算还是字号/内边距。
2. **批量隐藏选择**：选中若干行后筛选掉一部分，确认批量条显示 hidden 数、清除隐藏可用、删除确认含分项；不足则只补文案。
3. **导入坏文件实测**：造 3-5 行错误（格式/外键/重复），看错误是否定位到行/字段、失败行能否重导、重复是否有覆盖/跳过选择；据此决定增强范围。
4. **甘特 24px 文本量测**：拿真实字体/字号量"简称+进度"能否放入 24px 条内；同时验证 today line 与标签的层级；产出 spike 结论，不直接改。

## 5. 批次与门禁

- **Batch 0**：验证先行清单（只读/截图/手工，无代码）。
- **Batch 1**：A + B + C（各自独立 commit/PR；T0：lint:ui + typecheck + targeted jest）。
- **Batch 2**：D（+E 可选）。
- **暂缓**：甘特、导入增强、空态组件化、导航 icon 折叠（需先装 `@radix-ui/react-tooltip`，未排期不预装）、Agent 工作台。

每条门禁：

- T0：`npm run lint:ui` + `npm run typecheck` + 受影响测试。
- T1（碰 CSS/渲染）：`verify:states --profile projects/dashboard` + `verify:colors`。
- 交付前：双主题截图人眼 + 认知走查四问；新浮层走 Radix 原语与全局 z 阶梯。

## 6. 明确不做

- 不引入 ProTable `columnsState` / 不迁移 TanStack Table。
- 不全局重构空态 CSS / 不做无权限空态（等产品需求）。
- 不重写导入功能（先查缺口）。
- 本批不碰甘特（近期修复密集，先 spike）。
- 不预装 `@radix-ui/react-tooltip`（等导航 icon 折叠排期）。
- 不做 Agent 工作台（方向级）。

## 7. 一句话

调研语料是"可能性清单"，不是"实施清单"。当前代码已经消化了其中 3 项；真正剩下的是 4 个小修 + 1 个契约债，先复现、再动手。

## 8. Batch 0 验证结果（2026-11-15，四路并行实测）

### V1 列宽/截断（U06/U16）

- 机制正常：1366 紧凑档名称列 **185px**、档位隐藏正确（编号/组件/交付/迭代/实名）、零横滚；1600 中档 **172px**、仅藏组件、零横滚。
- **U16 复现**（1600 文本截断），根因两个，均非"要新建列折叠"：
  1. **列预算漏算间距**：注释声称 1284≤1300@1600，但 13 列 × 8px gap = 104px 未计入（fixedTracks 1298 + 104 = 1402 > 1300）→ 全列等比缩 0.926，名称 186→172；
  2. **格内挤压梯**（`App.css:2587` `@container ≤190px`）：文本底被压到 **44px**，标签（min 30px）+ 分解钮（24px）+ 警示 chip 挤占——"约 52px"观感的真实来源。
- 裁决：修预算算术；复测后再决定是否调挤压梯。

### V2 批量隐藏选择（U18）

- 主体已覆盖：`"4 selected visible 1 · hidden 3"` + `Drop hidden (3)`；clear-hidden 行为正确（二轮复现一致）。
- 唯一缺口：删除确认 `"Delete 7? (SR 2 / AR 5)"` **无 hidden**（条上有、确认上丢）。双证：`en-US/projects.json:490` 无插值 + `BulkActionBar.tsx:254` 只传 `{n,sr,ar}`。一行级修。

### V3 导入错误粒度

- **行定位数据已有、出口丢弃**：`ImportError.ts:158` 带 worksheet/row/column/field/suggestion，`toJSON()` 已生成 location；但 `ExcelImporter.ts:1076` / `ExcelImporterV2.ts:1369` `map(e => e.detailedMessage)` 压平成字符串。
- 附带缺陷：坏外键（Ghost-Role）**静默吞掉**；`validateDuplicates` 撞名整批 cancel，掩盖其余行错误。
- 失败行导出：无。覆盖/跳过策略：无（与 IP-05"同名≠身份"冲突，需产品裁决）。
- 裁决：最小修（出口带 location 前缀，不破 API 契约）值得做。

### V4 甘特 24px 量测

- bar 24px / 堆叠 26px（DV-5 吻合）；标签 10px/15px 行高。
- bar 宽度分布（27 根 live）：min 163 / 中位 458 / max 691；最窄 163 − 12px padding = **151px 可用 > 最长组合 ~139px**（"8 字简称+92%"）。
- today line 层级正确（bar 后绘覆盖线，交点 elementFromPoint 5/5 命中 bar）。
- 裁决：条内"简称左+进度右"分栏**可行**，不改高度、不降字号。

## 9. 最终批次（Batch 0 实测后定版，修正 §3/§5）

**Batch 1 —— 小修（各自独立 commit，T0 验证）**

| # | 内容 | 位置 |
|---|---|---|
| 1 | Badge 色语言对齐 token | `badge.tsx:18-22` → `--status-{success,warning}-solid` |
| 2 | ProjectDetail 重试改 refetch | `ProjectDetail.tsx:321` |
| 3 | 批量删除确认补 hidden 插值 | `BulkActionBar.tsx:254` + en/zh locales |
| 4 | 列预算补 gap 算术，消除 1600 等比缩 | `Projects.tsx` REQ_COLUMNS 预算/注释（改完复测 V1） |
| 5 | 导入错误出口带行/字段前缀 + 坏外键不再静默 | `ExcelImporter.ts:1076` / `ExcelImporterV2.ts:1369` |
| 6 | LoadingSpinner 250ms 防闪 | `LoadingSpinner.tsx` |
| 7 | （视 4 复测）挤压梯文本底调整 | `App.css:2587` |

**Batch 2 —— 契约债/清理**

| # | 内容 | 位置 |
|---|---|---|
| 8 | Dashboard 饼图 → 100% 堆叠条（DV-4） | `Dashboard.tsx:256` |
| 9 | alert 图标 grid 化（随 #1 同批） | `alert.tsx:7` |

**Batch 3 —— 功能（V4 已证可行）**

| # | 内容 | 备注 |
|---|---|---|
| 10 | 甘特条内"简称+进度"分栏 | 10px 字号不变；宽 <150px 的 bar 维持既有 ellipsis |

**继续不做**：导入失败行导出（等 #5 落地后的增量）、覆盖/跳过策略（等产品裁决"同名≠身份"）、空态全局收编、无权限空态、导航 icon 折叠（`@radix-ui/react-tooltip` 未排期不预装）、Agent 工作台。

## 11. 执行结果（2026-11-15 定版，分支 fix/ui-batch1）

| 项 | commit | 结果 |
|---|---|---|
| 语料精简入库 | (docs) | ✓ README/digest/JSON/review/supplement/manifests，raw+备份 gitignore |
| ① badge token | 1b5e1d6 | ✓ |
| ⑧ dashboard token | f7d2a0f | ✓（orange 当时保留，后由 D1 收口） |
| ② retry refetch | 5d9aa65 | ✓ |
| ③ hidden 确认 | 14deff8 | ✓ 实测 `Delete 7? (SR 2 / AR 5 · 4 hidden)` |
| ④ 列预算含 gap | 46933c1 | ✓ 两档 scale=1 零横滚 |
| ⑦ 挤压梯 190→176 | 9bb212d | **引入回归**（见下） |
| ⑤ 导入错误定位 | f12e38f | ✓ +2 集成守卫用例 |
| ⑥ spinner 防闪 | bb02e02 | ✓ +3 守卫用例 |
| ④' 编号列 80 恢复 | f3d58f3 | ✓（双主题截图走查抓到 56px 短码换行） |
| ⑦' +AR 保护修复 | ff44e6c | ✓ verify-states **107/107**（盲评 B1-1，基线对照确凿回归） |
| B1-6/7 收敛+测试 | (refactor) | ✓ formatWithLocation 单一定义点 + 新键 2 测试 |
| D1 risk token | 2da3683 | ✓ 用户裁决 a：--status-risk-* 双主题 + ledger 登记 |

**回归链复盘（EXP-NEW 候选 ×2）**
1. **参数脱耦**：④ 的预算修正使默认 name 轨宽 186，而 ⑦ 的梯子阈值降到 176 → 176<186≤190 保护空档，+AR 分解钮被裁 0px。双防线各自命中：视觉走查抓编号列、全称检查器抓 +AR 钮。候选静态断言：「梯子阈值 ≥ 任何默认档 name 轨宽」。
2. **容器查询死规则**：梯子内 `.requirements-name{gap:3px}` 自 2026-10-11 从未生效（container-type 在元素自身，查询选不中自身；子件规则可中）。已改子件负边距等效。

**门禁终态**
- verify:states projects：107/107（含悬停位移/贴锚/遮挡全称断言）
- verify:colors：50 条未登记 = 基线同级，本批零新增（risk token 8 条已按 token-definition 范式入 ledger）
- verify:pr --skip-e2e：exit 0
- 盲评（frontend-ui-reviewer，judged 三节）：P1 簇已修销，P2 已裁决落地，P3 三项收/记

**遗留清单**（不随本批）：导入覆盖/跳过策略（等 IP-05"同名≠身份"裁决）、失败行导出（#5 增量）、G2 守卫（dashboard fixture 四型告警全覆盖）、PersonWorkload.css 48 条存量色彩债、AR 长码 nowrap+全文可达（存量 NIT）、服务端 3110 常驻实例需重启才见 ⑤ 效果。
