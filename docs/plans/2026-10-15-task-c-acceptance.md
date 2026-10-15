# 任务 C 实施与验收记录

状态：2026-10-15，任务 C 必做范围（C0–C6）已完成本地实施与验收。C7 是可选一致性整理，本轮不单列执行。

本记录只关闭任务 C 的颜色治理范围。总改进计划中的计算、导入语义、推荐业务链和交互问题继续按原任务处理。所有数量表示扫描出现次数或实际执行量，不表示同样数量的用户缺陷。

## 扫描与处置结果

首次正式扫描为 1481 次、64 文件、202 次令牌定义。C6 修正模板尾片段解析后，在原始源码中补识别出一处 `ProjectDetail.tsx` 的 `#1f2937`，已保留发现及令牌化决议；可重放的原始口径为 1482 次。

| 当前处置 | 身份数 | 出现次数 | 依据 |
|---|---:|---:|---|
| 令牌定义 | 254 | 254 | CSS 自定义属性定义，与消费分开计数 |
| 非颜色候选 | 22 | 24 | 枚举、类名后缀、示例文字、动态颜色格式化片段；有理由及适用的源文件哈希 |
| 保留数据颜色 | 38 | 38 | 阶段、用户颜色选择、稳定头像类别、黑白文字选择；有效双主题证据 |
| 未加载资产保留 | 91 | 91 | 入口引用闭包不可达；内容变化或重新引入使处置失效，必须先迁移和验证 |
| 未分类／待修／待迁移 | 0 | 0 | `governanceComplete` 静态门禁已开启 |
| 合计 | 405 | 407 | 26 个当前含候选的文件 |

全任务历史保留 1022 次令牌化、89 次退役、16 次去重／删除／计算颜色替代。新增 52 次令牌定义，因此 `1482 + 52 - 1022 - 89 - 16 = 407`。退役和去重不计作视觉缺陷修复。

C5 已独立提交 `9d68da0`。C6 的可达性与分类守卫先行提交 `5f40f0e`；剩余颜色实施、验收器、证据与像素基线提交为 `ab57ccf`。逐消费映射及保留决定在 `tests/visual/migrations/TC-C5.json`、`TC-C6-classification.json`、`TC-C6-migration.json` 和主账本中。

## C6 实际覆盖与修复

覆盖导入／导出、项目类型列表和层级、迭代负荷、四类报表、地点、审计、人员及角色详情、带标签项目详情、分配页和智能分配弹窗，同时回归已有需求台、路线图、场景和设置域。

- 导入提示、必需／可选徽章、成功／警告／错误反馈采用实际主题角色；错误进度文字及进度条分别满足文字和图形阈值。
- 图表保留系列色相及顺序，使用独立 `--series-*` 图形令牌；图例和 tooltip 文字使用文字角色。颜色样式随组件加载；非空 ProjectDemandChart 不借用父页面的旧样式表。另补测可见 SVG 文字，修复约3.95:1的轴标题；axe可能跳过的aria-hidden坐标文字由独立检查器验证。
- 用户保存的十六进制颜色保持原值。标签文字改用已有黑白对比度选择器；灰色头像的真实浅色表面从约 4.48:1 提升到合格范围；颜色选项有可辨认边界。
- 带标签的项目详情直接进入时，标签文字自带颜色，修复依赖其他页面 CSS 加载才能可读的问题。
- 智能分配的匹配徽章、产能提示和预览移除 `hsl(hex)`；`lint:ui` 新增状态家族及主色角色 HSL 包装守卫。合法的 shadcn 三元组和 `--primary-foreground` 保留。
- 修复导出按钮和图表页签切换时前景／背景同时过渡造成的短暂不可读；修复深色报表链接悬停、地点删除悬停等实际状态问题。
- 项目类型层级页按真实 `{success,data:[父节点]}` 读取并保留树，父子节点不再因错误信封而显示为空，展开后四个真实子类型各出现一次。新增组件回归测试。

像素复核曾阻止一处遮罩误映射：中性黑遮罩已按原透明度恢复，并新增不透明度及中性色断言，更新基线时同样执行。调色板夹具的容器也已校正，确保 Portal 内容实际可见；保留颜色证据绑定了夹具和取证脚本的哈希。

最终复跑还暴露了层级页场景的滚动漂移：点击最后一个父节点时，浏览器偶尔使外层内容及内层层级容器分别滚动几像素。准备器保留四次真实展开点击，随后明确恢复滚动原点并断言成功。四组合显式重采、20/20 定向比对和完整矩阵均通过，没有放宽像素阈值或颜色预算。

## 已执行验收

| 验收 | 实际结果与边界 |
|---|---|
| 扫描器及身份门禁 | 对 `0884836` 和当前 HEAD 比较通过；0 pending；模板尾、孤儿、重命名、假绑定、陈旧证据、未加载资产重新引入及未知 alias 均有反例自测 |
| 需求台原守卫 | 115/115；自证 7/7；保留批量、浮层和选择态原覆盖 |
| C6 页面状态 | 15 个 profile、176 个实际状态相位，颜色问题为 0、零新增违例；旧非颜色记录保留身份。层级准备器稳定滚动原点后按最新实际报告计数 |
| 调色板 | 12 个主题／视口／组件组合，2164 次实际测量；所有保留色均匹配到渲染颜色 |
| 图表 | 12 个组合，144 条图形路径、160 次 SVG 文字、432 个令牌／表面配对；图形与实际图表表面 ≥3，坐标文字 ≥4.5，HTML文字 axe 无违例 |
| 导入交互态 | 24 个组合、72 个静态／悬停／聚焦相位；成功、失败、进行中共 12 次 POST 均由浏览器 mock 承接，未执行真实导入 |
| 智能分配弹窗 | 12 个组合、92 个状态；推荐、手动、过载／缺失ID、两个页签及禁用项；不调用分配／删除操作 |
| Jest 全量 | 180 套通过，4315 项通过；现有 12 套／151 项跳过，没有新增跳过 |
| 局部回归 | 类型层级新增回归通过；相关前端单测复测通过 |
| 类型与构建 | client typecheck 为 0；client 构建通过，保留已有构建体积等警告 |
| CSS／HSL 守卫 | `lint:ui` 及其反例自测通过，任务 B 的合法三元组例外保持 |
| SVG反例守卫 | 四个组合注入可见但aria-hidden的白底白字SVG；axe为0，SVG守卫4/4拒绝，UPDATE未改变任何像素／axe基线 |
| 视觉重采 | 已有 148 组合、740 项检查的重采全部通过；补齐其余视口及推荐空态的定向重采各 20/20 |
| 完整像素复跑 | 28 个 profile、40 个准备场景 × 双主题 × 两视口 = 160 个真实组合，800/800；包含 1036 次可见 SVG 文字测量，颜色违例、意外业务写入和运行错误均为 0 |
| 全站结构 | verify-site 30 个页面／主题组合通过，对比度违例为 0 |

所有新增矩阵场景均覆盖 light／dark、1600×900／1366×768。真实 API 返回与受控夹具分别记载；夹具证明展示状态，不证明服务端业务执行成功。

最终机器证据：[完整视觉矩阵](../../tests/visual/reports/visual-matrix-default.json)、[颜色账本](../../tests/visual/color-debt.json)、[SVG 反例验证](../../tests/visual/reports/svg-update-selftest.json)。C6 的组件颜色证据和逐页状态报告保存在同一 reports 目录；检查模式不会修改预算或自动清理账本。

## 非本次关闭的内容

`/api/recommendations?maxRecommendations=15` 实测返回 `underutilized/overutilized/skillMatches`，分配页仍消费 `recommendations/current_state`。当前真实入口走空态，已登记总计划 IP-06；该页颜色验收和独立智能分配夹具不能代替推荐业务链验收。U02 的 mutation 错误事件订阅仍属于 IP-06。

既有命中尺寸、字号、遮挡或背景图无法自动判色等记录，仍由对应原任务处理。C6 没有把颜色违例加入这些预算；状态检查和视觉检查均拒绝以新增颜色例外吸收回归。

## 后续复现

在仓库根目录运行，需先提供本地 API 和 Vite 服务（默认 3110／3120）及 Playwright Chromium。可用 `UI_AUDIT_API`、`UI_AUDIT_BASE`、`UI_AUDIT_CHROME` 指定隔离实例与浏览器。

```bash
node scripts/audit-color-debt.mjs --check --base-ref 0884836
node scripts/audit-color-debt.mjs --selftest
COLOR_DEBT_BASE_REF=0884836 node scripts/check-color-debt-ci.mjs
SELF_TEST=1 npm run lint:ui
node scripts/verify-states.mjs --selftest
node scripts/verify-states.mjs
node scripts/verify-states.mjs --profile project-types-hierarchy
node scripts/verify-chart-colors.mjs
node scripts/verify-palette-colors.mjs
node scripts/verify-import-colors.mjs
node scripts/verify-assignment-colors.mjs
node scripts/tests/svg-chart-guard.integration.mjs
node scripts/verify-visual.mjs
node scripts/verify-site.mjs
npm test -- --runInBand
npm run typecheck:client
npm run build:client
```

修改影响保留颜色的源文件、主题、夹具或取证脚本时，先实际重验，再显式运行相应 `--refresh-evidence`。检查命令不会清除孤儿或重置账本。新场景须有 profile、明确准备器和非零覆盖；像素更新不能提高 axe 预算，颜色违例不能登记为存量例外。
