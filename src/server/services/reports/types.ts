/**
 * Shared types for report services
 */

// ============================================================================
// Filter Types
// ============================================================================

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface DemandReportFilters extends DateRangeFilter {
  scenarioId?: string;
  includeAllScenarios?: boolean;
}

export interface ProjectReportFilters {
  status?: string;
  priority?: string;
  projectType?: string;
  location?: string;
}

export interface DemandSummaryFilters extends DateRangeFilter {
  locationId?: string;
  projectTypeId?: string;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardStats {
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
  /** Items in 设计中 whose design deadline is due or overdue */
  design_watch: Array<{
    project_id: string;
    project_name: string;
    design_deadline: string;
    rough_design_pm: number | null;
    days_remaining: number;
    overdue: boolean;
    due_soon: boolean;
  }>;
  /** Count of lifecycle-tracked items per state (standing items excluded) */
  lifecycle_summary: Record<string, number>;
}

// ============================================================================
// Capacity Report Types
// ============================================================================

export interface RoleCapacityData {
  id: string;
  role: string;
  capacity: number;
  utilized: number;
  available: number;
  people_count: number;
  status: 'GAP' | 'TIGHT' | 'OK';
}

export interface CapacityGapRow {
  role_id: string;
  role_name: string;
  total_capacity_fte: number;
  total_demand_fte: number;
  total_capacity_hours?: number;
  total_demand_hours?: number;
  people_count?: number;
  gap_fte?: number;
  status?: string;
}

export interface PersonUtilizationRow {
  person_id: string;
  person_name: string;
  person_email?: string;
  worker_type?: string;
  primary_role_id?: string;
  primary_role_name?: string;
  location_name?: string;
  default_availability_percentage?: number;
  default_hours_per_day?: number;
  total_allocation_percentage: number;
  current_availability_percentage?: number;
  utilization_status?: string;
  project_count?: number;
  project_names?: string;
}

export interface TimelineEntry {
  period: string;
  capacity?: number;
  month?: string;
  total_hours?: number;
}

export interface CapacityReportData {
  capacityGaps: CapacityGapRow[];
  byRole: RoleCapacityData[];
  personUtilization: PersonUtilizationRow[];
  utilizationData: TransformedUtilizationData[];
  projectDemands: ProjectDemandRow[];
  timeline: TimelineEntry[];
  summary: {
    totalGaps: number;
    totalTight: number;
    overAllocated: number;
    underAllocated: number;
  };
}

export interface TransformedUtilizationData extends PersonUtilizationRow {
  total_allocated_hours: number;
  available_hours: number;
  allocation_status: 'OVER_ALLOCATED' | 'FULLY_ALLOCATED' | 'PARTIALLY_ALLOCATED' | 'AVAILABLE' | 'UNAVAILABLE';
}

export interface ProjectDemandRow {
  project_id: string;
  role_id: string;
  demand_hours: number;
  start_date: string;
  end_date: string;
  project_name?: string;
  role_name?: string;
}

// ============================================================================
// Utilization Report Types
// ============================================================================

export interface UtilizationReportData {
  utilizationData: UtilizationPersonData[];
  overutilized: UtilizationPersonData[];
  underutilized: UtilizationPersonData[];
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

export interface UtilizationPersonData {
  person_id: string;
  person_name: string;
  person_email?: string;
  worker_type?: string;
  default_availability_percentage?: number;
  default_hours_per_day?: number;
  primary_role_id?: string;
  primary_role_name?: string;
  location_name?: string;
  total_allocation_percentage: number;
  project_count: number;
  project_names: string;
  total_allocated_hours: number;
  available_hours: number;
  allocation_status: string;
  allocation_warning?: string | null;
  display_allocation_percentage?: number;
}

// ============================================================================
// Demand Report Types
// ============================================================================

export interface DemandReportData {
  demandData: DemandDataRow[];
  byProject: ProjectDemandSummary[];
  by_role: RoleDemandSummary[];
  by_project_type: ProjectTypeDemandSummary[];
  timeline: DemandTimelineEntry[];
  summary: {
    total_hours: number;
    total_projects: number;
    roles_with_demand: number;
  };
}

export interface DemandDataRow {
  project_id: string;
  role_id: string;
  demand_hours: number;
  start_date: string;
  end_date: string;
  scenario_id?: string | null;
  project_name?: string;
  role_name?: string;
  project_type_id?: string;
  project_type_name?: string;
}

export interface ProjectDemandSummary {
  id: string;
  name: string;
  demand: number;
}

export interface RoleDemandSummary {
  role_name: string;
  total_hours: number;
}

export interface ProjectTypeDemandSummary {
  project_type_name: string;
  total_hours: number;
}

export interface DemandTimelineEntry {
  month: string;
  total_hours: number;
}

// ============================================================================
// Gaps Analysis Types
// ============================================================================

export interface GapsAnalysisData {
  capacityGaps: ExtendedCapacityGap[];
  projectHealth: ProjectHealthRow[];
  criticalRoleGaps: ExtendedCapacityGap[];
  criticalProjectGaps: UnmetDemandProject[];
  summary: {
    totalGapHours: number;
    projectsWithGaps: number;
    rolesWithGaps: number;
    unutilizedHours: number;
  };
}

export interface ExtendedCapacityGap extends CapacityGapRow {
  gap_percentage: number;
  demand_vs_capacity: number;
}

export interface ProjectHealthRow {
  project_id: string;
  project_name?: string;
  total_allocation_percentage?: number;
  allocation_health?: string;
  health_status?: string;
  priority?: number;
}

export interface UnmetDemandProject {
  project_id: string;
  project_name: string;
  gap_type: 'UNASSIGNED' | 'UNDER_COVERED';
  unmet_demands: number;
  total_demand_percentage: number;
  actual_allocation_percentage?: number;
  coverage_ratio?: number;
}

// ============================================================================
// Timeline Report Types
// ============================================================================

export interface TimelineReportData {
  projects: TimelineProject[];
  phases: TimelinePhase[];
}

export interface TimelineProject {
  id: string;
  name: string;
  aspiration_start: string;
  aspiration_finish: string;
  priority?: number;
  project_type?: string;
  owner_name?: string;
}

export interface TimelinePhase {
  id: string;
  project_id: string;
  phase_id: string;
  start_date: string;
  end_date: string;
  project_name?: string;
  phase_name?: string;
}

// ============================================================================
// Project Report Types
// ============================================================================

export interface ProjectReportData {
  projects: ProjectHealthRow[];
  summary: {
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  };
}
