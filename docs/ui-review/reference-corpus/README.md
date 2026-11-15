# UI 参考语料总索引（2026-11-15）

> 目的：把四轮采集收口成一份可查索引——外部设计社区两轮、设计系统文档、内部红线审计。
> 详细数据在子文件；本页只做跨轮合并、取舍与证据折扣声明。
> 原始调研数据文件（notes JSON / digest MD）仅保留在本地，不入库。

## 1. 文件地图

| 文件 | 内容 | 用途 |
|---|---|---|
| `status-family-supplement.md/.json` | 状态/空态/加载族设计系统补充 37 条 | 外部缺口补齐 |
| `raw-pool.jsonl` / `raw-pool-2.jsonl` | 两轮候选池（340 + 380） | 抓取原始候选 |
| `raw-details.jsonl` / `raw-details-2.jsonl` | 两轮 detail 正文（106 + 49） | 分析输入 |
| `analysis-wave1/2/3-partA/B.json` | 六份分波分析 | type/证据/可借点/裁决 |
| `scrape-manifest.json` / `scrape-manifest-2.json` | 抓取清单、配额、失败、关键词状态 | 复现依据 |
| `*.v1.*` / `*.round2-old.*` / `*.premerge` | 历史版本备份 | 回滚/对照 |

## 2. 采集口径（先读）

- **外部采集第一轮**：搜索列表端点被风控（持续 `DataFetchError`），31 个关键词仅 4 个返回数据，27 个 `raw=0`；`detail` 端点全程可用，得 106 条正文。
- **外部采集第二轮**：更换新会话后搜索恢复；22 个补搜词全部成功、0 blocked；新增候选 380 条、detail 49 条。
- **归属口径**：搜索端点按批返回、缓存按调用分组，**逐词归属不可得**。family 以标题推断为主，单关键词条目用关键词兜底，批次关键词保留在 `batch_keywords`。
- **关键词产出**：取自搜索缓存 `keyword_results.count`（API 计数），单页上限 20、`has_more` 表示还有下一页；**不要把 20 当作总量**。
- **设计系统文档**：Mobbin 需登录、Bryntum 路径失效、Pro/Arco/TDesign/Semi 文档站为 SPA 空壳——能取到的取正文，取不到的读 GitHub 源码；未编造。
- **内部红线**：只读审计台账 `docs/ui-review/experiences.md`、`docs/UI_GENERATION_CONTRACT.md`、相关页面源码与 git log。

## 3. 总量

| 指标 | 数量 |
|---|---|
| 候选池 | 720 |
| detail 正文级 | 155 |
| 方法级（方法长文/案例/科普） | 81 |
| 空壳 | 16 |

类型分布：方法长文 63、图集 52、科普 12、真实改版案例 6、广告 6、空壳 16。

分族覆盖：

| Family | 候选 | detail | 方法级 | 空壳 |
|---|---|---|---|---|
| 甘特/泳道 | 153 | 41 | 21 | 6 |
| 表格 | 116 | 23 | 13 | 1 |
| 工作台/看板 | 137 | 21 | 7 | 2 |
| 导航 | 44 | 20 | 10 | 1 |
| 状态/空态/加载 | 156 | 16 | 7 | 1 |
| 批量/确认 | 30 | 13 | 7 | 2 |
| AI/Agent | 84 | 21 | 16 | 3 |

设计系统补充（状态族）：37 条 = 可直接借 12 / 需改造 15 / 冲突淘汰 4 / 明示不采纳 6。

## 4. 按落点归并的「可直接借」（跨轮收敛）

### 4.1 Projects 需求台 / 复杂表格

- **折叠低优先列替代横滚**：四方收敛——外部 13 寸真实改版案例 + AntD `column.responsive` 断点 + ProTable `columnsState` + 既有 `RowDetailDrawer`。渲染派生层不写回持久化列集，否则撞 D5b；被隐字段仍由抽屉承接。
- **列设置模型**：`columnsState{persistenceType,persistenceKey,defaultValue,value,onChange}` + `ColumnsState{show,fixed,order,disable}`；`persistenceKey` 内嵌列集版本，只存用户显式列。当前表自绘、未用 TanStack（8.x 已在依赖）→ 需手写。
- **工具条收拢**：`options{setting,density,reload,fullScreen}` 收进单一图标（ProTable ToolBar；density 改行高需过 `verify:states`）。
- **行高与结构**：56px 行高、可展开行、统计行克制、单元格级校验（外部补充批方法级）。
- **数字格式**：千分位、数字列右对齐、单位小写、无数据显示 `--`（AntD data-format）；**失败不得落成 `--` 或 0**，须区分不可用与失败（EXP-005/DV-8）。
- **截断**：必须可达全文（IX-4），不能只给 `title`；AntD `ellipsis` 淘汰。
- **虚拟滚动**：只借固定行高 `listItemHeight` 思路，不引 antd、不引横滚（IX-6/D5b）。

### 4.2 甘特 / 泳道

- **条内分栏**：24px 条内只放「项目简称 + 进度底色」，负责人/日期移到条右外侧（DHTMLX `text-block-for-task`，`task_text` + `rightside_text`）。
- **条高/行高解耦**：可分别设 60/70，印证 24/26 合法，不必为排满拉高行（`resizing-rows`）。
- **今日线**：可编程 marker + 低层虚线 + 标签不透明底遮断（`markers`，文档不保证 z-index，需自测；与 08a75f3/1a11928 裁决一致）。
- **键盘编辑**：单击开编辑，Enter 提交、Esc 取消、Tab 跳格；Enter 开抽屉、Esc 回原元素焦点（`inline-editing`、`keyboard-navigation`）。
- **按类型分表单**：assignment/phase 不同字段集、同名抽屉（`default-edit-form`）。
- **离散缩放**：Day/Week/Month/Year 下拉，不做连续缩放；补 fiscal week 档，缩放后按「当前可见值」回锚（IX-7，`zooming`）。
- **基线**：压到主条下缘 2px 并淡化，仅聚焦/选中显示（`inbuilt-baselines`）。
- **重叠分配**：半透明底条在后 + 实条在前，底条不可点（`split-tasks`）。
- **依赖线**：点击选中 + 可键盘遍历列表作为等价路径，不用 dblclick、不用 hover 才出的把手（`crud-dependency`）。
- **过滤**：保留上下文时自做 dim，不照搬隐藏（`filtering`）。
- **泳道可借**：团队泳道 + 条上人数进度、阶段横条 + 图例/线型双编码、稳定 ID 受控更新——均需过 DV-5（24px/26px）。

### 4.3 Dashboard / Reports

- **结构**：侧栏 + 页头 + KPI 条 + 交互面积图 + 数据表同屏，自上而下总览→明细（shadcn `dashboard-01`）；模板无筛选栏，筛选持久化只能自研。
- **KPI 分组**：单卡内分隔 + 24 栅格 colSpan + `headerBordered`（ProCard），不搞「每指标一卡」六卡墙（DV-4）；建议 1 主 KPI + 组内分隔 + 右栏洞察。
- **KPI 数字**：`value/prefix/suffix/precision/loading/groupSeparator`（Arco Statistic）；须补 unavailable + error 态，高频刷新关 countUp；失败不得显 0（EXP-005），分母排除停用人员（EXP-011）。
- **图表**：四态容器（DV-6）、基线 0（DV-3）、Okabe-Ito ≤4 类；饼图/雷达/环形/仪表盘淘汰（DV-4），占比改 100% 堆叠条。
- **自研增量**：筛选持久化与深链、右栏洞察区、图表四态容器、KPI「不可用」表达——公开模板均无可靠范例，应直接写进 Dashboard/Reports 契约。

### 4.4 侧边导航

- **骨架已同构**：`SidebarContent` 内滚 + `SidebarFooter` 贴底（shadcn 源码），与我们 `.nav-list{flex:1;min-height:0;overflow-y:auto}` + `.sidebar-footer{flex-shrink:0}` 一致，保留即可。
- **icon 折叠 + tooltip**：`collapsible="icon"` + `SidebarMenuButton tooltip`（仅 collapsed 且非 mobile）；需补 `@radix-ui/react-tooltip`（当前唯一缺的原语）+ `aria-label`；footer 只留图标。
- **多级**：右侧附加面板或单层 `SidebarMenuSub`，不手风琴层层嵌套（antd inline menu 淘汰）；1366 下需验主区挤压、层序全局阶梯（EXP-018）、IX-3 焦点。
- **计数徽标**：复用 `ui/badge.tsx`，不新增 `SidebarMenuBadge`（OWNER_DUPS 冻结债）。
- **外部可借**：菜单搜索、场景/工作区切换、间距分组；hover 展开面板、手势、手风琴二级淘汰（D7/IX-6/IX-7）。

### 4.5 状态 / 空态 / 加载

- **空态原语**：shadcn 官方 Empty 组装件（六件套 + `max-w-sm` + `border-dashed`）我们完全没用——应收编为唯一空态原语，替换四套并列实现（`App.css:840` / `reports.css:110` / `reports.css:434` / IntakeInbox 私有）。
- **四分类矩阵**：无数据 / 筛选无结果 / 无权限 / 加载失败，各有文案与动作；「无权限」全站 0 实现（CP-3、EXP-005）。
- **骨架尺寸**：表头 48px、表格行 52px（`TableCell p-4` + `text-sm/20`）、图表 200px——Ant/Semi 文档都没有 CLS 指引，以本地实测为准；>1s 才用骨架（IX-6）。
- **Spin**：`delay` 250–300ms 防闪烁；二次加载用遮罩保留旧内容（现 18 处 LoadingSpinner 一进入就闪）。
- **错误态**：可重试且保留上下文；`ProjectDetail.tsx:321` 用 `window.location.reload()` 丢上下文；`PersonAllocationChart.tsx:352-358` 图表错误无重试。
- **徽标**：`badge.tsx:18-22` 硬编码 `bg-green-700/text-white`、`bg-yellow-700`，与 `.badge-success` 的 `--status-*-soft/text` 是两套色语言，违反「压深不靠亮底」；须改 token（单一 owner）。
- **空态文案**：非交互插图、帮助性文案、不伪装操作、统一 IP 承接情绪（外部补充批）。

### 4.6 批量 / 确认 / 导入

- **选择作用域**：全选显示「当前页 N 条 / 全部数据」（Arco `preserveSelectedRowKeys` 能力已有，我们已用 Set+sessionStorage；缺的是把作用域+条数写进批量条，U18）。
- **确认与可逆**：破坏性二次确认 + 3 秒回退（`BulkActionBar`）+ busy 防双发 + 可逆（E1–E3）；单批 2000 上限（`Projects.tsx:136`）；入口禁静默禁用（EXP-023）。
- **导入**：模板下载（必填/格式/示例）、逐行错误原因、失败行导出重导、重复数据覆盖/跳过（外部SOP 长文）；断点续传对本地 SQLite 桌面端收益低，不做。
- **人在回路**：六步流程（`6aa94b1e`）→ Agent 工作台分级确认与批量范围锁死（E3/U18）。

### 4.7 Agent 工作台（方向）

- 以「目标输入→任务拆解→执行状态→结果可控→失败补救→历史→协作权限→交付」组织页面，替代单聊天框（外部421/505）。
- 每个执行节点标「需我确认」，提供重试/回退/继续修改；多 Agent 可用时间轴表达（外部参考）。
- 只借组织方式，不借视觉；与「需求进入→分流→排产→盯超载」映射。

## 5. 硬冲突淘汰（统一清单）

- 双 Y 轴（DV-1）
- 饼图/环形/雷达/gauge/六卡墙（DV-4；Dashboard 现有 PieChart 是待还债）
- 今日线压条/压标签（08a75f3/1a11928 已裁决相反方向）
- 固定列 + 横滚（D5b 零横滚）
- 截断只给 `title`（IX-4）
- hover 跟随 tooltip、hover 几何位移、hover 才出拖拽把手（EXP-001/D7）
- 自造 z-index / 不挂全局层阶梯的浮层（EXP-018）
- 手风琴多级导航 / hover 展开面板（D7）
- 第二套 badge 实现（OWNER_DUPS）
- 内容地板当拖拽下限（D5b）
- 对隐藏选择批量执行 / 入口静默禁用（U18/EXP-023）
- 单一通用空态 / 只做两态（CP-3/DV-6）
- 行尾新增「通过/驳回」操作列（cd0b2e3 已有宽度债）

## 6. 已知技术债 / 缺陷线索

- `badge.tsx:18-22` 硬编码色，与 token 两套色语言
- `alert.tsx:7` 绝对定位图标 + `pl-7` 魔法数（上游已改 grid）
- `ProjectDetail.tsx:321` 重试 `window.location.reload()` 丢上下文
- `PersonAllocationChart.tsx:352-358` 图表错误态无重试
- 四套空态实现并列：`App.css:840` / `reports.css:110` / `reports.css:434` / IntakeInbox 私有
- `Dashboard.tsx:256` 仍用 PieChart（DV-4 欠账）
- 操作列 88px 装 112px 内容（`cd0b2e3`）
- 行内输入 24px 触控债（`App.css:2419`）
- 约 18 处 LoadingSpinner 立即显示导致闪烁
- 路由焦点管理 IX-3 未做

## 7. 证据折扣声明

- **52 条图集未做视觉审阅**：`evidence=图集候选(未看图)`，引用时必须 discount。
- **155 条正文级**：type/borrow_points 由分析 agent 判定，证据等级见 `evidence` 字段。
- **family 是标题启发式**：跨族边界（如「AI 甘特图」「表格批量操作」）可能归类偏差；引用时以 `borrow_points.target` 为准。
- **关键词产出是单页计数**（≤20），`has_more` 表示还有下一页；不要当总量。
- **设计系统补充**：TDesign/Semi 部分页面不可达，已用 GitHub 源码/README 补；未取到的在 supplement 首节逐条登记。

## 8. 建议的落地顺序

1. **P0 折叠列 + 列设置持久化**：四方收敛、风险最低、直接治 1366 名称截断（U06/U16）；顺手暴露 `@radix-ui/react-tooltip` 缺口。
2. **P0 空态原语收编 + 四分类**：四套实现、CP-3、无权限缺失；shadcn Empty 直接可用。
3. **P1 批量选择作用域**：U18，能力已有，只差 UI 表达。
4. **P1 小切面修复**：Spin delay、错误重试保留上下文、badge token、alert grid。
5. **P2 甘特条内外分栏 / 离散缩放 / 键盘编辑**：需先验证 24px 高度与 z-index。
6. **P2 导入错误反馈**：模板/逐行错误/失败行导出。
7. **P3 Agent 工作台**：方向级，等真实需求。

## 9. 来源可达性备忘

| 来源 | 状态 | 替代 |
|---|---|---|
| Mobbin | 登录墙，`/explore` 仅缩略图 | shadcn blocks、Ant Design Pro |
| Bryntum Gantt | 所有路径落 Suite 概览 | DHTMLX styling-guide、Frappe Gantt issues |
| Pro/Arco/TDesign/Semi 文档站 | SPA 空壳 | GitHub 源码/README |
| 外部采集搜索 | 第一轮被风控；换新会话恢复 | 先换会话再重跑，不要长时间重试 |
| 外部采集 detail | 全程可用（中途短暂限流） | 退避重试即可 |
| 外部图集 | 方法在图中 | 需人工看图，不声称已审阅 |
