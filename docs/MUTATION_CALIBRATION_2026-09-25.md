# 红线变异校准报告（2026-09-25）

设计 §5.3 承诺的击杀率报告与逃逸清单。本文件是健康度量表中"红线 P0 击杀率"的唯一遥测来源。

- 校准方法：人工注入 20 个代表性变异（四类故障模型），对红线套件跑 kill 轮次，绿=逃逸
- 校准时间：P3（commit 5ef48ed 后），裁决补杀：2026-09-25
- 基线：18/18 绿验证两轮后开始；所有变异跑完 `git checkout HEAD --` 还原

## 结果

| 故障类 | 校准轮 | 今日终态 |
|---|---|---|
| UI 锚点漂移 | 5/5 ✅ | 5/5 |
| API 契约变更 | 4/5 | **5/5**（M8 补杀） |
| 业务规则反转 | 3/5 | **5/5**（M14 补杀 + M18 归此类一并计） |
| 数据丢失路径 | 0/5 | **2/5**（M17/M19 补杀） |
| **合计** | **12/20（60%）** | **17/20（85%）** |

## 逃逸裁决（逐条）

| 变异 | 内容 | 裁决 | 依据 / 击杀条件 |
|---|---|---|---|
| M8 | 删除 assignment_date_mode 必填校验 | **已杀** | journeys 12a：缺省字段 → ≥400 |
| M13 | 分配弹窗默认 allocation 100→0 | **降级 L4 台账** | 展示路径已钉死（core test5 精确值 50）；弹窗创建路径 L4 crud/assignments.spec.ts 已自动化（填 slider+保存），但其断言是 rowCount>0（弱）。**重建触发器：触碰 AssignmentModalNew 时强化 L4 断言为精确值** |
| M14 | 删除 validateProjectSubType 调用 | **已杀** | journeys 12b：缺省 sub_type + 跨类型错配 → ≥400 |
| M16 | 删除 whereNot(change_type,'removed') 过滤 | **降级 L4 台账** | e2e 世界不可复现该状态（硬删除+默认 added，'removed' 行从未产生）。**重建触发器：种子引入 'removed' 行或触碰 demand/场景查询时补排除断言** |
| M17 | 跳过 UPDATE 审计写入 | **已杀** | journeys 17b 解除 skip（轮询 ≤3s）。补杀过程挖出两个真产品缺陷（见下） |
| M18 | 删除父场景删除保护 | 已杀（P3） | journeys 17a |
| M19 | 删除需求报表场景隔离 | 已杀（P3） | journeys 17c |
| M20 | 手动分配 combobox 流程破坏 | **降级 L4 台账** | L4 crud 弹窗测试已覆盖 combobox 全流程。**同 M13 触发器** |

## P0 判定

红线 P0 类（用户不可用级）要求 100% 击杀。裁决：**当前 3 个在逃（M13/M16/M20）均非 P0 类**——

- M13/M20 是 UI 输入便利性（默认值/选择器），API 契约已被 11/12/12a/12b 钉死，用户可见失败不存在
- M16 只在产品当前不可产生的状态（'removed' 软删行）下造成数据泄漏

**P0 类击杀率 = 100%，达标。** 三个降级逃逸挂 rebuild-on-touch 台账（上表触发器），非日历驱动。

## 校准挖出的产品缺陷（均为真 bug，已修）

1. **通知子系统三表从未有 migration**（email_templates / notification_preferences / notification_history）——通知功能在所有环境静默失败，每次分配写操作产生 SQL 报错噪音。修复：migration 065。
2. **配置冻结早于 env 加载**——services/logging/config.ts 模块顶层实例化 logger → getConfig() 在 dotenv 之前冻结 → AUDIT_ENABLED_TABLES 落到默认 5 表名单（缺 scenario_project_assignments 等）→ **分配/阶段时间线/合并冲突的审计事件在所有环境（dev/test/e2e）静默丢弃**。场景审计幸存仅因 auditModelChanges 路径不查名单。修复：src/server/env.ts 副作用模块，config/index.ts 首位导入。诊断全程有运行时实证（独立探针服务器 + 堆栈探针），非推断。
3. （此前已记）/projects/new 表单缺 sub_type 字段、People 页无删除按钮——债务台账在案。

## 收集账本历史（含错账事故）

| 时点 | main | scenario | 备注 |
|---|---|---|---|
| P0（2fa3e7a） | — | — | 守卫上线 |
| P4（53b7865） | **344（错账）** | 214 | 提交树实测 326（worktree 复测证实）。floor 在脏工作树中途采的，提交后无人再跑守卫——"接线没通电"事故 |
| P2/P3 后 | 347（漂移未记账） | 214 | +21 红线无人同步 ledger——守卫第一次实战抓获（第三方评审触发） |
| **今日** | **349** | 214 | +2 补杀测试；守卫已挂 pre-commit（spec/playwright 配置变更必跑，漂移双向拦截） |

P4 摸底账（来自 commit 53b7865 message，此前无独立文件）：main 580→344（scenarios -214，chromium -16 移入 api project，api -6 去重），scenario 73→214，吸收 141 条仅 scenarios project 收集的测试；零测试丢失；archived 僵尸两配置均 0 收集。

## 重跑条件（设计 §5.3）

红线结构大改时人工再来一轮，不日历驱动。上一轮：2026-09-25（P3 + 本次裁决补杀）。
