/**
 * 有效分配读取原语（改进计划 IP-02b / F01 / C05）。
 *
 * 数据流真相(2026-10-15 dev 库实证): 全部运行时分配写入 scenario_project_assignments,
 * baseline 是其中 scenario_id = BASELINE_SCENARIO_ID 的自含切片;旧表 project_assignments
 * 仅剩 V2 导入在写(dev 库 0 行)。有效集合 = 选定场景的 active 切片——
 * 不是"旧表 ∪ 全部 active 场景"(那会把未改动分支叠加到同一人负荷上,C05)。
 */
export const BASELINE_SCENARIO_ID = 'baseline-0000-0000-0000-000000000000';

/** 请求头 → 场景 id;缺省/空白回落 baseline */
export function resolveScenarioId(headerValue: unknown): string {
  const s = typeof headerValue === 'string' ? headerValue.trim() : '';
  return s || BASELINE_SCENARIO_ID;
}

/** 选定场景的有效分配查询(active 行);调用方在其上叠加 join/select/窗口过滤 */
export function activeAssignmentsInScenario(db: any, scenarioId: string) {
  return db('scenario_project_assignments as spa')
    .where('spa.scenario_id', scenarioId)
    .where('spa.status', 'active');
}
