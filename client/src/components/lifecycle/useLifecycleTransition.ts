import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';

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
    }
  });
}
