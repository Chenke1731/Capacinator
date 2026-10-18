/**
 * U15 任务视图"有冲突"标志（IP-06d，2026-10-17）。
 *
 * 事实口径：**消费服务端统一计算结果**——person_utilization_view 的
 * Over-allocated 档（相对可用率口径，IP-03b 收敛后的单一真相）。
 * 某人员的活跃分配（assignments_view，与看板格子同源同切片）其人超载
 * → 该项目标 has_conflict。前端任务视图只组织此结果，不重算容量。
 *
 * 边界与视图判档一致：恰好 100% 满载非冲突（严格大于线）；非活跃分配
 * 不参与；无分配项目自然不在集合内。
 */
export async function computeProjectConflictFlags(db: unknown): Promise<Set<string>> {
  const rows = await (db as any)('assignments_view as av')
    .join('person_utilization_view as puv', 'puv.person_id', 'av.person_id')
    .where('av.status', 'active')
    .where('puv.utilization_status', 'Over-allocated')
    .distinct('av.project_id');
  return new Set(rows.map((r: any) => String(r.project_id)));
}
