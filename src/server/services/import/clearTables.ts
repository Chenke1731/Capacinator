/**
 * 导入清库表清单——V1/V2 单一真相（IP-05b，2026-10-17）。
 *
 * 历史：两导入器各持两份内联清单（事务版/非事务版），漂移出三类雷：
 * 旧表名 standard_allocations（046 改名 resource_templates 后 del 必炸）、
 * 幻影表 supervisor_delegations（真实 schema 从未存在，真库 clearExisting
 * 必炸——V2.analyze 夹具手建此表把雷盖住，真迁移守卫测试当场揭穿）、
 * 漏新名 resource_templates（清库后残留旧模板）。
 *
 * 表集以真实迁移 schema 为准；顺序=依赖逆序。场景切片表
 * （scenario_project_assignments/phases）不在此列——那是场景语义，
 * V2 按选定场景范围清，见 clearExistingDataInTransaction。
 */
export const IMPORT_CLEAR_TABLES: readonly string[] = [
  'project_assignments',
  'demand_overrides',
  'person_availability_overrides',
  // 046 改名:standard_allocations → resource_templates
  'resource_templates',
  'project_phases_timeline',
  'role_planners',
  'project_planners',
  'person_roles',
  'projects',
  'people',
  'roles',
  'project_phases',
  'project_types',
  'locations'
];
