/**
 * 分配日期计算原语（I02a/D18 路线 B）。
 *
 * 单一真相：fixed→start/end；phase→项目阶段时间线；project→项目 aspiration
 * 日期（缺省回退，见下）。AssignmentsController 写路径与
 * AssignmentRecalculationService 刷新路径**共用本原语**，禁止两处各写一份
 * （EXP-B11：只改点名行=新旧口径并存）。
 *
 * 迁移自 AssignmentsController.computeAssignmentDates（2026-11 全量迁移），
 * 行为保持：
 * - phase 模式缺时间线 → 抛错（写路径 400/500；刷新路径跳过该行）
 * - project 模式 aspiration 不完整 → 回退项目 start/end → 回退分配自身
 *   start/end → 回退今天/+90 天（只用于**新建**；刷新路径用
 *   completeProjectModeDates 的严格口径，避免跨日漂移）
 * - 日期串一律本地日历日（toISODateLocal，EXP-B02：toISOString 的 UTC
 *   位移会让本地零点倒退一天）
 */
import { logger } from '../logging/config.js';
import { toISODateLocal } from '../../utils/isoDate.js';

export interface AssignmentDateInput {
  assignment_date_mode?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  phase_id?: string | null;
  project_id: string;
  project?: {
    name?: string;
    aspiration_start?: string | null;
    aspiration_finish?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
}

export interface ComputedAssignmentDates {
  computed_start_date?: string | null;
  computed_end_date?: string | null;
}

/** 写路径口径（含回退；与迁移前逐分支等价） */
export async function computeAssignmentDates(
  conn: any,
  assignment: AssignmentDateInput
): Promise<ComputedAssignmentDates> {
  const mode = assignment.assignment_date_mode || 'fixed';

  switch (mode) {
    case 'fixed':
      return {
        computed_start_date: assignment.start_date ?? null,
        computed_end_date: assignment.end_date ?? null,
      };

    case 'phase': {
      if (!assignment.phase_id || !assignment.project_id) {
        throw new Error('Phase mode requires both phase_id and project_id');
      }
      const phaseTimeline = await conn('project_phases_timeline')
        .where('project_id', assignment.project_id)
        .where('phase_id', assignment.phase_id)
        .first();
      if (!phaseTimeline) {
        throw new Error(
          `No timeline found for phase ${assignment.phase_id} in project ${assignment.project_id}`
        );
      }
      return {
        computed_start_date: phaseTimeline.start_date,
        computed_end_date: phaseTimeline.end_date,
      };
    }

    case 'project': {
      if (!assignment.project_id) {
        throw new Error('Project mode requires project_id');
      }
      let project = assignment.project;
      if (!project) {
        project = await conn('projects').where('id', assignment.project_id).first();
        if (!project) {
          throw new Error(`Project ${assignment.project_id} not found`);
        }
      }
      // projects 表实际只有 aspiration 列；start_date/end_date 为历史形状兼容
      const startDate = project.aspiration_start || project.start_date;
      const endDate = project.aspiration_finish || project.end_date;
      if (!startDate || !endDate) {
        logger.warn(
          'Project missing both aspiration and start/end dates, using assignment dates as fallback',
          { projectId: assignment.project_id, projectName: project.name || 'Unknown' }
        );
        const fallbackStartDate = assignment.start_date || toISODateLocal(new Date());
        const fallbackEndDate =
          assignment.end_date ||
          toISODateLocal(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
        return {
          computed_start_date: fallbackStartDate,
          computed_end_date: fallbackEndDate,
        };
      }
      return { computed_start_date: startDate, computed_end_date: endDate };
    }

    default:
      throw new Error(`Unknown assignment_date_mode: ${mode}`);
  }
}

/**
 * 刷新路径的 project 模式口径（严格、幂等）：aspiration 起止都在才返回；
 * 否则返回 null 表示"跳过该行刷新"（不能按写路径的 today+90 回退——那会让
 * 同一条分配每过一天刷新就平移一次，永不幂等）。
 */
export async function completeProjectModeDates(
  conn: any,
  projectId: string
): Promise<ComputedAssignmentDates | null> {
  const project = await conn('projects').where('id', projectId).first();
  if (!project?.aspiration_start || !project?.aspiration_finish) return null;
  return {
    computed_start_date: project.aspiration_start,
    computed_end_date: project.aspiration_finish,
  };
}
