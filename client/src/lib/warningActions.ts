/**
 * U17 可操作告警(IP-06d,2026-10-18): 告警码 → 处置元数据。
 *
 * 告警不只提示存在——问题面板(行详情侧栏告警区)按码展示 排产影响 +
 * 推荐动作,并定位对应字段(drawer 字段卡高亮)。定位目标是**建议**,
 * 不构成生命周期硬门禁(U17 明确约束:建议不变门禁)。
 *
 * locateField 键 = RowDetailDrawer 的 data-field 字段键。
 */
export const WARNING_LOCATE_FIELD: Record<string, string> = {
  NO_DEV_DEMAND: 'primary',
  NO_LOC_ESTIMATE: 'kloc',
  NO_DESIGN_ESTIMATE: 'se',
  DESIGN_NOT_BACKFILLED: 'se',
  DELIVERED_NOT_BACKFILLED: 'kloc',
  NO_ITERATION_NUMBER: 'number',
  SE_WONT_MAKE_IT: 'se',
  ITER_RHYTHM_MISMATCH: 'release',
  ITER_OVER_DEADLINE: 'iter',
  ITER_ENDED_UNDONE: 'iter',
  DEV_NO_MDE: 'mde',
  ASSIGN_AFTER_DELIVERY: 'primary'
};

/** 未知码的兜底定位: 无(纯提示) */
export function locateFieldOf(code: string): string | null {
  return WARNING_LOCATE_FIELD[code] ?? null;
}
