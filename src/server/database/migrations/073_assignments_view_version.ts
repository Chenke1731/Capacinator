import type { Knex } from 'knex';

/**
 * assignments_view 补 version 列（Codex 2026-10-17 复审，乐观锁断链）。
 *
 * 072 给三表加了 version（乐观锁令牌），但分配列表读取的
 * assignments_view（两支 UNION：scenario 轨 spa / direct 轨 pa）没有透出
 * version——页面 row.version 恒为 undefined，提交 expected_version 落空，
 * 服务端锁永远走"无令牌兼容路径"。**乐观锁在分配页形同虚设**。
 * 本迁移重建视图，两支各透出本表 version。
 */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS assignments_view');
  await knex.raw(`
    CREATE VIEW assignments_view AS
    SELECT
      'spa-' || spa.id AS id,
      spa.project_id,
      spa.person_id,
      spa.role_id,
      spa.phase_id,
      spa.allocation_percentage,
      spa.assignment_date_mode,
      spa.start_date,
      spa.end_date,
      spa.notes,
      spa.created_at,
      spa.updated_at,
      COALESCE(spa.computed_start_date, spa.start_date) AS computed_start_date,
      COALESCE(spa.computed_end_date, spa.end_date) AS computed_end_date,
      'scenario' AS assignment_type,
      spa.scenario_id,
      s.name AS scenario_name,
      s.scenario_type,
      spa.status AS status,
      spa.version AS version
    FROM scenario_project_assignments spa
    JOIN scenarios s ON spa.scenario_id = s.id
    WHERE s.status = 'active'

    UNION ALL

    SELECT
      pa.id,
      pa.project_id,
      pa.person_id,
      pa.role_id,
      pa.phase_id,
      pa.allocation_percentage,
      pa.assignment_date_mode,
      pa.start_date,
      pa.end_date,
      pa.notes,
      pa.created_at,
      pa.updated_at,
      COALESCE(pa.computed_start_date, pa.start_date) AS computed_start_date,
      COALESCE(pa.computed_end_date, pa.end_date) AS computed_end_date,
      'direct' AS assignment_type,
      'baseline-0000-0000-0000-000000000000' AS scenario_id,
      'Baseline' AS scenario_name,
      'baseline' AS scenario_type,
      pa.status AS status,
      pa.version AS version
    FROM project_assignments pa
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 回滚:视图退回无 version 形态(072 之前的列集)——仅形态回退,表列仍在
  await knex.raw('DROP VIEW IF EXISTS assignments_view');
  await knex.raw(`
    CREATE VIEW assignments_view AS
    SELECT
      'spa-' || spa.id AS id,
      spa.project_id,
      spa.person_id,
      spa.role_id,
      spa.phase_id,
      spa.allocation_percentage,
      spa.assignment_date_mode,
      spa.start_date,
      spa.end_date,
      spa.notes,
      spa.created_at,
      spa.updated_at,
      COALESCE(spa.computed_start_date, spa.start_date) AS computed_start_date,
      COALESCE(spa.computed_end_date, spa.end_date) AS computed_end_date,
      'scenario' AS assignment_type,
      spa.scenario_id,
      s.name AS scenario_name,
      s.scenario_type,
      spa.status AS status
    FROM scenario_project_assignments spa
    JOIN scenarios s ON spa.scenario_id = s.id
    WHERE s.status = 'active'

    UNION ALL

    SELECT
      pa.id,
      pa.project_id,
      pa.person_id,
      pa.role_id,
      pa.phase_id,
      pa.allocation_percentage,
      pa.assignment_date_mode,
      pa.start_date,
      pa.end_date,
      pa.notes,
      pa.created_at,
      pa.updated_at,
      COALESCE(pa.computed_start_date, pa.start_date) AS computed_start_date,
      COALESCE(pa.computed_end_date, pa.end_date) AS computed_end_date,
      'direct' AS assignment_type,
      'baseline-0000-0000-0000-000000000000' AS scenario_id,
      'Baseline' AS scenario_name,
      'baseline' AS scenario_type,
      pa.status AS status
    FROM project_assignments pa
  `);
}
