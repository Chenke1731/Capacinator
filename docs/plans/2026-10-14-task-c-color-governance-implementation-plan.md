# 任务 C：颜色债务治理最终实施方案

日期：2026-10-14（Asia/Shanghai）  
定稿基线：`0884836`。实施前重新记录 HEAD 与工作区差异。  
状态：用户已授权实施；TC-C0a–C0c、TC-C0.5、TC-C1–C5 已完成本地验收，TC-C6 继续实施。完成状态按本文件证据逐项更新，不代表整个任务 C 已完成。

关联：[总改进计划](2026-10-14-capacinator-improvement-plan.md)、[工程约定](../../CLAUDE.md)、[UI 契约](../UI_GENERATION_CONTRACT.md)。本方案承接任务 C 的全部评审与修订；与总计划中的业务反例 C01–C12 无关，领取任务时使用 `TC-C0a` 等前缀避免混淆。

## 1. 目标、事实基线与边界

目标是完成颜色分类、修复实际缺陷、迁移稳定语义色、为必要字面色保留依据，并拦截新增未登记消费。完成以以下结果判定：

- 未分类的颜色消费为 0。
- 本范围内已确认且未修复的颜色缺陷为 0。
- 已确定需要语义迁移而未迁移的消费为 0。
- 保留字面色都有用途、理由和相应渲染证据。
- 新增未登记消费、未裁决孤儿、失效证据不能通过检查。

当前事实及限制：

| 项目 | 定稿结论 |
|---|---|
| 396 处旧统计 | 停止作为实施基线；保留为历史记录 |
| 756 处、33 文件、133 定义行、86 中性色 | 属侦察数，语法范围及计数单位待 C0a 固化；禁止直接写成正式预算 |
| 原 Enhanced 时间线约 66 处、试点约 19 处 | 均待正式扫描确认；不能等同于实际视觉缺陷数 |
| 现有视觉矩阵 | 6 页 × 2 主题，加需求台 1366 两主题，共 14 个组合、56 项检查；不是 56 个组合 |
| 当前状态检查器 | `--page` 已存在，但静态、悬停、选择和浮层逻辑仍绑定需求台；非需求台结果尚不可作验收依据 |
| 现有视觉守卫漏洞 | UPDATE 会写 axe 预算，缺失像素基线会自动采集；必须分别改为显式预算治理与缺失失败 |
| Enhanced/Unified 时间线 | 当前 main 无生产引用；新会话下路线图及项目详情未加载对应 CSS，也未渲染对应组件 |
| 真实时间线消费 | ProjectRoadmap 使用 InteractiveTimeline；项目详情通过 ProjectDemandChart → VisualPhaseManager 使用它 |
| 任务 B | 作为已完成基础保留：primary/primary-text/primary-solid、Portal 路径、HSL 禁令及自测；不重复迁移 |

不改变容量、估算、生命周期准入、分配快照、场景范围或导入业务语义。颜色治理不能借机恢复旧组件、整站重写设计系统或修改用户业务数据。中性灰也不因 r≈g≈b 就被视为双主题等价；按文字、背景、边框用途判断。

## 2. 执行顺序与独立交付单元

默认顺序：`TC-C0a → TC-C0b → TC-C0c → TC-C0.5 → TC-C1 → TC-C2 → TC-C3 → TC-C4 → TC-C5 → TC-C6`。`TC-C7` 可选。每批一个可独立验收的提交；C0a 不与颜色替换或死代码删除混合。

| ID | 交付范围 | 开始条件与停止边界 |
|---|---|---|
| TC-C0a | 正式扫描器、初始账本、差异检查与自测 | 只建立可重复盘点；允许存量待分类，不允许凭空归类为已验证 |
| TC-C0b | verify-states profiles 化；projects 实质等价；首个新 profile 为 roadmap | 保留原需求台全链；新页面非零覆盖及注入自测有效后交付，不要求一次支持所有页面 |
| TC-C0c | 视觉场景准备器、页面身份断言、定向选择、预算与像素更新隔离 | 初批覆盖 roadmap 与 project-detail；场景、导入、设计器在对应迁移批开始前补齐 |
| TC-C0.5 | 退役 Unified/Enhanced 三件套及关联残留 | 当前分支引用核对通过，按第 6 节删除、测试并登记退役；不扩大删除范围 |
| TC-C1 | InteractiveTimeline 时间导航与阶段选中态试点 | 实际 DOM/样式消费映射明确；roadmap 与 project-detail 两个上下文都可验证 |
| TC-C2 | 路线图剩余颜色消费 | ProjectRoadmap、InteractiveTimeline 剩余域、VisualPhaseManager 等实际消费；不重复处理 C1 |
| TC-C3 | 场景页面与实际使用的比较/合并浮层 | `/scenarios` 状态 profile、准备器及存量基线先具备，再迁移 |
| TC-C4a–d | App.css 按组件域治理 | 告警/生命周期、批量/危险动作、浮层/反馈、其余域；域内可跨 success/warning/danger/info 一起迁移 |
| TC-C5 | 可到达的项目类型详情及阶段模板设计器等详情域 | `/project-types/:id` 等真实入口与打开态先验证；ProjectAllocations 需先核实可达性，不凭文件名假设上线 |
| TC-C6 | 导入及剩余消费文件 | 真实入口 `/import`；列表、预览、错误及危险选项状态准备完成后迁移；尾项按账本逐一处理 |
| TC-C7 | 中性灰归一，可选 | 按文字/背景/边框用途映射现有令牌；若中性色已经构成缺陷，提前纳入对应必做批次 |

首批迁移后再安排后续数量和工期。12–24 小时为此前讨论的粗估，不作为交付承诺；以 C0 和试点实测成本重估。

## 3. TC-C0a：扫描器与账本

### 3.1 交付文件与统计口径

拟新增 `scripts/audit-color-debt.mjs`、`tests/visual/color-debt.json`，按需要新增最小解析辅助模块和隔离输入夹具。新增检查与 [lint-ui-css.mjs](../../scripts/lint-ui-css.mjs) 的分工是“颜色消费清单/变更裁决”与“已知主色误用”；不复制同一规则。

在 `package.json` 注册明确的扫描/检查/自测脚本，并把只读检查接入现有自动检查流程。CI 显式选择比较基线，保证对应 Git 对象可读取；基线不可读取即失败，不回退到空比较或重新初始化。C0a 的静态检查不依赖浏览器或运行中的数据库。

扫描范围为 `client/src` 内生产 `.css/.ts/.tsx`。排除测试、mock、生成产物和注释；排除路径及理由列入输出，不悄悄缩小范围。复用现有 PostCSS/TypeScript 解析能力，保留原文定位，避免用单一 grep 同时承担颜色解析和用途判定。

识别 hex（3/4/6/8 位）、rgb/rgba、hsl/hsla、合法命名色，以及渐变、阴影、SVG、图表、内联样式和 `var()` 回退中的字面色。项目使用其他颜色函数时也要纳入；未支持语法必须报告，不可静默当作无颜色。`transparent/currentColor/inherit` 等符号值单列，不计作具体彩色字面债。

统计单位明确为“颜色出现次数”，同时输出声明数、唯一字面色数和文件数。一个声明有两个颜色即两个出现；同一规则分组选择器不按逗号重复计数。CSS 令牌定义单列为体系定义，不计消费债，但不能自动推断其值已经通过渲染验证。TS 中不能判断用途的颜色字符串保留为待分类候选；非颜色字符串经过明确判定后排除。

通过定义和消费、色彩类别、可达性、处理决定四个维度表达结果，不能把“确认缺陷”和“中性灰”混成同一分类轴。

### 3.2 最小账本结构

```json
{
  "schemaVersion": 1,
  "scannerVersion": 1,
  "baselineHead": "初始化时的完整提交号",
  "entries": [
    {
      "fingerprint": "源身份摘要",
      "file": "client/src/components/InteractiveTimeline.css",
      "context": "at-rule上下文或TS语法归属",
      "owner": ".示例选择器",
      "property": "background",
      "literal": "#示例颜色",
      "locations": [{ "line": 100, "column": 3 }],
      "count": 1,
      "kind": "semantic-color",
      "reachability": "active",
      "decision": "pending",
      "semanticRole": null,
      "reason": null,
      "evidence": []
    }
  ],
  "resolutions": []
}
```

这是字段示意，不是可直接使用的初始化结果。实际枚举至少包含：

- `kind`：token-definition、neutral-literal、semantic-color、data-color、library-color、unknown、non-color。
- `reachability`：active、unreachable、unverified；无引用只是证据之一，不凭 grep 未命中自动删除。
- `decision`：pending、fix、tokenize、accepted-literal、not-debt；not-debt 需可解释依据。
- 已完成替换、删除或退役进入 `resolutions` 历史，保留来源指纹和结果，不与当前仍存在的消费混计。

稳定指纹基于文件、上下文、选择器/TS归属、属性、规范化字面值；行列仅用于定位。相同指纹的多个出现保留位置及数量，增加同指纹出现次数也必须被检查捕获。accepted-literal 必须保留在当前清单中持续检测，不能从扫描范围排除。

### 3.3 初始化、检查、裁决分离

拟定 CLI；以下参数在实现前尚不存在，不得提前当成已可执行命令：

```bash
node scripts/audit-color-debt.mjs --scan
node scripts/audit-color-debt.mjs --init --reason initial-inventory
node scripts/audit-color-debt.mjs --check --base-ref <已确认比较基线>
node scripts/audit-color-debt.mjs --resolve-orphan <旧指纹> --resolution <rename|delete|tokenize|retired-unused> --reason <理由>
node scripts/audit-color-debt.mjs --selftest
```

- scan/check 为只读；check 不初始化、不批准新增、不清除孤儿、不写入预算。
- init 仅首次创建账本，已有账本时拒绝覆盖。初次允许登记存量 pending，但不得把登记等同于验收；C0a 完成不要求所有消费已分类。
- check 对比源扫描、当前账本和指定 Git 基线。新增未登记指纹、未经裁决的出现次数增加、账本与源码不符、无效决议、失效证据均失败；用减少其他项目来抵消新增也失败。必要字面例外的新增必须有本次显式批准记录和有效证据，不能仅改count或沿用旧批准。
- 存量 pending 在治理期可以保持；其身份和数量不得静默增加。最终收口要求 pending 为 0。
- rename 必须提供旧→新映射；delete/tokenize/retired-unused 必须证明旧消费确实消失或已替换。多条消费可以批量裁决，但每条有结果，不靠改总数出账。
- 工具可辅助匹配和生成候选决议，不能自动批准。分类和出账文件必须在代码评审差异中可见。
- 字面颜色、选择器、用途任一改变，旧可读证据不自动继承。相关主题令牌、真实背景或渲染上下文改变时，对应证据也须重验。
- tokenize 检查除旧字面消失外，还匹配同文件/归属/属性/上下文的实际 `var()` 消费；令牌名称不存在或指向别的声明会失败。C1复核纠正两类共5条账本映射（阴影primary与tooltip前景），未修改渲染行为。
- 新消费优先使用已验证令牌；必要新增字面例外必须显式分类、说明理由并提供证据。不能通过反复重置基线实现“只降不升”。

证据至少记录：页面/准备场景、主题、状态、视口、实际前景/背景、阈值与结果、实施版本、证据工件路径。未上线消费不伪造渲染证据，保留 unverified/unreachable 并进入后续处置。

### 3.4 C0a 关闭条件

- [x] 同一 HEAD 重复扫描稳定，支持按文件查看以及全库汇总；正式结果1481次/1446身份/64文件，202次令牌定义、393次中性色、664次CSS语义色、222次TS/TSX候选；旧数字不再作预算。
- [x] 生产解析器与隔离夹具覆盖定义/消费、注释、命名色、rgba、多色渐变/阴影、TSX及原文行号；TS候选保留pending，不假装已做语义判断。
- [x] 新增、重复次数增加、未裁决删除必失败；移动行号保持身份，伪造token-definition豁免也被拦截。
- [x] rename/delete/tokenize/retired-unused 有显式入口及记录，重命名不继承证据；accepted-literal缺失/失效证据失败。
- [x] scan/check只读；实际执行再次init被拒绝。
- [x] `npm run verify:colors:selftest`通过生产解析/检查函数的隔离输入断言；CLI未知参数、缺失Git基线均实际拒绝。
- [x] GitHub静态检查接入只读check及selftest；CI入口本地以0884836运行通过。远端CI尚未执行，不记为远端通过。
- [x] C0a独立交付；本批未改消费颜色或删除组件。

## 4. TC-C0b：状态守卫按页面配置渐进迁移

实现起点：[verify-states.mjs](../../scripts/verify-states.mjs)、[verify-boards.mjs](../../scripts/verify-boards.mjs)。先将原需求台专属规则封装为 projects profile，再添加 roadmap，保持默认运行和 verify-boards 的调用契约。

profile 至少声明：稳定名称、路径/查询参数、页面身份与 root、ready 条件、测试数据/准备器、滚动容器、安全触发器、浮层根、关键状态、覆盖下限和适用维度。root/ready 必须根据实际 DOM 确认，不照抄方案中的示例类名。

覆盖有效性先于视觉判定：未知 profile、根缺失、页面错位/404、准备器失败、会话失效、零枚举或未命中必要状态均失败。URL 比较同时检查 pathname 和必要 query，避免 `/projects?tab=roadmap` 与 `/projects` 混淆。合法空态用独立准备场景测试；默认基线须有确定的非空夹具。

projects 等价迁移至少保留：首屏/中部/底部、悬停族、复选框前置、批量条及其气泡、浮层内部悬停、贴锚、遮挡/越界、伪元素背景、主题断言、会话检测和现有坏规则注入。全链覆盖报告逐项比对；历史114输出只作参考，不作为等价证明。

通用检查不能把需求台字号集合、贴锚规则或下限硬套到所有页面。profile 声明适用范围；不适用须说明，不能凭出现违例就豁免。检测颜色归一须支持浏览器实际输出的 rgb、color(srgb)、oklab 等形式，正确合成透明前景、背景与伪元素；不认识的格式/背景记为未验证并阻止相关项被宣布验收通过。

走查仅允许读取与本地 UI 状态操作。真实登录在浏览器走查前完成；业务写请求在走查期间拦截并记录，或对需要写后状态的场景提供受控夹具。加减、拖动、选人也可能写入，不能只用按钮文字正则保护用户库。意外写请求失败，显式模拟请求由准备器声明；夹具只证明渲染，不证明持久化业务。

新增状态按批次接入：默认、hover、键盘 focus-visible、selected、disabled、所涉弹层；active 在有意义且能安全强制时检查。禁用控件按适用规则处理，不删除其覆盖记录。动态族、滚动或触发器超上限必须报告截断并失败，不静默切掉尾部。

### C0b 关闭条件

- [x] projects专属首屏/中底滚动/悬停/选择/批量/浮层/贴锚链保持；`--profile projects`双主题115/115，新增1项为零写请求断言；旧入口仍默认projects。
- [x] roadmap双主题每相位20个控件，实际悬停族和键盘进入root；详情profile同时纳管，报告在tests/visual/reports。
- [x] profile身份校验同时检查path/query；未知profile、根缺失、零覆盖、会话覆盖和超限失败，零覆盖调用生产assertCoverage注入验证。
- [x] projects自测7/7保持；roadmap浅/深两主题对比度、视口及移除根注入均检出。
- [x] 浏览器业务写请求统一拦截并计数；projects全链实际零写请求，generic报告区分写请求与页面错误。
- [x] 状态存量按profile/theme/phase/节点指纹登记；已存在键不能重置，新增问题不可用其他节点减少抵消；同步锁防不同profile初始化丢记录。

## 5. TC-C0c：视觉覆盖与预算更新分离

实现起点：[verify-visual.mjs](../../scripts/verify-visual.mjs)、[axe-budget.json](../../tests/visual/axe-budget.json) 与现有截图目录。初批保留14组合并增加试点所需状态；后续按文件消费映射增加页面/浮层，避免一次搭建与首批无关的通用平台。

每个视觉场景声明 `path、prepare、assertReady、scope、theme、viewport`，必要时包含局部滚动。直接访问详情、从其他页导航到详情分别验证样式加载，防任务 B 的加载链问题复发。准备数据、当前时间/日期、语言和布局偏好保持可重复，不依赖用户库随机首条或本机独有 ID。采用确定的只读响应夹具或隔离测试数据；错误页不能被当作基线。

核心消费按 UI 契约测1600与1366；新增场景统计实际组合数和检查项数，不固定宣称56。像素、axe、状态及几何结果分别记录；碰撞根不存在应失败或明确不适用，不能用空扫描冒充通过。

预算规则：

- 正常检查不写预算、不采缺失基线；缺失项明确失败。
- `UPDATE_BASELINES=1` 仅更新经过人审的选定像素基线，不能修改 axe 预算，也不能使 axe 检查跳过。
- 新页面首次纳管可以显式登记既有违例，记录节点/规则/状态指纹、证据和来源；这属于覆盖扩展，不是提高已纳管场景预算。
- 已纳管预算只降不升。新增违规节点不得用其他节点减少来抵消；数量检查加实际违例指纹差异。
- 当前项目详情 light12/dark3为历史登记值，实施时重新核对实际节点，不把它当作可以自由消耗的额度。
- 默认/hover/focus/selected/浮层的预算不能相互混用。新增场景必须有准备与命中证明。

### C0c 关闭条件

- [x] 正常验证遇 roadmap1366 两张缺失基线实际失败，没有隐式采集；后经显式 UPDATE 采集。
- [x] 浏览器注入低对比度按钮后，四组合 UPDATE 均失败并拒绝写 PNG；预算、命名例外及四张 PNG 的前后 SHA256 完全一致，见 `tests/visual/reports/visual-update-selftest.json`。
- [x] 同数量新节点替代旧节点及再次登记抬预算均被生产 assessAxe 自测拦截；本批没有降低预算或声称修复存量。
- [x] roadmap 两主题×两视口；有阶段数据的 project-detail-phases 默认/phase-hover/phase-edit 两主题×两视口有实际准备、页面断言及稳定截图，编辑弹窗已人审。原项目详情 light12/dark3 历史违例仍明确登记。
- [x] 支持按 profile/page/state 定向验证与更新；互斥参数、未知参数、不适用阶段状态失败。
- [x] 默认完整矩阵28组合、每组合5检查，正常复核140/140、像素diff全部0.00%；保留原14组合，额外项为路线图1366与阶段详情12组合。报告在 `tests/visual/reports/visual-matrix-default.json`。

准备器实测纠错：InteractiveTimeline 没有独立选中态，真实反馈是悬停/拖动及相邻阶段预览；右键当前走删除确认，PhaseContextMenu 没有设置为打开的生产路径。本任务覆盖实际状态，不新增选中态或接通菜单。固定时间与只读 GET 响应夹具保证重放；浏览器业务写请求隔离、实际零写入。像素 UPDATE 与首次存量 axe 登记是两个独立开关。

## 6. TC-C0.5：退役未使用的时间线

删除范围固定为：

1. `client/src/components/UnifiedProjectTimeline.tsx`。
2. `client/src/components/EnhancedProjectTimeline.tsx`。
3. `client/src/components/EnhancedProjectTimeline.css`。
4. `client/src/pages/__tests__/ProjectDetail.test.tsx` 中对应僵尸 mock 和失效说明。
5. `scripts/lint-ui-css.mjs` 中 `EnhancedProjectTimeline.css :: .btn` 白名单。

实施时在当前交付分支重新核对直接引用、barrel 导出、动态导入、注册表及 CSS 导入，确认不是共享样式的存活消费。当前目录 grep 不证明其他分支无引用；其他分支不是本次删除前置，后续合并正常处理。

C0a 初始化版本与删除版本记录在案；源码删除可以从 Git 恢复，但引用核对和验证仍须完成。账本以 `retired-unused` 出账，记录删除提交和范围；不能将约66处称为66个视觉缺陷被修复。不扩大到其他疑似孤儿组件。

- [x] 三件套与指定残留已删除；删除前全库直接/动态导入、导出和注册引用仅有自身CSS导入、测试mock与lint白名单。
- [x] `typecheck:client`零错误；ProjectDetail定向26/26；lint:ui及主色生产函数自测通过；build:client成功，无悬空依赖（构建有已有体积及CSS候选警告，单列，不冒充零警告）。
- [x] 89个身份/89次出现逐条以retired-unused裁决；账本1392次/1357身份，1190次消费仍待分类；以9797f60为基线的真实check通过。
- [x] 两主题×两视口详情时间线正常验证20/20，像素diff0.00%；仍使用InteractiveTimeline。

## 7. 令牌模型与 TC-C1 试点

### 7.1 语义结构先定，色值逐主题实测

先盘点现有 `--success/--warning/--danger/--info` 及相关前景/背景变量，优先复用或明确别名。确需补充时按用途建立 `--status-<role>-text/solid/soft/border`；不是要求无条件新增16个变量，更不是照抄评审中的示例 hex。

| 用途 | 令牌与验证 |
|---|---|
| 普通状态文字 | text；与真实背景测量，通常按小字号4.5:1 |
| 实心按钮/徽章 | solid；与实际文字前景成对验证，不能自动假设任何状态底都适合白字 |
| 淡染提示背景 | soft；与 text 配对，同时核对内容、选中识别和周边背景 |
| 必要边界/图标 | border 或对应图形色；按适用组件识别规则通常3:1，装饰性分隔线不机械套用 |
| 图表序列/业务标签 | 独立数据色语义；不强行合并为成功/失败色，也不能把必要图形对比度豁免为“数据色” |
| 阴影/透明度 | 使用适合的令牌与 color-mix；实测真实合成背景，不依赖颜色名称猜对比度 |

图表、Canvas 或库必须接收具体颜色值时，可以统一解析主题令牌并在主题变化时更新；只有技术约束成立才保留字面例外。Portal、SVG、主题切换和直接导航均属于真实消费上下文。

### 7.2 试点边界

C1 限于 InteractiveTimeline 的刻度文字、阶段悬停/预览及操作柄颜色反馈（实测没有独立选中态）。实际文件域为 InteractiveTimeline.tsx、interactive-timeline/TimelineGrid.tsx、PhaseHandles.tsx、project-colors.ts 与必需主题令牌；ProjectRoadmap 导航其余样式留 C2。

C1生成前预检（支柱D呈现/E操作安全）：机器默认矩阵来自 `states-project-detail-phases.json`，浏览器默认/悬停/编辑截图已到达真实阶段。阶段条与操作柄是div，原通用控件扫描未枚举，另以实际组件夹具完整绘制九种业务颜色、三个操作柄并计算前景/合成背景，不能以按钮扫描通过代替。

| 风险/两周后可能的红框 | 决策与覆盖 |
|---|---|
| 深色刻度仍用固定深灰 | 普通刻度继承text-secondary/text-tertiary，今日标签用danger-text；两主题实际取色 |
| 绿/黄阶段白字不可读 | 保留数据底色，按WCAG线性亮度选黑/白前景；九色及自定义色纯函数+实际组件验证 |
| 操作柄亮底白箭头、预览半透明导致文字失读 | 固定实心success/primary与白前景，hover用同族压深；预览保留虚线而不整体降低文字透明度；所有柄default/hover单独测量 |
| 颜色修复改动排程或数据 | 操作回调及业务色不变，浏览器写请求隔离；走查不提交阶段编辑 |

全局规则决策：阶段条、刻度、操作柄为div/span，不受button默认/hover/active背景覆盖；详情编辑按钮保持既有主色规则，未新增按钮样式。阶段条foreground与resize握柄同色；CSS边框映射border-color仅作分隔，不宣称其装饰边框满足交互轮廓阈值。

消费入口至少为 `/projects?tab=roadmap`、`/projects/:id` 的资源需求区域。固定阶段数据及时间窗口，确保有可选阶段；阶段色属于数据编码时保持意义，迁移选中描边/底色/图标等 UI 语义而非重新分配业务色。

只读走查点击选中、hover、Tab、Esc及导航，验证 default/selected/unselected/disabled 和相关浮层。拖动或缩放如会写业务数据，使用第4节的隔离方式；颜色验收不宣称已验证排程写入。

- [x] 刻度3次、操作柄15次、阶段固定前景/resize/边框4次，共22次消费已显式迁移/替换；新增18次体系定义。扫描1392→1388次（定义增加不算消费反弹）；保留3个数据常量，1个动态rgba模板片段明确为非恒定色候选。
- [x] 两个实际入口×两主题×两视口均命中；九种业务底色的实际组件夹具补足真实种子只呈灰色、div不入按钮枚举的盲区。默认/hover及编辑弹窗有证据，浏览器零写请求。
- [x] 数据标签最小4.83:1，操作柄default/hover最小5.48:1，16组状态文字/背景最小5.02:1；今日标记以黑白双轮廓跨任意业务填充，夹具实测必要边缘≥3。实际状态为悬停/预览，未捏造选中态。
- [x] 九种阶段色值、排列和操作回调保持；预览保留虚线，移除使文字失读的整体透明度；任务B主色及primary-foreground关系保持。
- [x] 22次消失消费逐身份裁决、保留3项双主题证据含阈值/前景/背景/源码与工件/依赖SHA256；失效证据、低于阈值及工件替换自测失败。真实check以5996da0通过。
- [x] `node scripts/verify-timeline-colors.mjs --refresh-evidence`复跑生产组件及实际入口证据；typecheck零错误、定向53/53、lint与颜色守卫自测通过；状态两个入口零新增违例，全矩阵140/140。迭代中采集所涉基线、正常像素复核均在阈值内；最终今日轮廓预期小差异0.02–0.05%单列。工期继续按域估算，不据试点机械外推全量时间。

## 8. 后续批次的覆盖要求

### TC-C2 交付证据

精确域：ProjectRoadmap.css/tsx、InteractiveTimeline.css/tsx、VisualPhaseManager、TimelineItemTooltip、PhaseContextMenu 的静态阴影、DependencyLines/utils及共享阶段调色板。需求图的八个角色序列色属于独立图表数据族，留C6定向非空数据场景；不因当前种子曲线为空就批准其可读。

- [x] 108次CSS消费逐声明映射，完整清单在 `tests/visual/migrations/TC-C2.json`；两份CSS仅剩9次体系定义。全域共137次令牌迁移、11次显式替换/去重（含9次阶段调色板副本），保留9个阶段数据色并逐色渲染验证。
- [x] 阶段颜色值/含义保持，必要数据边界继承实测可读前景；类型标签文字用主题墨色，编码保留在淡底/色条，避免任意业务色直接作小字。阶段9色文字与边界最小4.83:1。
- [x] 原依赖标签实测light4项/dark2项不足4.5，证据 `timeline-dependency-before.json`；修后5种标签在主题底板上均达标，连线双轮廓适配阶段填充，数据类型和位置不变。不可到达的菜单没有被接通。
- [x] 导航适配器改用真实5个前/后/今天/缩放控件，已逐一实际点击，双主题26个相位零新增问题；声明触发器为零会失败。详情状态双主题保持零新增，现存生命周期颜色问题明确留C4。
- [x] typecheck零错误、定向79/79、客户端构建、lint、账本真实check及自测通过；原RGB查找刷选区域的测试改为验证实际选中范围位置/宽度。全矩阵28组合140/140，axe预算未上调；路线图预期像素差异0.50–1.03%已人审并定向重采，正常复核通过。其余小差异在阈值内，未重采掩盖新axe。

正式账本1240次/1212身份：1007次pending（979身份）、12次有据数据色例外、220次体系定义及1次非恒定色模板候选。退役、去重、令牌迁移与实际视觉修复分别记录，不能把下降数量当缺陷数量。

| 批次 | 必须先到达的实际消费/状态 |
|---|---|
| C2 | 路线图、项目详情阶段区；刻度、当前月份、今天、依赖线、菜单、加载/无数据与所涉hover/focus态 |
| C3 | `/scenarios` 列表、展开卡片、类型/状态徽章；实际比较/合并/冲突弹层，由受控准备器打开 |
| C4a | 需求台告警及生命周期；父/子行、告警、终态、所涉状态菜单 |
| C4b | 选择/批量条、清空/删除提示；默认、hover、确认中、disabled及失败反馈 |
| C4c | 真正使用该全局样式的浮层/表单/反馈；清单覆盖每个被修改共享选择器的存活页面 |
| C4d | App.css剩余语义消费；先枚举实际消费者，再决定定向与全矩阵范围 |
| C5 | `/project-types/:id` 与 `.phase-template-designer`；已有阶段、编辑、勾选、新增面板、空态。ProjectAllocations 若无真实入口，只登记可达性，不先承诺视觉迁移 |
| C6 | `/import` 及剩余实际页面；文件选择、预览、错误/警告、危险选项、禁用/进行中。执行导入使用受控夹具，不写用户库 |
| C7 | 中性色各真实用途与两主题背景；逐项映射text-secondary/tertiary、border、bg，不能全换border-color |

App.css按组件域拆分，域内相关色相同时迁移；新增令牌可以供后续批复用。任何全局选择器变化必须确认样式加载顺序及跨页消费者，不将共享 CSS 的风险限定为文件所属页面。

## 9. 每批执行流程、命令及交付记录

每批十步：

1. 记录实施 HEAD、工作区差异、任务ID和精确文件域，保留他人修改。
2. 重扫本域，确认当前消费及页面入口，对每项确定分类与处理决定。
3. 增补所需 profile、准备器和页面/状态身份断言。
4. 保存修改前结果，执行相应注入自测，确认验收器确实覆盖目标。
5. 按真实调色板及背景确定令牌，修改对应消费；TS/TSX改后立即typecheck。
6. 执行源码/账本差异检查、定向单测、lint及所涉双主题状态检查。
7. 对比实际违规指纹和旧预算，确认没有新增或失效证据；完成孤儿裁决。
8. 人工查看两主题、两视口的实际截图，核对默认及所涉交互状态。
9. 仅为已确认的预期差异更新选定像素基线，再正常运行对比；不更新axe额度吸收回归。
10. 登记验证与剩余项，按用户授权单独交付本批；未测到的范围保留待处理。

当前已存在的命令，从仓库根运行：

```bash
git status --short
git rev-parse HEAD
npm run lint:ui
SELF_TEST=1 node scripts/lint-ui-css.mjs
npm run typecheck:client -- --pretty false
npx jest --config jest.config.cjs --selectProjects client --runTestsByPath client/src/pages/__tests__/ProjectDetail.test.tsx --runInBand
node scripts/verify-visual.mjs
node scripts/verify-states.mjs
node scripts/verify-boards.mjs
```

末三项依赖本机开发服务/浏览器；原始状态守卫只支持需求台，C0b已支持显式页面profile，当前支持项以`--help`为准，缺夹具/根节点仍须失败。不得为跑守卫重置用户库。verify-boards 涉完整业务操作时须用自有隔离实例；不能复用或重建其他任务正在使用的E2E实例。

以下接口已在C0实现，可以用`--help`核实；新页面必须先显式捕获或准备夹具，再运行定向验收：

```bash
node scripts/audit-color-debt.mjs --check --base-ref <比较基线>
node scripts/audit-color-debt.mjs --selftest
node scripts/verify-states.mjs --profile roadmap
node scripts/verify-states.mjs --profile projects --selftest
node scripts/verify-visual.mjs --profile roadmap
node scripts/verify-visual.mjs --profile project-detail
```

每个过滤选项必须报告命中场景和检查数量；参数未知、漏传或零命中失败。局部循环先定向检查，提交点再扩大到受影响矩阵及所需构建/单测；全站通过不能替代本域状态实际命中。

### 最终收口与台账

- [ ] C0扫描口径、账本历史、只读检查和自测全部可重复执行，未分类项为0。
- [ ] 本次范围确认缺陷和待迁移项为0；既有非本次缺陷明确归属，未被重采预算吸收。
- [ ] accepted-literal 有有效证据，未使用消费有退役或明确后续处置；没有未裁决孤儿。
- [ ] projects原有覆盖保持，所有本次实际页面/浮层/状态有身份与非零覆盖证据。
- [ ] 状态、axe、像素、人工走查分别通过；涉及共享组件的全部实际消费面验证完成。
- [ ] 账本记录fix/tokenize/retired-unused/accepted-literal分别数量，退役不计作视觉缺陷修复。
- [ ] 保留任务B守卫、自测和已验证颜色语义；相关类型、构建、实际收集的测试通过。
- [ ] 最终报告使用真实组合和检查数，不以固定“56/56”代表未纳管的新场景。

| 任务 | 状态 | 负责人/领取HEAD | 提交 | 证据与剩余项 |
|---|---|---|---|---|
| TC-C0a | 本地验收完成 | Codex / 0884836 | C0a独立提交，见Git记录 | 1481次/64文件；selftest、真实CLI拒绝、静态CI入口、lint、diff检查通过；仍有1244个待分类身份，属于后续批次 |
| TC-C0b | 本地验收完成 | Codex / 2cec4f0 | C0b独立提交，见Git记录 | projects115/115、自测7/7；roadmap20控件/双主题、注入自测通过；13个现有几何问题指纹单列，非颜色修复量 |
| TC-C0c | 本地验收完成 | Codex / 4ec3ec5 | C0c独立提交，见Git记录 | 28组合140/140；真实坏axe UPDATE不变hash；同数量替换自测；phase-hover/edit及确定只读夹具入矩阵 |
| TC-C0.5 | 本地验收完成 | Codex / 9797f60 | 独立退役提交，见Git记录 | 89次退役、非缺陷修复；typecheck零错误、ProjectDetail26/26、构建、主色自测、账本check及实际时间线20/20 |
| TC-C1 | 本地验收完成 | Codex / 5996da0 | 试点独立提交，见Git记录 | 22次消费替换/迁移；53/53、双入口状态零新增、矩阵140/140、四组合真实组件颜色证据；剩余1164次消费pending（1132身份） |
| TC-C2 | 本地验收完成 | Codex / 9c7905f | 路线图族独立提交，见Git记录 | 137次令牌化、11次替换/去重、9数据色保留；79/79、矩阵140/140、实际导航26相位及详情双主题零新增；C6独立图表数据族仍待处理 |
| TC-C3 | 本地验收完成 | Codex / ea040ec | 场景族独立提交，见Git记录 | 138次令牌化；默认26/受控分支40个状态相位零新增，52组合260/260；比较标题3个实际对比度问题修复，嵌套徽章按合成底色实测；unknown-background注入自测通过；当前869次/847身份pending |
| TC-C4a | 本地验收完成 | Codex / 916d5ab | 生命周期/告警独立提交，见Git记录 | 75次令牌化，4次delivered主题定义；8种真实Banner×双主题×两视口×4状态对比度通过；projects115/115、详情28相位零新增、3定向视觉60/60；Jest70/70；月份文字存量问题一并修复，详情axe预算12/3→0/0；当前794次消费pending |
| TC-C4b | 本地验收完成 | Codex / b6db997 | 批量/危险动作独立提交，见Git记录 | 44次令牌化；真实BulkActionBar受控输入44组状态/主题/视口测量，最低文字6.29:1，确认/悬停/标签添加移除互斥/禁用/清空均覆盖，零业务回调写入；全矩阵260/260、Projects单测59/59；当前750次/728身份pending |
| TC-C4c | 本地验收完成 | Codex / a5b2c30 | 浮层/反馈独立提交，见Git记录 | 17次令牌化；真实通知展示组件四组合，文字最低6.49、边框4.24，固定通知底色不透明，防止表格文字透出；真实批量浮层44状态测量通过，projects115/115及自测7/7、定向视觉40/40、Projects单测59/59；业务错误订阅U02仍由IP-06处理；当前733次/711身份pending |
| TC-C4d | 本地验收完成 | Codex / 591a031 | 全局余项/设置相关级联独立提交，见Git记录 | 119次令牌化，3次原有色值定义；App.css消费字面为0，灰色透明度保留；设置外观12相位颜色问题为0，原3/1 axe预算降为0/0；真实保存反馈8组合（声明浏览器mock，零外部写入），最低6.40；projects115/115、自测7/7、Jest129/129、构建及主色守卫通过；60组合300/300；1366主按钮品牌色和设置提示色重采经人工确认；当前614次/592身份pending |
| TC-C5 | 本地验收完成 | Codex / f1ab4b7 | 项目类型详情域独立提交，见Git记录 | 150次消费令牌化、1次默认值去重、1次示例文字排除；真实已有阶段及新增面板、双主题两视口已验证，颜色axe归零并下调预算，4个既有命中尺寸问题留原身份；新增展开态入矩阵，72组合360/360；projects115/115、Jest133/133、类型/构建/lint通过；深色视觉修复经人工确认后显式重采；705次/685身份，pending462次/442身份；未使用ProjectAllocations留C6处置 |
| TC-C6 | 待实施 | — | — | — |
| TC-C7 | 可选 | — | — | — |

单批记录包含任务ID、实施提交、范围/调用链、扫描前后分项数量、孤儿决议、页面/主题/视口/状态、真实命令与执行数、实际对比度/违规节点、截图及基线差异、未覆盖项和后续任务。实施状态以证据更新，不因方案定稿、扫描成功或预算内通过自动标为完成。
