/**
 * 分配日期刷新服务（I02a/D18 路线 B 重写，2026-11-12）。
 *
 * 旧版（已删除）读/写已退役旧表 project_assignments、零生产调用、内联
 * `||100` 缺省——D18 裁决路线 B：重写并接线**场景切片轨**
 * （scenario_project_assignments）的 computed_start_date/computed_end_date。
 *
 * 约束（backend-review 设计评审 Q1-Q10 裁决）：
 * - 触发面：阶段时间线/项目 aspiration 的写路径（见各控制器接线）；分配
 *   写路径自身用共享原语计算并落库（AssignmentsController）。
 * - 事务：调用方可传 {trx} 与外层写同事务（单连接池 max:1，禁止事务内另取
 *   连接——I01y 复刻教训）；不传时自建事务。
 * - 范围：全部场景副本（全局 timeline/aspiration 是唯一计算源；分支
 *   scenario_project_phases 只是比较/合并元数据），含 paused 行（派生事实）。
 * - 删除引用：被 phase 模式分配引用的 timeline 行由调用方 409 阻止；
 *   本服务对缺失 timeline 的孤儿行**跳过**（不写 NULL——NULL 在利用率
 *   视图里等价"无边界全窗"，会永久虚增负荷）。
 * - project 模式严格口径：aspiration 起止不完整 → 跳过（幂等，见原语）。
 * - 只写变化行；不 bump version、不更新 updated_at（派生列刷新不制造并发
 *   编辑冲突）。审计由调用方在**事务提交后**逐条 await logAuditEvent。
 */
import type { Knex } from 'knex';
import { completeProjectModeDates } from './calc/assignmentDates.js';

export interface AssignmentDateChange {
  assignment_id: string;
  scenario_id: string;
  person_id: string;
  old: { start: string | null; end: string | null };
  new: { start: string | null; end: string | null };
  reason: 'phase_timeline' | 'project_aspiration';
}

export class AssignmentRecalculationService {
  constructor(private db: Knex) {}

  /**
   * 阶段时间线变化后刷新：phase 模式分配（全部场景/状态）的 computed 跟随
   * 对应阶段的新起止。返回实际变更行（供审计/测试）。
   */
  async recalculateForPhaseTimelineChange(
    projectId: string,
    phaseIds: string[],
    opts: { trx?: Knex.Transaction } = {}
  ): Promise<AssignmentDateChange[]> {
    if (!phaseIds.length) return [];
    const run = async (conn: any): Promise<AssignmentDateChange[]> => {
      const rows = await conn('scenario_project_assignments')
        .where({ project_id: projectId, assignment_date_mode: 'phase' })
        .whereIn('phase_id', phaseIds)
        .select('id', 'scenario_id', 'person_id', 'phase_id', 'computed_start_date', 'computed_end_date');
      if (!rows.length) return [];

      // phase 在新时间线里的映射（project_id+phase_id 唯一，迁移 060）
      const timelines = await conn('project_phases_timeline')
        .where('project_id', projectId)
        .whereIn('phase_id', phaseIds)
        .select('phase_id', 'start_date', 'end_date');
      const byPhase = new Map<string, { start_date: string; end_date: string }>(
        timelines.map((t: any) => [String(t.phase_id), t])
      );

      const changes: AssignmentDateChange[] = [];
      for (const row of rows as any[]) {
        const timeline = byPhase.get(String(row.phase_id));
        if (!timeline) continue; // 孤儿行：不写 NULL（见文件头），跳过
        const nextStart = timeline.start_date ?? null;
        const nextEnd = timeline.end_date ?? null;
        if (row.computed_start_date === nextStart && row.computed_end_date === nextEnd) continue;
        changes.push({
          assignment_id: String(row.id),
          scenario_id: String(row.scenario_id),
          person_id: String(row.person_id),
          old: { start: row.computed_start_date ?? null, end: row.computed_end_date ?? null },
          new: { start: nextStart, end: nextEnd },
          reason: 'phase_timeline',
        });
      }

      // I02j/P2-5：同一日期对的变化行合并为一条 UPDATE（场景副本×分配行
      // 共享同一阶段日期；逐行 N+1 会在多场景下放大事务持锁时间）
      const groups = new Map<string, { start: string | null; end: string | null; ids: string[] }>();
      for (const change of changes) {
        const key = `${change.new.start ?? ''}|${change.new.end ?? ''}`;
        if (!groups.has(key)) {
          groups.set(key, { start: change.new.start, end: change.new.end, ids: [] });
        }
        groups.get(key)!.ids.push(change.assignment_id);
      }
      for (const group of groups.values()) {
        await conn('scenario_project_assignments')
          .whereIn('id', group.ids)
          .update({
            computed_start_date: group.start,
            computed_end_date: group.end,
          });
      }
      return changes;
    };

    return opts.trx ? run(opts.trx) : this.db.transaction(run);
  }

  /**
   * 项目 aspiration 日期变化后刷新：project 模式分配（全部场景/状态）的
   * computed 跟随新 aspiration。aspiration 不完整时跳过（严格幂等口径）。
   */
  async recalculateForProjectDateChange(
    projectId: string,
    opts: { trx?: Knex.Transaction } = {}
  ): Promise<AssignmentDateChange[]> {
    const run = async (conn: any): Promise<AssignmentDateChange[]> => {
      const next = await completeProjectModeDates(conn, projectId);
      if (!next) return [];

      const rows = await conn('scenario_project_assignments')
        .where({ project_id: projectId, assignment_date_mode: 'project' })
        .select('id', 'scenario_id', 'person_id', 'computed_start_date', 'computed_end_date');
      const changes: AssignmentDateChange[] = [];
      for (const row of rows as any[]) {
        if (
          row.computed_start_date === next.computed_start_date &&
          row.computed_end_date === next.computed_end_date
        ) {
          continue;
        }
        changes.push({
          assignment_id: String(row.id),
          scenario_id: String(row.scenario_id),
          person_id: String(row.person_id),
          old: { start: row.computed_start_date ?? null, end: row.computed_end_date ?? null },
          new: { start: next.computed_start_date ?? null, end: next.computed_end_date ?? null },
          reason: 'project_aspiration',
        });
      }
      // I02j/P2-5：同一日期对的变化行合并为一条 UPDATE（场景副本×分配行
      // 共享同一阶段日期；逐行 N+1 会在多场景下放大事务持锁时间）
      const groups = new Map<string, { start: string | null; end: string | null; ids: string[] }>();
      for (const change of changes) {
        const key = `${change.new.start ?? ''}|${change.new.end ?? ''}`;
        if (!groups.has(key)) {
          groups.set(key, { start: change.new.start, end: change.new.end, ids: [] });
        }
        groups.get(key)!.ids.push(change.assignment_id);
      }
      for (const group of groups.values()) {
        await conn('scenario_project_assignments')
          .whereIn('id', group.ids)
          .update({
            computed_start_date: group.start,
            computed_end_date: group.end,
          });
      }
      return changes;
    };

    return opts.trx ? run(opts.trx) : this.db.transaction(run);
  }
}
