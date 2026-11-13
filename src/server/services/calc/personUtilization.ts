/**
 * 人员利用率读取原语（I01v/D15，2026-11-11）——从 PeopleController.getUtilization
 * 纯搬移（IP-03b 续 2026-10-17 的场景切片逻辑），供人员页与报表读侧共用。
 *
 * 事实口径（迁移 070）：person_utilization_view 是"基线+今天窗口"快照；
 * 选定分支场景时分子按 activeAssignmentsInScenario 切片重算——旧实现把所有
 * active 分支叠加，复制一个分支即 60%→120% 幻影超载。判档与视图同构
 * （utilizationTier 为 069/070 相对可用率口径的 TS 镜像）。
 */
import { BASELINE_SCENARIO_ID, activeAssignmentsInScenario } from './effectiveAssignments.js';
import { utilizationTier } from './utilizationTier.js';

/**
 * 读取全量人员利用率行（视图列全保留）；scenarioId ≠ baseline 时用该场景
 * 的 active 分配切片按"今天"窗口重算分子与项目数，并覆盖利用率判档。
 */
export async function personUtilizationRows(
  db: any,
  scenarioId: string
): Promise<Array<Record<string, unknown>>> {
  const rows = (await db('person_utilization_view').select('*')) as Array<Record<string, unknown>>;
  // 参考日随行返回：编辑器/前端不得各自 new Date() 取“今天”，否则跨时区
  // 或跨午夜会出现容量条与列表口径不一致（设计 §12.3）。
  const asOf = new Date().toISOString().slice(0, 10);
  if (scenarioId === BASELINE_SCENARIO_ID) {
    return rows.map((row) => ({ ...row, as_of: asOf }));
  }

  // 分支切片: 场景内 active 分配,与今天相交(null 日期=全窗,与视图同语义)
  const today = asOf;
  const slice = await activeAssignmentsInScenario(db, scenarioId)
    .whereRaw(
      '(COALESCE(spa.computed_start_date, spa.start_date) IS NULL OR date(COALESCE(spa.computed_start_date, spa.start_date)) <= date(?))',
      [today]
    )
    .whereRaw(
      '(COALESCE(spa.computed_end_date, spa.end_date) IS NULL OR date(COALESCE(spa.computed_end_date, spa.end_date)) >= date(?))',
      [today]
    )
    .select('spa.person_id')
    .sum('spa.allocation_percentage as total_allocation')
    .countDistinct('spa.project_id as project_total')
    .groupBy('spa.person_id');
  const byPerson = new Map(
    (slice as Array<Record<string, unknown>>).map((r) => [String(r.person_id), r])
  );
  return rows.map((row) => {
    const s = byPerson.get(String(row.person_id));
    const total = Number(s?.total_allocation ?? 0);
    const availability = Number(row.current_availability_percentage ?? 100);
    return {
      ...row,
      total_allocation_percentage: total,
      project_count: Number(s?.project_total ?? 0),
      utilization_status: utilizationTier(total, availability),
      as_of: asOf,
    };
  });
}
