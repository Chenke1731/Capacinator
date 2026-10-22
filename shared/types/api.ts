/**
 * API response types shared between frontend and backend
 * These define the contract for API endpoints
 */

import type { CapacityGap, PersonUtilization, ProjectDemand } from './views.js';

/**
 * Dashboard summary response
 */
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

/**
 * Capacity report response
 */
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

/**
 * Import operation result
 */
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

/**
 * Export options for data export operations
 */
export interface ExportOptions {
  format: 'xlsx' | 'csv' | 'json';
  includeRelations?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
}

/**
 * Authentication token payload
 */
export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  userRoleId?: string;
}

/**
 * Login request body (person selection — no password in this tool)
 * 真身见 routes/auth.ts POST /login
 */
export interface LoginRequest {
  personId: string;
}

/**
 * auth user 载荷——真身: AuthService.getUserById 只 select people 表 5 列（snake_case 原样），
 * 不是完整 Person。login/me 响应的 user 字段即此形状。
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  is_system_admin: boolean;
  user_role_id?: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Token refresh request
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Token refresh response
 */
export interface RefreshTokenResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  environment?: string;
  version?: string;
}
