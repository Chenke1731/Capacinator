# 变异审计：workCalendar（2026-11-14）

- 关联：I19f；方案 `docs/plans/2026-11-14-tooling-efficiency-plan.md` §P2-1
- 工具：`@stryker-mutator/core@10.1.1` + `@stryker-mutator/jest-runner@10.1.1`
- 配置：`stryker.config.mjs` + `jest.stryker.config.cjs`
- 目标：`src/server/services/calc/workCalendar.ts`
- 命令：`npm run mutation`
- 原始报告：`reports/mutation/workCalendar.html`、`reports/mutation/mutation.json`（本地，gitignored）

## 结果（增量重跑后）

| 指标 | 值 |
|---|---|
| Mutation score | **85.50%** |
| Killed | 107 |
| Timeout（按 killed 计） | 5 |
| Survived | 19 |
| No coverage | 0 |
| 总 mutants | 131 |
| 运行时间 | 49s（增量） |

## 说明

- 首次运行 75.57%（31 survived）；补了两类反例测试后升到 85.50%：
  - 非法/倒置输入（空串、非日期、`undefined`、倒置区间）；
  - `intersectDateRange` 的裁剪/无交集/单侧缺省窗口。
- 剩余 survived 主要集中在 `intersectDateRange` 的窗口比较边界与 `parseDate` 的字符串形态分支；属于“测试可再加、但不影响当前口径”的候选，不阻塞。
- 这是**手动、无排期、无 CI、不 break** 的定向审计，不是常设变异门禁；季度化需先修订 `TEST_FRAMEWORK_DESIGN.md` §5.3。

## 复跑

```bash
PATH=/root/.nvm/versions/node/v22.23.1/bin:$PATH npm run mutation
```

首次冷跑约 3m30s；增量约 50s。报告不提交仓库，摘要入库。
