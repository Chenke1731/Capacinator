/**
 * Scenario planning types shared between frontend and backend
 * These support "what-if" analysis and planning scenarios
 */

import type { BaseEntity } from './base.js';

/**
 * Scenario status classifications
 */
export type ScenarioStatus = 'active' | 'archived' | 'merged';

/**
 * Scenario type classifications
 */
export type ScenarioType = 'baseline' | 'branch' | 'sandbox';

/**
 * Scenario entity - represents a planning scenario
 */
export interface Scenario extends BaseEntity {
  name: string;
  description?: string;
  parent_scenario_id?: string;
  created_by: string;
  status: ScenarioStatus;
  scenario_type: ScenarioType;
  branch_point?: string;

  // Relations (populated when joined)
  created_by_name?: string;
  parent_scenario_name?: string;
  child_scenarios?: Scenario[];
  children_count?: number;
}

/**
 * Change type for scenario modifications
 */
export type ScenarioChangeType = 'added' | 'modified' | 'removed';

/**
 * Assignment date mode (shared with entities)
 */
export type ScenarioAssignmentDateMode = 'fixed' | 'phase' | 'project';

/**
 * Scenario-specific project assignment
 */
export interface ScenarioProjectAssignment extends BaseEntity {
  scenario_id: string;
  project_id: string;
  person_id: string;
  role_id: string;
  phase_id?: string;
  allocation_percentage: number;
  assignment_date_mode: ScenarioAssignmentDateMode;
  start_date?: string;
  end_date?: string;
  notes?: string;
  change_type: ScenarioChangeType;
  base_assignment_id?: string;

  // Computed fields
  computed_start_date?: string;
  computed_end_date?: string;

  // Relations (populated when joined)
  project_name?: string;
  person_name?: string;
  role_name?: string;
  phase_name?: string;
}

/**
 * Scenario-specific project phase timeline
 */
export interface ScenarioProjectPhase extends BaseEntity {
  scenario_id: string;
  project_id: string;
  phase_id: string;
  start_date: string;
  end_date: string;
  notes?: string;
  change_type: ScenarioChangeType;
  base_phase_timeline_id?: string;

  // Relations (populated when joined)
  project_name?: string;
  phase_name?: string;
}

/**
 * Scenario-specific project modifications
 */
export interface ScenarioProject extends BaseEntity {
  scenario_id: string;
  project_id: string;
  name?: string;
  priority?: number;
  aspiration_start?: string;
  aspiration_finish?: string;
  change_type: ScenarioChangeType;
  notes?: string;

  // Relations (populated when joined)
  original_project_name?: string;
}

/**
 * Conflict type for scenario merging
 */
export type MergeConflictType = 'assignment' | 'phase_timeline' | 'project_details';

/**
 * Conflict resolution strategy
 */
export type MergeResolution = 'use_source' | 'use_target' | 'manual' | 'pending';

/**
 * Scenario merge conflict
 */
export interface ScenarioMergeConflict extends BaseEntity {
  source_scenario_id: string;
  target_scenario_id: string;
  conflict_type: MergeConflictType;
  entity_id: string;
  source_data: unknown;
  target_data: unknown;
  resolution: MergeResolution;
  resolved_data?: unknown;
  resolved_by?: string;
  resolved_at?: string;

  // Relations (populated when joined)
  source_scenario_name?: string;
  target_scenario_name?: string;
  resolved_by_name?: string;
}

/**
 * Scenario comparison result
 */
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

/**
 * Scenario assignments view (database view type)
 */
export interface ScenarioAssignmentsView {
  // From scenario_project_assignments
  id: string;
  scenario_id: string;
  project_id: string;
  person_id: string;
  role_id: string;
  phase_id: string | null;
  allocation_percentage: number;
  assignment_date_mode: ScenarioAssignmentDateMode;
  start_date: Date | null;
  end_date: Date | null;
  is_billable: boolean;
  is_aspirational: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;

  // Joined fields
  project_name: string;
  project_start: Date;
  project_finish: Date;
  person_name: string;
  role_name: string;
  phase_name: string | null;

  // Computed fields
  computed_start_date: Date;
  computed_end_date: Date;
}

/**
 * 合并策略单一真相（2026-10-17 返工，Codex 复审 P1）：
 * 客户端曾私发 favor_source/favor_target，服务端只认 use_source/use_target，
 * 未知串静默落入 manual 空转——冲突被丢、源标 merged、返回成功。
 * 双端共读本枚举；服务端对未知策略显式 400。
 */
export const MERGE_STRATEGIES = ['use_source', 'use_target', 'manual'] as const;
export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];

export function isMergeStrategy(value: unknown): value is MergeStrategy {
  return typeof value === 'string' && (MERGE_STRATEGIES as readonly string[]).includes(value);
}
