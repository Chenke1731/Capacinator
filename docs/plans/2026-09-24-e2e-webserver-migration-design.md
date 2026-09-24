# e2e 第二期设计：Playwright 原生 webServer 替换自研进程管理

日期：2026-09-24 ｜ 状态：待批准 ｜ 前置：一期端口隔离已落地（`250cb79`，e2e 拥有 3111/3122 + `.e2e-data/e2e-test.db`，dev 栈 3110/3120 已受守卫保护）

## 1. 背景与目标

一期消除了"e2e 杀 dev 栈"的事故类，但 e2e 基建自身仍带三个病灶：

| # | 病灶 | 证据 |
|---|---|---|
| P1 | teardown 阶段 playwright 进程被 SIGKILL，判词丢失、进程残留 | 2026-09-23 与 09-24 两次运行同位置 "Killed"；已排除 OOM（196GB 空闲） |
| P2 | 自研进程管理 1590 行，含危险的"复用他人服务"分支和端口清场逻辑 | process-manager.ts 480 / port-cleanup.ts 308 / e2e-global-setup.ts 604 / global-teardown.ts 198 |
| P3 | 纯 e2e 世界里页面近全白，profile fixture 等待 "Select Your Profile" 10s 超时 | `/tmp/profile-modal-error.png`；此前被掩盖是因为测试借 dev 栈跑（dev 库有真人数据） |

**目标**：P1、P2 用 Playwright 原生 `webServer` 一次性根治；P3 在迁移中顺带诊断修复（它阻挡 smoke 通过，不修则迁移无法验证）。

## 2. 现状分析

### 2.1 当前执行顺序（自研编排）

```
playwright 启动
 └─ globalSetup（e2e-global-setup.ts, 604 行）
     ├─ acquireLock（自研文件锁）
     ├─ Step1 initializeE2EDatabase ←──【纯冗余】后端进程启动时会 unlink+重建+seed
     ├─ Step2 探活 3122 → 没起则 Step3 起 e2e-backend(3111) + e2e-frontend(3122)
     │   └─ processManager.startProcess：cleanupPort(port) → spawn → waitForOutput 正则
     └─ Step4 浏览器冒烟（waitForApplication → verifyTestData → profile 处理）
tests 执行（fixture 层还有一套 profile/认证逻辑，见 §5）
 └─ globalTeardown（global-teardown.ts, 198 行）
     ├─ TestDataCleanup（按命名模式删数据）←──【新冗余】库本来就是每次重建的
     ├─ processManager.stopAll + releaseLock
     ├─ 端口二次清理（"still in use → forcing cleanup"）
     └─ auth state / PID 目录清理
```

### 2.2 冗余与风险点清单

- **R1 建库重复**：`init-e2e.ts:33` 每次 `initializeE2EDatabase()` 都 `fs.unlink(E2E_DB_FILE)` 后重建。globalSetup 建一次、后端进程启动再建一次（`index.ts:42-46`），前者必被覆盖。`waitForOutput: /E2E database initialized/` 等的正是后端自己打的日志。
- **R2 数据清理冗余**：库每个 run 都是新建的（R1），teardown 再按 `Test_`/`E2E_` 模式删一遍数据没有意义，反而引入了对后端的 HTTP 依赖（P1 的 "Killed" 就发生在这一段附近）。
- **R3 强杀清场**：`port-cleanup.ts` 的 SIGTERM→SIGKILL 逻辑 + teardown 的 "still in use → forcing cleanup"，是 P1 的头号嫌疑人（进程树互相误伤）。
- **R4 复用分支**：`e2e-global-setup.ts` 的"发现已有服务就复用"——一期后复用的是 e2e 自己的 3111（合法），但该分支语义模糊，是历史上借 dev 栈跑测试的通道。

## 3. 目标设计

### 3.1 执行顺序（官方托管）

```
playwright 启动
 ├─ webServer[0] 后端：npx tsx src/server/index.ts
 │    env: NODE_ENV=e2e, PORT=3111   url: http://localhost:3111/api/health
 │    （后端自己完成建库+seed——R1 的单次化）
 ├─ webServer[1] 前端：npx vite --config client-vite.config.ts --port 3122 --strictPort
 │    url: http://localhost:3122
 ├─ globalSetup（瘦身后 ~120 行）
 │    ├─ 环境变量（审计开关等，供测试读取）
 │    ├─ 可选冒烟：GET /api/health + GET /（失败即 fail fast，替代 waitForApplication）
 │    └─ （不再起任何进程、不再建库、不再拿锁）
 ├─ tests
 └─ 官方收尾：webServer 进程由 Playwright 保证收走（P1 根治）
```

### 3.2 具体配置（playwright.config.ts 追加）

```ts
webServer: [
  {
    command: 'npx tsx src/server/index.ts',
    url: 'http://localhost:3111/api/health',
    timeout: 90_000,               // 首次跑含建库+migration+seed
    reuseExistingServer: !process.env.CI,
    env: { NODE_ENV: 'e2e', PORT: '3111', FORCE_COLOR: '0', AUDIT_ENABLED: 'true' },
    stdout: 'pipe',                // DEBUG=pw:webserver 可查启动日志
  },
  {
    command: 'npx vite --config client-vite.config.ts --port 3122 --strictPort',
    url: 'http://localhost:3122',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
],
```

要点：`NODE_ENV=e2e` 使后端走 `init-e2e` 路径（`.e2e-data/e2e-test.db`，与一期对齐）；`reuseExistingServer` 本地为 true 是**合法复用**——只会复用 3111/3122 上的既有 e2e 服务（如手动 `npm run e2e:start` 起的后端），dev 栈端口不在其探测范围。

### 3.3 代码增删清单

| 文件 | 动作 |
|---|---|
| `playwright.config.ts` | + webServer 块（上例） |
| `playwright.scenario.config.ts` | + 同一 webServer 块（legacy global-setup.ts 假设"服务器已在跑"，加块后自洽）；installer config 不动（Electron 架构不同） |
| `e2e-global-setup.ts` 604 行 | **重写为 ~120 行**：删 lock/建库/起服务/waitForOutput/浏览器冒烟全流程，保留 env 准备 + 简单健康断言 |
| `global-teardown.ts` 198 行 | **重写为 ~20 行**：只删 `test-results/e2e-auth.json`；TestDataCleanup/processManager/端口强杀全删（R2/R3） |
| `process-manager.ts` 480 行 | **删除**（spawn/PID/waitForOutput/lock 全部被替代） |
| `port-cleanup.ts` 308 行 | **收缩为常量文件 ~30 行**：保留 `E2E_PORTS`/`DEV_PORTS` 与重叠守卫（它们是一期成果，多个文件引用），删 lsof/fuser/kill 实现 |
| `scripts/e2e-server.ts` | 保留不动（手动起停 3111 的入口，与 webServer 复用语义兼容） |
| 净效果 | **约 -1100 行自研进程管理代码** |

### 3.4 并发运行策略（原自研锁的替代）

不重建锁。理由：两个 playwright 实例并发时，后者 vite 因 `--strictPort` 立即失败、后端因 3111 EADDRINUSE 启动失败 → webServer 超时报**明确错误**，行为可预测且报错清晰，优于自研锁的静态文件锁（还有陈锁问题）。CI 串行跑无此场景。

## 4. P3（profile 超时）的诊断假设与验证顺序

**已确认事实**：① e2e 种子库有 4 人 3 项目；② Login 组件的 loading 态也渲染 "Select Your Profile" 标题（`Login.tsx:71`）；③ 认证门为 `{!isLoggedIn && <Login />}`（`App.tsx:89`），token 校验失败会清 storage 重弹登录；④ 截图近全白 → **Login 根本没渲染**，不是弹窗内部卡住。

**假设（按概率排序）**：
- H1 前端 JS 运行时错误致白屏（e2e 世界的某个 API 响应形状/数据触发前端异常，dev 库数据不触发）
- H2 vite 3122 服务起来了但代理后端未就绪/报错，页面壳渲染但 React 挂载失败
- H3 UserContext 挂起（token 校验请求永不返回，`isLoggedIn` 停在未定态）

**验证步骤（迁移前先做，产出决定修复方案）**：
1. 全量输出跑一次 smoke（不过滤），同时 `DEBUG=pw:webserver`，确认 verifyTestData 各端点结果；
2. 用一个 10 行的探针 spec 监听 `page.on('console'/'pageerror')` 后 goto('/')，抓白屏真因；
3. 按根因修复（H1 → 前端防御或种子修正；H2 → webServer url 换更严格的就绪判据；H3 → 后端 auth 端点排查）。

## 5. 明确不做（out of scope）

- 71 个已归档 spec 的去留复审（归档是一期决策，另行处理）
- ExcelImporter 双轨、信封规范迁移等 P3 结构债（在 DEV_DEBT_AUDIT 文档跟踪）
- fixture 层两套认证 helper（test-helpers.ts / improved-auth-helpers.ts）的合并——除非 P3 诊断表明必须动
- installer/scenario 之外的任何 playwright 配置变更

## 6. 迁移步骤（带验证门）

| 步骤 | 内容 | 验证门 |
|---|---|---|
| S0 | P3 诊断（§4 三步） | 拿到白屏根因；若修复独立于迁移则先修，smoke 能过 |
| S1 | playwright.config.ts 加 webServer 块；**暂不删旧代码** | dev 栈活着跑 smoke：webServer 起的进程 + 官方收尾、无残留、无 Killed |
| S2 | 重写 globalSetup/globalTeardown，删 process-manager，port-cleanup 收缩为常量 | typecheck 绿；smoke + crud/projects 套件过；跑完 `.e2e-pids`/残留端口为零 |
| S3 | scenario config 加 webServer；回归 `test:scenarios:e2e` 入口 | scenario 套件可起 |
| S4 | 共存终验：dev 栈全程在线，连跑两轮 e2e，dev 库 mtime 冻结 | 四端口共存 + dev 7 项目不变 + e2e 两轮结果一致 |

## 7. 风险与回滚

- **风险 1**：webServer 与 globalSetup 的就绪判据差异导致慢机超时 → 后端 timeout 已设 90s（含建库）；S1 单独验证此点。
- **风险 2**：删 port-cleanup 实现后，极端情况（playwright 崩溃未收走 webServer）留下孤儿进程 → `npm run e2e:stop` + `npm run dev:cleanup` 仍可手动清；文档写入 README 常用命令。
- **回滚**：整个迁移在一个 commit；revert 即回到一期状态（端口隔离不受影响，因为常量与守卫保留）。

## 8. 工作量

实现 + 验证合计约 1 个工作日（S0 诊断 0.5h–2h 不定，S1–S4 约 4h）。
