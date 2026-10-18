/**
 * U15 任务视图（IP-06d，2026-10-17）：把"发现问题→判断影响→完成排产"
 * 的队列问题从属性筛选里解放出来。
 *
 * 六视图全部锚定 board-feed 行上的**服务端事实**（生命周期态/告警码/
 * 分配与估算挂载/冲突标志），本模块只组织结果、不做容量计算——
 * "有冲突"只认服务端 has_conflict（person_utilization_view 统一判档），
 * 服务端未给即不命中，不以前端猜测替代。
 *
 * 本模块是 chips 计数与树过滤的单一真相：两处消费同一谓词，禁止各写一份。
 */
export const TASK_VIEW_IDS = [
  'pendingDecision',
  'pendingEstimate',
  'pendingStaffing',
  'hasConflict',
  'pendingSchedule',
  'pendingBackfill'
] as const;

export type TaskViewId = (typeof TASK_VIEW_IDS)[number];

/** 开发侧"该有人"状态: scheduled/in_iteration(配人义务随排期发生——
 *  backlog 是已知排队,不因没派主投入立案;与 LifecycleService 的
 *  NO_DEV_DEMAND 告警门(scheduled||in_iteration)同集,口径一致) */
const DEV_SIDE_STATES = ['scheduled', 'in_iteration'];

export function taskViewPredicate(view: TaskViewId, p: unknown): boolean {
  const row = (p ?? {}) as Record<string, any>;
  const warnings: string[] = Array.isArray(row.lifecycle_warnings) ? row.lifecycle_warnings : [];
  switch (view) {
    case 'pendingDecision':
      // 域词表: pending_rat="待RAT"——裁决门
      return row.lifecycle_state === 'pending_rat';
    case 'pendingEstimate':
      return warnings.includes('NO_LOC_ESTIMATE') || warnings.includes('NO_DESIGN_ESTIMATE');
    case 'pendingStaffing': {
      const de = row.design_estimates ?? {};
      const designGap = (Number(de.se) > 0 && !row.se_assignment) || (Number(de.mde) > 0 && !row.mde_assignment);
      const devGap = DEV_SIDE_STATES.includes(row.lifecycle_state) && !row.primary_dev;
      return designGap || devGap || warnings.includes('NO_DEV_DEMAND');
    }
    case 'hasConflict':
      // 只认服务端统一计算结果(相对可用率超载档);标志缺失≠无冲突成立
      return row.has_conflict === true;
    case 'pendingSchedule':
      // 域词表: backlog="待排序"——已裁决进池、未挂迭代
      return row.lifecycle_state === 'backlog';
    case 'pendingBackfill':
      return warnings.includes('DESIGN_NOT_BACKFILLED') || warnings.includes('DELIVERED_NOT_BACKFILLED');
  }
}

/** 行级独立计数（非树口径——树口径下父或子命中保整树，数量语义不同） */
export function countByTaskView(rows: unknown[]): Record<TaskViewId, number> {
  const counts = Object.fromEntries(TASK_VIEW_IDS.map((v) => [v, 0])) as Record<TaskViewId, number>;
  for (const row of rows ?? []) {
    for (const view of TASK_VIEW_IDS) {
      if (taskViewPredicate(view, row)) counts[view] += 1;
    }
  }
  return counts;
}
