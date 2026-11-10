# I01 需求收件箱与快速录入——设计

> 状态：设计稿（2026-11-10），待登记总计划 §7 台账
> 关联问题：W0 需求进入段缺失；现状证据见 §1
> 约束：来源多、形式不固定；录入要快；不得在录入阶段制造假日期/假产能

---

## 1. 背景与证据

### 1.1 现状入口

| 入口 | 位置 | 采集字段 | 缺口 |
|---|---|---|---|
| 需求台「新建」 | `client/src/pages/Projects.tsx:1112` → `ProjectModal` | 名称、子类型、负责人、P1–P5、外部ID、组件、标签、当前阶段、描述、数据限制、是否计入需求 | 无来源/提出人/期望窗口；类型必选 |
| `/projects/new` | `client/src/pages/ProjectNew.tsx` | 名称、类型+子类型、地点、组件、负责人、优先级、外部ID、描述、数据限制 | 几乎孤儿（仅项目类型详情页链到）；字段集与弹窗不一致 |
| SR→AR 分解 | `Projects.tsx:1653` → `ProjectModal presetParentId` | 子项基本字段 | 分解理由/期望窗口不记录 |
| Excel 导入 V2 | `ExcelImporterV2` | Projects（项目/类型/地点/优先级）、Roadmap（财周阶段）、Resource Templates、Roster | 无来源/提出人；仅批量迁移场景 |

### 1.2 关键约束（代码事实）

- `validateProjectSubType` 要求类型 + 子类型必填（`src/server/api/controllers/ProjectsController.ts:349-353`）。
- 新建即 `inheritProjectPhases`：按类型模板默认工期串行铺阶段，起点为 `aspiration_start`，缺失则用 `new Date()`（`ProjectsController.ts:57-135`）。
- `design_deadline` 由设计阶段时间线结束日推导（`ProjectsController.ts:458`）。
- 手工录入表单没有 `aspiration_start/finish` 字段；全客户端无编辑入口（仅 `StaffingSection` 当默认日期用）。
- 全库无 `source/requester/requested_by` 字段；外部身份只有 `external_id` / `external_number`。
- 生命周期仅对类型名 `需求交付`、`零星事项` 启用（`ProjectsController.ts:832`）。
- 示例库快照：47 个项目，`aspiration_start/finish` 填充 0 条，`external_number` 2 条，`description` 5 条；45 个项目有阶段，起点均等于创建日。

### 1.3 结论

需求进入段目前不是"表单不好用"，而是**没有流程对象**：录入即分类、即建计划、即产生默认日期。正确形态是 **收件箱（capture-first）+ 后置分流（triage）**。

---

## 2. 目标与非目标

### 2.1 目标

1. 任一页面唤起后，粘贴 + 1 次 Enter 收进一条（目标 ≤5 秒），**不要求类型/子类型**。
2. 来源、原文、编号/链接、提出人、期望窗口可选但可追溯。
3. 收件箱集中等待处理；分流时再选类型、优先级、负责人，并决定是否生成初版交付基线。
4. **无期望开始日不生成阶段/日期**，杜绝"从今天起算"的假基线。
5. 不污染现有需求台、产能、报表：收件箱独立表，转换后才成为项目。

### 2.2 非目标

- 不做 JDC/邮件/API 自动同步（后续候选）。
- 不做自动分类/自动优先级（解析只做提示）。
- 不做模糊日期推断（如"11月底"不自动转日期）。
- MVP 不做附件上传、不做收件人分派/审批流。
- 不重写需求台/ProjectModal。

---

## 3. 数据模型

### 3.1 新表 `demand_intake`（迁移 074）

| 列 | 类型 | 约束/说明 |
|---|---|---|
| `id` | TEXT | PK，`intake-<timestamp>-<rand>` |
| `title` | TEXT | NOT NULL；trim；超过 255 字符截断到 255（原文完整保留在 `raw_text`） |
| `raw_text` | TEXT | 原始粘贴内容（邮件/链接/一句话），不丢 |
| `source_channel` | TEXT | NOT NULL，CHECK：`jdc_sr` / `internal` / `ticket` / `product` / `email` / `other` |
| `source_ref` | TEXT | SR/AR 号、JDC 链接、工单号；自由文本；≤500；trim；整串匹配 `^(SR|AR)[-_ ]?\d+$` 时归一为 `SR<number>`/`AR<number>` 大写，URL 等其他值原样保留 |
| `requester` | TEXT | 提出人自由文本（外部人员不强绑 people） |
| `priority_hint` | INTEGER | 可空；1–5；来自粘贴解析 `P1–P5`，仅提示 |
| `expected_start` | TEXT | 可空；ISO `YYYY-MM-DD` |
| `expected_finish` | TEXT | 可空；ISO；≥ expected_start |
| `note` | TEXT | 可空 |
| `status` | TEXT | NOT NULL DEFAULT `new`；CHECK：`new` / `converted` / `rejected` |
| `reject_reason` | TEXT | `rejected` 时必填 |
| `converted_project_id` | TEXT | FK `projects(id)` ON DELETE SET NULL |
| `converted_at` | TEXT | ISO datetime |
| `created_by` | TEXT | FK `people(id)` ON DELETE SET NULL；来自 `req.user?.id` |
| `created_at` / `updated_at` | TEXT | NOT NULL |

索引：

```sql
CREATE INDEX idx_demand_intake_status_created
  ON demand_intake(status, created_at);
CREATE INDEX idx_demand_intake_source_created
  ON demand_intake(source_channel, created_at);
CREATE UNIQUE INDEX idx_demand_intake_source_ref_unique
  ON demand_intake(source_channel, source_ref)
  WHERE source_ref IS NOT NULL AND source_ref <> '' AND status <> 'rejected';
CREATE INDEX idx_demand_intake_converted_project
  ON demand_intake(converted_project_id);
```

状态机（不做 `triaged` 中间态，转换即完成分流）：

```
new ──convert──► converted
 │
 └──reject──► rejected
```

### 3.2 为什么不把草稿放进 `projects`

1. 类型/子类型必填约束不能为录入体验破坏。
2. `projects` 行会进入看板/产能/报表，需处处加"排除草稿"过滤，漏一处就是数据污染。
3. 来源形式不固定，需要 `raw_text` 原样保存；`projects` 不适合承载未结构化内容。

### 3.3 共享类型

新增 `shared/types/intake.ts` 并从 `shared/types/index.ts` 导出：

```ts
export const INTAKE_SOURCE_CHANNELS = [
  'jdc_sr', 'internal', 'ticket', 'product', 'email', 'other',
] as const;
export type IntakeSourceChannel = (typeof INTAKE_SOURCE_CHANNELS)[number];

export type IntakeStatus = 'new' | 'converted' | 'rejected';

export interface DemandIntake {
  id: string;
  title: string;
  raw_text: string | null;
  source_channel: IntakeSourceChannel;
  source_ref: string | null;
  requester: string | null;
  priority_hint: number | null;
  expected_start: string | null;
  expected_finish: string | null;
  note: string | null;
  status: IntakeStatus;
  reject_reason: string | null;
  converted_project_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## 4. API 设计

新增路由文件 `src/server/api/routes/intake.ts`，在 `routes/index.ts` 挂 `/api/intake`。
控制器 `DemandIntakeController extends BaseController`；转换事务在 `services/intake/IntakeConversionService.ts`。
全部响应遵循信封规范：列表 `{ data, pagination? }`、单实体 `{ data }`、写操作 `{ success: true, data }`、错误 `{ error, message }`。

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/intake` | 单条收入收件箱 |
| POST | `/api/intake/batch` | 批量收入（≤200 条） |
| GET | `/api/intake` | 列表：`status/source_channel/q/page/limit/sort` |
| GET | `/api/intake/counts` | 状态/来源计数（tab 徽标、页头） |
| GET | `/api/intake/:id` | 详情 |
| PATCH | `/api/intake/:id` | 编辑（仅 `new`） |
| POST | `/api/intake/:id/convert` | 分流并创建项目（事务） |
| POST | `/api/intake/:id/reject` | 拒绝（必须给理由） |

### 4.1 捕获请求

```json
{
  "title": "用户登录改造",
  "raw_text": "SR123456 用户登录改造 11月上线",
  "source_channel": "jdc_sr",
  "source_ref": "SR123456",
  "requester": "张三",
  "priority_hint": 2,
  "expected_finish": "2026-11-30",
  "note": ""
}
```

> API 允许同时传 `expected_start`/`expected_finish`；**S1 客户端捕获框只发送 `expected_finish`**，`expected_start` 只在分流时填写。

校验：

- `title` 必填；trim 后非空；超 255 截断（原文保留在 `raw_text`）。
- `source_channel` 必须在枚举内；默认 `internal`（客户端记住上次选择）。
- `source_ref` trim；整串匹配 `^(SR|AR)[-_ ]?\d+$` 时归一为大写 `SR<number>`/`AR<number>`；URL 等其他值原样保留。
- `expected_start/finish` 必须 `YYYY-MM-DD`；两者都有时 start ≤ finish。
- `priority_hint` 1–5 或 null。
- 重复：同 `(source_channel, source_ref)` 且 `status ≠ rejected` 已存在 → 409，返回 `{ error: 'duplicate_source_ref', existing_id }`；**被拒绝的记录不占用唯一键，允许重新捕获**。
- 标题重复：同标题且 `status=new` 已存在 → **不阻塞**，返回 `warnings: [{ type: 'duplicate_title', existing_id }]`。
- 批量：请求体为 `{ "items": [ { ...单条字段... } ] }`（≤200 项；每项独立 `source_channel`）。先整体硬校验（字段格式），任一硬错误整批 400、零插入；硬校验通过后，同批内重复保留第一条、后续进 `skipped`，与库重复同样进 `skipped`，其余一个事务插入，返回 `created + skipped`：

```json
{
  "success": true,
  "data": {
    "created": [{ "...": "..." }],
    "skipped": [
      { "index": 2, "reason": "duplicate_source_ref", "existing_id": "intake-..." }
    ]
  }
}
```

单条捕获响应：`{ success: true, data: <DemandIntake>, warnings?: [{ type: 'duplicate_title', existing_id }] }`。

### 4.2 转换请求

```json
{
  "title": "用户登录改造",
  "project_type_id": "...",
  "project_sub_type_id": "...",
  "priority": 3,
  "owner_id": "...",
  "expected_start": "2026-11-01",
  "expected_finish": "2026-11-30"
}
```

- `project_type_id` / `project_sub_type_id` 必填，复用抽出的 `validateProjectSubType`。
- `title` 可选；提供且与收件箱标题不同时，同时更新 `demand_intake.title` 与项目 `name`。
- `priority` 缺省：`priority_hint ?? 3`。
- `expected_start/finish` 缺省取收件箱值；仍为空则**不建阶段**。
- **不提供 `create_baseline` 开关**：有 `expected_start` 即生成基线，没有就不生成。
- **MVP 不支持 `parent_id`**：转换出的项目不挂父；SR/AR 父级关系在项目编辑页处理，后续候选再议。
- 响应：

```json
{
  "success": true,
  "data": {
    "project": { "...": "..." },
    "intake": { "...": "..." },
    "baseline": "set" | "unset",
    "baseline_reason": "no_expected_start" | "no_template" | null,
    "phase_count": 6,
    "external_number_linked": "SR123456",
    "baseline_warnings": []
  }
}
```

### 4.3 转换事务（`IntakeConversionService`）

```
BEGIN
  1. SELECT intake WHERE id = ? AND status = 'new'   -- 不存在 → 409
  2. validateProjectSubType(type, subType)
  3. INSERT projects {
       id, seq_number=max+1, name=title, description=raw_text/note,
       project_type_id, project_sub_type_id, priority, owner_id,
       include_in_demand=true,
       aspiration_start/finish（有则写，无则 NULL）,
       external_number = 从 source_ref 任意位置匹配 /(SR|AR)[-_ ]?\d+/i 提取（归一为大写），仅当项目为空时写入
     }
  4. lifecycle_state = 类型名 ∈ ['需求交付','零星事项'] ? 'pending_rat' : NULL
     ├─ 是：INSERT project_lifecycle_events(from_state=NULL,to_state='pending_rat',
     │        note='from intake <id>', actor=created_by)
     └─ 否：不写事件
  5. 若 expected_start：
       inheritProjectPhases(anchor=expected_start)
       若阶段末日晚于 expected_finish → baseline_warnings += 'phase_extends_beyond_expected_finish'
     否则：不生成阶段（baseline='unset', baseline_reason='no_expected_start'）
     若类型无模板阶段：baseline='unset', baseline_reason='no_template'
  6. UPDATE demand_intake
       SET status='converted', converted_project_id=?, converted_at=now
       WHERE id=? AND status='new'
     若 changes=0 → 抛 409（防双击/并发）
  7. 审计：intake CONVERT + project CREATE
COMMIT
```

- 任一失败整体回滚，不留僵尸项目/重复项目。
- 转换后收件箱行不可编辑；要改走项目。
- 拒绝：`UPDATE ... SET status='rejected', reject_reason=? WHERE id=? AND status='new'`；审计。

### 4.4 端点语义明细（实现按此表，不再另行解释）

| 端点 | 规则 |
|---|---|
| `GET /api/intake` | `status` 默认 `new`；可选 `source_channel`、`q`（匹配 title/source_ref/requester）；`page` 默认 1；`limit` 默认 50、上限 200；`sort=oldest|newest`，默认 `oldest`（按 `created_at`） |
| `GET /api/intake/counts` | `{ data: { new, converted, rejected, by_source: { jdc_sr, internal, ... } } }`；`by_source` 只统计 `status=new`；路由必须注册在 `/:id` 之前 |
| `PATCH /api/intake/:id` | 仅 `status=new`；可改 `title/raw_text/source_channel/source_ref/requester/priority_hint/expected_start/expected_finish/note`；不可改 `status/converted_project_id/created_by/created_at` |
| `POST /api/intake/:id/reject` | `{ reason }`，reason trim 后 1–500 字；仅 `status=new`；响应 `{ success:true, data:<intake> }` |
| `DELETE /api/intake/:id` | 仅 `status=new`；硬删除并写 `INTAKE_DELETE` 审计；`converted/rejected` 返回 409 |
| 状态码 | 成功 200；校验 400；不存在 404；重复/状态冲突 409；服务端错误 500 |
| 审计事件 | `INTAKE_CREATE`、`INTAKE_UPDATE`、`INTAKE_CONVERT`、`INTAKE_REJECT`、`INTAKE_DELETE` |
| 项目描述 | `description = [raw_text, note].filter(Boolean).join('\n\n') || null` |
| 分流改标题 | 若 triage 标题与收件箱标题不同：同时更新 `demand_intake.title` 与项目 `name` |
| 批量标题重复 | 批量不做标题重复警告，只做 `source_ref` 去重；单条捕获才返回 `duplicate_title` 警告 |
| 并发 | 转换用 `UPDATE ... WHERE status='new'` 条件更新；测试用顺序重复调用（模拟双击）+ 条件更新单测，不引入真并发计时断言 |

### 4.5 抽取共享原语（避免控制器互调）

从 `ProjectsController` 抽出两个纯函数，控制器与本服务共用：

- `src/server/services/projects/projectTypeValidation.ts`
  `validateProjectSubType(db, typeId, subTypeId): Promise<void>`
- `src/server/services/projects/phaseInheritance.ts`
  `inheritProjectPhases(db, projectId, projectTypeId, trx?, opts?: { anchorDate?: string; skipIfNoAnchor?: boolean })`

`ProjectsController.create/update` 改为调用它们；行为不变，补回归测试。这是本设计唯一触碰存量核心路径的重构，必须独立提交。

---

## 5. 前端设计

### 5.1 入口与挂载

| 入口 | 行为 |
|---|---|
| 顶栏「＋ 录入」按钮 | 打开全局捕捉 Dialog |
| 快捷键 `Alt+N` | 全局打开（用 `event.code === 'KeyN'`，避免 mac Alt 组合键 `event.key` 异常；输入框内不拦截） |
| 需求台工具栏「快速录入」 | 打开同一 Dialog |
| 项目 tab「收件箱」 | 进入 `/projects?tab=intake` |

全局 Provider：`client/src/contexts/IntakeCaptureContext.tsx`，在 `App.tsx` 的 `AppContent` 内、`Layout` 外层挂载 `<IntakeCaptureProvider>`，Provider 内渲染 `<QuickCaptureDialog />`。`AppHeader` / `Projects` 通过 `useIntakeCapture().open()` 调用。

### 5.2 快速捕捉 Dialog

- Radix `Dialog`（已装原语），焦点入输入区，Esc 关闭，关闭后焦点回到触发按钮。
- **单行（默认）**：`<input>`，Enter 提交；粘贴内容含换行时自动切多行。
- **多行**：`<textarea>`，Ctrl+Enter 提交、Enter 换行；预览逐行解析，可编辑标题；一次提交共用一个来源。
- 字段：大输入区、来源 Select（默认上次选择，存 `localStorage('intake-source')`，无记录时 `internal`）、编号/链接（自动提取，可改）、**期望交付日**（可选，单个日期选择器，写入 `expected_finish`）；提出人/备注收进「更多」折叠区。
- 解析（`client/src/lib/intakeParse.ts`，纯函数）：
  - URL 优先：命中 URL → `source_ref`，不再用 SR/AR 正则覆盖；
  - 无 URL 时 `/(SR|AR)[-_ ]?\d+/i` → `source_ref`（归一为大写）；
  - `\bP([1-5])\b` → `priority_hint`
  - `YYYY-MM-DD` / `YYYY/MM/DD` → `expected_finish`（仅显式 ISO；**不解析"11月底"，不推断开始日**）
  - 首行 → 标题；若首行只有链接/编号，标题回退为 `未命名需求（<source_ref>）`，可编辑；原文全量进 `raw_text`
- 提交反馈：toast「已收入收件箱 N 条」；「收入并继续」提交后清空标题/编号/日期/优先级提示、保留来源选择、焦点回输入区；失败保留输入、显示可重试错误。
- 重复：行级徽标"可能重复/已存在"，已存在项默认不提交，可点击查看已有条目。

### 5.3 收件箱页 `IntakeInbox`

```
收件箱 (12)   来源[全部▾] 状态[待处理▾] 搜索[____]
[ ] 标题            来源     编号/链接   提出人  期望窗口    等待   操作
[ ] 用户登录改造     JDC/SR   SR123456   张三    11-01~11-30 2小时  [转为事项] [拒绝]
[ ] 报表导出优化     内部提出  —          —       —           1天    [转为事项] [拒绝]
```

- 默认 `status=new`、按 `created_at` 升序（等得最久在前）。
- 列：选择、标题、来源（可点链接）、编号、提出人、期望窗口、等待时长、状态、操作。
- 标题点击展开行详情：`raw_text`、来源/编号、备注、创建时间；仅 `status=new` 可编辑。
- 1366 视口隐藏"提出人/期望窗口"列，信息由行详情承接；标题/来源/等待/操作列受保护。
- 空/加载/失败三态分离；失败可重试；过期旧值不冒充空态。
- 行内「转为事项」打开 Triage Dialog；「拒绝」打开理由 Dialog（必填）；「删除」仅 `status=new`，二次确认后硬删除。
- 批量：勾选 → 统一类型/优先级批量转换（后续候选）。

### 5.4 Triage Dialog

```
转为事项
  标题（可改）
  类型 [需求交付 ▾]  子类型 [新功能 ▾]     ← 记住上次（localStorage）
  优先级 [P3 ▾]（预填 priority_hint）     负责人 [可选 ▾]
  期望开始 [____]  期望结束 [____]        ← 结束日预填收件箱值；开始日留空
  基线说明：有期望开始日即自动生成基线（无开关）；无开始日则不生成，标记"未定基线"
  [创建并进入待RAT] [取消]
```

- 类型/子类型依赖选择，复用 `ProjectNew` 的 sub-type 分组查询逻辑。
- 无期望开始日时仅显示说明，不阻塞转换；结束日只有值、开始日为空时同样不生成基线。
- 成功后：toast + 「打开项目」链接；若有 `baseline_warnings`，在 toast 中追加一行；关闭并 invalidate `intake`、`projects`、`dashboard`。
- 失败：保留表单、显示服务端错误、可重试。

### 5.5 缓存与键

`client/src/lib/queryKeys.ts` 新增：

```ts
intake: {
  all: ['intake'] as const,
  list: (filters?: Record<string, unknown>) => ['intake', 'list', filters ?? {}] as const,
  detail: (id: string) => ['intake', 'detail', id] as const,
  counts: () => ['intake', 'counts'] as const,
}
```

转换成功必须 invalidate：`intake.all`、`projects.all`、`dashboard.all`（若有 count 消费）。

### 5.6 i18n

新增命名空间 `intake`：

- `client/src/i18n/locales/en-US/intake.json`
- `client/src/i18n/locales/zh-CN/intake.json`
- `client/src/i18n/index.ts`：加入 `NAMESPACES`、`enResources`、`zhResources`。

en-US 值需与中文键一一对应；测试断言英文文案。来源/状态枚举走 `enum-labels` 或 `intake:sources.*`。

### 5.7 UI 契约

- 遵守五支柱：A2（转换后 invalidate 全消费方）、B1（来源/状态词一致）、B2（每个字段自标注）、D1/D2（双主题、1366/1600）、D7（Enter/Esc/Tab）、E2（失败可见可重试）。
- 生成前跑 `/ui-preflight`；交付前 `verify:states --quick` + 双主题截图人眼走查。
- 不新增 design token；复用现有 spacing/color/typography。

---

## 6. 业务规则汇总

1. **收件不分类**：类型、子类型、优先级、负责人都可以后置；捕获只需要标题 + 来源。
2. **来源必选但有默认**：默认 `internal`（或上次选择）；"其他"用 `raw_text/source_ref` 承载自由内容。
3. **不造假日期**：捕获阶段只有一个可选的**期望交付日**（写入 `expected_finish`）；期望开始日只在分流时由用户填写。没有开始日就不生成阶段。
4. **编号复用**：`source_ref` 命中 SR/AR 格式时，转换后自动填 `external_number`（仅当为空），满足后续 `NO_ITERATION_NUMBER` 告警的前置数据。
5. **不可重复**：同来源同编号唯一，但 `rejected` 记录不占用唯一键；同标题只警告不阻塞。
6. **转换即承诺**：转换后收件箱条目只读；项目的生命周期从 `pending_rat` 开始（仅需求类类型）。
7. **拒绝留痕**：必须理由；可审计；可重新捕获。
8. **审计**：捕获/编辑/转换/拒绝均写显式 `logAuditEvent`；本批不修改 `AUDIT_ENABLED_TABLES`。

---

## 7. 实施范围与顺序

**本计划只承诺 S1。后续候选不占本次排期、不作为验收条件。**

### S1 —— 唯一实施路径（按顺序，不并行改存量）

1. **迁移 + 类型**
   - `src/server/database/migrations/074_demand_intake.ts`（表、索引、部分唯一索引）
   - `shared/types/intake.ts` + `shared/types/index.ts`
   - 迁移构建测试确认新表存在
2. **抽取共享原语（独立提交）**
   - `src/server/services/projects/projectTypeValidation.ts`
   - `src/server/services/projects/phaseInheritance.ts`
   - `ProjectsController.create/update` 改调用；补创建回归测试（阶段起点/数量/模板字段不变）
3. **服务层 + 集成测试**
   - `src/server/services/intake/IntakeService.ts`（捕获/列表/编辑/拒绝/去重）
   - `src/server/services/intake/IntakeConversionService.ts`（转换事务）
   - 集成测试跑真实迁移库：捕获、批量、去重、转换有/无开始日、生命周期事件、`external_number`、拒绝、重复转换（双击）
4. **HTTP 层**
   - `src/server/api/controllers/DemandIntakeController.ts`
   - `src/server/api/routes/intake.ts` + `routes/index.ts` 挂载
   - 合同测试：信封、状态码、错误码
5. **客户端数据层**
   - `client/src/lib/api-client.ts` 新增 `intake` 命名空间
   - `client/src/lib/queryKeys.ts` 新增 `intake.*`
6. **捕捉入口**
   - `client/src/contexts/IntakeCaptureContext.tsx`
   - `client/src/components/intake/QuickCaptureDialog.tsx`
   - `client/src/lib/intakeParse.ts` + 单测
   - `App.tsx` 挂 Provider；`AppHeader` 加按钮 + `Alt+N`；`Projects` 工具栏加入口
7. **收件箱与分流**
   - `client/src/pages/IntakeInbox.tsx`
   - `client/src/components/intake/IntakeTriageDialog.tsx`
   - `ProjectsUnified` 加 tab（`id: 'intake'`，放在需求台之前；`defaultTab` 仍为 `demand`）
8. **i18n + 文档**
   - `locales/{en-US,zh-CN}/intake.json`；`i18n/index.ts` 注册命名空间
   - `docs/USER_MANUAL_zh-CN.md` 增加"收件箱/快速录入"一节
9. **验收**
   - 客户端测试（捕捉/收件箱/分流）
   - `npx jest --selectProjects client server-unit server-integration`
   - `npm run typecheck`、`npm run lint:ui`、`npm run verify:states -- --quick`
   - 双主题 + 1366/1600 人眼走查

### 后续候选（不在本次承诺）

- 多行预览增强、批量 triage、`parent_id` 挂接、tab 徽标、来源统计、项目详情来源链路、JDC/邮件/API 接入。

### S1 完成定义（DoD）

1. §8.1 九条行为验收全过。
2. 新增/修改文件 `typecheck`、`lint` 零错误。
3. 集成测试使用真实迁移库；`server-integration` 全绿。
4. 收件箱 + 捕捉 Dialog 双主题、1366/1600 走查通过；`verify:states --quick` 无新增违例。
5. i18n 双语键齐全；USER_MANUAL 增加收件箱/快速录入一节。
6. 不修改既有迁移；`ProjectsController` 创建行为回归测试证明未变。

---

## 8. 验收

### 8.1 行为验收（S1 必须全过）

1. 任意页面 `Alt+N` → 粘贴 `SR123456 用户登录改造` → Enter；收件箱出现 1 条，来源 JDC/SR、编号 SR123456、标题正确。
2. 粘贴 10 行 → 预览 10 条 → 一次收入；无类型选择、无页面跳转。
3. 收件箱中无类型需求 → 转为事项：选类型/子类型/优先级 → 成功创建项目，`lifecycle_state=pending_rat`，生命周期事件 note 含 intake id。
4. 捕获只填"期望交付日 2026-11-30" → 转换时若开始日留空 → **不生成阶段**、`aspiration_start` 为 NULL、界面显示"未定基线"；分流时补"期望开始日 2026-11-01" → 阶段从 2026-11-01 开始。
5. 同来源同编号再次捕获 → 409/行级"已存在"，不产生重复条目；被拒绝的编号可重新捕获。
6. 拒绝必须填理由；拒绝后不可转换；记录可查。
7. 重复调用转换（模拟双击）→ 只创建一个项目，第二次 409。
8. 批量中重复项进 `skipped`，其余正常入库；硬校验错误整批 400、零插入。
9. 现有项目、需求台、产能、报表零变化。

### 8.2 指标

- 捕获耗时：粘贴后 ≤ 1 次 Enter；从唤起到达成 ≤ 5 秒。
- 批量：10 行 ≤ 1 次确认。
- 分流：默认值预填后 ≤ 2 次交互完成转换。
- 数据：新捕获 100% 有 `source_channel`；转换后来源链路 100% 可追溯；无期望开始日转换产生 0 个阶段。

### 8.3 验证命令

```bash
npx jest --selectProjects client server-unit server-integration
npm run typecheck
npm run lint:ui
npm run verify:states -- --quick
# 交付点（需求台/收件箱双主题双视口）
node scripts/verify-visual.mjs
```

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 抽取 `inheritProjectPhases` 改变存量创建行为 | 独立提交；先补创建回归测试（阶段起点/数量/模板字段）；只做参数化不改默认语义 |
| 并发/双击转换产生双项目 | 事务内条件更新认领 + `status='new'` 校验；集成测试并发两请求 |
| 收件箱变成新积压 | 默认按等待时长排序；页头计数；后续候选加来源/年龄统计；不自动分派（单用户） |
| 来源枚举不够用 | "其他" + `raw_text/source_ref` 自由文本；后续候选可扩枚举 |
| 批量粘贴误收 | 预览 + 去重 + 可逐条取消；硬上限 200 |
| 快捷键与浏览器/输入冲突 | 用 `Alt+N` + `event.code`；输入框内不拦截；Esc 关闭 |
| 新增 i18n 命名空间遗漏 | 加入 `NAMESPACES`/resources 两侧；typecheck + 测试覆盖 en-US 文案 |
| 收件箱污染规划数据 | 独立表；转换才写 projects；所有容量/看板查询不感知 intake |

---

## 10. 已定决策（不再作为开放选项）

1. **位置**：收件箱作为「项目」下第一个 tab，需求台第二；`/projects` 默认仍打开需求台。
2. **捕获日期**：捕获只提供一个可选的"期望交付日"→ `expected_finish`；不推断开始日。开始日只在分流时填写。
3. **基线**：有 `expected_start` 即自动生成；无则不生成并标"未定基线"；**不提供开关**。
4. **`parent_id`**：MVP 不支持；转换出的项目不挂父。
5. **批量 triage**：MVP 不做，只做单条转换。
6. **`requester`**：自由文本，不绑定 `people`。
7. **审计**：本批只用显式 `logAuditEvent`，不修改 `AUDIT_ENABLED_TABLES`。
8. **去重**：同来源同编号唯一，`rejected` 不占用唯一键；同标题仅警告。
9. **标题超长**：截断到 255，原文保留在 `raw_text`。
10. **tab 徽标/来源统计/项目详情来源链路**：不在 S1，列入后续候选。
11. **不做的**：附件、自动分类、模糊日期推断、JDC/邮件自动同步。

---

## 11. 记录

- 2026-11-10：设计稿创建。证据来自 W0 流程复盘、`ProjectNew`/`ProjectModal` 字段核对、`ProjectsController` 创建路径、示例库只读查询。
- 2026-11-10：收敛评审。定死 11 项决策；移除 `create_baseline` 开关、`parent_id`、批量 triage 和额外分批排期；捕获日期统一为 `expected_finish`；明确批量/去重/并发语义。本计划只承诺 S1。
- 2026-11-10：S1 实施完成（`43c969e`，分支 feature/i01-demand-intake），待验收。证据见总计划 §7 台账 I01a 行：迁移守卫 4/4、服务集成 19/19、HTTP 合同 12/12、客户端 27/27、抽取回归 106 绿、全量 Jest 4636 绿（2 失败为存量 personUtilizationView 日期老化，干净 HEAD 复现，与本批无关）；typecheck/lint/lint:ui/stylelint/verify:cache 全绿；实机冒烟（真实 HTTP 捕获→删除无残留）+ 双主题/双视口截图零 pageerror；verify:states projects 24/24 + 新 intake profile 全 PASS（夹具已采集入守卫）。DoD 六条全部满足。
- 2026-11-10：白盒事故（用户截图：深色页 + 中央纯白弹层）。法证链：截图亮度图定位 ~790×780 纯白盒=捕捉框轮廓；探针（干净 Chromium 双主题）弹层均正确深/浅色 → 判定为**陈旧页面/HMR 半更新态**（本会话多次重启 dev 栈，用户标签页未刷新）。同时根治结构性脆弱点：三个 intake DialogContent 显式内联 `var(--bg-primary)/var(--text-primary)/var(--border-color)`（body 级事实标准层），不再依赖 PortalThemeProvider 复制的 HSL 变量链；捕捉框抛光（原生 checkbox→分段控件、去重复 hint、预览行卡片化 qc-* 类）。复验：双主题探针 bg=body 同色、intake 客户端 27/27、typecheck 0、lint:ui/stylelint PASS、verify:states intake profile 全 PASS。
- 2026-11-10：视觉评审找到**全局类根本 bug**（Tailwind v4 分层）：项目未分层 CSS（index/design-system）天然压过 `@layer utilities`，导致 ①`button{position:relative}` 压掉关闭钮 `absolute right-4 top-4`——× 掉进 grid 流：弹层底部多 44px 空行、关闭钮出现在左下角；②`button{background:var(--bg-secondary)}` 压掉主按钮 `bg-blue-600 text-white`——主次按钮同灰、操作层级消失。修复收口到共享原语 `ui/dialog.css`：`.dialog-close-btn`（右上 32×32，显式重置 position/尺寸/hover/active）+ `.dialog-primary-btn`/`.dialog-secondary-btn`（实心 `--primary-solid`/描边，含三态）；`ui/dialog.tsx` 关闭钮改类，三个 intake 弹层按钮接入（全部 Dialog 受益）。实测：弹层 576→508px；关闭钮 (663,687) 44×44→(1181,216) 32×32；主按钮 #4f46e5 白字。顺手把期望交付日帮助文案移到右列空位。验证：全量 client Jest 72 套件/1536 绿、typecheck 0、lint:ui/stylelint PASS、verify:states intake 双主题全 PASS。**注意：此修复是全局的（既有 ProjectModal 等的 × 也会回到右上角），verify:visual 弹窗基线在交付点需重采。**
- 2026-11-10：审美级收尾（用户确认"做掉"）：①弹层宽度 576→520（inline maxWidth，绕开分层）；②空态提示"粘贴多行=批量收入；Enter 直接收入"；③主按钮 Enter 键帽提示（多行模式显示 Ctrl+⏎）；④解析结果 chips（已识别 SR/P档/日期，编号/日期 chip 点击聚焦对应字段；品红/描边走未分层 `.qc-chip` 类）。实测双主题：w=520、chips=已识别SR123456P22026-11-30、kbd=⏎、主按钮 #4f46e5、close absolute。验证：intake 客户端 28/28（新增 chips 聚焦用例）、全量 client Jest 72 套件/1537 绿、lint:ui/stylelint PASS、verify:states intake 双主题全 PASS。
- 2026-11-10：违和感全量解剖与 P0–P6 修复（用户"先找问题→全部修掉"）。量测证据与根因：
  ①**P0 遗留 CSS 误伤**——`styles/modal-common.css` 的 `[role="dialog"] > div:first-child`（旧 ReactModal 选择器）给所有 Radix 弹层的 **DialogHeader** 套了 border/圆角/阴影/max-height/flex-column：实测 header `border:1px`、`bg:white`，这就是"框中框"与红箭头所指。修复=从选择器列表删除该条（旧 `.modal-*` 类保留）。
  ②**P1 焦点错位**——Radix 默认聚焦首个可聚焦元素=分段按钮，实测 `activeElement=BUTTON.qc-mode-btn`（截图里的蓝焦点环）；修复=DialogContent `onOpenAutoFocus` preventDefault 并显式聚焦 textarea（实测 activeElement=TEXTAREA#intake-text）。
  ③**P2 控件材质/高度错位**——SelectTrigger 是 `<button>`，shadcn `h-10 bg-background border-input` 被未分层 button 规则压掉：实测 44px/灰底/无边框 vs Input 40px/白底/灰边框；修复=`ui/dialog.css` 增未分层 `.dialog-field`（40px/白底/`--input-border`/hover/focus 重置），capture+三位一体 triage 的全部 Select 接入；实测 Select 40px/白底/边框 rgb(209,213,219) 与 Input 完全一致。
  ④**P3 触控规则撑大**——`.qc-mode-btn` 只设 height 未重置 min-height：实测 44×70；修复=min-height 26/min-width 0（实测 70×26）；`.qc-more-toggle` 同理 44→26。
  ⑤**P4 节奏断裂**——header 底边与分段行 1px 交叠；修复=内容区 `space-y-3 pt-2`、footer `pt-4`，实测间距 8/12/16 有节奏。
  ⑥**P5 提示四层叠**——描述与 Label/placeholder/空态提示重复；修复=描述改为价值句"JDC 链接、SR 号或一句话，自动识别编号与日期"，空态提示收短为"粘贴多行 = 批量收入"。
  ⑦**P6 语言密度**——space-y-4→3、gap-4→3，弹层 576→520 已先行。
  复验：intake 客户端 28/28、全量 client Jest 72 套件/1537 绿、typecheck 0、lint:ui/stylelint PASS、verify:states intake 双主题全 PASS。**全局副作用（正向）**：所有 shadcn 弹窗的标题区不再出现多余边框盒；verify:visual 弹窗基线在交付点需重采。
