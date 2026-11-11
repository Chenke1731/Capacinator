/**
 * 共享 UI 类所有权登记（D-03 v1，2026-11-10 同类问题排查）
 *
 * 目的：阻止页面/组件 CSS 裸定义或派生覆盖“全局共享组件类”——这类覆盖
 * 随路由 CSS 全量加载后会改写同路由/后续访问页面的共享组件（本轮实锤：
 * InteractiveTimeline 裸 `.btn-secondary` 使 project-types hover 3.997:1；
 * Import 裸 `.form-select` 44px 泄漏 FilterBar）。
 *
 * 机制切片：声明 × 文件归属 × 选择器左端锚点。触发：lint:ui（生成时/提交前）。
 * 与规则 2（全局工具类）互补：规则 2 管单类裸定义，本规则管共享组件类
 * （含 `.form-group input` 这类派生选择器）。
 *
 * 存量冻结：ALLOWLIST 记录当前违例（文件::类），到期日 2026-12-31；
 * 新增违例直接拦截。清理顺序见总计划台账 I01e。
 */

/** 全局样式所有者：这些文件里定义共享类合法 */
export const OWNER_FILES = new Set([
  'client/src/App.css',
  'client/src/index.css',
  'client/src/globals.css',
  'client/src/styles/design-system.css',
  'client/src/styles/modal-common.css',
  'client/src/tailwind.css',
]);

/**
 * 共享组件类清单（只收“有跨页面/跨组件消费证据”的类）：
 * - modal-*：phase modals（AddPhase/PhaseAdd/...）、旧 modal-common；
 * - form-*：FilterBar、ui/InlineEdit、phase modals、Availability；
 * - badge*：ui/InlineEdit、ReportStatusBadge、表格；
 * - btn-icon/empty-state：ProjectsTable、PhaseTemplateDesigner、各页表格；
 * - page-header/header-actions/table-actions：全站页面/表格；
 * - chart-container/summary-card：ProjectDemandChart、PersonAllocationChart、reports；
 * - inline-edit-input：需求台/项目详情/人员页就地编辑。
 */
export const SHARED_CLASSES = new Set([
  'modal-overlay', 'modal-container', 'modal-content', 'modal-header', 'modal-body',
  'modal-footer', 'modal-close', 'modal-actions', 'modal-title', 'modal-large',
  'form-group', 'form-label', 'form-input', 'form-select', 'form-textarea', 'form-control',
  'checkbox-label',
  'badge', 'badge-primary', 'badge-secondary', 'badge-success', 'badge-warning',
  'badge-danger', 'badge-gray', 'badge-info',
  'btn-icon', 'empty-state',
  'page-header', 'header-actions', 'table-actions',
  'chart-container', 'summary-card',
  'inline-edit-input',
]);

/** 共享组件类的合法所有者：全局样式表 + ui 原语 + 共享图表样式 */
export function isOwnerFile(rel) {
  return OWNER_FILES.has(rel)
    || rel.startsWith('client/src/components/ui/')
    || rel === 'client/src/components/Charts.css';
}

/**
 * 存量违例冻结（文件 :: .类 → 到期日）。
 * 到期后 lint 会报错，必须清理或续期（续期需在台账说明）。
 * 说明：InteractiveTimeline.css 的 modal/form 组是手写 phase-modal 的共享样式，
 * 等 D-04 Stage 2（迁移 Radix）删除，不单独作用域化。
 * 计数勘误（2026-11-11）：Phase A 头注曾写"137 违例 → 67 文件×类键"，逐条
 * 重数实为 63；Batch 1 清 24 条 + badge-info 注册冻结 2 条 → 41；Batch 2 清
 * 22 条 → 19；Batch 3 清 9 条（form-* 作用域化 + Login.css/ProjectAllocations
 * 死文件删除）→ 10，全部为 InteractiveTimeline（D-04 Stage 2 随迁 Radix 删除）。
 */
export const ALLOWLIST = new Map([
  ['client/src/components/InteractiveTimeline.css :: .form-group', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .form-input', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .form-label', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .form-select', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .modal-actions', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .modal-close', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .modal-content', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .modal-header', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .modal-overlay', '2026-12-31'],
  ['client/src/components/InteractiveTimeline.css :: .modal-title', '2026-12-31'],
]);

/**
 * 所有者内部冲突冻结（规则 7a，D-03 Batch 1）：共享类在 OWNER_FILES 中
 * 只允许一个定义文件。同族三次实锤（chart-container、summary-card、
 * checkbox-label 均为所有者文件之间级联互踩；empty-state 已在 Batch 1
 * 收敛为 App.css 单所有者）。三组存量冻结，到期未收敛则 lint 转红。
 */
export const OWNER_DUPS = new Map([
  ['chart-container', {files:['client/src/index.css','client/src/components/Charts.css'], expiry:'2026-12-31', note:'两所有者几何不同（1.5rem+border vs 20px+shadow+margin），待图表批次收敛'}],
  ['summary-card', {files:['client/src/index.css','client/src/components/Charts.css'], expiry:'2026-12-31', note:'同上，与 chart-container 同批收敛'}],
  ['checkbox-label', {files:['client/src/App.css','client/src/index.css','client/src/components/ui/checkbox.css'], expiry:'2026-12-31', note:'三处定义（横排/纵排并存），待表单原语批次收敛'}],
]);

/**
 * 注册缺主冻结（规则 7b，D-03 Batch 1）：注册进 SHARED_CLASSES 的类必须
 * 至少有一个所有者定义（badge-secondary 曾注册缺主，评审 G-B）。两组存量
 * 缺主：真实定义在非所有者文件（InteractiveTimeline.css 手写 phase-modal，
 * 冻结于 ALLOWLIST，等 D-04 Stage 2 迁 Radix 后归属 dialog 原语）。
 */
export const OWNER_MISSING = new Map([
  ['modal-title', {expiry:'2026-12-31', note:'唯一定义在 InteractiveTimeline.css（非所有者，ALLOWLIST 冻结）；D-04 Stage 2 迁 Radix 后归 dialog.tsx 原语'}],
  ['modal-large', {expiry:'2026-12-31', note:'仅 Scenarios.css 作用域变体在用，无裸所有者定义；D-04 Stage 2 一并裁决尺寸族'}],
]);

const EXPIRY = '2026-12-31';

/** 返回 true 表示该文件×类仍在冻结期内 */
export function isAllowlisted(rel, cls) {
  const key = `${rel} :: .${cls}`;
  const expiry = ALLOWLIST.get(key);
  if (!expiry) return false;
  return new Date(expiry).getTime() >= Date.now();
}

export function allowlistExpiry() {
  return EXPIRY;
}
