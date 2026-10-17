import type { Knex } from 'knex';

/**
 * 人员利用率视图分子收口（Codex 2026-10-17 复审，IP-03b 续）：
 *
 * 069 统一了状态判档口径，但分子仍是两个旧语义的叠加病：
 * 1. 场景叠加双计——分子算 `基线行 + 所有 active 场景行`，复制一个相同分支
 *    后 60% 变 120% 幻影超载（IP-02b 早已裁决"不把所有 active 分支叠加"，
 *    effectiveAssignments 切片读才是正身，视图漏改）。
 * 2. 无时间窗——已结束的分配照常计入"当前"负荷。
 *
 * 本迁移把视图分子改为 **基线切片 + 今天相交窗口** 的公共底线语义：
 * - 只算基线事实——**两轨都算**（project_assignments 基表行 scenario_id IS
 *   NULL，以及 scenario_project_assignments(baseline-uuid) 轨；dev 实测 59 行
 *   基线分配全部在后一轨，只算前者会把全员分子归零）；分支场景的负荷由
 *   PeopleController.getUtilization 按 X-Scenario-Id 用
 *   activeAssignmentsInScenario 原语重算（请求上下文进不了 SQL 视图）。
 * - 分配区间与今天相交才计入；null 日期（computed 与原始都空）视为
 *   全窗口（与 checkConflicts 的 null=全窗语义一致）。
 * 状态判档（069 相对可用率口径）不变。
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
      AND av.start_date <= date('now')
      AND av.end_date >= date('now')
    WHERE p.is_active = true
    GROUP BY p.id, p.name, p.email, p.worker_type, p.default_availability_percentage,
             p.default_hours_per_day, r.id, r.name, pr.proficiency_level, l.name,
             av.availability_percentage, av.reason, av.start_date, av.end_date
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 回滚即回到 069 的"叠加+无窗口"分子——语义上不推荐,仅保迁移可逆
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
