import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';

interface ProjectPhaseTimeline {
  id: string;
  project_id: string;
  phase_id: string;
  phase_name: string;
  start_date: string;
  end_date: string;
  phase_order: number;
  phase_description?: string;
  phase_color?: string;
}

interface PhaseDependency {
  id: string;
  project_id: string;
  predecessor_phase_timeline_id: string;
  successor_phase_timeline_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days?: number;
}

interface PhaseTemplate {
  id: string;
  name: string;
  description?: string;
}

interface UseVisualPhaseManagerDataProps {
  projectId: string;
  onPhasesChange?: () => void;
}

export function useVisualPhaseManagerData({ projectId, onPhasesChange }: UseVisualPhaseManagerDataProps) {
  const queryClient = useQueryClient();

  // Fetch project phases
  const { data: phasesData, isLoading } = useQuery({
    queryKey: queryKeys.projectPhases.byProject(projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: projectId });
      return response.data;
    }
  });

  // Fetch available phase templates for adding new phases
  const { data: phaseTemplates } = useQuery({
    queryKey: queryKeys.phases.templates(),
    queryFn: async () => {
      const response = await api.phases.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch project phase dependencies
  const { data: dependenciesData, refetch: refetchDependencies } = useQuery({
    queryKey: queryKeys.projectPhases.dependencies(projectId),
    queryFn: async () => {
      const response = await api.projectPhaseDependencies.list({ project_id: projectId });
      return response.data;
    }
  });

  // Add phase mutation
  const addPhaseMutation = useMutation({
    mutationFn: async (phaseData: {
      project_id: string;
      phase_id: string;
      start_date: string;
      end_date: string;
      phase_order: number;
    }) => {
      return api.projectPhases.create(phaseData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.all });
      onPhasesChange?.();
    }
  });

  // Update phase mutation
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ phaseId, data }: { phaseId: string; data: Partial<ProjectPhaseTimeline> }) => {
      return api.projectPhases.update(phaseId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.all });
      onPhasesChange?.();
    }
  });

  // Delete phase mutation
  const deletePhaseMutation = useMutation({
    mutationFn: async (phaseId: string) => {
      return api.projectPhases.delete(phaseId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectPhases.all });
      onPhasesChange?.();
    }
  });

  // Add dependency mutation
  const addDependencyMutation = useMutation({
    mutationFn: async (dependencyData: {
      project_id: string;
      predecessor_phase_timeline_id: string;
      successor_phase_timeline_id: string;
      dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
      lag_days?: number;
    }) => {
      return api.projectPhaseDependencies.create(dependencyData);
    },
    onSuccess: () => {
      refetchDependencies();
      onPhasesChange?.();
    }
  });

  // Update dependency mutation
  const updateDependencyMutation = useMutation({
    mutationFn: async ({ dependencyId, data }: { dependencyId: string; data: Partial<PhaseDependency> }) => {
      return api.projectPhaseDependencies.update(dependencyId, data);
    },
    onSuccess: () => {
      refetchDependencies();
      onPhasesChange?.();
    }
  });

  // Delete dependency mutation
  const deleteDependencyMutation = useMutation({
    mutationFn: async (dependencyId: string) => {
      return api.projectPhaseDependencies.delete(dependencyId);
    },
    onSuccess: () => {
      refetchDependencies();
      onPhasesChange?.();
    }
  });

  const phases: ProjectPhaseTimeline[] = phasesData?.data || [];
  const dependencies: PhaseDependency[] = dependenciesData?.data || [];
  const templates: PhaseTemplate[] = Array.isArray(phaseTemplates)
    ? phaseTemplates
    : (phaseTemplates as any)?.data || [];

  return {
    // Data
    phases,
    dependencies,
    phaseTemplates: templates,
    isLoading,
    // Mutations
    addPhaseMutation,
    updatePhaseMutation,
    deletePhaseMutation,
    addDependencyMutation,
    updateDependencyMutation,
    deleteDependencyMutation,
    // Query client for additional operations
    queryClient
  };
}

export type { ProjectPhaseTimeline, PhaseDependency, PhaseTemplate };
