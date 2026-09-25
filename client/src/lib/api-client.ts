import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { logger } from '../services/logger';
import { translateServerMessage, translateAxiosMessage } from './i18n-error';
import type {
  Location,
  ProjectType,
  Project,
  Person,
  Role,
  ProjectAssignment,
  PersonAvailabilityOverride,
  ProjectPhase,
  Scenario,
  PaginationParams,
  PaginatedResponse,
  // API Response types
  ProjectDemandsResponse,
  PhaseValidationResponse,
  CustomPhaseValidationResponse,
  TemplateComplianceResponse,
  CustomPhaseResponse,
  ProjectPhaseUpdateResponse,
  ProjectHealthResponse,
  PersonRoleResponse,
  UtilizationResponse,
  AvailabilityResponse,
  RolePlannerResponse,
  CapacityGapsResponse,
  AssignmentConflictsResponse,
  AssignmentSuggestionsResponse,
  AssignmentTimelineResponse,
  ResourceTemplatesListResponse,
  ResourceTemplateResponse,
  ResourceTemplateBulkResponse,
  ResourceTemplateCopyResponse,
  TemplatesListResponse,
  ResourceTemplateSummaryResponse,
  ProjectTypeResourceTemplatesResponse,
  AvailabilityCalendarResponse,
  AvailabilityForecastResponse,
  DemandSummaryResponse,
  DemandOverrideResponse,
  DemandForecastResponse,
  DemandGapsResponse,
  DemandScenarioResponse,
  DashboardReportResponse,
  CapacityReportResponse,
  DemandReportResponse,
  UtilizationReportResponse,
  GapsReportResponse,
  ProjectsReportResponse,
  TimelineReportResponse,
  ImportExcelResponse,
  ImportValidationResponse,
  ImportSettingsResponse,
  ImportHistoryResponse,
  ImportAnalysisResponse,
  ProjectTypeHierarchyResponse,
  ProjectTypePhasesResponse,
  ProjectPhasesListResponse,
  ProjectPhaseResponse,
  ProjectPhasesBulkResponse,
  ProjectPhaseDependenciesListResponse,
  ProjectPhaseDependencyResponse,
  CascadeCalculationResponse,
  CascadeApplicationResponse,
  ProjectAllocationsResponse,
  ProjectAllocationsInitResponse,
  ProjectAllocationOverrideResponse,
  ProjectEstimation,
  EstimationCheckResponse,
  EstimationDeviation,
  Tag,
  ScenarioAssignmentsResponse,
  ScenarioComparisonResponse,
  AuditHistoryResponse,
  AuditRecentResponse,
  AuditSearchResponse,
  AuditStatsResponse,
  SystemSettingsResponse,
  ImportSettingsResponseType,
  SystemPermissionsResponse,
  UserRolesResponse,
  RolePermissionsResponse,
  UsersListResponse,
  UserPermissionsResponse,
  RolePermissionsUpdateResponse,
  UserRoleUpdateResponse,
  UserPermissionUpdateResponse,
  UserPermissionCheckResponse,
  NotificationResponse,
  NotificationPreferencesResponse,
  EmailTemplatesResponse,
  NotificationHistoryResponse,
  EmailConfigResponse,
  NotificationStatsResponse,
  RecommendationsListResponse,
  RecommendationExecuteResponse,
  HealthCheckResponse,
  SyncStatusResponse,
  SyncPullResponse,
  SyncPushResponse,
  SyncConflictsResponse,
  SyncConflictResolveResponse,
  SyncHistoryResponse,
  BranchesListResponse,
  BranchCreateResponse,
  BranchCheckoutResponse,
  BranchMergeResponse,
  BranchCompareResponse,
  GitHubConnectionsListResponse,
  GitHubConnectionResponse,
  GitHubConnectionUpdateResponse,
  GitHubConnectionDeleteResponse,
  GitHubOAuthInitResponse,
  GitHubPATConnectResponse,
  GitHubAssociationsResponse,
  GitHubAssociationCreateResponse,
  GitHubAssociationDeleteResponse,
} from '../types';

// Import/Export options
interface ImportExcelOptions {
  clearExisting?: boolean;
  useV2?: boolean;
  validateDuplicates?: boolean;
  autoCreateMissingRoles?: boolean;
  autoCreateMissingLocations?: boolean;
  defaultProjectPriority?: number;
  dateFormat?: string;
}

interface ExportScenarioOptions {
  includeAssignments?: boolean;
  includePhases?: boolean;
}

interface ExportTemplateOptions {
  templateType?: string;
  includeAssignments?: boolean;
  includePhases?: boolean;
}

// Force use of proxy for E2E testing
const API_BASE_URL = '/api';

// Auth token storage keys
const AUTH_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

// Helper to add subscribers waiting for token refresh
function subscribeTokenRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback);
}

// Helper to notify subscribers when token is refreshed
function onTokenRefreshed(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth token and scenario context
apiClient.interceptors.request.use((config) => {
  // Add auth token if available
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Add scenario context from localStorage
  const scenarioContext = localStorage.getItem('currentScenario');
  if (scenarioContext) {
    try {
      const scenario = JSON.parse(scenarioContext) as { id?: string };
      if (scenario?.id) {
        config.headers['X-Scenario-Id'] = scenario.id;
      }
    } catch (error) {
      logger.error('Failed to parse scenario context', { error });
    }
  }

  return config;
});

// Extended request config to track retry attempts
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    // Use Axios type guard for proper type narrowing
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetryableRequestConfig | undefined;
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      const errorCode = (error.response?.data as { code?: string })?.code;

      // If token expired, try to refresh
      if (errorCode === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          // Wait for the ongoing refresh to complete
          return new Promise((resolve) => {
            subscribeTokenRefresh((token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (refreshToken) {
          try {
            // Use a new axios instance to avoid interceptor loop
            const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refreshToken
            });

            const { accessToken, refreshToken: newRefreshToken } = response.data as {
              accessToken: string;
              refreshToken: string;
            };

            // Save new tokens
            localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
            localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);

            // Notify waiting requests
            onTokenRefreshed(accessToken);
            isRefreshing = false;

            // Retry the original request
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return apiClient(originalRequest);
          } catch (refreshError) {
            // Refresh failed, clear tokens and redirect to login
            isRefreshing = false;
            clearAuthTokens();
            redirectToLogin();
            return Promise.reject(refreshError);
          }
        } else {
          // No refresh token, redirect to login
          clearAuthTokens();
          redirectToLogin();
        }
      } else {
        // Other 401 errors (invalid token, no token, etc.) - redirect to login
        clearAuthTokens();
        redirectToLogin();
      }
    }

    // Localize the server-provided error message in place so existing
    // `err.response?.data?.error` consumers render the translated text.
    const data = error.response?.data as { error?: unknown } | undefined;
    if (data && typeof data.error === 'string') {
      data.error = translateServerMessage(data.error);
    } else if (!error.response) {
      // Network-level failure has no response body; localize axios' own message
      error.message = translateAxiosMessage(error.message);
    }

    return Promise.reject(error);
  }
);

// Helper to clear auth tokens
export function clearAuthTokens(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Helper to save auth tokens
export function saveAuthTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

// Helper to get current access token
export function getAccessToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Helper to check if user is authenticated
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(AUTH_TOKEN_KEY);
}

// Helper to redirect to login
function redirectToLogin(): void {
  // Dispatch a custom event that the app can listen to
  window.dispatchEvent(new CustomEvent('auth:logout'));
}

// Type-safe API endpoints
export const api = {
  // Projects
  projects: {
    list: (params?: PaginationParams) => apiClient.get<PaginatedResponse<Project>>('/projects', { params }),
    get: (id: string) => apiClient.get<{ data: Project }>(`/projects/${id}`),
    create: (data: Partial<Project>) => apiClient.post<{ data: Project }>('/projects', data),
    update: (id: string, data: Partial<Project>) => apiClient.put<{ data: Project }>(`/projects/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/projects/${id}`),
    getDemands: (id: string) => apiClient.get<ProjectDemandsResponse>(`/projects/${id}/demands`),
    // Phase management endpoints
    validatePhaseUpdates: (id: string, data: Record<string, unknown>) => apiClient.post<PhaseValidationResponse>(`/projects/${id}/phases/validate-updates`, data),
    validateCustomPhase: (id: string, data: Record<string, unknown>) => apiClient.post<CustomPhaseValidationResponse>(`/projects/${id}/phases/validate-custom`, data),
    getTemplateCompliance: (id: string) => apiClient.get<TemplateComplianceResponse>(`/projects/${id}/template-compliance`),
    addCustomPhase: (id: string, data: Record<string, unknown>) => apiClient.post<CustomPhaseResponse>(`/projects/${id}/phases/custom`, data),
    updateProjectPhase: (id: string, phaseTimelineId: string, data: Record<string, unknown>) => apiClient.put<ProjectPhaseUpdateResponse>(`/projects/${id}/phases/${phaseTimelineId}`, data),
    deleteProjectPhase: (id: string, phaseTimelineId: string) => apiClient.delete<{ message: string }>(`/projects/${id}/phases/${phaseTimelineId}`),
    getHealth: () => apiClient.get<ProjectHealthResponse>('/projects/dashboard/health'),
  },

  // People
  people: {
    list: (params?: PaginationParams) => apiClient.get<PaginatedResponse<Person>>('/people', { params }),
    get: (id: string) => apiClient.get<{ data: Person }>(`/people/${id}`),
    create: (data: Partial<Person>) => apiClient.post<{ data: Person }>('/people', data),
    update: (id: string, data: Partial<Person>) => apiClient.put<{ data: Person }>(`/people/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/people/${id}`),
    addRole: (id: string, data: Record<string, unknown>) => apiClient.post<PersonRoleResponse>(`/people/${id}/roles`, data),
    updateRole: (id: string, roleId: string, data: Record<string, unknown>) => apiClient.put<PersonRoleResponse>(`/people/${id}/roles/${roleId}`, data),
    removeRole: (id: string, roleId: string) => apiClient.delete<{ message: string }>(`/people/${id}/roles/${roleId}`),
    getUtilization: () => apiClient.get<UtilizationResponse>('/people/dashboard/utilization'),
    getAvailability: () => apiClient.get<AvailabilityResponse>('/people/dashboard/availability'),
  },

  // Roles
  roles: {
    list: (params?: PaginationParams) => apiClient.get<PaginatedResponse<Role>>('/roles', { params }),
    get: (id: string) => apiClient.get<{ data: Role }>(`/roles/${id}`),
    create: (data: Partial<Role>) => apiClient.post<{ data: Role }>('/roles', data),
    update: (id: string, data: Partial<Role>) => apiClient.put<{ data: Role }>(`/roles/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/roles/${id}`),
    addPlanner: (id: string, data: Record<string, unknown>) => apiClient.post<RolePlannerResponse>(`/roles/${id}/planners`, data),
    removePlanner: (id: string, plannerId: string) => apiClient.delete<{ message: string }>(`/roles/${id}/planners/${plannerId}`),
    getCapacityGaps: () => apiClient.get<CapacityGapsResponse>('/roles/dashboard/capacity-gaps'),
  },

  // Assignments
  assignments: {
    list: (params?: PaginationParams) => apiClient.get<PaginatedResponse<ProjectAssignment>>('/assignments', { params }),
    create: (data: Partial<ProjectAssignment>) => apiClient.post<{ data: ProjectAssignment }>('/assignments', data),
    update: (id: string, data: Partial<ProjectAssignment>) => apiClient.put<{ data: ProjectAssignment }>(`/assignments/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/assignments/${id}`),
    bulkCreate: (data: Record<string, unknown>) => apiClient.post<{ data: ProjectAssignment[] }>('/assignments/bulk', data),
    getConflicts: (personId: string, params?: PaginationParams) => apiClient.get<AssignmentConflictsResponse>(`/assignments/conflicts/${personId}`, { params }),
    getSuggestions: (params: Record<string, unknown>) => apiClient.get<AssignmentSuggestionsResponse>('/assignments/suggestions', { params }),
    getTimeline: (personId: string, params?: PaginationParams) => apiClient.get<AssignmentTimelineResponse>(`/assignments/timeline/${personId}`, { params }),
  },

  // Resource Templates
  resourceTemplates: {
    list: (params?: PaginationParams) => apiClient.get<ResourceTemplatesListResponse>('/resource-templates', { params }),
    create: (data: Record<string, unknown>) => apiClient.post<ResourceTemplateResponse>('/resource-templates', data),
    bulkUpdate: (data: Record<string, unknown>) => apiClient.post<ResourceTemplateBulkResponse>('/resource-templates/bulk', data),
    copy: (data: Record<string, unknown>) => apiClient.post<ResourceTemplateCopyResponse>('/resource-templates/copy', data),
    getTemplates: () => apiClient.get<TemplatesListResponse>('/resource-templates/templates'),
    getSummary: () => apiClient.get<ResourceTemplateSummaryResponse>('/resource-templates/summary'),
    getByProjectType: (projectTypeId: string) => apiClient.get<ProjectTypeResourceTemplatesResponse>(`/resource-templates/project-type/${projectTypeId}`),
  },

  // Availability
  availability: {
    list: (params?: PaginationParams) => apiClient.get<PaginatedResponse<PersonAvailabilityOverride>>('/availability', { params }),
    create: (data: Partial<PersonAvailabilityOverride>) => apiClient.post<{ data: PersonAvailabilityOverride }>('/availability', data),
    update: (id: string, data: Partial<PersonAvailabilityOverride>) => apiClient.put<{ data: PersonAvailabilityOverride }>(`/availability/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/availability/${id}`),
    bulkCreate: (data: Record<string, unknown>) => apiClient.post<{ data: PersonAvailabilityOverride[] }>('/availability/bulk', data),
    approve: (id: string, data: Record<string, unknown>) => apiClient.post<{ data: PersonAvailabilityOverride }>(`/availability/${id}/approve`, data),
    getCalendar: (params?: PaginationParams) => apiClient.get<AvailabilityCalendarResponse>('/availability/calendar', { params }),
    getForecast: (params?: PaginationParams) => apiClient.get<AvailabilityForecastResponse>('/availability/forecast', { params }),
  },

  // Demands
  demands: {
    getProjectDemands: (projectId: string) => apiClient.get<ProjectDemandsResponse>(`/demands/project/${projectId}`),
    getSummary: (params?: PaginationParams) => apiClient.get<DemandSummaryResponse>('/demands/summary', { params }),
    createOverride: (data: Record<string, unknown>) => apiClient.post<DemandOverrideResponse>('/demands/override', data),
    deleteOverride: (id: string) => apiClient.delete<{ message: string }>(`/demands/override/${id}`),
    getForecast: (params?: PaginationParams) => apiClient.get<DemandForecastResponse>('/demands/forecast', { params }),
    getGaps: () => apiClient.get<DemandGapsResponse>('/demands/gaps'),
    calculateScenario: (data: Record<string, unknown>) => apiClient.post<DemandScenarioResponse>('/demands/scenario', data),
  },

  // Reporting
  reporting: {
    getDashboard: () => apiClient.get<DashboardReportResponse>('/reporting/dashboard'),
    getCapacity: (params?: PaginationParams) => apiClient.get<CapacityReportResponse>('/reporting/capacity', { params }),
    getDemand: (params?: PaginationParams) => apiClient.get<DemandReportResponse>('/reporting/demand', { params }),
    getUtilization: (params?: PaginationParams) => apiClient.get<UtilizationReportResponse>('/reporting/utilization', { params }),
    getGaps: (params?: PaginationParams) => apiClient.get<GapsReportResponse>('/reporting/gaps', { params }),
    getProjects: (params?: PaginationParams) => apiClient.get<ProjectsReportResponse>('/reporting/projects', { params }),
    getTimeline: (params?: PaginationParams) => apiClient.get<TimelineReportResponse>('/reporting/timeline', { params }),
  },

  // Import
  import: {
    uploadExcel: (file: File, options: ImportExcelOptions = {}) => {
      const formData = new FormData();
      formData.append('excelFile', file);
      formData.append('clearExisting', (options.clearExisting || false).toString());
      formData.append('useV2', (options.useV2 !== undefined ? options.useV2 : true).toString());
      if (options.validateDuplicates !== undefined) {
        formData.append('validateDuplicates', options.validateDuplicates.toString());
      }
      if (options.autoCreateMissingRoles !== undefined) {
        formData.append('autoCreateMissingRoles', options.autoCreateMissingRoles.toString());
      }
      if (options.autoCreateMissingLocations !== undefined) {
        formData.append('autoCreateMissingLocations', options.autoCreateMissingLocations.toString());
      }
      if (options.defaultProjectPriority !== undefined) {
        formData.append('defaultProjectPriority', options.defaultProjectPriority.toString());
      }
      if (options.dateFormat) {
        formData.append('dateFormat', options.dateFormat);
      }
      return apiClient.post<ImportExcelResponse>('/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    validateFile: (file: File) => {
      const formData = new FormData();
      formData.append('excelFile', file);
      return apiClient.post<ImportValidationResponse>('/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    getSettings: () => apiClient.get<ImportSettingsResponse>('/import/settings'),
    getTemplate: () => apiClient.get<Blob>('/import/template', {
      responseType: 'blob',
    }),
    getHistory: () => apiClient.get<ImportHistoryResponse>('/import/history'),
    analyzeImport: (file: File, options: ImportExcelOptions = {}) => {
      const formData = new FormData();
      formData.append('excelFile', file);
      formData.append('clearExisting', (options.clearExisting || false).toString());
      formData.append('useV2', (options.useV2 !== undefined ? options.useV2 : true).toString());
      if (options.validateDuplicates !== undefined) {
        formData.append('validateDuplicates', options.validateDuplicates.toString());
      }
      if (options.autoCreateMissingRoles !== undefined) {
        formData.append('autoCreateMissingRoles', options.autoCreateMissingRoles.toString());
      }
      if (options.autoCreateMissingLocations !== undefined) {
        formData.append('autoCreateMissingLocations', options.autoCreateMissingLocations.toString());
      }
      if (options.defaultProjectPriority !== undefined) {
        formData.append('defaultProjectPriority', options.defaultProjectPriority.toString());
      }
      if (options.dateFormat) {
        formData.append('dateFormat', options.dateFormat);
      }
      return apiClient.post<ImportAnalysisResponse>('/import/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    exportScenario: (scenarioId: string, options: ExportScenarioOptions = {}) => {
      const params = new URLSearchParams({
        scenarioId,
        includeAssignments: (options.includeAssignments !== false).toString(),
        includePhases: (options.includePhases !== false).toString(),
      });
      return apiClient.get<Blob>(`/import/export/scenario?${params.toString()}`, {
        responseType: 'blob',
      });
    },
    exportTemplate: (options: ExportTemplateOptions = {}) => {
      const params = new URLSearchParams({
        templateType: options.templateType || 'complete',
        includeAssignments: (options.includeAssignments !== false).toString(),
        includePhases: (options.includePhases !== false).toString(),
      });
      return apiClient.get<Blob>(`/import/template?${params.toString()}`, {
        responseType: 'blob',
      });
    },
  },

  // Export
  export: {
    reportAsExcel: (reportType: string, filters?: Record<string, unknown>) =>
      apiClient.post<Blob>('/export/reports/excel', { reportType, filters }, {
        responseType: 'blob',
      }),
    reportAsCSV: (reportType: string, filters?: Record<string, unknown>) =>
      apiClient.post<Blob>('/export/reports/csv', { reportType, filters }, {
        responseType: 'blob',
      }),
    reportAsPDF: (reportType: string, filters?: Record<string, unknown>) =>
      apiClient.post<Blob>('/export/reports/pdf', { reportType, filters }, {
        responseType: 'blob',
      }),
  },

  // Simple endpoints
  locations: {
    list: () => apiClient.get<PaginatedResponse<Location>>('/locations'),
    get: (id: string) => apiClient.get<{ data: Location }>(`/locations/${id}`),
    create: (data: Partial<Location>) => apiClient.post<{ data: Location }>('/locations', data),
    update: (id: string, data: Partial<Location>) => apiClient.put<{ data: Location }>(`/locations/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/locations/${id}`),
  },

  projectTypes: {
    list: () => apiClient.get<PaginatedResponse<ProjectType>>('/project-types'),
    get: (id: string) => apiClient.get<{ data: ProjectType }>(`/project-types/${id}`),
    create: (data: Partial<ProjectType>) => apiClient.post<{ data: ProjectType }>('/project-types', data),
    update: (id: string, data: Partial<ProjectType>) => apiClient.put<{ data: ProjectType }>(`/project-types/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/project-types/${id}`),
    // Hierarchy methods
    getHierarchy: () => apiClient.get<ProjectTypeHierarchyResponse>('/project-type-hierarchy/hierarchy'),
    getPhases: (id: string) => apiClient.get<ProjectTypePhasesResponse>(`/project-type-hierarchy/${id}/phases`),
    createSubType: (parentId: string, data: Partial<ProjectType>) => apiClient.post<{ data: ProjectType }>(`/project-type-hierarchy/${parentId}/children`, data),
    addPhase: (id: string, data: Record<string, unknown>) => apiClient.post<{ data: ProjectPhase }>(`/project-type-hierarchy/${id}/phases`, data),
    updatePhase: (id: string, phaseId: string, data: Record<string, unknown>) => apiClient.put<{ data: ProjectPhase }>(`/project-type-hierarchy/${id}/phases/${phaseId}`, data),
    removePhase: (id: string, phaseId: string) => apiClient.delete<{ message: string }>(`/project-type-hierarchy/${id}/phases/${phaseId}`),
    updateHierarchy: (id: string, data: Record<string, unknown>) => apiClient.put<{ data: ProjectType }>(`/project-type-hierarchy/${id}/hierarchy`, data),
  },

  // Grouped by project type: data: [{project_type_id, project_type_name, sub_types: [...]}]
  projectSubTypes: {
    list: () => apiClient.get<{ data: Array<{ project_type_id: string; project_type_name: string; sub_types: Array<{ id: string; name: string }> }> }>('/project-sub-types'),
  },

  phases: {
    list: () => apiClient.get<PaginatedResponse<ProjectPhase>>('/phases'),
    get: (id: string) => apiClient.get<{ data: ProjectPhase }>(`/phases/${id}`),
    create: (data: Partial<ProjectPhase>) => apiClient.post<{ data: ProjectPhase }>('/phases', data),
    update: (id: string, data: Partial<ProjectPhase>) => apiClient.put<{ data: ProjectPhase }>(`/phases/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/phases/${id}`),
  },

  projectPhases: {
    list: (params?: PaginationParams) => apiClient.get<ProjectPhasesListResponse>('/project-phases', { params }),
    get: (id: string) => apiClient.get<ProjectPhaseResponse>(`/project-phases/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>('/project-phases', data),
    update: (id: string, data: Record<string, unknown>) => apiClient.put<ProjectPhaseResponse>(`/project-phases/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/project-phases/${id}`),
    bulkUpdate: (data: Record<string, unknown>) => apiClient.post<ProjectPhasesBulkResponse>('/project-phases/bulk', data),
    duplicatePhase: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>('/project-phases/duplicate', data),
    createCustomPhase: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>('/project-phases/create-custom', data),
    applyBulkCorrections: (data: Record<string, unknown>) => apiClient.post<ProjectPhasesBulkResponse>('/project-phases/bulk-corrections', data),
  },

  // Project Phase Dependencies
  projectPhaseDependencies: {
    list: (params?: PaginationParams) => apiClient.get<ProjectPhaseDependenciesListResponse>('/project-phase-dependencies', { params }),
    get: (id: string) => apiClient.get<ProjectPhaseDependencyResponse>(`/project-phase-dependencies/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseDependencyResponse>('/project-phase-dependencies', data),
    update: (id: string, data: Record<string, unknown>) => apiClient.put<ProjectPhaseDependencyResponse>(`/project-phase-dependencies/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/project-phase-dependencies/${id}`),
    calculateCascade: (data: Record<string, unknown>) => apiClient.post<CascadeCalculationResponse>('/project-phase-dependencies/calculate-cascade', data),
    applyCascade: (data: Record<string, unknown>) => apiClient.post<CascadeApplicationResponse>('/project-phase-dependencies/apply-cascade', data),
  },

  projectAllocations: {
    get: (projectId: string) => apiClient.get<ProjectAllocationsResponse>(`/project-allocations/${projectId}`),
    initialize: (projectId: string) => apiClient.post<ProjectAllocationsInitResponse>(`/project-allocations/${projectId}/initialize`),
    override: (projectId: string, data: Record<string, unknown>) => apiClient.post<ProjectAllocationOverrideResponse>(`/project-allocations/${projectId}/override`, data),
    reset: (projectId: string, phaseId: string, roleId: string) => apiClient.post<{ message: string }>(`/project-allocations/${projectId}/reset/${phaseId}/${roleId}`),
    delete: (projectId: string, phaseId: string, roleId: string) => apiClient.delete<{ message: string }>(`/project-allocations/${projectId}/${phaseId}/${roleId}`),
  },

  // Scenarios
  scenarios: {
    list: () => apiClient.get<PaginatedResponse<Scenario>>('/scenarios'),
    get: (id: string) => apiClient.get<{ data: Scenario }>(`/scenarios/${id}`),
    create: (data: Partial<Scenario>) => apiClient.post<{ data: Scenario }>('/scenarios', data),
    update: (id: string, data: Partial<Scenario>) => apiClient.put<{ data: Scenario }>(`/scenarios/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/scenarios/${id}`),
    getAssignments: (id: string) => apiClient.get<ScenarioAssignmentsResponse>(`/scenarios/${id}/assignments`),
    upsertAssignment: (id: string, data: Record<string, unknown>) => apiClient.post<{ data: ProjectAssignment }>(`/scenarios/${id}/assignments`, data),
    removeAssignment: (id: string, assignmentId: string) => apiClient.delete<{ message: string }>(`/scenarios/${id}/assignments/${assignmentId}`),
    compare: (id: string, compareToId: string) => apiClient.get<ScenarioComparisonResponse>(`/scenarios/${id}/compare?compare_to=${compareToId}`),
    merge: (id: string, data?: Record<string, unknown>) => apiClient.post<{ data: Scenario }>(`/scenarios/${id}/merge`, data || {}),
  },

  // Audit
  audit: {
    getHistory: (tableName: string, recordId: string, limit?: number) =>
      apiClient.get<AuditHistoryResponse>(`/audit/history/${tableName}/${recordId}`, { params: { limit } }),
    getRecentChanges: (changedBy?: string, limit?: number, offset?: number) =>
      apiClient.get<AuditRecentResponse>('/audit/recent', { params: { changedBy, limit, offset } }),
    searchAuditLog: (filters: Record<string, unknown>) =>
      apiClient.get<AuditSearchResponse>('/audit/search', { params: filters }),
    getStats: () => apiClient.get<AuditStatsResponse>('/audit/stats'),
    undoLastChange: (tableName: string, recordId: string, comment?: string) =>
      apiClient.post<{ message: string }>(`/audit/undo/${tableName}/${recordId}`, { comment }),
    undoLastNChanges: (changedBy: string, count: number, comment?: string) =>
      apiClient.post<{ message: string }>(`/audit/undo-batch/${changedBy}/${count}`, { comment }),
    cleanupExpiredEntries: () => apiClient.post<{ message: string }>('/audit/cleanup'),
  },

  // Settings
  settings: {
    getSystemSettings: () => apiClient.get<SystemSettingsResponse>('/settings/system'),
    saveSystemSettings: (data: Record<string, unknown>) => apiClient.post<SystemSettingsResponse>('/settings/system', data),
    updateSystemSettings: (data: Record<string, unknown>) => apiClient.put<SystemSettingsResponse>('/settings/system', data),
    getImportSettings: () => apiClient.get<ImportSettingsResponseType>('/settings/import'),
    saveImportSettings: (data: Record<string, unknown>) => apiClient.post<ImportSettingsResponseType>('/settings/import', data),
    updateImportSettings: (data: Record<string, unknown>) => apiClient.put<ImportSettingsResponseType>('/settings/import', data),
  },

  // User Permissions
  userPermissions: {
    getSystemPermissions: () => apiClient.get<SystemPermissionsResponse>('/user-permissions/permissions'),
    getUserRoles: () => apiClient.get<UserRolesResponse>('/user-permissions/roles'),
    getRolePermissions: (roleId: string) => apiClient.get<RolePermissionsResponse>(`/user-permissions/roles/${roleId}/permissions`),
    updateRolePermissions: (roleId: string, permissionIds: string[]) => apiClient.put<RolePermissionsUpdateResponse>(`/user-permissions/roles/${roleId}/permissions`, { permissionIds }),
    getUsersList: () => apiClient.get<UsersListResponse>('/user-permissions/users'),
    getUserPermissions: (userId: string) => apiClient.get<UserPermissionsResponse>(`/user-permissions/users/${userId}/permissions`),
    updateUserRole: (userId: string, roleId: string) => apiClient.put<UserRoleUpdateResponse>(`/user-permissions/users/${userId}/role`, { roleId }),
    updateUserPermission: (userId: string, permissionId: string, granted: boolean, reason?: string) =>
      apiClient.put<UserPermissionUpdateResponse>(`/user-permissions/users/${userId}/permissions`, { permissionId, granted, reason }),
    removeUserPermissionOverride: (userId: string, permissionId: string) =>
      apiClient.delete<{ message: string }>(`/user-permissions/users/${userId}/permissions/${permissionId}`),
    checkUserPermission: (userId: string, permissionName: string) =>
      apiClient.get<UserPermissionCheckResponse>(`/user-permissions/users/${userId}/check/${permissionName}`),
  },

  // Notifications
  notifications: {
    sendNotification: (data: Record<string, unknown>) => apiClient.post<NotificationResponse>('/notifications/send', data),
    getUserNotificationPreferences: (userId: string) => apiClient.get<NotificationPreferencesResponse>(`/notifications/preferences/${userId}`),
    updateUserNotificationPreferences: (userId: string, preferences: Record<string, unknown>) => apiClient.put<NotificationPreferencesResponse>(`/notifications/preferences/${userId}`, { preferences }),
    getEmailTemplates: () => apiClient.get<EmailTemplatesResponse>('/notifications/templates'),
    getNotificationHistory: (userId?: string, params?: PaginationParams) => apiClient.get<NotificationHistoryResponse>(`/notifications/history/${userId || ''}`, { params }),
    sendTestEmail: (email: string) => apiClient.post<{ message: string }>('/notifications/test', { email }),
    checkEmailConfiguration: () => apiClient.get<EmailConfigResponse>('/notifications/config'),
    getNotificationStats: (userId?: string, params?: PaginationParams) => apiClient.get<NotificationStatsResponse>(`/notifications/stats/${userId || ''}`, { params }),
  },

  // Recommendations
  recommendations: {
    list: (params?: PaginationParams) => apiClient.get<RecommendationsListResponse>('/recommendations', { params }),
    execute: (recommendationId: string, actions: Record<string, unknown>) => apiClient.post<RecommendationExecuteResponse>(`/recommendations/${recommendationId}/execute`, { actions }),
  },

  // Health check
  health: () => apiClient.get<HealthCheckResponse>('/health'),

  // Authentication
  auth: {
    login: (personId: string) => apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/login', { personId }),
    logout: () => apiClient.post<{ message: string }>('/auth/logout'),
    refresh: (refreshToken: string) => apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),
    me: () => apiClient.get<{ data: Person }>('/auth/me'),
    verify: () => apiClient.get<{ verified: boolean }>('/auth/verify'),
  },

  // Git Sync (Feature: 001-git-sync-integration)
  sync: {
    getStatus: () => apiClient.get<SyncStatusResponse>('/sync/status'),
    pull: () => apiClient.post<SyncPullResponse>('/sync/pull'),
    push: (data?: { commitMessage?: string }) => apiClient.post<SyncPushResponse>('/sync/push', data),
    getConflicts: () => apiClient.get<SyncConflictsResponse>('/sync/conflicts'),
    resolveConflict: (conflictId: string, resolution: 'accept_local' | 'accept_remote' | 'custom', customValue?: unknown) =>
      apiClient.post<SyncConflictResolveResponse>(`/sync/conflicts/${conflictId}/resolve`, { resolution, customValue }),
    getHistory: (params?: { limit?: number; entityType?: string; entityId?: string }) =>
      apiClient.get<SyncHistoryResponse>('/sync/history', { params }),
    // Branch operations (User Story 3)
    listBranches: () => apiClient.get<BranchesListResponse>('/sync/branches'),
    createBranch: (data: { name: string; description: string }) => apiClient.post<BranchCreateResponse>('/sync/branches', data),
    checkoutBranch: (branchName: string) => apiClient.post<BranchCheckoutResponse>(`/sync/branches/${branchName}/checkout`),
    mergeBranch: (branchName: string) => apiClient.post<BranchMergeResponse>(`/sync/branches/${branchName}/merge`),
    compareBranches: (base: string, target: string) => apiClient.get<BranchCompareResponse>(`/sync/compare?base=${base}&target=${target}`),
  },

  // GitHub Connections (Feature: 005-github-auth-user-link)
  githubConnections: {
    // List connections
    list: (params?: { include_inactive?: boolean; include_associations?: boolean }) =>
      apiClient.get<GitHubConnectionsListResponse>('/github-connections', { params }),

    // Get single connection
    get: (id: number, params?: { include_associations?: boolean }) =>
      apiClient.get<GitHubConnectionResponse>(`/github-connections/${id}`, { params }),

    // Update connection (set as default, update status)
    update: (id: number, data: { is_default?: boolean; status?: string }) =>
      apiClient.patch<GitHubConnectionUpdateResponse>(`/github-connections/${id}`, data),

    // Delete connection
    delete: (id: number) =>
      apiClient.delete<GitHubConnectionDeleteResponse>(`/github-connections/${id}`),

    // OAuth flow
    initiateOAuth: (data?: { github_base_url?: string }) =>
      apiClient.post<GitHubOAuthInitResponse>('/github-connections/oauth/authorize', data),

    // PAT connection
    connectWithPAT: (data: { token: string; github_base_url?: string }) =>
      apiClient.post<GitHubPATConnectResponse>('/github-connections/pat', data),

    // Associations
    getAssociations: (id: number, params?: { include_inactive?: boolean }) =>
      apiClient.get<GitHubAssociationsResponse>(`/github-connections/${id}/associations`, { params }),

    createAssociation: (id: number, data: { person_id: number; association_type?: string }) =>
      apiClient.post<GitHubAssociationCreateResponse>(`/github-connections/${id}/associations`, data),

    deleteAssociation: (id: number, personId: number) =>
      apiClient.delete<GitHubAssociationDeleteResponse>(`/github-connections/${id}/associations/${personId}`),
  },

  // Tags (project classification labels)
  tags: {
    list: () => apiClient.get<{ data: Tag[] }>('/tags'),
    create: (data: Partial<Tag>) => apiClient.post<{ data: Tag }>('/tags', data),
    update: (id: number, data: Partial<Tag>) => apiClient.put<{ data: Tag }>(`/tags/${id}`, data),
    delete: (id: number) => apiClient.delete<{ message: string }>(`/tags/${id}`),
  },

  // Estimations (Step 1: LOC-based estimation records + deadline check)
  estimations: {
    listByProject: (projectId: string) =>
      apiClient.get<{ data: ProjectEstimation[] }>(`/estimations/project/${projectId}`),
    create: (projectId: string, data: Partial<ProjectEstimation>) =>
      apiClient.post<{ data: ProjectEstimation }>(`/estimations/project/${projectId}`, data),
    backfill: (id: number, data: Partial<ProjectEstimation>) =>
      apiClient.post<{ data: ProjectEstimation; deviation: EstimationDeviation }>(`/estimations/${id}/backfill`, data),
    check: (id: number, body: { deadline?: string; start?: string } = {}) =>
      apiClient.post<{ data: EstimationCheckResponse }>(`/estimations/${id}/check`, body),
  },

  // Design estimations (设计粗估: rough design person-months, design-side check)
  designEstimations: {
    listByProject: (projectId: string) =>
      apiClient.get<{ data: any[] }>(`/design-estimations/project/${projectId}`),
    create: (projectId: string, data: { estimated_design_pm: number; deviation_low_pct?: number; deviation_high_pct?: number; notes?: string | null }) =>
      apiClient.post<{ data: any }>(`/design-estimations/project/${projectId}`, data),
    backfill: (id: number, data: { actual_design_pm: number | null }) =>
      apiClient.post<{ data: any; deviation: { design_pm: number | null } }>(`/design-estimations/${id}/backfill`, data),
    check: (id: number, body: { deadline?: string; start?: string } = {}) =>
      apiClient.post<{ data: EstimationCheckResponse }>(`/design-estimations/${id}/check`, body),
  },

  // Pool demands (池占位: role-side FTE demand without named persons)
  actualInvestments: {
    list: (projectId: string) => apiClient.get<{ data: any[] }>(`/actual-investments/project/${projectId}`),
    snapshot: (projectId: string, month: string) =>
      apiClient.post<{ data: any }>(`/actual-investments/project/${projectId}/snapshot`, { month }),
    setManual: (projectId: string, month: string, fte: number) =>
      apiClient.put<{ data: any }>(`/actual-investments/project/${projectId}`, { month, fte }),
    remove: (projectId: string, month: string) =>
      apiClient.delete<{ data: any }>(`/actual-investments/project/${projectId}/${month}`)
  },
  poolDemands: {
    listByProject: (projectId: string) =>
      apiClient.get<{ data: any[] }>(`/pool-demands/project/${projectId}`),
    create: (projectId: string, data: { role_id: string; headcount: number; start_date?: string | null; end_date?: string | null; notes?: string | null }) =>
      apiClient.post<{ data: any }>(`/pool-demands/project/${projectId}`, data),
    update: (id: string, data: Partial<{ role_id: string; headcount: number; start_date: string | null; end_date: string | null; status: string; notes: string | null }>) =>
      apiClient.patch<{ data: any }>(`/pool-demands/${id}`, data),
    delete: (id: string) =>
      apiClient.delete<{ data: { id: string } }>(`/pool-demands/${id}`),
  },

  // 迭代域(BOARD_REDESIGN_2026-09-23 §9): 执行窗口的唯一日期真相
  iterations: {
    list: () => apiClient.get<{ data: any[] }>('/iterations'),
    create: (data: { name: string; start_date: string; end_date: string }) =>
      apiClient.post<{ data: any }>('/iterations', data),
    update: (id: string, data: Partial<{ name: string; start_date: string; end_date: string }>) =>
      apiClient.put<{ data: any }>(`/iterations/${id}`, data),
    delete: (id: string) => apiClient.delete<{ success: true }>(`/iterations/${id}`),
  },

  // Lifecycle (8-state machine: 待RAT/NOK/设计中/待排序/已排序/已启动/已交付/裁决取消)
  lifecycle: {
    get: (projectId: string) =>
      apiClient.get<{ data: any }>(`/projects/${projectId}/lifecycle`),
    transition: (projectId: string, data: {
      to: string;
      external_number?: string | null;
      iteration_label?: string | null;
      note?: string | null;
      dev_assignments_action?: 'pause' | 'release' | 'keep';
      pool?: { role_id: string; headcount: number; start_date?: string | null; end_date?: string | null };
    }) =>
      apiClient.post<{ data: { project: any; event: any } }>(`/projects/${projectId}/lifecycle/transition`, data),
    updateFields: (projectId: string, data: { external_number?: string | null; iteration_label?: string | null }) =>
      apiClient.patch<{ data: any }>(`/projects/${projectId}/lifecycle`, data),
  },
};