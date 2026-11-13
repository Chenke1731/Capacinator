/**
 * 类型资源模板 × 项目的匹配规则（后端评审 F5 裁决 A）——选择弹窗的需求
 * 回落与 POST /project-allocations/:id/initialize 必须同规则，否则"弹窗
 * 显示的需求集合 ≠ 初始化落库的需求集合"。
 *
 * 规则（与 046 唯一约束 (type, sub_type, phase, role) 的数据形状一致）：
 * - 模板 project_type_id 必须等于项目类型；
 * - 模板 sub_type 精确等于项目 sub_type → 命中；
 * - 模板 sub_type 为 NULL → 通配（项目有无 sub_type 都适用）；
 * - 同一 (phase, role) 同时有精确与通配行时，精确行优先。
 */
export interface ResourceTemplateLike {
  project_type_id: string;
  project_sub_type_id: string | null;
  phase_id: string;
  role_id: string;
}

export function matchResourceTemplates<T extends ResourceTemplateLike>(
  templates: T[],
  project: { project_type_id: string | null; project_sub_type_id: string | null }
): T[] {
  if (!project.project_type_id) return [];
  const projectSub = project.project_sub_type_id ?? null;
  const byKey = new Map<string, T>();
  for (const template of templates) {
    if (template.project_type_id !== project.project_type_id) continue;
    const templateSub = template.project_sub_type_id ?? null;
    const exact = templateSub === projectSub;
    const wildcard = templateSub === null;
    if (!exact && !wildcard) continue;
    const key = `${template.phase_id}::${template.role_id}`;
    const existing = byKey.get(key);
    // 精确行覆盖通配行；通配行不覆盖已有精确行
    if (!existing || (exact && (existing.project_sub_type_id ?? null) !== projectSub)) {
      byKey.set(key, template);
    }
  }
  return [...byKey.values()];
}
