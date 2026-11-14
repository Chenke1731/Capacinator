# UI 评审经验库（experiences）

> 规则：每条经验都必须能追溯到一次事故或一次裁决；`GUARD` 必须附断言草案与变异自证；
> `enforced` 后必须删除对应人工检查项（禁止人机双源）。
> 本文件由 `npm run verify:ui-review` 校验完整性；新增条目走 patch diff 审批，评审员不得直接修改。

```yaml exp
id: EXP-001
source: incident/2026-11-10-capture-btn-hover-clip
class: 几何贴边×悬停位移
mechanism_slice: hover-geometry × ancestor-boundary
disposition: GUARD
guard: proposed — 两级判定：hover 后 rect 距最近滚动容器边界顶边 <4px 即 FAIL（硬底线）；4px ≤ gap < --page-top-gap 记契约漂移 WARN；同排控件高度差 >2px 记 WARN（等高/中线裁决未编号，不用"必须相等"）
verification: 部分落地 — verify:states checkHoverGeometry（hover-crosses-container-top，<4px）自 9e5a934 常驻并含注入自证；target-top-gap-token/elementFromPoint 命中/row-height 2px 容差三断言在 collect-ui-evidence 2026-11-10.3（29 checks），--inject hover-lift 变异红；迁常驻 profile 时须与 ui-state-audit 抽共享 helper，防双源漂移
status: candidate
checklist_item: 悬停位移是否越界（人工项；守卫上线后删除）
note: 录入按钮顶边与 tab 栏零间距(100/100)、44 vs 40 高度族、hover translateY(-1px)+阴影越界，视觉呈“顶部被截断”。2026-11-10 evidence bundle 三轮盲评同族第 2 次命中（HEAD 9f70977 bundle target 3×P1 复现同一数字）；修复后工作区 gap=8/无位移/40×4 全绿
```

```yaml exp
id: EXP-002
source: incident/2026-11-10-dialog-close-and-primary-btn
class: 级联层错位（Tailwind utilities vs 未分层 app CSS）
mechanism_slice: cascade-layers × unlayered-element-rules
disposition: GUARD
guard: enforced — lint:ui 规则 9（2026-11-13）：从 TSX 的 `<DialogContent className="...">` 提取字面量业务类，CSS 同元素选择器（`.foo`/`.foo:hover`，不含 `.foo .child`）禁止声明 position/inset/top/right/bottom/left/transform；叠加 SmartAssignmentModal CSS 契约测试与 e2e 几何断言（position=fixed/水平居中/不越视口）。局限：`className={cn(...)}` 动态拼接不在静态扫描面，需人工核
verification: done（2026-11-13）— 变异自证：给 `.smart-assignment-modal` 重新注入 `position: relative` → lint:ui 红并点名该选择器；移除后绿；SELF_TEST 6 例通过（同元素定位红、子元素定位/内部尺寸/伪元素定位绿）
status: enforced
note: 未分层 `button{position:relative}` 压掉 `absolute right-4 top-4`（关闭钮掉流 + 底部空行）；`button{background:var(--bg-secondary)}` 压掉 `bg-blue-600 text-white`（主次按钮同灰）。2026-11-13 同族第 3 次：`.smart-assignment-modal { position: relative }` 压掉 DialogContent 的 `fixed`，弹窗掉到文档流底部（I02n）；规则 9 把防线从“单个组件类”泛化到所有 DialogContent 业务类
```

```yaml exp
id: EXP-003
source: incident/2026-11-10-legacy-modal-selector
class: 全局遗留选择器误伤组件树
mechanism_slice: global-structural-selector × component-tree
disposition: GUARD
guard: proposed — lint:ui：全局 CSS 禁止使用 `[role="dialog"] > ...` 这类结构选择器命中组件内部节点；旧模态类选择器仅允许命中显式 `.modal-*` 类
verification: pending — 变异自证：恢复 `[role="dialog"] > div:first-child` 规则，静态检查必须报错
status: candidate
checklist_item: 全局 CSS 是否出现结构选择器（人工项；lint 规则上线后删除）
note: `modal-common.css` 的 `[role="dialog"] > div:first-child` 给所有 Radix 弹层 DialogHeader 套了边框/圆角/阴影，造成“框中框”
```

```yaml exp
id: EXP-004
source: review/2026-11-10-intake-pilot（F2 清空仍提交 + F3 弹窗空/服务端回落，同根因两处）
class: 显示值×提交值分叉（回落链）
mechanism_slice: form-field-value × payload-fallback-chain
disposition: GUARD
guard: proposed — collect-ui-evidence：capture（清空字段后 payload 不得回落解析值；chips 仅在"解析值即提交值"时显示）；triage（行有 expected_start 时弹窗预填且 payload 携带，说明文案与实际行为一致）
verification: reproduced 2026-11-10 — HEAD 9f70977 bundle 29 checks 中 6×P1 红（capture-source-ref/expected-finish、triage-start-divergence/note-consistency 等）；修复 2b6bd6d（D13/D14 裁决 a）后 --only capture,triage 8/8 绿；单测 stash 暂存修复复证先红后绿；守卫迁常驻 profile 待做
status: candidate
checklist_item: 表单派生值是否经 `field || parsed` 回落或"硬编码空+服务端回落"提交（人工项；守卫上线后删除）
note: QuickCaptureDialog `refValue || singleParsed?.source_ref` 清空后复活旧值；IntakeTriageDialog 硬编码 setExpectedStart('') + 服务端 `inStart ?? intake.expected_start` 回落——UI 承诺“不生成阶段”而服务端实际生成。与 D11（缺省≠null）同族：显式编辑必须可见生效；裁决见 D13/D14
```

```yaml exp
id: EXP-005
source: review/2026-11-10-intake-pilot（states 4×P1：counts 失败显 0 / 空筛冒充全局空 / 209 静默截断 / 1366 详情缺列）
class: 查询状态×摘要/空态/分页矩阵
mechanism_slice: query-state × summary-empty × pagination × breakpoint-parity
disposition: GUARD
guard: proposed — collect-ui-evidence states：counts 失败不得显示 0 且必须有可重试错误；筛选无结果不得显示全局空态；total>已显示行数必须有指示+分页；断点隐藏列必须在只读详情承接
verification: reproduced 2026-11-10 — HEAD 9f70977 bundle states 4×P1 红；修复 696b62f 后 `--only all` 28/28 绿；verify:states intake 双主题 PASS；守卫迁常驻 profile 待做
status: candidate
checklist_item: 列表页摘要/空态是否按 query 成败与筛选状态区分、截断是否有指示（人工项；守卫上线后删除）
note: `countsQuery.data ?? {new:0,…}` 失败静默兜底 0（U05 同族）；空态单分支吞掉"无匹配"（G-11）；API limit 200 截断无指示（G-04）；1366 隐藏列不进详情（G-05，U16 同族）。bundle 首次把四态做成可重复断言
```

```yaml exp
id: EXP-006
source: series/2026-11-10~11-d03-batches（消费证据六次命中：B1 G-D PTD badge/checkbox 族、B2 G-1 People badge-info、B3 G-1 ProjectTypeDetails form-group、批A NUCLEAR"同值冗余"实为生效值异值、批D visual 活簇误判+模板非直缀漏网）
class: 消费证据×保留决策（存在≠消费）
mechanism_slice: consumption-evidence × preservation-decision
disposition: GUARD
guard: 方案评审门禁（enforced as process gate）— 任何"作用域化保留/差量保留"决策必须附消费证据 file:line，且消费判定必须覆盖四类非字面构造：①i18next 复数/区间后缀折叠 ②常量组映射（ENUM_GROUPS 经 i18n.exists 全动态）③模板串非 t() 直缀（helper-return/const 赋值）④定义面≠生效面（!important 层压下的真实生效值）；零消费只允许删除清账
verification: 六次命中回放 — 每例按"存在≠消费"回放均被拒：PTD badge 族 TSX 零引用、People badge-info 全库仅 1 处消费、PTD form-group 三组零消费、NUCLEAR label 块异值生效（删而不吸收则 13 label 漂移）、visual 簇 16 键活消费、lifecycle.state.* 63 键经 helper-return 模板消费（不修正扫描器则全站显原始键串）
status: candidate
note: 台账 I01i/I01j/I01k/I01n/I01q 五行均有"第 N 次普查修正"记录；配套工具 check-i18n-dead-keys.mjs 已实现四类折叠判定。enforced 化为机器门禁的路径：方案 diff 扫描保留类关键词时强制检查消费证据节存在性（未做，触发条件=下一次保留类方案）
```

```yaml exp
id: EXP-007
source: series/2026-11-11（删文件×守卫台账解绑四次命中：B3 G-2 Login.css/ProjectAllocations 预估 8 实际 42、I01l ScenarioComparison 死页 19+getPriorityColor 5、批B G-1 Charts.css fixture 动态 import 尾巴、批D personUtilizationView 台账豁免销账）
class: 删文件×守卫台账解绑
mechanism_slice: file-deletion × guard-ledger
disposition: GUARD
guard: 方案必填节（enforced as process gate）— 删除任何源文件前：①grep tests/ 台账 JSON（color-debt/state-budget/axe-exceptions）枚举将孤儿化的注册身份数目 ②grep 全库动态导入字符串（await import 含 fixtures）③删除后逐指纹 --resolve-orphan + 对应 --check 绿；三者写入方案 C 步骤
verification: 四次命中回放 — B3 不解绑则 verify:colors checkLedger"Orphan still in ledger"必红（CI 实锤）；批B fixture 动态 import 不删则 vite 构建炸+verify-chart-colors 崩；tokenize 解绑在消费者消亡后"Invaliate rename mapping/no matching consumer"红（批D 实测改判 delete）
status: candidate
note: 台账 I01k/I01l/I01o/I01q 均有 EXP-NEW-2 命中记录。机器化路径：pre-commit 钩子检测 staged 删除的源文件 × 台账 JSON 引用（未做，触发条件=下一次删文件批）
```

```yaml exp
id: EXP-008
source: incident/2026-11-11-PhaseTimelineStyles-shadow-stylesheet（D-04 Stage 2 评审 G-1 发现：运行时 <style> 注入 .modal-content/.form-* 全局定义，规则 2/6 只扫 .css 全盲——D-03 三批清理从未见过这个第二样式源）
class: 注入样式×共享类定义（守卫边界按扩展名划定而非样式来源）
mechanism_slice: injected-style-tag × shared-class-definitions
disposition: GUARD
guard: lint:ui 规则 8 — tsx `<style>{...}</style>` 文本块提取（正则够用级），复用规则 6 左端锚点与规则 2 工具类判据；命中共享类/工具类即报；INJECTED_STYLE_ALLOWLIST 冻结存量（当前为空）
verification: SELF_TEST 4 例生产函数直调 — `<style>.badge{}</style>` 必红 / `.x-page .form-group` 必绿 / `.btn-sm` 必红 / 无 style 块必绿；PhaseTimelineStyles 事故实例回放即红；上线后生产扫描零违例
status: enforced
note: 同族前身：规则 2/6 以 .css 扩展名划定守卫边界，注入式 `<style>` 是零覆盖盲区——教训是守卫边界应按"样式定义来源"而非文件类型划定。批 D 执行中该家族整个死代码删除（PhaseTimeline.tsx 零导入者），注入源消失，规则 8 作为防线常驻
```

```yaml exp
id: EXP-009
source: review/2026-11-11-i02b-plan（U25 People status URL 方案评审 G1：Projects.tsx:317-326/355-373 是"初始复制+全量写回"现成反例，Back/Forward 不恢复且抹掉无关参数）
class: URL状态×派生/镜像双源
mechanism_slice: search-params × derived-state × replace-scope
disposition: GUARD
guard: proposed — URL 过滤器必须由 searchParams 纯派生；禁止 useState(initialFromUrl) 镜像；写回 clone 后只改目标键并 {replace:true}；测试覆盖 navigate(-1)/navigate(1) 与无关参数保留
verification: pending — 变异自证：copy-init 镜像→Back/Forward 用例红；setSearchParams(object) 全量写回→无关参数保留用例红。I02b 实施时 People 页已按此形落地（useSearchParams 纯派生 + clone 写回 + 非法值清理），守卫本体待机器化
status: candidate
checklist_item: 列表页 URL 过滤是否派生而非镜像、写回是否保留无关参数（人工项；守卫上线后删除）
note: U25 原缺陷=深链参数被丢弃；若用镜像写法会把"可分享 URL"做成"仅首次挂载有效"。I02b/People 为正面范例，Projects.tsx 为反例（预存，未改）
```

```yaml exp
id: EXP-010
source: review/2026-11-11-i02b-plan（U25/D1：fully-allocated 仅 URL 可达，无卡片=无标识；筛选子集被误读为全量名册）
class: 筛选状态×可见性
mechanism_slice: url-filter × active-indicator × clear-action
disposition: GUARD
guard: proposed — 任何生效的列表筛选必须在 DOM 有可见标识（文字/药丸）与清除动作；toggle 卡必须 aria-pressed；筛选空态不得用全局空文案（EXP-005 同族第二面）
verification: pending — 变异自证：去掉药丸/aria-pressed→DOM 断言红；筛选 0 行改用 common:noData→空态断言红。I02b 已实现：People 药丸（activeFilter/clearStatusFilter）+ aria-pressed + noMatchesForStatus 专属空态 + 加载/失败态区分
status: candidate
checklist_item: URL 筛选是否有可见标识与清除（人工项；守卫上线后删除）
note: Projects warn-filter-pill 是可复用模式；EXP-005 管"空与失败"，本条管"非空但隐筛"
```

```yaml exp
id: EXP-011
source: review/2026-11-11-i02b-plan（D2：070 视图 WHERE is_active=true，summary.people 全量含停用；高利用告警 9/12=75% 漏报、KPI 对不上）
class: 比例口径×人口来源
mechanism_slice: kpi-ratio × population-source × inactive-people
disposition: GUARD
guard: proposed — 以 utilization_status 分档的比例/KPI，分母必须与分档人口一致（利用率行总数）；测试夹具必含至少 1 名停用人员
verification: verified（I02b 实施）— useCriticalAlerts 高利用分母与 EnhancedKPIs 资源效率/准确率分母均改 utilizationPopulation；单测含"在用 10 + 停用 2，9/10=90% 仍报"反例（旧 9/12=75% 漏报）；变异：分母改回 summary.people→该用例红。机器化静态断言待做
status: candidate
checklist_item: 比例型 KPI 的分母是否与分档人口一致（人工项；静态断言上线后删除）
note: 同族风险点：任何新"利用率百分比/比例"必须经 utilizationPopulation，禁止 summary.people
```

```yaml exp
id: EXP-012
source: review/2026-11-12-i02h-plan（U23 锚点四态；项目详情只有 iteration_id 无迭代名，"已挂接→落地无反馈"）
class: 上下文跳转×静默 no-op
mechanism_slice: url-intent × silent-no-op
disposition: GUARD
guard: proposed — 带 projectId 锚点的跳转必须对「命中/已满足/不满足/找不到」四态各给可见文案或高亮；断言：四态 fixture 渲染后均有 banner 或高亮，且不存在"已挂接却无反馈"分支
verification: implemented 2026-11-12（I02h）— Iterations 四态 banner+高亮、Roadmap 无阶段/未找到 banner；组件测试覆盖四态；变异自证：删已挂接分支→用例红
status: candidate
checklist_item: 锚点跳转四态是否各有可见反馈（人工项；机器化后删除）
note: U23 方案原文「若已被挂接则忽略」被评审否决——静默 no-op 等于入口失信；EXP-010 同族（状态可见性）
```

```yaml exp
id: EXP-013
source: review/2026-11-12-i02h-plan（U24-B 沉底区行内挂接：onChange 即写会随箭头键误发、成功后行卸载丢焦点）
class: 行内写控件×提交触发/卸载
mechanism_slice: inline-write × commit-trigger
disposition: GUARD
guard: proposed — 成功后行会卸载的行内写控件禁止裸 onChange 提交；必须显式确认或 pending 串行化+失败回滚+焦点转移；断言：连续两次 change 只发一次写、失败后显示值回退、成功后 focus 不在 body
verification: implemented 2026-11-12（I02h）— select+确认钮；change 不发请求、pending 禁用、失败回滚占位+行内错误、成功 toast；测试覆盖
status: candidate
checklist_item: 行内写控件是否显式确认/pending/回滚（人工项；机器化后删除）
note: 与 EXP-004 同族（显示值≠持久值），新增「卸载导致焦点丢失/并发写」面
```

```yaml exp
id: EXP-014
source: review/2026-11-12-i02h-plan（SR 聚合父行永久死控件 + 卡头 stats 与展开清单双源计数）
class: 聚合语义×行级写入口/计数
mechanism_slice: aggregate-row × write-affordance × dual-source-count
disposition: GUARD
guard: proposed — 行级写控件必须排除有子项的父行；卡头 stats 与展开清单必须同一 lifecycle 谓词；断言：SR+AR 夹具中父行无可写控件（或只读说明），挂非生命周期项目的卡头计数===行数
verification: implemented 2026-11-12（I02h）— 父行 select 禁用+聚合说明；cardItems 加 lifecycle 谓词；测试覆盖（p1 禁用/p3 排除）
status: candidate
checklist_item: 聚合行写入口与卡头/清单计数是否同源（人工项；机器化后删除）
note: 夹具实测 42 条未排中 5 条为 SR 父行（含 in_iteration 仍列未排）；服务端 ProjectsController 对父行一律 400
```

```yaml exp
id: EXP-015
source: incident/2026-11-13-person-details-heading-css-leak（I02p；用户截图：工作负载标题白字不可见）
class: 跨页样式×全局 CSS 泄漏
mechanism_slice: css-global-lifetime × shared-class-collision
disposition: GUARD
guard: enforced — scripts/check-css-duplicates.mjs（A：跨文件重复 class 基线，新增重复/新增 owner 红）+ scripts/check-page-css-scope.mjs（B：登记页面新增顶层选择器必须以页面根类开头，存量冻结）+ tests/unit/client/PeoplePersonDetails.css.test.ts（C 静态归属）+ tests/e2e/suites/integration/person-details-theme.spec.ts（真实 People→PersonDetails 路由切换后标题对比度≥4.5）；两条静态守卫入 lint:ui 与 pre-commit
verification: done 2026-11-13（I02p）— 重新向 People.css 注入 `.insights-section .section-header h2` → B 守卫红；A SELF_TEST 4/4（新重复/新增 owner 必红）；CSS 契约测试 2/2；client 全量 81 套件 1596/0；e2e 路由对比度用例已入仓（本批未启动 e2e server 执行）
status: enforced
note: People.css 改版后遗留整套 insights/action 通用类；People.css 全局常驻，`.insights-section .section-header h2`（0,2,1）覆盖 PersonDetails.css 的 `.section-header h2`（0,1,1），浅色主题 `--bg-primary`=白 → 白字白底。既有 lint:ui 只检查注册共享类，visual/states 直接打开目标路由不经过 People.css 已加载状态，因此全绿漏检。新守卫只冻结存量重复；彻底方案是页面 CSS 全部根类作用域化/CSS Modules，存量按 A/B 基线逐步清理
```

```yaml exp
id: EXP-016
source: review/2026-11-14-workbench-v2（G-02：states 报 18 处 hover-crosses-container-top——重复 data-testid 的泳道 bar 被 selector 整键配对，default 基线取"最后一条"而 hover 行取"第一条"，"0.0 (was 44.8)"为串键假阳性）
class: 守卫键控×重复 testid 列表元素
mechanism_slice: state-diff-keying × repeated-testid
disposition: GUARD
guard: enforced — scripts/lib/ui-state-audit.mjs checkHoverGeometry 改为 selector#ordinal 分组配对（同 selector 多元素按序匹配，数量不齐跳过不猜）
verification: done 2026-11-14 — 修复前 person-workload profile 18 处假阳性红；修复后同 profile 绿且 static-top-gap 真实项独立暴露（gantt-body 4px 顶隙修复）
status: enforced
note: 一切"按 selector 对两态行做 diff"的守卫都必须带序数消歧——列表渲染的同类元素（泳道 bar/表格行）天然重复 testid。真位移与假阳性必须能分离，否则交付闸恒红会诱发烧基线惯性
```

```yaml exp
id: EXP-017
source: review/2026-11-14-workbench-v2（G-01：泳道 bar 设计 18px 实渲染 40px——design-system `button{min-width/min-height:40px}` 全局规则压过组件 height；同泳道 ≥2 条 bar 必然重叠 20px、点击上半区命中上一条）
class: 全局元素规则×button 型自定义控件
mechanism_slice: global-element-sizing × button-typed-custom-control
disposition: GUARD
guard: enforced — tests/e2e/suites/integration/person-workload.spec.ts 几何断言：全部 [data-testid=pw-gantt-bar/pw-ghost-bar] 计算高度 ≤20px 堆叠间距且同泳道 rect 零相交
verification: done 2026-11-14 — lint:ui 规则 9（unlayered 元素规则）只管 position 类属性，尺寸属性是盲区；E2E 断言直接锁渲染结果（min-height 重置删除即红）
status: enforced
note: 新增 button 型控件（数据条/迷你图/链接式按钮）必须显式重置全局 button 尺寸规则或接受 40px 家族——EXP-002 同根因不同属性面（此前是 utilities 分层，这次是尺寸）。候选后续：lint 规则扩展到"组件类声明 height<40px 且作用于 button 时须同块重置 min-height"
```

```yaml exp
id: EXP-018
source: review/2026-11-14-workbench-v2（G-03：弹窗遮罩 z=60 低于 AppHeader z=1000，aria-modal=true 下场景切换器仍可点击，弹窗内切场景静默重绑）
class: 层序阶梯×全局 chrome 遮挡
mechanism_slice: overlay-z-index × global-chrome-ladder
disposition: GUARD
guard: enforced — PersonWorkload.css 注释锚定 App.css 层序阶梯"模态档"；弹窗打开时 header 交互钮不可点由 E2E 弹窗流覆盖（间接）
verification: partial 2026-11-14 — z 提到 1100；elementFromPoint 专项断言未单列（后续候选）
status: candidate
note: 页面级弹窗的 z-index 不能只看页面内邻居，必须查 App.css 全局层序阶梯（header 1000/模态档）；aria-modal 是对读屏的承诺，指针可达性必须同真。新浮层入仓前先对照阶梯表选档
```

```yaml exp
id: EXP-019
source: review/2026-11-14-workbench-v2（G-04：focus-trap effect 依赖 inline onClose，父组件任一重渲染触发 cleanup 把焦点夺回遮罩后按钮，trap 逃逸）
class: 焦点归还×不稳定回调依赖
mechanism_slice: focus-return-cleanup × unstable-dep-rerun
disposition: GUARD
guard: enforced — 组件测试：弹窗打开时父组件 rerender（onClose 换身份）后 activeElement 仍在 dialog 内
verification: done 2026-11-14 — 修复=onClose 入 ref、effect 仅依赖 open 翻转；测试红绿有效
status: enforced
note: "cleanup 里做焦点归还"的 effect 凡依赖父级 inline 回调都有此雷——归还只应发生在 open 翻转/卸载，回调一律 ref 化。同族：ESC 处理器同样走 ref
```

```yaml exp
id: EXP-020
source: review/2026-11-14-workbench-v2-round2（DeepSeek P2：行编辑把开始日改到结束日之后，实时预览 workloadTimeline 抛错整页崩溃）
class: 实时预览×任意输入安全
mechanism_slice: realtime-preview × arbitrary-input-safety
disposition: GUARD
guard: enforced — workloadTimeline 对倒置区间按 min/max 归一（asOf/缺区间仍 throw）；单测断言倒置输入语义等价正序输入；页面测试逐键中间态（开始日越过结束日）页面存活 + 显示"日期顺序无效"提示
verification: done 2026-11-14 — 原实现 throw → 组件测试红（整页崩溃）；原语归一后绿
status: enforced
note: "契约函数主动 throw"对批处理正确，对**实时预览**是雷：逐键渲染必然经过中间态。规矩=用户可编辑输入进入原语前不得假定有序/完整；原语级 total 化（一处修，N 调用点安全）优先于调用点防御
```

```yaml exp
id: EXP-021
source: review/2026-11-14-workbench-v2-round2（DeepSeek P2：首次 UNKNOWN 回读也失败后无任何重新核对入口，草稿永久锁定）
class: 锁定态×无出口
mechanism_slice: locked-state × no-exit
disposition: GUARD
guard: enforced — DraftCommitBar 锁定态矩阵测试（9 用例）：confirm 禁用且非提交中时必须存在至少一个可用按钮；UNKNOWN→[重新核对]（按草稿原场景回读）、FAILED→[重试失败]、CONFLICT/INVALID/失配→[清空]；SUBMITTING 为设计例外（在途无出口，文案在位）
verification: done 2026-11-14 — 矩阵在加 [重新核对] 前 UNKNOWN 用例红；加后绿；页面用例覆盖"回读失败→锁定→网络恢复→核对命中解锁"
status: enforced
note: 任何"禁用主操作"的状态都必须在 UI 上给出用户可执行的下一步——注释里写"等用户手动重试"而入口不存在是缺陷。矩阵枚举（状态×可用动作）是覆盖证明，单点用例不算
```

```yaml exp
id: EXP-022
source: review/2026-11-14-workbench-v2-round2（DeepSeek P2：阶段草稿用整项目包络，四月阶段计入三月负荷）
class: 派生日期×来源优先级
mechanism_slice: derived-dates × source-priority
disposition: GUARD
guard: enforced — selection=1 role_demands 携带需求阶段时间线窗口（phase_start_date/phase_end_date）；createDraftFromTask phase 模式优先级=需求阶段窗口→任务包络→null；integration 断言窗口下发，单测断言优先级与回落
verification: done 2026-11-14 — 集成 10/10、单测 25/25
status: enforced
note: "显示包络"（时间线 MIN/MAX 只用于展示）与"写入窗口"必须区分；派生日期默认值要有明确优先级链，且链路每一跳都有测试（需求窗口存在/缺失/无阶段）
```
