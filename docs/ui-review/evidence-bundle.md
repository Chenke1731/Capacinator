# UI Evidence Bundle（MVP）

> 目的：把“确定性取证”从 UI 评审员的模型回合里拿出来。一次脚本运行输出结构化证据，
> 评审员只做解读、定级和写短报告。
>
> 当前范围：收件箱 `/projects?tab=intake` 的 target / capture / delete / states / triage 五个步骤。
> 这是纵向切片，不是通用测试框架。

## 为什么

2026-11-10 的首轮盲评用了 25m39s：104 个模型回合、20 个一次性 Playwright 探针、
18 张截图。工具执行只占 19.3%，主要成本是“模型写脚本 → 起浏览器 → 读 JSON → 再写下一个”。

Evidence Bundle 把这些确定性步骤收进一个 runner：

- GET 从冻结 fixture 读取，缺 key 直接报错
- 写请求全部拦截；只允许 scenario 显式注册的 browser-only mock
- 一次浏览器会话跑完多个步骤
- 输出 `evidence.json` + `summary.md` + `shots/*.png`
- 每条断言都有 PASS/FAIL/WARN 与具体数值

## 用法

```bash
# 先跑目标（symptom-first），约 3–5 秒
node scripts/collect-ui-evidence.mjs \
  --scenario intake --only target \
  --base http://127.0.0.1:3121 --api http://127.0.0.1:3111 \
  --out /tmp/ui-evidence/head --label HEAD-9f70977

# 跑完整 MVP 五件套，约 17–20 秒
node scripts/collect-ui-evidence.mjs \
  --scenario intake --only all \
  --base http://127.0.0.1:3121 --api http://127.0.0.1:3111 \
  --out /tmp/ui-evidence/head-all --label HEAD-9f70977 --expect-fail

# 变异自证：修复后的工作区注入 hover 位移，target 守卫必须变红
node scripts/collect-ui-evidence.mjs \
  --scenario intake --only target --inject hover-lift \
  --base http://127.0.0.1:3120 --api http://127.0.0.1:3110 \
  --out /tmp/ui-evidence/inject-hover --expect-fail
```

参数：

| 参数 | 说明 |
|---|---|
| `--scenario intake` | 当前只有 intake |
| `--only target` | 只跑目标；`capture` / `delete` / `states` / `triage` 可组合；默认 `all` |
| `--base` / `--api` | 前端/后端地址；也可用 `UI_AUDIT_BASE` / `UI_AUDIT_API` |
| `--fixture` | 默认 `tests/visual/fixtures/runtime-data.json`；`none` = 走 live GET |
| `--viewport` | 默认 `1366x900` |
| `--theme` | `light` / `dark` |
| `--inject` | `hover-lift` / `remove-role` |
| `--label` | 写进 meta，如 `HEAD-9f70977` / `fixed` |
| `--expect-fail` | 有 blocking 时退出 0（用于 HEAD 复现/变异自证） |
| `--headed` | 有头浏览器，调试用 |

前置条件：

- fixture 覆盖页面所有 GET；缺 key 会在 `page-errors` 里 fail loud。
- `authenticate()` 需要 API 可达，用于 `/api/people` + `/api/auth/login`。
- 不需要 seed 业务库；fixture 已含 3 行 intake。删除确认步骤需要至少 1 行。

## 输出

```text
/tmp/ui-evidence/<run>/
  evidence.json    # 原始几何/网络/a11y 证据，约 47KB
  summary.md       # 评审员先读这个，约 7KB
  shots/
    target-hover-1366.png
```

`summary.md` 包含：

- meta：label、page、viewport/theme、base/api、fixture、耗时
- target：static/hover/focus 的 top/height/transform/shadow、祖先边界、`elementFromPoint`、同排高度
- capture：自动填充、清空后字段、提交 payload、chips、弹窗状态
- delete：弹层 role/aria-modal/name、初始焦点、Tab 轨迹、关闭钮名称、Esc 行为、焦点返回
- checks：每条断言的 PASS/FAIL/WARN + 数值

## 不变量与等级

> 版本：`2026-11-10.2`。`severity` 是回归 tripwire，不是产品定级；memo 必须按
> `frontend-ui-reviewer` 的 P0/P1/P2 规则重判，并写明用了哪条链路。

| ID | 等级 | 断言 |
|---|---|---|
| `target-top-gap` | P1 | target top − `.unified-tab-content` top ≥ 4px（硬底线） |
| `target-top-gap-token` | P2 warn | 4px ≤ gap < `--page-top-gap`（默认 8px）→ 契约漂移 |
| `hover-top-boundary` | P1 | hover top − 同状态祖先 top ≥ 4px，且 hover top 不低于祖先 top |
| `hover-top-gap-token` | P2 warn | hover gap 在 4px 与令牌之间 |
| `hover-hit-target` | P1 | hover 顶边 `elementFromPoint` 命中 target/子树 |
| `static-hit-target` | P2 warn | 静态顶边命中 target |
| `row-height-evidence` | P1 | 同排控件样本数 > 0（selector 漂移 fail loud） |
| `row-height-family` | P2 warn | 同排高度 spread ≤ 2px（保留容差，等高/中线裁决未编号） |
| `capture-source-ref` | P1 | 清空字段后 payload 不得仍带 `source_ref` |
| `capture-expected-finish` | P1 | 清空字段后 payload 不得仍带 `expected_finish` |
| `capture-stale-chips` | P2 warn | 字段清空后 chips 不得继续显示为将提交值 |
| `capture-dialog-close` | P2 warn | 成功提交后弹窗关闭 |
| `states-counts-error` | P1 | counts 失败时页头不得显示 0 且无错误提示 |
| `states-no-match` | P1 | 筛选无结果不得显示全局“收件箱为空” |
| `states-bulk-pagination` | P1 | counts > 渲染行数时必须出现“已显示/总数”或分页 |
| `states-responsive-detail` | P1 | 1366 隐藏的提出人/期望窗口必须在只读详情承接 |
| `triage-start-divergence` | P1 | 行有 `expected_start` 时，弹窗开始日与提交 payload 不得为空/回落 |
| `triage-note-consistency` | P1 | 行有 `expected_start` 时不得显示“不生成阶段” |
| `triage-finish-prefill` | P2 warn | 弹窗期望结束日与行值一致 |
| `triage-dialog-close` | P2 warn | 转换成功提交后弹窗关闭 |
| `delete-role` | P1 | `role=dialog|alertdialog` |
| `delete-modal-isolation` | P1 | `aria-modal="true"` 或背景兄弟均 `aria-hidden/inert`（Radix `hideOthers` 等价） |
| `delete-aria-modal-attr` | P2 warn | `aria-modal` 缺失但背景已隔离；记录为属性缺口 |
| `delete-name` | P1 | 可访问名来自 `aria-label` 或解析后的 `aria-labelledby` 文本；不用 heading fallback |
| `delete-initial-focus` | P1 | 初始焦点在弹层内 |
| `delete-focus-contained` | P1 | Tab 不离开弹层 |
| `delete-close-name` | P1 | 关闭钮有可访问名 |
| `delete-close-size` | P2 warn | 关闭钮 ≥ 44×44（项目触控令牌） |
| `delete-close-name-locale` | P2 warn | zh-CN 下关闭钮名应为“关闭” |
| `delete-escape-closes` | P1 | Esc 可关闭 |
| `delete-focus-return` | P2 warn | 关闭后焦点回到触发按钮 |

P1/P0 失败 → run `fail`；只有 P2/ warn → `warn`；否则 `pass`。
`--expect-fail` 在 `fail` 时退出 0，用于 HEAD 复现与变异自证。

### 严重度校准（2026-11-10 独立评审）

首轮盲评的页面定级是正确的：录入按钮贴边 **P2**、清空字段仍提交 **P1**、
删除确认 a11y **P1**。第二轮 pilot memo 把前两者升为 P1/P0，缺少“错值进入持久化决策输入
且提交前无同屏纠正”的完整链路，属于通胀。规则：

1. **P0** = 可复现 + 错值进入持久化决策输入/不可逆动作 + 提交前无同屏纠正；
   任一环不在 bundle/源码，最高 P1。
2. **P1** = 阻断一种输入模态完成关键任务、静默丢失/重复、或契约级 a11y 失败。
3. **P2** = 视觉/规范偏差或可恢复默认值。
4. 同证据必须同链路；更长的伤害链只有在额外环节被举证时才算数。

## 只读保证

- `runner.mjs` 对所有 `/api/**` 写请求返回 503，并记录到 `meta.blockedWrites`。
- scenario 需要提交表单时，用 `session.mock(method, pathname, handler)` 注册 browser-only mock；
  请求不会离开浏览器，也不允许 handler 调 `route.continue/fetch`。
- GET 默认从 fixture 读取；fixture 缺失会 `abort` 并在 `page-errors` 里报
  `Missing read fixture <key>`，不会静默走真实库。
- `--fixture none` 是唯一显式 live GET 开关。
- **例外**：`/api/auth/*` 走真实 API（登录需要真实 token）；当前 build 的
  `loginByPersonId` 只 SELECT + JWT，不写库，但这部分不在 `requests/blockedWrites` 里。
  `meta.auth` 记录 personId/userName，不记录 token。
- 没有 seed、没有写库、没有改源码。

### 失败模式

- `--only` 为空（如 `--only ,`）→ 直接报错退出 1，不会产生 0/0 PASS。
- 导航失败、step 抛错、fixture 缺 key → 仍写 `evidence.json` + `summary.md`，
  在 `meta.stepErrors` / `page-errors` / `step-errors` 中给出诊断。
- 未注册 mock 的写请求 → 503 拦截 + `unmocked-writes` WARN；capture 步骤因拿不到
  mock request 直接 P1 FAIL。

## 验证结果（2026-11-10，invariants `2026-11-10.2`）

| 场景 | 结果 | 耗时 |
|---|---|---:|
| HEAD `9f70977` target | `top=100`、`hover=99`、`matrix(...,-1)`、`elementFromPoint=tab list`、高度 `44/44/40/44` → 3 个 P1 FAIL + 1 个 P2 WARN | 4.6s |
| HEAD `9f70977` all（29 checks） | **17 blocking + 5 warnings**；target 3 P1、capture 2 P1、delete 6 P1、states 4 P1、triage 2 P1 | 19.4s |
| 工作区（CSS + Radix）target | `gap=8`、hover 无位移、`elementFromPoint=target`、高度 `40/40/40/40` → PASS | 3.4s |
| 工作区 `--inject hover-lift` | hover top=98、`-10px`、命中 tab 栏 → FAIL（`--expect-fail` 退出 0） | 4.1s |
| 工作区 Radix ConfirmDialog | role/isolation/name/初始焦点/焦点圈禁/关闭钮/Esc PASS；`aria-modal` attr、32px 关闭钮、英文 Close、焦点返回 4 个 WARN | 4.3s |
| 工作区 all（29 checks） | **8 blocking + 5 warnings**；target 全绿；capture 2 P1；delete 4 P1 全绿；states 4 P1、triage 2 P1 | 16.6s |
| 工作区 `--only states,triage` | 6 个 P1 FAIL（counts 0、全局空态、209 无分页、1366 详情缺字段、triage start/note） | 14.1s |
| I01f–I01h 修复后 all（28 checks） | **28/28 PASS，0 blocking 0 warning**（aria-modal 补齐后 attr 断言不再产生）；期间 fail-loud 捕获一次真实回归（默认请求多带 page=1 → Missing read fixture） | ~17s |
| 纯不变量 selftest | 好证据全绿；hover 位移、去 role、去 name、无 isolation、焦点逃逸、清空后仍提交、空 row、counts 0、全局空态、209 无分页、详情缺字段、triage 分叉 → 红 | <1s |

端到端复测：同一张截图、只给 `summary.md` + `evidence.json` 再派一次盲评，
**5m46s**（首轮 25m39s），50 回合、64 次调用，工具仅 16.2s，输出 3 条发现 + 2 个裁决。
独立校准评审认为该 memo 把 capture 升 P0、按钮贴边升 P1 属于通胀；首轮 P2/P1/P1 正确。

## 当前限制

- 已覆盖 intake 的 target / capture / delete / states（counts 失败、筛选无结果、209 行、1366 详情）/ triage（G-01 字段分叉）；没有 reject、loading、stale、深色、1600、中英切换、并发双击。
- states / triage 用内存 fixture patch + browser-only mock，不改库；这能复现 UI 行为，但不证明服务端真实排序/分页/回落。G-01 的“实际生成阶段”仍需评审员读 `IntakeConversionService.ts`。
- 只跑 1366×900 / light；深色与 1600 需要多跑几次或加 matrix 步骤。
- fixture 只有 3 行；209 行是 mock 场景，不是真实 API 分页。
- 不判断业务语义。例如 G-01 的“服务端回落生成阶段”需要评审员读 `IntakeConversionService.ts`；
  bundle 只提供 UI 文案 + POST payload。
- 阈值是两级：4px 硬底线 + `--page-top-gap` 契约 WARN；`row-height-family` 用 2px 容差且仍是
  WARN（等高/中线裁决未编号，避免与计划里的 D-05 冲突）。
- 弹层焦点圈禁用 `m.contains(active)`；未来 triage 弹层里的 Radix Select portal 可能误判，
  需要改为 `aria-hidden/inert` 祖先判定。
- 证据本身可能假绿：selector 漂移、fixture 缺失、断言写错。runner 已 fail-loud，
  但每个新 step 仍需变异自证。

## 加一个 step

在 `scripts/lib/ui-evidence/scenarios/intake.mjs` 里加：

```js
{ id:'reject', run: async ctx => captureRejectDialog(ctx.session.page) }
```

然后同步 5 处：

1. `probes.mjs`：采集函数
2. `invariants.mjs`：`checkReject()`
3. `invariants.mjs` 的 `evaluateAll()`：把 `reject` 注册进 selected step
4. `summary.mjs`：新增该步骤的摘要段
5. `invariants.selftest.mjs`：加好/坏两组样例

新增或改变断言后，把 `INVARIANTS_VERSION` 加一档。不要在 scenario 里写断言。

## 接入 UI 评审

主代理：

1. 启动被测版本 + 临时库（如需）
2. 跑 `--only target`，先确认圈注对象
3. 需要更多证据时跑 `--only all` 或指定 step
4. 把 `summary.md` + `evidence.json` + 截图 + 3–5 个源码文件交给评审员
5. 评审员输出 ≤3 条发现的 pilot memo；全量审计另开任务

评审员：

- 先读 `summary.md`；按需用 `jq` 查 `evidence.json`
- 不再手写一次性 Playwright 探针
- 缺证据时写“需要补充 step”，不自行造脚本
- 业务语义结论仍要回源码举证
