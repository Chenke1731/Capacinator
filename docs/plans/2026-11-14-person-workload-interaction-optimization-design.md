# 人员工作负载页交互优化方案（S1–S8）

- 日期：2026-11-14
- 状态：草案（待 Codex / Claude 三方评审）
- 关联：
  - `docs/plans/2026-11-13-person-assignment-workbench-v2-design.md`
  - `docs/plans/2026-10-14-capacinator-improvement-plan.md`（I03e/I03f 已关闭）
- 适用范围：`client/src/pages/PersonWorkload.tsx`、`client/src/components/workload/*`、
  `src/server/api/controllers/AssignmentsController.ts`

---

## 1. 背景与问题

工作台 v2 落地后，页面已经具备：弹窗多选新建（ghost → 确认）、批量改比例、行内编辑、
暂停/删除/交接、泳道容量热区、全员配置只读面板。

对现有交互做效率复盘（任务 × 现状步骤）：

| 任务 | 现状成本 | 瓶颈 |
|---|---|---|
| 新建分配（1 条与 N 条） | ~5 步，多选边际成本≈0 | 已高效，保留 |
| 改多行比例 | 3 步 + N 次输入 | 已高效，保留 |
| 改单行比例 | 3 步 | 可接受 |
| **改已有分配的时间** | 3–4 步 + 离开泳道进入表格 | 泳道 ghost 能拖，**已提交 fixed bar 不能拖**；时间调整是排产最高频动作 |
| **改角色/阶段** | 5+ 步（删除/REPLACE + 重建） | 身份列白名单锁死，无"转换"入口 |
| **批量改日期/批量暂停** | N × 3–4 步 | 批量模式只支持比例 |
| **跨人员调整** | 2 次跳转 + 重新找行 | staffing 面板跳转无上下文接力 |
| **保存后改错** | 再改一遍 | 除"撤销创建"外无撤销 |
| 观察长期负载 | 多一步 | 默认 3 个月窗口，范围外分配不可见 |

本方案针对上述 **四件事：改时间、改身份、跨人、后悔药** 以及两个小项（统一确认、窗口自适应）。

### 1.1 不可动摇的既有不变量（评审不要重新裁决）

1. 容量只提醒不阻断；相对利用率口径与 approved-only 覆盖不变。
2. 单行/批量保存使用**编辑时快照版本**（乐观锁），后台刷新不得借新版本写旧值。
3. 草稿绑定加入时场景；场景失配只读+禁提交；提交中锁场景切换；离页有守卫。
4. 重复键（scenario+project+person+role+phase，任意状态）与 SE/MDE 单人槽规则与服务端一致。
5. phase/project 派生日期只读；本方案不放开拖拽改派生日期。
6. ghost 流程（弹窗多选 → 泳道 ghost → 逐条调参 → 确认分配）语义不变。
7. 1366×768 为最低验收宽度；双主题；现有 a11y 基线不退化。

---

## 2. 目标与非目标

### 2.1 目标

1. 时间调整在泳道内完成（拖拽 + 确认），不强制跳表格。
2. 已提交 bar 与 ghost 的"点开即编辑"体验一致（S2）。
3. 批量能力覆盖"整批平移时间"与"批量暂停/恢复"（S3）。
4. 换角色/阶段成为一步服务端事务，而不是删+建（S4）。
5. 跨人员跳转带上下文并落地定位（S5）。
6. 单行/批量保存可撤销（S6）。
7. 全部破坏性确认统一为 Radix ConfirmDialog（S7）。
8. 泳道默认窗口自适应最远分配（S8）。

### 2.2 非目标

- 不做任意拖拽（phase/project 派生窗口仍只读）。
- 不做多人同时编辑的实时协作。
- 不做甘特式跨项目全局视图。
- 不改变写入语义（仍逐行 PUT/事务端点，无服务端批量）。

---

## 3. 核心决策

| 决策点 | 结论 |
|---|---|
| 拖拽结束后的落库方式 | **松手不直存**：打开该行就地确认面板（预填新日期），确认后单 PUT；取消/Esc 回原位 |
| S1 与 S2 的关系 | 共用同一个面板组件（见 §5），拖拽结束与点击 bar 都进入它 |
| 可拖范围 | 仅 `fixed` + `active`；paused/phase/project 只读 |
| 批量扩展范围 | 全行（不做行选择器）：整体平移/批量暂停/批量恢复；比例仍逐行输入 |
| 转换事务 | 新端点 `POST /assignments/:id/convert`，单事务删旧+建新 |
| 撤销保存 | 客户端 5 秒 toast 撤销（逆 PUT / 逆批量 PUT），依赖既有快照 |
| 确认对话框 | 统一 `ConfirmDialog`（Radix，已有组件） |
| 默认窗口 | `rangeEnd = max(asOf+3个月, 最远 committed/ghost 结束日)` |

---

## 4. S1：泳道拖拽/缩放已提交 fixed 分配

### 4.1 交互

- 已提交 fixed bar：hover/focus 显示三处手柄——左缘（改开始）、右缘（改结束）、条体（整体移动）。
- 拖动中：bar 跟随指针（按天吸附），tooltip 显示 `新开始 → 新结束`；泳道容量热区**实时投影**（临时把该行替换为新窗口计算，不写库）。
- 松手：若日期变化 → 打开**就地确认面板**（§5，`committed` 模式，日期预填新值，影响预览立即显示）；若未变化 → 回原位、不弹面板。
- 确认面板中「保存」→ 单 PUT：`{start_date, end_date, expected_version}`（**版本取拖动开始时的快照**，与行编辑同契约）；成功 toast + 5 秒撤销（S6）。
- 取消 / Esc / 点击面板外 → 回原位。
- 拖动中场景切换：本次拖动取消（与提交中锁场景一致，拖动不属于"在途请求"）。

### 4.2 约束与防御

- 拖动阈值 3px，避免把点击误判为拖拽；<3px 视为点击（进入 S2 面板）。**拖动成立（越过阈值）后吞掉随后产生的 click**，避免"松手开确认面板 → click 又按 S2 重开并覆盖预填日期"。
- `paused`、`phase`、`project`、`UNKNOWN/submitting` 行不可拖；`aria-disabled` 提示原因。
- **已提交行不能复用 ghost 的 `asOf` 左界钳制**（评审 B1/B2）：ghost 的 `start ≥ asOf` 是为"新分配不得进历史"立的；已提交行可能已开始或已结束——
  - 整体移动：左边界下限 = `min(原 start, asOf)`（不允许把历史进一步扩到更早，也不截断历史）；
  - 左端缩放：原 start ≥ asOf 时下限 asOf；原 start < asOf（已开始）时下限 = 原 start（不截断历史）；
  - 右端缩放：只改结束日，**不得顺带修改开始日**，下限 = 当前开始日；
  - 已结束行（`end < asOf`）不可拖（与"已结束淡化"语义一致，需改期走面板/表格）；
  - committed 面板的日期输入**不继承** ghost 的 `min={asOf}`。
- 拖动中若行版本被后台刷新更新：保存时用**拖动开始版本**→ 409；面板**保留用户拖出的值**，只提示"已被他人修改"，用户可点「使用最新值刷新」显式换版本与字段后重新保存——**绝不静默换令牌继续提交旧输入**。
- 拖动最小粒度 1 天；拖动期间冻结时间轴比例与 minimap 交互（窗口切换会使拖拽基准失效）。
- pointercancel / 窗口失焦 / 组件卸载 / Esc → 复位（bar 回原位动画 + 可选 toast），不弹面板、不写库。

### 4.3 键盘

- 已提交 bar 聚焦后按 Enter/Space 打开面板（S2）；**不做**方向键直接改期（避免无确认写库）。
- 面板内的日期输入可用键盘；ghost 的方向键拖动语义保持不变。

### 4.4 复用与改动面

- `WorkloadGantt:beginGhostDrag/applyDrag` 泛化为 `beginBarDrag(bar, mode)`：
  - `draft` 模式：现有行为（直接更新草稿字段）。
  - `committed` 模式：更新"临时预览日期"状态，不写草稿；松手回调 `onCommittedDatesChange(rowId, {start,end}, session)` → 页面打开面板（**session 携带行 ID、原字段、版本、场景**，见 §4.5）。
- 容量热区使用现有 `workloadTimeline`：拖动中把该行以临时日期传入（等价 EDIT 投影）。**投影行必须保留原 `status`**——`workloadTimeline` 对 draft 行当前置 `status=null`，直接复用会把 paused 行算成有负载；committed 预览改为携带原状态。
- 共享布局、**不共享控制逻辑**：draft 模式即时改草稿，committed 模式暂存后保存，两套状态机不混用。

### 4.5 编辑会话与保存生命周期（评审 B1 收敛）

统一"编辑会话"覆盖表格行编辑、committed 面板、拖拽确认三者：

```text
EditSession {
  personId, scenarioId, rowId,
  baseline: { allocation, startDate, endDate, status, isPrimary },  // 打开/开始拖动时快照
  expectedVersion,               // 快照版本
  source: 'drag' | 'bar-click' | 'table',
  saving: boolean
}
```

- **保存生命周期**：`Editing → Saving → 成功(关闭+toast撤销) | 失败(面板保留+错误)`。
  - `Saving` 期间：禁止关闭面板、禁止切换编辑对象、禁止重复提交、禁止进入批量/草稿提交，并接入场景切换锁（与草稿提交同机制）。
  - **任何关闭路径都必须经过"未保存变更确认"**（点面板外/点另一 bar/点行编辑/进入批量/切场景）：有未保存变更时弹确认；用户取消则保持会话；不允许静默回滚（EXP-012/021 同族纪律）。
- **互斥矩阵**：同一时刻仅一个编辑面。`BarConfirm` 与 `RowEditing`（同一行两个编辑器）、`HandoverForm`、`BatchMode`、`GhostInspector`、`StaffingPanel` 互斥；尝试打开另一个时走"提示 + 聚焦已打开编辑面"的 jumpTo 模式。
- **并发语义**：409 后保留会话与用户值；「使用最新值刷新」显式更新 baseline/expectedVersion 并展示他人改动，然后才允许再次保存。
- 关闭后焦点回原 bar；bar 已不可见（窗口移动/行删除）时回退到工具条"添加分配"或表格对应行。
- 拖拽预览与保存均使用会话快照版本；拖动中页面刷新不会改变会话（后台更新只影响"最新值"提示）。

---

## 5. S2：点击已提交 bar 就地打开面板（与 ghost 面板统一）

### 5.1 组件

新增 `AssignmentInspector`，两种模式复用同一布局：

| 区域 | draft 模式（ghost） | committed 模式（已提交行） |
|---|---|---|
| 头部 | 项目名 + CREATE/REPLACE 徽标 | 项目名 + 来源（当前场景/基线全局）+ 版本 |
| 身份列 | 角色可选，阶段可选 | 角色/阶段**只读**（换角色走 S4）；**direct 行不显示「更改角色/阶段」**（convert 仅 scenario 轨） |
| 比例 | 可改（草稿） | 可改（快照） |
| 日期 | fixed 可改；phase/project 只读派生 | fixed 可改（**不套用 ghost 的 min=asOf**）；phase/project 只读派生 |
| 影响预览 | 有 | 有（"该行新窗口"对比现值；投影保留原 status） |
| 操作 | 移除草稿 | 保存 / 暂停恢复 / 交接入口 / 删除 / 关闭 |
| 底部 | 完成 | 保存 + 关闭 + **「在表格中定位」链接** |

实现上先扩展 `GhostInspector` 为共享组件（props 区分 mode），共享布局、**不共享控制逻辑**（draft 即时改草稿，committed 暂存后保存）。首期 committed 面板只承接**日期、比例、预览、保存、错误恢复**，其余操作作为次级入口，防止面板变成按钮堆。

### 5.2 行为

- 点击已提交 bar → 打开 committed 面板（**替换**当前"点击定位到表格行"的行为）；面板提供「在表格中定位」链接，不再依赖 Shift+点击这类不可发现的修饰键。
- 保存：单 PUT，`expected_version` 取**打开面板时**的行版本（编辑会话，§4.5）；`Saving` 期间面板锁定；409 时**保留用户值**，提示"已被他人修改"，仅「使用最新值刷新」显式更新 baseline/版本（不静默换令牌）。
- 暂停/恢复/删除/交接：复用现有行操作 mutation（删除仍走确认；交接跳转到行内交接表单并滚动定位）。
- 未保存变更时关闭/切换编辑对象 → 确认对话框；取消则保持面板。关闭后焦点回原 bar；bar 不可见时回退到表格行或"添加分配"。

---

## 6. S3：批量模式扩展（平移 / 暂停 / 恢复）

### 6.1 交互

- 批量模式（现有入口）新增工具条：`[整体平移 ▸] [批量暂停] [批量恢复]`，与现有比例输入并存。
- 整体平移：小表单 `方向（提前/延后） + 数量 + 单位（天/周/月）`；应用对象 = **全部 fixed 且非 paused 的行**；phase/project/paused 行跳过并在结果消息中计数。
- 平移预览：应用前在批量区域显示"将影响 N 行（跳过 M 行）"，不写库；点「应用」后才写入。
- 写入：逐行 PUT（每行快照版本 + 新起止），成功/失败逐行统计；部分失败保留勾选可重试（沿用现有部分失败语义）。
- 批量暂停/恢复：对全部 active / paused 行分别执行，沿用现有 status mutation 的逐行版本与确认（direct 行仍二次确认）。

### 6.2 边界

- **生成预览时即冻结**：预览生成时冻结目标行清单、字段基线、版本与计算结果；点「应用」提交该快照，后台刷新不重建；用户显式重新预览才更新（评审 Codex 复评澄清）。
- **平移后开始日早于原开始日**：该行标失败并提示（不允许向更早扩展、不自动裁剪），其余行继续；**已开始行（原 start < asOf）的平移不因 `start < asOf` 被判失败**（评审 Claude 复评 N1：与 §4.2 的下限=原 start 同谓词）。
- "月"单位按各自日期的**月底钳制**计算（1/31 + 1 月 = 2/28），因此不保证"同量平移后时长不变"；预览中标出受影响窗口（评审 Codex P2）。
- 跳过原因分项呈现：`paused X / phase Y / project Z`；批量暂停/恢复用**一次统一确认**（"将暂停 N 行，其中 direct M 行"），不再逐行 window.confirm（评审 Claude R5）。
- 批量模式与行编辑/committed 面板/交接互斥（§4.5 互斥矩阵）；进入批量自动收起 staffing 面板（已实现）。

---

## 7. S4：换角色/阶段的"转换"事务

### 7.1 入口

- committed 面板（S2）内「更改角色/阶段」按钮 → 转换表单：新角色、新阶段（可同时改）、可选比例/日期（默认沿用）。
- 行操作列不加新图标（避免拥挤），入口放面板内；**direct 行隐藏该按钮**（convert 仅 scenario 轨，评审 Claude B2）。

### 7.2 服务端

`POST /api/assignments/:id/convert`

```json
{
  "role_id": "...",
  "phase_id": null,
  "expected_version": 3,
  "allocation_percentage": 40,
  "start_date": "2026-12-01",
  "end_date": "2026-12-31"
}
```

- **仅 scenario 轨**；`(id, X-Scenario-Id)` 归属校验；direct 行前端不显示入口、端点对 direct 行返回 400。
- 事务内：
  1. 读取原行并校验 `version = expected_version`（否则 409 VERSION_CONFLICT）。
  2. 目标键查重（scenario+project+**新**person(不变)+**新**role+**新**phase；排除自身）→ 409 DUPLICATE。
  3. 若新角色为 SE/MDE：检查该项目+角色的 active 占位（排除自身）→ 有他人占位则 409 SLOT_OCCUPIED（复用现有 payload 形状）。
  4. 校验 allocation/dates（模式沿用；fixed 必填；phase 必填 phase_id）。
  5. **字段继承**（评审 B3）：以原行为基础，只覆盖 `role_id / phase_id / allocation_percentage / 日期字段`；`status`（paused 不得被恢复）、`notes`、`is_primary`、`change_type`、`base_assignment_id` **显式继承**；若 `is_primary` 需因目标角色调整，必须定义规则并在转换表单提交前展示。不依赖列默认值。
  6. 条件删除：`DELETE ... WHERE id=? AND version=?` 影响行数必须为 1，否则抛冲突回滚，不得继续插入。
  7. 插入新行（同一 person/project；新 role/phase/比例/日期；`version=1`）。
  8. 派生日期走共享原语 `computeAssignmentDates`。
- **双审计必须与业务同事务**（评审 B4）：DELETE/CREATE 审计写入使用**同一个 `trx`**（扩展审计助手支持 trx，或事务内直接写 `audit_log`），随转换一起提交/回滚；禁止沿用"提交后调独立连接审计助手"的模式——否则出现"转换已成功但返回失败、面板保留旧行"的半提交。
- 失败整体回滚（原行保留）。
- 响应：新行（信封 `sendSuccess`；前端收到新 id 后作废任何 pending undo 对旧 id 的引用，评审 Claude B3）。

### 7.3 前端

- 转换表单提交 → 单请求；成功后面板关闭、表格/泳道刷新；失败原面板保留+错误。
- 影响预览：新键容量与旧键释放同时展示（用 workloadTimeline 投影：EDIT 语义=扣旧行加新行）。

---

## 8. S5：跨人员上下文接力

- staffing 面板「调整此人」跳转：`/people/:id/workload?project=<projectId>&assignment=<assignmentId>`。
- 目标页读取 query：
  - `assignment` 存在且在当前人员分配列表中 → **等目标人员分配数据加载完成**后 rAF 滚动到该行、高亮 2s、聚焦该行编辑按钮。
  - 仅 `project` → 滚动到泳道该 lane / 表格中该项目的首行。
  - 目标不存在（场景不符/已删除/已 convert 换 id）→ 顶部提示"未找到来源分配（可能已被删除或已转换）"，不报错。
- **导航守卫接入**（评审 Codex P1）：staffing 面板用程序化 `navigate`，不经过现有 `<a>` 捕获守卫——必须改为页面提供的受守卫跳转回调；拒绝时**保留源面板**不关闭。
- **人员切换状态清理**：目标页 `personId` 变化时清理上一人员的编辑会话/选中 ghost/搜索状态，防止残留会话指向他人分配。
- 源页有未提交 ghost 时：跳转前走离页确认（拒绝则留在本页）。
- 目标页头部显示"来自项目配置"轻提示；暂不做回程链接（浏览器返回可用，defer）。

---

## 9. S6：保存撤销（toast）

- 触发：单行保存成功、批量保存成功（逐行）、S1 拖拽保存成功。**不覆盖**删除/转换/交接；暂停/恢复不纳入撤销（写清取舍）。
- 撤销记录（评审 Codex P1）：
  ```text
  UndoRecord {
    scenarioId, assignmentId,
    inversePatch,        // 只含本次保存实际改动的字段（比例/日期），不回灌整行
    savedVersion,        // 保存响应的新 version
    source: 'row' | 'panel' | 'drag' | 'batch'
  }
  ```
  **不得整行快照回灌**：日期字段在场会触发服务端派生日期重算；只发实际改动的字段。
- 单行：逆 PUT（inversePatch + savedVersion）；409 → toast"撤销失败（该分配已被修改）"，**不自动换版本重试**。
- 批量：视为**一次保存操作**——记录成功子集，全部完成后开始 5 秒计时；撤销逐行逆 PUT，部分失败计数提示；同一时刻只保留最近一次保存的撤销。
- 与"撤销创建"（草稿行删除/替换恢复）并存互不干扰。
- toast 可访问性（评审 Claude R3）：`role=status` 播报、键盘可达（聚焦"撤销"）、焦点/悬停时暂停计时；刷新/离开后失效（纯内存）。

---

## 10. S7：统一确认对话框

- 用已有 `ConfirmDialog`（Radix）替换 `window.confirm`：
  - 删除分配（direct 二次确认文案保留）
  - 清空草稿
  - 离页守卫（返回人员详情/侧栏链接）
  - 暂停/恢复 direct 行
  - 未保存变更关闭编辑面板 / 切换编辑对象
- 交互：`Escape` 取消、焦点在取消按钮、危险操作红色主按钮、`aria-describedby` 说明后果。
- **离页守卫的异步模式必须写死**（评审 Claude B4）：`capture` 阶段监听是同步的，不能 `await`——先 `event.preventDefault()`，打开 ConfirmDialog；用户确认后**显式 `navigate()`**（并放行一次守卫）；拒绝则留在本页。`beforeunload` 保持浏览器原生提示，不接入 Radix。

---

## 11. S8：泳道默认窗口自适应（有上限）

- `rangeEnd = clamp(最远 committed/ghost end_date, asOf+3个月, asOf+12个月)`；`rangeStart = asOf` 不变。
- **不无限放大**（评审 Codex P1）：一个多年后的结束日不得压缩整个默认视图；超出 12 个月的分配走既有"范围外 N 条"定位入口（点击定位时窗口显式扩展并可能超过 12 个月），minimap 范围 = `max(12 个月, 当前窗口跨度)`。
- 覆盖查询窗口与泳道窗口同步：当前 availability 查询固定 12 个月，若窗口经"定位"扩展超过 12 个月，覆盖查询窗口必须随之扩展，否则未来覆盖缺失（复用 `fetchApprovedAvailabilityOverrides(person, rangeStart, rangeEnd)`）。
- 当窗口超过 6 个月时，热区展示粒度从周切到月（仅换展示桶，不换计算口径）。

---

## 12. 状态机与守卫（新增/变更）

```
Idle → BarDragging: 在已提交 fixed bar 上按下并移动 >3px（拖动成立后吞掉 click）
BarDragging → BarConfirm: 松手且日期变化（打开 committed 面板，日期预填，沿用会话）
BarDragging → Idle: 松手无变化 / Esc / pointercancel / 窗口失焦 / 组件卸载
BarConfirm → Saving: 点保存（面板锁定：禁止关闭/换对象/重复提交）
Saving → Idle: 成功（关闭 + 5s 撤销 toast）
Saving → BarConfirm: 409/失败（保留用户值 + 错误；「使用最新值刷新」显式换版本）
BarConfirm → Idle: 取消；有未保存变更时先经确认对话框
BarConfirm → ScenarioMismatch: 切换场景（面板只读+可关闭）
```

不变量：
- **互斥矩阵**：`BarDragging / BarConfirm / RowEditing / HandoverForm / BatchMode / GhostInspector / StaffingPanel` 同一时刻仅一个编辑面；打开另一个走"提示 + 聚焦已打开编辑面"（EXP-012/021 纪律，禁止静默切换）。同一行不得同时存在 committed 面板与表格行编辑。
- `BarDragging` 期间：不允许提交草稿、不允许进入批量、冻结时间轴比例与 minimap；场景切换取消拖动。
- 所有保存（表格/面板/拖拽/批量）都携带**编辑会话建立时**的版本快照；`Saving` 期间接入场景切换锁（与草稿提交同机制）。
- 未保存变更的关闭/切走/离页一律经确认；确认后显式执行导航（§10 的异步守卫模式）。

---

## 13. 数据与接口变更汇总

| 接口 | 变更 |
|---|---|
| `PUT /api/assignments/:id` | 无变更（S1/S2/S6 复用） |
| `POST /api/assignments/:id/convert` | **新增**（S4，事务删旧+建新） |
| `GET /api/assignments?project_id=` | 无变更 |
| 前端 query | 新增 `?project=&assignment=`（S5） |

---

## 14. 边界场景

| 场景 | 处理 |
|---|---|
| 拖动中后台刷新（版本变化） | 保存 409，面板**保留用户拖出的值**并提示，显式「使用最新值刷新」才换版本；原行不变 |
| 已开始的行左移 | 下限 = `min(原 start, asOf)`，**不截断历史**（与 ghost 的 asOf 钳制区分） |
| 已结束的行（end<asOf） | 不可拖（需改期走面板/表格） |
| 右端缩放 | 只改结束日，不修改开始日 |
| phase/project bar 拖拽 | 不可拖，aria-disabled + 提示"派生日期请在阶段/项目处修改"；**面板仍可打开**（只读日期，可改比例） |
| paused bar | 不可拖（先恢复）；面板可打开 |
| direct 行 | 面板不显示「更改角色/阶段」（convert 仅 scenario 轨）；convert 端点对 direct 返回 400 |
| 转换目标键被占 | 409 DUPLICATE，原行保留 |
| 转换进入 SE/MDE 且被他人占 | 409 SLOT_OCCUPIED，原行保留 |
| 转换成功 | 旧 id 失效：作废 pending undo；S5 深链落入"目标不存在"兜底 |
| 批量平移含 phase/paused 行 | 跳过并分项计数（paused X / phase Y / project Z） |
| 批量平移后开始日早于原开始日 | 该行失败并提示（不静默截断、不向更早扩展），其余继续；已开始行平移不因 start<asOf 判失败 |
| 批量预览后数据刷新 | 冻结目标集合与版本，新行不加入 |
| 撤销时行已被他人改 | 逆 PUT 409 → toast"撤销失败"，不自动换版本重试 |
| 未保存变更时关闭面板/切编辑对象 | 确认对话框；拒绝则保持会话 |
| 跨人跳转目标不存在 | 提示不报错；目标页人员变化时清理旧编辑状态 |
| 场景失配 | 面板/拖拽/批量全部只读，横幅回原场景/丢弃 |

---

## 15. 分期与验收

### Phase A（S1+S2，本次优先）

做：
- `AssignmentInspector`（draft/committed 双模式，先扩展 GhostInspector）
- 已提交 fixed bar 拖拽/缩放（临时预览 + 确认面板）
- 点击已提交 bar 打开面板（替换跳转行为）
- 保存成功后 5 秒撤销 toast（S6 与 S1/S2 同批落）

验收：
- 拖动 ≥1 天 → 面板预填新日期 → 保存 → 单 PUT（快照版本）→ 行/泳道更新；Esc/取消回原位
- 拖动 <3px 视为点击打开面板；越过阈值后不触发 click 重开
- 已开始行左移不截断历史；已结束行不可拖；右端缩放不改开始日
- 409 演示：拖动中改版本 → 保存 409 → 保留用户值 + 明确提示 + 原行不变
- pause/phase/project 不可拖但面板可打开；键盘 Enter 打开面板、面板内 Enter=保存
- 未保存变更关闭/切对象 → 确认对话框；取消保持会话
- 撤销 toast 恢复原值（版本校验；键盘可达、读屏播报、聚焦时暂停计时）
- **手柄命中策略**（评审 Claude R4）：1366 下 1 天 bar（≈8px）三手势重叠——透明扩大命中区（≥24px 视觉命中）/ 短 bar 降级为仅"移动"、缩放走面板日期输入；verify:states 命中切片不新增违例
- 1366 下拖拽/面板不溢出；ghost 拖拽语义不回归

### Phase B（S3+S5+S6 收尾）

- 批量平移/暂停/恢复；跨人上下文接力；批量撤销

### Phase C（S4+S7+S8）

- convert 端点 + 转换表单；统一 ConfirmDialog；窗口自适应

---

## 16. 测试计划

- 纯函数：拖动日期吸附/钳制；平移日期计算；convert 请求体构造
- 组件：committed 面板保存/409/撤销；批量平移跳过规则；转换表单错误
- 集成：convert 端点矩阵（成功、DUPLICATE、SLOT_OCCUPIED、VERSION、404、fixed/phase 日期派生、审计）
- E2E：拖拽 → 确认 → 保存 → 撤销；点击 bar 编辑；跨人接力定位
- 视觉：committed 面板 1366/1600 双主题；拖拽中热区；新增撤销 toast
- 回归：ghost 流程、批量比例、行编辑、场景守卫全部既有用例

---

## 17. 风险与对策

| 风险 | 对策 |
|---|---|
| 拖拽与点击误判 | 3px 阈值；无日期变化不弹面板 |
| 拖拽写库绕过确认 | 松手永远只开面板；保存必须显式点击 |
| 面板双模式漂移 | 单一组件 + mode 派生字段，评审锁字段表（§5.1） |
| convert 半提交 | 单事务 + 失败回滚 + 既有冲突码 |
| 撤销与乐观锁冲突 | 逆 PUT 用保存响应 version；409 明确失败 |
| 批量平移误伤 | 先预览影响行数，phase/paused 跳过并计数 |

---

## 18. 评审裁决结果（已收敛）

1. S1 落地模型 → **确认面板**（Codex + Claude 一致推荐）；补键盘快路径：面板内 Enter=保存。不采用"直接保存+撤销"。
2. S3 批量平移 → **全行 + 冻结目标集合**（不做行选择器）；预览展示受影响行与跳过原因分解；将来若需子集，按项目过滤 chip 优于 checkbox。
3. S4 convert 入口 → **仅面板内**；direct 行隐藏；行操作列不加图标。
4. S2 点击 bar → **打开面板**，替换旧"跳表格"行为；面板底部提供「在表格中定位」链接（可发现、可键盘），**不做 Shift+点击**（不可发现且 a11y 差）。

---

## 19. 三方评审记录

### 19.1 Codex（2026-11-14，第一轮）

结论：**PASS WITH CHANGES**。四项阻塞：
- B1 编辑会话/保存生命周期缺失（Saving 状态、拖拽后 click 覆盖、409 换令牌风险）→ 已落 §4.5/§5.2/§12。
- B2 已提交行不能复用 ghost 的 asOf 左界钳制（会截断历史），committed 面板不继承 `min=asOf` → 已落 §4.2/§5.1/§14。
- B3 convert 未定义 status/notes/is_primary/change_type/base_assignment_id 继承，条件删除需影响行数=1 → 已落 §7.2。
- B4 双审计必须同事务（独立连接助手会制造"转换成功却返回失败"）→ 已落 §7.2。
非阻塞采纳：S6 逆补丁字段域（不整行回灌）、draft/committed 控制逻辑分离且 paused 预览保留 status、S5 接导航守卫+人员切换状态清理、S8 有上限（12 个月）+ 覆盖查询同步、拖拽手势细节（pointercapture/失焦/冻结时间轴）、批量冻结集合与月算法。

### 19.2 Claude（2026-11-14，第三方）

结论：**PASS WITH MINOR CHANGES**。四项文档级必改：
- B1 跨 asOf/已结束 bar 的钳制（静默截断历史，与"不静默截断"原则矛盾）→ 已落 §4.2/§14。
- B2 direct 行面板内转换入口未声明隐藏 → 已落 §5.1/§7.1/§14。
- B3 convert 后旧 id 失效（pending undo 404 / S5 深链落空）→ 已落 §7.2/§14。
- B4 离页守卫换 ConfirmDialog 的异步模式（capture preventDefault → 弹框 → 显式 navigate；beforeunload 保持原生）→ 已落 §10。
建议采纳：R1 未保存变更关闭需可见确认+其他编辑入口 jumpTo（→§4.5/§12）、R2 逆 PUT 字段域+409 保留用户值（→§5.2/§9）、R3 toast 键盘/读屏/暂停计时（→§9）、R4 手柄命中策略（→ §15 Phase A 验收补充）、R5 批量暂停统一确认（→§6.2）、R6 面板保存在途锁场景（→§4.5）。
Defer：S5 回程 chip、跳过原因文案细化、paused 行是否纳入平移（维持现状）、convert 撤销（靠再次转换）。

### 19.3 收敛说明

两轮评审的阻塞项无冲突，已全部落入正文；Phase A 范围（S1+S2+单行撤销）双方均判定合理，无需拉入 S3/S4。B3/B4（convert）不阻塞 Phase A。

### 19.4 第二轮复评（2026-11-14，v1.1）

- **Codex**：**PASS WITH MINOR CHANGES** —— B1-B4 全部"已解决"，无新阻塞；仅要求澄清 §6.2 冻结时点（"预览即冻结"与"点应用时冻结"不一致）→ 已改为"生成预览时冻结快照、应用提交该快照"。
- **Claude**：**PASS WITH MINOR CHANGES** —— B1-B4 全部"已解决"；新发现 N1（§6.2/§14"新 start < asOf → 失败"会把已开始行判成必然失败，与 §4.2 下限=原 start 矛盾）→ 已把谓词统一为"新 start 早于原 start 才失败"，两处同步。
- 双方一致：**Phase A（S1+S2+单行撤销）无未决项，可立即进入实现**。
- 实现负责人盯点（双方合并）：
  1. **热区投影 status 透传**：`workloadTimeline` 对 draft 行硬编码 `status:null`，committed 拖拽预览必须保留原状态，否则 paused 行预览会计入负载（组件测试须含该断言）。
  2. **三个高危回归验收**：拖拽成立吞 click、409 保留用户值+显式刷新换版本、未保存关闭走 ConfirmDialog。
  3. **convert 同事务审计**：`req.logAuditEvent` 无 trx 且走池连接（pool.max=1 时事务内调用会死锁）——必须用 trx 版助手或事务内直写 `audit_log`；集成矩阵补"审计失败→整体回滚"。

## 20. 交付记录（Phase A，2026-11-14）

- 实施：`ecf0123`（S1/S2/S6 主体）+ `1e15efd`（验收缺口：Enter/Esc、关闭焦点归还、24px 手柄命中区）。
- 文件：`client/src/lib/committedBarDrag.ts`（纯函数边界矩阵 + 15 用例）、`AssignmentInspector.tsx`（共享 shell / draft+committed 影响预览）、`CommittedInspector.tsx`（受控面板）、`WorkloadGantt.tsx`（3px 阈值、预览定位、click 抑制、窄 bar 降级仅移动）、`PersonWorkload.tsx`（快照版本 + Saving + 409 显式刷新 + 脏关闭确认 + 逆补丁撤销 + 焦点归还 + 编辑面互斥）、i18n/CSS。
- 验证：client 90 suites / 1734 passed（新增 15 纯函数 + 8 拖拽 + 5 面板）；person-workload E2E 3/3（拖动→面板→PUT→读回→撤销）；visual 20/20；verify:states PASS；check-collection 358/160；lint 0 error；typecheck 0。
- 边界/范围：§5.1 的暂停恢复、交接、删除在 Phase A 仍走行内次级入口，未进面板；S3/S5 的批量与跨人能力留 Phase B；S4/S7/S8 留 Phase C。
- 验收注意：手柄在 bar 两侧各外扩 12px（24px 命中区）；bar 宽度 <72px 时仅保留移动手势，缩放走面板日期输入（§15 R4）。

## 21. 交付记录（Phase B，2026-11-14）

- 实施：`98398dd`（S3 + S5 + S6 收尾）。
- S3：`lib/batchShift.ts` 纯函数（day/week/month、月底钳制、跳过分项、下限=min(原 start, asOf)）；批量工具条含「整体平移/批量暂停/批量恢复」。平移预览冻结目标清单/版本/结果并展示受影响窗口；应用逐行 PUT；blocked 行分项计数；暂停/恢复一次统一确认（含 direct 计数）。
- S5：`ProjectStaffingPanel` 改为页面提供的受守卫回调（Codex P1）；`/people/:id/workload?project=&assignment=` 深链在数据加载后定位、高亮 2s、聚焦行编辑；人员切换清理旧编辑会话/ghost/批量状态；无深链参数返回时自动收起提示。
- S6：批量平移与批量比例保存均提供一次撤销（逆补丁 + 保存响应版本，toast 单例）；表格行保存补上撤销；暂停/恢复按设计不纳入。
- 验证：client 91 suites / 1750 passed；person-workload E2E 5/5；visual 20/20；verify:states PASS；check-collection 360/160；全量 Jest 4996 passed。
- 范围：Phase C（S4 convert、S7 统一 ConfirmDialog、S8 自适应窗口）未开工。
