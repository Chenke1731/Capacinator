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
guard: proposed — 导入/回填管线落表必须断言"切片读侧可见"：写完跑 effectiveAssignments/场景切片读，导入行不可见即红；禁止只断言 insert 行数
verification: pending — 变异自证：把导入落表改回旧表 project_assignments（运行时 0 行），断言必须变红；当前实现（05d 导入写场景切片）上必须变绿
status: candidate
checklist_item: 写路径与读侧是否同一数据形状（人工项；守卫上线后删除）
note: V2 导入写旧表 project_assignments，运行时 0 行，导入分配对切片读侧完全不可见（IP-02b 台账遗留列）；IP-05d 已修导入落表，防复发守卫待提炼。2026-11-11 场一评审同族第 2 次命中：AssignmentRecalculationService 全服务读写旧表且零生产调用（探针：'project' enum 已删 INSERT 被 CHECK 拒、recalc 恒 0 行；CLAUDE.md:158 仍宣称其负责级联）——同族 ≥2，守卫待办 G2：静态断言生产代码禁写 project_assignments（白名单=迁移/import/backup）
```

```yaml exp
id: EXP-B02
source: incident/2026-10-15-daybefore-utc-pitfall（IP-02d 途中修）
class: 日期边界×UTC序列化
mechanism_slice: date-boundary × toISOString-utc-shift
disposition: GUARD
guard: proposed — 日界比较/前推后推必须走统一日期原语（本地零点构造，workCalendar 族）；禁止 toISOString 结果直接做日界比较（UTC 序列化使本地零点倒退一天）
verification: pending — 变异自证：对 dayBefore 注入 toISOString 直比实现，跨 UTC 边界用例必须变红
status: candidate
checklist_item: 日期差/边界计算是否经统一原语（人工项；守卫上线后删除）
note: IP-02d SE 窗口计算中 dayBefore 的 toISOString UTC 时区坑——本地零点倒退一天；修复时已收敛进统一窗口计算，但项目无静态/用例守卫拦同类写法。2026-11-11 场一评审同族第 2 次命中：ReportDataService.ts:931 月桶边界 UTC 偏移（2027-01-01→2026-12-31 实测）+:45 缺省今天——同文件 :28-30 已有 toISODateLocal 原语未推广；守卫待办 G3：静态断言 reports 服务无 toISOString().split('T')[0] 裸写
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
note: personUtilizationView 2 例存量红：夹具钉 2026-10 窗口已滚出，stash 干净 HEAD 同样红（I01 台账 I01a 行记录，与本批无关，待另立小修）
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
guard: proposed — 可用率/比例/工时读取一律区分 null（未设置→缺省）与 0（显式合法值）；禁止 `field || 100`/`field || 0` 直读——显式 0% 被当 100%、显式 0 工时被当缺省兜底
verification: reproduced 2026-11-11 — 两场评审探针红证：AssignmentRecalculationService.ts:317（0% 人员+50% 分配→无冲突，场一 BR-F03）+ phaseInheritance.ts:65 `|| 30` 吞 0 天模板（场二 F3，同族第 2 活跃实例，修共享原语即双修 ProjectsController 同链）+ ReportDataService.ts:620/626/636/668 `||8` 四处（BR-F07；同文件 :729 已 ?? 修复形成新旧并存）；升级载体=INV-2 静态 lint（数值读取禁 || 缺省），lint 上线后 enforced
status: candidate
checklist_item: 数值读取是否区分 null 与显式 0（人工项；守卫上线后删除）
note: `person.default_availability_percentage || 100`（AssignmentRecalculationService.ts:317）吞显式 0%；ReportDataService.ts:693 注释自认同类（"可用率 || 100 回退（显式 0% 被吞）"）。与 R07"合法 0 全保留"同族——本条是 backend-reviewer 试点第一场盲评对象
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
guard: proposed — 接入 logAuditEvent 的新表必须同时进入 AUDIT_ENABLED_TABLES（config 默认+各 .env）；静态断言控制器审计表名 ⊆ 白名单并集（INV-1，提交时刻）
verification: reproduced 2026-11-11 — 探针 isTableAudited("demand_intake")=false 对照 ("projects")=true；主代理抽查 .env 白名单 9 表证实；HTTP 断言（capture 后 audit_log 有行）修复前必红
status: candidate
checklist_item: 新表接入审计时白名单是否同步（人工项；INV-1 上线后删除）
note: 白名单外仅 debug 日志静默跳过（enhancedAuditMiddleware.ts:182-185）；设计稿 §4.4 承诺 INTAKE_* 审计与 §7"不改白名单"裁决组合=承诺必然落空；裁决 D16=A（加白名单+action 对齐，须与 F4 await 修复同批）
```

```yaml exp
id: EXP-B08
source: incident/2026-11-11-i01-floating-audit-crash（试点场二 F4，A 级探针 exit code 1）
class: 浮动审计Promise×进程退出
mechanism_slice: floating-promise × audit-rethrow
disposition: GUARD
guard: proposed — logAuditEvent 调用必须 await（存量全项目约定，对照 ProjectsController.ts:745/945/987）；静态规则禁未 await 调用（INV-4，提交前 lint）
verification: reproduced 2026-11-11 — 探针（dev 模式+drop audit_log）实证未 await 审计调用→Unhandled Rejection→exit(1)；补 await 后失败进 sendIntakeError 错误路径
status: candidate
checklist_item: 审计调用点是否全部 await（人工项；INV-4 上线后删除）
note: middleware 审计失败 re-throw + enhancedErrorHandler dev/test exit(1)、production 仅 log 静默丢失；createBatch 200 条=200 个浮动 Promise 放大面
```

```yaml exp
id: EXP-B09
source: incident/2026-11-11-report-scenario-stacking（试点场一 BR-F01，A 级探针）
class: 报表聚合×场景叠加
mechanism_slice: report-aggregate × scenario-stacking
disposition: GUARD
guard: proposed — 隔离库断言：建 baseline 单分配记录数字→创建未改动分支场景→dashboard gaps/capacity/demand(缺省头) 数字必须逐一相等（G1，playwright api/集成测试提交点）；变异自证：对切片实现注入"去场景过滤"变体必红
verification: reproduced 2026-11-11 — 真迁移探针：baseline 0.6 FTE/86h → 分支后 1.2/172；070 迁移注释自认"60% 变 120% 幻影超载"；getUtilizationReport 切片正确反衬口径分裂
status: candidate
checklist_item: 报表读侧是否全部走场景切片（人工项；G1 上线后删除）
note: 缺省路径 applyScenarioFilter 直接 return + capacity_gaps_view/person_utilization 系视图无场景维度；裁决 D15=B（弃聚合视图改 activeAssignmentsInScenario 原语内联）
```

```yaml exp
id: EXP-B10
source: incident/2026-11-11-doc-claim-dead-wiring（试点场一 BR-F02）
class: 文档宣称×死接线
mechanism_slice: architecture-doc × actual-call-graph
disposition: DECISION
decision: pending — D18 待裁决（先确认冲突检测使用频率：高频→C 读侧去物化；低频→B 接线切片轨）；处置前 CLAUDE.md:158 必须标注实际零调用
status: candidate
note: AssignmentRecalculationService 零生产调用（grep 仅 skip 测试）、读写已废弃旧表、引用已被迁移 024 删除的 'project' enum（INSERT 被 CHECK 拒、recalc 恒 0 行）；而 CLAUDE.md 仍宣称其负责阶段→分配级联，后续 agent 按文档接线会写废弃表
```

```yaml exp
id: EXP-B11
source: incident/2026-11-11-partial-refactor-primitive-not-adopted（试点场一 BR-F04/F07）
class: 部分重构×原语未推广
mechanism_slice: partial-refactor × primitive-not-adopted
disposition: GUARD
guard: proposed — 修复点名的行后必须收敛同文件/同族调用面，静态扫描承载（G3：reports 服务无 toISOString().split('T')[0] 裸写；G4/INV-2：数值读取禁 || 缺省）——只改增量行不改调用面=新旧口径并存
verification: reproduced 2026-11-11 — ReportDataService.ts 同文件并存：?? 8（:729 已修）vs ||8（:620/626/636/668 未收敛）；toISODateLocal（:28-30 注释明记 R05 教训）vs toISOString 裸写（:931/:45）
status: candidate
checklist_item: 修 bug 时是否顺带收敛同文件同族调用点（人工项；静态守卫上线后删除）
note: 两处"正确原语就在同文件"却未被新代码采用——修复批必须含调用面收敛，不是只改被点名行
```
