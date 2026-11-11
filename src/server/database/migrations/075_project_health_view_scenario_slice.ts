import { Knex } from 'knex';

/**
 * I01z（2026-11-11）：project_health_view 重定义为场景切片口径。
 *
 * 006 版只聚合旧表 project_assignments（运行时 0 行，仅 V2 导入/恢复库有数据）
 * → 正常 spa 轨数据下项目分配健康恒 UNASSIGNED、缺口报表 criticalProjectGaps
 * 全量误标（Codex 复评补充项）。本迁移把分配聚合改读
 * effective_project_assignments 的 baseline 切片（scenario_id IS NULL 旧表轨道
 * OR baseline 场景——与 070 人员视图/需求报表同语义），列结构与阈值不变。
 *
 * 口径说明：
 * - 分支场景不影响本视图（视图无场景参数）——报表读侧缺省即 baseline，
 *   口径一致；分支视角的项目健康属后续能力，不在本迁移。
 * - assigned_people_count 改为 COUNT(DISTINCT person_id)（列名语义=人数；
 *   006 版实为分配行数）；unique_roles_assigned 改为 COUNT(DISTINCT role_id)
 *   （分配上的角色；006 版数的是人员角色成员资格）。两列当前无 UI/服务消费者
 *   （grep 核实），语义修正无破坏面。
 * - health_status 与 allocation_health 阈值（>100/>=80/>=40/>0）保持 006 原样。
 */
const BASELINE_SCENARIO_ID = 'baseline-0000-0000-0000-000000000000';

export async function up(knex: Knex): Promise<void> {
  console.log('Rebuilding project_health_view (baseline scenario slice, I01z)...');
  await knex.raw('DROP VIEW IF EXISTS project_health_view');

  await knex.raw(`
    CREATE VIEW project_health_view AS
    SELECT
      p.id as project_id,
      p.name as project_name,
      p.description as project_description,
      p.priority,
      p.aspiration_start,
      p.aspiration_finish,
      pt.name as project_type,
      pst.name as project_sub_type,
      l.name as location,
      CASE
        WHEN p.aspiration_finish < date('now') THEN 'COMPLETED'
        WHEN p.aspiration_start > date('now') THEN 'PLANNED'
        WHEN p.aspiration_start <= date('now') AND p.aspiration_finish >= date('now') THEN 'ACTIVE'
        ELSE 'UNKNOWN'
      END as health_status,
      CASE
        WHEN total_allocation.allocation_sum > 100 THEN 'OVER_ALLOCATED'
        WHEN total_allocation.allocation_sum >= 80 THEN 'FULLY_ALLOCATED'
        WHEN total_allocation.allocation_sum >= 40 THEN 'PARTIALLY_ALLOCATED'
        WHEN total_allocation.allocation_sum > 0 THEN 'UNDER_ALLOCATED'
        ELSE 'UNASSIGNED'
      END as allocation_health,
      COALESCE(total_allocation.allocation_sum, 0) as total_allocation_percentage,
      COALESCE(total_allocation.people_count, 0) as assigned_people_count,
      COALESCE(total_allocation.unique_roles, 0) as unique_roles_assigned
    FROM projects p
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    LEFT JOIN project_sub_types pst ON p.project_sub_type_id = pst.id
    LEFT JOIN locations l ON p.location_id = l.id
    LEFT JOIN (
      -- baseline 切片：旧表轨道（scenario_id IS NULL）+ baseline 场景分配；
      -- 分支场景行不计入（与 070 person_utilization_view 同语义）
      SELECT
        epa.project_id,
        SUM(epa.allocation_percentage) as allocation_sum,
        COUNT(DISTINCT epa.person_id) as people_count,
        COUNT(DISTINCT epa.role_id) as unique_roles
      FROM effective_project_assignments epa
      WHERE epa.scenario_id IS NULL
         OR epa.scenario_id = '${BASELINE_SCENARIO_ID}'
      GROUP BY epa.project_id
    ) total_allocation ON p.id = total_allocation.project_id
    ORDER BY p.priority DESC, p.aspiration_start
  `);

  console.log('✅ project_health_view rebuilt (scenario-sliced)');
}

export async function down(knex: Knex): Promise<void> {
  // 还原 006 版（只读旧表 project_assignments）——仅保迁移可逆，语义不推荐
  console.log('Reverting project_health_view to legacy (006) definition...');
  await knex.raw('DROP VIEW IF EXISTS project_health_view');

  await knex.raw(`
    CREATE VIEW project_health_view AS
    SELECT
      p.id as project_id,
      p.name as project_name,
      p.description as project_description,
      p.priority,
      p.aspiration_start,
      p.aspiration_finish,
      pt.name as project_type,
      pst.name as project_sub_type,
      l.name as location,
      CASE
        WHEN p.aspiration_finish < date('now') THEN 'COMPLETED'
        WHEN p.aspiration_start > date('now') THEN 'PLANNED'
        WHEN p.aspiration_start <= date('now') AND p.aspiration_finish >= date('now') THEN 'ACTIVE'
        ELSE 'UNKNOWN'
      END as health_status,
      CASE
        WHEN total_allocation.allocation_sum > 100 THEN 'OVER_ALLOCATED'
        WHEN total_allocation.allocation_sum >= 80 THEN 'FULLY_ALLOCATED'
        WHEN total_allocation.allocation_sum >= 40 THEN 'PARTIALLY_ALLOCATED'
        WHEN total_allocation.allocation_sum > 0 THEN 'UNDER_ALLOCATED'
        ELSE 'UNASSIGNED'
      END as allocation_health,
      COALESCE(total_allocation.allocation_sum, 0) as total_allocation_percentage,
      COALESCE(assignment_counts.assignment_count, 0) as assigned_people_count,
      COALESCE(assignment_counts.unique_roles, 0) as unique_roles_assigned
    FROM projects p
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    LEFT JOIN project_sub_types pst ON p.project_sub_type_id = pst.id
    LEFT JOIN locations l ON p.location_id = l.id
    LEFT JOIN (
      SELECT
        project_id,
        SUM(allocation_percentage) as allocation_sum
      FROM project_assignments
      GROUP BY project_id
    ) total_allocation ON p.id = total_allocation.project_id
    LEFT JOIN (
      SELECT
        pa.project_id,
        COUNT(pa.id) as assignment_count,
        COUNT(DISTINCT pr.role_id) as unique_roles
      FROM project_assignments pa
      LEFT JOIN person_roles pr ON pa.person_id = pr.person_id
      GROUP BY pa.project_id
    ) assignment_counts ON p.id = assignment_counts.project_id
    ORDER BY p.priority DESC, p.aspiration_start
  `);

  console.log('✅ project_health_view reverted to 006 definition');
}
