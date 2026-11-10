/**
 * projectTypeValidation —— 类型↔子类型配对校验单一真相。
 *
 * I01（2026-11-10）从 ProjectsController 私有方法抽取：create/update 与
 * IntakeConversionService（收件箱分流）共用同一校验，避免控制器互调或
 * 双份漂移。行为与原实现逐字一致（错误消息不变——既有测试断言依赖）。
 */

/** db: knex / AuditedDatabase（查询构造器兼容即可，本函数只读） */
export async function validateProjectSubType(
  db: any,
  projectTypeId: string,
  projectSubTypeId: string
): Promise<void> {
  // Project sub-type is now mandatory
  if (!projectSubTypeId) {
    throw new Error('Project sub-type is required for all projects');
  }

  // Check if project type exists
  const projectType = await db('project_types')
    .select('id', 'name')
    .where('id', projectTypeId)
    .first();

  if (!projectType) {
    throw new Error(`Project type with ID ${projectTypeId} not found`);
  }

  // Validate the project sub-type
  const projectSubType = await db('project_sub_types')
    .select('id', 'name', 'project_type_id', 'is_active')
    .where('id', projectSubTypeId)
    .first();

  if (!projectSubType) {
    throw new Error(`Project sub-type with ID ${projectSubTypeId} not found`);
  }

  if (projectSubType.project_type_id !== projectTypeId) {
    throw new Error(`Project sub-type "${projectSubType.name}" does not belong to project type "${projectType.name}"`);
  }

  if (!projectSubType.is_active) {
    throw new Error(`Project sub-type "${projectSubType.name}" is not active`);
  }
}
