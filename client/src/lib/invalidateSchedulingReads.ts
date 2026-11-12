/**
 * I02k（I02a 交付评审 P2-8）：调度输入变化后的统一前端失效面。
 *
 * 后端在阶段时间线 / 项目 aspiration / 分配写路径上同事务刷新 computed，
 * 但前端此前只失效 projectPhases / roadmap 键；people.utilization、reports.*、
 * dashboard.* 等在 5min staleTime + refetchOnWindowFocus=false 下继续显示旧
 * 窗口，用户会把"缓存未失效"误判为"又漂移了"。
 *
 * 约定：任何会改变排产结果的成功 mutation（阶段日期增删改、项目日期改、
 * 分配增删改/暂停恢复）都调用本助手，一次失效全部读侧。键用前缀（不传
 * scenarioId/filters），确保所有场景/筛选组合都命中。
 */
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

/** 读侧前缀键（只读派生数字的查询面） */
export function schedulingReadKeys(projectId?: string): Array<readonly unknown[]> {
  const keys: Array<readonly unknown[]> = [
    queryKeys.assignments.all,
    queryKeys.projects.all,
    [...queryKeys.people.all, 'utilization'],
    [...queryKeys.people.all, 'utilizationTimeline'],
    [...queryKeys.people.all, 'assignments'],
    ['people-utilization'], // 旧版手写键（PersonDetails/StaffingSection 仍在用）
    queryKeys.roles.all, // 角色缺口
    queryKeys.demands.all, // 需求视图
    queryKeys.reports.all,
    queryKeys.dashboard.all,
  ];
  if (projectId) keys.push(queryKeys.projects.detail(projectId));
  return keys;
}

/**
 * 失效全部排产读侧。调用方不 await 也可（fire-and-forget 只影响下次读），
 * 但 mutation onSuccess 中建议 `void` 明确意图。
 */
export async function invalidateSchedulingReads(
  queryClient: QueryClient,
  projectId?: string
): Promise<void> {
  await Promise.all(
    schedulingReadKeys(projectId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  );
}
