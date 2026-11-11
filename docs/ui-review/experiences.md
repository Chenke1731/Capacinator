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
guard: proposed — lint:ui：弹层/表单类组件的交互态样式必须使用未分层类原语（ui/dialog.css 模式）；禁止依赖 Tailwind 工具类承担 button 的背景/边框/位置
verification: pending — 变异自证：给关闭钮重新挂回纯工具类定位，静态检查必须报错
status: candidate
checklist_item: 新控件是否依赖工具类承担交互态样式（人工项；lint 规则上线后删除）
note: 未分层 `button{position:relative}` 压掉 `absolute right-4 top-4`（关闭钮掉流 + 底部空行）；`button{background:var(--bg-secondary)}` 压掉 `bg-blue-600 text-white`（主次按钮同灰）
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
