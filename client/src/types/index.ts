/**
 * Client Type Definitions
 *
 * This module re-exports shared types from @shared/types and adds any
 * client-specific type extensions if needed.
 *
 * Import types using: import type { Project, Person, Role } from '../types';
 */

// Re-export all shared types
// Using relative path since Vite handles the alias resolution at build time
// and we need this to work with both TypeScript compiler and Vite

// Base types
export type {
  BaseEntity,
  ApiError,
  ApiSuccessResponse,
  PaginationParams,
  PaginatedResponse,
} from '../../../shared/types/base';

// Entity types
export type {
  Component,
  Location,
  ProjectType,
  ProjectSubType,
  ProjectPhase,
  Role,
  Project,
  Person,
  WorkerType,
  ProjectPhaseTimeline,
  DependencyType,
  ProjectPhaseDependency,
  AssignmentDateMode,
  ProjectAssignment,
  ProficiencyLevel,
  PersonRole,
  StandardAllocation,
  AvailabilityOverrideType,
  PersonAvailabilityOverride,
  DemandOverride,
  RolePlanner,
  ProjectPermissionLevel,
  ProjectPlanner,
} from '../../../shared/types/entities';

// View types
export type {
  ProjectDemand,
  AllocationStatus,
  PersonUtilization,
  CapacityGapStatus,
  CapacityGap,
  ProjectHealthStatus,
  ProjectHealth,
} from '../../../shared/types/views';

// API types
export type {
  DashboardSummary,
  CapacityReport,
  ImportResult,
  ExportOptions,
  TokenPayload,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  HealthCheckResponse,
} from '../../../shared/types/api';

// Scenario types
export type {
  ScenarioStatus,
  ScenarioType,
  Scenario,
  ScenarioChangeType,
  ScenarioAssignmentDateMode,
  ScenarioProjectAssignment,
  ScenarioProjectPhase,
  ScenarioProject,
  MergeConflictType,
  MergeResolution,
  ScenarioMergeConflict,
  ScenarioComparison,
  ScenarioAssignmentsView,
} from '../../../shared/types/scenarios';

// API Response types (for api-client.ts)
export * from './api-responses';
