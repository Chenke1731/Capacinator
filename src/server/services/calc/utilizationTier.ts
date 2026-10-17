/**
 * 人员利用率判档（IP-03b，2026-10-17）——person_utilization_view 069/070
 * 相对可用率口径的 TS 镜像：SQL 视图管基线快照，本函数管服务层重算
 * （分支场景切片）时的同一口径。两处判档必须同构——漂移由
 * personUtilizationView.test 的边界夹具锁定（100 严格大于/80/0/可用率 0）。
 */
export type UtilizationTier =
  | 'Unavailable'
  | 'Over-allocated'
  | 'Fully-allocated'
  | 'Partially-allocated'
  | 'Available';

export function utilizationTier(totalAllocationPct: number, availabilityPct: number): UtilizationTier {
  if (availabilityPct <= 0) return 'Unavailable';
  const ratio = (totalAllocationPct * 100) / availabilityPct;
  if (ratio > 100) return 'Over-allocated'; // 严格大于:100% 算满载不算超载(IP-03a load>capacity 同语义)
  if (ratio >= 80) return 'Fully-allocated';
  if (totalAllocationPct > 0) return 'Partially-allocated';
  return 'Available';
}
