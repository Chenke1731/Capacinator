# 状态族外部资料补编（空态 / 骨架 / 错误 / 加载 / 徽标）

采集日期：2026-11-15
触发：外部采集 search 端点被封，状态/空态/加载族候选池为 0（见本地调研 digest 采集状态节），改从设计系统文档补齐。
性质：**只读外部资料 + 本地基线核对**，不含代码改动。

---

## 采集状态（先读这段，含取不到的站点）

| 目标 | 结果 | 说明 |
|---|---|---|
| ant.design × 6（empty/skeleton/alert/result/spin/badge） | **取到** | 正文可读；API 表完整，demo 源码未内联（页面只给 demo 名 + 文字说明） |
| ui.shadcn.com/docs × 3（skeleton/alert/badge） | **取到（文档层）** | skeleton 源码在 "View Code" 折叠内未取到；alert/badge 文档可读 |
| ui.shadcn.com/docs/components/**empty** | **取到**（任务清单外，本轮最高价值发现） | 同栈官方已有 Empty 组装件，我们完全没用 |
| ui.shadcn.com/r/styles/new-york-v4/{empty,alert,badge}.json | **取到全源码** | 绕过 `View Code` 折叠，拿到 registry 原始 tsx |
| tdesign.tencent.com/react/components/empty | **取不到** | SPA，两次尝试（默认 / `?tab=api`）均只返回标题 "TDesign Web React"，无 DOM 内容 |
| └ 转 GitHub `Tencent/tdesign-react` `packages/components/empty/empty.md` | **取到（仅 API）** | 有完整 props 表与 `type`/`size` 枚举；无示例、无设计指引 |
| semi.design/zh-CN/feedback/empty | **取不到** | 重定向到官网首页，无组件文档 |
| semi.design/en-US/feedback/empty | **取不到** | 同上，落地首页营销内容 |
| semi.design/zh-CN/feedback/**skeleton** | **取到** | 有 props、默认尺寸、组合示例 |
| └ 转 GitHub `packages/semi-ui/empty/README.md` | **取不到** | HTTP 404 |
| └ 转 GitHub `content/feedback/empty/index.md` | **取不到** | HTTP 404 |
| └ 转 GitHub `packages/semi-ui/empty/index.tsx` | **取到（源码级）** | 拿到 EmptyProps、`layout`、`darkModeImage` 与渲染结构 |
| ui.shadcn.com/r/empty.json、/r/alert.json | **取不到** | HTTP 404；改用 `/r/styles/new-york-v4/*.json` 成功 |

**未取到 ≠ 无内容**：TDesign Empty 的示例与设计指引、Semi Empty 的文档正文（何时使用/设计规范）本轮缺失，下文对这两者只引用 API 层面的确证事实，不补写。

### 裁决图例

| 裁决 | 含义 |
|---|---|
| 可直接借 | 结构与我们的契约一致，照抄即可（含"照抄为规则而非组件"） |
| 需改造 | 方向正确，但必须改字段/尺寸/交互才能进我们的契约 |
| 否 | 明示不采纳（已有等价物，或引入即重复建设） |
| 冲突淘汰 | 与我们既有契约/红线直接冲突，引入即回退 |

---

## 0. 本地基线快照（判定"已有 / 缺失 / 需改造"的依据）

| 能力 | 现状 | 结论 |
|---|---|---|
| 空态原语 | **无**。三套并列：`App.css:840 .empty-state`（4rem 内距 + 3rem icon）、`reports.css:110 .report-empty-state`（2rem + 图标/标题/描述/链接）、`reports.css:434 .table-empty-state`（2rem 纯文本）、`pages/IntakeInbox.tsx` 私有 `.intake-empty` | **缺失统一 owner**；lint:ui 规则 6/7 已把 `.empty-state` 锁成单 owner，新原语必须收编而非并列 |
| 空态四分类 | 仅 `IntakeInbox.tsx:309-335` 做了「筛选无结果 / 收件箱为空」二分 + `:217-232` 计数失败显示 `—` 且可重试。其余列表页（`DataTable.tsx:132-136`、`ReportTable.tsx:76`）单分支 `common:noData` | **正例仅 1 页**；CP-3 四分类（无数据/筛选无结果/无权限/加载失败）中「无权限」**全站 0 实现**（grep 403 forbidden unauthorized 仅命中 permission 管理页，非空态） |
| 骨架 | `skeleton.tsx` 极简（`animate-pulse rounded-md bg-muted`，无尺寸 API）；消费仅 `pages/ProjectDetail.tsx:270-305` | 与 IX-6 记录一致（"骨架仅 2 源文件"）；表格/图表/报表**零骨架** |
| 加载 | `LoadingSpinner.tsx`（min-h 200px + spinner + 文案）18 处消费；`DataTable.tsx:121` 自建 `h-64` spinner 块 | **无延迟**，快请求会闪；两套加载块高度（200 / 256） |
| 错误 | `alert.tsx` 仅 `default`/`destructive` 两 variant，图标用绝对定位；`ErrorMessage.tsx` 只有 message/details，**无动作槽**；`ProjectDetail.tsx:310-330` 有 Alert+Retry+Back（但 Retry 是 `window.location.reload()`） | **无统一"可重试错误"配方**；图表错误态**无重试**（见 R-08） |
| 徽标 | 两套：shadcn `badge.tsx`（default/secondary/destructive/outline/**success/warning**，7 文件消费）+ `App.css:324-384` 遗留 `.badge-*` 13 类（badge-primary/success/warning/danger/secondary/info/blue/green/orange/purple/gray） | **已是两套实现**，且 `badge.tsx:18-22` 用 `bg-green-700 text-white` / `bg-yellow-700 text-white`，与 `.badge-success` 的 `--status-success-soft`/`--status-success-text` **两套色语言** |
| 图表四态 | `PersonAllocationChart.tsx` 有 loading/error/empty/full，但 error 无动作（`:351-359`） | DV-6 的"error（坏了什么 + 怎么修）"未满足 |

---

## 1. 空态

| ID | 来源 URL | 做法 | 对应我们的组件/页面 | 裁决 | 与现有契约的关系 |
|---|---|---|---|---|---|
| E-01 | https://ui.shadcn.com/docs/components/empty ｜ 源码 https://ui.shadcn.com/r/styles/new-york-v4/empty.json | 六件套组装：`Empty`（`flex flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center`）→ `EmptyHeader`（`max-w-sm`，内含 `EmptyMedia`/`EmptyTitle`/`EmptyDescription`）+ `EmptyContent`（`max-w-sm`，放动作）。`EmptyMedia variant="icon"` = `size-10 rounded-lg bg-muted` + `svg size-6` | 新 `client/src/components/ui/empty.tsx`，作为**唯一空态原语**；替换 `DataTable`/`ReportTable`/`ReportEmptyState`/`IntakeInbox` 私有实现 | **可直接借** | CP-3；`max-w-sm` 约束正好治我们 `DataTable` 空态在 1600 视口被拉成一行超宽文本 |
| E-02 | https://ant.design/components/empty | 双预制图分级：`PRESENTED_IMAGE_DEFAULT`（整页/大区块）与 `PRESENTED_IMAGE_SIMPLE`（轻量内嵌），配 `imageStyle` 调尺寸 | 我们已有事实上的三档内距（`.empty-state` 4rem / `.report-empty-state` 2rem / `DataTable` h-64），但无契约 | **需改造** | CP-3 + lint:ui 规则 6/7（owner 唯一性）；改造 = 只保留 sm / md 两档（由 `size` prop 决定）并由原语内部决定内距，禁止调用方各写 padding |
| E-03 | https://ant.design/components/empty | 动作放 `children`（`footer` 语义槽），Ant 文档明确"footer 控制上边距与按钮样式" | 对应我们所有空态的"一个动作"位 | **可直接借** | CP-3「空态 = 说明该有什么 + 一个可执行动作」；我们 `ReportEmptyState` 的 `actionLink` 已是此形，缺的是推广到表格 |
| E-04 | https://raw.githubusercontent.com/Tencent/tdesign-react/develop/packages/components/empty/empty.md | `type` 枚举把**错误**塞进空态组件：`empty / success / fail / network-error / maintenance` | 我们的空态原语**不得**接受 error 类 | **冲突淘汰** | 与 EXP-005/U05「失败≠空态」直接冲突：`IntakeInbox.tsx:299` 已立规"失败独立呈现可重试"。失败走 `Alert`/错误配方，空态只表达"没有内容" |
| E-05 | 同上（`size: small/medium/large`） | 三档尺寸 | 我们容器只有两类（表格内 / 整页区块） | **需改造**（取两档，弃 large） | 第三档无对应容器，属为组件而组件；`verify-states` 的贴锚/越界检查按容器计量，多一档就多一组要验的组合 |
| E-06 | https://ant.design/components/result（`status="403"`） | 无权限用独立 `status`：图标语义 + 标题 + `subTitle` + `extra` 一个"回可访问处"的按钮；**不给重试** | 我们**零实现**（见第 0 节）。落到页内区块：`Empty` + 权限名 + "返回{上级}" | **需改造** | CP-3 四分类之「权限」；Ant 用整页 Result，我们是区块级，故需降级为 Empty 形态。关键借点是"403 不配重试"——重试无意义（见 R-07） |
| E-07 | 源码 https://github.com/DouyinFE/semi-design/blob/main/packages/semi-ui/empty/index.tsx | `darkModeImage` prop：组件内用 `MutationObserver` 监听 `body[theme-mode]` 切换深色图片 | 我们双主题走 CSS 变量（`--status-*`/`--bg-*`），组件不感知主题 | **冲突淘汰** | 与"双主题 token 化"红线冲突：在组件内做主题分支会产生第二套主题判定源，`verify:colors` 的 token 推断会漏。主题交给 CSS 变量 |
| E-08 | local: `client/src/pages/IntakeInbox.tsx:217-232 / 300-335`（本地正例，作为落地模板） | 三段独立：①计数失败 → 原地显示 `—` + `role="alert"` + 重试，**不阻断列表**；②`isError` → 独立错误块（`role="alert"` + 重试），**不落成空态**；③`success && rows===0` → 二分 `hasActiveFilters`：有筛选显示 `noMatch` + "清除筛选"（带 `data-testid`），无筛选显示 `empty` + `emptyHint`（Alt+N 动作提示） | 覆盖面：Projects / People / Assignments / AuditLog / Locations / Reports / ProjectTypes 等所有 `DataTable`/`ReportTable` 消费方 | **可直接借** | CP-3 + EXP-005 + DV-8 三重正例；i18n 键结构可直接复制（`inbox.empty` / `inbox.emptyHint` / `inbox.noMatch` / `inbox.clearFilters` / `inbox.countsLoadError` / `inbox.retry`） |

---

## 2. 骨架

| ID | 来源 URL | 做法 | 对应组件/页面 | 裁决 | 与契约关系 |
|---|---|---|---|---|---|
| S-01 | https://ant.design/components/skeleton | 明确分工：Skeleton "**Only works when loading data for the first time**"；"could be replaced by Spin in any situation, but can provide a better user experience"；内容密集（列表/卡片）优先骨架 | `DataTable.tsx:121`（首屏改骨架）、`LoadingSpinner` 18 处消费方按"首次/二次"分派 | **可直接借** | IX-6「>1s 用骨架」+ 新增判据：**首屏=骨架，重取=保留旧内容**（见 L-02） |
| S-02 | https://ant.design/components/skeleton | 尺寸近似原语：`Skeleton.Button block`（撑满父宽）、`Skeleton.Avatar size`、`title.width`、`paragraph.rows` + `paragraph.width` 支持**逐行数组**（模拟文本长短） | 新表格骨架需按 `TableHead h-12` / `TableCell p-4` 生成 | **需改造** | IX-6「尺寸要与表格行高对齐」；我们 `skeleton.tsx` 只有 `className`，无 rows/宽度比例 API → 需在**调用方**按列宽比给 `w-[…]`，或给原语加最小 `rows` 便利层（不得引入第二套 spacing token） |
| S-03 | https://semi.design/zh-CN/feedback/skeleton | 文案规范："**不变的固定内容直接展示固定内容，可变的内容使用骨架屏展示**" | `ProjectDetail.tsx:270-305` 目前把标题/图标等相对静态的卡头也骨架化 | **可直接借** | IX-6 补充判据：骨架只覆盖"将被数据替换"的槽；静态标签保持真实文字（也顺带减少"整屏灰块"的失控感） |
| S-04 | https://semi.design/zh-CN/feedback/skeleton | 默认尺寸给出可对齐的数值：Title **24px 高**、Paragraph **16px 高 + 10px 下边距 / rows=4**、Avatar **48×48**、Button **115×32**、Image 100% | 表格骨架行（目标 52px = 20px 文案 + 32px padding）、统计卡骨架（目标 ~104px） | **需改造** | 数值本身不照抄（我们的行高由 `TableCell p-4` + `text-sm/20` 决定 = 52px），但"骨架元素必须给显式 px 高"这条要落成规则 |
| S-05 | https://ui.shadcn.com/docs/components/skeleton ｜ 本地 `client/src/components/ui/skeleton.tsx` | 同栈原语就是"无尺寸 API 的 div"：`animate-pulse rounded-md bg-muted` + `className`；文档示例覆盖 Avatar / Card / Text / Form / **Table** 五种组装 | 保持原语极简；表格骨架按 Table 组装写 | **可直接借** | IX-6；`animate-pulse` 只动 opacity，符合 DV-7（动画只用 transform/opacity，不动 width/height） |
| S-06 | https://ant.design/components/skeleton ｜ https://semi.design/zh-CN/feedback/skeleton | **两份文档都没有 CLS / 布局抖动的明确指引**（Ant 只有 `width`/`block`/`size` 等间接手段；Semi 只说"默认样式可通过 className/style 自定义"） | 我们的 CLS 判据必须自建 | **否**（文档不提供，不引用为规范） | 如实记录：IX-6 的"尺寸对齐"没有外部权威可引，落地须以**本地实测行高**为唯一依据（见 6.2） |
| S-07 | https://ant.design/components/skeleton（List / Complex combination 示例）+ Semi 表格骨架写法（`Skeleton.Title` 造列头 + `Skeleton.Paragraph` 造行 + 绝对定位遮罩） | 表格骨架 = 真表头 + N 行占位行，而不是一个居中 spinner | `DataTable.tsx:121-131`（现行 `h-64` 居中 spinner）、`ReportTable` | **需改造** | IX-6 + DV-6 的"loading（按来件形状）"；`h-64 = 256px` 与真实表格高度无关，是明确的 CLS 源 |

---

## 3. 错误

| ID | 来源 URL | 做法 | 对应组件/页面 | 裁决 | 与契约关系 |
|---|---|---|---|---|---|
| R-01 | https://ant.design/components/alert | `action` 槽（ReactNode）把重试按钮**放进持久警示条内部**，与描述同一视觉单元 | 抽成统一 `RetryableError` 配方；`ErrorMessage.tsx` 目前**无动作槽**（只有 message/details），需加 | **可直接借** | CP-2「什么坏了 + 怎么修」+ EXP-005「必须有可重试错误」；`IntakeInbox:300-307` 已是此形（文字 + Retry 同行） |
| R-02 | https://ant.design/components/alert | `closable` 是可选项，文档把"可关闭"与"需要用户处理"分成两种用法 | 规则：**数据不可用类错误不可关闭**（可关闭 = 用户能把"数据坏了"藏起来） | **可直接借** | DV-8「要么真实、要么显式不可用」；可关闭会让"D 区块不存在"退化成一个静默空洞 |
| R-03 | https://ant.design/components/alert | 四 type 语义 `success / info / warning / error` + `showIcon` + `description`（补充正文） | `alert.tsx` 现仅 `default`/`destructive` | **需改造** | 同一 owner 内扩 variant 不算第二套实现；但新增 variant 前必须确认 `verify:colors` token 覆盖，避免硬编码色（对照 B-04 的教训） |
| R-04 | https://ui.shadcn.com/r/styles/new-york-v4/alert.json | 新版用 **grid** 定位图标：`grid-cols-[0_1fr] has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] [&>svg]:size-4 [&>svg]:translate-y-0.5`，标题/描述 `col-start-2` | `client/src/components/ui/alert.tsx:7` 现用 `[&>svg]:absolute left-4 top-4` + `[&>svg~*]:pl-7` | **需改造** | 直接关联「贴锚/越界」防线：绝对定位 + `pl-7` 魔法数在 1366 长标题换行时不随首行对齐（正是 `verify-states` 贴锚切片的失效模式）；grid 版本无需魔法数。**这是我们本地文件落后上游的一个具体技术债** |
| R-05 | https://ui.shadcn.com/docs/components/alert（文档示例有 `AlertAction`，绝对定位于右上角）｜ 源码 registry **无** `AlertAction` | 文档与源码版本不一致；`AlertAction` 是"绝对定位右上角" | 不引入 | **否** | ①上游自相矛盾，无法确证行为；②右上绝对定位与"重试应紧邻描述"冲突（用户读文案→找按钮的视线跨度变大）。我们保留内联动作（R-01） |
| R-06 | https://ant.design/components/result（`status="error"`，`extra` 放两个按钮） | 整页/整区块错误配方：图标 + 标题 + `subTitle`（原因）+ `extra`（主次双动作） | `ProjectDetail.tsx:310-330` 已同构（Alert + Retry + Back） | **可直接借** | CP-2；但需修一处：`ProjectDetail` 的 Retry 用 `window.location.reload()` —— 整页刷新会丢筛选/滚动/展开态，违背"保留上下文"。改为 `refetch()`/`queryClient.invalidateQueries` |
| R-07 | https://ant.design/components/result（`403` / `404`） | 无权限/不存在是**独立 status**，不与 `error` 共用动作语义 | 新增规则：**重试只对可重试错误出现**（5xx / 网络 / 解析失败）；4xx 权限与不存在给"返回/申请"，不给重试 | **需改造** | CP-2 + CP-3「权限」；现在 `ErrorMessage` 无法表达"这个错误不该重试"，调用方各自决定 → 正是散落重复的温床 |
| R-08 | local: `client/src/components/PersonAllocationChart.tsx:352-358` | 反例：`.chart-error` 只有一行 `failedToLoad` 文案，**无动作** | 图表/统计四态（DV-6） | **需改造**（缺陷，A1 级） | 直接违反 CP-2 与 DV-6 的"error（坏了什么 + 怎么修）"；且 `.chart-container` 高度 200px 由 `.chart-loading/.chart-error/.chart-empty` 共享（`index.css:713-721`），尺寸稳定这点是做对的，只需补动作 + 保留筛选上下文（brush 区间） |

---

## 4. 加载

| ID | 来源 URL | 做法 | 对应组件/页面 | 裁决 | 与契约关系 |
|---|---|---|---|---|---|
| L-01 | https://ant.design/components/spin | `delay`（毫秒）防闪烁："Specifies a delay in milliseconds for loading state (prevent flush)"；**若在延迟内结束，加载态干脆不出现** | `LoadingSpinner` 18 处 + `DataTable.tsx:121` + `IntakeInbox:294-298`（现一进入就渲染 loading 文本） | **可直接借** | IX-6 的隐含前提：<1s 不该给加载态。建议 250–300ms 阈值；React Query 侧可用 `placeholderData`/`keepPreviousData` 达到同一效果 |
| L-02 | https://ant.design/components/spin | 把内容**嵌进** Spin 而不是替换：`container` 保留子元素并加 mask + opacity 过渡 | 所有 `refetch`（`PersonWorkload:1437`、列表页刷新、场景切换） | **可直接借** | IX-6「异步内容预留尺寸防 CLS」的最优解：二次加载旧内容仍在，高度零变化。落地判据：`isLoading` 走骨架，`isFetching && data` 走遮罩 |
| L-03 | https://ant.design/components/spin | `size` 语义：`small`=行内文字旁、`medium`=卡片块、`large`=整页 | `spinner.tsx`（sm/md/lg，尺寸 16/24/32）+ `LoadingSpinner`（lg + min-h 200） | **需改造** | 我们已有映射但缺"哪一档配哪种容器"的规则；建议写成：行内动作=sm、卡片/图表=md、首屏整页=lg（且该档优先改骨架） |
| L-04 | https://ant.design/components/spin（`fullscreen` + backdrop） | 全屏遮罩阻塞 | 不引入 | **冲突淘汰** | 我们是 Electron 桌面排产工具，用户常并行看多个区块；全屏阻塞会掐掉并行操作（B 支柱"决策流就绪"的反面）。桌面应用的阻塞只允许出现在破坏性确认 |
| L-05 | https://ant.design/components/spin（`percent` / `'auto'`） | 进度百分比 / 不确定进度条 | 不引入 | **否** | 已有 `ProgressBar.tsx` + `OperationProgress.tsx` 覆盖长任务；再引入即第二套进度实现 |
| L-06 | https://ant.design/components/alert（`banner` 模式 + 默认 warning） | 页面顶部条幅表达系统级降级 | 不采用条幅形态；保留 `IntakeInbox:217-232` 的行内计数错误位 | **否** | 1366 垂直预算已被表格吃掉（44/48px 命中区 + 行高 52px），条幅常驻会持续挤压数据区；且计数错误是**局部**事实，条幅会夸大影响面 |
| L-07 | 由 L-02 推出的落地判据（Ant 未直接陈述，标注为本地推论） | 二次加载 = 保留旧数据 + 轻量 busy 指示；首屏 = 骨架 | 全部 React Query 列表/图表 | **需改造** | IX-6 + DV-6；需在 `DataTable` 增加 `isFetching` 与 `isLoading` 两个入口（现只有 `loading` 一个），否则调用方无法表达"重取" |

---

## 5. 徽标

| ID | 来源 URL | 做法 | 对应组件/页面 | 裁决 | 与契约关系 |
|---|---|---|---|---|---|
| B-01 | https://ant.design/components/badge | `status` + `text` 成对使用：状态点必须带文字标签（`<Badge status="success" text="Success" />`）；纯 `dot` 只用于"有新内容"这类非语义提示 | 我们已是文字徽标（`.badge-success` 等 + `lifecycle-state-badge`），符合方向 | **可直接借**（作为规则） | B 支柱「自标注」；也满足双主题对比度要求——颜色不是唯一编码，`verify:colors` 之外多一层灰度可读性 |
| B-02 | https://ant.design/components/badge | `count=0` **默认隐藏**，需 `showZero` 才显示；`overflowCount` 默认 99 → 显示 `99+` | 所有计数徽标 + `IntakeInbox` counts（`—` 表示未就绪） | **需改造** | DV-8：0 与"未知"必须可区分。规则：0 显式显示 `0`，失败/未就绪显示 `—`；溢出显示 `99+` 并在 `title`/详情给出真值 |
| B-03 | https://ui.shadcn.com/r/styles/new-york-v4/badge.json（上游 6 variant：default/secondary/destructive/outline/ghost/link，**无 success/warning**） | 上游刻意不给语义色，语义色靠调用方加工具类 | `client/src/components/ui/badge.tsx` 的 `success`/`warning` 是我们的 fork | **需改造** | 单一 owner 允许 fork，但 fork 出来的语义色**必须走 token**；`ghost`/`link` 无使用场景，不补 |
| B-04 | local: `client/src/components/ui/badge.tsx:18-22` | 反例：`success: "bg-green-700 text-white"`、`warning: "bg-yellow-700 text-white"`——高饱和实底 + 白字；而同语义的 `App.css:338 .badge-success` 是 `--status-success-soft` + `--status-success-text`（浅底深字） | `badge.tsx` vs `App.css .badge-*` | **需改造**（缺陷，A1 级） | 直接违反"颜色压深不靠亮底"与"单一 owner 同 token"：同一业务状态（成功/警告）在同屏可能出现两种视觉重量，且 `green-700` 不随主题切换（深色主题下 `text-white` 对比度与 `--status-success-text` 不一致）。改法：variant 改用 `bg-[var(--status-success-soft)] text-[var(--status-success-text)]` 一族 |
| B-05 | https://ant.design/components/badge（13 个色预设：pink/red/yellow/orange/cyan/green/blue/purple/geekblue/magenta/volcano/gold/lime） | 任意类别色预设 | 不引入 | **冲突淘汰** | 与 Okabe-Ito 默认色板 + "语义色/类别色二分"（DV-2 语义切分）冲突；`App.css` 已有 5 个类别色（blue/green/orange/purple/gray），应收敛到系列色 token，而不是扩到 13 |
| B-06 | https://ant.design/components/badge（`Badge.Ribbon`） | 角标缎带 | 不引入 | **否** | 营销/电商语义，B 端排产无对应信息层级；会与卡片头部的状态徽标抢注意力 |
| B-07 | https://ui.shadcn.com/r/styles/new-york-v4/badge.json（`asChild` + `Slot`） | 徽标可渲染为链接 | 不引入 | **否** | 徽标一旦可点击就获得焦点语义与命中区要求（44px），而徽标高度 ~20px；会制造命中区违规。可点击跳转用相邻的链接按钮 |

---

## 6. 可直接落地的结构（本节是交付重点，不依赖外部文档的措辞）

### 6.1 空态四分类：文案结构 + 动作矩阵

统一骨架（shadcn Empty 组装，`EmptyHeader` 内 icon + title + description，`EmptyContent` 放**唯一主动作**）：

| 类 | 触发条件（严格） | 标题（≤12 字，说"这里该有什么"） | 描述（补一句"它为什么有用/怎么产生"） | 主动作（有且仅一个） | 次动作 | 明令禁止 |
|---|---|---|---|---|---|---|
| **无数据（首次）** | `isSuccess && total === 0 && !hasActiveFilters` | "还没有{对象}"（如"还没有分配记录"） | "{对象}会按{排序维度}排列在这里；创建后立即进入容量计算" | "新建{对象}" | — | 用 `common:noData` 泛化文案；用插图占满 400px 高 |
| **筛选无结果** | `isSuccess && rows.length === 0 && hasActiveFilters` | "没有符合筛选的 {n} 项条件" | 回显筛选值："状态=待处理 · 来源=邮件 · 关键词='登录'"（EXP-005 要求筛选可见标识） | "清除筛选" | "调整筛选" | 显示"暂无数据"（会把筛选失效伪装成数据为空）；不给清除动作 |
| **无权限** | HTTP 403 或权限位缺失 | "没有查看{对象}的权限" | "需要 `{permission_name}` 权限；当前账号未授予" | "返回{上级列表}" | "联系管理员" | 给"重试"（重试永远不会成功）；用错误红色（权限不是故障） |
| **加载失败** | `isError` | "加载{对象}失败" | "{区块}请求失败：{原因摘要}。其余内容不受影响"（说明影响面） | "重试" | "查看详情" | 显示 `0` / 显示空态 / 把整个页面卸载 |

补充硬规则：
1. 四类**不得合并分支**——`isError` 与 `total===0` 必须走不同 DOM 子树（`IntakeInbox` 的三段结构即模板）。
2. 四类在 DOM 上必须可区分（`data-testid` 或 `data-empty-kind="no-data|no-match|no-permission|load-error"`），否则一致性检查无法断言。
3. 计数/摘要失败时显示 `—`（不是 `0`），且该位的重试**只重取计数**，不重取主列表。
4. 空态容器给 `min-height`（表格位建议 240px），避免四态互切时高度跳变。

### 6.2 骨架尺寸对齐表（数值来自本地实测，不是外部文档）

| 区域 | 真实尺寸来源（file:line） | 实测值 | 骨架必须满足 |
|---|---|---|---|
| 表头 | `table.tsx:76` `TableHead h-12` | **48px** | 1 行占位，高度 48px，列宽与真实列 `width` 一致 |
| 表格行 | `table.tsx:90` `TableCell p-4` + `text-sm`(14/20) | **52px / 行** | 每行 52px；行数 = `Math.ceil(可用高度/52)`，不是固定 5 |
| 表格外壳 | `DataTable.tsx:141` `rounded-md border` | — | 骨架复用同一层 `border` 包裹，切换时边框不重绘 |
| 图表 | `index.css:713-721` `.chart-loading/.chart-error/.chart-empty { height:200px }` | **200px** | 四态共用同一 200px 容器（现状已正确，保持） |
| 统计卡 | `StatCard.tsx:56-78` `CardContent p-6` + `text-2xl` | **≈104px** | 两行占位（标题 14px + 值 24px），容器同 104px |
| 详情卡组 | `ProjectDetail.tsx:286-304` 5 卡 | 视内容 | 卡数 = 真实默认卡数，避免切换时滚动条出现/消失 |
| 页级骨架 | `LoadingSpinner.tsx` `min-h-[200px]` | **200px 下限** | 保留 `min-h` 语义（>1s 才显示则由 L-01 的 delay 管） |

硬规则：
- 骨架**只占位将被数据替换的槽**（Semi S-03）：静态标题/表头文字保持真实文本。
- 骨架容器显式 `min-h-[…]`，禁止依赖内部 `div` 撑开。
- 骨架动画只用 `animate-pulse`（opacity），符合 DV-7。

### 6.3 错误：重试位置决策表

| 错误面 | 展示位置 | 动作 | 上下文保留要求 |
|---|---|---|---|
| 首屏主内容失败 | 区块内替换内容（`Alert variant="destructive"`，占原位并 `min-h`） | 重试 | 保留筛选条件、滚动位置、展开行（禁止 `window.location.reload()`） |
| 摘要/计数失败 | 行内原位（`IntakeInbox:217-232` 形态） | 仅重取计数 | 主列表继续可用 |
| 二级区块失败（图表/明细/侧栏） | 该区块内，页面其余可用 | 重试 + 可折叠原因 | 保留已加载区块与 brush/缩放区间 |
| 写操作失败 | 就地 Alert 或 Toast，表单**不卸载** | 重试（仅幂等）或修正后重提 | 保留用户输入 |
| 403 无权限 | 空态（非错误色） | 返回 | — |
| 404 不存在 | 空态 + 返回 | 返回 | — |
| 解析/信封异常 | 区块内错误 + "数据格式异常" | 重试 | 保留筛选 |

错误文案结构（CP-2）：`{对象}加载失败：{原因摘要}。{影响面}。{动作}` → "工作负载加载失败：服务未返回分配记录。图表暂不可用。重试"。

---

## 7. 缺口清单（源码级，供后续批次排期）

| # | 位置 | 缺口 | 关联条目 |
|---|---|---|---|
| 1 | `client/src/components/ui/DataTable.tsx:121-138` | 加载用 `h-64` 居中 spinner（CLS + 非来件形状）；空态**单分支无动作**；**无 error 入口**（调用方各自处理） | S-07 / E-01 / R-01 / L-07 |
| 2 | `client/src/components/ui/ErrorMessage.tsx` | 无动作槽 → 无法表达"可重试错误" | R-01 / R-07 |
| 3 | `client/src/components/ui/alert.tsx:7` | `[&>svg]:absolute` + `pl-7` 魔法数（上游已改 grid） | R-04 |
| 4 | `client/src/components/ui/badge.tsx:18-22` | `success/warning` 硬编码 `*-700 + text-white`，与 `--status-*-soft/text` 双色语言 | B-03 / B-04 |
| 5 | `client/src/components/PersonAllocationChart.tsx:352-358` | 图表错误态无重试、无影响面说明 | R-08 |
| 6 | `client/src/components/ui/LoadingSpinner.tsx` | 无 delay，快请求闪烁；18 处消费无法按"首次/重取"分派 | L-01 / L-02 |
| 7 | `App.css:840` / `reports.css:110` / `reports.css:434` / `IntakeInbox` 私有 | 四套空态 CSS 并列，无唯一 owner | E-01 / E-02 |
| 8 | 全站 | 「无权限」空态 **0 实现** | E-06 |
| 9 | `client/src/pages/ProjectDetail.tsx:321` | Retry 用 `window.location.reload()`，丢上下文 | R-06 |
| 10 | `client/src/components/ui/skeleton.tsx` | 无 rows/宽度比便利 API（表格骨架需逐格手写） | S-02 |

---

## 8. 与既有契约的净增量（避免重复定义）

本补编**不新增**契约 ID，只做三件事：
1. 为 CP-3 提供**可执行的四分类触发条件与文案骨架**（原文只说"说明该有什么 + 一个动作，区分首次/无结果/筛选/权限"，未给判定式）；
2. 为 IX-6 提供**实测尺寸对齐表**（外部文档两份均无 CLS 指引，故尺寸权威只能来自本地）；
3. 为 DV-6/DV-8/EXP-005 提供**错误动作矩阵**（4xx 不重试、计数失败显示 `—`、重试不得整页刷新）。

反向证据（外部权威也支持我们的红线）：
- 「失败≠空态」：TDesign 把 error 塞进 Empty，我们明确淘汰（E-04）；
- 「深色主题不由组件内分支」：Semi 的 `darkModeImage` + MutationObserver 淘汰（E-07）；
- 「语义色必须带文字」：Ant `status + text` 成对使用（B-01）。
