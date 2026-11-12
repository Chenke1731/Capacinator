/**
 * IntakeConversionService —— 收件箱分流转换事务（I01，2026-11-10 设计稿 §4.2/§4.3）。
 *
 * 事务步骤（任一失败整体回滚，不留僵尸项目）：
 *  1. 取 intake（不存在 404；非 new 409）
 *  2. validateProjectSubType（共享原语）
 *  3. INSERT projects（含 aspiration/external_number/priority/lifecycle_state）
 *  4. 需求类类型 → pending_rat + project_lifecycle_events(note=from intake <id>)
 *  5. 有 expected_start → inheritProjectPhases（锚定开始日）；无 → 不建阶段
 *  6. 条件更新 demand_intake WHERE status='new'（双击/并发 → 409）
 *
 * 不造假日期：无开始日 → baseline='unset'（no_expected_start）；
 * 类型无模板 → no_template。阶段末日晚于期望完成日 → 非阻塞 warning。
 */
import { validateProjectSubType } from '../projects/projectTypeValidation.js';
import { inheritProjectPhases } from '../projects/phaseInheritance.js';
import { IntakeError, extractExternalNumber } from './IntakeService.js';
import type {
  DemandIntake,
  IntakeConvertInput,
  IntakeConvertResult,
} from '../../../../shared/types/intake.js';
import { isLifecycleTypeName } from '../../../../shared/types/lifecycle.js';

const MAX_TITLE = 255;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const nowIso = (): string => new Date().toISOString();

function isoDateOrNull(raw: unknown, field: string): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  if (!ISO_DATE.test(s)) {
    throw new IntakeError(`${field} must be YYYY-MM-DD (got "${s}")`, 400, 'validation_error');
  }
  return s;
}

export class IntakeConversionService {
  constructor(private db: any) {}

  async convert(
    id: string,
    input: IntakeConvertInput,
    actorId?: string | null
  ): Promise<IntakeConvertResult> {
    // 载荷级校验（事务外，失败零副作用）
    if (!input?.project_type_id || !input?.project_sub_type_id) {
      throw new IntakeError('project_type_id and project_sub_type_id are required', 400, 'validation_error');
    }
    let priority: number;
    if (input.priority !== undefined && input.priority !== null) {
      priority = Number(input.priority);
      if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
        throw new IntakeError('priority must be an integer 1-5', 400, 'validation_error');
      }
    } else {
      priority = 3;
    }
    const inStart = isoDateOrNull(input.expected_start ?? null, 'expected_start');
    const inFinish = isoDateOrNull(input.expected_finish ?? null, 'expected_finish');
    if (inStart && inFinish && inStart > inFinish) {
      throw new IntakeError('expected_start must be <= expected_finish', 400, 'validation_error');
    }

    return this.db.transaction(async (trx: any): Promise<IntakeConvertResult> => {
      // 1. 取收件箱条目
      const intake = await trx('demand_intake').where('id', id).first();
      if (!intake) throw new IntakeError('Intake not found', 404, 'not_found');
      if (intake.status !== 'new') {
        throw new IntakeError(
          `Intake is ${intake.status} and cannot be converted` +
            (intake.converted_project_id ? ` (already project ${intake.converted_project_id})` : ''),
          409,
          'invalid_status'
        );
      }

      // 2. 类型/子类型配对校验（共享原语；Error → 400）
      try {
        await validateProjectSubType(trx, input.project_type_id, input.project_sub_type_id);
      } catch (error) {
        throw new IntakeError(error instanceof Error ? error.message : 'Invalid project type/sub-type', 400, 'invalid_type');
      }
      const subType = await trx('project_sub_types').where('id', input.project_sub_type_id).first();
      const projectTypeId: string = subType.project_type_id;
      const typeRow = await trx('project_types').where('id', projectTypeId).first();
      const typeName: string | null = typeRow?.name ?? null;
      const lifecycleEnabled = isLifecycleTypeName(typeName);

      // I02h/U24（D6）：可选挂接迭代——仅生命周期类型允许（非生命周期项目不进
      // 迭代卡统计，挂接会造成"卡头 0 项、展开有行"）；存在性用 trx 查，
      // 不依赖 FK（FK 冲突会变 500，评审 D1）
      const iterationIdRaw = input.iteration_id as unknown;
      if (iterationIdRaw !== undefined && iterationIdRaw !== null && typeof iterationIdRaw !== 'string') {
        throw new IntakeError('iteration_id must be a string or null', 400, 'invalid_iteration');
      }
      const iterationId = iterationIdRaw ? String(iterationIdRaw) : null;
      if (iterationId) {
        if (!lifecycleEnabled) {
          throw new IntakeError('Iterations apply only to lifecycle project types', 400, 'invalid_iteration');
        }
        const iteration = await trx('iterations').where('id', iterationId).first();
        if (!iteration) {
          throw new IntakeError('Iteration not found', 400, 'invalid_iteration');
        }
      }

      // 3. 生效字段（载荷优先，回落收件箱值）
      let title: string = intake.title;
      if (input.title !== undefined && input.title !== null && String(input.title).trim()) {
        const trimmed = String(input.title).trim();
        title = trimmed.length > MAX_TITLE ? trimmed.slice(0, MAX_TITLE) : trimmed;
      }
      const effectivePriority = input.priority !== undefined && input.priority !== null ? priority : (intake.priority_hint ?? 3);
      const expected_start = inStart ?? (intake.expected_start ?? null);
      const expected_finish = inFinish ?? (intake.expected_finish ?? null);
      if (expected_start && expected_finish && expected_start > expected_finish) {
        throw new IntakeError('expected_start must be <= expected_finish', 400, 'validation_error');
      }

      const description = [intake.raw_text, intake.note]
        .map((s: unknown) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
        .join('\n\n') || null;
      const externalNumber = extractExternalNumber(intake.source_ref);

      // 4. 建项目
      const projectId = `project-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const maxRow = (await trx('projects').max('seq_number as maxSeq').first()) ?? { maxSeq: null };
      const project = {
        id: projectId,
        seq_number: Number(maxRow.maxSeq ?? 0) + 1,
        name: title,
        description,
        project_type_id: projectTypeId,
        project_sub_type_id: input.project_sub_type_id,
        priority: effectivePriority,
        owner_id: input.owner_id ?? null,
        include_in_demand: 1,
        aspiration_start: expected_start,
        aspiration_finish: expected_finish,
        external_number: externalNumber,
        iteration_id: iterationId,
        lifecycle_state: lifecycleEnabled ? 'pending_rat' : null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      await trx('projects').insert(project);

      // 5. 生命周期事件（需求类从 pending_rat 起步，事件可追溯来源）
      if (lifecycleEnabled) {
        await trx('project_lifecycle_events').insert({
          project_id: projectId,
          from_state: null,
          to_state: 'pending_rat',
          note: `from intake ${id}`,
          actor: actorId ?? null,
          created_at: nowIso(),
        });
      }

      // 6. 初版交付基线：有期望开始日才生成（杜绝"从今天起算"）
      let phase_count = 0;
      let baseline: 'set' | 'unset' = 'unset';
      let baseline_reason: 'no_expected_start' | 'no_template' | null = 'no_expected_start';
      const baseline_warnings: string[] = [];
      if (expected_start) {
        phase_count = await inheritProjectPhases(this.db, projectId, projectTypeId, trx);
        if (phase_count > 0) {
          baseline = 'set';
          baseline_reason = null;
          if (expected_finish) {
            const lastRow =
              (await trx('project_phases_timeline')
                .where('project_id', projectId)
                .max('end_date as lastEnd')
                .first()) ?? { lastEnd: null };
            // ISO 字符串存储，字典序即时间序（dateText 契约）
            if (lastRow?.lastEnd && String(lastRow.lastEnd).slice(0, 10) > expected_finish) {
              baseline_warnings.push('phase_extends_beyond_expected_finish');
            }
          }
        } else {
          baseline_reason = 'no_template';
        }
      }

      // 7. 条件更新认领（双击/并发：第二次 changes=0 → 409，事务回滚不留双项目）
      const titleChanged = title !== intake.title;
      const changed = await trx('demand_intake')
        .where({ id, status: 'new' })
        .update({
          status: 'converted',
          converted_project_id: projectId,
          converted_at: nowIso(),
          updated_at: nowIso(),
          ...(titleChanged ? { title } : {}),
        });
      if (changed === 0) {
        throw new IntakeError('Intake already converted (concurrent call)', 409, 'invalid_status');
      }

      const freshProject = await trx('projects').where('id', projectId).first();
      const freshIntake: DemandIntake = await trx('demand_intake').where('id', id).first();

      return {
        project: freshProject,
        intake: freshIntake,
        baseline,
        baseline_reason,
        phase_count,
        external_number_linked: externalNumber,
        baseline_warnings,
      };
    });
  }
}
