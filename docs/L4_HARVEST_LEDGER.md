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
| 3 | scenario 系统性 helper | 修一处 setup 路径 → 预期 ~45 败一次性转绿或转可读 | 待做 |
| 4 | 陈旧登录态 + created_by 加固 | 服务端 req.user.id 优先 + 测试登录锚定种子人 | 待做 |
| 5 | export-scenario hook + 选择器漂移 | 逐套件现代化 | 待做 |
| 6 | 长尾 12×1 + flaky 3 | 逐个定性 | 待做 |

进度：摸底完成；切片 1、2 完成（main 侧 25→21 败，其中 2 个真产品修复）。
