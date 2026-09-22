# 开发顺畅度审计报告（2026-09-22）

焦点从 UI 转向开发体验本身：测试、架构、代码卫生、类型安全、API 一致性。
结论先行：**最大的开发摩擦——"全量测试常年 21 红"——不是环境问题，是一个可修的语法冲突，本轮已修**，server 侧测试全绿。

## 已当场修复

### F1（P0）"21 个环境性预存失败套件"的真因：knexfile ESM 惯用法撞 Jest CJS 变换

- `src/server/database/knexfile.ts` 用 `const __filename = fileURLToPath(import.meta.url)` 声明路径
  （ESM 惯用法），而 Jest 把 server 测试按 CJS 变换——`__filename` 已是注入全局（Identifier 重声明）
  且 `import.meta` 是语法错误。**所有 import 链到达 knexfile 的 server 测试套件全部跑不起来**，
  被误记为"环境性、不可修"。
- 修法：tsx 的 ESM 加载器本身垫片 `__dirname`，直接用它——运行时（tsx ESM）与 Jest（CJS）双环境安全。
- 战果：**21 红 → 5 红**；server-unit / server-integration 全绿；全量 4249 项通过。

### F2（P0）ProjectsController 测试与实现漂移 + mockDb 缺链式方法

- `mockDb` 缺 `clone/clearSelect/clearOrder`（getAll 的 count 查询用它构建）→ 3 项测试全断；
- getAll/getById 后来加挂了 tags/staffing/estimations/warnings 查询序列，测试队列没跟上。
- 修法：mockDb 补三个链式方法；测试队列按真实查询顺序对齐；期望值补 `staffing_summary`/
  `pool_demands`/`lifecycle_warnings`。→ 31/31。
- **教训**：控制器加查询时必须同步测试队列——这是 getAll 挂 staffing_summary 时漏掉的债。

### F3（P1）CSS 同名类互覆盖 ×5 + 加载顺序依赖（UI 审计轮已修，记录归档）

- 五个文件各自定义 `.empty-state`（硬编码灰不同）、Import.css 压过 Dashboard.css（加载顺序）。
- 修法：全部统一 `var(--text-secondary)`，谁赢都一样。此类问题的长期解见 D6。

## 发现待裁决

### D1（协作纪律）并行会话 WIP 滞留工作区

发现时工作区有另一会话的未提交 WIP（Projects.tsx/ProjectModal/i18n/ProjectsController + 未跟踪的
058 迁移与 walkthrough 脚本），且 main 已推进两个新提交（6fc04ba 列宽拖拽、3c7e51b 真表格改造
batch1）。它造成两个测试用例临时红（其 WIP 自身状态）。**建议：会话结束前提交或收摊到分支**，
否则任何全量测试/守卫的结果都不可信。本轮我的提交只含测试基建三文件，未触碰该 WIP。

### D2（P1）客户端 4 个真环境性失败套件（12 项）

i18n（localStorage jsdom 2 项）、date/dateUtils（时区）、PersonDetails.utilization-timeline（1 项）。
修法建议：jest setup 固定 `TZ=Asia/Shanghai` + localStorage polyfill；修不动的显式 `it.skip` 带原因注释，
让全量恢复"零噪音红"。修好后可把"预存红"概念从手册里删除。

### D3（P2）仓库卫生

- 3 个 `.backup` 控制器文件入库（Assignments/Projects/ReportingController.ts.backup）→ 删（git 有历史）
- 51 处非测试 `console.log`、4 处 TODO
- `i18n-verification/` 遗留目录、`tests/visual/__screenshots__/*.diff.png` 未 ignore（本轮已加 ignore）
- 根目录 `version.json`/`jest.config.cjs` 双配置并存（见 D9）

### D4（P2）类型安全：284 处 `any`（非测试）

集中在 Projects.tsx（`project: any` 一路裸奔）等页面。建议增量策略：新代码禁 any；
触碰旧文件时顺手收窄到已有 `Project` 类型；不搞一次性大改（风险大于收益）。

### D5（P1）API 信封不一致：客户端 20 处防御性解析

`Array.isArray(payload) ? payload : payload?.data || []` 出现 20 次=客户端不信服务端形状
（有的端点返回裸数组、有的 `{data}`、有的 `{data:{data}}`）。这是共享键投毒防御的由来。
建议：服务端信封统一 `{ data, pagination? }` → 客户端删防御代码 → 共享类型（shared/types）
重建后由 tsc 把关。

### D6（P2）CSS 架构：26 个文件、210 个 !important、跨文件同名类

同名类互覆盖（.empty-state×5/.badge-gray×2 已实际咬人两次）。长期解：组件级 CSS Modules 或
`@scope`，或至少轻量命名空间约定（`.people-`/`.pd-` 前缀）。210 个 !important 多为对抗全局
button 规则——若全局元素规则收敛为 utility 类，!important 可大幅消解。

### D7（P2）未根因的权宜之计

people 名字链接的颜色来自一条"找不到的规则"（样式表遍历无命中、非内联、非继承），当前用
`.person-name .name { color: var(--primary-text) !important }` 压制。待查：Tailwind v4 层级
注入或动态样式。留档防止遗忘。

### D8 沿用已知择期项

InlineEdit/EditableCells 收敛、TanStack Table 启用（下一表格页）、Radix 优先红线。

## 数字总览

| 指标 | 值 |
|---|---|
| 红套件 | 21 → 5（server 全绿；余 4 客户端环境 + 1 并行 WIP） |
| 全量通过项 | 4249 |
| any（非测试） | 284 |
| 防御性信封解析 | 20 处 |
| 非测试 console.log | 51 |
| CSS 文件 / !important | 26 / 210 |
| .backup 文件入库 | 3 |
