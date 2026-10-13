/**
 * API Response Types
 *
 * This file contains TypeScript interfaces for all API responses
 * that were previously typed as `any` in api-client.ts.
 *
 * Organized by domain/feature area to match the API client structure.
 */

// ============= Common Types =============

export interface TimelineEntry {
  period: string;
  month?: string;
  total_hours?: number;
  total_fte?: number;
  capacity?: number;
}

export interface FteMetrics {
  hours: number;
  fte: number;
}

// ============= Dashboard & Health Responses =============

export interface ProjectHealthItem {
  project_id: string;
  project_name: string;
  health_status: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  completion_percentage?: number;
}

export type ProjectHealthResponse = ProjectHealthItem[];

export interface UtilizationItem {
  person_id: string;
  person_name: string;
  total_allocation_percentage: number;
  /* person_utilization_view 真身(2026-10-13 补): current_availability_percentage
     是视图真列;total_allocation 是 mock 时代别名 */
  current_availability_percentage?: number;
  total_allocation?: number;
  utilization_status: string;
  total_allocated_hours?: number;
  available_hours?: number;
  project_count?: number;
}

export type UtilizationResponse = UtilizationItem[];

export interface AvailabilityItem {
  person_id: string;
  person_name: string;
  availability_percentage: number;
  default_availability_percentage?: number;
  effective_availability?: number;
}

export type AvailabilityResponse = AvailabilityItem[];

export interface CapacityGapItem {
  role_id: string;
  role_name: string;
  total_capacity_fte: number;
  total_demand_fte: number;
  gap_fte: number;
  people_count: number;
  status?: 'GAP' | 'TIGHT' | 'OK';
}

export type CapacityGapsResponse = CapacityGapItem[];

// ============= Project Demands Responses =============

export interface ProjectDemandItem {
  role_id: string;
  role_name: string;
  demand_hours: number;
  demand_fte?: number;
  start_date?: string;
  end_date?: string;
  phase_id?: string;
  phase_name?: string;
}

export interface ProjectDemandsPhase {
  phase_id: string;
  phase_name: string;
  phase_order: number;
  start_date: string;
  end_date: string;
  demands: ProjectDemandItem[];
  total_hours: number;
  total_fte: number;
}

export interface ProjectDemandsResponse {
  project: {
    id: string;
    name: string;
    project_type_id?: string;
    project_type_name?: string;
  };
  phases: ProjectDemandsPhase[];
  demands: ProjectDemandItem[];
  summary: {
    total_phases: number;
    total_demands: number;
    total_hours: number;
    total_fte: number;
    override_count: number;
    roles_needed: number;
  };
}

export interface DemandSummaryByRole {
  role_id: string;
  role_name: string;
  total_hours: number;
  total_fte: number;
  project_count: number;
}

export interface DemandSummaryByProjectType {
  project_type_id: string;
  project_type_name: string;
  total_hours: number;
  total_fte: number;
  project_count: number;
}

export interface DemandSummaryTimelineEntry {
  month: string;
  total_hours: number;
  total_fte: number;
  role_breakdown: Record<string, FteMetrics>;
}

export interface DemandSummaryResponse {
  filters: {
    start_date?: string;
    end_date?: string;
    location_id?: string;
    project_type_id?: string;
  };
  summary: {
    total_demands: number;
    total_projects: number;
    total_hours: number;
    total_fte: number;
  };
  by_role: DemandSummaryByRole[];
  by_project_type: DemandSummaryByProjectType[];
  timeline: DemandSummaryTimelineEntry[];
}

export interface DemandForecastEntry {
  month: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  total_fte: number;
  by_role: Record<string, FteMetrics>;
  project_count: number;
}

export interface DemandForecastResponse {
  forecast: DemandForecastEntry[];
  summary: {
    months: number;
    start_date: string;
    end_date: string;
    total_projects: number;
    peak_month: {
      month: string;
      total_fte: number;
    };
    average_monthly_fte: number;
  };
}

export interface DemandGapItem {
  role_id: string;
  role_name: string;
  total_demand_fte: number;
  total_capacity_fte: number;
  gap_fte: number;
}

export interface DemandGapsResponse {
  gaps: DemandGapItem[];
  summary: {
    total_gaps: number;
    total_shortage_fte: number;
    critical_gaps: number;
  };
}

export interface DemandOverrideResponse {
  id: string;
  project_id: string;
  role_id: string;
  override_hours: number;
  created_at: string;
}

export interface ScenarioDemandResponse {
  scenario_id: string;
  demands: ProjectDemandItem[];
  summary: {
    total_demands: number;
    total_hours: number;
  };
}

// ============= Reporting Responses =============

export interface DashboardReportResponse {
  summary: {
    projects: number;
    people: number;
    roles: number;
  };
  projectHealth: Record<string, number>;
  capacityGaps: {
    GAP: number;
    TIGHT: number;
    OK: number;
  };
  utilization: Record<string, number>;
  availability: {
    AVAILABLE: number;
    ASSIGNED: number;
  };
  /* 2026-10-13 实测真身(原类型缺这两个键): 生命周期机制产出 */
  design_watch: Array<{
    project_id: string;
    project_name?: string;
    design_deadline?: string | null;
    days_late?: number;
    days_remaining?: number;
    overdue?: boolean;
    [k: string]: unknown;
  }>;
  lifecycle_summary?: Record<string, number>;
}

export type AllocationStatus =
  | 'OVER_ALLOCATED'
  | 'FULLY_ALLOCATED'
  | 'PARTIALLY_ALLOCATED'
  | 'UNDER_ALLOCATED'
  | 'AVAILABLE'
  | 'UNAVAILABLE';

export interface PersonUtilizationData {
  person_id: string;
  person_name: string;
  person_email?: string;
  total_allocation_percentage: number;
  total_allocated_hours: number;
  available_hours: number;
  project_count: number;
  project_names?: string;
  allocation_status: AllocationStatus;
  allocation_warning?: string | null;
  display_allocation_percentage?: number;
}

export interface CapacityReportItem {
  role_id: string;
  role_name: string;
  total_capacity_hours: number;
  total_demand_hours: number;
  total_capacity_fte: number;
  total_demand_fte: number;
  people_count: number;
  status: 'GAP' | 'TIGHT' | 'OK';
}

export interface CapacityByRoleItem {
  id: string;
  role: string;
  capacity: number;
  utilized: number;
  available: number;
  people_count: number;
  status: string;
}

export interface CapacityReportResponse {
  capacityGaps: CapacityReportItem[];
  byRole: CapacityByRoleItem[];
  personUtilization: PersonUtilizationData[];
  utilizationData: PersonUtilizationData[];
  projectDemands: ProjectDemandItem[];
  timeline: TimelineEntry[];
  summary: {
    totalGaps: number;
    totalTight: number;
    overAllocated: number;
    underAllocated: number;
  };
}

export interface UtilizationReportResponse {
  utilizationData: PersonUtilizationData[];
  overutilized: PersonUtilizationData[];
  underutilized: PersonUtilizationData[];
  summary: {
    peopleOverutilized: number;
    peopleUnderutilized: number;
    averageUtilization: number;
    peakUtilization: number;
  };
  healthSummary: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

export interface DemandReportResponse {
  demandData: ProjectDemandItem[];
  byProject: Array<{
    id: string;
    name: string;
    demand: number;
  }>;
  by_role: Array<{
    role_name: string;
    total_hours: number;
  }>;
  by_project_type: Array<{
    project_type_name: string;
    total_hours: number;
  }>;
  timeline: Array<{
    month: string;
    total_hours: number;
  }>;
  summary: {
    total_hours: number;
    total_projects: number;
    roles_with_demand: number;
  };
}

export interface CriticalProjectGap {
  project_id: string;
  project_name: string;
  gap_type: 'UNASSIGNED' | 'UNDER_COVERED';
  unmet_demands: number;
  total_demand_percentage: number;
  actual_allocation_percentage?: number;
  coverage_ratio?: number;
}

export interface GapsReportResponse {
  capacityGaps: Array<CapacityGapItem & {
    gap_percentage: number;
    demand_vs_capacity: number;
    status: 'GAP' | 'TIGHT' | 'OK';
  }>;
  projectHealth: ProjectHealthItem[];
  criticalRoleGaps: CapacityGapItem[];
  criticalProjectGaps: CriticalProjectGap[];
  summary: {
    totalGapHours: number;
    projectsWithGaps: number;
    rolesWithGaps: number;
    unutilizedHours: number;
  };
}

export interface TimelineReportResponse {
  timeline: TimelineEntry[];
  summary: {
    total_periods: number;
    peak_period: string;
    average_utilization: number;
  };
}

export interface ProjectsReportResponse {
  projects: Array<{
    id: string;
    name: string;
    status: string;
    health_status: string;
    start_date: string;
    end_date: string;
    total_demand_hours: number;
    total_allocated_hours: number;
  }>;
  summary: {
    total_projects: number;
    by_status: Record<string, number>;
    by_health: Record<string, number>;
  };
}

// ============= Project Phase Responses =============

export interface PhaseValidationError {
  field: string;
  message: string;
  phase_id?: string;
}

export interface PhaseValidationResponse {
  valid: boolean;
  errors: PhaseValidationError[];
  warnings?: string[];
}

export interface TemplateComplianceResponse {
  /* PhaseTemplateValidationService.getProjectTemplateCompliance 真身
     (2026-10-13 批清: 原 compliant/missing_phases 形状系杜撰,服务端从未产出) */
  totalPhases: number;
  templatePhases: number;
  customPhases: number;
  mandatoryPhases: number;
  customizedPhases: number;
  compliancePercentage: number;
  violations: string[];
}

export interface ProjectPhaseResponse {
  id: string;
  project_id: string;
  phase_id: string;
  phase_name?: string;
  start_date: string;
  end_date: string;
  status: string;
  sequence_order: number;
  is_custom?: boolean;
}

export interface PhaseCascadeResult {
  affected_phases: Array<{
    phase_id: string;
    phase_name: string;
    old_start_date: string;
    old_end_date: string;
    new_start_date: string;
    new_end_date: string;
  }>;
  affected_assignments: number;
  warnings: string[];
}

export interface PhaseCascadeResponse {
  success: boolean;
  result: PhaseCascadeResult;
  message?: string;
}

// ============= People & Roles Responses =============

export interface PersonRoleResponse {
  id: string;
  person_id: string;
  role_id: string;
  role_name?: string;
  is_primary: boolean;
  proficiency_level?: string;
  created_at: string;
}

export interface RolePlannerResponse {
  id: string;
  role_id: string;
  person_id: string;
  person_name?: string;
  created_at: string;
}

// ============= Resource Templates Responses =============

export interface ResourceTemplateItem {
  id: string;
  project_type_id: string;
  phase_id: string;
  role_id: string;
  role_name?: string;
  phase_name?: string;
  allocation_percentage: number;
  hours_per_week?: number;
}

export interface ResourceTemplateResponse {
  data: ResourceTemplateItem[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface ResourceTemplateSummaryResponse {
  total_templates: number;
  by_project_type: Array<{
    project_type_id: string;
    project_type_name: string;
    template_count: number;
  }>;
  by_role: Array<{
    role_id: string;
    role_name: string;
    template_count: number;
  }>;
}

export interface ResourceTemplateListResponse {
  templates: Array<{
    project_type_id: string;
    project_type_name: string;
    phases: Array<{
      phase_id: string;
      phase_name: string;
      roles: ResourceTemplateItem[];
    }>;
  }>;
}

// ============= Availability Responses =============

export interface AvailabilityCalendarEntry {
  date: string;
  person_id: string;
  person_name: string;
  availability_percentage: number;
  override_reason?: string;
}

export interface AvailabilityCalendarResponse {
  entries: AvailabilityCalendarEntry[];
  summary: {
    total_days: number;
    average_availability: number;
  };
}

export interface AvailabilityForecastResponse {
  forecast: Array<{
    month: string;
    total_available_fte: number;
    by_location: Record<string, number>;
    by_role: Record<string, number>;
  }>;
  summary: {
    months: number;
    peak_availability_month: string;
    average_available_fte: number;
  };
}

// ============= Assignment Responses =============

export interface AssignmentConflict {
  person_id: string;
  person_name: string;
  date: string;
  total_allocation: number;
  assignments: Array<{
    assignment_id: string;
    project_name: string;
    allocation_percentage: number;
  }>;
}

export interface AssignmentConflictsResponse {
  conflicts: AssignmentConflict[];
  summary: {
    total_conflicts: number;
    people_affected: number;
  };
}

export interface AssignmentSuggestion {
  person_id: string;
  person_name: string;
  role_id: string;
  role_name: string;
  availability_percentage: number;
  match_score: number;
  reasons: string[];
}

export interface AssignmentSuggestionsResponse {
  suggestions: AssignmentSuggestion[];
  filters_applied: Record<string, unknown>;
}

export interface AssignmentTimelineEntry {
  assignment_id: string;
  project_id: string;
  project_name: string;
  role_name: string;
  start_date: string;
  end_date: string;
  allocation_percentage: number;
}

export interface AssignmentTimelineResponse {
  timeline: AssignmentTimelineEntry[];
  summary: {
    total_assignments: number;
    date_range: {
      start: string;
      end: string;
    };
  };
}

// ============= Import/Export Responses =============

export interface ImportResultResponse {
  success: boolean;
  message: string;
  imported: {
    projects: number;
    people: number;
    roles: number;
    assignments: number;
    locations?: number;
  };
  errors: Array<{
    row: number;
    sheet: string;
    message: string;
  }>;
  warnings: string[];
}

export interface ImportValidationResponse {
  valid: boolean;
  sheets: Array<{
    name: string;
    rows: number;
    valid_rows: number;
    errors: Array<{
      row: number;
      column: string;
      message: string;
    }>;
  }>;
  summary: {
    total_rows: number;
    valid_rows: number;
    error_rows: number;
  };
}

export interface ImportAnalysisResponse {
  analysis: {
    projects: {
      new: number;
      existing: number;
      duplicates: string[];
    };
    people: {
      new: number;
      existing: number;
      duplicates: string[];
    };
    roles: {
      new: number;
      existing: number;
      missing: string[];
    };
    locations: {
      new: number;
      existing: number;
      missing: string[];
    };
  };
  recommendations: string[];
  estimated_changes: {
    creates: number;
    updates: number;
    skips: number;
  };
}

export interface ImportSettingsResponse {
  /* 同上:camelCase 视图形原样往返(POST body 即此形) */
  clearExistingData: boolean;
  validateDuplicates: boolean;
  autoCreateMissingRoles: boolean;
  autoCreateMissingLocations: boolean;
  defaultProjectPriority: number;
  dateFormat: string;
}

export interface ImportHistoryEntry {
  id: string;
  filename: string;
  imported_at: string;
  imported_by: string;
  status: 'success' | 'partial' | 'failed';
  records_imported: number;
  errors_count: number;
}

export type ImportHistoryResponse = ImportHistoryEntry[];

// ============= Settings Responses =============

export interface SystemSettingsResponse {
  /* SettingsController 真身(2026-10-13 批清): GET=JSON.parse(存库的
     camelCase 视图形),POST 原样往返——snake_case 形状系杜撰 */
  defaultWorkHoursPerWeek: number;
  defaultVacationDaysPerYear: number;
  fiscalYearStartMonth: number;
  allowOverAllocation: boolean;
  maxAllocationPercentage: number;
  requireApprovalForOverrides: boolean;
}

export interface ImportSettingsFullResponse {
  settings: ImportSettingsResponse;
  last_updated: string;
  updated_by: string;
}

// ============= User Permissions Responses =============

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface UserRole {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  permissions: Permission[];
}

export interface SystemPermissionsResponse {
  /* UserPermissionsController 真身: data={permissions, permissionsByCategory} */
  permissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
}

export type UserRolesResponse = UserRole[];

export interface RolePermissionsResponse {
  role: UserRole;
  permissions: Permission[];
}

export interface UserPermissionOverride {
  permission_id: string;
  granted: boolean;
  reason?: string;
  granted_at: string;
  granted_by: string;
}

export interface UserWithPermissions {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permission_overrides: UserPermissionOverride[];
  effective_permissions: Permission[];
}

export type UsersListResponse = UserWithPermissions[]; /* 真身=data 直接是数组 */

export interface UserPermissionsResponse {
  user: UserWithPermissions;
  permissions: Permission[];
  overrides: UserPermissionOverride[];
}

export interface PermissionCheckResponse {
  user_id: string;
  permission: string;
  granted: boolean;
  source: 'role' | 'override' | 'denied';
}

// ============= Notifications Responses =============

export interface NotificationPreference {
  notification_type: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  frequency: 'immediate' | 'daily' | 'weekly';
}

export interface NotificationPreferencesResponse {
  user_id: string;
  preferences: NotificationPreference[];
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_template: string;
  notification_type: string;
  is_active: boolean;
}

export interface EmailTemplatesResponse {
  templates: EmailTemplate[];
}

export interface NotificationHistoryEntry {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  message: string;
  sent_at: string;
  read_at?: string;
  delivery_status: 'sent' | 'delivered' | 'failed';
}

export interface NotificationHistoryResponse {
  notifications: NotificationHistoryEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface NotificationStatsResponse {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_read: number;
  by_type: Record<string, number>;
  delivery_rate: number;
  read_rate: number;
}

export interface EmailConfigResponse {
  configured: boolean;
  smtp_host?: string;
  smtp_port?: number;
  from_address?: string;
  test_status?: 'success' | 'failed' | 'not_tested';
  last_test_at?: string;
}

// ============= Audit Responses =============

export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_by: string;
  changed_by_name?: string;
  changed_at: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  change_summary?: string;
}

export interface AuditHistoryResponse {
  entries: AuditLogEntry[];
  record: {
    table_name: string;
    record_id: string;
  };
}

export interface AuditSearchResponse {
  entries: AuditLogEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
  filters_applied: Record<string, unknown>;
}

export interface AuditStatsResponse {
  total_entries: number;
  entries_last_24h: number;
  entries_last_7d: number;
  entries_last_30d: number;
  by_action: Record<string, number>;
  by_table: Record<string, number>;
  top_users: Array<{
    user_id: string;
    user_name: string;
    change_count: number;
  }>;
}

// ============= Git Sync Responses =============

/** GitSync 域(2026-10-13 批清): 形状按 GitSyncController 实际返回核对——
 *  原蛇形类型系小说(服务端从来是驼峰+{success,data}信封),消费者按驼峰
 *  写;统一以服务端为准,消费者解包缺口一并修 */
export interface SyncStatusData {
  status: 'not-initialized' | 'pending' | 'behind' | 'synced';
  pendingChangesCount: number;
  lastSyncAt: string | null;
  conflictsCount: number;
  repositoryUrl: string | null;
}

export interface SyncStatusResponse {
  success: boolean;
  data: SyncStatusData;
}

export interface SyncPullData {
  filesChanged?: number;
  conflictsDetected: number;
  conflicts: SyncConflict[];
  imported?: number;
  warnings?: string[];
}

export interface SyncPullResponse {
  success: boolean;
  data: SyncPullData;
}

export interface SyncPushResponse {
  success: boolean;
  commit_hash?: string;
  changes_pushed: number;
  message: string;
}

// SyncConflict 统一收敛到 shared/git-entities 的 Conflict 真身(2026-10-13
// 批清): 两份同构类型并存曾让 setConflicts 互不兼容;type 别名建立本地
// 绑定(re-export 不绑定,预算守卫的 cannot-find-name 雷会拦)
import type { Conflict } from '../../../shared/types/git-entities';
export type SyncConflict = Conflict;

export interface SyncConflictsResponse {
  success: boolean;
  data: SyncConflict[];
}

export interface SyncConflictResolveResponse {
  success: boolean;
  conflict_id: string;
  resolution: string;
  message: string;
}

export interface SyncHistoryEntry {
  id: string;
  action: 'push' | 'pull' | 'merge' | 'resolve';
  performed_by: string;
  performed_at: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}

export interface SyncHistoryResponse {
  history: SyncHistoryEntry[];
  pagination?: {
    total: number;
    limit: number;
  };
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  last_commit?: string;
  last_commit_at?: string;
  description?: string;
}

export interface BranchListResponse {
  branches: BranchInfo[];
  current_branch: string;
}

export interface BranchCreateResponse {
  success: boolean;
  branch: BranchInfo;
  message: string;
}

export interface BranchCheckoutResponse {
  success: boolean;
  branch: string;
  message: string;
}

export interface BranchMergeResponse {
  success: boolean;
  merged_branch: string;
  target_branch: string;
  conflicts?: SyncConflict[];
  message: string;
}

export interface BranchCompareResponse {
  base_branch: string;
  target_branch: string;
  ahead: number;
  behind: number;
  changes: Array<{
    entity_type: string;
    entity_id: string;
    change_type: 'added' | 'modified' | 'deleted';
  }>;
}

// ============= Scenario Responses =============

export interface ScenarioAssignmentsResponse {
  scenario_id: string;
  assignments: Array<{
    id: string;
    person_id: string;
    person_name: string;
    project_id: string;
    project_name: string;
    role_id: string;
    role_name: string;
    allocation_percentage: number;
    start_date: string;
    end_date: string;
  }>;
}

export interface ScenarioCompareResponse {
  base_scenario_id: string;
  compare_scenario_id: string;
  differences: {
    assignments: {
      added: string[];
      removed: string[];
      modified: Array<{
        assignment_id: string;
        field: string;
        base_value: unknown;
        compare_value: unknown;
      }>;
    };
    summary: {
      total_differences: number;
      assignments_added: number;
      assignments_removed: number;
      assignments_modified: number;
    };
  };
}

// ============= Recommendations Responses =============

/**
 * 规格先行声明(2026-10-13 批清): 服务端 /recommendations 目前是占位桩
 * (RecommendationsController:16 返回空三桶),Assignments 页建议面板按
 * 目标规格渲染——运行时恒空,此处类型即规格文档;标可选=如实反映
 * "服务端尚未提供"。服务端实现后收紧必选。
 */
export interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  affected_entities: Array<{
    type: string;
    id: string;
    name: string;
  }>;
  suggested_actions: Array<{
    action: string;
    description: string;
    auto_executable: boolean;
  }>;
  /** 规格先行(服务端为占位桩): 建议的可执行动作对象——execute 端点收整组 */
  actions?: Array<{
    type?: string;
    person_id?: string;
    person_name?: string;
    project_id?: string;
    project_name?: string;
    role_name?: string;
    start_date?: string;
    end_date?: string;
    allocation_percentage?: number;
    new_allocation?: number;
  }>;
  confidence_score?: number;
  impact_summary?: string;
  created_at: string;
  expires_at?: string;
}

export interface RecommendationsCurrentState {
  summary?: {
    overallocated_people?: number;
    underutilized_people?: number;
    capacity_gaps?: number;
    unassigned_projects?: number;
  };
}

export interface RecommendationsResponse {
  recommendations?: Recommendation[];
  current_state?: RecommendationsCurrentState;
  summary?: {
    total: number;
    by_priority: Record<string, number>;
    by_category: Record<string, number>;
  };
}

export interface RecommendationExecuteResponse {
  success: boolean;
  recommendation_id: string;
  actions_executed: string[];
  results: Array<{
    action: string;
    success: boolean;
    message: string;
  }>;
}

// ============= Health Check Response =============

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: 'up' | 'down';
    cache?: 'up' | 'down';
    git_sync?: 'up' | 'down' | 'not_configured';
  };
}

// ============= Project Type Hierarchy Responses =============

export interface ProjectTypeHierarchyNode {
  id: string;
  name: string;
  parent_id?: string;
  level: number;
  children: ProjectTypeHierarchyNode[];
  phases: Array<{
    id: string;
    name: string;
    sequence_order: number;
    default_duration_days?: number;
  }>;
}

export interface ProjectTypeHierarchyResponse {
  hierarchy: ProjectTypeHierarchyNode[];
}

export interface ProjectTypePhasesResponse {
  project_type_id: string;
  project_type_name: string;
  phases: Array<{
    id: string;
    name: string;
    sequence_order: number;
    default_duration_days?: number;
    is_required: boolean;
  }>;
}

// ============= Project Allocations Responses =============

export interface ProjectAllocationItem {
  id?: string;
  project_id?: string;
  phase_id: string;
  phase_name?: string;
  phase_order?: number;
  role_id: string;
  role_name?: string;
  allocation_percentage: number;
  hours_per_week?: number;
  /** 服务端真名是 is_inherited(ProjectAllocationController :70/:115),
   *  原 is_override/source 系杜撰 */
  is_inherited: boolean;
  template_id?: string;
  original_percentage?: number;
  notes?: string;
}

/** {success,data} 信封(ProjectAllocationController res.json 实证,2026-10-13
 *  批清——原先裸对象让消费端解包错层) */
export interface ProjectAllocationsResponse {
  success: boolean;
  data: {
    project?: Record<string, unknown>;
    project_id?: string;
    allocations: ProjectAllocationItem[];
    summary?: {
      total_allocations?: number;
      inherited_count?: number;
      overridden_count?: number;
      total_phases?: number;
      total_roles?: number;
      override_count?: number;
    };
  };
}

/** GET /people/:id 裸返回(PeopleController.getById res.json(result) 实证):
 *  Person + 关联注入,无信封——api-client 原泛型 {data:Person} 是杜撰 */
export interface PersonDetailResponse {
  id: string;
  name: string;
  email?: string;
  supervisor_name?: string;
  primary_role_name?: string;
  primary_role_proficiency_level?: string;
  location_name?: string;
  default_availability_percentage?: number;
  is_active?: boolean;
  roles?: Array<Record<string, unknown>>;
  assignments?: Array<Record<string, unknown>>;
  availabilityOverrides?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// ===== Estimation (Step 1: LOC-based estimation + deadline check) =====

export interface ProjectEstimation {
  id: number;
  project_id: string;
  estimated_loc: number;
  loc_rate_per_pm: number;
  design_share_pct: number;
  deviation_low_pct: number;
  deviation_high_pct: number;
  expected_delivery_date: string | null;
  review_notes: string | null;
  actual_loc: number | null;
  actual_design_pm: number | null;
  actual_dev_pm: number | null;
  actual_delivery_date: string | null;
  backfilled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** computed client-side convenience flag: newest record */
  is_current?: boolean;
}

export interface EstimationPmInterval {
  low: number;
  mid: number;
  high: number;
}

export interface EstimationSideCheck {
  side: 'design' | 'dev';
  roleNames: string[];
  teamSize: number;
  demand: EstimationPmInterval;
  supplyPm: number;
  slackPm: number;
  gapPm: number;
  verdict: 'feasible' | 'tight' | 'infeasible';
}

export interface EstimationCheckResponse {
  window: { start: string; deadline: string; months: number };
  design: EstimationSideCheck;
  dev: EstimationSideCheck;
  overall: { verdict: 'feasible' | 'tight' | 'infeasible' };
  assumptions: {
    loc_rate_per_pm: number;
    design_share_pct: number;
    deviation_low_pct: number;
    deviation_high_pct: number;
    capacity_note: string;
  };
}

export interface EstimationDeviation {
  loc: number | null;
  design_pm: number | null;
  dev_pm: number | null;
  days_late: number | null;
}

// ===== Tags (project classification labels — filtering only, no calc semantics) =====

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  project_count?: number;
}

// ===== GitHub Connections (2026-10-13 批清补全: 该域此前零类型,api-client
// 引用的 8 个名字从未存在——形状按 049 迁移列集 + GitHubConnectionManager
// 消费字段核对) =====

export interface GitHubConnection {
  id: number;
  user_id: number;
  github_user_id: number;
  github_username: string;
  connection_method: 'oauth' | 'pat';
  token_expires_at: string | null;
  scopes: string[];
  status: 'active' | 'expired' | 'revoked' | 'error';
  is_default: boolean;
  last_used_at: string | null;
  github_base_url: string;
  created_at: string;
  updated_at: string;
  associations?: GitHubAssociation[];
  // 服务端还回 encrypted_token/refresh_token——类型故意不声明(客户端
  // 不该消费密钥字段;结构子类型不影响序列化)
}

export interface GitHubAssociation {
  id: number;
  github_connection_id: number;
  person_id: string;
  person_name: string | null;
  person_email: string | null;
  association_type: 'automatic' | 'manual';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type GitHubConnectionsListResponse = GitHubConnection[];
export type GitHubConnectionResponse = GitHubConnection;
export type GitHubConnectionUpdateResponse = GitHubConnection;
export type GitHubConnectionDeleteResponse = { message: string };
export interface GitHubOAuthInitResponse {
  // 服务端字段名是 authorization_url(GitHubOAuthService:97)——原先的
  // authorize_url 是杜撰名,授权跳转从未成功过
  authorization_url: string;
  state: string;
}
export type GitHubPATConnectResponse = GitHubConnection;
export type GitHubAssociationsResponse = GitHubAssociation[];
export interface GitHubAssociationCreateResponse {
  success: boolean;
  data: GitHubAssociation;
}
export type GitHubAssociationDeleteResponse = { message: string };

// ===== Audit recent(批清补全: /audit/recent 与 history 同构 entries 信封) =====

export interface AuditRecentResponse {
  entries: AuditLogEntry[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}
