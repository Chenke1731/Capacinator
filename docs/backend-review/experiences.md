# 后端评审经验库（experiences）

> 规则：每条经验都必须能追溯到一次事故或一次裁决；`GUARD` 必须附断言草案与变异自证；
> `enforced` 后必须删除对应人工检查项（禁止人机双源）。
> 本文件由 `npm run verify:backend-review` 校验完整性；新增条目走 patch diff 审批，评审员不得直接修改。
> 种子条目（EXP-B01~B06）来自改进计划 §7 台账已记录的真实事故，2026-11-11 随 backend-reviewer 机制建立时入库。

```yaml exp
id: EXP-B01
source: incident/2026-10-15-v2-import-writes-legacy-table（IP-02b 发现，IP-05d 修复）
class: 写路径×读侧切片
mechanism_slice: write-path × scenario-slice-read
disposition: GUARD
guard: enforced — scripts/check-legacy-table-writes.mjs（G2，pre-commit 聚合 verify:backend-gates）：生产代码禁写 project_assignments（白名单=迁移/seed 整类豁免 + 工具端点/备份/生命周期兼容逐条理由）；SELF_TEST 4/4
verification: done（2026-11-11，I01v v2/v3）— 变异自证：注入未授权 `trx('project_assignments').del()` → 脚本红；真实扫描绿（白名单 4 条）；G2 之外导出/导入/备份链路逐条核过；I02a 销账后白名单 3 条、SELF_TEST 改夹具白名单（不与真实清单耦合）
status: enforced
note: V2 导入写旧表 project_assignments，运行时 0 行，导入分配对切片读侧完全不可见（IP-02b 台账遗留列）；IP-05d 已修导入落表。2026-11-11 场一评审同族第 2 次命中：AssignmentRecalculationService 全服务读写旧表且零生产调用（探针：'project' enum 已删 INSERT 被 CHECK 拒、recalc 恒 0 行；CLAUDE.md:158 仍宣称其负责级联）——同族 ≥2，G2 已落地（I01v）。D18=B 已执行（I02a）：服务重写为只读 scenario_project_assignments 的 computed 刷新，冻结条目销账；新增 G-E `scripts/check-write-path-registry.mjs` 防"改调度输入不刷新 computed"复发
```

```yaml exp
id: EXP-B02
source: incident/2026-10-15-daybefore-utc-pitfall（IP-02d 途中修）
class: 日期边界×UTC序列化
mechanism_slice: date-boundary × toISOString-utc-shift
disposition: GUARD
guard: enforced — scripts/check-reports-dates.mjs（G3，pre-commit 聚合）：reports 服务禁 toISOString().split('T')[0] 裸写，日期串统一 toISODateLocal/storedDateToIso；SELF_TEST 4/4（裸写/双引号变体红，原语/注释绿）。范围局限：仅 services/reports 目录、仅该写法（其他目录按需另立）
verification: done（2026-11-11，I01v v1/v4）— 调用面收敛实测：ReportDataService 裸写×6→toISODateLocal（含 :931 月桶边界 2027-01-01→2026-12-31 实害）；变异自证：脚本 SELF_TEST 注入裸写→红
status: enforced
note: IP-02d SE 窗口计算中 dayBefore 的 toISOString UTC 时区坑——本地零点倒退一天；修复时已收敛进统一窗口计算。2026-11-11 场一评审同族第 2 次命中：ReportDataService.ts:931 月桶边界 UTC 偏移（2027-01-01→2026-12-31 实测）+:45 缺省今天——同文件 :28-30 已有 toISODateLocal 原语未推广。G3 原拟 reports 服务静态断言，已落地（I01v），台账"实体 6 条"计数由此对齐为 6（G1/G2/G3/INV-1/INV-2≡G4/INV-4）
```

```yaml exp
id: EXP-B03
source: incident/2026-11-10-personutilization-fixture-date-aging（I01 全量 Jest 发现，存量未修）
class: 测试夹具×日期老化
mechanism_slice: test-fixture × absolute-date-pinning
disposition: GUARD
guard: proposed — 覆盖日期窗口的测试夹具必须相对"今天"生成或显式冻结假时钟（jest fake timers / 固定 today 注入）；禁止钉死绝对月份（如 2026-10 窗口），窗口滚出即红
verification: pending — 变异自证：把夹具钉死 2026-10 并将假时钟拨到 2026-12，用例必须变红；相对化后拨钟必须仍绿
status: candidate
checklist_item: 日期窗口夹具是否相对化或冻结时钟（人工项；守卫上线后删除）
note: personUtilizationView 2 例存量红：夹具钉 2026-10 窗口已滚出，stash 干净 HEAD 同样红（I01 台账 I01a 行记录）。2026-11-11 更新（交付评审 R9）：批 B a0c8161 已改 windowAroundToday(±7) 相对窗口，隔离自跑 8/8 绿；本守卫（静态禁绝对月份）仍 candidate，检查项保留
```

```yaml exp
id: EXP-B04
source: incident/2026-11-10-intake-counts-route-order（I01 HTTP 合同批）
class: 路由序×子路由吞噬
mechanism_slice: route-registration-order × param-route-shadow
disposition: GUARD
guard: api 合同测试：子路由（/counts 等）必须注册在参数路由 :id 之前，新增子路由附路由序断言（对 /api/intake 先打 /counts 再打 /:id，:id 分支不得 200 吞并）
verification: done — I01 HTTP 合同测试 12/12 含"counts 路由序不被 :id 吞"用例（分支 43c969e，服务集成批）
status: enforced
note: routes/intake.ts 初版 :id 先于 /counts 注册，GET /counts 会被当 id 解析；合同测试固化路由序——但测试是镜像注册序（自建 router 复刻顺序）而非 import 生产 router，生产 routes/intake.ts 自身改序不会红（守卫强度限制：评审触及路由文件时须核对生产注册序）。同族警惕：任何资源路由新增子路由时复发
```

```yaml exp
id: EXP-B05
source: incident/2026-10-16-availability-100-fallback（ReportDataService.ts:693 注释自认；台账 456 行遗留列"||100 族未动"）
class: 缺省回退×合法零值
mechanism_slice: default-fallback × explicit-zero-swallowed
disposition: GUARD
guard: enforced — scripts/check-numeric-defaults.mjs（INV-2≡G4，pre-commit 聚合）：生产代码 `|| 非零数字字面量` 必须双栏归类（合法参数缺省逐条理由 / 存量缺陷冻结 0 条——I02a 清零），未分类即红；SELF_TEST 5/5。局限：按 file::literal 聚合（同文件同字面量共享豁免），`||0` 不扫（数值上≡??0）
verification: done（2026-11-11，I01v v1/v3/v4）— 两场评审探针红证：AssignmentRecalculationService.ts:317（0% 人员+50% 分配→无冲突，场一 BR-F03）+ phaseInheritance.ts:65 `|| 30` 吞 0 天模板（场二 F3，同族第 2 活跃实例，修共享原语即双修 ProjectsController 同链）+ ReportDataService.ts:620/626/636/668 `||8` 四处（BR-F07）；INV-2 落地实测：全库 32 命中全归类，注入 `|| 30` 变异红证，同批修 CustomPhaseManagementService:395（同族第 3 实例）+AssignmentsController:1049（C09 族）
status: enforced
note: `person.default_availability_percentage || 100`（AssignmentRecalculationService.ts:317）吞显式 0%；ReportDataService.ts:693 注释自认同类（"可用率 || 100 回退（显式 0% 被吞）"）。与 R07"合法 0 全保留"同族——本条是 backend-reviewer 试点第一场盲评对象。INV-2 已落地（I01v），常驻检查项移除；I02a 重写该服务后 `|| 100` 命中消失，FROZEN 清零（冻结条目与代码同步销账）
```

```yaml exp
id: EXP-B06
source: incident/2026-10-16-lint-zero-pipe-masking（lint 清零批教训，台账 453 行）
class: 验证命令×管道掩码
mechanism_slice: shell-pipeline × exit-code-masking
disposition: NIT
expires: 2027-02-10
status: candidate
note: 后台验证命令带 `| tail` 掩码退出码+截断失败详情，终验须 `set -o pipefail` + 全输出留档。属会话/命令约定，暂无物理守卫；若同族再犯升级为 GUARD（候选方向：验证命令白名单 hook）
```

```yaml exp
id: EXP-B07
source: incident/2026-11-11-i01-intake-audit-whitelist-silent-skip（backend-review 试点场二 F1，A 级探针）
class: 审计白名单×新表静默
mechanism_slice: audit-whitelist × new-table-silent-skip
disposition: GUARD
guard: enforced — scripts/check-audit-whitelist.mjs（INV-1，pre-commit 聚合）两态形：主断言=新增审计表（REQUIRED_TABLES）⊆ 白名单并集（config 默认+各 .env 解析）；普查报告=在编控制器审计表名中不在并集者逐条输出供台账裁决（不静默冻结）；SELF_TEST 4/4
verification: done（2026-11-11，I01v v2）— 探针 isTableAudited("demand_intake")=false 对照 ("projects")=true；HTTP 断言（capture 后 audit_log 有行）修复前必红已实证（.env.test 移除 demand_intake → 审计套件 5/6 红）；普查实绩=存量 6 表立案 D21
status: enforced
note: 白名单外仅 debug 日志静默跳过（enhancedAuditMiddleware.ts:182-185）；设计稿 §4.4 承诺 INTAKE_* 审计与 §7"不改白名单"裁决组合=承诺必然落空；裁决 D16=A（加白名单+action 对齐，与 F4 await 同批落地）。INV-1 已上线（I01v），常驻检查项移除
```

```yaml exp
id: EXP-B08
source: incident/2026-11-11-i01-floating-audit-crash（试点场二 F4，A 级探针 exit code 1）
class: 浮动审计Promise×进程退出
mechanism_slice: floating-promise × audit-rethrow
disposition: GUARD
guard: enforced — scripts/check-audit-await.mjs（INV-4，pre-commit 聚合）：src/server 生产代码 `.logAuditEvent` 直接调用点必须 await，否则红；SELF_TEST 4/4（浮动/await/多行/成员访问）。局限：别名调用/方括号访问/logBulkAuditEvents 不在扫描面（人工核）
verification: done（2026-11-11，I01v v2）— 探针（dev 模式+drop audit_log）实证未 await→Unhandled Rejection→exit(1)；7 处 intake 调用补 await 后失败进错误路径（intake-audit R5 用例固化 500+重试 409）
status: enforced
note: middleware 审计失败 re-throw + enhancedErrorHandler dev/test exit(1)、production 仅 log 静默丢失；createBatch 200 条=200 个浮动 Promise 放大面。INV-4 已上线（I01v），常驻检查项移除
```

```yaml exp
id: EXP-B09
source: incident/2026-11-11-report-scenario-stacking（试点场一 BR-F01，A 级探针）
class: 报表聚合×场景叠加
mechanism_slice: report-aggregate × scenario-stacking
disposition: GUARD
guard: enforced — tests/integration/api/report-scenario-slice.test.ts（G1，server-integration 套件常驻）：A=baseline 原语 vs capacity_gaps_view 逐列对等（1.8FTE/1.3FTE 非空断言防抄写漂移）；B=建未改动分支前后四报表（dashboard/capacity/gaps/demand 缺省头）逐一相等；C=显式 baseline 头≡缺省头+branch 头敏感；D=baseline 行缺失态旧表轨道行仍计入（评审 N10）
verification: done（2026-11-11，I01v v1/v4）— 真迁移探针红证：baseline 0.6 FTE/86h → 分支后 1.2/172；**变异自证**：去场景过滤→B/C 红（A 绿，A 只比对 CTE 抄写）；去 Contractor 0.8 折扣→A 红 B/C 绿
status: enforced
note: 缺省路径 applyScenarioFilter 直接 return + capacity_gaps_view/person_utilization 系视图无场景维度；裁决 D15=B（弃聚合视图改 activeAssignmentsInScenario 原语内联）。G1 已落地（I01v），常驻检查项移除
```

```yaml exp
id: EXP-B10
source: incident/2026-11-11-doc-claim-dead-wiring（试点场一 BR-F02）
class: 文档宣称×死接线
mechanism_slice: architecture-doc × actual-call-graph
disposition: DECISION
decision: D18=B（2026-11-12 用户裁决：低频审视/月度排产画像，选择接线切片轨）——已执行 I02a：服务重写为 scenario_project_assignments 的 computed 刷新，CLAUDE.md Cascading Updates 段改写，G-E 写点注册表守卫落地
status: retired
note: AssignmentRecalculationService 零生产调用（grep 仅 skip 测试）、读写已废弃旧表、引用已被迁移 024 删除的 'project' enum（INSERT 被 CHECK 拒、recalc 恒 0 行）；而 CLAUDE.md 仍宣称其负责阶段→分配级联，后续 agent 按文档接线会写废弃表。D18 前置条件已执行：CLAUDE.md:158 已标注实际零调用（I01v v2）。D18=B 执行后本决策关闭：文档与活接线一致（新服务只读写切片表），不再构成误导风险
```

```yaml exp
id: EXP-B11
source: incident/2026-11-11-partial-refactor-primitive-not-adopted（试点场一 BR-F04/F07）
class: 部分重构×原语未推广
mechanism_slice: partial-refactor × primitive-not-adopted
disposition: GUARD
guard: enforced — 修复点名的行后必须收敛同文件/同族调用面，静态扫描承载（G3=scripts/check-reports-dates.mjs；G4/INV-2=scripts/check-numeric-defaults.mjs，均入 pre-commit 聚合）——只改增量行不改调用面=新旧口径并存
verification: done（2026-11-11，I01v）— ReportDataService 同文件收敛：??8 推广至 :620/626/636/668（原与 :729 并存）、toISODateLocal 推广至 :45/:227/:228/:230/:931/:932（原与 :28-30 并存）；两守卫 SELF_TEST 4/4+5/5、真实扫描绿
status: enforced
note: 两处"正确原语就在同文件"却未被新代码采用——修复批必须含调用面收敛，不是只改被点名行。G3/G4 已上线（I01v），常驻检查项移除
```

```yaml exp
id: EXP-B12
source: review/2026-11-11-i01v-design+delivery（两轮评审新增）
class: 守卫立项×存量违例未普查
mechanism_slice: static-guard × violation-inventory-gap
disposition: GUARD
guard: proposed — 静态守卫立项批必须附"全库命中普查输出"；命中超预期时守卫形状须重设计（分栏冻结/普查报告两态），禁止把活缺陷静默塞进豁免清单。断言草案：守卫 PR/批的账目必须含普查命令与命中清单（数量+分类），SELF_TEST 覆盖"超预期命中"分支
verification: reproduced 2026-11-11 — INV-1 按首版"全量⊆白名单"落地即红（存量 6 表）；INV-2 首版"仅参数缺省合法"与实况不符（非参数活命中 6+）→双栏冻结形
status: candidate
checklist_item: 守卫立项时是否做过全库命中普查（人工项；守卫上线后删除）
```

```yaml exp
id: EXP-B13
source: review/2026-11-11-i01v-delivery（R4 同族）
class: 审计枚举扩展×消费端失步
mechanism_slice: audit-action-enum × consumer-fanout
disposition: GUARD
guard: proposed — 新增审计 action 字面量前缀（如 INTAKE_*）必须同时盘点三读者：①middleware 两处签名类型 ②AuditService 分支（UNDO 只认 CREATE/UPDATE/DELETE）③客户端撤销可用性与提示。断言草案：单测 undoSpecificChange(前缀 action 行)===false 不抛 + 客户端渲染该行无撤销按钮/undone:false 提示；静态断言审计 action 字面量集合 ⊆ 导出枚举
verification: done（2026-11-11，I01v）— intake-audit「undoSpecificChange 对 INTAKE_* 返回 false」+ AuditLog 客户端两用例（INTAKE 行无撤销入口/undone:false 提示）已实证；静态枚举断言未做（三读者为人工盘点+测试承载）
status: candidate
checklist_item: 扩展审计 action 时三读者是否同步（人工项；静态断言上线后删除）
```

```yaml exp
id: EXP-B14
source: review/2026-11-11-i01v-delivery（N1-N3 台账数值不可复现）
class: 台账证据×可复现性
mechanism_slice: ledger-evidence × reproducibility
disposition: NIT
expires: 2027-02-11
status: candidate
note: 台账证据列出现 4655/1 vs HEAD 4656/0、21/21 vs 22/22、"A/B/C 全红"vs 实际 B/C 红——根因=数字未附命令、未区分中间态与 HEAD、未标 project 范围。台账规范：数字必须附可复现命令+范围+时点；同族再现升级 GUARD。
```

```yaml exp
id: EXP-B15
source: review/2026-11-13-i02a-delivery（P2-1：G-E 文件级 includes 假阴性）
class: 静态守卫×文件级假阴性
mechanism_slice: static-guard × file-scope-false-negative
disposition: GUARD
guard: enforced — scripts/check-write-path-registry.mjs（G-E，pre-commit 聚合）：敏感写点后 120 行内必须出现刷新调用；spread 写点按写点前 1500 字符调度字段上下文识别；project_phases_timeline 删除/ computed_* 写入须登记；REFRESH_WIRED/EXEMPT/DELETE_GUARDED 惰性条目红；注释先经状态机剥离（`// ... /lifecycle/*` 不再吞代码）；SELF_TEST 7/7
verification: done（2026-11-13，I02j）— 变异红证：完整删除 ProjectsController.update 刷新调用→红线 860；删除 ProjectPhasesController.update 单阶段刷新（bulk 保留）→红线 265；注入未登记 `trx('project_phases_timeline').del()` + computed spread→两类红；SELF_TEST 4 空豁免红/登记绿
status: enforced
note: 初版 G-E 用 `source.includes(refresh)` 整文件判定——删掉单阶段刷新仍绿（bulk 的调用在文件里），spread 写点/删除/computed spread 全盲；评审用四条变异证明守卫不成立。修复后守卫以写点为中心，且登记表不养死条目。同族警惕：任何"文件里出现过 X"式守卫都需 per-site 窗口与反向自证
```

```yaml exp
id: EXP-B16
source: review/2026-11-14-workbench-v2-fix（F1：076 迁移 down SQL 损坏——epc 别名/括号失衡/谓词改写，CREATE VIEW 恒语法错误）
class: 迁移可逆性×down SQL 零校验
mechanism_slice: migration-down × raw-sql-unvalidated
disposition: GUARD
guard: enforced — tests/integration/api/migration-down-contract.test.ts（G-F1）：隔离内存库跑全链 up 后，对每个纯视图族迁移（只 DROP/CREATE VIEW，无表级 DDL/数据写）按升序逐个 down+up，断言零抛错且 sqlite_master 视图数收尾一致
verification: done 2026-11-14 — 守卫先于修复上线即在真实损坏上红（near "THEN": syntax error），修复后绿（红→绿自证）；076 修入走 check-migrations-immutable 的 INTENTIONAL_AMENDMENTS 名单（up 未动+按名不重放+执行安全缺陷三条件齐备）
status: enforced
note: 手排迁移执行器只跑 up，down SQL 从未被任何测试编译或执行——损坏的 down 是"回滚链断"定时炸弹，且事务外执行会连带 DROP 掉视图。修复顺手把 077 重建 capacity_gaps_view 也纳入守卫覆盖。同族警惕：所有"重建型迁移"的 down 必须可执行，新增视图迁移自动被守卫纳管
```

```yaml exp
id: EXP-B17
source: review/2026-11-14-workbench-v2-fix（F2：approved-only 只修 person_utilization_view，roleGaps 活链路×3 与 055 capacity_gaps_view 同谓词未收敛——待审批 50% 覆盖把 1 FTE 折成 0.5）
class: 部分重构×同族调用面未收敛
mechanism_slice: capacity-line × approved-override-family
disposition: GUARD
guard: enforced — report-scenario-slice A2 用例（G-F2）：夹具插待审批 50% 覆盖，断言 roleCapacityGaps 与 capacity_gaps_view 逐列等于无覆盖基线（1.8 FTE/16h/0 降时人），批准后折减到 1.3/12h 证明夹具命中
verification: done 2026-11-14 — 变异红证：去掉 roleGaps 谓词 → Expected 1.8 Received 1.3 必红
status: enforced
note: EXP-B11 第 3 活跃实例（前两例：ReportDataService 日期、phaseInheritance）。可用率 join 家族消费方普查：4 处（fetchApprovedAvailabilityOverrides 正身、076 已修、roleGaps+055 本批修）。新口径修复必须附同族消费方清单，否则守卫只护住第一个门
```
