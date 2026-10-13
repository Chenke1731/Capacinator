import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import type { ProjectPhaseTimeline } from '../types';

export interface Phase {
  id: string;
  project_id: string;
  phase_id: string;
  phase_name: string;
  start_date: string;
  end_date: string;
  phase_order: number;
  phase_description?: string;
}

export interface Dependency {
  id: string;
  project_id: string;
  predecessor_phase_timeline_id: string;
  successor_phase_timeline_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days?: number;
  predecessor_phase?: Phase;
  successor_phase?: Phase;
}

export interface PhaseTemplate {
  id: string;
  name: string;
  description?: string;
}

interface UsePhaseTimelineDataProps {
  projectId: string;
  onPhaseUpdateError?: (errors: string[]) => void;
}

interface BulkCorrection {
  id: string;
  start_date: string;
  end_date: string;
}

export function usePhaseTimelineData({ projectId, onPhaseUpdateError }: UsePhaseTimelineDataProps) {
  const queryClient = useQueryClient();

  // Fetch project phases
  const { data: phasesData, isLoading: phasesLoading } = useQuery({
    queryKey: queryKeys.projectPhases.byProject(projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: projectId });
      // 归一: API 行(ProjectPhaseTimeline) → 视图形 Phase(下游全部按 Phase 消费)
      const rows = (response.data.data || response.data) as ProjectPhaseTimeline[];
      return (rows as unknown as Phase[]);
    }
  });

  // Fetch dependencies
  const { data: dependenciesData, isLoading: dependenciesLoading } = useQuery({
    queryKey: queryKeys.projectPhases.dependencies(projectId),
    queryFn: async () => {
      const response = await api.projectPhaseDependencies.list({ project_id: projectId });
      return (response.data.data || response.data) as unknown as Dependency[];
    }
  });

  // Fetch available phase templates
  const { data: phaseTemplates } = useQuery({
    queryKey: queryKeys.phases.templates(),
    queryFn: async () => {
      const response = await api.phases.list();
      return response.data.data || response.data;
    }
  });

  // Phase mutations
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ phaseId, updates }: { phaseId: string; updates: Partial<Phase> }) => {
      const response = await api.projectPhases.update(phaseId, updates);
      return (response.data as unknown as { data?: Phase }).data ?? (response.data as unknown as Phase);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
    },
    onError: (err: Error & { response?: { data?: { validation_errors?: string[] } } }) => {
      if (err?.response?.data?.validation_errors) {
        const errors = err.response.data.validation_errors;
        console.error('Phase update validation failed:', errors);
        onPhaseUpdateError?.(errors);
      } else {
        console.error('Phase update failed:', err);
      }
    }
  });

  const createPhaseMutation = useMutation({
    mutationFn: async (phaseData: Omit<Phase, 'id'>) => {
      const response = await api.projectPhases.create({
        ...phaseData,
        project_id: projectId
      });
      return (response.data as unknown as { data?: Phase }).data ?? (response.data as unknown as Phase);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
    }
  });

  const deletePhaseMutation = useMutation({
    mutationFn: async (phaseId: string) => {
      await api.projectPhases.delete(phaseId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.byProject(projectId) });
    }
  });

  // Dependency mutations
  const createDependencyMutation = useMutation({
    mutationFn: async (dependencyData: Omit<Dependency, 'id'>) => {
      const response = await api.projectPhaseDependencies.create({
        ...dependencyData,
        project_id: projectId
      });
      return (response.data as unknown as { data?: Dependency }).data ?? (response.data as unknown as Dependency);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.dependencies(projectId) });
    }
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: async (dependencyId: string) => {
      await api.projectPhaseDependencies.delete(dependencyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.dependencies(projectId) });
    }
  });

  // Bulk corrections mutation
  const applyBulkCorrectionsMutation = useMutation({
    mutationFn: async (corrections: BulkCorrection[]) => {
      const result = await api.projectPhases.applyBulkCorrections({
        projectId,
        corrections
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.all });
    }
  });

  return {
    // Data
    phasesData,
    dependenciesData,
    phaseTemplates,
    // Loading states
    phasesLoading,
    dependenciesLoading,
    // Mutations
    updatePhaseMutation,
    createPhaseMutation,
    deletePhaseMutation,
    createDependencyMutation,
    deleteDependencyMutation,
    applyBulkCorrectionsMutation,
    // Query client for manual invalidation
    queryClient
  };
}
