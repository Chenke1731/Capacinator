import type { Knex } from 'knex';

/**
 * capacity_gaps_view 可用率覆盖只取已批准行（后端评审 F2 / EXP-B11 第 3 例）。
 *
 * 076 只收口了 person_utilization_view；capacity_gaps_view（055）的
 * role_capacity CTE 仍无 is_approved 过滤——待审批覆盖继续改写角色容量线
 * （实测：待审批 50% 覆盖把 1 FTE/8h 折成 0.5 FTE/4h），与人员页/
 * 工作台时间线的 approved-only 口径互相矛盾。本迁移以 055 的视图定义为
 * 基线，仅给可用率 LEFT JOIN 追加 `av.is_approved = 1`；需求侧（场景
 * 叠加语义）不动。roleGaps 原语的 role_capacity CTE 同批同谓词（D15
 * “原语≡视图逐字一致”承诺两侧同步）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS capacity_gaps_view');
  await knex.raw(`
    CREATE VIEW capacity_gaps_view AS
    WITH role_capacity AS (
      SELECT
        r.id as role_id,
        r.name as role_name,
        COUNT(DISTINCT p.id) as people_count,
        COALESCE(SUM(
          CASE
            WHEN av.availability_percentage IS NOT NULL THEN
              CASE
                WHEN p.worker_type = 'FTE' THEN (av.availability_percentage / 100.0)
                WHEN p.worker_type IN ('Contractor', 'Consultant') THEN (av.availability_percentage / 100.0) * 0.8
                ELSE (av.availability_percentage / 100.0)
              END
            ELSE
              CASE
                WHEN p.worker_type = 'FTE' THEN (p.default_availability_percentage / 100.0)
                WHEN p.worker_type IN ('Contractor', 'Consultant') THEN (p.default_availability_percentage / 100.0) * 0.8
                ELSE (p.default_availability_percentage / 100.0)
              END
          END
        ), 0) as total_capacity_fte,
        COALESCE(SUM(
          p.default_hours_per_day *
          CASE
            WHEN av.availability_percentage IS NOT NULL THEN (av.availability_percentage / 100.0)
            ELSE (p.default_availability_percentage / 100.0)
          END
        ), 0) as total_capacity_hours,
        COUNT(DISTINCT CASE WHEN av.availability_percentage < 100 THEN p.id END) as people_with_reduced_availability
      FROM roles r
      LEFT JOIN person_roles pr ON r.id = pr.role_id
      LEFT JOIN people p ON pr.person_id = p.id AND p.is_active = 1
      LEFT JOIN person_availability_overrides av ON p.id = av.person_id
        AND av.is_approved = 1
        AND av.start_date <= date('now')
        AND av.end_date >= date('now')
      GROUP BY r.id, r.name
    ),
    role_demand AS (
      SELECT
        r.id as role_id,
        COALESCE(a.fte, 0) + COALESCE(pd.fte, 0) as total_demand_fte,
        (COALESCE(a.fte, 0) + COALESCE(pd.fte, 0)) * 8.0 as total_demand_hours
      FROM roles r
      LEFT JOIN (
        SELECT epa.role_id as role_id, SUM(epa.allocation_percentage / 100.0) as fte
        FROM effective_project_assignments epa
        LEFT JOIN scenarios s ON epa.scenario_id = s.id
        WHERE (s.status = 'active' OR epa.scenario_id IS NULL)
        GROUP BY epa.role_id
      ) a ON a.role_id = r.id
      LEFT JOIN (
        SELECT pmd.role_id as role_id, SUM(pmd.headcount) as fte
        FROM project_pool_demands pmd
        WHERE pmd.status = 'open'
        GROUP BY pmd.role_id
      ) pd ON pd.role_id = r.id
    )
    SELECT
      rc.role_id,
      rc.role_name,
      rc.people_count,
      rc.total_capacity_fte,
      rc.total_capacity_hours,
      COALESCE(rd.total_demand_fte, 0) as total_demand_fte,
      COALESCE(rd.total_demand_hours, 0) as total_demand_hours,
      rc.total_capacity_fte - COALESCE(rd.total_demand_fte, 0) as capacity_gap_fte,
      rc.total_capacity_hours - COALESCE(rd.total_demand_hours, 0) as capacity_gap_hours,
      rc.people_with_reduced_availability,
      CASE
        WHEN rc.people_count = 0 AND COALESCE(rd.total_demand_fte, 0) > 0 THEN 'GAP'
        WHEN rc.total_capacity_fte - COALESCE(rd.total_demand_fte, 0) < -0.5 THEN 'GAP'
        WHEN rc.total_capacity_fte - COALESCE(rd.total_demand_fte, 0) < 0 THEN 'TIGHT'
        ELSE 'OK'
      END as status
    FROM role_capacity rc
    LEFT JOIN role_demand rd ON rc.role_id = rd.role_id
    ORDER BY rc.role_name
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 回滚即回到 055 的"未过滤 approved"视图——待审批覆盖重新参与容量线，仅保迁移可逆
  await knex.raw('DROP VIEW IF EXISTS capacity_gaps_view');
  await knex.raw(`
    CREATE VIEW capacity_gaps_view AS
    WITH role_capacity AS (
      SELECT
        r.id as role_id,
        r.name as role_name,
        COUNT(DISTINCT p.id) as people_count,
        COALESCE(SUM(
          CASE
            WHEN av.availability_percentage IS NOT NULL THEN
              CASE
                WHEN p.worker_type = 'FTE' THEN (av.availability_percentage / 100.0)
                WHEN p.worker_type IN ('Contractor', 'Consultant') THEN (av.availability_percentage / 100.0) * 0.8
                ELSE (av.availability_percentage / 100.0)
              END
            ELSE
              CASE
                WHEN p.worker_type = 'FTE' THEN (p.default_availability_percentage / 100.0)
                WHEN p.worker_type IN ('Contractor', 'Consultant') THEN (p.default_availability_percentage / 100.0) * 0.8
                ELSE (p.default_availability_percentage / 100.0)
              END
          END
        ), 0) as total_capacity_fte,
        COALESCE(SUM(
          p.default_hours_per_day *
          CASE
            WHEN av.availability_percentage IS NOT NULL THEN (av.availability_percentage / 100.0)
            ELSE (p.default_availability_percentage / 100.0)
          END
        ), 0) as total_capacity_hours,
        COUNT(DISTINCT CASE WHEN av.availability_percentage < 100 THEN p.id END) as people_with_reduced_availability
      FROM roles r
      LEFT JOIN person_roles pr ON r.id = pr.role_id
      LEFT JOIN people p ON pr.person_id = p.id AND p.is_active = 1
      LEFT JOIN person_availability_overrides av ON p.id = av.person_id
        AND av.start_date <= date('now')
        AND av.end_date >= date('now')
      GROUP BY r.id, r.name
    ),
    role_demand AS (
      SELECT
        r.id as role_id,
        COALESCE(a.fte, 0) + COALESCE(pd.fte, 0) as total_demand_fte,
        (COALESCE(a.fte, 0) + COALESCE(pd.fte, 0)) * 8.0 as total_demand_hours
      FROM roles r
      LEFT JOIN (
        SELECT epa.role_id as role_id, SUM(epa.allocation_percentage / 100.0) as fte
        FROM effective_project_assignments epa
        LEFT JOIN scenarios s ON epa.scenario_id = s.id
        WHERE (s.status = 'active' OR epa.scenario_id IS NULL)
        GROUP BY epa.role_id
      ) a ON a.role_id = r.id
      LEFT JOIN (
        SELECT pmd.role_id as role_id, SUM(pmd.headcount) as fte
        FROM project_pool_demands pmd
        WHERE pmd.status = 'open'
        GROUP BY pmd.role_id
      ) pd ON pd.role_id = r.id
    )
    SELECT
      rc.role_id,
      rc.role_name,
      rc.people_count,
      rc.total_capacity_fte,
      rc.total_capacity_hours,
      COALESCE(rd.total_demand_fte, 0) as total_demand_fte,
      COALESCE(rd.total_demand_hours, 0) as total_demand_hours,
      rc.total_capacity_fte - COALESCE(rd.total_demand_fte, 0) as capacity_gap_fte,
      rc.total_capacity_hours - COALESCE(rd.total_demand_hours, 0) as capacity_gap_hours,
      rc.people_with_reduced_availability,
      CASE
        WHEN rc.people_count = 0 AND COALESCE(rd.total_demand_fte, 0) > 0 THEN 'GAP'
        WHEN rc.total_capacity_fte - COALESCE(rd.total_demand_fte, 0) < -0.5 THEN 'GAP'
        WHEN rc.total_capacity_fte - COALESCE(rd.total_demand_fte, 0) < 0 THEN 'TIGHT'
        ELSE 'OK'
      END as status
    FROM role_capacity rc
    LEFT JOIN role_demand rd ON rc.role_id = rd.role_id
    ORDER BY rc.role_name
  `);
}
