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
  'badge', 'badge-primary', 'badge-success', 'badge-warning', 'badge-danger', 'badge-gray',
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
 * 快照生成：2026-11-10 I01e Phase A（137 违例 → 67 文件×类键）。
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
  ['client/src/components/Login.css :: .form-group', '2026-12-31'],
  ['client/src/components/PhaseTemplateDesigner.css :: .badge', '2026-12-31'],
  ['client/src/components/PhaseTemplateDesigner.css :: .btn-icon', '2026-12-31'],
  ['client/src/components/PhaseTemplateDesigner.css :: .checkbox-label', '2026-12-31'],
  ['client/src/components/PhaseTemplateDesigner.css :: .empty-state', '2026-12-31'],
  ['client/src/components/PhaseTemplateDesigner.css :: .form-input', '2026-12-31'],
  ['client/src/components/PhaseTemplateDesigner.css :: .form-textarea', '2026-12-31'],
  ['client/src/components/ProjectAllocations.css :: .form-group', '2026-12-31'],
  ['client/src/components/ProjectAllocations.css :: .form-input', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .badge', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .badge-danger', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .badge-primary', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .badge-success', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .badge-warning', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .btn-icon', '2026-12-31'],
  ['client/src/components/ProjectsTable.css :: .empty-state', '2026-12-31'],
  ['client/src/pages/Assignments.css :: .header-actions', '2026-12-31'],
  ['client/src/pages/Assignments.css :: .page-header', '2026-12-31'],
  ['client/src/pages/Dashboard.css :: .chart-container', '2026-12-31'],
  ['client/src/pages/Dashboard.css :: .page-header', '2026-12-31'],
  ['client/src/pages/Import.css :: .form-group', '2026-12-31'],
  ['client/src/pages/Locations.css :: .empty-state', '2026-12-31'],
  ['client/src/pages/Locations.css :: .page-header', '2026-12-31'],
  ['client/src/pages/People.css :: .badge-danger', '2026-12-31'],
  ['client/src/pages/People.css :: .badge-success', '2026-12-31'],
  ['client/src/pages/People.css :: .badge-warning', '2026-12-31'],
  ['client/src/pages/People.css :: .header-actions', '2026-12-31'],
  ['client/src/pages/People.css :: .page-header', '2026-12-31'],
  ['client/src/pages/People.css :: .table-actions', '2026-12-31'],
  ['client/src/pages/PersonDetails.css :: .badge-danger', '2026-12-31'],
  ['client/src/pages/PersonDetails.css :: .badge-gray', '2026-12-31'],
  ['client/src/pages/PersonDetails.css :: .badge-success', '2026-12-31'],
  ['client/src/pages/PersonDetails.css :: .badge-warning', '2026-12-31'],
  ['client/src/pages/ProjectDetail.css :: .form-group', '2026-12-31'],
  ['client/src/pages/ProjectDetail.css :: .form-input', '2026-12-31'],
  ['client/src/pages/ProjectDetail.css :: .form-label', '2026-12-31'],
  ['client/src/pages/Projects.css :: .header-actions', '2026-12-31'],
  ['client/src/pages/Projects.css :: .page-header', '2026-12-31'],
  ['client/src/pages/Projects.css :: .table-actions', '2026-12-31'],
  ['client/src/pages/ProjectTypeDetails.css :: .empty-state', '2026-12-31'],
  ['client/src/pages/ProjectTypeDetails.css :: .form-group', '2026-12-31'],
  ['client/src/pages/ProjectTypeDetails.css :: .form-input', '2026-12-31'],
  ['client/src/pages/ProjectTypes.css :: .empty-state', '2026-12-31'],
  ['client/src/pages/Roles.css :: .header-actions', '2026-12-31'],
  ['client/src/pages/Roles.css :: .page-header', '2026-12-31'],
  ['client/src/pages/ScenarioComparison.css :: .badge', '2026-12-31'],
  ['client/src/pages/ScenarioComparison.css :: .summary-card', '2026-12-31'],
  ['client/src/pages/Scenarios.css :: .page-header', '2026-12-31'],
  ['client/src/styles/reports.css :: .badge-danger', '2026-12-31'],
  ['client/src/styles/reports.css :: .badge-success', '2026-12-31'],
  ['client/src/styles/reports.css :: .badge-warning', '2026-12-31'],
  ['client/src/styles/reports.css :: .chart-container', '2026-12-31'],
  ['client/src/styles/reports.css :: .summary-card', '2026-12-31'],
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
