import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateSchedulingReads } from '../../lib/invalidateSchedulingReads';

/**
 * Shared lifecycle transition mutation — invalidates everything that shows
 * lifecycle-derived data (list badges, detail banner, staffing, dashboard).
 */
export function useLifecycleTransition(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof api.lifecycle.transition>[1]) =>
      api.lifecycle.transition(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      // I02k：生命周期 pause/release 会改分配状态，统一失效排产读侧
      void invalidateSchedulingReads(queryClient, projectId);
    }
  });
}
