/**
 * phaseInheritance —— 类型模板阶段继承单一真相。
 *
 * I01（2026-11-10）从 ProjectsController 私有方法抽取：ProjectsController.create
 * 与 IntakeConversionService（收件箱分流建基线）共用。行为与原实现逐字一致：
 * - 无模板阶段 → 不插入（返回 0）；
 * - 阶段起点 = 项目 aspiration_start，缺失用 now（转换路径必须先写
 *   aspiration_start 再调用，否则会得到"从今天起算"的假基线——I01 的
 *   收件箱转换因此显式约定：无期望开始日就不调用本函数）；
 * - 失败 re-throw（原注释语义：阶段继承失败必须让创建整体失败）。
 *
 * 返回值：插入的 timeline 条数（供转换响应的 phase_count）。
 */
import { toIsoDateString } from '../../utils/isoDate.js';
import { logger } from '../logging/config.js';

/** db: knex / AuditedDatabase；trx 存在时同事务提交 */
export async function inheritProjectPhases(
  db: any,
  projectId: string,
  projectTypeId: string,
  trx?: any
): Promise<number> {
  // 可选事务句柄(2026-10-13): create 主链入事务后,阶段继承同事务提交
  const conn = trx ?? db;
  try {
    // Get all template phases for the project type with enhanced template data
    const projectTypePhases = await conn('project_type_phases')
      .select(
        'project_type_phases.id as template_phase_id',
        'project_type_phases.order_index',
        'project_type_phases.is_mandatory',
        'project_type_phases.min_duration_days',
        'project_type_phases.max_duration_days',
        'project_type_phases.default_duration_days',
        'project_type_phases.is_locked_order',
        'project_type_phases.template_description',
        'project_phases.id as phase_id',
        'project_phases.name as phase_name'
      )
      .leftJoin('project_phases', 'project_type_phases.phase_id', 'project_phases.id')
      .where('project_type_phases.project_type_id', projectTypeId)
      .orderBy('project_type_phases.order_index');

    if (projectTypePhases.length === 0) {
      // No template phases defined for this project type
      return 0;
    }

    // Get project aspiration dates for phase date calculation
    const project = await conn('projects')
      .select('aspiration_start', 'aspiration_finish')
      .where('id', projectId)
      .first();

    // Calculate phase dates using template durations when available
    const now = new Date();
    const projectStart = project?.aspiration_start ? new Date(project.aspiration_start) : now;
    // Note: projectEnd can be used for future phase date validation

    let currentDate = new Date(projectStart);

    // Create timeline entries for each template phase
    const timelineEntries = projectTypePhases.map((templatePhase: Record<string, any>, index: number) => {
      // I01v/D17：nullish 而非 ||——显式 0 天=零时长里程碑（合法），只有
      // null/undefined 才缺省 30（B05/EXP-B05 族：|| 静默吞合法 0 值）
      const phaseDurationDays = templatePhase.default_duration_days ?? 30;
      const phaseStart = new Date(currentDate);
      const phaseEnd = new Date(currentDate.getTime() + (phaseDurationDays * 24 * 60 * 60 * 1000));

      // Move currentDate to start of next phase
      currentDate = new Date(phaseEnd);

      return {
        id: `phase-timeline-${projectId}-${templatePhase.phase_id}-${Date.now()}-${index}`,
        project_id: projectId,
        phase_id: templatePhase.phase_id,
        // ISO date strings — the canonical column format; epoch-ms numbers
        // break every string comparison downstream (e.g. dashboard stats)
        start_date: toIsoDateString(phaseStart),
        end_date: toIsoDateString(phaseEnd),
        // Template tracking fields from new schema
        phase_source: 'template',
        template_phase_id: templatePhase.template_phase_id,
        is_deletable: !templatePhase.is_mandatory,
        original_duration_days: templatePhase.default_duration_days,
        template_min_duration_days: templatePhase.min_duration_days,
        template_max_duration_days: templatePhase.max_duration_days,
        is_duration_customized: false,
        is_name_customized: false,
        template_compliance_data: JSON.stringify({
          is_mandatory: templatePhase.is_mandatory,
          is_locked_order: templatePhase.is_locked_order,
          template_description: templatePhase.template_description,
          inherited_at: new Date().toISOString()
        }),
        created_at: new Date(),
        updated_at: new Date()
      };
    });

    // Insert all template phase timeline entries
    if (timelineEntries.length > 0) {
      await conn('project_phases_timeline').insert(timelineEntries);
    }

    // Log successful template inheritance for audit
    logger.info('Successfully inherited template phases for project', { count: timelineEntries.length, projectId, projectTypeId });

    return timelineEntries.length;
  } catch (error) {
    // Log the error but don't fail project creation
    logger.error('Failed to inherit template phases for project', error instanceof Error ? error : undefined, { projectId });
    throw error; // Re-throw to ensure project creation fails if template inheritance fails
  }
}
