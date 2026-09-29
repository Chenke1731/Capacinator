/**
 * Core entity types shared between frontend and backend
 * These represent the primary business objects in the system
 */

import type { BaseEntity } from './base.js';

// ============================================================================
// Reference/Lookup Entities
// ============================================================================

/**
 * Geographic location for projects and people
 */
export interface Location extends BaseEntity {
  name: string;
  description?: string;
}

/** Software component (066): controlled structural dimension answering
 *  "which part of the software" — orthogonal to project_type, feeds
 *  demand/workload analytics (tags deliberately carry no semantics). */
export interface Component extends BaseEntity {
  name: string;
  code?: string;
  description?: string;
  owner_id?: string | null;
  is_active: boolean;
}

/**
 * Project type classification (e.g., "Development", "Infrastructure")
 */
export interface ProjectType extends BaseEntity {
  name: string;
  description?: string;
  color_code?: string;
  sort_order?: number;
  is_active?: boolean;
}

/**
 * Project sub-type for finer classification within a project type
 */
export interface ProjectSubType extends BaseEntity {
  project_type_id: string;
  name: string;
  description?: string;
  color_code?: string; // Inherits from parent if null
  sort_order?: number;
  is_default?: boolean;
  is_active?: boolean;

  // Optional populated fields
  project_type?: ProjectType;
}

/**
 * Project phase definition (e.g., "Discovery", "Development", "Launch")
 */
export interface ProjectPhase extends BaseEntity {
  name: string;
  description?: string;
  order_index: number;
}

/**
 * Role definition for resource allocation (e.g., "Developer", "Designer")
 */
export interface Role extends BaseEntity {
  name: string;
  external_id?: string;
  description?: string;
  // Relations (populated when joined)
  people?: PersonRole[];
  planners?: RolePlanner[];
  standardAllocations?: StandardAllocation[];
}

// ============================================================================
// Core Business Entities
// ============================================================================

/**
 * Project entity - the central planning unit
 */
export interface Project extends BaseEntity {
  name: string;
  project_type_id: string;
  project_sub_type_id: string; // Mandatory field for sub-type reference
  location_id: string;
  /** Software component (066): single-select attribution for demand
   *  management and analytics — nullable, legacy rows stay unassigned. */
  component_id?: string | null;
  priority: number;
  description?: string;
  data_restrictions?: string;
  include_in_demand: boolean;
  external_id?: string;
  owner_id?: string;
  current_phase_id?: string; // References project_phases.id, manually set to track progress
  start_date?: string;
  end_date?: string;
  status?: string; // Project status (e.g., 'active', 'planned', etc.)
  aspiration_start?: string; // Target start date for the project
  aspiration_finish?: string; // Target end date for the project

  // Relations (populated when joined)
  project_type?: ProjectType;
  location?: Location;
  current_phase?: ProjectPhase; // Populated when current_phase_id is set
  project_type_name?: string;
  location_name?: string;
  current_phase_name?: string; // From project_health_view
  owner_name?: string;
  phases?: ProjectPhaseTimeline[];
  assignments?: ProjectAssignment[];
  planners?: ProjectPlanner[];
}

/**
 * Person entity - represents a team member
 */
export interface Person extends BaseEntity {
  name: string;
  email?: string;
  primary_person_role_id?: string;
  worker_type: WorkerType;
  supervisor_id?: string;
  location_id?: string;
  default_availability_percentage: number;
  default_hours_per_day: number;
  is_bubble?: boolean;

  // Relations (populated when joined)
  primary_role_name?: string;
  supervisor_name?: string;
  location_name?: string;
  roles?: PersonRole[];
  assignments?: ProjectAssignment[];
  availabilityOverrides?: PersonAvailabilityOverride[];
}

/**
 * Worker type classification
 */
export type WorkerType = 'FTE' | 'Contractor' | 'Consultant';

// ============================================================================
// Relationship Entities
// ============================================================================

/**
 * Project phase timeline - maps a phase to a project with dates
 */
export interface ProjectPhaseTimeline extends BaseEntity {
  project_id: string;
  phase_id: string;
  start_date: string;
  end_date: string;
  notes?: string;

  // Relations (populated when joined)
  project_name?: string;
  phase_name?: string;
  phase_description?: string;
  phase_order?: number;

  // Dependencies
  dependencies?: ProjectPhaseDependency[];
  dependents?: ProjectPhaseDependency[]; // Phases that depend on this one
}

/**
 * Phase dependency types: Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish
 */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * Project phase dependency - defines relationships between phases
 */
export interface ProjectPhaseDependency extends BaseEntity {
  project_id: string;
  predecessor_phase_timeline_id: string; // The phase that must complete first
  successor_phase_timeline_id: string;   // The phase that depends on the predecessor
  dependency_type: DependencyType;
  lag_days?: number; // Optional delay between phases (e.g., +2 days after predecessor finishes)

  // Relations (populated when joined)
  predecessor_phase?: ProjectPhaseTimeline;
  successor_phase?: ProjectPhaseTimeline;
}

/**
 * Assignment date calculation mode
 */
export type AssignmentDateMode = 'fixed' | 'phase' | 'project';

/**
 * Project assignment - assigns a person to a project role
 */
export interface ProjectAssignment extends BaseEntity {
  project_id: string;
  person_id: string;
  role_id: string;
  phase_id?: string;
  allocation_percentage: number;

  // Assignment date mode determines how dates are calculated
  assignment_date_mode: AssignmentDateMode;

  // For fixed mode: explicit dates
  start_date?: string;
  end_date?: string;

  // Computed dates (calculated based on mode)
  computed_start_date?: string;
  computed_end_date?: string;

  notes?: string;

  // Relations (populated when joined)
  project_name?: string;
  person_name?: string;
  role_name?: string;
  phase_name?: string;
}

/**
 * Proficiency level for person-role relationships
 */
export type ProficiencyLevel = 'Junior' | 'Intermediate' | 'Senior' | 'Expert';

/**
 * Person-Role relationship - maps people to their roles
 */
export interface PersonRole {
  person_id: string;
  role_id: string;
  proficiency_level: ProficiencyLevel;
  years_experience?: number;
  notes?: string;
  assigned_at: string;

  // Relations (populated when joined)
  role_name?: string;
  role_description?: string;
}

/**
 * Standard allocation template - default allocations for project types
 */
export interface StandardAllocation extends BaseEntity {
  project_type_id?: string; // For parent type allocations
  project_sub_type_id?: string; // For specific sub-type allocations
  phase_id: string;
  role_id: string;
  allocation_percentage: number;
  is_inherited?: boolean; // Indicates if inherited from parent type
  parent_template_id?: string; // Reference to parent template if inherited

  // Relations (populated when joined)
  project_type_name?: string;
  project_sub_type_name?: string;
  phase_name?: string;
  role_name?: string;
}

/**
 * Override type for availability changes
 */
export type AvailabilityOverrideType = 'vacation' | 'training' | 'partial' | 'medical' | 'other';

/**
 * Person availability override - temporary changes to availability
 */
export interface PersonAvailabilityOverride extends BaseEntity {
  person_id: string;
  start_date: string;
  end_date: string;
  availability_percentage: number;
  override_type: AvailabilityOverrideType;
  reason?: string;
  hours_per_day?: number;
  is_approved: boolean;
  approved_by?: string;
  approved_at?: string;
  approver_notes?: string;

  // Relations (populated when joined)
  person_name?: string;
  approver_name?: string;
}

/**
 * Demand override - manual adjustments to calculated demand
 */
export interface DemandOverride extends BaseEntity {
  project_id: string;
  phase_id?: string;
  role_id: string;
  start_date: string;
  end_date: string;
  demand_hours: number;
  reason?: string;
}

/**
 * Role planner - person responsible for planning a role
 */
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

  // Relations (populated when joined)
  person_name?: string;
  assigned_by_name?: string;
}

/**
 * Permission level for project planners
 */
export type ProjectPermissionLevel = 'view' | 'edit' | 'admin';

/**
 * Project planner - person responsible for planning a project
 */
export interface ProjectPlanner {
  project_id: string;
  person_id: string;
  permission_level: ProjectPermissionLevel;
  can_modify_type: boolean;
  can_modify_roadmap: boolean;
  can_add_overrides: boolean;
  can_assign_resources: boolean;
  is_primary_planner: boolean;
  assigned_at: string;
  assigned_by?: string;

  // Relations (populated when joined)
  person_name?: string;
  assigned_by_name?: string;
}
