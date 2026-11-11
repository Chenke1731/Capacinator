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
  'client/src/tailwind.css',
]);

/**
 * 共享组件类清单（只收“有跨页面/跨组件消费证据”的类）：
 * - form-*：FilterBar、ui/InlineEdit、dialog 表单、Availability；
 * - badge*：ui/InlineEdit、ReportStatusBadge、表格；
 * - btn-icon/empty-state：表格与空态（所有者 App.css）；
 * - page-header/header-actions/table-actions：全站页面/表格；
 * - chart-container/summary-card：ProjectDemandChart、PersonAllocationChart、reports；
 * - inline-edit-input：需求台/项目详情/人员页就地编辑。
 * modal-* 家族已整体退役（D-04 Stage 2，2026-11-11）：全部弹层迁 Radix
 * dialog 原语后全站零定义零消费，撤出注册（modal-common.css 随之删除）。
 */
export const SHARED_CLASSES = new Set([
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
 * 计数全程：Phase A 快照 63 条（头注曾误写 67，2026-11-11 勘误）→
 * Batch 1 清 24（+2 badge-info 注册冻结）→ 41 → Batch 2 清 22 → 19 →
 * Batch 3 清 9 → 10 → **D-04 Stage 2 清 10（InteractiveTimeline.css modal/
 * form 块随五个 phase modal 迁 Radix 删除）→ 0**。冻结清单自此为空。
 */
export const ALLOWLIST = new Map([]);

/**
 * 所有者内部冲突冻结（规则 7a，D-03 Batch 1）：共享类在 OWNER_FILES 中
 * 只允许一个定义文件。同族三次实锤（chart-container、summary-card、
 * checkbox-label 均为所有者文件之间级联互踩；empty-state 已在 Batch 1
 * 收敛）。批 A（2026-11-11）三组全部收敛：chart-container/summary-card
 * 归 index.css（recharts 主题规则随迁全局，Charts.css 只留图表私有类）、
 * checkbox-label 归 App.css（吸收 NUCLEAR 生效值 + 全局裸 input 选择器，
 * index.css 军备残骸与 ui/checkbox.css 死定义删除）。**冻结清单自此为空
 * ——2026-12-31 到期面上不再有任何冻结依赖。**
 */
export const OWNER_DUPS = new Map([]);

/**
 * 注册缺主冻结（规则 7b，D-03 Batch 1）：注册进 SHARED_CLASSES 的类必须
 * 至少有一个所有者定义。modal-title/modal-large 曾冻结于此——D-04 Stage 2
 * 后全站零定义零消费，随 modal-* 家族撤注册，冻结清空。
 */
export const OWNER_MISSING = new Map([]);

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
