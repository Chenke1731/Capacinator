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

## 2026-09-24 追加：全项目审视——安全债（Owner 决定推迟）与结构债

三路审查（后端 / 前端 / 测试与仓库卫生）结论归档。**Owner 决定（2026-09-24）：安全项全部推迟到项目成熟后再修，当前优先功能；监听 0.0.0.0 为有意配置（局域网访问），不是缺陷。** 本节为接手时的修复清单。

### S1 安全债（推迟中，接手时优先级最高）

1. **测试端点无守卫**：`/api/test-data`、`/api/test-context` 批量 DELETE，无 `NODE_ENV` 守卫、无认证，无条件挂载（`src/server/api/routes/test-data.ts:8-14`、`routes/index.ts:84-87`）。叠加 0.0.0.0 监听 = 局域网内任意进程可清空数据库。最小修法：路由挂载处加 `NODE_ENV !== 'production'` 守卫。
2. **业务端点无认证**：37 个路由文件仅 auth/sync 两个挂 `requireAuth`；登录无密码（`auth.ts:14` `loginByPersonId`，知道 personId 即得 token）。修法：JWT 基础设施已存在（authMiddleware 质量好），需铺开 + 登录加凭据。
3. **审计链路因此失效**：无认证 → `audit_logs.userId` 对绝大多数写操作为空。
4. **无速率限制**：全后端无 express-rate-limit。

### S2 结构债（增量消化，不需一次性偿还）

- API 信封规范落地约 20%（179 处 `.json()` 仅 35 处合规）→ 按"触碰即迁移"策略继续；前端 69 处防御解析随之消解。
- ExcelImporter V1/V2 双轨约 2600 行（V1 仍作 `analyzeImport` 回退，`ImportController.ts:663`）。
- 前端五套表格实现并存（DataTable/AssignmentTable/UnifiedTabComponent/ProjectsTable/DetailTable）。
- `Scenarios.tsx` 1676 行巨型页面组件；场景状态三个事实源（ScenarioContext + WorkingScenarioContext + api-client 拦截器直读 localStorage `api-client.ts:182`）。
- queryKeys 工厂已覆盖 218 处，仍有约 33 处内联 key（本轮已修 2 个由此产生的真实缓存 bug）。
- **migration 不可变缺 CI 守卫**：024 号 migration 曾被后续提交追加逻辑（对已跑过的库不生效，新旧库 schema 漂移）。建议加"migrations/ 目录 diff 即 fail"的 pre-commit/CI 检查。
- 类型错误预算漂移：基线 571，实际 576（2026-09-24 本轮清理后 573；第三轮修掉 ClipboardList 后回到 571=基线整）。**预算升级建议（D13 教训）：TS2304/TS2552（cannot-find-name）是运行时雷不是风格债，预算脚本应把它单列为零容忍类**——ClipboardList 在 572 错误堆里躺到 e2e 才炸出整页崩溃。
- Electron 5 个 main 变体共 1897 行 .cjs 存在重复。

### 2026-09-24 第二轮发现（e2e webServer 迁移过程中）

- **D9（P1）Projects 页 main 空渲染 → 已解决（当日）**：三层根因叠加——① `test-helpers.ts` navigateTo 硬编码 3120（测试流量一直打 dev 世界，helpers 扫描漏了 utils/ 目录）；② Projects 页已改造成 tab+div 网格界面（"真表格改造"），无 `<table>` 元素，断言过时；③ 修后确认页面渲染完美（"3 requirements · 2 AR" + 搜索 + 过滤），产品代码无辜。修复：navigateTo 改 baseURL 相对路径 + 断言改 tabpanel。**同族端口硬编码共 8 处一并清理**（utils/fixtures/suites/examples 全扫）。
- **D10（P2）flaky "no console errors" → 已解决（当日）**：真凶是 vite HMR websocket 硬编码 `wss://local.capacinator.com:443`（nginx 开发拓扑），无该环境时握手超时产生 console error（时序性=flaky）。修复：`VITE_E2E=1` 时禁用 HMR（webServer 注入，日常 nginx 开发流不受影响）。附带：Fredoka One 字体本地化（去掉 fonts.gstatic.com 运行时依赖）+ 删除 isolated config 全局污染头 X-Test-Environment（全库无消费方）。
- **D11（P2）fixture profile-select 噪声**：authenticatedPage 的选人流程偶发卡 `#person-select` 30s（元素存在、冷启动时序问题），超时后"继续 anyway"不阻塞但拖慢测试。待查：people 查询在多 worker 并发冷启动下的挂起路径。
- **D12（P3）scenario 套件时长帽 → 已解决（2026-09-24 第三轮）**：D11+D13 修完全量实测 75 测 11.9 分钟（30 分钟帽余量充足；会话起点为 65 败/15 过、每败测烧 10-30s 超时）。教训仍有效：长套件输出勿用 tail 管道，会吞掉 error 详情。
- **D13（P2）scenario 套件 selector 现代化 → 已完成（2026-09-24 晚，第三轮）**：全部 12 个 scenario-* spec（76 测）对齐当前 UI。深挖出**五个**连带缺陷一并修复：① **vite 代理端口泄漏（P1 级）**——两个 playwright 配置的 vite webServer 均漏传 `PORT=3111`，`client-vite.config.ts` 的 `/api` 代理静默回落 3110 dev 后端，e2e 页面读写的一直是 dev 数据（此前 smoke 全绿纯属 dev 栈在线时的巧合；浏览器发起的写操作本可能污染 dev 库，幸好均停在提交前）。修复：两配置 vite env 补 `PORT: '3111'` + vite 配置处注释。② **branchFromParent 空 world 产品缺陷**——e2e 种子把基线 assignment 放在 `scenario_project_assignments` 而 `project_assignments` 为空，旧拷贝逻辑只读后者 → 对基线建分支得到空分支（UI 同样命中）。修复：union 两源 + 按 key 去重 + base_assignment_id 仅在真实来源时携带（防悬挂 FK）。③ **e2e 种子与类别映射脱节**——Projects 需求台按 `categoryOfTypeName`（中文类型名前缀）过滤，种子英文类型名全部落空 + 种子项目缺 `project_type_id` → e2e 世界需求台永远 0 行。修复：类型名加 `需求交付-` 前缀 + 3 个种子项目补 `project_type_id`。④ **comparison 失败静默**——对比 API 500 只 console.error，用户点击无反馈。修复：Alert(role=alert) 呈现错误（i18n en/zh）。⑤ **ReportsTabContent 的 ClipboardList 未导入（运行时崩溃）**——`TS2552` 早已在 572 错误基线里躺着被预算容忍，capacity 报表出现 AVAILABLE 行动按钮路径一执行就 `ReferenceError` 炸整页（无 error boundary，页面残骸只剩一个数字）。e2e 把它炸了出来；修复：补 import。**教训：typecheck 错误预算里混着的 TS2304/TS2552（未定义名）不是风格债，是等着爆炸的运行时雷——预算应把 cannot-find-name 单列为零容忍类。**测试侧：全部 spec 迁到项目 fixtures（9 个裸 `@playwright/test` 导入是登录烧 30s 的根源）、`people.primary_person_role_id` 是 person_role 联表 id 不能当 assignment role_id（FK 500）、`/api/project-types` 列表不带 sub_types 数组（用 `/api/project-sub-types`）、`.modal-content`/`.scenario-comparison-modal`/`.data-table`(assignments)/`.assignments-page`(仅 CSS) 全是死锚点已换 role/结构锚。删除：`scenario-edge-cases-updated.spec.ts`（4/6 与 edge-cases 重复，2 个独特测试已并入）、`corruption-prevention.spec.ts`（引用未定义变量 scenarioUtils/modal/waitForSync 的僵尸文件，无任何配置匹配）、配置里 firefox/mobile 死项目与重复 workers、`test:scenarios:corruption` 死脚本。**workers 1→2 已落地**（11.9m → 6.4m，-46%）：前提是全套迁到前缀隔离 API 造数 + 不再造测试 baseline（DELETE 端点拒删 baseline，泄漏的测试 baseline 会抢走 ScenarioContext 的首个-baseline 自动选择、清空后续文件的页面——本文件两处轮换污染源均已根除）；跨文件陈旧列表竞态用"按钮/选项不在则重载重试"守卫治愈（aware-reports 私有 helper 与 ScenarioTestUtils.switchToScenario 双侧）。另注：`DELETE /api/scenarios` 对带子场景的父级同样拒绝（先删子再删父）。

query-key 双轨致 2 个缓存 bug（PersonNew 过期读、ProjectTypesTable 双 invalidate 自救）；`test:scenarios`/`test:scenarios:unit`/`test:scenarios:all` 死链（引用不存在的 `jest.scenario.config.js`，其宿主脚本还调用不存在的 `test:db-health`）；`/api/projects/debug` 调试端点残留；死代码约 2.9k 行（ProjectPhaseManager 992+css、TestModal、ui/Modal 三件套、AuditService.improved 446、旧 errorHandler + 各自配套测试、seeds `.old`/`.disabled`）。
