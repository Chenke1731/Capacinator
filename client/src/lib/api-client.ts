import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { logger } from '../services/logger';
import { translateServerMessage, translateAxiosMessage } from './i18n-error';
import type {
  Component,
  Location,
  ProjectType,
  Project,
  Person,
  Role,
  ProjectAssignment,
  PersonAvailabilityOverride,
  ProjectPhase,
  ProjectPhaseTimeline,
  Scenario,
  PaginationParams,
  PaginatedResponse,
  // API Response types(2026-10-13 批清: 导入名对齐 types/api-responses.ts 实际导出——
  // 37 个名字与真名不一致(复数/别名漂移),坏名全库零外部使用,统一改指真名)
  ProjectDemandsResponse,
  PhaseValidationResponse,
  TemplateComplianceResponse,
  ProjectHealthResponse,
  PersonRoleResponse,
  PersonDetailResponse,
  UtilizationResponse,
  AvailabilityResponse,
  RolePlannerResponse,
  CapacityGapsResponse,
  AssignmentConflictsResponse,
  AssignmentSuggestionsResponse,
  AssignmentTimelineResponse,
  ResourceTemplateListResponse,
  ResourceTemplateResponse,
  ResourceTemplateSummaryResponse,
  AvailabilityCalendarResponse,
  AvailabilityForecastResponse,
  DemandSummaryResponse,
  DemandOverrideResponse,
  DemandForecastResponse,
  DemandGapsResponse,
  DashboardReportResponse,
  CapacityReportResponse,
  DemandReportResponse,
  UtilizationReportResponse,
  GapsReportResponse,
  ProjectsReportResponse,
  TimelineReportResponse,
  ImportResultResponse,
  ImportValidationResponse,
  ImportSettingsResponse,
  ImportHistoryResponse,
  ImportAnalysisResponse,
  ProjectTypeHierarchyResponse,
  ProjectPhaseResponse,
  PhaseCascadeResponse,
  ProjectAllocationsResponse,
  ProjectEstimation,
  EstimationCheckResponse,
  EstimationDeviation,
  Tag,
  ScenarioAssignmentsResponse,
  ScenarioCompareResponse,
  AuditHistoryResponse,
  AuditSearchResponse,
  AuditStatsResponse,
  SystemSettingsResponse,
  SystemPermissionsResponse,
  UserRolesResponse,
  RolePermissionsResponse,
  UsersListResponse,
  UserPermissionsResponse,
  NotificationPreferencesResponse,
  EmailTemplatesResponse,
  NotificationHistoryResponse,
  EmailConfigResponse,
  NotificationStatsResponse,
  HealthCheckResponse,
  SyncStatusResponse,
  SyncPullResponse,
  SyncPushResponse,
  SyncConflictsResponse,
  SyncConflictResolveResponse,
  SyncHistoryResponse,
  BranchListResponse,
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
  AuditRecentResponse,
  TokenPayload,
} from '../types';

// Import/Export options
/** 报表过滤参数(ReportingController 实际读取的 query 键;驼峰按服务端原样) */
interface ReportQueryParams {
  start_date?: string;
  end_date?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  priority?: string;
  projectType?: string;
  location?: string;
}
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
    /** Whole board in one request — slim projection for the virtualized demand table (P7). */
    boardFeed: (params?: { lifecycle_state?: string }) =>
      apiClient.get<{ data: Project[] }>('/projects/board-feed', { params }),
    get: (id: string) => apiClient.get<{ data: Project }>(`/projects/${id}`),
    create: (data: Partial<Project>) => apiClient.post<{ data: Project }>('/projects', data),
    update: (id: string, data: Partial<Project>) => apiClient.put<{ data: Project }>(`/projects/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/projects/${id}`),
    /** 需求台批量操作 (2026-10-11): 删除展开后代闭包(叶子先删,单事务);更新走 patch 白名单+标签合并。 */
    batchDelete: (ids: string[]) =>
      apiClient.post<{ data: { deleted: number; items: Array<{ id: string; name: string }> } }>('/projects/batch-delete', { ids }),
    batchUpdate: (ids: string[], patch: Record<string, unknown>) =>
      apiClient.post<{ data: { updated: number; skipped: number; items: Array<{ id: string; name: string }> } }>('/projects/batch-update', { ids, patch }),
    getDemands: (id: string) => apiClient.get<ProjectDemandsResponse>(`/projects/${id}/demands`),
    // Phase management endpoints
    validatePhaseUpdates: (id: string, data: Record<string, unknown>) => apiClient.post<PhaseValidationResponse>(`/projects/${id}/phases/validate-updates`, data),
    validateCustomPhase: (id: string, data: Record<string, unknown>) => apiClient.post<PhaseValidationResponse>(`/projects/${id}/phases/validate-custom`, data),
    getTemplateCompliance: (id: string) => apiClient.get<TemplateComplianceResponse>(`/projects/${id}/template-compliance`),
    addCustomPhase: (id: string, data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>(`/projects/${id}/phases/custom`, data),
    updateProjectPhase: (id: string, phaseTimelineId: string, data: Record<string, unknown>) => apiClient.put<ProjectPhaseResponse>(`/projects/${id}/phases/${phaseTimelineId}`, data),
    deleteProjectPhase: (id: string, phaseTimelineId: string) => apiClient.delete<{ message: string }>(`/projects/${id}/phases/${phaseTimelineId}`),
    getHealth: () => apiClient.get<ProjectHealthResponse>('/projects/dashboard/health'),
  },

  // People
  people: {
    // is_active 过滤(2026-10-13 停用机制): 'true'=只取在册(分配/负责人
    // 选择器口径),'false'=只取停用;缺省=全部
    list: (params?: PaginationParams & { is_active?: 'true' | 'false' }) => apiClient.get<PaginatedResponse<Person>>('/people', { params }),
    get: (id: string) => apiClient.get<PersonDetailResponse>(`/people/${id}`),
    create: (data: Partial<Person>) => apiClient.post<Person>('/people', data), /* getById 裸 res.json 直出 */
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
    // IP-07c: data 可附 expected_version 乐观锁令牌,冲突 409 载荷含当前值
    update: (id: string, data: Partial<ProjectAssignment> & { expected_version?: number }) =>
      apiClient.put<{ data: ProjectAssignment }>(`/assignments/${id}`, data),
    // IP-07e: data 可附 expected_version 乐观锁令牌(删除他人刚改的行=丢失更新)
    delete: (id: string, data?: { expected_version?: number }) =>
      apiClient.delete<{ message: string }>(`/assignments/${id}`, data ? { data } : undefined),
    bulkCreate: (data: Record<string, unknown>) => apiClient.post<{ data: ProjectAssignment[] }>('/assignments/bulk', data),
    getConflicts: (personId: string, params?: PaginationParams) => apiClient.get<AssignmentConflictsResponse>(`/assignments/conflicts/${personId}`, { params }),
    getSuggestions: (params: Record<string, unknown>) => apiClient.get<AssignmentSuggestionsResponse>('/assignments/suggestions', { params }),
    getTimeline: (personId: string, params?: PaginationParams) => apiClient.get<AssignmentTimelineResponse>(`/assignments/timeline/${personId}`, { params }),
  },

  // Resource Templates
  resourceTemplates: {
    list: (params?: PaginationParams) => apiClient.get<ResourceTemplateListResponse>('/resource-templates', { params }),
    create: (data: Record<string, unknown>) => apiClient.post<ResourceTemplateResponse>('/resource-templates', data),
    bulkUpdate: (data: Record<string, unknown>) => apiClient.post<ResourceTemplateResponse>('/resource-templates/bulk', data),
    copy: (data: Record<string, unknown>) => apiClient.post<ResourceTemplateResponse>('/resource-templates/copy', data),
    getTemplates: () => apiClient.get<ResourceTemplateListResponse>('/resource-templates/templates'),
    getSummary: () => apiClient.get<ResourceTemplateSummaryResponse>('/resource-templates/summary'),
    getByProjectType: (projectTypeId: string) => apiClient.get<ResourceTemplateListResponse>(`/resource-templates/project-type/${projectTypeId}`),
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
    calculateScenario: (data: Record<string, unknown>) => apiClient.post<DemandSummaryResponse>('/demands/scenario', data),
  },

  // Reporting
  reporting: {
    // 报表过滤参数(2026-10-13 批清: 原泛型误用 PaginationParams,实际服务端读
    // start_date/end_date/status/priority/projectType/location;sendSuccess 信封 {data:X})
    getDashboard: (params?: { start_date?: string; end_date?: string }) => apiClient.get<{ data: DashboardReportResponse }>('/reporting/dashboard', { params }),
    getCapacity: (params?: ReportQueryParams) => apiClient.get<{ data: CapacityReportResponse }>('/reporting/capacity', { params }),
    getDemand: (params?: ReportQueryParams) => apiClient.get<{ data: DemandReportResponse }>('/reporting/demand', { params }),
    getUtilization: (params?: ReportQueryParams) => apiClient.get<{ data: UtilizationReportResponse }>('/reporting/utilization', { params }),
    getGaps: (params?: ReportQueryParams) => apiClient.get<{ data: GapsReportResponse }>('/reporting/gaps', { params }),
    getProjects: (params?: ReportQueryParams) => apiClient.get<{ data: ProjectsReportResponse }>('/reporting/projects', { params }),
    getTimeline: (params?: ReportQueryParams) => apiClient.get<{ data: TimelineReportResponse }>('/reporting/timeline', { params }),
    getByComponent: () => apiClient.get('/reporting/by-component'),
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
      return apiClient.post<ImportResultResponse>('/import/excel', formData, {
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
    getSettings: () => apiClient.get<{ data: ImportSettingsResponse }>('/import/settings'),
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
  components: {
    list: () => apiClient.get<PaginatedResponse<Component>>('/components'),
    get: (id: string) => apiClient.get<{ data: Component }>(`/components/${id}`),
    create: (data: Partial<Component>) => apiClient.post<{ data: Component }>('/components', data),
    update: (id: string, data: Partial<Component>) => apiClient.put<{ data: Component }>(`/components/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/components/${id}`),
  },
  locations: {
    list: () => apiClient.get<PaginatedResponse<Location>>('/locations'),
    get: (id: string) => apiClient.get<{ data: Location }>(`/locations/${id}`),
    create: (data: Partial<Location>) => apiClient.post<{ data: Location }>('/locations', data),
    update: (id: string, data: Partial<Location>) => apiClient.put<{ data: Location }>(`/locations/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/locations/${id}`),
  },

  projectTypes: {
    // 服务端 /project-types 默认 limit=50 无条件分页——下拉场景须显式带
    // limit,否则超过 50 个类型静默截断(2026-10-13 全库审计)
    list: (params?: PaginationParams) => apiClient.get<PaginatedResponse<ProjectType>>('/project-types', { params }),
    // get 走裸 res.json(getById 无 sendSuccess 信封,controller :129);
    // create/update 有 {success,data} 信封
    get: (id: string) => apiClient.get<ProjectType & { sub_types?: unknown[]; phases?: unknown[] }>(`/project-types/${id}`),
    create: (data: Partial<ProjectType>) => apiClient.post<{ data: ProjectType }>('/project-types', data),
    update: (id: string, data: Partial<ProjectType>) => apiClient.put<{ data: ProjectType }>(`/project-types/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/project-types/${id}`),
    // Hierarchy methods
    getHierarchy: () => apiClient.get<ProjectTypeHierarchyResponse>('/project-type-hierarchy/hierarchy'),
    getPhases: (id: string) => apiClient.get<{ success: boolean; data: Array<{ id: string; name: string; sequence_order: number; order_index?: number }> }>(`/project-type-hierarchy/${id}/phases`),
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
    // project_id/phase_id 过滤参数服务端支持(getAll 按 query 过滤),类型
    // 此前只留了分页位,传过滤参数会 TS2353(2026-10-13 审计修);
    // 泛型改 ProjectPhaseTimeline(行带 join 注入的 phase_name/order,
    // ProjectPhase 是主表窄形状)
    list: (params?: PaginationParams & { project_id?: string; phase_id?: string }) => apiClient.get<PaginatedResponse<ProjectPhaseTimeline>>('/project-phases', { params }),
    get: (id: string) => apiClient.get<ProjectPhaseResponse>(`/project-phases/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>('/project-phases', data),
    update: (id: string, data: Record<string, unknown>) => apiClient.put<ProjectPhaseResponse>(`/project-phases/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/project-phases/${id}`),
    bulkUpdate: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse[]>('/project-phases/bulk', data),
    duplicatePhase: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>('/project-phases/duplicate', data),
    createCustomPhase: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse>('/project-phases/create-custom', data),
    applyBulkCorrections: (data: Record<string, unknown>) => apiClient.post<ProjectPhaseResponse[]>('/project-phases/bulk-corrections', data),
  },

  // Project Phase Dependencies
  projectPhaseDependencies: {
    list: (params?: PaginationParams & { project_id?: string }) => apiClient.get<PaginatedResponse<Record<string, unknown>>>('/project-phase-dependencies', { params }),
    get: (id: string) => apiClient.get<Record<string, unknown>>(`/project-phase-dependencies/${id}`),
    create: (data: Record<string, unknown>) => apiClient.post<Record<string, unknown>>('/project-phase-dependencies', data),
    update: (id: string, data: Record<string, unknown>) => apiClient.put<Record<string, unknown>>(`/project-phase-dependencies/${id}`, data),
    delete: (id: string) => apiClient.delete<{ message: string }>(`/project-phase-dependencies/${id}`),
    calculateCascade: (data: Record<string, unknown>) => apiClient.post<PhaseCascadeResponse>('/project-phase-dependencies/calculate-cascade', data),
    applyCascade: (data: Record<string, unknown>) => apiClient.post<PhaseCascadeResponse>('/project-phase-dependencies/apply-cascade', data),
  },

  projectAllocations: {
    get: (projectId: string) => apiClient.get<ProjectAllocationsResponse>(`/project-allocations/${projectId}`),
    initialize: (projectId: string) => apiClient.post<ProjectAllocationsResponse>(`/project-allocations/${projectId}/initialize`),
    override: (projectId: string, data: Record<string, unknown>) => apiClient.post<ProjectAllocationsResponse>(`/project-allocations/${projectId}/override`, data),
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
    compare: (id: string, compareToId: string) => apiClient.get<ScenarioCompareResponse>(`/scenarios/${id}/compare?compare_to=${compareToId}`),
    merge: (id: string, data?: Record<string, unknown>) => apiClient.post<{ data: Scenario }>(`/scenarios/${id}/merge`, data || {}),
    // 2026-10-17 返工: manual 闭环——此前全库无 resolution 写路径
    getMergeConflicts: (id: string) => apiClient.get<{ data: unknown[] }>(`/scenarios/${id}/merge-conflicts`),
    resolveMergeConflict: (id: string, conflictId: string, resolution: 'use_source' | 'use_target') =>
      apiClient.patch<{ data: { conflictId: string; resolution: string } }>(`/scenarios/${id}/merge-conflicts/${conflictId}`, { resolution }),
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

  // Settings(服务端 {success,data} 信封,2026-10-13 批清: 泛型补包装层)
  settings: {
    getSystemSettings: () => apiClient.get<{ data: SystemSettingsResponse }>('/settings/system'),
    saveSystemSettings: (data: Record<string, unknown>) => apiClient.post<{ data: SystemSettingsResponse }>('/settings/system', data),
    updateSystemSettings: (data: Record<string, unknown>) => apiClient.put<{ data: SystemSettingsResponse }>('/settings/system', data),
    getImportSettings: () => apiClient.get<{ data: ImportSettingsResponse }>('/settings/import'),
    saveImportSettings: (data: Record<string, unknown>) => apiClient.post<{ data: ImportSettingsResponse }>('/settings/import', data),
    updateImportSettings: (data: Record<string, unknown>) => apiClient.put<{ data: ImportSettingsResponse }>('/settings/import', data),
  },

  // User Permissions(同上信封)
  userPermissions: {
    getSystemPermissions: () => apiClient.get<{ data: SystemPermissionsResponse }>('/user-permissions/permissions'),
    getUserRoles: () => apiClient.get<{ data: UserRolesResponse }>('/user-permissions/roles'),
    getRolePermissions: (roleId: string) => apiClient.get<{ data: RolePermissionsResponse }>(`/user-permissions/roles/${roleId}/permissions`),
    updateRolePermissions: (roleId: string, permissionIds: string[]) => apiClient.put<{ data: RolePermissionsResponse }>(`/user-permissions/roles/${roleId}/permissions`, { permissionIds }),
    getUsersList: () => apiClient.get<{ data: UsersListResponse }>('/user-permissions/users'),
    getUserPermissions: (userId: string) => apiClient.get<{ data: UserPermissionsResponse }>(`/user-permissions/users/${userId}/permissions`),
    updateUserRole: (userId: string, roleId: string) => apiClient.put<{ data: UserRolesResponse }>(`/user-permissions/users/${userId}/role`, { roleId }),
    updateUserPermission: (userId: string, permissionId: string, granted: boolean, reason?: string) =>
      apiClient.put<UserPermissionsResponse>(`/user-permissions/users/${userId}/permissions`, { permissionId, granted, reason }),
    removeUserPermissionOverride: (userId: string, permissionId: string) =>
      apiClient.delete<{ message: string }>(`/user-permissions/users/${userId}/permissions/${permissionId}`),
    checkUserPermission: (userId: string, permissionName: string) =>
      apiClient.get<Record<string, unknown>>(`/user-permissions/users/${userId}/check/${permissionName}`),
  },

  // Notifications
  notifications: {
    sendNotification: (data: Record<string, unknown>) => apiClient.post<Record<string, unknown>>('/notifications/send', data),
    getUserNotificationPreferences: (userId: string) => apiClient.get<NotificationPreferencesResponse>(`/notifications/preferences/${userId}`),
    updateUserNotificationPreferences: (userId: string, preferences: Record<string, unknown>) => apiClient.put<NotificationPreferencesResponse>(`/notifications/preferences/${userId}`, { preferences }),
    getEmailTemplates: () => apiClient.get<EmailTemplatesResponse>('/notifications/templates'),
    getNotificationHistory: (userId?: string, params?: PaginationParams) => apiClient.get<NotificationHistoryResponse>(`/notifications/history/${userId || ''}`, { params }),
    sendTestEmail: (email: string) => apiClient.post<{ message: string }>('/notifications/test', { email }),
    checkEmailConfiguration: () => apiClient.get<EmailConfigResponse>('/notifications/config'),
    getNotificationStats: (userId?: string, params?: PaginationParams) => apiClient.get<NotificationStatsResponse>(`/notifications/stats/${userId || ''}`, { params }),
  },

  // Health check
  health: () => apiClient.get<HealthCheckResponse>('/health'),

  // Authentication
  auth: {
    /* 真身: login={success,user,accessToken,refreshToken}; me={success,user}; verify={success,valid,user(TokenPayload)};
       logout={success,message}; refresh={success,accessToken,refreshToken} — 五端点形状由 routes/__tests__/auth-contract.test.ts 钉死 */
    login: (personId: string) => apiClient.post<{ success: boolean; user: Person; accessToken: string; refreshToken: string }>('/auth/login', { personId }),
    logout: () => apiClient.post<{ success: boolean; message: string }>('/auth/logout'),
    refresh: (refreshToken: string) => apiClient.post<{ success: boolean; accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }),
    me: () => apiClient.get<{ success: boolean; user: Person }>('/auth/me'),
    verify: () => apiClient.get<{ success: boolean; valid: boolean; user: TokenPayload }>('/auth/verify'),
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
    listBranches: () => apiClient.get<BranchListResponse>('/sync/branches'),
    createBranch: (data: { name: string; description: string }) => apiClient.post<BranchCreateResponse>('/sync/branches', data),
    checkoutBranch: (branchName: string) => apiClient.post<BranchCheckoutResponse>(`/sync/branches/${branchName}/checkout`),
    mergeBranch: (branchName: string) => apiClient.post<BranchMergeResponse>(`/sync/branches/${branchName}/merge`),
    compareBranches: (base: string, target: string) => apiClient.get<BranchCompareResponse>(`/sync/compare?base=${base}&target=${target}`),
  },

  // GitHub Connections (Feature: 005-github-auth-user-link)
  githubConnections: {
    // List connections
    list: (params?: { include_inactive?: string; include_associations?: string }) =>
      apiClient.get<GitHubConnectionsListResponse>('/github-connections', { params }),

    // Get single connection
    get: (id: number, params?: { include_associations?: string }) =>
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
    getAssociations: (id: number, params?: { include_inactive?: string }) =>
      apiClient.get<GitHubAssociationsResponse>(`/github-connections/${id}/associations`, { params }),

    createAssociation: (id: number, data: { person_id: string; association_type?: string }) =>
      apiClient.post<GitHubAssociationCreateResponse>(`/github-connections/${id}/associations`, data),

    deleteAssociation: (id: number, personId: string) =>
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
    backfill: (id: number, data: { actual_design_pm?: number }) =>
      apiClient.post<{ data: any; deviation: { design_pm: number | null } }>(`/design-estimations/${id}/backfill`, data),
    check: (id: number, body: { deadline?: string; start?: string } = {}) =>
      apiClient.post<{ data: EstimationCheckResponse }>(`/design-estimations/${id}/check`, body),
  },

  // Pool demands (池占位: role-side FTE demand without named persons)
  actualInvestments: {
    list: (projectId: string) => apiClient.get<{ data: any[] }>(`/actual-investments/project/${projectId}`),
    snapshot: (projectId: string, month: string) =>
      apiClient.post<{ data: any }>(`/actual-investments/project/${projectId}/snapshot`, { month }),
    // expectedVersion: IP-07c 乐观锁令牌(可选)——带令牌冲突返回 409+当前值
    setManual: (projectId: string, month: string, fte: number, expectedVersion?: number) =>
      apiClient.put<{ data: any }>(`/actual-investments/project/${projectId}`, { month, fte, expected_version: expectedVersion }),
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