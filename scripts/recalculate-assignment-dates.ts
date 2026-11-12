#!/usr/bin/env tsx
/**
 * Q10 / I02a：一次性回填脚本——按调度输入（阶段时间线 / 项目 aspiration）
 * 重算 scenario_project_assignments.computed_start_date/computed_end_date。
 *
 * 背景：D18 路线 B 之前，AssignmentsController.update 计算了 computed 但未
 * 落库（P0 F1），存量行自 2026-10-22 起可能与阶段/项目日期漂移。本脚本在
 * 上线后跑一次即可；日常写入路径已由 I02a 的刷新接线覆盖，不需要反复执行。
 *
 * 用法：
 *   npx tsx scripts/recalculate-assignment-dates.ts                 # dry-run（默认，事务回滚）
 *   npx tsx scripts/recalculate-assignment-dates.ts --apply         # 落库 + 逐条审计
 *   npx tsx scripts/recalculate-assignment-dates.ts --project <id>  # 只处理一个项目
 *
 * dry-run 在事务内执行全部刷新后主动回滚（不写库、不写审计），输出将变更
 * 的分配明细。apply 在单事务内写入，提交后逐条写 audit_logs（comment 标明
 * 一次性回填），审计失败不回滚已提交的刷新（与 API 提交后审计口径一致）。
 */
import type { Knex } from 'knex';
import { db } from '../src/server/database/index.js';
import { AssignmentRecalculationService, type AssignmentDateChange } from '../src/server/services/AssignmentRecalculationService.js';
import { AuditService } from '../src/server/services/audit/AuditService.js';
import { getAuditConfig } from '../src/server/config/index.js';

class DryRunRollback extends Error {
  constructor() {
    super('dry-run rollback');
  }
}

function parseArgs(argv: string[]) {
  const args = { apply: false, projectId: undefined as string | undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--project') args.projectId = argv[++i];
  }
  return args;
}

function printHelp() {
  console.log(`用法: npx tsx scripts/recalculate-assignment-dates.ts [--apply] [--project <id>]

默认 dry-run（事务内试算后回滚，不写库）。
--apply    提交刷新并逐条写审计
--project  只处理指定项目`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const database = db as unknown as Knex;
  const service = new AssignmentRecalculationService(database);

  const projects = args.projectId
    ? await database('projects').where('id', args.projectId).select('id', 'name')
    : await database('projects').select('id', 'name');

  if (!projects.length) {
    console.log(args.projectId ? `项目 ${args.projectId} 不存在` : '库中没有项目');
    return;
  }

  let changes: AssignmentDateChange[] = [];

  const collect = async (conn: Knex.Transaction) => {
    const collected: AssignmentDateChange[] = [];
    for (const project of projects as Array<{ id: string; name: string }>) {
      const phaseIds = await conn('scenario_project_assignments')
        .where({ project_id: project.id, assignment_date_mode: 'phase' })
        .distinct('phase_id');
      const phaseChanges = await service.recalculateForPhaseTimelineChange(
        project.id,
        (phaseIds as any[]).map((r) => String(r.phase_id)).filter(Boolean),
        { trx: conn }
      );
      const projectChanges = await service.recalculateForProjectDateChange(project.id, { trx: conn });
      const projectAll = [...phaseChanges, ...projectChanges];
      if (projectAll.length) {
        console.log(`  ${project.name}: ${projectAll.length} 行`);
        collected.push(...projectAll);
      }
    }
    return collected;
  };

  if (args.apply) {
    changes = await database.transaction(collect);
    const audit = new AuditService(database, getAuditConfig());
    for (const change of changes) {
      await audit.logChange({
        tableName: 'scenario_project_assignments',
        recordId: change.assignment_id,
        action: 'UPDATE',
        changedBy: 'system:i02a-recalc',
        oldValues: { computed_start_date: change.old.start, computed_end_date: change.old.end },
        newValues: { computed_start_date: change.new.start, computed_end_date: change.new.end },
        comment: `I02a/Q10 one-off recomputation (${change.reason})`,
      });
    }
    console.log(`已提交：${changes.length} 行刷新，${changes.length} 条审计`);
  } else {
    try {
      await database.transaction(async (trx) => {
        changes = await collect(trx);
        throw new DryRunRollback();
      });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
    }
    console.log(`dry-run：${changes.length} 行将刷新（已回滚，未写库/审计）`);
    for (const change of changes) {
      console.log(
        `  ${change.assignment_id} [${change.reason}] ${change.old.start ?? '∅'}..${change.old.end ?? '∅'} → ${change.new.start ?? '∅'}..${change.new.end ?? '∅'}`
      );
    }
    if (changes.length > 0) console.log('确认后加 --apply 提交。');
  }
}

main()
  .catch((error) => {
    console.error('回填失败:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
