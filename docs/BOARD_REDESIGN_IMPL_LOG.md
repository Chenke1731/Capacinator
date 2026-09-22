# 需求台重构 + 迭代域 实施日志（2026-09-23 夜间自主模式）

依据: docs/BOARD_REDESIGN_2026-09-23.md (设计契约)。
用户授权: 全批实施、静默、遇决策点自组多角色评审并留记录、自行演进。

## 决策记录（格式: D# [问题] → [裁决] → [理由/评审]）

- D1 演示数据归属: 设计 063d 把 demo 种子放迁移; 实施改为——迁移只种
  **字典**（MDE 角色），demo（迭代/粗估分量/主投入/挂接）放
  reset-demo-lifecycle.sql（可重跑）。理由: 迁移一次性,演示数据需要
  守卫前反复重置;字典与演示分离符合既有 reset 模式。
- D2 新列组件文件: SE/MDE/实名投入/迭代选择等新格件放
  client/src/components/boards/BoardCells.tsx,避免 Projects.tsx
  （已 1000+ 行）继续膨胀。理由: 文件职责(页面骨架 vs 格件)分离。
- D4 reset 脚本事故与恢复: "防御清引用"误写 DELETE FROM projects 删掉三个演示
  项目,从迁移前快照(/tmp/cap-pre063.db)全量恢复(含子表);另发现一字之差
  ("门户首页改造/改版")导致三条 SQL 静默空转——教训: 幂等脚本的静默 no-op
  必须靠事后 SELECT 验收兜底。
- D5 se/mde 分量写入策略: 首次创建分量记录时 estimated_design_pm=分量和;
  后续更新只写分量列,总量列不动(避免覆盖详情页语义)。
- D6 IterationsController 集成测试弃用: 控制器 import 链拉起全局库模块,
  jest 进程级崩溃(tarn aborted);统计口径抽 IterationStats 纯函数单测覆盖,
  CRUD 由 curl 冒烟 + B4 无头覆盖。
- D7 【重大】根 tsconfig include 仅 src/**+shared/**——client 从不在
  typecheck 覆盖内,客户端所有 "typecheck ✓" 均为假阴性(今晚实际靠 vite
  运行时+playwright 抓错)。待办: 建 client tsconfig 并入 typecheck 脚本。
- D8 父任务并行合流: 487b3ce(标签 B 案)与 226a4a2(列宽 cap 体系)已在库,
  B3a 在其上重构;标签列已消亡(名称格内联),B3f 剩余范围=仅 ＋AR 迁移。
- D3 看板就地改 se/mde 粗估: 走 projects.update 白名单
  （se_estimate_pm/mde_estimate_pm）,服务端映射到最新设计粗估记录
  （无则创建仅含分量的记录）。理由: 看板编辑词汇统一走既有 update
  端点,前端无需感知记录结构。

## 批次进度

- [x] B1 迁移 063a-d + MDE 角色种子 + reset 重写
- [x] B2 API（迭代 CRUD+装载/白名单/看板 payload）+ 单测
- [x] B3a 列序+新列白板化(三断点实测过)
- [x] B3b 状态格重构(单胶囊 › 26px,死线出列)
- [x] B3c 交付计划格+迭代弹层(挂接/解除/内联新建/活刷新; D9 尾行只显区间)
- [x] B3d SE/MDE 弹层(工作量/派生窗口/推导占用%端到端: 0.3人月→23%)
- [x] B3e 实名投入(主投入互斥服务端前置清旧/窗口默认迭代/开发池收编; D11 次要列表延后)
- [x] B3f ＋AR 名称格(父任务 487b3ce 已做标签内联/管理器)
- [ ] B4 迭代导航页 v1
- [ ] B5 告警+生命周期吸收+守卫改版+全量回归
