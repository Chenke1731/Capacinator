/**
 * useAssignmentRecommendations Hook
 *
 * Extracts recommendation calculation logic from SmartAssignmentModal.
 * Calculates person utilization, filters projects with demand, and generates
 * project recommendations for assignment.
 */

import { useMemo } from 'react';
import { toISODateString } from '../utils/dateUtils';
import {
  calculateRoleBasedScore,
  calculatePriorityBasedScore,
  calculateSuggestedAllocation,
  FitLevel,
} from '../utils/recommendationScoring';

/**
 * Person data with assignments and roles
 */
export interface PersonWithAssignments {
  id: string;
  name: string;
  default_availability_percentage?: number;
  assignments?: Assignment[];
  roles?: PersonRole[];
}

/**
 * Assignment data structure
 */
export interface Assignment {
  id: string;
  project_id: string;
  role_id: string;
  allocation_percentage: number;
  start_date?: string;
  end_date?: string;
  computed_start_date?: string;
  computed_end_date?: string;
  project_name?: string;
  role_name?: string;
  phase_name?: string;
  /** assignments_view 透出的状态；paused 仅展示、不参与容量 */
  status?: string;
  version?: number;
}

/**
 * Person role assignment
 */
export interface PersonRole {
  role_id: string;
  is_primary?: boolean;
}

/**
 * Project data structure
 */
export interface Project {
  id: string;
  name: string;
  priority?: number;
  target_end_date?: string;
  required_roles?: string[];
}

/**
 * Role data structure
 */
export interface Role {
  id: string;
  name: string;
}

/**
 * Project allocation data
 */
export interface ProjectAllocation {
  projectId: string;
  allocations: AllocationEntry[];
}

/**
 * Individual allocation entry
 */
export interface AllocationEntry {
  role_id: string;
  role_name?: string;
  phase_id?: string;
  allocation_percentage: number;
}

/**
 * Project recommendation result
 */
export interface ProjectRecommendation {
  project: Project;
  suggestedRole: Role;
  score: number;
  matchedSkills: string[];
  fitLevel: FitLevel;
  suggestedAllocation: number;
  reason: string;
}

/**
 * Utilization data for a person
 */
export interface UtilizationData {
  /** 相对可用率的利用率（totalAllocation / availability × 100） */
  currentUtilization: number;
  availability: number;
  /** 剩余可用百分点（可为负，表示超载百分点） */
  remainingCapacity: number;
  /** 当前 active 分配绝对值之和（百分点） */
  totalAllocation: number;
  activeAssignments?: Assignment[];
}

/**
 * Options for the useAssignmentRecommendations hook
 */
export interface UseAssignmentRecommendationsOptions {
  /** Person data with assignments and roles */
  person: PersonWithAssignments | null | undefined;
  /** All available projects */
  projects: Project[] | null | undefined;
  /** All available roles */
  roles: Role[] | null | undefined;
  /** Project allocations data (demand per project) */
  allProjectAllocations: ProjectAllocation[] | null | undefined;
  /** Whether allocations are still loading */
  isLoadingAllocations: boolean;
  /** Action type context (e.g., 'assign_project') */
  actionType?: string;
}

/**
 * Return type for useAssignmentRecommendations hook
 */
export interface UseAssignmentRecommendationsReturn {
  /** Top project recommendations for the person */
  recommendations: ProjectRecommendation[];
  /** Person's utilization data */
  utilizationData: UtilizationData;
  /** Projects that have resource demand */
  projectsWithDemand: Project[];
}

/**
 * useAssignmentRecommendations - Calculates project recommendations for person assignment.
 *
 * This hook extracts the recommendation logic from SmartAssignmentModal to provide:
 * - Person utilization calculation (current allocation vs availability)
 * - Projects with demand filtering (only shows projects needing resources)
 * - Project recommendations with role matching and scoring
 *
 * @example
 * ```tsx
 * const { recommendations, utilizationData, projectsWithDemand } = useAssignmentRecommendations({
 *   person,
 *   projects: projectsData,
 *   roles: rolesData,
 *   allProjectAllocations,
 *   isLoadingAllocations,
 *   actionType: 'assign_project'
 * });
 * ```
 */
export function useAssignmentRecommendations({
  person,
  projects,
  roles,
  allProjectAllocations,
  isLoadingAllocations,
  actionType,
}: UseAssignmentRecommendationsOptions): UseAssignmentRecommendationsReturn {
  // Calculate current utilization and availability
  const utilizationData = useMemo((): UtilizationData => {
    if (!person) {
      return { currentUtilization: 0, availability: 100, remainingCapacity: 100, totalAllocation: 0 };
    }

    // 统一口径（2026-11-13 P1）：
    // - paused 只展示、不参与容量（PeopleController 注释/视图同义）
    // - 无日期 = 无界 ongoing（controller 注释；capacity 视图 NULL 视为无界）
    // - 本地日历日，不用 UTC（东八区凌晨边界）
    const today = toISODateString(new Date());
    const activeAssignments = person.assignments?.filter((a) => {
      if (a.status && a.status !== 'active') return false;
      const startDate = a.computed_start_date || a.start_date;
      const endDate = a.computed_end_date || a.end_date;
      if (startDate && startDate > today) return false;
      if (endDate && endDate < today) return false;
      return true;
    }) || [];

    const totalAllocation = activeAssignments.reduce(
      (sum, a) => sum + (a.allocation_percentage || 0),
      0
    );

    const availability = person.default_availability_percentage ?? 100;
    const remainingCapacity = availability - totalAllocation;
    const currentUtilization = availability > 0
      ? (totalAllocation / availability) * 100
      : 0;

    return {
      currentUtilization,
      availability,
      remainingCapacity,
      totalAllocation,
      activeAssignments,
    };
  }, [person]);

  // Filter projects that have demand
  const projectsWithDemand = useMemo((): Project[] => {
    if (!projects || !allProjectAllocations || isLoadingAllocations) {
      // If allocations are still loading, show all projects
      return projects || [];
    }

    return projects.filter((project) => {
      const projectAllocation = allProjectAllocations.find(
        (pa) => pa.projectId === project.id
      );

      // Check if project has any allocation > 0
      const hasAllocations = projectAllocation?.allocations?.some(
        (allocation) => allocation.allocation_percentage > 0
      );

      if (hasAllocations && projectAllocation) {
        // Extract required roles from allocations
        const requiredRoles = [
          ...new Set(
            projectAllocation.allocations
              .filter((a) => a.allocation_percentage > 0)
              .map((a) => a.role_id)
          ),
        ];

        // Add required_roles to the project object
        project.required_roles = requiredRoles;
      }

      return hasAllocations;
    });
  }, [projects, allProjectAllocations, isLoadingAllocations]);

  // Generate project recommendations
  const recommendations = useMemo((): ProjectRecommendation[] => {
    if (!projectsWithDemand || !person) return [];

    const rolesData = roles || [];
    const recommendations: ProjectRecommendation[] = [];

    // Only consider projects that have demand
    projectsWithDemand.forEach((project) => {
      // Skip if project is already assigned to this person
      if (person.assignments?.some((a) => a.project_id === project.id)) {
        return;
      }

      // Find the best matching role for this person on this project
      const projectRoleNeeds = new Set(project.required_roles || []);
      const personRoles =
        person.roles?.map((r) => r.role_id).filter(Boolean) || [];

      // Find roles that match both the person's skills and project needs
      const matchingRoles = personRoles.filter((roleId) =>
        projectRoleNeeds.has(roleId)
      );

      // If project has no role requirements, any person can be assigned
      // Otherwise, only show if there are matching roles or it's an assign_project action
      const hasNoRoleRequirements =
        !project.required_roles || project.required_roles.length === 0;

      if (
        hasNoRoleRequirements ||
        matchingRoles.length > 0 ||
        actionType === 'assign_project'
      ) {
        // Select the best role (prefer primary role if it matches)
        let suggestedRoleId: string | null = null;
        const primaryRole = person.roles?.find((r) => r.is_primary);

        if (hasNoRoleRequirements && primaryRole) {
          // If project has no requirements, use person's primary role
          suggestedRoleId = primaryRole.role_id;
        } else if (
          primaryRole &&
          matchingRoles.includes(primaryRole.role_id) &&
          rolesData.some((r) => r.id === primaryRole.role_id)
        ) {
          suggestedRoleId = primaryRole.role_id;
        } else if (matchingRoles.length > 0) {
          // Find first matching role that exists in database
          suggestedRoleId =
            matchingRoles.find((roleId) =>
              rolesData.some((r) => r.id === roleId)
            ) || null;
        }

        // Fallback to person's primary role or first available role
        if (!suggestedRoleId) {
          suggestedRoleId =
            primaryRole?.role_id ||
            (rolesData.length > 0 ? rolesData[0].id : null);
        }

        const suggestedRole = rolesData.find((r) => r.id === suggestedRoleId);

        // Calculate score using extracted utility functions
        const scoring = hasNoRoleRequirements
          ? calculatePriorityBasedScore(
              project.priority || 3,
              suggestedRole?.name || ''
            )
          : calculateRoleBasedScore(
              matchingRoles.length,
              projectRoleNeeds.size,
              suggestedRole?.name || ''
            );

        const score = scoring.score;
        const fitLevel = scoring.fitLevel;
        const reason = scoring.reason;

        // Suggest allocation based on remaining capacity and project priority
        const suggestedAllocation = calculateSuggestedAllocation(
          utilizationData.remainingCapacity,
          project.priority || 3
        );

        // Only add recommendation if we have a valid role
        if (suggestedRole) {
          recommendations.push({
            project,
            suggestedRole,
            score,
            matchedSkills: matchingRoles,
            fitLevel,
            suggestedAllocation,
            reason,
          });
        }
      }
    });

    // Sort by score and priority
    return recommendations
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return (a.project.priority || 3) - (b.project.priority || 3);
      })
      .slice(0, 5); // Top 5 recommendations
  }, [
    projectsWithDemand,
    person,
    actionType,
    utilizationData.remainingCapacity,
    roles,
  ]);

  return {
    recommendations,
    utilizationData,
    projectsWithDemand,
  };
}

export default useAssignmentRecommendations;
