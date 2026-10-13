export interface BaseEntity {
    id: string;
    created_at: string;
    updated_at: string;
}
export interface Project extends BaseEntity {
    name: string;
    project_type_id: string;
    project_sub_type_id: string;
    location_id: string;
    priority: number;
    description?: string;
    data_restrictions?: string;
    include_in_demand: boolean;
    external_id?: string;
    owner_id?: string;
    current_phase_id?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    aspiration_start?: string;
    aspiration_finish?: string;
    project_type?: ProjectType;
    location?: Location;
    current_phase?: ProjectPhase;
    project_type_name?: string;
    location_name?: string;
    current_phase_name?: string;
    owner_name?: string;
    phases?: ProjectPhaseTimeline[];
    assignments?: ProjectAssignment[];
    planners?: ProjectPlanner[];
}
export interface Person extends BaseEntity {
    name: string;
    email?: string;
    primary_person_role_id?: string;
    worker_type: 'FTE' | 'Contractor' | 'Consultant';
    supervisor_id?: string;
    location_id?: string;
    /** 停用位(2026-10-13): false=离岗,保留历史、不进新排产候选集 */
    is_active?: boolean;
    default_availability_percentage: number;
    default_hours_per_day: number;
    is_bubble?: boolean;
    primary_role_name?: string;
    supervisor_name?: string;
    location_name?: string;
    roles?: PersonRole[];
    assignments?: ProjectAssignment[];
    availabilityOverrides?: PersonAvailabilityOverride[];
}
export interface Role extends BaseEntity {
    name: string;
    external_id?: string;
    description?: string;
    people?: PersonRole[];
    planners?: RolePlanner[];
    standardAllocations?: StandardAllocation[];
}
export interface Location extends BaseEntity {
    name: string;
    description?: string;
}
export interface ProjectType extends BaseEntity {
    name: string;
    description?: string;
    color_code?: string;
    sort_order?: number;
    is_active?: boolean;
    /* 层级域(服务端 ProjectTypesController 按需注入: 子类型视图带 parent_*,
       is_sub_type=true;is_default 为子类型默认标记)。可选=父类型行不带。 */
    parent_id?: string;
    parent_name?: string;
    is_sub_type?: boolean;
    is_default?: boolean;
}
export interface ProjectSubType extends BaseEntity {
    project_type_id: string;
    name: string;
    description?: string;
    color_code?: string;
    sort_order?: number;
    is_default?: boolean;
    is_active?: boolean;
    project_type?: ProjectType;
}
export interface ProjectPhase extends BaseEntity {
    name: string;
    description?: string;
    order_index: number;
}
export interface ProjectPhaseTimeline extends BaseEntity {
    project_id: string;
    phase_id: string;
    start_date: string;
    end_date: string;
    notes?: string;
    project_name?: string;
    phase_name?: string;
    phase_description?: string;
    phase_order?: number;
    dependencies?: ProjectPhaseDependency[];
    dependents?: ProjectPhaseDependency[];
}
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export interface ProjectPhaseDependency extends BaseEntity {
    project_id: string;
    predecessor_phase_timeline_id: string;
    successor_phase_timeline_id: string;
    dependency_type: DependencyType;
    lag_days?: number;
    predecessor_phase?: ProjectPhaseTimeline;
    successor_phase?: ProjectPhaseTimeline;
}
export interface ProjectAssignment extends BaseEntity {
    project_id: string;
    person_id: string;
    role_id: string;
    phase_id?: string;
    allocation_percentage: number;
    assignment_date_mode: 'fixed' | 'phase' | 'project';
    start_date?: string;
    end_date?: string;
    computed_start_date?: string;
    computed_end_date?: string;
    notes?: string;
    project_name?: string;
    person_name?: string;
    role_name?: string;
    phase_name?: string;
}
export interface PersonRole {
    person_id: string;
    role_id: string;
    proficiency_level: 'Junior' | 'Intermediate' | 'Senior' | 'Expert';
    years_experience?: number;
    notes?: string;
    assigned_at: string;
    role_name?: string;
    role_description?: string;
}
export interface StandardAllocation extends BaseEntity {
    project_type_id?: string;
    project_sub_type_id?: string;
    phase_id: string;
    role_id: string;
    allocation_percentage: number;
    is_inherited?: boolean;
    parent_template_id?: string;
    project_type_name?: string;
    project_sub_type_name?: string;
    phase_name?: string;
    role_name?: string;
}
export interface PersonAvailabilityOverride extends BaseEntity {
    person_id: string;
    start_date: string;
    end_date: string;
    availability_percentage: number;
    override_type: 'vacation' | 'training' | 'partial' | 'medical' | 'other';
    reason?: string;
    hours_per_day?: number;
    is_approved: boolean;
    approved_by?: string;
    approved_at?: string;
    approver_notes?: string;
    person_name?: string;
    approver_name?: string;
}
export interface DemandOverride extends BaseEntity {
    project_id: string;
    phase_id?: string;
    role_id: string;
    start_date: string;
    end_date: string;
    demand_hours: number;
    reason?: string;
}
export interface RolePlanner {
    role_id: string;
    person_id: string;
    is_primary: boolean;
    can_allocate_resources: boolean;
    can_approve_assignments: boolean;
    can_modify_standard_allocations: boolean;
    notes?: string;
    assigned_at: string;
    assigned_by?: string;
    person_name?: string;
    assigned_by_name?: string;
}
export interface ProjectPlanner {
    project_id: string;
    person_id: string;
    permission_level: 'view' | 'edit' | 'admin';
    can_modify_type: boolean;
    can_modify_roadmap: boolean;
    can_add_overrides: boolean;
    can_assign_resources: boolean;
    is_primary_planner: boolean;
    assigned_at: string;
    assigned_by?: string;
    person_name?: string;
    assigned_by_name?: string;
}
export interface ProjectDemand {
    project_id: string;
    phase_id?: string;
    role_id: string;
    start_date: string;
    end_date: string;
    demand_hours: number;
    is_override: boolean;
    demand_fte?: number;
    project_name?: string;
    phase_name?: string;
    role_name?: string;
}
export interface PersonUtilization {
    person_id: string;
    person_name: string;
    supervisor_id?: string;
    supervisor_name?: string;
    total_allocation: number;
    project_count: number;
    projects?: string;
    default_availability_percentage: number;
    default_hours_per_day: number;
    current_availability_percentage: number;
    allocation_status: 'OVER_ALLOCATED' | 'FULLY_ALLOCATED' | 'PARTIALLY_ALLOCATED' | 'UNDER_ALLOCATED';
}
export interface CapacityGap {
    role_id: string;
    role_name: string;
    role_planners?: string;
    people_count: number;
    total_capacity_fte: number;
    projects_needing_role: number;
    avg_allocation_needed: number;
    total_demand_fte: number;
    gap_fte: number;
    status: 'GAP' | 'TIGHT' | 'OK';
}
export interface ProjectHealth {
    project_id: string;
    project_name: string;
    project_type_id: string;
    project_type: string;
    location_id: string;
    location: string;
    priority: number;
    aspiration_start?: string;
    aspiration_finish?: string;
    owner_id?: string;
    owner_name?: string;
    phase_count: number;
    people_assigned: number;
    planner_count: number;
    primary_planner_name?: string;
    health_status: 'PLANNING' | 'NOT_STARTED' | 'OVERDUE' | 'NO_RESOURCES' | 'NO_TIMELINE' | 'ACTIVE';
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface DashboardSummary {
    summary: {
        projects: number;
        people: number;
        roles: number;
    };
    projectHealth: Record<string, number>;
    capacityGaps: Record<string, number>;
    utilization: Record<string, number>;
    availability: Record<string, number>;
}
export interface CapacityReport {
    capacityGaps: CapacityGap[];
    personUtilization: PersonUtilization[];
    projectDemands: ProjectDemand[];
    summary: {
        totalGaps: number;
        totalTight: number;
        overAllocated: number;
        underAllocated: number;
    };
}
export interface ImportResult {
    success: boolean;
    message: string;
    imported?: {
        locations: number;
        projectTypes: number;
        phases: number;
        roles: number;
        people: number;
        projects: number;
        standardAllocations: number;
        assignments: number;
    };
    errors?: string[];
    warnings?: string[];
}
export interface Scenario extends BaseEntity {
    name: string;
    description?: string;
    parent_scenario_id?: string;
    created_by: string;
    status: 'active' | 'archived' | 'merged';
    scenario_type: 'baseline' | 'branch' | 'sandbox';
    branch_point?: string;
    created_by_name?: string;
    parent_scenario_name?: string;
    child_scenarios?: Scenario[];
    children_count?: number;
}
export interface ScenarioProjectAssignment extends BaseEntity {
    scenario_id: string;
    project_id: string;
    person_id: string;
    role_id: string;
    phase_id?: string;
    allocation_percentage: number;
    assignment_date_mode: 'fixed' | 'phase' | 'project';
    start_date?: string;
    end_date?: string;
    notes?: string;
    change_type: 'added' | 'modified' | 'removed';
    base_assignment_id?: string;
    computed_start_date?: string;
    computed_end_date?: string;
    project_name?: string;
    person_name?: string;
    role_name?: string;
    phase_name?: string;
}
export interface ScenarioProjectPhase extends BaseEntity {
    scenario_id: string;
    project_id: string;
    phase_id: string;
    start_date: string;
    end_date: string;
    notes?: string;
    change_type: 'added' | 'modified' | 'removed';
    base_phase_timeline_id?: string;
    project_name?: string;
    phase_name?: string;
}
export interface ScenarioProject extends BaseEntity {
    scenario_id: string;
    project_id: string;
    name?: string;
    priority?: number;
    aspiration_start?: string;
    aspiration_finish?: string;
    change_type: 'added' | 'modified' | 'removed';
    notes?: string;
    original_project_name?: string;
}
export interface ScenarioMergeConflict extends BaseEntity {
    source_scenario_id: string;
    target_scenario_id: string;
    conflict_type: 'assignment' | 'phase_timeline' | 'project_details';
    entity_id: string;
    source_data: any;
    target_data: any;
    resolution: 'use_source' | 'use_target' | 'manual' | 'pending';
    resolved_data?: any;
    resolved_by?: string;
    resolved_at?: string;
    source_scenario_name?: string;
    target_scenario_name?: string;
    resolved_by_name?: string;
}
export interface ScenarioComparison {
    scenario1: Scenario;
    scenario2: Scenario;
    differences: {
        assignments: {
            added: ScenarioProjectAssignment[];
            modified: ScenarioProjectAssignment[];
            removed: ScenarioProjectAssignment[];
        };
        phases: {
            added: ScenarioProjectPhase[];
            modified: ScenarioProjectPhase[];
            removed: ScenarioProjectPhase[];
        };
        projects: {
            added: ScenarioProject[];
            modified: ScenarioProject[];
            removed: ScenarioProject[];
        };
    };
    metrics: {
        utilization_impact: Record<string, number>;
        capacity_impact: Record<string, number>;
        timeline_impact: Record<string, number>;
    };
}
//# sourceMappingURL=index.d.ts.map