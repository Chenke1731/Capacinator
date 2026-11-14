---
name: ui-review
description: Capacinator 前端评审调度协议。用户说「UI 评审 / 交互评审 / 界面评审 / 设计评审 / 验收走查 / ui review」或要求对新页面/新控件做交付前评审时使用：调度只读子代理 frontend-ui-reviewer，产出证据分级、[GUARD]/[DECISION]/[NIT] 分类的评审报告，并把发现转成守卫任务或台账裁决。
---

# /ui-review 调度协议

评审本体由只读子代理 `frontend-ui-reviewer` 执行（见 `.zcode/agents/frontend-ui-reviewer.md`）。主代理只负责**材料准备、盲评调度、结果落地**，不代替评审员下结论。

## 何时用

- **design 阶段**：新页面/新控件/新交互的方案、截图、状态矩阵评审（写码前）。
- **delivery 阶段**：交付前对 diff 或运行页面评审。
- 用户说"看看这个设计/这个页面有没有问题"但未给根因时，默认走本协议（盲评）。

## 调用契约

```
/ui-review <target> [--stage design|delivery] [--profile <verify-states profile>] [--shot <png>] [--evidence <dir>]
```

- `target`：路由（如 `/projects?tab=intake`）、组件/文件路径、或 `diff`（当前工作区变更）。
- `--stage`：默认 delivery；方案/截图阶段用 design。
- `--profile`：页面在 `scripts/lib/ui-profiles.mjs` 已注册时填，评审员会跑 `verify-states`。
- `--shot`：已有截图时传入路径（评审员用 `npm run shot` 做机器量测）。
- `--evidence`：Evidence Bundle 目录（含 `summary.md` / `evidence.json` / `shots/`）。

## Evidence Bundle（MVP，2026-11-10）

delivery 阶段的确定性取证先跑：

```bash
node scripts/collect-ui-evidence.mjs --scenario intake --only target \
  --base http://127.0.0.1:3121 --api http://127.0.0.1:3111 \
  --out /tmp/ui-evidence/head --label HEAD-<sha>
```

当前覆盖 intake 的 target / capture / delete / states / triage；一次运行约 3–20 秒。证据包是只读取证：
GET 走冻结 fixture，写请求全部拦截，scenario 只允许 browser-only mock。
详见 `docs/ui-review/evidence-bundle.md`。

规则：

- 有 bundle 时，评审员**不得**自行启动浏览器或写一次性 Playwright 探针；缺证据只列“需要补充 step”。
- 主代理先跑 `--only target` 确认圈注对象，再按需跑 `--only all`。
- bundle 只提供证据，不替代业务语义判断；服务端回落/产品裁决仍要回源码与台账。

## 调度步骤（主代理）

1. **收材料**：确认 target/stage；缺截图或路由时先补（`npm run shot` 或让用户提供）。delivery 阶段优先准备 evidence bundle（`--only target`）。材料不足不猜。
2. **盲评**：派发 `frontend-ui-reviewer` 子代理，只给：
   - target、stage、材料路径、profile（如有）、evidence bundle 路径；
   - 明确要求读 `docs/ui-review/experiences.md` 与 UI 契约；
   - **不要**把你的根因猜测、修复方案、上轮结论写进 brief（防止确认偏误）。
3. **等待报告**：子代理只读（无 Edit/Write），网络 GET-only；不得改工作区。
4. **落地结果**：
   - `[GUARD]` → 进守卫待办（附断言草案 + 变异自证要求）；
   - `[DECISION]` → 进 `docs/plans/2026-10-14-capacinator-improvement-plan.md` §7 台账或请用户裁决；
   - `[NIT]` → 记录，不阻塞。
   - **豁免证据纪律**（2026-11-14，吸收外部设计 skill 的 waiver 协议）：任何豁免/缓报必须附 **guard evidence（断言/量测/截图）+ 本页特定理由**；模板化、<24 字或跨页复用的理由无效。**同一族豁免连续三次 → 升级为契约条款（家规化）**，不得继续按例外处理。
5. **经验回写（需用户批准）**：评审员只能输出 `EXP-NEW` 候选；由主代理写 `docs/ui-review/experiences.md` 并跑 `npm run verify:ui-review`。

## 输出（转发评审员报告，不二次加工结论）

必须包含：问题清单（含证据列）、候选不变量、需要裁决、命中经验/新经验候选、需要补充材料、本次未覆盖。

## 边界

- 不评审后端实现/数据库/接口；界面数据一致性可以质疑并要求举证。
- 不用 AntD/Element 默认值否定项目已裁决差异（44px 触控、密度、暗色非取反）。
- 不重复机器可判项（对比度/命中/遮挡/越界/贴锚）；机器漏判 → `[GUARD]`。
- 评审员不改代码；主代理也不得把"评审"变成"顺手改掉"。

## 领域清单（评审员必查，详见评审员提示词）

收件箱/捕捉、需求台 SR/AR、8 态生命周期、池/实名、批量范围、场景分支/合并、容量分段/峰值、人员停用、迭代/路线图、导入/回填、跨页术语与单位、双主题/双视口、44/40 高度族、hover 位移边界、Tailwind 分层、全局元素规则、**数据可视化八条（单轴/强调/基线/形状/构造/四态/动效/真实性，见契约 §数据可视化契约）、数据区四态、文案四条（动作名链路/错误可修/空态动作/用户语言，见契约 §界面文案契约）、交互与状态六条（IME 组合态/错误摘要/路由焦点/截断全文/只读≠禁用/加载CLS，见契约 §交互与状态判据）**。

## 试点验收（首次使用）

拿「录入按钮贴边」事故做盲评（只给截图 + URL + stage，不给根因）。通过标准：

1. 独立复现：零间距（tab.bottom=100 / toolbar.top=100）、44 vs 40 高度族、hover `translateY(-1px)` + 阴影越界；
2. 定级 P1/P2（无数据伤害，不许通胀）；
3. 产出 `[GUARD]` 断言草案（悬停矩形不越祖先边界 + 同排等高）；
4. 不报 AntD 式伪问题；
5. 报告可直接进 §7 台账。

续留指标：每 2 次评审 ≥1 条被采纳不变量；`[GUARD]` 占比 ≥30%；误报率 <30%。
