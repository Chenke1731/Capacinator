# L4 收割台账（2026-09-26 摸底）

设计 §6 承诺的收割期账本。闭合判据：全部失败三选一（修 bug / 修测试 / 归档）完毕，夜间 L4 转绿后 `continue-on-error` 摘除。

## 摸底实测（2026-09-26 00:05，本周全部修复之后）

| 配置 | 总数 | 过 | 败 | flaky/skip | 时长 |
|---|---|---|---|---|---|
| main chromium | 323 | 293 | **25** | 3 / 2 | 19 min |
| scenario | 214 | 117 | **94** | 0 / 3 | 35 min（超时类拉长） |

**合计 119 败**（旧估 82 已过期：main 侧被本周修复大幅转绿，scenario 侧比已知更差）。

## 根因聚类（119 败 → ~10 个根因）

### main（25 败）
| 根因 | 波及 | 定性 |
|---|---|---|
| transaction-safety 全套老化：信封解包缺失×6、缺 role_id/date_mode×5、驱动已不存在的 UI 流、rollback 前提与产品设定相悖（产品有意允许超额分配——仪表盘告警即为此设计）、正则字面量笔误 `(\d+, 10)%` | 4 | 测试债，整卷现代化 |
| **capacity "Total Capacity"=29，下限 160** | 1 | **真信号待查**：卡片语义变化（总产能→可用产能？）或计算漂移 |
| capacity charts 空态回退断言 `no data` 文案不存在 | 1 | 测试债（回退分支写死文案） |
| assignment-workflows @critical（timeout+数值） | 3 | 待读 |
| crud/people：PersonModal 提交不可靠（已知债）+ 列表断言 | 2 | 已知债 + 待读 |
| 长尾 12 套件×1：strict-mode 定位器、TypeError undefined.id、移动端菜单、XSS 超时（安全类待查）、demand 图 20>10（呈现变化）、settings-permissions 等 | 12 | 多为测试债，XSS 待查 |

### scenario（94 败）
| 根因 | 波及 | 定性 |
|---|---|---|
| **系统性 helper 缺陷**：`undefined.id/name/0/length`（visualization 14、complex-import 9、planning 5、ui-interactions 5 等约 45 败）——同一共享 setup 路径 | ~45 | 测试债，现代化主靶 |
| 选择器漂移：fill/click 超时（旧弹窗流，UI 已改版） | ~25 | 测试债 |
| export-scenario beforeEach 挂死 30s | 11 | 测试债（一个 hook 拖死全套件） |
| **陈旧登录态 FK 竞态**：storageState 登录者=测试自造人，被 cleanup 删除后 UI 仍以其 id 发 created_by → 500 | ~7（含下游"找不到行"） | 测试世界竞态 + **产品加固机会**：create 应从 token 取 created_by，不信任 body |
| 其余零散 | ~6 | 待读 |

## 真产品信号清单（收割至今）

1. ~~capacity Total Capacity=29 vs ≥160~~ **已定性：非 bug**——29 = byRole 日产能 8+8+8+5（QA 5h 来自 reduced availability），测试下限 160 是月产能口径。产品无恙；顺带记 B 级语义改进点：卡片无时间窗口标注，易误读。
2. **enhancedErrorHandler 循环引用崩溃**（切片 2 抓获，已修）——原始 err 携带 req/socket，winston 序列化自己崩（"Converting circular structure to JSON"）→ 原始错误被吞、坏 500、双重响应。修复：净化后再记日志 + `res.headersSent` 守卫。该签名此前在红线日志里出现过多次，被 `>=400` 断言放过。
3. **GET /api/assignments/:id 对 create 返回 id 404**（切片 2 抓获，已修）——POST 返回 scenario_project_assignments 裸 id，getById 只查 project_assignments；镜像 de9ad27 的 delete 回落补齐。
4. **scenarios.create 信任 body.created_by** —— 建议改 req.user.id 优先（消灭陈旧登录态竞态类失败）；未修。
5. 待查：assignment-workflows ×3、XSS 超时 ×1、crud/people 列表 ×1

## 切片计划（信号密度序）

| # | 切片 | 内容 | 状态 |
|---|---|---|---|
| 1 | capacity 信号验证 | live 探针 29h 的构成；定性后修产品或修断言 | ✅ 定性：口径问题非 bug |
| 2 | transaction-safety 现代化 | API 驱动重写 4 败测（并发/回滚/完整性），修前提与信封 | ✅ 6/6 绿；顺带修 2 个真产品 bug（上表 #2/#3） |
| 3 | scenario 系统性 helper | 修一处 setup 路径 → 预期 ~45 败一次性转绿或转可读 | ✅ 见下 |
| 4 | 陈旧登录态 + created_by 加固 | 服务端 req.user.id 优先 + 测试登录锚定种子人 | ✅ 合并切片 3 完成 |
| 5 | export-scenario hook + 选择器漂移 | 逐套件现代化 | ✅ 见下 |
| 6 | import-export 自给自足化 | export-scenario + complex-import 重写（假绿揭出的存量债） | ✅ 见下；顺带修 3 个真产品 bug |
| 7 | 长尾 12×1 + flaky 3 | 逐个定性 | 待做 |

进度：摸底完成；切片 1-4 完成。

### 切片 3+4 详情（2026-09-26）

系统性根因比预想更深——共享 helper `createTestScenario`（test-data-helpers.ts）五病俱全：
1. 字段名错（`type` ≠ `scenario_type`）
2. 缺必填 `created_by`
3. 信封不解包（`.id` 永远 undefined，静默跳过）
4. 修 2 时引入的次生病：creator 缓存取 `people[0]`——列表按新到旧排序时 [0] 是并行 worker 的临时人，被其 afterEach 删除后全库 create 变 FK 500（跨 worker 竞态）。修：缓存锚定种子人（`person-e2e-*` 全程存活）
5. **DB CHECK 约束**：`scenario_type IN ('baseline','branch','sandbox')`——`what-if`/`forecast` 从来就插不进去（4 个 helper/spec 文件 + git-sync 工厂共 7 处）

修复范围：test-data-helpers（createTestScenario 重写 + createTestUser 信封 + bulk 返回补 projectTypes/locations/roles 引用集）、test-context-manager、e2e-test-data-builder、unified-test-data-factory、git-sync-data-factory、edge-cases 类型过滤值、3 个 spec 的 beforeEach 改走 helper。

**僵尸归档 ×3（-46 测，scenario 账本 214→168）**：visualization（图视图功能客户端 0 引用）、ui-interactions（tooltip/拖拽/面板缩放/骨架屏均 0 引用）、planning-workflows（what-if 分析/capacity calculator/审批/评论模块从未建成）。真实覆盖已由较新套件与红线承担。每卷归档头注明裁决依据。

**产品加固**：`scenarios.create` 的 `created_by` 改为 token 身份优先（req.user.id || body），杜绝客户端携带陈旧/伪造 FK。

**残余（切片 5 范畴）**：scenario 62 败 = export-scenario 11（`export-section` testid 漂移 + beforeEach 与 complex-import 并跑时超时预算）、complex-import 9（import 流程断言）、edge-cases 10、其余零散——全部是逐测试本体漂移，系统性根因已清零（各套件 setup 均已单独验证可建数）。

### 切片 5 进展（2026-09-26）

**basic-operations 11 败 → 8 过 + 3 跳过（1 条件 + 2 条件）**，逐病根治：
- **模块级 userId 跨测试复活**：第一个测试的 beforeEach 设 userId、其 afterEach 删人 → 后续所有 beforeEach 用死 id 建 scenario 全部 FK 500。修：每测试重新解析，锚定种子人。
- **陈旧列表竞态**（D13 同族）：API 建数后页面 fetch 到完整数据但树渲染旧快照（trace 证据：GET 返回 4 条、a11y 树只有 Baseline）。修：getScenarioRow 重试间 reload（已知配方）；search/filter 测试同法。
- **getBadge 类名错位**：`.scenario-type/.scenario-status` 是卡片组件的类；层级行用 `.type-column/.status-column`。修：双选择器。
- **删除流程改键名确认**：对话框要求输入场景名解锁删除钮。修：填名 → 删。
- **modal 输入无 name 属性**：getByPlaceholder('Enter scenario name')；类型选择是 shadcn Select（#scenario-type + role=option），baseline 选项不存在（种子专属）已从用例移除。
- 信封解包补齐 ×2 处。

**期间确诊一个 UI 层真缺陷候选**（未修，记档）：Scenarios 树在 React Query 数据更新后渲染陈旧快照（数据已在、渲染不跟随），reload 即恢复——值得专项查 React Query 数据→filteredScenarios→render 链路。

### 切片 5 验证跑（2026-09-26 13:33，basic-operations 提交后）

scenario 全量（12 文件，22.1m）：**109 过 / 28 败 / 4 跳过**——94→28，无需返工。export-scenario（11 败）与 complex-import（9 败）**未专门修即转绿**（切片 3-4 helper 五病修复顺带治愈），切片 5 实际残余比预估减半。剩余 28：edge-cases 10、ui-scenario-interactions 7、data-integrity 5、data-isolation 5、scenario-comparison 1。ui-scenario-interactions 根因已抽查：AppHeader 选择器**条件渲染**（存在非 baseline 场景才出现，AppHeader.tsx:127）+ 类名漂移（实际 `.scenario-dropdown` 非 `.scenario-dropdown-menu`）——测试债。

（勘误：`--reporter=line | tail` 管道会掩盖 playwright 退出码，且 `.last-run.json` 可能滞留旧跑——验证必须看失败清单/复跑 EXIT，不看管道 exit 0。）

### 切片 5 残余收割（2026-09-26 14:00-15:00，完成）

靶：edge-cases 10、ui-scenario-interactions 7、data-integrity 5、data-isolation 5、scenario-comparison 1（flaky）。三轮迭代，挖出一条**主根因链**与两个新真产品信号：

**主根因链（种子 Baseline 被逐出可视区）**：
1. 服务端 delete 守卫拒绝删任何 baseline（"Cannot delete baseline scenario"）——对产品流正确（UI 只提供 branch|sandbox，baseline 是种子专属），但 API 建的测试 baseline **永不可删**；
2. 旧 cleanupScenariosByPrefix 为绕这个 500 按 type 过滤跳过 baseline → 测试 baseline 永久泄漏（单轮可积 19 条）；
3. 树视图 `displayLimit=10` 最新在前，种子 Baseline 最老 → 被挤出 DOM → 所有依赖种子行的断言（comparison 源行、branch 父选择、header 断言）连环爆；
4. 各测试/helper 用 type-first 挑 baseline（`find(s => s.scenario_type==='baseline')`）→ 选中泄漏的空 baseline 做 branch 父 → 拷 0 行 → "No data available"。

**修复**：测试世界不再经 API 造 baseline（镜像 UI 契约，改 sandbox）；种子选择一律精确名 'Baseline'；cleanup helper 去掉 type 过滤+新到旧序+双 sweep；comparison 源行用搜索过滤器绕 displayLimit（filtered 视图不切片）。

**新真产品信号**：
6. **场景树 displayLimit=10 无 Show All 出口**（B 级，真缺陷）——`isLimitedView` 算出但从未渲染（死代码，未完成的功能）：>10 场景时旧行静默消失，**种子 Baseline 会被挤出可视区**，branch/compare 的锚点行不可达。测试侧已用搜索过滤器绕过；产品侧建议渲染 isLimitedView 指示 + Show All 按钮（状态已有，缺 UI）。
7. **展开按钮点击区被 GitBranch svg 遮挡**（B 级候选）——`.connector-expand-button` 中心点被行内容 svg 拦截 hit-testing，Playwright 报 intercepts pointer events；force 也无法重定向（浏览器层）。测试用 `el.click()` 程序化点击绕过。真实用户点 chevron 中心可能同样无效——待人眼验证。

**其他战果**：basic-operations "view scenario details" 系**顺序偶然通过**（产品无 /scenarios/:id 路由）——改断言真实交互（行内 focus + aria-selected）；edit-properties 的 input[name] 漏网选择器补修（#edit-scenario-name）；demand 报文形状落档 `{ data: { demandData: [{ demand_hours }] } }`；scenario-comparison :92 的"flaky"定性为**种子行被挤出可视区**（非时序竞态）。

**第四根因（本轮终极一环）**：`waitForScenariosToLoad` 的 `keyboard.press('F5')` 在 headless Chromium **是死动作**——不触发导航，"刷新重试"从未真正刷新，后续 networkidle 立即假满足。此前数月"正常"全靠共享库被泄漏行垫底（首轮计数即过，F5 从未执行）；清库后死循环烧满预算才暴露。修：`page.reload({ waitUntil: 'domcontentloaded' })`。同理：smoke 测试预算修剪（去掉冗余 networkidle 等待 + setTimeout 60s）。

**验证**：六套件联跑 48/0 绿；全量 scenario 收集 134 过 / 22 败 / 4 跳过（18.3m）——**22 败全部落在 import-export 两套件**（export-scenario 13 + complex-import 9），系 13:33 验证跑踩泄漏数据的**假绿现形**（干净库下前提崩塌：虚构 testid、500KB 文件阈值、依赖库内已有第二个可选场景等）；所有已改套件在全量下 0 败。**新暴露的存量债 = 切片 5 遗留靶**（下一轮：import-export 自给自足化）。

### 切片 6：import-export 自给自足化（2026-09-26 深夜，完成）

两套件按真实产品契约整体重写（20 测保持，账本 160 不动），**挖出 3 个真产品 bug——Excel 导入功能自 sub-type 落地起全路径死亡**：

**产品修复（src/server/services/import/ 两文件）**：
1. **projects.project_sub_type_id NOT NULL 无默认**，V1/V2 importProjects 均不提供 → 项目行必炸全回滚。修：新增 `findOrCreateDefaultSubType`（类型默认 sub-type → 首个 sort → 自动建），两 importer 落位。
2. **people.primary_role_id 列不存在**（实际为 `primary_person_role_id`，FK→person_roles join 行）。V1 直接写错列名；V2 三病：错列名 + person_roles 表无 created_at/updated_at 却插时间戳 + proficiency_level 传 TEXT('Intermediate') 而列是 INTEGER。修：两 importer 改走 person_roles 插入 + 回链 primary_person_role_id，proficiency 传 3、is_primary 1。
3. **standard_allocations 表已更名 resource_templates**（migration 046），两 importer 仍写死旧表名 → allocations 数据行必炸。修：表名对齐（insert 列形状本就兼容）。

**测试重写锚点（真契约）**：
- export 走 `/import?tab=export`（bookmarkable tab 参数；import 是默认 tab——旧测试 13/13 全死在虚构 `data-testid="export-section"`）；选择器全改 aria-label/类名（导出按钮文本与卡片标题同文，text 定位器 strict-mode 必炸，改 `aria-label="Export selected scenario data as Excel file"`）；下载用 `waitForEvent('download')`；失败断言 OperationProgress 错误文案 + Retry 按钮（产品用进度面板，无 alert()）。
- import 用 **V1 格式文件**（Projects + Rosters + Standard Allocations 三 sheet 缺一不可——缺 allocations 是 critical error）+ 显式取消勾选 "Use new template format"（默认勾选走 V2 importer，V2 只认 'Roster' 无 'Rosters' 别名）；成功文案是服务器消息 "Excel import completed successfully"（非 UI 字面量）；`imported.projects/people` 是本轮计数可精确断言，`roles/locations/projectTypes/phases` 是全表计数**不可精确断言**。
- 断言分层：UI 文案（确定性锚）+ `waitForResponse` 捕获 API 状态码/错误体 + API 级数据核验（回滚完整性、持久化）。
- 僵尸前提删除：Analyze 按钮、冲突分析面板、Import Anyway、取消导入、批次进度、Download Error Report、部分导入（V1 是 all-or-nothing 回滚）、2000 行 >500KB（ExcelJS 压缩后 ~150KB，物理错阈）。替代为真契约对应物：默认开启的 validateDuplicates 查重取消（按**名字**非邮箱，对 DB+文件内）、V2 格式不匹配拒绝、auto-create 引用实体、全量回滚、大文件预算（1000 行 <150s）。
- 残留清扫：import 插入行不归 testContext 管，afterEach 按前缀 API 清 projects/people + 引用实体。

**集成测试 schema 过期分叉（同病异灶）**：tests/integration/test-schema(-additions).sql 还停留在旧世界（people.primary_role_id、无 id 的 person_roles、resource_templates 缺 project_type_id）——**这正是 V2 importer bug 长期隐形的根源：单测对着虚构 schema 验证代码**。对齐：people/projects 补列（projects 的 sub_type 列测试库保 nullable 以兼容直接播种）、person_roles 对齐生产形状（INTEGER proficiency + 时间戳保 default 兼容两种插入）、sub_types 补 is_default/sort_order/description、FK 补 CASCADE、afterEach 清理列表补 project_sub_types/resource_templates（新表从未进列表 + catch 静默吞 FK 错——auto-create 残留挡住 delete project_types 连环污染）。

**坑**：test-schema-additions.sql 按 `;` 切分执行——**注释里不能有分号**（带分号的注释会把 CREATE 语句切碎，SCHEMA ERR 只打 console 不 fail）。

**验证**：两套件 20/20 绿（3.6m）；Jest 全量 4217 过 / 0 败（修前 2 败）；lint 0 错误。

**遗留 B 级（未修记档）**：
8. **客户端导入失败吞细节**（ImportUnified.tsx handleUpload catch）：400 响应的 errors 数组被丢，只保留 message——用户看不到具体哪行错。建议 catch 里取 `error.response?.data?.errors` 透传给 result.errors。
9. **tags 对象只 6 键**（fixtures/index.ts），其余键全渲染 "undefined" 前缀污染标题——历史遗留，非本轮引入。
