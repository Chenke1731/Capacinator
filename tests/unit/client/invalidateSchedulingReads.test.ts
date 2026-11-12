/**
 * I02k：排产读侧统一失效面单测。
 *
 * 背景：后端已刷新 computed，但前端只失效 projectPhases/roadmap，People/
 * 报表/看板在 5min staleTime 内仍读旧窗口。本测试钉住"一次 mutation 失效
 * 全部读侧前缀"，防止后续只加单键回归。
 */
import { describe, test, expect, jest } from '@jest/globals';
import { schedulingReadKeys, invalidateSchedulingReads } from '../../../client/src/lib/invalidateSchedulingReads';

function flatten(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

describe('invalidateSchedulingReads', () => {
  test('覆盖全部排产读侧前缀（含利用率/报表/看板/需求/缺口）', () => {
    const keys = schedulingReadKeys('project-1').map(flatten);
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['assignments']),
        JSON.stringify(['projects']),
        JSON.stringify(['people', 'utilization']),
        JSON.stringify(['people', 'utilizationTimeline']),
        JSON.stringify(['people', 'assignments']),
        JSON.stringify(['people-utilization']),
        JSON.stringify(['roles']),
        JSON.stringify(['demands']),
        JSON.stringify(['reports']),
        JSON.stringify(['dashboard']),
        JSON.stringify(['projects', 'detail', 'project-1']),
      ])
    );
  });

  test('无 projectId 时不追加项目详情键', () => {
    const keys = schedulingReadKeys().map(flatten);
    expect(keys.some((k) => k.includes('detail'))).toBe(false);
  });

  test('invalidateSchedulingReads 对每个前缀各调用一次', async () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as any;
    await invalidateSchedulingReads(queryClient, 'p-9');
    expect(invalidateQueries).toHaveBeenCalledTimes(schedulingReadKeys('p-9').length);
    const calledKeys = invalidateQueries.mock.calls.map((call) => flatten(call[0].queryKey));
    expect(calledKeys).toEqual(expect.arrayContaining([JSON.stringify(['reports'])]));
    expect(calledKeys).toContain(JSON.stringify(['projects', 'detail', 'p-9']));
  });
});
