# Capacinator

A web-based project capacity planning system replacing Excel-based planning. Standalone desktop application using Electron with embedded SQLite database.

**Primary Purpose**: Resource allocation, capacity planning, conflict detection, and project management with fiscal week support.

## Tech Stack

**Frontend**: React 19 + Vite + TypeScript + Tailwind CSS + Radix UI (shadcn/ui)
**Backend**: Node.js + Express + TypeScript
**Database**: SQLite (better-sqlite3) with Knex.js
**Desktop**: Electron
**Testing**: Jest (unit) + Playwright (e2e)
**State Management**: React Query (TanStack Query v5) + Context API

## Common Commands

**Development is fully cross-platform** - all commands work identically on Windows, macOS, and Linux.

```bash
npm run dev              # Start all dev servers (server + client)
npm run dev:stop         # Stop dev servers
npm run dev:logs         # View live logs
npm run dev:cleanup      # Clean up orphaned processes
npm run dev:server       # Backend only (port 3110)
npm run dev:client       # Frontend only (port 3120)
npm run build            # Build all
npm run test             # All Jest tests
npm run test:client      # Client unit tests only
npm run test:server      # Server unit tests only
npm run test:e2e         # Playwright E2E tests
npm run lint             # ESLint check
npm run typecheck        # TypeScript validation
npm run db:migrate       # Run database migrations
npm run commands         # List all available commands
```

See [docs/PLATFORM_AGNOSTIC_SETUP.md](docs/PLATFORM_AGNOSTIC_SETUP.md) for details on the cross-platform architecture.
See [docs/BUILD_AND_TEST_SETUP.md](docs/BUILD_AND_TEST_SETUP.md) for build system and test configuration.

## UI 生成契约（写任何 UI 前必读）

用户用**浅色主题**。契约按**演绎优先**组织：从项目本质（人力主管的排产决策要【正确、快、有把握】）推出五根支柱——A 计算可信（聚合/新鲜度/单位/边界数值/规模）、B 语义透明（域语言/自标注/状态可预测/告警可读）、C 决策流就绪（就地/回路速度/后果可见）、D 呈现健壮（双主题/视口/全局规则兼容/物理可见/i18n/键盘）、E 操作安全（防误触/失败可见/可逆/并发）——历史失败只是各支柱的佐证。写 UI 时先跑 `/ui-preflight`（项目 skill）：FMEA-lite 支柱失效排查 + pre-mortem 红框推演；交付前认知走查四问（想产生此效果吗/看得到操作吗/能联系操作与效果吗/能看到反馈吗）。核心红线：自定义控件先查 index.css/design-system.css 全局元素规则并显式重置（定宽按钮同块必写 padding，`npm run lint:ui` 静态拦截）；**新浮层/选择器优先用已装 Radix 原语**；视觉决策过"视觉战术速查"八条与 Okabe-Ito 默认色板；交付前双主题渲染人眼看（陌生人三问：看得见吗/知道改什么吗/有反馈吗）。守卫（verify:boards/verify:visual）是兜底，不是第一道防线。全文：[docs/UI_GENERATION_CONTRACT.md](docs/UI_GENERATION_CONTRACT.md)

## API 信封规范（新端点强制，存量触碰时迁移）

列表端点返回 `{ data: [...], pagination?: {page,limit,total,totalPages} }`；单实体 `{ data }`；
写操作 `{ success: true, ... }`；错误 `{ error, message }`。**禁止裸数组/裸对象直出**——
客户端为此散布 30+ 处 `Array.isArray(payload) ? ... : payload?.data || []` 防御解析（共享键投毒的根源）。
新控制器必须合规（ActualInvestmentsController 已按此写）；改到老端点时顺手对齐并同步删客户端防御代码。
全量统一是 176 处 res.json 的大改，不做一次性迁移。

## Project Structure

```
client/src/              # React frontend
  components/            # Reusable components (modals/, ui/)
  pages/                 # Page components (Dashboard, Projects, People, Assignments, etc.)
  contexts/              # React contexts (User, Scenario, Theme)
  hooks/                 # Custom React hooks
  services/              # API client
  types/                 # TypeScript types

src/server/              # Express backend
  api/controllers/       # Route handlers (extend BaseController)
  api/routes/            # Endpoint definitions
  services/              # Business logic services
  middleware/            # Express middleware
  database/              # Knex migrations and initialization

tests/
  e2e/                   # Playwright E2E tests
  unit/                  # Jest unit tests (client/ and server/)
  integration/           # Integration tests
```

## Code Conventions

### React Components
- Functional components with hooks only
- Use React Query for all server state
- Use Context API for global state (UserContext, ScenarioContext)
- Modals use Radix UI Dialog primitives with isOpen/onClose pattern

### API Client
- All API calls go through `client/src/lib/api-client.ts`
- Namespaced: `api.projects.list()`, `api.people.create()`, etc.
- Scenario context automatically added via interceptor

### Controllers
- Extend BaseController for common functionality
- Use `handleError()`, `handleNotFound()`, `handleValidationError()` methods
- Services contain business logic, controllers handle HTTP concerns

### State Management
- React Query for server state (queries/mutations)
- Context + useState for UI state
- Query keys: `['projects']`, `['people']`, `['roles']`, etc.
- Always invalidate queries after mutations

### Styling
- Tailwind CSS with CSS variables for theming
- Dark mode supported (class-based toggle)
- Use shadcn/ui components from `client/src/components/ui/`

## Testing

### Unit Tests (Jest)
- Tests colocated in `__tests__/` directories
- Mock api-client and contexts
- Client tests use jsdom environment
- Server tests use Node environment

### E2E Tests (Playwright)
- Organized in tests/e2e/suites/ by feature
- Use TestDataGenerator for dynamic test data
- Each test should isolate its own data context
- Global setup initializes E2E database

### Running Specific Tests
```bash
npm test -- --testPathPattern="AssignmentModal"     # Jest pattern
npx playwright test tests/e2e/suites/crud/          # Playwright folder
```

## Important Patterns

### Internationalization (i18n)
- react-i18next; singleton initialized in `client/src/i18n/index.ts`, imported once in `App.tsx`
- Languages: `zh-CN` and `en-US`. Detection: `localStorage('capacinator-language')` → browser language → en-US fallback; switch UI in AppHeader and Settings → Appearance
- Dictionaries live in `client/src/i18n/locales/{en-US,zh-CN}/<namespace>.json` (~19 namespaces: common, navigation, auth, enums, errors, validation, settings, dashboard, projects, people, assignments, scenarios, reports, importExport, locations, auditLog, phases, roles, gitSync)
- In components use `useTranslation()`; in non-component modules use the `i18n` singleton with call-time `i18n.t()` (never at module top level — module-scope strings don't re-translate)
- Module-level config constants with display strings must live INSIDE the component body (or `useMemo(..., [t])`) so language switches re-render
- en-US values must byte-match the original English strings — Jest/Playwright tests run in en-US (jsdom `navigator.language`) and assert English text; `tests/setup.client.js` initializes i18n for standalone component tests
- Dates: use `getLocale()` from `client/src/i18n` for `toLocaleDateString`/`toLocaleString`, and `getDateFnsLocale()` for date-fns `format` — never hardcode 'en-US'
- Server enums (status, scenario_type, OVER_ALLOCATED...) render through `client/src/lib/enum-labels.ts` helpers
- Server English error messages are translated client-side by `client/src/lib/i18n-error.ts`, wired into the api-client response interceptor; unknown messages get a localized prefix plus the original text
- Form validation messages: `client/src/lib/validation.ts` and `shared` validators return localized strings via i18n

### Fiscal Weeks
- System uses fiscal week format: "24FW36-25FW11" (year + FW + week number)
- Fiscal year starts in September
- All date ranges should support fiscal week display

### Scenarios
- All data operations are scenario-aware
- Scenario context passed via API interceptor
- "Working scenario" vs "committed scenario" distinction

### Audit Logging
- All changes logged to audit_logs table
- Middleware automatically captures user context
- Never bypass audit logging in production

### Cascading Updates
- Phase changes cascade to assignments
- Use ProjectPhaseCascadeService for phase modifications（其 `applyCascade` /
  `updateProjectPhases` 接受 `{ trx }`，时间线写 + computed 刷新同事务）
- `AssignmentRecalculationService`（I02a/D18 路线 B 重写）只读写
  `scenario_project_assignments` 切片：调度输入（阶段时间线 start/end、项目
  aspiration）变化后刷新 phase/project 模式的 `computed_start_date/end_date`。
  写路径共用 `src/server/services/calc/assignmentDates.ts` 原语；触发面：
  AssignmentsController（create/update/bulk）、ScenariosController.upsert、
  ProjectPhasesController（update/bulkUpdate/delete）、ProjectsController
  （aspiration update + custom phase 端点）、CustomPhaseManagementService、
  ProjectPhaseCascadeService、ProjectPhaseDependenciesController.applyCascade。
  审计一律事务提交后逐条 `await logAuditEvent`（事务内调用会在单连接池死锁）。
  守卫：`scripts/check-write-path-registry.mjs`（G-E，调度输入写点必须接线/
  登记豁免）与 `scripts/check-legacy-table-writes.mjs`（G2，旧表零写入——
  仅剩生命周期兼容双写/备份恢复/工具清理白名单）。
- 存量漂移回填：`npx tsx scripts/recalculate-assignment-dates.ts`（默认
  dry-run，事务回滚；`--apply` 落库并逐条写审计）。

## Database

- SQLite with Knex.js query builder
- 46+ migrations in src/server/database/migrations/
- Never modify migrations that are committed
- Create new migrations for schema changes: `npm run db:migrate:make <name>`

Key Tables: projects, people, roles, project_assignments, scenario_project_assignments, project_phases, availability_overrides, scenarios, audit_logs, notifications（`assignments` 表不存在——2026-10-13 审计修正，曾致删阶段必败与审计白名单失聪）

## Debugging

- Server logs: Check terminal running dev:server
- Client logs: Browser DevTools console
- Database: SQLite file at ./capacinator.db (dev) or in userData (production)
- API requests: Check Network tab, all go through /api/
- React Query: Use React Query DevTools in browser

## Environment Variables

Copy `.env.example` to `.env.local` for local development overrides.

### Required
| Variable | Description | Default |
|----------|-------------|---------|
| NODE_ENV | Environment (development/production/test) | development |
| PORT | Server port | 3110 |
| VITE_PORT | Client dev server port | 3120 |
| JWT_SECRET | JWT signing secret (CHANGE IN PRODUCTION) | dev-jwt-secret |
| DB_FILENAME | SQLite database file | capacitor.db |

### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| LOG_LEVEL | Logging level (error/warn/info/http/debug) | info |
| AUDIT_ENABLED | Enable audit logging | true |
| DB_BACKUP_ENABLED | Enable automatic backups | true |
| DB_BACKUP_INTERVAL | Backup frequency | daily |
| MAX_FILE_SIZE | Max upload size (bytes) | 52428800 (50MB) |

### Environment Files
- `.env.development` - Local development (committed, safe defaults)
- `.env.production` - Production settings
- `.env.test` - Jest test settings
- `.env.e2e` - Playwright E2E test settings
- `.env.local` - Local overrides (not committed)

## PR & Commit Conventions

### Commit Messages
Use conventional commits format:
- `feat: add new feature` - New functionality
- `fix: resolve bug` - Bug fixes
- `refactor: restructure code` - Code changes that don't add features or fix bugs
- `test: add/update tests` - Test additions or modifications
- `docs: update documentation` - Documentation changes
- `chore: maintenance tasks` - Build process, dependencies, etc.

### Branch Naming
- `feature/short-description` - New features
- `fix/issue-description` - Bug fixes
- `refactor/what-changing` - Code restructuring
- `test/what-testing` - Test additions

### Pull Requests
- Keep PRs focused on a single concern
- Include description of changes and testing done
- Ensure all tests pass before requesting review
- Update relevant documentation if behavior changes

## Building & Deployment

### Development
```bash
npm run dev              # Start all servers (recommended)
npm run dev:server       # Backend only (port 3110)
npm run dev:client       # Frontend only (port 3120)
```

### Production Build
```bash
npm run build            # Build server + client + electron
npm run dist             # Build + package Electron app
```

### Platform-Specific Builds
```bash
npm run dist:win         # Windows installer (.exe)
npm run dist:mac         # macOS app (.dmg)
npm run dist:linux       # Linux package (.AppImage)
```

### Build Output
- `dist/` - Compiled server and client
- `dist-electron/` - Packaged Electron applications

### Electron Configuration
- Main process: `src/electron/main-with-setup.cjs`
- Build config: `package.json` "build" section
- Icons: `assets/icon.ico` (Windows), `assets/icon.icns` (macOS)
- Installer customization: `build/installer.nsh`

## Common Pitfalls

- Don't forget to invalidate React Query cache after mutations
- Scenario context must be set before API calls work correctly
- E2E tests require the E2E database to be initialized
- Modal state should reset when closed (useEffect on isOpen)
- Always handle loading and error states in components

## Active Technologies
- TypeScript 5.8 (ES2022 target), Node.js 20+ (001-git-sync-integration)

## Recent Changes
- 001-git-sync-integration: Added TypeScript 5.8 (ES2022 target), Node.js 20+

## 工具铁律(2026-09-23)
- 修改 .tsx/.ts 一律用 Edit 工具;禁止 python 脚本改 React 代码(三次炸 JSX 的教训;**2026-10-11 起由 PreToolUse hook 物理拦截,见 .zcode/config.json**)
- 截图类输入: 第一个动作固定 `npm run shot <图片路径>`(scripts/analyze-screenshot.mjs)
- 验证漏斗: 改完→对应文件测试→绿→更宽;全量/verify:site 只在提交点

## 信号→动作表(2026-10-11 气泡事故沉淀;散文规则拦不住行动惯性,只留触发对照)

**缺陷协议** = 「缺陷分析分级」:第 0 步家族查询 → P0–P3 证据门槛 → A0/A1/A2。

### A. 缺陷信号(来源不限:用户/测试/评审/自检/监控;**多行命中=动作取并集,不按顺序择一**)

| 可观察信号 | 第一动作 |
|---|---|
| 视觉/交互异常(位置、尺寸、遮挡、对比、焦点、键盘、响应式、主题、文案误导) | 先做涉事组件族失效模式全枚举量测(贴锚/层顶 elementFromPoint/越界/字号),**再进入缺陷协议**——不是验证自设假设,也不止于量测 |
| 数字/口径异常(同数跨页不同、单位/窗口/场景不符) | 冻结输入快照 → 手算/真值对照 → 缺陷协议 |
| 功能/接口失败(错误码、流程阻断、裸数组/信封错) | 取完整请求/响应/日志 → 缺陷协议 |
| 测试/门禁/CI 红 | 先隔离失败断言 → 缺陷协议 |
| 契约/缓存/状态异常(缓存键、状态机、并发、事务) | 跨面不变量核对 → 缺陷协议 |
| 性能/规模化异常(N+1、无界读取、超时) | 先判定是否结构缺陷(不是调优) → 缺陷协议 |
| 安全/权限/审计异常 | 保留证据/止损并路由 owner → 缺陷协议 |
| 复发/同族迹象 | 第 0 步家族查询 → 复审旧守卫链(写/接线/红/处置) → A2 |
| 未知/主观“不对、奇怪、和以前不一样” | 默认进入缺陷协议;可复现直接查,不可复现只问一个澄清问题 |

**兜底规则**:没有命中任何一行时,按“未知/主观”行走缺陷协议,禁止静默忽略。

### B. 工作流触发(不是缺陷入口)

| 必然出现的工作流信号 | 强制动作 |
|---|---|
| 复用组件出现在新上下文(新锚区/新层邻居/新视口区域) | 视为新组件全量验证——验证绑定"组件×上下文",复用不继承已验证 |
| 交付走查 | 每个新浮层/控件至少完整执行一次**末端操作**(点最后一项/最远按钮),"看一眼"不算走查 |
| **UI diff 交付（I03g）** | **强制 ui-preflight 交付前段（verify:states+认知走查）+ ui-review 盲评派发**——评审报告必含 judged 三节逐 ID 块；两轮试运行记录"应评审/实评审/降级"计数 |
| 即将发起用户裁决提问 | 每题先自答"为什么必须由用户决";答不出(工程事实/系统一致性可推导)即自定+给理由 |
| 改完任一 ts/tsx 文件 | 立即 typecheck(3 秒),不等测试跑完连锁发现 |

**记忆的分工**:记忆只存"是什么/为什么"(事实、偏好、根因叙事);"必须做什么"一律落物理拦截层——行动时刻 hook(.zcode/config.json)、渲染时刻全称状态检查器(npm run verify:states,verify-boards 已收编)、语义时刻测试、构建时刻 pre-commit。写进记忆的行动规则=没写。

## 防线相位账本(2026-10-11,双轴:机制切片 × 触发时机)

| 防线 | 机制切片(读闭包哪个维度) | 触发时机 |
|---|---|---|
| PreToolUse hook(.zcode) | 命令文本×文件后缀 | 行动时刻(每次 Bash) |
| verify-cache-keys 静态配对 | 缓存键签名×端点归属×失效前缀匹配(数据闭包;同键异端点=互投毒,悬空失效=回滚静默失败) | 提交时刻(pre-commit,2026-10-13 审计元问题:缓存闭包此前零防线;已知残余:同键不同运行时实参静态不可辨) |
| verify-states 全称检查器 | 状态×对比度×命中×遮挡×越界×字号×贴锚（渲染闭包）**+ 悬停位移×容器边界、同排控件等高（2026-11-10 录入按钮越界事故新增切片）** | 渲染时刻(--quick 迭代)/交付时刻(verify-boards 收编) |
| lint:ui 规则 4/5 | 未作用域 `.btn*` 的 `:hover` 位移声明；任何交互态（hover/focus）的布局几何位移（按钮/链接 translate/scale、padding+负 margin 外扩）——跨路由泄漏与裁切闭包 | 生成时/提交前（`npm run lint:ui`，SELF_TEST 自证） |
| lint:ui 规则 6/7（2026-11-10） | 共享类左端锚点×文件归属合法性（规则 6，路由 CSS 泄漏闭包）；所有者内部唯一性×注册完备性（规则 7——empty-state/chart-container 双所有者级联互踩与 badge-secondary 注册缺主两类事故的静态化；OWNER_DUPS/OWNER_MISSING 冻结存量） | 生成时/提交前（同上；冻结债 2026-12-31 到期转红） |
| lint:ui 规则 8（2026-11-11，D-04 Stage 2） | tsx 注入 `<style>` 文本块 × 共享类/工具类定义（PhaseTimelineStyles 影子表事故：运行时注入全局定义压过 owner，规则 2/6 只扫 .css 全盲；INJECTED_STYLE_ALLOWLIST 冻结存量——当前为空） | 生成时/提交前（同上） |
| lint:ui 规则 9（2026-11-14 已入码，I03g 补账） | 未分层 CSS 中的注释盲区×样式泄漏（lint-ui-css.mjs:210 已实现，此前账本漏登） | 生成时/提交前（同上） |
| IME Enter 守卫（I03g） | `ime-composition × enter-commit`：文本输入 Enter 处理点 × isImeComposing 引用（tests/unit/meta/ime-enter-guard.test.ts 全库扫描+激活白名单；已知四漏检待修：双引号 Enter/守卫名入注释/守卫被忽略/白名单整文件） | 提交时刻（pre-commit，抽取 scripts/check-ime-enter-guard.mjs 单一实现后） |
| judged 层三节（I03g） | `judged-layer × 规则 ID`：DV-1..8/CP-1..4/IX-1..6 以契约 ID 为锚，评审必填段+接线守卫互引；**守卫限度：守互引完整，守不住"评审被派发"本身** | 评审时刻（必填块）+ 提交时刻（接线守卫 check-ui-contract-wiring.mjs） |
| useCellPopover DEV 自检 | 浮层贴锚/层顶/越界(几何闭包) | 产物时刻(每次打开) |
| jest 语义测试 | 业务语义 | 提交前 |
| pre-commit | 类型/迁移不可变/CSS 语法 | 提交时刻 |

**准入规则**:新增防线须声明自己新增的"机制切片"或"触发时机";同切片同时机不得计入纵深(common-mode 教训:四层静态防线冗余度为 1)。检查器自身健康=verify:states:selftest 注入坏规则必红,定期跑。

## 验证分级与会话效率纪律(2026-11-11,I01i→I01s 十四批耗时审计沉淀)

耗时审计结论:系列 11.9h 中**验证运行占 60-67%,编辑仅 ~15%**;~20-26%(145-185 min)属可回收浪费。以下纪律按此立规。

### 验证分级(批内只跑低档,高档留给批末/里程碑)
- **T0 批内改动后**:`npm run lint:ui` + `npm run typecheck` + 受影响面的 targeted jest(<1 min)。
- **T1 批末提交前**:受影响单档 `node scripts/verify-states.mjs --profile X` ×N + `verify:colors`(若本批碰过 index.css/App.css,**批末统一刷一次** palette/timeline refresh——这两文件是 38 条证据的依赖锚,每编辑一次全陈旧,批内刷多轮纯浪费)。
- **T2 系列里程碑/合并前**:states 全量(107) + visual 全量(780) + client jest 全量 + verify:colors。
- **visual 迭代期一律页级过滤**(`--page`/`--profile`);**任何全量 visual 之前必须先跑冒烟**:`node scripts/verify-visual-smoke.mjs`(3 组合 ~5 min,一次性暴露死档/状态机/信封三类陈旧假设——批 C 实录:四个陈旧假设串行暴露耗了 4 次全量 ≈ 90 min)。
- **全量 visual 用分片**:`npm run verify:visual:shards -- --shards 4`(4 进程,单组合实测 ~6s,全量预计 5-7 min;单进程 18-25 min)。分片报告带 `-shard-i-of-n` 后缀;`--record-existing-axe`/`--capture-fixtures` 会写共享文件,已禁止与 `--shard` 同用。分片只并行化独立页面组合,不减少 axe/碰撞/像素检查。

### 探针纪律
- 带身份取值一律用 `scripts/lib/probe.mjs`(probe/probeSession,自证 `--selftest`):手写登录样板曾致身份缺失误开 Login 对话框、误诊一个来回。
- **探针函数体禁内联 `-e` 传参**(双引号 bash 吞反引号,批 C/D 实录 6-8 次失败):写 /tmp/*.mjs 文件后运行。
- 后台任务**等完成通知,禁 sleep 轮询**(审计实录累计 sleep 30-40 min 纯浪费)。

### git 与提交纪律
- **禁对含未提交改动的文件用 `git checkout --`**(审计实录两次自毁 harness 修复,重贴 20 min);诊断前先 `git diff > /tmp/backup.patch`。
- **提交前本地 dry-run**(targeted jest + typecheck):pre-commit 拦截后再返工一轮 ≈ 10 min,本地先跑 <1 min。

### 普查与方案纪律
- **计数/扫描结论必须出自 checked-in 工具**(带 selftest):临时 node -e 计数脚本在系列里出过 6 次口径错误(break 漏记、shell 吞反引号 343 假死键等),每次引发一轮评审往返。
- **迁移/删除类方案先做导入级普查**(`grep "from.*X"` 全库):PhaseTimeline 全家族死代码在方案期被当作迁移对象,写了两个 modal 迁移后才由探针失败发现,整族改删(≈15 min 返工)。

### 评审纪律(数据辩护,勿削)
续会话评审 agent 的单位发现成本**递减**(B1:53 工具/33min/4 GUARD → 批A:7 工具/6.4min/2 GUARD),12 个 GUARD 每个的返工成本都 ≥ 对应评审时长。问题从不在评审,在执行侧验证冗余。

## 结构性 Bug 三步法(2026-09-29 待排序漂移事故沉淀)

修复任何"某类元素缺 X"的结构性 bug 时,强制三步,缺一即返工:
1. **归因到类**:按结构特征(如 `position:fixed` 于 transform 祖先)全库枚举成员清单,**清单即修复范围**——禁止用"修复时看到的 API"当问题边界(fe58b0b 只扫 useCellPopover 漏掉 lc-popover 的教训);
2. **共享原语**:修复必须收敛到一处原语(如 PopoverPortal),N 处消费——禁止逐例散修;
3. **结构不变量守卫**:覆盖证明只认全量扫描断言(如 DOM 遍历所有 fixed 元素断言无 transform 祖先),**单点行为断言不得充当覆盖证明**;守卫上线须过变异自证(故意还原一个 bug 必须红)。

## 缺陷分析分级(2026-11-13,Codex/Claude 双评审收敛)

**第 0 步(不分层,所有缺陷都做)**:查 `docs/backend-review/experiences.md` + `docs/ui-review/experiences.md` + 台账反例表,按 `mechanism_slice` 判同族。同族命中→先复审上次守卫链(写了?接线?该场景红过?红了处置?),再决定是否专项;不是先写一份新分析。

| 级 | 触发 | 必答 |
|---|---|---|
| A0 | P3 外观/无计算影响 | 事实、直接原因、修复+定向验证 |
| A1 | P2 功能受损但计算正确 | + 机制级同类扫描(≥2 轴)+ 一行守卫裁决(默认不加) |
| A2 | P0/P1、同族复发、触及共享契约、数据修复、难回退 | 八问全量 + 数据影响/回填 + 止血/回滚 + 可证伪根因 |

- 定级沿用 reviewer 证据门槛(P0 无反例数字/红证→P1;P1 无 file:line→P2);**升级免费,降级需证伪理由**。
- 同族=同一 `mechanism_slice` 或同一守卫可覆盖,"症状像"不算;复发=上次已修复且宣称防线后再次出现;触及契约=信封/状态码/日期边界/单位/scenario 隔离/缓存键/事务原子性/持久化兼容性变化。
- A2 顺序:**事实/影响→直接原因→同类清单(即修复范围)→根因→修复/止血→验证(T0/T1/T2)→守卫→收尾**;根因止于可干预系统条件("人忘了"不算),同类搜索用机制谓词,grep 只找线索。
- 守卫默认不加;加则五验:原缺陷归因红证、合法邻近绿、接线声明、SELF_TEST/豁免理由、owner/到期日。
- 输出复用:A0/A1 问题卡进 commit body;A2 完整分析进 PR/台账;经验只走 EXP-NEW。不新建模板/skill/PR 模板。
