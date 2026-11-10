/**
 * Shared Type Definitions
 *
 * This module provides type definitions shared between frontend and backend.
 * All types are defined once here and imported by both client and server.
 *
 * Organization:
 * - base.ts: Base interfaces (BaseEntity, PaginatedResponse, etc.)
 * - entities.ts: Core business entities (Project, Person, Role, etc.)
 * - views.ts: Computed/aggregated views (ProjectDemand, PersonUtilization, etc.)
 * - api.ts: API-specific types (DashboardSummary, ImportResult, etc.)
 * - scenarios.ts: Scenario planning types (Scenario, ScenarioComparison, etc.)
 */

// Base types
export type {
  BaseEntity,
  ApiError,
  ApiSuccessResponse,
  PaginationParams,
  PaginatedResponse,
} from './base.js';

// Entity types
export type {
  // Reference/Lookup entities
  Location,
  ProjectType,
  ProjectSubType,
  ProjectPhase,
  Role,
  // Core entities
  Project,
  Person,
  WorkerType,
  // Relationship entities
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
} from './entities.js';

// View types
export type {
  ProjectDemand,
  AllocationStatus,
  PersonUtilization,
  CapacityGapStatus,
  CapacityGap,
  ProjectHealthStatus,
  ProjectHealth,
} from './views.js';

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
} from './api.js';

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
} from './scenarios.js';

// Intake types (I01 需求收件箱)
export type {
  IntakeSourceChannel,
  IntakeStatus,
  DemandIntake,
  IntakeCaptureInput,
  IntakeConvertInput,
  IntakeConvertResult,
} from './intake.js';
export { INTAKE_SOURCE_CHANNELS } from './intake.js';
