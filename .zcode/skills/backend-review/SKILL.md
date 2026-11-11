---
name: backend-review
description: Capacinator 后端评审调度协议。用户说「后端评审 / 服务评审 / 接口评审 / 迁移评审 / 事务评审 / 数据流评审 / api review」或对服务层/控制器/迁移/信封的改动要求交付前评审时使用：调度只读子代理 backend-reviewer，产出证据分级、[GUARD]/[DECISION]/[NIT] 分类的评审报告，并把发现转成守卫任务或台账裁决。
---

# /backend-review 调度协议

评审本体由只读子代理 `backend-reviewer` 执行（见 `.zcode/agents/backend-reviewer.md`）。主代理只负责**材料准备、盲评调度、结果落地**，不代替评审员下结论。

## 何时用

- **design 阶段**：新端点/新服务/新迁移的契约与方案评审（写码前）——接口形状、事务边界、迁移风险、测试分层计划。
- **delivery 阶段**：交付前对 diff + 测试证据评审。
- 用户说"看看这个接口/这个服务/这个迁移有没有问题"但未给根因时，默认走本协议（盲评）。
- UI 改动的后端配套（如 I01 的服务+迁移）在验收前应对后端半边单独走一场。

## 调用契约

```
/backend-review <target> [--stage design|delivery] [--diff <sha|worktree>] [--tests <paths>]
```

- `target`：模块路径（如 `src/server/services/intake/`）、控制器/迁移文件、或 `diff`（当前工作区变更）。
- `--stage`：默认 delivery；契约/方案阶段用 design。
- `--diff`：评审范围基准（默认 worktree = 工作区未提交变更）。
- `--tests`：主代理已识别的相关测试入口路径（§11.1 语言）；不提供时评审员自选。

## 取证（后端等价于 Evidence Bundle）

后端**不需要**浏览器证据包：计划 §11.1 的既有测试入口就是确定性取证。主代理在 delivery 阶段先核对（`--listTests`/`--list` 只核对入口，不算通过证据），再由评审员实际执行相关用例。

规则：

- 评审员可自跑隔离入口（Jest server-unit `:memory:`、Playwright `--project=api` 自起 webServer）；现有入口不覆盖的疑点允许 /tmp 一次性只读探针（`NODE_ENV=test`、`:memory:`、不碰仓库文件、用后清理）；**禁止**开发库/用户库写操作与他人 E2E 实例。
- mock 链/简化 DDL/空变更 200 不算验收证据——发现测试声称覆盖而 mock 冒充，本身是 P1 发现。
- 后台验证命令 `set -o pipefail`，禁止裸 `| tail` 截断失败详情（EXP-B06）。

## 调度步骤（主代理）

1. **收材料**：确认 target/stage/diff 范围；列出 §11.2 检查矩阵中对应"修改类型"行（如 SQL/日期/容量/事务、新/改迁移）与相关测试入口。材料不足不猜。
2. **盲评**：派发 `backend-reviewer` 子代理，只给：
   - target、stage、diff 范围、测试入口路径；
   - 明确要求读 `docs/backend-review/experiences.md` 与 CLAUDE.md 信封规范；
   - **不要**把你的根因猜测、修复方案、上轮结论写进 brief（防止确认偏误）。
3. **等待报告**：子代理只读代码（无 Edit/Write），测试仅限隔离入口；不得改工作区。
4. **落地结果**：
   - `[GUARD]` → 进守卫待办（附断言草案 + 变异自证要求）；
   - `[DECISION]` → 进 `docs/plans/2026-10-14-capacinator-improvement-plan.md` §5/§7 台账或请用户裁决；
   - `[NIT]` → 记录，不阻塞。
5. **经验回写（需用户批准）**：评审员只能输出 `EXP-NEW` 候选；由主代理写 `docs/backend-review/experiences.md` 并跑 `npm run verify:backend-review`。

## 输出（转发评审员报告，不二次加工结论）

必须包含：问题清单（含证据列）、候选不变量、需要裁决、命中经验/新经验候选、需要补充材料、本次未覆盖。

## 边界

- 不评审 UI/前端实现；跨层数据一致性（信封 vs 防御解析、口径跨端点矛盾）可以质疑并要求举证。
- 不做性能调优与压测裁决（perf 守卫另有入口）；规模化失效（N+1/无界读取等结构缺陷）不是调优——主链路 P1、次路径 P2。
- 不用通用最佳实践否定项目已裁决差异（mock-first 分层、渐进信封迁移、不预设迁移都坏）。
- 不重复机器可判项（migrations-immutable/schema-drift/verify:cache/check-collection）；机器漏判 → `[GUARD]`。
- 评审员不改代码；主代理也不得把"评审"变成"顺手改掉"。

## 领域清单（评审员必查，详见评审员提示词）

需求进入/转换、8 态生命周期、场景切片与合并、容量分段/峰值、工作月口径（21.75/含两端/周末剔除）、实际回填与并发（乐观锁 409）、导入管线选项与对账、迁移不可变、信封规范、错误路径、审计留痕、身份与回退（IP-08 范畴低频）、测试诚实度（mock vs 真库）、查询形状×数据规模（N+1/无界读取）。

## 试点验收（首次使用）

第一场（盲评校准）：只给 `src/server/services/AssignmentRecalculationService.ts` + `src/server/services/reports/ReportDataService.ts` + stage=delivery，不给任何提示。通过标准：

1. 独立找到 `default_availability_percentage || 100` 族并给出"显式 0% 被当 100%"的反例数字（B 级起步）；
2. 关联可用率口径与 §10/§11 的裁决语言，不发明新规范；
3. 产出 `[GUARD]` 断言草案（显式 0 不得回退缺省）+ `[DECISION]`（0% 可用率人员的产品语义）；
4. 不报"建议重构"类伪问题；
5. 报告可直接进 §7 台账。

第二场（实战）：I01 后端半边 delivery 评审（IntakeService/IntakeConversionService、迁移 074、DemandIntakeController 信封合同）——直接服务 I01 验收。

续留指标：每 2 次评审 ≥1 条被采纳不变量；`[GUARD]` 占比 ≥30%；误报率 <30%。
