/**
 * 项目类别映射 (2026-09-21 分流裁决: 计算同权, 呈现分流).
 *
 * 项目导航进去按类别分 tab; 映射按类型名(种子数据)归类, 新类型加一行即可扩展。
 * 底层模型不变——所有类别照常参与产能/死线计算。
 */
export type ProjectCategoryId = 'demand' | 'tickets' | 'affairs';

export interface ProjectCategory {
  id: ProjectCategoryId;
  /** project_types.name 前缀/全名命中即归此类 */
  typeNames: string[];
}

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  { id: 'demand', typeNames: ['需求交付'] },
  { id: 'tickets', typeNames: ['问题单支持'] },
  { id: 'affairs', typeNames: ['项目事务', '零星事项'] }
];

export function categoryOfTypeName(typeName: string | null | undefined): ProjectCategoryId | null {
  if (!typeName) return null;
  for (const cat of PROJECT_CATEGORIES) {
    if (cat.typeNames.some((n) => typeName === n || typeName.startsWith(n))) {
      return cat.id;
    }
  }
  return null;
}
