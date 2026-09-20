/**
 * React Query Key Factory
 *
 * This module provides a centralized, type-safe factory for all React Query keys.
 * Using a factory pattern ensures:
 * - Consistent query key naming across the application
 * - Type-safe query key construction
 * - Reliable cache invalidation
 * - Easy refactoring and maintenance
 *
 * Key Hierarchy Pattern:
 * - Entity root: ['entityName']
 * - List queries: ['entityName', 'list', filters?]
 * - Detail queries: ['entityName', 'detail', id]
 * - Related data: ['entityName', 'subResource', id, additionalParams?]
 *
 * Scenario-Aware Pattern:
 * Many queries are scenario-specific. Include scenarioId in the key
 * to ensure data is cached per scenario.
 *
 * Usage Examples:
 * ```typescript
 * // Fetching all projects
 * useQuery({ queryKey: queryKeys.projects.all })
 *
 * // Fetching a specific project
 * useQuery({ queryKey: queryKeys.projects.detail(projectId) })
 *
 * // Fetching projects with filters
 * useQuery({ queryKey: queryKeys.projects.list(filters) })
 *
 * // Invalidating all project queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
 *
 * // Invalidating specific project
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) })
 * ```
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
 */

// Type definitions for filter parameters
export interface ProjectFilters {
  search?: string;
  status?: string;
  location_id?: string;
  locationId?: string;
  project_type_id?: string;
  projectTypeId?: string;
  priority?: number;
  [key: string]: unknown;
}

export interface PeopleFilters {
  search?: string;
  location_id?: string;
  locationId?: string;
  role_id?: string;
  roleId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AssignmentFilters {
  project_id?: string;
  projectId?: string;
  person_id?: string;
  personId?: string;
  role_id?: string;
  date_range?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  [key: string]: unknown;
}

export interface RoleFilters {
  search?: string;
  category?: string;
}

export interface ReportFilters {
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  location_id?: string;
  locationId?: string;
  project_id?: string;
  projectTypeId?: string;
  person_id?: string;
  role_id?: string;
  roleId?: string;
  [key: string]: unknown;
}

export interface RoadmapFilters {
  startDate?: string;
  endDate?: string;
  projectTypeId?: string;
  locationId?: string;
  [key: string]: unknown;
}

export interface AvailabilityFilters {
  person_id?: string;
  month?: string;
}

/**
 * Query Key Factory
 *
 * Hierarchical structure for query keys following React Query best practices.
 * Each entity has:
 * - `all`: Base key for the entity (use for broad invalidation)
 * - `lists`: Key for list queries
 * - `list(filters)`: Key for filtered list queries
 * - `details`: Key for detail queries
 * - `detail(id)`: Key for specific entity detail
 *
 * Additional keys are provided for related data like:
 * - `phases(projectId)`: Phases for a specific project
 * - `timeline(id)`: Timeline data for an entity
 * - `utilization(id)`: Utilization data for an entity
 */
export const queryKeys = {
  // Projects
  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (filters?: ProjectFilters, scenarioId?: string) =>
      [...queryKeys.projects.lists(), filters, scenarioId] as const,
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
    phases: (projectId: string) =>
      [...queryKeys.projects.all, 'phases', projectId] as const,
    phaseDependencies: (projectId: string) =>
      [...queryKeys.projects.all, 'phaseDependencies', projectId] as const,
    timeline: (projectId: string) =>
      [...queryKeys.projects.all, 'timeline', projectId] as const,
    templateCompliance: (projectId: string) =>
      [...queryKeys.projects.all, 'templateCompliance', projectId] as const,
    allocations: (projectId: string) =>
      [...queryKeys.projects.all, 'allocations', projectId] as const,
    assignments: (projectId: string) =>
      [...queryKeys.projects.all, 'assignments', projectId] as const,
    demand: (projectId: string) =>
      [...queryKeys.projects.all, 'demand', projectId] as const,
    estimation: (projectId: string) =>
      [...queryKeys.projects.all, 'estimation', projectId] as const,
    roadmap: (filters?: RoadmapFilters) =>
      [...queryKeys.projects.all, 'roadmap', filters] as const,
    health: () => [...queryKeys.projects.all, 'health'] as const,
  },

  // Project Types
  projectTypes: {
    all: ['project-types'] as const,
    lists: () => [...queryKeys.projectTypes.all, 'list'] as const,
    list: (filters?: Record<string, unknown>, viewMode?: string) =>
      [...queryKeys.projectTypes.lists(), filters, viewMode] as const,
    details: () => [...queryKeys.projectTypes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.projectTypes.details(), id] as const,
    phases: (projectTypeId: string) =>
      [...queryKeys.projectTypes.all, 'phases', projectTypeId] as const,
    resourceTemplates: (projectTypeId: string) =>
      [...queryKeys.projectTypes.all, 'resourceTemplates', projectTypeId] as const,
    projects: (projectTypeId: string) =>
      [...queryKeys.projectTypes.all, 'projects', projectTypeId] as const,
    hierarchy: () => [...queryKeys.projectTypes.all, 'hierarchy'] as const,
  },

  // People
  people: {
    all: ['people'] as const,
    lists: () => [...queryKeys.people.all, 'list'] as const,
    list: (filters?: PeopleFilters, scenarioId?: string) =>
      [...queryKeys.people.lists(), filters, scenarioId] as const,
    details: () => [...queryKeys.people.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.people.details(), id] as const,
    withAssignments: (id: string) =>
      [...queryKeys.people.all, 'withAssignments', id] as const,
    timeline: (id: string) =>
      [...queryKeys.people.all, 'timeline', id] as const,
    utilizationTimeline: (id: string, startDate?: string, endDate?: string) =>
      [...queryKeys.people.all, 'utilizationTimeline', id, startDate, endDate] as const,
    assignments: (id: string, scenarioId?: string) =>
      [...queryKeys.people.all, 'assignments', id, scenarioId] as const,
    utilization: () => [...queryKeys.people.all, 'utilization'] as const,
    availability: () => [...queryKeys.people.all, 'availability'] as const,
  },

  // Roles
  roles: {
    all: ['roles'] as const,
    lists: () => [...queryKeys.roles.all, 'list'] as const,
    list: (filters?: RoleFilters) =>
      [...queryKeys.roles.lists(), filters] as const,
    details: () => [...queryKeys.roles.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.roles.details(), id] as const,
    capacityGaps: () => [...queryKeys.roles.all, 'capacityGaps'] as const,
  },

  // Assignments
  assignments: {
    all: ['assignments'] as const,
    lists: () => [...queryKeys.assignments.all, 'list'] as const,
    list: (filters?: AssignmentFilters, scenarioId?: string) =>
      [...queryKeys.assignments.lists(), filters, scenarioId] as const,
    details: () => [...queryKeys.assignments.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.assignments.details(), id] as const,
    conflicts: (personId: string) =>
      [...queryKeys.assignments.all, 'conflicts', personId] as const,
    suggestions: (params?: Record<string, unknown>) =>
      [...queryKeys.assignments.all, 'suggestions', params] as const,
    recommendations: (filters?: AssignmentFilters) =>
      [...queryKeys.assignments.all, 'recommendations', filters] as const,
    timeline: (personId: string) =>
      [...queryKeys.assignments.all, 'timeline', personId] as const,
  },

  // Phases (global phase definitions)
  phases: {
    all: ['phases'] as const,
    lists: () => [...queryKeys.phases.all, 'list'] as const,
    list: () => [...queryKeys.phases.lists()] as const,
    details: () => [...queryKeys.phases.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.phases.details(), id] as const,
    templates: () => [...queryKeys.phases.all, 'templates'] as const,
  },

  // Project Phases (phases for specific projects)
  projectPhases: {
    all: ['project-phases'] as const,
    byProject: (projectId: string) =>
      [...queryKeys.projectPhases.all, projectId] as const,
    dependencies: (projectId: string) =>
      [...queryKeys.projectPhases.all, 'dependencies', projectId] as const,
  },

  // Locations
  locations: {
    all: ['locations'] as const,
    lists: () => [...queryKeys.locations.all, 'list'] as const,
    list: () => [...queryKeys.locations.lists()] as const,
    details: () => [...queryKeys.locations.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.locations.details(), id] as const,
  },

  // Scenarios
  scenarios: {
    all: ['scenarios'] as const,
    lists: () => [...queryKeys.scenarios.all, 'list'] as const,
    list: () => [...queryKeys.scenarios.lists()] as const,
    details: () => [...queryKeys.scenarios.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.scenarios.details(), id] as const,
    assignments: (id: string) =>
      [...queryKeys.scenarios.all, 'assignments', id] as const,
    comparison: (id: string, compareToId: string) =>
      [...queryKeys.scenarios.all, 'comparison', id, compareToId] as const,
  },

  // Availability
  availability: {
    all: ['availability'] as const,
    lists: () => [...queryKeys.availability.all, 'list'] as const,
    list: (filters?: AvailabilityFilters) =>
      [...queryKeys.availability.lists(), filters] as const,
    overrides: (personId?: string, month?: string) =>
      [...queryKeys.availability.all, 'overrides', personId, month] as const,
    calendar: (params?: Record<string, unknown>) =>
      [...queryKeys.availability.all, 'calendar', params] as const,
    forecast: (params?: Record<string, unknown>) =>
      [...queryKeys.availability.all, 'forecast', params] as const,
  },

  // Demands
  demands: {
    all: ['demands'] as const,
    project: (projectId: string) =>
      [...queryKeys.demands.all, 'project', projectId] as const,
    summary: (params?: Record<string, unknown>) =>
      [...queryKeys.demands.all, 'summary', params] as const,
    forecast: (params?: Record<string, unknown>) =>
      [...queryKeys.demands.all, 'forecast', params] as const,
    gaps: () => [...queryKeys.demands.all, 'gaps'] as const,
  },

  // Reports
  tags: {
    all: ['tags'] as const,
    lists: () => [...queryKeys.tags.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.tags.lists(), filters] as const,
  },

  reports: {
    all: ['reports'] as const,
    dashboard: (scenarioId?: string) =>
      [...queryKeys.reports.all, 'dashboard', scenarioId] as const,
    capacity: (filters?: ReportFilters, scenarioId?: string) =>
      [...queryKeys.reports.all, 'capacity', filters, scenarioId] as const,
    utilization: (filters?: ReportFilters, scenarioId?: string) =>
      [...queryKeys.reports.all, 'utilization', filters, scenarioId] as const,
    demand: (filters?: ReportFilters, scenarioId?: string) =>
      [...queryKeys.reports.all, 'demand', filters, scenarioId] as const,
    gaps: (filters?: ReportFilters, scenarioId?: string) =>
      [...queryKeys.reports.all, 'gaps', filters, scenarioId] as const,
    filterOptions: () => [...queryKeys.reports.all, 'filterOptions'] as const,
    availableProjects: (personId?: string, scenarioId?: string) =>
      [...queryKeys.reports.all, 'availableProjects', personId, scenarioId] as const,
  },

  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    summary: (scenarioId?: string, dateRange?: Record<string, string>) =>
      [...queryKeys.dashboard.all, 'summary', scenarioId, dateRange] as const,
  },

  // Resource Templates
  resourceTemplates: {
    all: ['resource-templates'] as const,
    lists: () => [...queryKeys.resourceTemplates.all, 'list'] as const,
    list: () => [...queryKeys.resourceTemplates.lists()] as const,
    byProjectType: (projectTypeId: string) =>
      [...queryKeys.resourceTemplates.all, 'byProjectType', projectTypeId] as const,
    byRole: (roleId: string) =>
      [...queryKeys.resourceTemplates.all, 'byRole', roleId] as const,
    summary: () => [...queryKeys.resourceTemplates.all, 'summary'] as const,
  },

  // Settings
  settings: {
    all: ['settings'] as const,
    system: () => [...queryKeys.settings.all, 'system'] as const,
    import: () => [...queryKeys.settings.all, 'import'] as const,
    usersPermissions: () => [...queryKeys.settings.all, 'usersPermissions'] as const,
    userRoles: () => [...queryKeys.settings.all, 'userRoles'] as const,
    systemPermissions: () => [...queryKeys.settings.all, 'systemPermissions'] as const,
  },

  // User Permissions
  userPermissions: {
    all: ['user-permissions'] as const,
    users: () => [...queryKeys.userPermissions.all, 'users'] as const,
    roles: () => [...queryKeys.userPermissions.all, 'roles'] as const,
    systemPermissions: () =>
      [...queryKeys.userPermissions.all, 'systemPermissions'] as const,
    userPermissions: (userId: string) =>
      [...queryKeys.userPermissions.all, 'user', userId] as const,
    rolePermissions: (roleId: string) =>
      [...queryKeys.userPermissions.all, 'role', roleId] as const,
  },

  // Recommendations
  recommendations: {
    all: ['recommendations'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.recommendations.all, 'list', filters] as const,
  },

  // Health
  health: {
    all: ['health'] as const,
    check: () => [...queryKeys.health.all, 'check'] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    history: (userId?: string) =>
      [...queryKeys.notifications.all, 'history', userId] as const,
    preferences: (userId: string) =>
      [...queryKeys.notifications.all, 'preferences', userId] as const,
    templates: () => [...queryKeys.notifications.all, 'templates'] as const,
    stats: (userId?: string) =>
      [...queryKeys.notifications.all, 'stats', userId] as const,
  },

  // Audit
  audit: {
    all: ['audit'] as const,
    history: (tableName: string, recordId: string) =>
      [...queryKeys.audit.all, 'history', tableName, recordId] as const,
    recent: (changedBy?: string) =>
      [...queryKeys.audit.all, 'recent', changedBy] as const,
    stats: () => [...queryKeys.audit.all, 'stats'] as const,
  },

  // Import
  import: {
    all: ['import'] as const,
    settings: () => [...queryKeys.import.all, 'settings'] as const,
    history: () => [...queryKeys.import.all, 'history'] as const,
  },

  // Project Allocations
  projectAllocations: {
    all: ['project-allocations'] as const,
    byProject: (projectId: string) =>
      [...queryKeys.projectAllocations.all, projectId] as const,
    allProjects: () =>
      [...queryKeys.projectAllocations.all, 'all'] as const,
    list: () => [...queryKeys.projectAllocations.all, 'list'] as const,
  },

  // Available projects for assignment
  availableProjects: {
    all: ['availableProjects'] as const,
    forPerson: (personId: string, scenarioId?: string) =>
      [...queryKeys.availableProjects.all, personId, scenarioId] as const,
  },

  // GitHub Connections (Feature: 005-github-auth-user-link)
  githubConnections: {
    all: ['github-connections'] as const,
    lists: () => [...queryKeys.githubConnections.all, 'list'] as const,
    list: (options?: { includeInactive?: boolean; includeAssociations?: boolean }) =>
      [...queryKeys.githubConnections.lists(), options] as const,
    details: () => [...queryKeys.githubConnections.all, 'detail'] as const,
    detail: (id?: number, options?: { includeAssociations?: boolean }) =>
      [...queryKeys.githubConnections.details(), id, options] as const,
    associations: (id?: number, options?: { includeInactive?: boolean }) =>
      [...queryKeys.githubConnections.all, 'associations', id, options] as const,
  },
} as const;

// Type exports for use in components
export type QueryKeys = typeof queryKeys;
export type ProjectQueryKeys = typeof queryKeys.projects;
export type PeopleQueryKeys = typeof queryKeys.people;
export type RolesQueryKeys = typeof queryKeys.roles;
export type AssignmentQueryKeys = typeof queryKeys.assignments;
export type ScenarioQueryKeys = typeof queryKeys.scenarios;
export type ReportQueryKeys = typeof queryKeys.reports;

// Type helper for extracting query key type
export type QueryKey = ReturnType<
  | typeof queryKeys.projects.list
  | typeof queryKeys.projects.detail
  | typeof queryKeys.people.list
  | typeof queryKeys.people.detail
  | typeof queryKeys.assignments.list
  | typeof queryKeys.scenarios.list
  | typeof queryKeys.reports.capacity
  | typeof queryKeys.dashboard.summary
>;

/**
 * Helper function to invalidate all queries for an entity
 * @param queryClient - The query client instance
 * @param entityKey - The base entity key (e.g., queryKeys.projects.all)
 */
export function invalidateEntity(
  queryClient: { invalidateQueries: (options: { queryKey: readonly string[] }) => void },
  entityKey: readonly string[]
): void {
  queryClient.invalidateQueries({ queryKey: entityKey });
}

/**
 * Helper function to invalidate multiple related entities after a mutation
 * @param queryClient - The query client instance
 * @param entityKeys - Array of entity keys to invalidate
 */
export function invalidateMultiple(
  queryClient: { invalidateQueries: (options: { queryKey: readonly string[] }) => void },
  entityKeys: readonly (readonly string[])[]
): void {
  entityKeys.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: key });
  });
}

export default queryKeys;
