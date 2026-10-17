import type { Knex } from 'knex';

/**
 * U01 / IP-03b（2026-10-17）：person_utilization_view 状态判档改**相对可用率**。
 *
 * 旧口径用绝对分配和判档（>=100 Over / >=80 Fully），无视人员可用率——
 * 可用率 50% 的人分到 80%（实际负荷 160%）被标 Fully-allocated；且
 * >=100 含等于，100% 满载被标 Over。同时五个消费方四个口径（People 汇总
 * 死字段 allocation_status 恒 0、People 明细相对率 100/80/40 私设线、
 * utilization 报表 100/90/50 私设线、capacity 报表跟视图）。
 *
 * 新口径与 IP-03a 冲突语义（loadPct > capacityPct）一致，视图为唯一真相：
 *   可用率 0 → Unavailable；ratio > 100 → Over-allocated（严格大于，100% 算满载）；
 *   ratio >= 80 → Fully-allocated；分配 > 0 → Partially-allocated；否则 Available
 * 分子（有效分配和）与分组结构不变——只改状态判档，不动数值列语义。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS person_utilization_view');
  await knex.raw(`
    CREATE VIEW person_utilization_view AS
    SELECT
      p.id AS person_id,
      p.name AS person_name,
      p.email AS person_email,
      p.worker_type,
      COALESCE(av.availability_percentage, p.default_availability_percentage) as current_availability_percentage,
      p.default_hours_per_day,
      r.id AS primary_role_id,
      r.name AS primary_role_name,
      pr.proficiency_level AS primary_role_proficiency,
      l.name AS location_name,
      COALESCE(SUM(
        CASE
          WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
          THEN epa.allocation_percentage
          ELSE 0
        END
      ), 0) AS total_allocation_percentage,
      COUNT(DISTINCT CASE
        WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
        THEN epa.project_id
      END) AS project_count,
      CASE
        WHEN COALESCE(av.availability_percentage, p.default_availability_percentage) = 0 THEN 'Unavailable'
        WHEN COALESCE(SUM(
          CASE
            WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) * 100.0 / COALESCE(av.availability_percentage, p.default_availability_percentage) > 100 THEN 'Over-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) * 100.0 / COALESCE(av.availability_percentage, p.default_availability_percentage) >= 80 THEN 'Fully-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) > 0 THEN 'Partially-allocated'
        ELSE 'Available'
      END AS utilization_status,
      av.reason as availability_reason,
      av.start_date as availability_start,
      av.end_date as availability_end
    FROM people p
    LEFT JOIN person_roles pr ON p.primary_person_role_id = pr.id
    LEFT JOIN roles r ON pr.role_id = r.id
    LEFT JOIN locations l ON p.location_id = l.id
    LEFT JOIN effective_project_assignments epa ON p.id = epa.person_id
    LEFT JOIN scenarios s ON epa.scenario_id = s.id
    LEFT JOIN person_availability_overrides av ON p.id = av.person_id
      AND av.start_date <= date('now')
      AND av.end_date >= date('now')
    WHERE p.is_active = true
    GROUP BY p.id, p.name, p.email, p.worker_type, p.default_availability_percentage,
             p.default_hours_per_day, r.id, r.name, pr.proficiency_level, l.name,
             av.availability_percentage, av.reason, av.start_date, av.end_date
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS person_utilization_view');
  await knex.raw(`
    CREATE VIEW person_utilization_view AS
    SELECT
      p.id AS person_id,
      p.name AS person_name,
      p.email AS person_email,
      p.worker_type,
      COALESCE(av.availability_percentage, p.default_availability_percentage) as current_availability_percentage,
      p.default_hours_per_day,
      r.id AS primary_role_id,
      r.name AS primary_role_name,
      pr.proficiency_level AS primary_role_proficiency,
      l.name AS location_name,
      COALESCE(SUM(
        CASE
          WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
          THEN epa.allocation_percentage
          ELSE 0
        END
      ), 0) AS total_allocation_percentage,
      COUNT(DISTINCT CASE
        WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
        THEN epa.project_id
      END) AS project_count,
      CASE
        WHEN COALESCE(av.availability_percentage, p.default_availability_percentage) = 0 THEN 'Unavailable'
        WHEN COALESCE(SUM(
          CASE
            WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) >= 100 THEN 'Over-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) >= 80 THEN 'Fully-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (s.status = 'active' OR epa.scenario_id IS NULL)
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) > 0 THEN 'Partially-allocated'
        ELSE 'Available'
      END AS utilization_status,
      av.reason as availability_reason,
      av.start_date as availability_start,
      av.end_date as availability_end
    FROM people p
    LEFT JOIN person_roles pr ON p.primary_person_role_id = pr.id
    LEFT JOIN roles r ON pr.role_id = r.id
    LEFT JOIN locations l ON p.location_id = l.id
    LEFT JOIN effective_project_assignments epa ON p.id = epa.person_id
    LEFT JOIN scenarios s ON epa.scenario_id = s.id
    LEFT JOIN person_availability_overrides av ON p.id = av.person_id
      AND av.start_date <= date('now')
      AND av.end_date >= date('now')
    WHERE p.is_active = true
    GROUP BY p.id, p.name, p.email, p.worker_type, p.default_availability_percentage,
             p.default_hours_per_day, r.id, r.name, pr.proficiency_level, l.name,
             av.availability_percentage, av.reason, av.start_date, av.end_date
  `);
}
