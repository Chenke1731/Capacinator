import type { Knex } from 'knex';

/**
 * 可用率覆盖只取已批准行（工作台 v2 设计 §9.2.7 / Claude 复评盯点 2）。
 *
 * 070 把 person_utilization_view 的可用率来源接到了
 * person_availability_overrides，但 JOIN 未过滤 is_approved——待审批的
 * 覆盖会直接改写 current_availability_percentage 与相对利用率判档，
 * 与共享原语 fetchApprovedAvailabilityOverrides（is_approved=1）和
 * CapacityCalculator 的口径漂移。本迁移以 070 的视图定义为基线，仅给
 * LEFT JOIN 追加 `av.is_approved = 1`：未批准覆盖不参与容量线。
 * 分子（分配窗口）语义与 070 完全一致，不动。
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
          WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
            AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                 OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
            AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                 OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
          THEN epa.allocation_percentage
          ELSE 0
        END
      ), 0) AS total_allocation_percentage,
      COUNT(DISTINCT CASE
        WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
          AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
               OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
          AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
               OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
        THEN epa.project_id
      END) AS project_count,
      CASE
        WHEN COALESCE(av.availability_percentage, p.default_availability_percentage) = 0 THEN 'Unavailable'
        WHEN COALESCE(SUM(
          CASE
            WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
              AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                   OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
              AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                   OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) * 100.0 / COALESCE(av.availability_percentage, p.default_availability_percentage) > 100 THEN 'Over-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
              AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                   OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
              AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                   OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) * 100.0 / COALESCE(av.availability_percentage, p.default_availability_percentage) >= 80 THEN 'Fully-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
              AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                   OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
              AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                   OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
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
      AND av.is_approved = 1
      AND av.start_date <= date('now')
      AND av.end_date >= date('now')
    WHERE p.is_active = true
    GROUP BY p.id, p.name, p.email, p.worker_type, p.default_availability_percentage,
             p.default_hours_per_day, r.id, r.name, pr.proficiency_level, l.name,
             av.availability_percentage, av.reason, av.start_date, av.end_date
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 回滚即回到 070 的"未过滤 approved"视图——未批准覆盖重新生效,仅保迁移可逆
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
          WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
            AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                 OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
            AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                 OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
          THEN epa.allocation_percentage
          ELSE 0
        END
      ), 0) AS total_allocation_percentage,
      COUNT(DISTINCT CASE
        WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
          AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
               OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
          AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
               OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
        THEN epa.project_id
      END) AS project_count,
      CASE
        WHEN COALESCE(av.availability_percentage, p.default_availability_percentage) = 0 THEN 'Unavailable'
        WHEN COALESCE(SUM(
          CASE
            WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
              AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                   OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
              AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                   OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) * 100.0 / COALESCE(av.availability_percentage, p.default_availability_percentage) > 100 THEN 'Over-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
              AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                   OR date(COALESCE(epa.computed_start_date, epa.start_date)) <= date('now'))
              AND (COALESCE(epa.computed_end_date, epa.end_date) IS NULL
                   OR date(COALESCE(epa.computed_end_date, epa.end_date)) >= date('now'))
            THEN epa.allocation_percentage
            ELSE 0
          END
        ), 0) * 100.0 / COALESCE(av.availability_percentage, p.default_availability_percentage) >= 80 THEN 'Fully-allocated'
        WHEN COALESCE(SUM(
          CASE
            WHEN (epa.scenario_id IS NULL OR epa.scenario_id = 'baseline-0000-0000-0000-000000000000')
              AND (COALESCE(epa.computed_start_date, epa.start_date) IS NULL
                   OR date(COALESCE(epc.computed_end_date, epa.end_date) IS NULL)
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
