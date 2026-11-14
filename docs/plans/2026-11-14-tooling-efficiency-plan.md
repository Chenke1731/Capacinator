# 工程效率与工具链治理方案（I19）

- 日期：2026-11-14
- 状态：草案（三方评审完成：Codex/Claude/ZCode 均 APPROVE_WITH_CHANGES；按 §15 修订，待开工）
- 关联：
  - 本轮工具调研（2026-11-14 对话，外部工具版本以当日 npm/GitHub 为准）
  - `CLAUDE.md`：防线相位账本、验证分级与会话效率纪律
  - `docs/plans/2026-10-14-capacinator-improvement-plan.md`：§7 台账、§11 验证入口
  - `docs/LAYOUT_AUDIT.md`：本地夜审定位
- 范围：工程效率、工具链、技能与 agent 工作流；**不改产品行为**
- 台账：建议领号 **I19**（`I18` 已被 2026-11-14 夜审占用；开工前用 `node scripts/check-ledger.mjs --next I19` 复核）

---

## 0. 一页结论

1. **不替换现有强项**：`verify:states`、`verify:visual`、Evidence Bundle、只读评审 agent、经验库、精确收集数、变异自证、台账，继续保留。
2. **先修地基**：凭证泄漏、`.env.*` 跟踪、Node/Chromium 版本漂移，是“会让所有工具时灵时不灵”的问题，优先级高于任何新工具。
3. **再提速度**：用 Jest `--findRelatedTests`、Playwright `--only-changed`/`--last-failed` 和 `verify:t0/t1/t2` 编排器，把验证时间从“全量重跑”改成“按变更选择”。
4. **再补静态熵**：knip（死代码/依赖）、dependency-cruiser（模块边界）、jscpd（重复基线）；先 report-only，再 ratchet，不搞一次性大爆炸。
5. **最后做测试强度**：fast-check 覆盖领域纯函数不变量；Stryker 只做 2–3 个模块的周期性定向审计，**不设 CI 变异门禁**（尊重设计文档“不建常设 harness”的既有裁决）。
6. **新增防线必须声明新的机制切片或触发时机**；同切片同时机不计纵深；不引入重型平台、云依赖、Storybook/Sonar/Nx/Vitest 迁移。

预计工时：P0 1.5–2 天；P1 3–4 天；P2 3–5 天；P3 按需 0.5–1 天。总计约 8–12 个工作日（试点预算；6–10 天是偏乐观下限）。

---

## 1. 背景与证据

本轮只读盘点得到的事实（均为当前 HEAD）：

| # | 事实 | 证据 |
|---|---|---|
| E1 | `.mcp.json` 被跟踪，含明文 `JENKINS_API_TOKEN` 与 `NODE_TLS_REJECT_UNAUTHORIZED=0`；命令为 Windows `cmd /c`，在本 Linux 主机不可用；shadcn MCP 是否有使用需求未验证（无 `components.json` 只说明未按 shadcn 脚手架使用） | `git ls-files .mcp.json`；`.mcp.json:5,20,25,26`；`components.json` 不存在 |
| E2 | 6 个 `.env.*` 被跟踪（`.env.development/.e2e/.production/.qa/.staging/.test`）＋`.env.example`；其中 `.env.example:48` 也含具体 base64 `ENCRYPTION_KEY`，2 个 44 位 `ENCRYPTION_KEY` 像真实值；`ENCRYPTION_KEY` 用于加密 `github_connections` 的访问/刷新 token | `git ls-files '.env*'`；`EncryptionService`/`GitHubConnectionService`；键名与长度检查（未打印值） |
| E3 | 无 secret 扫描、无依赖漏洞扫描、无依赖更新自动化 | `package.json`、hooks、workflows 均无 |
| E4 | 环境多套 Node：非交互 shell `18.19.1`、nvm 默认 `22.23.1`、vlmkit `0.24.0` 声明 `>=24`、`test.yml` Node 20、`layout-audit.yml` Node 22；npm 也分裂为系统 `9.2.0` 与 nvm `12.0.2`；无 `.nvmrc`/`packageManager` | `node -v`/`npm -v`（不同 shell）、`/root/.nvm/alias/default`、`npm view`、workflows |
| E5 | 20 处硬编码 `chromium-1223`：`scripts/` 19 处 + 仓库根 `lib/board-probes.mjs:8` 1 处；实际安装 `chromium-1208`/`chromium-1255`；仅 `ui-profiles.mjs` 与 `ui-evidence/runner.mjs` 支持 `UI_AUDIT_CHROME` | `grep -rn chromium-1223 scripts tests lib`；`ls /root/.cache/ms-playwright` |
| E6 | 177 个 tracked scripts、107 个 npm scripts；其中 46 个能在 `package.json`/hooks/nightly 中以字面路径找到（这是引用计数，不是调用可达性；其余不等于死脚本）；`fix-*` 11 个、`verify-*` 24 个、`walkthrough/spotcheck` 5 个 | `git ls-files scripts`；`package.json`、`.githooks/*`、`scripts/audit-nightly.mjs` 路径扫描 |
| E7 | Jest 静态 glob 共 276 个测试文件（server-unit 125、integration 59、client 92）；台账最近记录 5043 通过；E2E 收集 361 + 160；visual 全量串行 18–25 分钟与验证占会话 60–67% 来自 CLAUDE.md/台账历史记录，未在本轮重测 | `jest.config.cjs` glob；`2026-10-14-capacinator-improvement-plan.md:603`；`.collection-floor.json`；`CLAUDE.md:347,354` |
| E8 | 选择性运行未使用：`jest --findRelatedTests client/src/lib/batchShift.ts` 命中 3 个测试文件（client 静态 92 个）；Playwright 1.58 已支持 `--only-changed`/`--last-failed`/`failOnFlakyTests`，脚本与配置零引用；`--only-changed` 会追踪测试文件的 import 依赖（helper/fixture），但不会追踪 HTTP 背后的应用源码 | 本机实测；`npx playwright test --help`；`playwright/types/test.d.ts:1239`；`node_modules/playwright/lib/runner/vcs.js` |
| E9 | 测试强度缺少持续度量：coverage 阈值 45/45/45/40 但 CI 不跑 coverage；变异校准是设计文档 §5.3 的一次性 20 变异报告；日期/容量纯函数只有样例测试；`test:coverage` 脚本不存在 | `jest.config.cjs:169-173`；`TEST_FRAMEWORK_DESIGN.md` §5.3；`package.json` scripts |
| E10 | 无死代码/依赖/模块边界/重复检查；`vitest` 无测试导入；`puppeteer-core` 被 `ExportFormatterService.ts:71` 动态 import（PDF 导出，不是死依赖）；`lint-staged` 有配置但无 hook；ESLint 已是 flat config，但 `lint` 脚本不扫描顶层 `tests/` | `package.json:66`；`src/server/services/export/ExportFormatterService.ts:71`；全库引用扫描 |
| E11 | 无 bundle size 预算；`perf:ops` 只测运行时，不测产物体积；预算口径（总量/单 chunk/首屏、gzip、构建命令）未定义 | `client-vite.config.ts:28`；`scripts/perf-ops.mjs:4` |
| E12 | 3 个 GitHub workflow 仍在（`test.yml`/`layout-audit.yml`/`auto-merge.yml`）；`layout-audit.yml:7-21` 仍有 PR/schedule 触发；I18 台账称 layout workflow 已移除但 `352e5d2` 又恢复，记录与仓库不一致；冲突集中在 layout，不应扩大为“所有 GitHub CI 都被禁止” | `.github/workflows/`；`git log --all -- .github/workflows/layout-audit.yml`；I18 行 |
| E13 | 技能层有 3 个项目 skill + 2 个只读 agent；`.zcode/commands` 目录不存在；无 `AGENTS.md`；2 个 dotenv skill 被 `.zcode/skills/.gitignore` 忽略（来源为 pnpm 自动生成的证据不足，不能直接判为噪音） | `.zcode/`；`AGENTS.md` 不存在；`.zcode/skills/.gitignore:1` |

---

## 2. 目标与非目标

### 2.1 目标

1. **凭证与供应链可审计**：仓库内无明文 secret；每次提交/夜间有 secret 与依赖漏洞检查。
2. **环境可复现**：一条 `npm run verify:doctor` 能回答 Node/npm/Chromium/端口/hooks/vlmkit/env 是否就绪；所有 UI 脚本不再依赖硬编码浏览器路径。
3. **验证按变更选择**：典型 client/server 改动 T0 ≤ 2 分钟；T1/T2 仍有明确的全量兜底；不因选择性运行漏掉受影响面。
4. **静态熵可度量、可 ratchet**：死依赖/死导出、跨层 import、重复代码有基线，新增即红或进入报告。
5. **测试强度可度量**：领域纯函数有不变量测试；关键模块有可复现的变异分数报告；coverage 有趋势。
6. **技能与命令可发现**：验证、代码健康、安全、测试排障、发布各有一个薄 skill/command；`AGENTS.md` 跨 agent 可读。

### 2.2 非目标

- 不改产品功能、不改 API 语义、不改容量/日期口径。
- 不替换 `verify:states`/`verify:visual`/Evidence Bundle/评审 agent/经验库。
- 不引入 Storybook、Chromatic/Percy/Lost Pixel、SonarQube、ReportPortal、Nx/Turbo。
- 不做 Vitest 迁移；不把 Jest 276 个文件重写。
- 不做全量变异门禁；不把 Stryker 放进 pre-commit/CI 阻塞。
- 不默认引入云端视觉复核；不把截图上传第三方。
- 不默认重写 git 历史；token 轮换优先，历史清理单独裁决。
- 不在本批做 OpenAPI/TypeSpec 全量契约化；作为观察项。

---

## 3. 原则（准入规则）

沿用项目既有防线准入规则，新增工具/守卫必须回答：

1. **新增的机制切片是什么？**（如 `secret × git 历史`、`symbol × 引用闭包`、`module × import 边`、`输入空间 × 不变量`、`断言 × 变异体`）
2. **新增的触发时机是什么？**（行动时刻/提交时刻/渲染时刻/夜间/周更）
3. **是否与现有防线同切片同时机？** 是则不计纵深，不新增。
4. **是否 report-only 起步？** 噪声未知的工具必须先报告、后 ratchet；不允许第一次接入就全量红。
5. **失败语义是否诚实？** “没跑成”不能当通过；缺依赖/缺浏览器/缺网络必须 exit 非 0 或显式 advisory。
6. **是否本地优先？** 凭证、源码、截图不出本机；云服务只作为可选升级，不作为默认路径。
7. **是否有回滚？** 每个工具/配置都要能单独 revert，不绑定产品发布。

---

## 4. 工作包

### P0-1 / I19a 安全与凭证治理（约 1 天）

**目标**：仓库内无明文 secret；提交/夜间有 secret 与依赖漏洞检查；干净检出可启动；轮换不破坏已加密存量。

**先裁决/先盘点（写入评审记录 §15）**：

- **Jenkins token 已推送**：`git log --all -- .mcp.json` 显示该文件在 `origin/main` 与 `origin/feature/i01-demand-intake` 历史中；按已泄露处理，立即撤销旧 token，不保留“过渡窗口”。
- **ENCRYPTION_KEY 不是普通 secret**：`EncryptionService` 用它加密 `github_connections.encrypted_token/refresh_token`。轮换前必须盘点密文行与恢复方案；没有重加密迁移时，只轮换 JWT_SECRET 与 Jenkins token，或接受开发数据重置。不得把 ENCRYPTION_KEY 与 JWT_SECRET 一起无脑轮换。
- **`.env.example` 也含具体 ENCRYPTION_KEY**：把它改为显式占位符（如 `base64:REPLACE_ME_32_BYTES`），否则任何复制模板的人都会共享同一开发 key。
- **JWT_SECRET 轮换**会使现有会话失效；开发环境可接受，生产需安排窗口。

**步骤**：

1. **凭证盘点与轮换**：
   - 查 `git log --all -- .mcp.json`、`.env.*`、`config`，列出所有历史 secret；区分“仍有效/已失效/仅测试”；
   - 撤销 Jenkins token；更新使用方；确认不再使用则删除 Jenkins MCP；
   - JWT_SECRET 轮换；ENCRYPTION_KEY 按上面的盘点结果处理；
   - 历史重写单独立项（需用户批准）；不做历史重写时，用 gitleaks 精确 allowlist 记录“已撤销”的历史 finding（含 owner/expires/理由），而不是把历史扫描改成永远绿。
2. **`.mcp.json`**：
   - 删除明文 token 与 `NODE_TLS_REJECT_UNAUTHORIZED=0`；
   - 若保留 MCP server，先用目标客户端验证 `${VAR}` 插值、缺变量失败、TLS 信任；不能假定 JSON 自动展开；
   - 命令改为 Linux 可用且**精确版本**的 `npm exec --package=<pkg>@<version>`，禁止 `npx -y` 拉最新；
   - 删除 shadcn MCP（无使用需求时）；保留则补使用证据。
3. **`.env` 治理（环境加载矩阵）**：
   - 事实：`src/server/index.ts` 按 NODE_ENV 读取 `.env.development`/`.env.test`/`.env.e2e`，production 落到 `.env`（不是 `.env.production`）；
   - 规则：只跟踪 `.env.example` 与 `.env.e2e`（E2E 专用模板；固定测试 key、无生产凭证）；其余 `.env.*` 取消跟踪并加入 `.gitignore`；
   - `scripts/setup-env.mjs` 按环境生成合法本地文件：development 生成随机 JWT_SECRET 与 32 字节 base64 ENCRYPTION_KEY；test 生成测试 key；e2e 使用 `.env.e2e` 模板；production 拒绝自动生成，必须由部署注入；
   - 禁止把 `.env.example` 直接复制成 `.env.development`（example 含开发库路径/端口/具体 key，直接复制会产生错误配置）；
   - Electron/打包链路是否读取 `.env.production` 需单独验证；若读取，改为构建环境注入，不落仓库。
4. **gitleaks**：
   - 官方 pre-commit 形式：`gitleaks git --pre-commit --redact --staged --verbose`（`git --staged` 在 8.30.1 源码存在；`protect` 已弃用）；
   - 夜间全历史：`gitleaks git --config gitleaks.toml --redact`；历史 finding 用精确 allowlist/baseline 记录，不用“扫描通过”掩盖；
   - 工作区扫描按目录循环（`for d in client/src src shared scripts tests docs lib .githooks; do gitleaks dir --config gitleaks.toml --redact "$d"; done`），不要 `gitleaks dir .`（会扫到 `node_modules` 与被 gitignore 的本地 `.env.*`，噪声/假红）；
   - `gitleaks.toml` allowlist：`.env.example` 占位符、`.env.e2e` 测试 key、测试 fixture 假 token；每条写理由。
5. **OSV-Scanner 2.7.1**：
   - 使用 v2 文档语法：`osv-scanner scan -L package-lock.json --format json`（`scan source` 可省略；不要用未经核实的旧式短命令）；
   - 默认允许联网查询包元数据；断网时记“未完成”（exit 2 语义），不能当 0 漏洞通过；
   - critical/high 必须为 0 或有 `osv-exceptions.json`（id/reason/owner/expires），由 wrapper 脚本过滤并计数。
6. **`npm audit signatures`**：验证 registry 签名；对私有 registry/无签名包允许 `signature-exceptions.json`，但必须显式。
7. **新依赖准入**：任何新增 devDependency 必须记 license、精确版本、provenance/签名、维护状态；优先项目内安装，hooks 中禁止 `npx -y`。

**验收**：

```bash
gitleaks git --pre-commit --redact --staged --verbose   # 暂存区 0 未豁免
gitleaks git --config gitleaks.toml --redact            # 全历史 0 未豁免（撤销类 allowlist 除外）
for d in client/src src shared scripts tests docs lib .githooks; do gitleaks dir --config gitleaks.toml --redact "$d" || exit 1; done
osv-scanner scan -L package-lock.json --format json     # 0 critical/high 或例外文件
npm audit signatures                                    # 通过或显式例外
git ls-files '.env*'                                    # .env.example + .env.e2e（test-only）
npm run verify:doctor                                   # 环境就绪
```

**风险/回滚**：ENCRYPTION_KEY 轮换可能让 GitHub 存量凭证不可解密；先盘点。取消跟踪 `.env.*` 可能让干净检出/Electron 打包失败；用 setup-env + 环境注入兜底。token 撤销可能影响 Jenkins 使用方；先确认。

---

### P0-2 / I19b 环境确定性与夜审隔离（0.5–1 天）

**目标**：`verify:doctor` 一条命令回答环境是否就绪；所有 UI 脚本用同一套浏览器解析；夜审与 E2E 不共享数据库。

**步骤**：

1. **夜审 / E2E 数据库隔离（P0 阻塞项）**：
   - 事实：`knexfile.e2e.ts:11` 硬编码 `.e2e-data/e2e-test.db`，`init-e2e.ts:33` 启动即删除；`audit-nightly.mjs:61` 以 `NODE_ENV=e2e` 启动 3131/3132，换端口但共享同一 DB → 夜审会删掉正在跑的 E2E 库；
   - 改 `knexfile.e2e.ts`：`E2E_DB_PATH`/`DATABASE_URL` 可覆盖，默认保持 `.e2e-data/e2e-test.db`；`init-e2e.ts` 删除前确认路径属于 e2e 目录，拒绝生产库；
   - 夜审设置独立路径（如 `.e2e-data/audit-nightly.db`），并加互斥锁/心跳，防两个夜审并发；
   - 验收：Playwright 3111/3122 与夜审 3131/3132 同时启动，互不删库；夜审结束不残留临时人员/数据。
2. **Node 基线（spike 30–60 分钟）**：
   - 首选 Node 24（vlmkit 0.24 要求 `>=24`）；用 24 跑 `npm ci`、`better-sqlite3` 重建、`npm run typecheck`、单测、E2E smoke、`audit-nightly --pages person-workload`；
   - 若 native/Electron 失败，回退 Node 22.23 并明确记录“运行时 22、夜审 24”的双基线；不能只靠“忽略 engines warning”算兼容；
   - 结论写入 `.nvmrc`、`package.json engines`、`CLAUDE.md`；`verify:doctor` 检查当前 Node 与 `.nvmrc`。
3. **包管理器/版本**：
   - `packageManager` 固定到所选 Node 实际自带 npm 版本（Node 22 的 npm 12.0.2 或 Node 24 的实际版本），不写“npm@12（以本机为准）”这种自相矛盾表述；
   - `verify:doctor` 同时检查 npm 版本；
   - `.gitignore` 已忽略 `pnpm-lock.yaml`/`pnpm-workspace.yaml`，无需重复；确认安装只用 npm。
4. **浏览器解析器**：
   - `scripts/lib/browser.mjs` 的 `resolveChromium()`：`UI_AUDIT_CHROME` → `chromium.executablePath()` 且 `existsSync` → 失败时**报错并提示** `npx playwright install chromium`；**不得**扫描并取“最高版本”跨版本兜底（Playwright 1.58 期望 1223，1255 是 1.65/vlmkit 的版本，跨版本协议未定义）；
   - 替换 20 处硬编码（`scripts/` 19 + `lib/board-probes.mjs:8`）；vlmkit/nightly 用其自带 Playwright 或显式 `UI_AUDIT_CHROME`，不混用；
   - 加自测：env 覆盖、Playwright 期望路径、缺失时报错三条路径。
5. **`scripts/verify-doctor.mjs`**：
   - Node/npm vs `.nvmrc`/`packageManager`；`core.hooksPath`；Chromium revision 匹配；端口 3110/3120/3111/3122/3131/3132；vlmkit 版本/engines；夜审 cron；`.env` 存在性与 secret 模式（不打印值）；E2E DB 路径是否隔离；
   - 输出 PASS/WARN/FAIL；FAIL exit 1；WARN 不阻塞。
6. **CI/本地叙事（用户已裁决：不用 GitHub CI）**：
   - 删除 `.github/workflows/test.yml`、`layout-audit.yml`、`auto-merge.yml`；保留 `origin` remote、分支与 PR 推送能力；
   - 原 `test.yml` 的 lint/typecheck/unit/smoke/L3 由本地 `verify:pr` + 夜审承接；`auto-merge` 不再使用；
   - 修正 I18“已移除 layout workflow”的记录；不再出现“文档说删了、文件还在”的状态。
7. **自测**：`verify-doctor`、`setup-env`、`browser` 各加 `--self-test` 或 meta test；注入一个坏值必须红。

**验收**：

```bash
npm run verify:doctor
# PASS: node/npm/hooks/chromium-revision/ports/vlmkit/env/e2e-db-isolation
node scripts/verify-states.mjs --profile person-workload --quick   # 不设 UI_AUDIT_CHROME
node scripts/verify-visual.mjs --profile person-workload           # 不设 UI_AUDIT_CHROME
grep -rn 'chromium-1223' scripts tests lib --include='*.mjs' --include='*.ts' | wc -l   # 0
# 并发：Playwright e2e 与 audit-nightly 同时跑，两个 DB 均存活
```

**风险/回滚**：Node 24 native/Electron 失败回退 22；夜审 DB 隔离改动触及 `knexfile.e2e`/`init-e2e`，用现有 E2E 全量回归；workflow 删除需与并行会话协调。

---

### P1-1 / I19c 验证编排与选择性运行（2–3 天）

**目标**：把“改完 → 跑哪些检查”从人脑记忆变成可执行脚本；T0 典型改动 p50 ≤ 2 分钟、p95 ≤ 4 分钟（按实测分布验收，不承诺单点恒定）。

**设计**：

新增 `scripts/verify-tier.mjs`（`npm run verify:t0|t1|t2`）：

```text
verify-tier --tier t0|t1|t2 [--base <ref>] [--files a,b] [--dry-run]
```

- **变更集**：默认 `git diff --name-only <base>...HEAD` + 工作区；`--files` 可显式指定；支持暂存、未跟踪、删除文件（删除文件先过滤再传给 Jest/ESLint）。
- **映射表** `scripts/lib/verify-map.mjs`（必须有兜底，不能只覆盖目录白名单）：
  - `client/src/**`（任何子目录，含 `lib/hooks/contexts/services/i18n`）→ client typecheck + `jest --selectProjects client --findRelatedTests`；
  - `client/src/pages/*` 额外 → 对应 `verify-states` profile + page→E2E 映射；
  - `client/src/components/**` → 相关 Jest；若无法从 page 映射确定 profile，则升级 T1，不做“静态 import 反查 profile”的脆弱推断（profile 只有 URL/entity，没有源文件字段）；
  - `shared/**` → client 与 server-unit 双侧 `--findRelatedTests` + 双侧 typecheck；
  - `src/server/**` → server-unit `--findRelatedTests` + 根 typecheck；`src/server/database/**`、`migrations/**` 或事务/DB 服务 → 相关 integration；
  - `tests/unit/**` → 对应 Jest 项目 related；`tests/e2e/**` → Playwright `--only-changed`（会覆盖改动的 spec/helper/fixture 依赖）；
  - `*.css`/`index.css`/`App.css` → `lint:ui` + `verify:colors`（若碰 palette）+ visual smoke；
  - `package.json`/`package-lock.json` → `npm ls`/typecheck + 全量 T1；
  - `scripts/**` → `eslint`（TS）或 `node --check`（MJS）；`docs/**` → T1 的 markdown/link 检查；
  - 真正未知的顶层目录/文件 → **fail-loud**，提示“补映射或跑 T1”；已知目录下的新文件不得静默跳过。
- **page→E2E 映射**：同一文件维护 `pageToE2e`，每个页面必须显式登记 spec 数组或 `no-e2e` + 理由（例：`/people/:id/workload` → `tests/e2e/suites/integration/person-workload.spec.ts`；收件箱当前无 active E2E，登记 `no-e2e: component/API coverage`）。没有映射的页面 → 跑对应 suite 全量或 fail-loud，不能当作“无 E2E”。可复用 `scripts/layout-audit.config.json` 的 `route.covers` 作为 page→profile/E2E 起点，不另造一套路由表。
- **映射完整性守卫**：`scripts/check-verify-map.mjs`（或 `verify-tier --self-test`）枚举 `client/src/pages` 与 `ui-profiles`：
  - 每个页面有 profile 映射（或显式 `no-profile` 理由）；
  - 每个 profile 的 path 能对应到页面；
  - 每个页面有 E2E 映射或 `no-e2e` 理由；
  - 删除一条映射后自测必须红。
- **T0**（批内迭代）：
  - 根 typecheck + client typecheck budget（按触及域）；
  - `npx eslint <changed files>`（补上 pre-commit 不跑 lint 的缺口）；
  - `jest --selectProjects client|server-unit --findRelatedTests <files>`；0 关联测试时记录“0 related”，仍跑 typecheck，不当作失败；
  - 受影响 profile 的 `verify-states --quick`（最多 2 个；超过 2 个直接升级 T1）。
- **T1**（批末/提交前）：
  - T0 + 受影响 profile 全量 states + `verify:cache`（若 query key 变更）+ 映射到的 E2E；无映射则跑对应 suite 全量或 fail-loud；
  - `lint:ui` + 相关静态守卫。
- **T2**（里程碑/合并前）：
  - 全量 Jest + visual 分片 + 全量 E2E + states 全量 + 全量静态门禁；
  - 沿用现有 `verify:visual:shards --shards 4`；`--capture-fixtures` 与 `--shard` 仍禁止同用。
- **输出**：打印实际执行的命令、耗时、跳过项及原因；`--dry-run` 只打印计划。
- **不会替代 pre-commit**：pre-commit 仍是物理闸门；T0/T1 是“提前发现”，不是“减少门禁”。

**Playwright 配套**：

- 1.58 已具备 `--only-changed`、`--last-failed`、`failOnFlakyTests`；升级 1.65.1 是**独立可选项**（Speedboard/test locks），不阻塞本批；升级单独立项/单分支回归全量 E2E + visual smoke。
- `--only-changed` 只看测试文件的 import 依赖（spec/helper/fixture），**不覆盖 HTTP 背后的应用源码**；源码变更靠 page→E2E 映射，不靠它。
- nightly 开 `failOnFlakyTests`，让 flake 显式红；同时保留 flake 率统计，不用开关代替度量。
- **分片暂缓**：现有 E2E 共享一个 DB、`fullyParallel:false`；P0-2 先做 DB 隔离，之后才评估 per-shard DB 与 `--shard`。

**验收**：

```bash
npm run verify:t0 -- --files client/src/lib/batchShift.ts
# 3 个关联 Jest 文件 + eslint + typecheck；记录实际耗时（findRelatedTests 单跑约 32s，含 typecheck/states 会更高）
npm run verify:t1 -- --base origin/main
npm run verify:t2 -- --dry-run
npm run verify:t0 -- --self-test        # 删除一条映射/注入一个改动，必须按预期选中/报错
```

- 抽样 3 类改动（client 纯函数、页面组件、server 控制器），记录 T0 耗时分布与漏检情况；目标 p50 ≤2 min、p95 ≤4 min。
- 与全量结果对照：T0/T1 不得漏掉全量会红的检查；一次“故意注入错误”不足以证明完整性，必须配合映射枚举守卫。

**风险/回滚**：映射漂移是最大风险；用页面/profile 枚举守卫 + 季度全量对照兜底；未知文件默认扩大范围而不是跳过；脚本可单独 revert，不影响现有命令。

---

### P1-2 / I19d 静态熵治理（1–1.5 天）

**目标**：死代码/死依赖/跨层 import/重复代码有基线；新增即红；脚本面收缩。

**步骤**：

1. **knip 6.45.1**：
   - `knip.jsonc`：`entry`（不是 `entries`）= `client/src/main.tsx`、`src/server/index.ts`、`scripts/*.mjs`、`tests/e2e/**/*.spec.ts`；`project` 覆盖 `client/src/**`、`src/server/**`、`shared/**`；ignore = `dist*`、`tests/e2e/archived`、`tmp`、`coverage`；
   - **不要**把 `shared/**` 全设成 entry（会掩盖未用文件/导出）；用 knip 的插件默认入口起步，再按报告补；
   - 第一轮 `npx knip --reporter compact` **report-only**，人工 triage；
   - 清理确认的死依赖：`vitest`（无测试导入）、`lint-staged`（无 hook；若保留需接线）可列入候选；**`puppeteer-core` 不是死依赖**——`ExportFormatterService.ts:71` 动态 import 用于 PDF 导出，删除会破坏功能；
   - 清理死导出/死文件；对“看似未用但被动态引用”的项加 `ignore` 注释并写理由；
   - 稳定后：`npm run knip` 进 nightly（不是 pre-push/pre-commit）；先 `--no-exit-code` 报告，再评估 `--strict`。
2. **dependency-cruiser 18.7.2**：
   - `.dependency-cruiser.cjs` 规则：
     - `client` 不得 import `src/server/**`（`shared` 除外）；
     - `server` 不得 import `client/**`；
     - `shared` 不得 import `client/**`/`src/server/**`；
     - `electron` 只能 import 允许的公共入口；
     - `no-circular`（按现有代码决定是否先 report）；
   - 用 `--output-type baseline` 生成 `.dependency-cruiser-known-violations.json`，只对**新增**违例红；基线文件必须评审、写 owner/复查日期；
   - 接入 pre-push（不是 pre-commit）；季度复查基线，只降不升。
3. **jscpd 5.4.3（延后，低 ROI）**：
   - 本批不接入；若后续重复代码成为实际问题，再按 `min-tokens: 70` + baseline + `--fail-on-new-clones` 试点；不追求清零。
4. **scripts 清账**：
   - 46 是 `package.json`/hooks/nightly 中的**字面路径引用数**，不是调用可达性；其余脚本可能被脚本间调用、文档或人工流程引用，**不得**直接判死；
   - 清理前 `git grep` 脚本名全库 + 查 README/文档/CI；把一次性 `fix-*`/`walkthrough-*`/`spotcheck-*`/legacy `verify-*` 移到 `scripts/archive/` 或删除；
   - 新增 `scripts/README.md`：每个保留脚本一行“用途/入口/是否仍维护”；
   - 新增 `scripts/check-scripts.mjs`（或并入 knip）：新增脚本必须在 README 登记或在 `package.json`/hooks 中被引用，否则 pre-commit 提示（先 warning）。

**验收**：

```bash
npx knip --reporter compact                 # 基线报告，死依赖数下降
npx depcruise --config .dependency-cruiser.cjs client/src src/server shared
npx depcruise --config .dependency-cruiser.cjs --ignore-known ...   # 新增违例 0
```

**风险/回滚**：knip 对动态 import/脚本入口可能误报；先 report-only，误报入 ignore 并写理由；删依赖前用 `grep`/运行相关测试确认（PDF 导出是已知反例）。depcruise 基线可能掩盖存量，基线文件必须评审并设复查日期。

---

### P1-3 / I19e 测试静态质量与 bundle 预算（0.5–1 天）

**目标**：测试代码本身的坏味有静态检查；产物体积有预算。

**步骤**：

1. **eslint-plugin-jest 29.17.0**：
   - flat config `jest.configs['flat/recommended']`；
   - `no-focused-tests: error`、`no-conditional-expect: warn`、`valid-expect: error`、`no-standalone-expect: error`；
   - 对 `tests/e2e/**` 用 Playwright 规则替代（避免 Jest 规则误报）。
2. **eslint-plugin-testing-library 7.16.2**：
   - React 配置；`await-async-queries: error`、`no-debug: warn`、`no-node-access: warn`（先基线）；flat-config 导出若与当前版本不匹配，用手动 `plugins/rules` 接线并记录；
   - 先确认插件对 React 19/RTL 的规则版本，避免旧规则误报。
3. **type-aware typescript-eslint**（可选，先 warning）：
   - `no-floating-promises`、`no-misused-promises` 对 `src/server/**` 先 warning；
   - 该规则能抓 Express asyncHandler/事务链的漏 await，价值高；一次性全量红风险也高，先基线再收紧。
4. **lint 作用域补齐**：
   - 当前 `npm run lint` = `eslint src client/src shared`，**不扫描顶层 `tests/`**；新增 `lint:tests` 或在 `lint` 中加入 `tests/**/*.ts`，覆盖 Jest 单测与 Playwright spec；
   - 用一条顶层 `test.only`/`describe.only` 样例证明 `no-focused-tests` 会红；否则“测试 lint 上线”只是空话。
5. **bundle 预算**：
   - `client-vite.config.ts` 加 `rollup-plugin-visualizer`（`emitFile: false`, `filename: 'dist-client/stats.html'`）；
   - `scripts/check-bundle-size.mjs`：固定 `npm run build:client` 产物、gzip 口径；同时报告**总 JS gzip**与**最大 chunk gzip**；首屏预算单列（若路由懒加载明确，可按入口 chunk 统计）；
   - 首次测基线，预算 = 基线 × 1.10；超过即红；budget 文件写口径与更新日期；
   - 接入 `build:client` 之后 / pre-push，不进 pre-commit；加 `--self-test` 注入一个超大 chunk 必须红。

**验收**：

```bash
npm run lint          # 0 error；新增 warning 有基线；顶层 tests 被覆盖
npm run build:client  # 生成 stats.html
node scripts/check-bundle-size.mjs   # PASS；注入超大 chunk 时红
```

---

### P2-1 / I19f 测试强度（2–3 天）

**目标**：领域纯函数有不变量测试；关键模块有可复现的变异分数；coverage 有趋势但不做门禁。

**fast-check 4.10.2 + @fast-check/jest 2.3.0**：

| 模块 | 不变量（示例） |
|---|---|
| `workCalendar` | 工作日数 ≤ 自然日数；周末剔除；含两端；月份桶守恒；闰年 2 月正确 |
| `capacitySegments` | 分段并集覆盖窗口；峰值 ≤ 分段和；paused 不占容量；0 可用率 → 0 供给 |
| `workloadTimeline` | 窗口内 bar 不越界；时长非负；asOf 之后的行为一致；倒置区间归一 |
| `batchShift` | day/week 平移时长守恒；month 平移按目标月月底钳制；已开始行不能早于原 start |
| `committedBarDrag` | move 保持时长；start/end resize 规则；下界 = min(origStart, asOf) |

- 每个模块 5–10 条 property；`fc.assert(..., { numRuns: 300, seed })`；失败时打印 seed 便于复现；
- **必须固定 asOf/时钟**：`workloadTimeline`/`batchShift`/`committedBarDrag` 的 property 显式生成 asOf 并相对断言；不得使用 wall clock，否则跨日/跨时区漂移；
- 不改现有样例测试；property 测试作为补充层。

**StrykerJS（定向审计，非计划性常设机制）**：

- 精确包：`@stryker-mutator/core@10.1.1` + `@stryker-mutator/jest-runner@10.1.1`（**不是** legacy `stryker` 包；后者最新 0.35.1）；要求 Node ≥22、Jest 30 runner 已对齐；
- `stryker.config.mjs`：`testRunner: 'jest'`, `jest: { projectType: 'custom', configFile: 'jest.stryker.config.cjs', enableFindRelatedTests: true }`；`jest.stryker.config.cjs` 只选 `server-unit`（或按目标模块建专用 project），不依赖未文档化的 inline `selectProjects`；
- `mutate` 只选 2–3 个纯模块；**server-only 目标不能证明 client 变异被测试**；若要覆盖 `workloadTimeline`，另建 client 专用 config 或明确声明“本批只审 server 纯函数”；
- `incremental: true`、`concurrency: 2`、`timeoutMS: 30000`；`thresholds: { high: 80, low: 60, break: null }` 合法且**不 break**；
- 运行时机：**不设季度/CI 计划**；只在红线结构大改或出现“测试是否真的能杀变异”的具体问题时手动跑，`npm run mutation`，报告落 `reports/mutation/`；
- 这是对 `TEST_FRAMEWORK_DESIGN.md` §5.3 一次性人工校准的**可复现化**，不是新的常设 harness；若未来要季度化，先修订 §5.3 并由用户裁决（见 §15 D4）。

**coverage**：

- 夜间或月度跑 `npx jest --coverage`（或新增 `test:coverage` 脚本；当前不存在）；client/server-unit 优先，integration 可选；
- 现有 45/45/45/40 阈值保留；阈值会让 Jest exit 非 0，报告任务必须区分“覆盖率低于阈值”和“测试失败”，不能混成一个红；
- 不做 per-PR 门禁；若要更细，可用 `--collectCoverageFrom` 只统计变更文件，但不在本批强制。

**验收**：

```bash
npx jest --selectProjects client --runTestsByPath client/src/lib/__tests__/workloadTimeline.property.test.ts
npm run mutation        # 生成 reports/mutation/index.html + 分数；不 break
npx jest --coverage     # 产出 coverage/ 摘要；区分阈值失败与测试失败
```

**风险**：property 测试可能暴露真实边界 bug——这是收益，不是阻塞；先修或记录。Stryker 运行时间可能 10–100×，只跑纯模块、增量模式；Stryker 与 Jest 30/Node 22 的兼容性在 P2 开工前先用一个模块 spike 验证。

---

### P2-2 / I19g 供应链与文档（0.5–1 天）

**目标**：依赖更新有节奏；commit message 有物理约束；文档链接/格式不漂移。

**步骤**：

1. **Renovate**（或 GitHub Dependabot）：
   - `renovate.json`：`config:recommended`；`group:devDependencies`；major 单独 PR；`lockFileMaintenance` 周更；`schedule: ["before 6am on monday"]`；
   - 先统一 npm 一个 lockfile（P0-2 已处理 pnpm 残留）；
   - **依赖裁决**：若 GitHub `test.yml` 已弃用/本地化，Renovate PR 没有自动验证，改用 nightly `npm-check-updates --doctor` + 人工 PR；不要让自动化直接 push 主分支；
   - 新增依赖也走 P0-1 的准入清单（license/精确版本/provenance/维护状态）。
2. **commitlint（延后，可选）**：
   - 现有 commit 风格已基本一致；P2-2 只做评估，不默认接入；接入时 `commitlint.config.cjs` + `.githooks/commit-msg` 用项目内安装（`npx --no-install commitlint --edit "$1"`，禁止 `npx -y`）。
3. **文档漂移（延后，可选）**：
   - `markdownlint-cli2` 先只检查新增/修改文件；`lychee` 夜间检查 `docs/**/*.md` 链接（忽略 localhost/内网，报告 `tmp/docs-links/`）；
   - 89 个 docs 的全扫可能一次产生大量噪声，先 report-only；不为文档引入 Vale（中文 prose lint 收益低）。

**验收**（仅接入的项）：

```bash
echo 'bad message' | npx commitlint        # 接入时：必须拒绝
npx markdownlint-cli2 "docs/**/*.md"       # 接入时：0 error（或基线）
lychee --no-progress docs/                 # 接入时：0 broken（忽略内网）
```

---

### P3 / I19h 技能与 agent 工作流（按需，0.5–1 天）

**目标**：把重复出现的“该跑什么/怎么审”收敛成薄 skill + command；跨 agent 指令有正本。

**步骤**：

1. **AGENTS.md / CLAUDE.md 双读兼容（先验证，再定正本）**：
   - 事实：Claude Code 读 `CLAUDE.md`，Codex 读 `AGENTS.md`；把 `CLAUDE.md` 改成一行指针可能让 Claude/ZCode 丢失项目约束；
   - 先做兼容 spike：新增 `AGENTS.md`（内容以 `CLAUDE.md` 为源），`CLAUDE.md` 保持完整；分别用 Claude CLI/Codex 读一遍，确认都能拿到规则；
   - 若两者都支持 symlink/包含，则用 `AGENTS.md -> CLAUDE.md` 或生成镜像 + `check-agent-docs` 防漂移；否则保留两份但加同步检查。**不要把“一行指针”当作默认方案**。
2. **项目 skills（先做 2 个，其余按需）**：
   - 本批只做 `verify`（T0/T1/T2 命令、changed-file → check 映射、exit 2 语义）与 `security`（gitleaks/OSV/`npm audit signatures`、新端点威胁清单）；
   - `code-health`/`test-triage`/`release` 延后到 P1/P2 稳定后再评估；避免 5 个 skill 同时上线造成维护面膨胀。
3. **commands**（`.zcode/commands/`）：
   - 先做 `/verify` 与 `/security`；每个 command 只做“读 skill + 调脚本”，不写第二份规则。
4. **MCP（可选，个人级）**：
   - Playwright MCP / Chrome DevTools MCP 用于调试；**精确版本** `npm exec --package=@playwright/mcp@<version>`，禁止 `npx -y @latest`；
   - 默认 `--isolated`，不接生产库；Chrome DevTools MCP 关闭 CrUX/telemetry（`--no-performance-crux`/`--no-usage-statistics`，按实际版本）；
   - 不把 MCP 当正式评审链路；Evidence Bundle 仍是确定性取证；
   - 不在 `.mcp.json` 提交任何凭证；写操作型 MCP 需单独评审。
5. **评审 agent eval（延后/可选）**：
   - promptfoo 本批不接入；若未来要做，用 5–10 个历史事故 golden set，季度跑一次，只评估召回/误报。
6. **并行会话纪律**：P0/P1 会动 `.zcode/`、`CLAUDE.md`、`package.json`、`.github/workflows/`、`.githooks/`；落地前在台账声明独占窗口，避免与并行会话互踩。

**验收**：`/verify` 能打印并执行 T0；`AGENTS.md` 与 `CLAUDE.md` 双读兼容 spike 通过；skill 内无大段复制。

---

## 5. 实施顺序与依赖

```text
P0-1 I19a 安全与凭证 ──┐
                       ├──> P1-1 I19c 验证编排 ──> P2-1 I19f 测试强度
P0-2 I19b 环境确定性 ──┘         │
                                 ├──> P1-2 I19d 静态熵
                                 └──> P1-3 I19e 测试静态质量/bundle
P2-2 I19g 供应链/文档（可与 P1 并行）
P3   I19h 技能/工作流（P1 后按需）
```

- P0-1 先于一切（凭证）；token 已推送，撤销不设过渡窗口。
- P0-2 是 P1-1 的前置（Node/Chromium 稳定 + 夜审/E2E 数据库隔离）。
- Playwright 1.65 升级从 P1-1 拆出，作为独立可选项；1.58 已具备本批所需的选择/重试/flake 开关。
- P1-2/P1-3 可与 P1-1 并行，但同一周不要同时动 `package.json`/lockfile，避免安装态冲突。
- P2-1 依赖 P1-1 的快速反馈；否则 property/mutation 迭代太慢。
- P2-2 可与 P1 并行，但 Renovate 第一次 PR 要等 P0-2 统一 lockfile。

---

## 6. 验收与度量

| 指标 | 基线 | 目标 | 命令/证据 |
|---|---|---|---|
| Secret findings | 至少 1 个已推送的 Jenkins token；`.env.example` 含具体 key | 工作区/暂存 0；历史 0 未豁免（撤销类精确 allowlist 除外） | `gitleaks git --pre-commit --redact --staged --verbose`；`gitleaks git --config gitleaks.toml --redact` |
| 依赖漏洞 critical/high | 首次扫描 160（13 critical / 147 high），已入 `security/osv-baseline.json` | **不新增** vs baseline；存量按 follow-up 清偿 | `node scripts/security-audit.mjs --deps` |
| `verify:doctor` | 不存在 | PASS | `npm run verify:doctor` |
| 夜审/E2E DB 隔离 | 共享 `.e2e-data/e2e-test.db`，夜审启动删库 | 两库并存，互不删除 | 并发启动 3111/3122 + 3131/3132 |
| 硬编码 Chromium 路径 | 20 处（scripts 19 + lib 1） | 0 | `grep -rn chromium-1223 scripts tests lib` |
| T0 典型改动耗时 | 无（常跑全量）；findRelatedTests 3 文件约 32.5s | p50 ≤2 min，p95 ≤4 min（实测分布） | `verify-tier --tier t0` 计时 |
| pre-commit 墙钟 | 未测 | 不增加（先测基线，不设 -20% 口号） | 暂存一个无关文件后 `time sh .githooks/pre-commit` |
| knip 死依赖/死导出 | 未测 | 死依赖 0；死导出基线只降 | `npx knip --reporter compact` |
| depcruise 新增违例 | 未测 | 0 | `--ignore-known` |
| bundle gzip | 未测 | 总 JS gzip 与最大 chunk 均 ≤ 基线 +10% | `check-bundle-size.mjs` |
| 领域 property 测试 | 0 | 5 模块 × 5–10 条（固定 asOf/时钟） | Jest property 文件 |
| 变异分数（试点） | 已有一次性人工 20 变异报告 | 有定向报告；不设硬阈值/不排期 | `npm run mutation` |
| 文档断链 | 未测 | 接入时 0（忽略内网） | `lychee docs/` |
| flake 率 | 未测 | 有统计后 <2% | nightly + `failOnFlakyTests` + flake 统计 |

---

## 7. 风险与回滚

| 风险 | 影响 | 缓解/回滚 |
|---|---|---|
| Jenkins token 已推送 | 凭证泄漏 | **立即撤销**，不保留过渡窗口；更新使用方；MCP 可先删除 |
| ENCRYPTION_KEY 轮换破坏 GitHub 存量凭证 | GitHub 连接不可用 | 先盘点 `github_connections` 密文行；无重加密迁移不轮换；只轮换 JWT/Token 或接受开发数据重置 |
| 取消跟踪 `.env.*` 导致干净检出/E2E/Electron 打包失败 | 开发/CI 起不来 | `.env.e2e` 测试模板 + `setup-env.mjs` 按环境生成；生产由部署注入；单独验证 Electron 读取路径 |
| 夜审/E2E 共享数据库 | 夜审启动删掉 E2E 库 | P0-2 先做 DB 路径隔离 + 互斥锁；并发验收 |
| Node 24 触发 native/Electron ABI 问题 | 安装/测试/安装包失败 | 30–60 分钟 spike；失败回退 22 并记录双基线；不能只忽略 engines warning |
| Playwright 1.65 升级引入 breaking change | E2E 红 | 从 P1 拆出；单独分支全量回归；失败回退 1.58 |
| knip 误报动态引用 | 误删（已知 puppeteer-core） | report-only 起步；误报入 ignore 并写理由；删依赖前 grep/测试 |
| depcruise 基线掩盖存量 | 债务不动 | 基线文件评审 + owner/复查日期；只降不升 |
| 选择性运行漏检 | 假绿 | 已知目录兜底 + 未知文件 fail-loud；页面/profile 枚举守卫；季度全量对照 |
| 新工具拖慢 pre-commit | 提交体验变差 | 新工具默认进 pre-push/nightly；pre-commit 只留快速物理闸门；先测基线 |
| 并行会话改同一文件 | 冲突/覆盖 | P0/P1 声明独占窗口；按台账领号；共享文件先登记 |
| MCP 工具权限过大 | 数据/凭证风险 | 精确版本；默认 `--isolated`；只读；不提交凭证；写操作单独评审 |

---

## 8. 不引入（决策记录）

| 项 | 理由 |
|---|---|
| ts-prune / depcheck | 前者 2021 年后无发布，后者仓库 2025-02 归档；knip 覆盖 |
| madge / Sheriff | 只画图/强观点预设；单包项目不需要 |
| Storybook / Ladle / Histoire | 与 `verify:states` 重叠；Ladle 自带 Vite 6 且久未更新；Histoire 要求 Vite 7.3，与 Vite 5 不兼容 |
| Chromatic / Percy / Lost Pixel / reg-suit | Storybook 绑定/云上传/归档/自运维；视觉复核优先本地 HTML diff |
| SonarQube / ReportPortal / Nx / Turbo | 重型平台；单包 + 现有自定义门禁已足够 |
| Vitest 迁移 | 276 个测试文件；Jest 30 正常；迁移是纯 churn |
| 全量变异门禁 | 10–100× 运行时间；只做定向、增量、周期性审计 |
| SQLite MCP | 官方参考 server 已归档；写权限对 `data/` 是风险 |
| Semgrep MCP | 独立仓库 2025-10 归档；直接用已装 Semgrep CLI |
| CodeRabbit CLI | diff 上传云端，与本地优先冲突 |
| pa11y / IBM Equal Access | 与 axe 重叠；除非需要第二套规则引擎 |
| Hurl / Bruno / Allure / ReportPortal | 与 Playwright API/HTML 报告重叠 |
| OpenAPI/TypeSpec 全量 | 当前是内部 API；先做 OSV/knip/fast-check 更划算 |

---

## 9. 台账登记草案（开工时粘贴）

> 当前 `I19` 空闲（`I18` 已被 2026-11-14 夜审占用）。正式开工前用
> `node scripts/check-ledger.mjs --next I19` 复核；以下为 §7 汇总行与子任务行的草案，
> 状态从“待处理”开始，实施后补 HEAD/提交/验收命令/实际值。

**§7 汇总行（草案）**

| 工作包 | 覆盖来源/证据 | 状态 | 负责人 | 实施提交/PR | 验收记录 |
|---|---|---|---|---|---|
| I19 | 2026-11-14 工具调研；本方案 §1 E1–E13 | 待处理 | — | — | — |

**§7 子任务行（草案）**

| 子任务 / 证据 | 状态 / 负责人 | 领取HEAD / 原有改动 | 实施提交 / 变更文件 | 验收命令 / 用例及实际结果 | 未关闭项 / 裁决 |
|---|---|---|---|---|---|
| I19a / 安全与凭证治理（E1–E3） | 待处理 / — | — | `.mcp.json`、`.gitignore`、`.env.example`、`.env.e2e`、`scripts/setup-env.mjs`、`gitleaks.toml`、`.githooks/pre-commit`、`package.json` | `gitleaks git --pre-commit --staged` 0；`gitleaks git` 全史 0 未豁免；`osv-scanner scan -L` 0 critical/high；`npm audit signatures` 通过；`git ls-files '.env*'` 仅 example/e2e | 历史重写需裁决；ENCRYPTION_KEY 存量盘点；Jenkins 使用方确认 |
| I19b / 环境确定性与夜审隔离（E4–E5） | 待处理 / — | — | `.nvmrc`、`package.json`、`scripts/lib/browser.mjs`、`scripts/verify-doctor.mjs`、`src/server/database/knexfile.e2e.ts`、`src/server/database/init-e2e.ts`、`scripts/audit-nightly.mjs`、`.github/workflows/*`（删除）、20 处脚本替换 | `verify:doctor` PASS；夜审/E2E 并发不删库；不设 `UI_AUDIT_CHROME` 跑 states/visual；`grep chromium-1223`=0；GitHub workflows 已删、PR push 仍可用 | Node 24 vs 22 spike；DB 隔离回归 |
| I19c / 验证编排与选择性运行（E7–E8） | 待处理 / — | — | `scripts/verify-tier.mjs`、`scripts/lib/verify-map.mjs`、`scripts/check-verify-map.mjs`、`package.json` | 抽样 3 类改动 T0 p50≤2min/p95≤4min；映射枚举守卫；注入删除映射必红；T2 dry-run 全量 | 映射漂移；E2E 分片暂缓（需 DB 隔离） |
| I19d / 静态熵治理（E6、E10） | 待处理 / — | — | `knip.jsonc`、`.dependency-cruiser.cjs`、`scripts/README.md`、`scripts/archive/` | knip 死依赖 0（保留 puppeteer-core）；depcruise 新增 0；脚本数下降 | jscpd 延后；knip 误报；depcruise 基线复查 |
| I19e / 测试静态质量与 bundle（E10–E11） | 待处理 / — | — | `eslint.config.mjs`、`package.json` lint 脚本、`client-vite.config.ts`、`scripts/check-bundle-size.mjs`、`bundle-budget.json` | lint 覆盖顶层 tests；顶层 focused test 必红；总 JS/最大 chunk gzip PASS；注入超大 chunk 必红 | type-aware 规则先 warning |
| I19f / 测试强度（E9） | 待处理 / — | — | `*.property.test.ts`、`stryker.config.mjs`、`jest.stryker.config.cjs` | property 300 runs 绿（固定 asOf）；`@stryker-mutator/core@10.1.1` 报告生成；coverage 报告 | Stryker 不排期/不 break；property 真实 bug 单列 |
| I19g / 供应链与文档（E12） | 待处理 / — | — | `renovate.json`（或 nightly ncu）、可选 commitlint/markdownlint/lychee | Renovate PR；接入项验收 | GitHub vs 本地 CI 裁决；commitlint/docs 延后 |
| I19h / 技能与工作流（E13） | 待处理 / — | — | `AGENTS.md`、`.zcode/skills/{verify,security}/SKILL.md`、`.zcode/commands/{verify,security}.md` | `/verify` 可执行；双读兼容 spike 通过；skill 无规则复制 | 其余 skills/promptfoo 延后；MCP 可选 |

---

## 10. 待确认（含评审新增裁决）

1. **Node 基线（2026-11-14 实施裁决）**：本批固定 **Node 22.23 + npm 12.0.2**（`.nvmrc=22`、`engines>=22.12`）。vlmkit 0.24 的 `>=24` 作为**已记录例外**（夜审实测可运行）。Node 24 需要重建 better-sqlite3 ABI，且会打断并行会话，拆为后续独立 spike，不在 P0 强切。
2. **GitHub CI 去留（2026-11-14 用户裁决，已实施）**：**保留推送 PR 的能力，不使用 GitHub CI**。`.github/workflows/test.yml`、`layout-audit.yml`、`auto-merge.yml` 已删除；`origin` remote、分支与 PR 推送能力保留。原 `test.yml` 的 lint/typecheck/unit/smoke/L3 由本地 `verify:pr` + 夜审承接；`auto-merge` 不再使用。I18 记录已同步修正。
3. **视觉复核**：默认本地 HTML diff；若接受云上传再评估 Argos（免费 5k/月）。
4. **OpenAPI**：仅在 API 成为外部契约时启动；当前不进本方案。
5. **ENCRYPTION_KEY 轮换（D1，非用户决策，已实施工具）**：`EncryptionService` 用它加密 `github_connections` 的 GitHub OAuth token。是否能直接轮换只取决于“该环境有没有已加密行”，由脚本盘点后自动决定：
   - 0 行 → 直接轮换；
   - >0 行 → 先重加密（旧 key 解密→新 key 加密→事务 + `encryption_version` 递增），或本环境暂缓；
   - 开发库已实测 **0 行**，`--rotate` 通过；生产路径 `/var/www/capacinator/data/capacinator.db` 需在部署机跑同一只读盘点。
   `scripts/rotate-encryption-key.mjs` 已实现 `--check`（只读）、`--re-encrypt`、`--rotate`；没有 `--re-encrypt` 时拒绝在有密文行的库上 `--rotate`。不需要用户做业务裁决。
6. **Stryker 常设性（D4）**：本方案按“手动、无排期、无 CI、不 break”执行；若未来要季度化，必须修订 `TEST_FRAMEWORK_DESIGN.md` §5.3 并由用户裁决。
7. **OSV 联网语义**：允许联网查询包元数据；断网记“未完成”（exit 2），不能当 0 漏洞通过；离线数据库作为可选增强。
8. **Playwright 升级**：1.58 已具备本批所需开关；1.65 升级拆为独立可选项，不阻塞 P1。
9. **Jenkins MCP（2026-11-14 用户裁决，已实施）**：**已删除 `.mcp.json`**（Jenkins + shadcn MCP 一并移除）。保留 `Jenkinsfile`（Jenkins CI 本体与 MCP 无关）；token 需在 Jenkins 侧撤销/轮换。若未来确实要在 agent 里操作 Jenkins，再按 Linux/精确版本/环境变量/TLS 正常校验重建。
10. **AGENTS.md 正本**：先做 Claude/Codex 双读兼容 spike；默认保留 `CLAUDE.md` 完整内容，`AGENTS.md` 作为镜像/符号链接 + 漂移检查，不直接把 `CLAUDE.md` 改成一行指针。

---

## 11. 预估工时与批次

| 批次 | 内容 | 预估 | 退出条件 |
|---|---|---|---|
| P0 | I19a + I19b | 1.5–2 天 | 凭证撤销；gitleaks/OSV 0；doctor PASS；夜审/E2E DB 隔离；browser 解析统一 |
| P1 | I19c + I19d + I19e | 3–4 天 | T0 p50≤2min/p95≤4min；映射守卫；knip/depcruise 基线；bundle 预算 |
| P2 | I19f + I19g | 3–5 天 | property 测试；定向 mutation 报告；Renovate；文档项按需 |
| P3 | I19h | 0.5–1 天 | verify/security skill + 双读兼容 |

合计约 **8–12 个工作日**，按试点预算管理；6–10 天是偏乐观下限，遇到 ENCRYPTION_KEY 存量/Electron 打包/夜审 DB 回归会拉长。

---

## 12. 预测变更文件

```text
.mcp.json                # 去 secret / 去 Windows-only / 删 shadcn
.gitignore                # .env* + !.env.example + !.env.e2e + pnpm 残留
.env.example              # 占位符化（具体 key 改 REPLACE_ME）
.env.e2e                  # E2E 专用模板（固定测试 key，无生产凭证）
.nvmrc
CLAUDE.md                 # Node/env 约定、评审结论入口
package.json              # packageManager、scripts、devDeps、lint 范围
package-lock.json
.githooks/pre-commit      # gitleaks
.githooks/pre-push        # depcruise（knip 进 nightly）
scripts/setup-env.mjs
scripts/lib/browser.mjs
scripts/verify-doctor.mjs
scripts/verify-tier.mjs
scripts/lib/verify-map.mjs
scripts/check-verify-map.mjs
scripts/check-bundle-size.mjs
scripts/README.md
lib/board-probes.mjs      # 浏览器路径替换
src/server/database/knexfile.e2e.ts   # E2E_DB_PATH 覆盖
src/server/database/init-e2e.ts       # 安全删除 + 路径校验
scripts/audit-nightly.mjs             # 独立 DB + 互斥
knip.jsonc
.dependency-cruiser.cjs
.dependency-cruiser-known-violations.json
stryker.config.mjs
jest.stryker.config.cjs
renovate.json
client-vite.config.ts     # visualizer
eslint.config.mjs         # jest/testing-library/type-aware
tests/**/*.property.test.ts
src/server/services/calc/**/*.property.test.ts
AGENTS.md
.zcode/skills/{verify,security}/SKILL.md
.zcode/commands/{verify,security}.md
# 可选/延后：.jscpd.json、commitlint.config.cjs、.markdownlint-cli2.jsonc
```

> 不涉及产品行为代码；`knexfile.e2e.ts`/`init-e2e.ts`/`audit-nightly.mjs` 是测试基础设施，改动必须用现有 E2E 全量回归。`client-vite.config.ts` 只加构建插件；`ExportFormatterService` 的 puppeteer-core 不动。

---

## 13. 关闭标准

- 所有 P0/P1 验收命令在当前 HEAD 实际执行并记录实际值（不是“类型通过/测试绿”一句话）。
- P2 的 property/mutation 报告入库；真实缺陷单独立项，不混在工具接入里。
- 每个新增守卫都有：机制切片、触发时机、失败语义、变异/注入自证、回滚方式。
- 台账 I19a–I19h 更新到“完成/部分完成”，剩余项写清原因与复查日期。

---

## 14. 外部工具版本与来源（2026-11-14 调研）

> 版本为调研日 npm/GitHub 结果；实施时复核并用精确版本安装，禁止 `npx -y <pkg>` 拉最新。

| 工具 | 版本 | 来源 |
|---|---|---|
| gitleaks | 8.30.1 | https://github.com/gitleaks/gitleaks；pre-commit 用 `gitleaks git --pre-commit --redact --staged --verbose`（`protect` 已弃用；`git --staged` 在 8.30.1 源码存在） |
| OSV-Scanner | 2.7.1 | https://github.com/google/osv-scanner；v2 用 `osv-scanner scan -L package-lock.json`（`scan source` 可省略） |
| knip | 6.45.1 | https://knip.dev；配置键是 `entry`/`project`，不要把 `shared/**` 全设 entry |
| dependency-cruiser | 18.7.2 | https://github.com/sverweij/dependency-cruiser |
| jscpd | 5.4.3 | https://github.com/kucherenko/jscpd；本批延后 |
| StrykerJS | `@stryker-mutator/core@10.1.1` + `@stryker-mutator/jest-runner@10.1.1` | https://stryker-mutator.io；legacy `stryker` 包停在 0.35.1，**不要装错**；runner 已对 Jest 30/Node ≥22，`break:null` 合法 |
| fast-check / @fast-check/jest | 4.10.2 / 2.3.0 | https://fast-check.dev / https://www.npmjs.com/package/@fast-check/jest |
| eslint-plugin-jest | 29.17.0 | https://github.com/jest-community/eslint-plugin-jest |
| eslint-plugin-testing-library | 7.16.2 | https://github.com/testing-library/eslint-plugin-testing-library |
| Playwright | 已装 1.58.0；1.65.1 可选 | https://playwright.dev/docs/release-notes；1.58 已支持 `--only-changed`/`--last-failed`/`failOnFlakyTests`，升级不阻塞 P1 |
| rollup-plugin-visualizer | 7.1.3 | https://github.com/bjornstar/rollup-plugin-visualizer |
| Renovate | — | https://docs.renovatebot.com |
| commitlint | — | https://commitlint.js.org |
| markdownlint-cli2 | 0.24.x | https://github.com/DavidAnson/markdownlint-cli2 |
| lychee | — | https://github.com/lycheeverse/lychee |
| Playwright MCP | 0.0.85 | https://github.com/microsoft/playwright-mcp |
| Chrome DevTools MCP | 1.13.0 | https://github.com/ChromeDevTools/chrome-devtools-mcp |
| AGENTS.md | — | https://agents.md/ |
| agentskills.io 规范 | — | https://agentskills.io/specification |

---

## 15. 三方评审记录（2026-11-14）

### 15.1 评审方与结论

| 评审方 | verdict | 主要判断 |
|---|---|---|
| Codex（codex-cli 0.167.1，只读） | **APPROVE_WITH_CHANGES** | 方向可取；环境迁移、选择性验证、夜审隔离未闭合；P0 一天、P1 两三天偏乐观；要求先修凭证、DB 隔离、选择器兜底、workflow 停用 |
| Claude（Claude Code 2.1.312，glm-5.3，只读） | **APPROVE_WITH_CHANGES** | 事实底座扎实；puppeteer-core 被误判为死依赖、verify-map 跑不通自身验收样例、gitleaks 验收与本地 `.env` 互斥、浏览器解析取最高版本会错配；Stryker 404 为包名误报 |
| ZCode 本会话（第三评） | **APPROVE_WITH_CHANGES** | 同意上述；补充 OSV v2 命令、页面→E2E 映射、映射枚举守卫、新工具自测/基线、AGENTS 双读兼容 |

### 15.2 采纳的 [GUARD]

| ID | 来源 | 问题 | 处置（已写入本方案） |
|---|---|---|---|
| G1 | Claude | `puppeteer-core` 被列为死依赖，实际由 `ExportFormatterService.ts:71` 动态 import 用于 PDF | E10 改为“动态使用”；P1-2 明确保留；删依赖前 grep/测试 |
| G2 | Claude | verify-map 只覆盖 pages/components/src.server/e2e/css/migrations，验收样例 `client/src/lib/batchShift.ts` 会 fail-loud | P1-1 加 `client/src/**`、`shared/**`、`tests/unit/**` 兜底；未知顶层才 fail-loud |
| G3 | Claude/Codex | gitleaks `protect` 已弃用；`gitleaks dir .` 会扫 node_modules/本地 `.env` | P0-1 改 `gitleaks git --pre-commit --redact --staged --verbose`；工作区只扫源码目录；历史用精确 allowlist |
| G4 | Claude | 浏览器解析“取最高版本”会用 1255 驱动 1.58；硬编码实际 20 处（含 `lib/board-probes.mjs:8`） | P0-2 改为匹配 Playwright 期望 revision，缺失即报错；替换 20 处 |
| G5 | Claude | 声称 `stryker@10.1.1`/`@stryker-js/core` 404 | **未采纳（包名误报）**：`@stryker-mutator/core@10.1.1` 与 `@stryker-mutator/jest-runner@10.1.1` 均存在；legacy `stryker` 最新 0.35.1。计划已补精确包名 |
| G6 | Codex | 夜审换端口但共享 `.e2e-data/e2e-test.db`，`init-e2e.ts:33` 启动删库 | P0-2 新增 DB 路径隔离 + 互斥 + 并发验收 |
| G7 | Codex | `.env.example` 不能直接复制；production 实际读 `.env`；test/e2e 各有加载路径 | P0-1 增加环境加载矩阵；`setup-env` 按环境生成；生产禁止自动生成 |
| G8 | Codex | `layout-audit.yml:7-21` 仍有触发器，注释不能停用 | P0-2 要求实际删除/禁用或修正 I18 记录 |
| G9 | Codex | 风险表曾写“保留旧 token 过渡窗口”，与已推送事实冲突 | P0-1/§7 改为立即撤销，不设过渡 |
| G10 | Codex | `npm run lint` 不扫描顶层 `tests/`，测试 lint 规则会漏域 | P1-3 加 `lint:tests` 或在 lint 中加入 `tests/**/*.ts`，并用顶层 focused test 证明 |
| G11 | Codex | 选择性运行缺暂存/未跟踪/删除文件、传递引用、0 关联测试、超额 profile 的兜底 | P1-1 加文件状态处理、映射枚举守卫、未知扩大范围 |
| G12 | ZCode | 新工具缺自测/基线；pre-commit -20% 无机制 | §3/§6 加 self-test 要求；先测基线，删除无依据的 -20% |
| G13 | ZCode | `CLAUDE.md` 改一行指针可能让 Claude/ZCode 丢失规则 | P3 改为先做双读兼容 spike，默认保留 CLAUDE.md 完整内容 |
| G14 | ZCode | 新增多个 devDependency，未要求 license/provenance/精确版本 | P0-1 加新依赖准入清单 |

### 15.3 [DECISION] 处置

| ID | 事项 | 处置/推荐 |
|---|---|---|
| D1 | ENCRYPTION_KEY 轮换范围 | **不是用户裁决**：`scripts/rotate-encryption-key.mjs` 已实现并盘点；开发库 0 行，`--rotate` 通过；生产部署机跑同一 `--check`，>0 行先 `--re-encrypt` 或暂缓 |
| D2 | 敏感历史是否已 push | **已核实**：`.mcp.json` 在 `origin/main` 与 `origin/feature/i01-demand-intake` 历史中；按已泄露处理，立即撤销 |
| D3 | packageManager npm@12 vs 本机 9.2.0 | 固定到所选 Node 实际自带 npm 版本；`verify:doctor` 检查，不写“以本机为准” |
| D4 | Stryker 是否常设 | 本方案按“手动、无排期、无 CI、不 break”执行；季度化须先修订 `TEST_FRAMEWORK_DESIGN.md` §5.3 并裁决 |
| D5 | OSV 联网 | 允许联网查询包元数据；断网记“未完成”，不能当 0 漏洞通过 |
| D6 | Playwright 升级 | 1.58 已具备本批所需；1.65 拆为独立可选项，不阻塞 P1 |
| D7 | Jenkins MCP | **用户裁决（2026-11-14）**：已删除 `.mcp.json`（Jenkins+shadcn）；保留 Jenkinsfile；token 需外部撤销/轮换 |
| D8 | AGENTS.md 正本 | 先做 Claude/Codex 双读兼容 spike；默认 CLAUDE.md 完整 + AGENTS.md 镜像/符号链接 + 漂移检查 |
| D9 | GitHub CI | **用户裁决（2026-11-14）**：保留 PR 推送能力，不使用 GitHub CI；3 个 workflows 已删除；`scripts/verify-pr.mjs` 已承接本地门禁 |

### 15.4 未采纳/NIT（附理由）

- **Stryker 404（Claude G5）**：包名误报；以 `@stryker-mutator/core@10.1.1` + `@stryker-mutator/jest-runner@10.1.1` 为准，开工前再跑一次 `npm view`。
- **jscpd**：本批延后（ROI 最低）；保留为后续可选。
- **promptfoo**：本批不接入；评审 agent eval 延后。
- **五个 skill**：本批只做 `verify` + `security`；其余按需。
- **commitlint/文档全扫**：延后；先做 Renovate。
- **“46 个引用”口径**：改为“字面路径引用数”，不是调用可达性；其余脚本不得直接判死。
- **coverage“无度量”**：改为“无持续度量；已有一次性 20 变异校准报告”，不否定既有工作。
- **E4/E7 数字**：Node/npm 因 shell 不同而异；Jest 276 是静态 glob，5043/361/160/18–25min 是台账/历史记录，未在本轮重跑。

### 15.5 评审边界

- 原始报告：`tmp/codex-plan-review.md`、`tmp/claude-plan-review.md`（本地，gitignored；不随仓库提交）。
- Codex/Claude 均为只读；未修改文件、未跑全量测试/服务/迁移；个别工具版本来自 registry/官方文档，兼容性以开工 spike 为准。
- Codex 的只读沙箱使 Jest 收集尝试因缓存写入被拒，改用静态计数；Claude 未安装 gitleaks/Stryker，命令面以官方源码/文档核对。
- 本记录不替代实施验收；P0/P1 每条仍需实际命令与实际值。

### 15.6 结论

三方一致 **APPROVE_WITH_CHANGES**。按 §15.2 修订后，方案可进入 P0；剩余需用户/工程裁决的是 D1（ENCRYPTION_KEY 范围）、D4（Stryker 是否季度化）、D7（Jenkins MCP 去留）、D8（AGENTS 正本方式），其余按默认推荐执行。

---

## 16. P0 实施记录（2026-11-14）

**提交**：`888f45d`（`feat(tooling): land P0 security and environment hardening (I19a/I19b)`）

### 16.1 已落地

- **凭证/secret**：删除 `.mcp.json`（Jenkins + shadcn，含明文 token/TLS 关闭）；取消跟踪 `.env.development/.qa/.staging/.production`，保留 `.env.test`/`.env.e2e` 测试模板并标注；`.env.example` 具体 key 改占位符；新增 `scripts/setup-env.mjs`（`--self-test`/`--rotate`，开发 JWT/ENCRYPTION 已轮换）。
- **扫描**：`gitleaks.toml` + `.gitleaksignore` + pre-commit staged 扫描；`scripts/security-audit.mjs` 统一 secrets/deps/signatures；`security/osv-baseline.json`（160 critical/high 存量基线，只拦新增）+ `security/signature-exceptions.json`。
- **数据密钥**：`scripts/rotate-encryption-key.mjs`（`--check`/`--re-encrypt`/`--rotate`）；开发库实测 0 行，`--rotate` 通过。
- **环境**：`.nvmrc=22`、`engines>=22.12`、`packageManager npm@12.0.2`；`scripts/lib/browser.mjs` 统一 20 处 Chromium 路径；`scripts/verify-doctor.mjs`。
- **夜审隔离**：`knexfile.e2e.ts` 支持 `E2E_DB_PATH`/`DATABASE_URL`；`init-e2e.ts` 拒绝删除 `.e2e-data` 外路径；`audit-nightly.mjs` 使用 `audit-nightly.db` + 互斥锁。
- **GitHub**：删除 `test.yml`/`layout-audit.yml`/`auto-merge.yml`；保留 PR push；新增 `scripts/verify-pr.mjs` 本地承接 lint/typecheck/unit/collection/redline，`--skip-e2e` 可用。
- **TLS**：取消跟踪 `ssl/dev.capacinator.com.key`，`.gitignore` 加 `ssl/*.key`。

### 16.2 验证结果

| 命令 | 实际结果 |
|---|---|
| `node scripts/setup-env.mjs --self-test` / `--rotate` | PASS；开发 JWT/ENCRYPTION 已轮换 |
| `gitleaks git --pre-commit --staged` / `gitleaks git` | 暂存 0；全历史 815 commits，0 未豁免（3 条已轮换/删除历史 finding 用 fingerprint 豁免） |
| `node scripts/security-audit.mjs --all` | secrets 0；OSV 310 findings（160 critical/high）基线 160、新增 0；signatures 1 个过期 key 有例外 |
| `node scripts/rotate-encryption-key.mjs --check` / `--rotate` | 开发库 `github_connections` 0 行；安全轮换通过 |
| `node scripts/verify-doctor.mjs` | PASS；vlmkit `>=24` 对 Node 22 为 WARN 例外 |
| `E2E_DB_PATH=.e2e-data/audit-nightly-test.db ... src/server/index.ts` | `/api/health` 200 environment=e2e；默认 `.e2e-data/e2e-test.db` mtime 不变 |
| `node scripts/verify-pr.mjs --skip-e2e` | 全绿；Jest **5046 passed / 0 failed**；collection 361/160；redline annotations 2 files |
| `.githooks/pre-commit` | 全门禁过（含新 secret scan） |

### 16.3 残留（未关闭）

1. **Jenkins token** 需在 Jenkins 侧撤销/轮换；本地已从 HEAD 删除，但历史仍在。
2. **生产 ENCRYPTION_KEY** 需在部署机跑 `node scripts/rotate-encryption-key.mjs --check --db /var/www/capacinator/data/capacinator.db`；>0 行则先重加密或暂缓。
3. **历史重写**未做（需用户批准）；`.gitleaksignore` 只覆盖已轮换/删除的历史 fingerprint。
4. **OSV 160 critical/high 存量**仅基线，未清偿；按 follow-up 分批处理。
5. **Node 24** 未升级；当前固定 22，vlmkit `>=24` 为已记录例外；升级需重建 better-sqlite3 ABI，拆独立 spike。
6. **Full E2E smoke/L3** 未在活跃 e2e 栈上重跑；`verify:pr` 已提供 `--skip-e2e`/全量两种模式。
7. **dev.capacinator.com TLS key** 已从 HEAD 移除但历史仍在；若该域名仍使用，需重签证书。

### 16.4 下一步

P1-1 `verify-tier`（T0/T1/T2 + `findRelatedTests` + page→E2E 映射 + 映射枚举守卫），随后 P1-2/P1-3。
