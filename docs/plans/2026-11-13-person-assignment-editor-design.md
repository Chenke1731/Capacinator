# 人员分配编辑器（Person Workload Editor）设计方案

- 日期：2026-11-13
- 状态：设计定稿（第二轮复评 PASS WITH MINOR CHANGES；已进入 backend/UI 设计评审，Phase 0 加固待批）
- 关联：I02o（reduce 模式修复）、I02p（PersonDetails 标题样式泄漏）、用户对“降低工作负载”的重定义

## 1. 目标

把当前 `PersonDetails → 推荐操作 → 降低工作负载` 的“只减不增”弹窗，改造成**人员分配编辑器**：

1. 在当前人员上下文中，从任务树挑选项目/任务并分配给他；
2. 查看、调整、删除已有分配；
3. 实时显示当前总分配、可用产能、超载/剩余提示；
4. **容量只提醒、不阻止**：允许在超载状态下继续添加/删除/修改；
5. 不做“轻任务/重任务”分类，不做自动推荐删除，不替用户做取舍。

非目标（本期不做）：

- 自动排产/优化算法；
- 批量跨人员重排；
- 项目级资源重排的自动求解；
- 修改任务本身的业务范围（只做分配关系与分配参数）；
- 新的审批流。

## 2. 产品语义

### 2.1 容量是 advisory

- 总分配 = 当前场景下该人员所有 `status='active'` 分配的比例之和；
- 利用率 = 总分配 / 当前可用率 × 100%；
- 超过 100% 只显示醒目提示（红/警告色），**不禁用添加、删除、保存**；
- 低于容量显示剩余容量，不强制填满；
- 与现有系统“over-allocation is permitted by design”一致。

### 2.2 任务树选择

- 任务树来源：当前项目集合（`projects.board-feed` / 项目树），按 `parent_id` 组织层级；
- 树节点至少展示：项目名称、类型/子类型、生命周期状态、当前人员是否已分配、当前分配比例；
- 可选择叶子项目/任务；父节点（聚合 SR）是否可分配需评审确认；
- 选中节点后填写/确认：角色、阶段（可选）、分配比例、日期模式/起止；
- 已分配的节点再次选择时，进入“编辑该分配”，不重复创建（唯一约束）。

### 2.3 编辑已有分配

每条当前分配支持：

- 调整 `allocation_percentage`；
- `fixed` 模式：调整 `start_date/end_date`；
- `phase/project` 模式：派生日期只读，展示来源（阶段/项目），提供跳转或明确提示“修改会影响同阶段/项目所有人”；
- 暂停/恢复（如现有 API 支持）；
- 移除；
- 所有容量相关操作不因超载被禁用。

### 2.4 三种旧动作的处置

- `降低工作负载` → 改为 `调整分配`，进入本编辑器；
- `安排工作交接` / `延长工作时间`：
  - 一期不单独保留为顶栏按钮；
  - 交接作为编辑器内的行级动作（如果本期实现）；
  - 延长/调整时间作为编辑器内的日期编辑/跳转提示；
  - 不再打开错误弹窗或可用率日历。

## 3. 页面/交互

建议**独立页面**而不是窄弹窗（任务树 + 当前分配表需要宽度和滚动）：

`/people/:id/workload`（名称待定，也可用抽屉）

布局：

```
[返回] 沈设计 · 调整分配
[当前 129% | 可用 100% | 超载 29 个百分点]   ← 持续可见，不阻断

左：任务树（搜索/展开）
  ▾ 需求交付
    ▾ 分析-报表
       · 数据脱敏         已分配 50%
       · 移动端适配       已分配 40%
    · 开放API网关        未分配
右：当前分配
  项目 / 角色 / 阶段 / 比例 / 日期 / 状态 / 操作
  [比例输入] [日期(fixed)] [暂停] [移除]
  [+ 添加所选任务]  ← 超载时仍可点，仅提示
```

状态：

- loading / error / person not found；
- 任务树 loading/error/空树；
- 当前分配空态；
- 超载警告（非错误、非阻断）；
- 添加/编辑 pending；
- 版本冲突 409：保留草稿，提示刷新当前值；
- 无权限（如适用）；
- 长列表滚动/虚拟化（项目较多时）。

## 4. 数据与 API

### 4.1 现有可复用接口

- `GET /api/people/:id`：人员 + assignments（当前包含所有 active 场景，需按当前场景过滤）；
- `GET /api/projects/board-feed`：项目树字段（id/name/parent_id/type/lifecycle）；
- `GET /api/project-allocations/:projectId`：项目角色/阶段需求，用于选中任务后的角色选择；
- `POST /api/assignments`：创建分配；
- `PUT /api/assignments/:id`：修改分配（比例/日期/状态，需 expected_version）；
- `DELETE /api/assignments/:id`：删除。

### 4.2 需要明确/可能修改的点

1. **场景过滤**
   - 编辑器只展示当前场景的分配；
   - `PeopleController.getById` 的 assignments 目前来自 `assignments_view` 所有 active 场景；
   - 方案 A：前端按 `scenario_id === currentScenario.id` 过滤（MVP，不改服务端）；
   - 方案 B：`GET /people/:id` 接受场景头/查询参数并在 SQL 过滤（更正确，但影响 PersonDetails 现有行为）；
   - 建议 B 或增加专用 `GET /people/:id/assignments?scenario_id=`，评审决定。

2. **任务树数据**
   - board-feed 有 2000 行上限且全量；MVP 可接受，但需说明；
   - 角色/阶段需求按选中项目懒加载；
   - 父/子节点是否可分配：需要业务规则。

3. **更新接口**
   - 比例/日期更新复用 `AssignmentsController.update`，带 `expected_version`；
   - phase/project 模式日期不可直接改；如果用户改日期，必须改模式或跳转时间线；
   - 校验失败/409 显示原因，不静默。

4. **添加接口**
   - 创建前检查同 (scenario, project, person, role, phase) 是否已有分配；
   - 已有 → 编辑已有，不重复创建；
   - 超载不阻止创建（现有 create 允许超载，只给 warning）。

5. **删除**
   - 现有 delete 带版本；
   - 删除不因超载阻止；
   - 删除后重新计算总分配。

### 4.3 计算单一真相

不要把利用率再写成第三套。编辑器应复用：

- 服务端 `person_utilization_view` / `personUtilizationRows`（当前可用率、总分配、状态）；
- 客户端共享 selector（当前场景、active/paused/undated 规则一致）；
- 与 `PersonDetails` 顶部卡片、People 页、reduce 弹窗保持同一口径。

建议新增 `client/src/lib/personWorkload.ts`：
- `activeAssignmentsForScenario(assignments, scenarioId, today)`
- `workloadTotals(assignments, availability)`
- 单测覆盖 paused、undated、场景过滤、availability 0/非 100。

## 5. 组件拆分

- `PersonWorkloadEditor`（页面/容器）：数据加载、布局、警告。
- `TaskTreePicker`：项目树、搜索、已分配标记、选择回调。
- `CurrentAssignmentsTable`：当前分配行、比例/日期编辑、暂停/移除。
- `AssignmentAdjustForm`：选中任务后的角色/阶段/比例/日期。
- 复用 `Dialog`/`Button`/`Select` 等原语；新 CSS 必须页面根类作用域，遵守 I02p 守卫。

## 6. 后端/数据变更评估

- 首选不新增表、不加迁移；
- 可能需要：
  - 场景感知的 person assignments 查询端点；
  - 若字段更新不能覆盖“暂定/交接”，后续新增字段/端点；
  - 若批量保存需要原子性，再加批量调整端点（本期可先逐条即时保存）。
- 所有写操作审计；
- 版本冲突处理沿用现有 409 格式。

## 7. 测试与验收

### 自动测试

- 数据 selector：paused 不计入、undated 计入、场景过滤、availability 50/0、总分配/利用率。
- 页面：
  - 超载 129% 时添加任务成功，仅显示警告，不 disabled；
  - 删除/调整后总量实时更新；
  - 同一任务重复添加 → 进入编辑，不产生重复行；
  - fixed 日期可改；phase/project 日期只读/跳转提示；
  - 409 保留草稿；
  - 空态/错误/加载；
  - 任务树搜索/展开/已分配标记。
- 集成/API：
  - create/update/delete 在超载下仍成功；
  - 唯一约束/非法日期/权限/场景隔离；
  - 审计记录。
- 视觉/states：双主题、1366/1600、长树/长列表、超载警告、空态。
- 变异自证：删除“超载不禁用”条件 → 用例红；把 undated 排除 → 用例红；场景过滤移除 → 用例红。

### 人工验收

- 129% 沈设计：任务树选择“数据脱敏”调整 50%→30%，总量 109%，仍提示超载，保存成功；
- 再移除 14%，总量 95%，提示回到产能内；
- 添加一个未分配任务，超载状态下允许添加并提示；
- 删除一条分配，项目侧确认分配消失、人员侧总量更新；
- 409 版本冲突保留草稿；
- phase/project 模式日期不可直接改，提示影响范围。

## 8. 风险与待评审问题

1. 独立页面 vs 抽屉 vs 宽弹窗？
2. 任务树范围：所有项目 / 仅需求交付 / 是否允许父聚合行分配？
3. `PeopleController.getById` 场景过滤是否直接改（影响 PersonDetails 现有所有场景展示）？
4. `find_coverage`/`extend_timeline` 一期是否保留？交接是否本期实现？
5. 逐条即时保存 vs 草稿批量保存？即时保存更简单，但多次操作会多次刷新。
6. 超载警告的视觉强度与是否需要在保存时确认（用户已明确不阻断）。
7. 任务树 2000 行上限/性能。
8. 权限：当前单用户，未来多角色是否需要编辑权限校验？
9. phase/project 派生日期修改的边界：只读、跳转、还是允许改模式？
10. 与 `Assignments` 页现有编辑能力重叠：是否复用其表格/表单而非新造？

## 9. 分期建议

- **MVP（P1）**：人员上下文 + 当前分配列表 + 任务树添加/删除 + 实时容量警告（不阻断）+ fixed 日期/比例调整；场景过滤。
- **P2**：行内交接、phase/project 跳转提示、批量草稿保存、项目影响预览。
- **P3**：推荐/自动排产（不在本方案）。

## 10. 验收门槛

- 容量永不阻断添加/删除/保存（除数据完整性问题）；
- 超标提示持续可见且实时；
- 加/删/改后人员与项目两侧数据一致；
- 与 People/PersonDetails/视图口径一致；
- 不新增跨页 CSS 泄漏（I02p 守卫绿）；
- 审计、409、场景隔离完整。

## 11. 双评审结论与方案修订（2026-11-13）

> 第二轮复评：Codex/Claude 均 **PASS WITH MINOR CHANGES**；仅剩的文档修订已并入本节
> （可用率取数、重复键 409 code、旧记录局部更新、列表日期读契约）。当前状态：定稿，
> 进入 backend/frontend UI 设计评审。

Codex（gpt-6.1-sol）与 Claude 均给出 **PASS WITH CHANGES**。方向与用户诉求匹配，但实现前必须解决以下阻塞项。

### 11.1 数据源定为场景感知的 assignments 列表

- 编辑器**不使用** `PeopleController.getById` 的 assignments（它跨所有 active 场景、预先排除已结束行）；
- 改用已有 `GET /api/assignments?person_id=X`：服务端按 `x-scenario-id` 过滤，返回 project/role/phase name、status、version、computed dates；
- 显式传大 limit 并做完整分页/“加载更多”；默认 limit 50 会截断；
- 列表读取使用**持久化 computed 日期**，缺值回退原始日期；不使用“今天/+90 天”的新建兜底；单行配置异常逐行标记，不能拖垮整页；
- 人员资料（姓名/角色）由 people 接口提供；**可用率/利用率取自 utilization 端点（personUtilizationRows 同源）**，people 接口只返回 default+overrides 原料，禁止客户端再算 COALESCE；
- **不新增专用场景端点**；写入时服务端必须校验记录属于当前场景，客户端不得改写 `scenario_id` 等身份字段；
- baseline 下 direct 轨与 scenario 轨并存是既有事实，编辑器需明确两者都显示（不合并重复）。

### 11.2 容量口径唯一基准

- 当前负荷 = 选定场景内、与今天相交、`status='active'` 的分配之和；
- 可用率取 `person_utilization_view` 的 `current_availability_percentage`（含 approved override）；
- 无日期分配按 ongoing 计入；paused 不进入当前负荷；未来/已结束分配留在列表但不计入“当前”；
- 绝对分配百分点、相对利用率、剩余百分点三件事分开显示；
- 可用率 0 时显示“无可用容量”，有分配仍提示容量不足，不能显示为正常 0%；
- 唯一基准 = `personUtilizationRows` / `activeAssignmentsInScenario` 语义；
- **本方案范围内**把 `PersonDetails.allocationInsights` 与 `useAssignmentRecommendations` 迁移到共享的 `personWorkload` selector；不再保留三套口径。

### 11.3 多次分配不是单行

- 同一项目可有多条不同角色/阶段的分配；
- 任务树节点标记“已分配 N 条”，选择后列出该项目此人的全部行，逐条编辑；
- 只有完整业务键 `(scenario, project, person, role, phase)` 相同时才进入编辑；
- SQLite 唯一索引对 `phase_id IS NULL` 不去重，服务端必须有原子重复预检并将约束错误映射为业务 409；
- 该 409 必须带独立 error code（如 `Duplicate assignment`），编辑器按 code 分支，不能落入版本冲突的 `current` 草稿处理；
- 若决定阻止 NULL phase 重复，需要新增部分唯一索引迁移并先做存量重复审计；本期至少先做服务端预检 + 409，不静默 500。

### 11.4 SE/MDE 单人制不能静默替换他人

- `AssignmentsController.create` 对同项目同场景 SE/MDE 会先删旧分配再插入，删除范围不限人员；
- MVP 编辑器在添加 SE/MDE 时必须预检：若该槽位已有他人分配，明确展示“将由 X 替换 Y”，用户确认后才执行；
- 服务端增加显式替换语义/版本保护与审计；普通添加不得静默删除他人记录；
- 交接完整事务（缩短原人 + 创建新人）仍留 P2，但“替换确认”必须在 MVP，否则越权改他人排产。

### 11.5 任务树契约

- 默认范围：需求交付任务；提供分类入口切换到其他可分配项目；
- SR 聚合父行只用于导航/汇总，不作为新增分配目标；已有父行分配仍在右侧可见可编辑；
- 搜索命中必须保留祖先路径并自动展开；
- **不能接受 board-feed 2000 行静默截断**：新增服务端任务树查询（搜索 + 分页 + 祖先补齐，返回真实总数/截断标识），或扩展现有 projects 查询；实现前在方案中选定，MVP 必须能搜索到第 2001 个任务；
- 已分配标记来自已加载的场景分配 join 树节点，不用 board-feed 的 staffing summary（跨场景混合）。

### 11.6 日期/暂停/硬校验

- 容量合计只 warning，不自动压低输入，不复用 `SmartAssignmentModal` 的 remainingCapacity 钳制 effect；
- 硬校验保留：有限数值、比例范围 `0 < allocation ≤ 200`、真实日历日期、起止顺序、必填角色/项目、重复键、版本、场景归属；
- `fixed` 可编辑起止；`phase/project` 的 computed 日期只读，来源与“修改会影响同阶段/项目所有人”提示必须在 MVP；
- 旧的无日期/缺阶段记录：允许**不改变日期字段/模式**的比例/状态更新（保留原日期）；一旦改日期或模式，执行完整日期校验；必须加测试，不能假设 update 一定成功；
- 409 阻止旧版本写入并保留行内草稿；同一行写入串行化。

### 11.7 保存与入口

- MVP 逐条即时保存（一条记录的一次编辑一个请求），不做全页批量原子保存；
- 禁止复用 `bulkAssign`（超载即 failed，且只用于创建）；
- 入口不再只依附超载档：`调整分配` 对所有利用率档位可达；`find_coverage`/`extend_timeline` 不再作为独立错误入口；
- 页面形态：独立页 `/people/:id/workload`（左侧任务树、右侧分配表、顶部容量条）；
- 复用 Assignments 页的内联编辑/乐观锁原语，不新造第三套编辑 UI。

### 11.8 评审后新增验收

- 129% 下新增 40% 成功，回读 169%，输入未被改写；仍超载保存成功；
- paused 不计当前负荷、无日期计入、可用率 50/0 的正确显示；
- 两场景同一人同一任务只显示/编辑当前场景，切场景旧草稿不可提交；
- 同项目多条分配（不同角色/阶段）可分辨；NULL phase 重复被 409 阻止；
- SE/MDE 替换必须显式确认、旧人记录有审计，不静默删除；
- 任务搜索能命中第 2001 个任务并保留祖先；
- 容量钳制、paused 过滤、场景过滤、派生日期只读、版本条件均需变异红证。

## 12. 第二轮复评 + backend/UI 设计评审结论（2026-11-13）

### 12.1 复评

Codex/Claude 第二轮均 **PASS WITH MINOR CHANGES**，共识：
- 第一轮 8 个阻塞项全部已解决（纸面决策闭环）；
- 仅需补：可用率取 utilization 端点、重复键 409 独立 code、旧异常记录局部更新规则、列表日期读契约；
- 已并入 §11，不再回炉。

### 12.2 backend/UI 设计评审：方向通过，但不能直接开写编辑器

backend-reviewer：P0 3 / P1 8；frontend-ui-reviewer：P1 12 / P2 11。两者一致认为编辑器本身不是最大风险，**现有 assignment 写读路径的安全性不足**，编辑器会把这些风险放大。

#### Phase 0（编辑器之前必须完成的后端加固）

1. **写路径场景归属 + 字段白名单**
   - update/delete 目前只按 id 查全表，不校验 `x-scenario-id`；body 可注入 `id`/`scenario_id`/`person_id`/`project_id`/`role_id` 搬移/改写记录；
   - 修复：按 `(id, scenario_id)` 查找，header 不匹配 404/409；白名单仅允许 `allocation_percentage/start_date/end_date/assignment_date_mode/phase_id/notes/status`；
   - direct 轨（`project_assignments`）只允许 baseline；body 注入身份字段忽略或 400。
2. **fixed 日期清空**
   - 显式 `start_date/end_date:null/''` 目前可绕过校验写入开放区间；
   - 修复：按字段是否出现判断；`''` 归一 null；fixed touched 时两端必填、真实日历日、顺序校验；未 touched 不写 computed。
3. **SE/MDE 显式替换**
   - create 会静默删除同项目/场景/角色的全部 active 行（不限人员、无版本、无删除审计）；
   - 修复：无 `replace_assignment_id + replace_expected_version` → 409 `ASSIGNMENT_SLOT_OCCUPIED` 且旧行保留；确认替换只删指定行并审计 DELETE + CREATE。
4. **重复键 409**
   - 无创建前预检；NULL phase 唯一索引不去重；唯一冲突返回 500；
   - 修复：事务内原子预检；`code=ASSIGNMENT_DUPLICATE` + existing_id；update 改 phase 同样预检；
   - 部分唯一索引/存量去重后置（先只读审计）。
5. **审计白名单**
   - `.env.development/.env.test/.env.staging/.env.qa` 含不存在的 `assignments`，缺 `project_assignments`，direct 轨 update/delete 审计被静默跳过；
   - 修复：四个 env 加 `project_assignments`；INV-1 扩展到控制器实际审计表；补 direct 轨审计用例。
6. **字段/数值/日期硬校验**
   - create/update 直接 spread body：`billable` 等非列字段导致 500；`allocation_percentage:'30'` 通过范围校验并造成容量求和字符串拼接（5030%）；
   - 修复：字段白名单、`typeof number && Number.isFinite`、真实日历日期回环、空串 mode/phase 400、phase 必须属于 project timeline。
7. **列表读契约**
   - getAll 对整页重算日期：坏 phase 行导致整页 500；project 缺 aspiration 回退 today/+90；phase 行 N+1；
   - 修复：读 `assignments_view.computed_*`，缺值回退 raw，逐行异常 flag，不跑新建兜底；加稳定排序 tiebreaker/limit 上限。
8. **create 事务**
   - compute 在事务外，与 update 的 I02m 修复不一致；移入同一 trx。

#### Phase 0（编辑器之前必须定的 UI 契约）

1. **可见行 vs 当前负荷行**：顶部总量必须等于标“计入当前”的行之和；未来/结束/paused 行保留但标注“不计入”，显示排除数量与小计。
2. **行级单保存**：同一行比例+日期必须一次 PUT（所有 dirty 字段 + 一个 expected_version），禁止逐字段 onBlur 复用旧 version；409 保留草稿、行内错误，不用 alert。
3. **来源 badge**：baseline direct 与 scenario 行必须可区分；direct 行删除/暂停确认说明“基线全局，影响所有场景”。
4. **场景草稿归属**：草稿绑定 scenarioId；切场景禁保存 + 横幅（保留/丢弃/回原场景）；在途写不得落到新场景。
5. **统一入口**：`调整分配` 对所有利用率档位可达；`find_coverage`/`extend_timeline` 旧入口删除或后续重做；People/PersonDetails 不再各开旧弹窗。
6. **任务树**：默认需求交付；SR 聚合父行仅导航；叶子/独立任务可分配；搜索保留祖先、加载更多、显示真实 total/has_more；2001 条可命中。
7. **可分配谓词**：非 SR 父行、非终态、当前分类；终态节点禁用并给原因；paused 同键槽位语义先定。
8. **添加面板**：角色/阶段来源、fixed/phase/project 模式、空 demand、重复 409 转编辑已有、超载允许添加并实时投影。
9. **容量状态**：utilization 失败/停用/可用率 0 三者分开；失败不显示 0/100；0 可用率显示“无可用容量”，相对利用率 “—”。
10. **响应式/可访问性**：1366 紧凑布局（树 280 + 合并日期 + kebab 操作）、sticky 容量条；tree `aria-expanded/level`、roving tabindex、删除后焦点恢复；新 CSS 根类 `.person-workload-page` 登记 `PAGE_ROOTS`。

### 12.3 关键裁决（建议默认）

- **数据源**：`GET /api/assignments?person_id` + `x-scenario-id`，完整分页；people 只提供档案；可用率/利用率取 utilization 端点。
- **任务树**：扩展现有 `GET /projects`（`slim=1`、`include_ancestors=1`、`parent_id=`、真实 total/has_more），不新增专用端点；board-feed 不用于树。
- **direct 轨**：MVP 展示 + 来源 badge；编辑/删除需“基线全局”确认；服务端补 direct 轨场景/身份校验与审计。若生产 direct 行=0，可先只读展示并立项迁移。
- **容量基准**：`personUtilizationRows` 语义唯一；baseline 两轨都算、approved-only 可用率、warning 用相对容量；`as_of` 返回参考日。
- **NULL phase**：Phase 0 只做事务预检 + 409；部分唯一索引/存量去重后置。
- **“今天”**：编辑器使用 utilization 端点返回的 `as_of`；服务端内部统一参考日；不在客户端自取 `toISOString`。
- **409 code**：`ASSIGNMENT_VERSION_CONFLICT` / `ASSIGNMENT_DUPLICATE` / `ASSIGNMENT_SLOT_OCCUPIED`，均带可定位数据。
- **页面形态**：独立页 `/people/:id/workload`；1366 为最低验收宽度，移动端不进 MVP。

### 12.4 实现顺序

1. **Phase 0 后端写路径安全批**（场景/白名单、日期清空、SE/MDE 替换、重复 409、审计白名单、数值/日期校验、create 事务）。
2. **Phase 0 后端读路径批**（assignments 列表持久化 computed/逐行异常、场景默认、容量基准）。
3. **Phase 0 UI 契约批**（可见/计入行、行级单保存、来源 badge、场景草稿、入口统一、任务树分页/祖先、可访问性）。
4. **Phase 1 编辑器 MVP**（独立页、任务树、当前分配、添加/调整/删除、容量 warning、逐条保存）。
5. **Phase 2**（交接完整事务、批量草稿保存、项目影响预览、角色/阶段变更）。

### 12.5 结论

- 方案方向与产品诉求成立；
- 第二轮复评已收敛；
- **backend/UI 评审要求先做 Phase 0 加固，编辑器 UI 不是第一优先级**；
- Phase 0 完成并通过真实迁移库/HTTP 测试后，再进入编辑器实现。
