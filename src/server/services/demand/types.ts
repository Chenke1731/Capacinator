/**
 * Types for demand calculation service
 */

export interface DemandSummaryFilters {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  projectTypeId?: string;
  /** IP-02b: 选定场景(缺省 baseline)——需求读该场景有效切片 */
  scenarioId?: string;
}

export interface ProjectDemandsData {
  project: ProjectDetail;
  phases: PhaseWithDemands[];
  demands: DemandWithFte[];
  summary: {
    total_phases: number;
    total_demands: number;
    total_hours: number;
    total_fte: number;
    override_count: number;
    roles_needed: number;
  };
}

export interface ProjectDetail {
  id: string;
  name: string;
  project_type_name?: string;
  [key: string]: unknown;
}

export interface PhaseWithDemands {
  phase_id: string;
  phase_name: string;
  phase_order: number;
  start_date: string;
  end_date: string;
  demands: DemandWithFte[];
  total_hours: number;
  total_fte: number;
}

export interface DemandWithFte {
  id?: string;
  project_id: string;
  role_id: string;
  phase_id?: string;
  demand_hours: number;
  demand_fte: number;
  start_date: string;
  end_date: string;
  is_override?: boolean;
  phase_name?: string;
  phase_order?: number;
  role_name?: string;
}

export interface DemandSummaryData {
  filters: DemandSummaryFilters;
  summary: {
    total_demands: number;
    total_projects: number;
    total_hours: number;
    total_fte: number;
  };
  by_role: RoleSummary[];
  by_project_type: ProjectTypeSummary[];
  timeline: TimelineMonth[];
}

export interface RoleSummary {
  role_id: string;
  role_name: string;
  total_hours: number;
  total_fte: number;
  project_count: number;
}

export interface ProjectTypeSummary {
  project_type_id: string | null;
  project_type_name: string;
  total_hours: number;
  total_fte: number;
  project_count: number;
}

export interface TimelineMonth {
  month: string;
  total_hours: number;
  total_fte: number;
  role_breakdown?: Record<string, { hours: number; fte: number }>;
}

export interface ForecastData {
  forecast: ForecastMonth[];
  summary: {
    months: number;
    start_date: string;
    end_date: string;
    total_projects: number;
    peak_month: ForecastMonth;
    average_monthly_fte: number;
  };
}

export interface ForecastMonth {
  month: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  total_fte: number;
  by_role: Record<string, { hours: number; fte: number }>;
  project_count: number;
}

export interface DemandGapsData {
  gaps: DemandGap[];
  summary: {
    total_gaps: number;
    total_shortage_fte: number;
    critical_gaps: number;
  };
}

export interface DemandGap {
  role_id: string;
  role_name: string;
  total_demand_fte: number;
  total_capacity_fte: number;
  gap_fte: number;
}

export interface ScenarioInput {
  new_projects?: NewProjectScenario[];
  remove_projects?: string[];
  delay_projects?: DelayProjectScenario[];
  change_allocations?: ChangeAllocationScenario[];
}

export interface NewProjectScenario {
  id: string;
  project_type_id: string;
  start_date: string;
  end_date: string;
}

export interface DelayProjectScenario {
  project_id: string;
  delay_days: number;
}

export interface ChangeAllocationScenario {
  project_id: string;
  role_id: string;
  new_percentage: number;
}

export interface ScenarioResult {
  scenario: ScenarioInput;
  baseline: ScenarioSummary;
  projected: ScenarioSummary;
  impact: ScenarioImpact;
  recommendation: string;
}

export interface ScenarioSummary {
  total_hours: number;
  total_fte: number;
  by_role: Record<string, unknown>;
}

export interface ScenarioImpact {
  total_fte_change: number;
  total_hours_change: number;
  roles_impacted: unknown[];
  new_gaps: unknown[];
}
