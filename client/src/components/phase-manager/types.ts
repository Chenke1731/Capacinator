/**
 * Shared types for phase manager components
 */

// 对齐实体版(2026-10-13 批清): phase_name/order 在 /project-phases 行是
// join 注入的可选列——本地原为必选,与实体 ProjectPhaseTimeline 互不兼容,
// VisualPhaseManager 两头 import 打架
export interface ProjectPhaseTimeline {
  id: string;
  project_id: string;
  phase_id: string;
  start_date: string;
  end_date: string;
  phase_name?: string;
  phase_order?: number;
  is_custom_phase?: number;
}

export interface PhaseTemplate {
  id: string;
  name: string;
  description?: string;
  default_duration_days?: number;
}

export interface PhaseDependency {
  id: string;
  project_id: string;
  predecessor_phase_timeline_id: string;
  successor_phase_timeline_id: string;
  dependency_type: DependencyType;
  lag_days: number;
  predecessor_phase_name?: string;
  successor_phase_name?: string;
}

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface AddPhaseFormData {
  phase_id: string;
  start_date: string;
  end_date: string;
  phase_order: number;
}

export interface EditPhaseFormData {
  phase_name: string;
  start_date: string;
  end_date: string;
  phase_order: number;
}

export interface DependencyFormData {
  predecessor_phase_timeline_id: string;
  successor_phase_timeline_id: string;
  dependency_type: DependencyType;
  lag_days: number;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
  phaseId: string;
}

// Phase colors matching the existing system
// NOTE: Using hex values instead of CSS variables because these colors
// are passed to InteractiveTimeline which may use canvas rendering
// where CSS variables cannot be resolved
export const PHASE_COLORS: Record<string, string> = {
  'business planning': '#3b82f6',
  'development': '#10b981',
  'system integration testing': '#f59e0b',
  'user acceptance testing': '#8b5cf6',
  'validation': '#ec4899',
  'cutover': '#ef4444',
  'hypercare': '#06b6d4',
  'support': '#84cc16',
  'custom': '#6b7280'
};

export const getPhaseColor = (phaseName: string): string => {
  const normalizedName = phaseName.toLowerCase();
  return PHASE_COLORS[normalizedName] || PHASE_COLORS['custom'];
};
