/**
 * 角色容量缺口读取原语（I01v/D15，2026-11-11）。
 *
 * 背景（backend-review 试点场一 BR-F01 / EXP-B09）：capacity_gaps_view（055）
 * 的 role_demand CTE 汇总 `effective_project_assignments`——旧表 ∪ **全部**
 * active 场景的分配。建未改动分支后同一批分配被叠加计数，dashboard 缺口/
 * 容量报表数字翻倍（0.6 FTE→1.2）。D15 裁决 B：报表读侧弃聚合视图，需求侧
 * 改场景切片原语内联（与 getUtilizationReport 已修同型）。
 *
 * 口径承诺：
 * - role_capacity CTE 与 055 视图**逐字一致**（人×角色×可用率覆盖×
 *   worker_type 折扣，场景无关）——漂移由 report-scenario-slice 测试的
 *   baseline-视图对等断言锁定（评审 R3：两侧同错相消的守卫失明）。
 * - role_demand = 场景切片 + 开放池需求；**baseline 额外并入旧表
 *   project_assignments 的 active 行**（I01y/#1：055 视图需求侧经
 *   effective_project_assignments 含 `scenario_id IS NULL` 旧表轨道，
 *   070 视图/需求报表同样保留；恢复库/legacy 部署下角色缺口不得漏计）。
 *   分支保持独立切片（与 PeopleController 分支先例一致，不掺全局旧表行）。
 * - 无日期窗——与 055 现行为对齐，本原语只修场景维度。
 */
import { BASELINE_SCENARIO_ID } from './effectiveAssignments.js';
export interface RoleGapRow {
  role_id: string;
  role_name: string;
  people_count: number;
  total_capacity_fte: number;
  total_capacity_hours: number;
  total_demand_fte: number;
  total_demand_hours: number;
  capacity_gap_fte: number;
  capacity_gap_hours: number;
  people_with_reduced_availability: number;
  status: 'GAP' | 'TIGHT' | 'OK';
}

export async function roleCapacityGaps(
  db: any,
  scenarioId: string
): Promise<RoleGapRow[]> {
  // baseline 并入旧表轨道（055 视图需求侧含 scenario_id IS NULL）；分支纯切片
  const includeLegacy = scenarioId === BASELINE_SCENARIO_ID ? 1 : 0;
  const rows = await db.raw(
    `
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
        -- 场景切片（activeAssignmentsInScenario 同谓词）：只计选定场景；
        -- baseline 再并入旧表 active 行（捆绑参数=1 时），与视图/需求报表同口径
        SELECT role_id, SUM(allocation_percentage / 100.0) as fte
        FROM (
          SELECT spa.role_id as role_id, spa.allocation_percentage
          FROM scenario_project_assignments spa
          WHERE spa.scenario_id = ? AND spa.status = 'active'
          UNION ALL
          SELECT pa.role_id as role_id, pa.allocation_percentage
          FROM project_assignments pa
          WHERE pa.status = 'active' AND ? = 1
        ) pick
        GROUP BY role_id
      ) a ON a.role_id = r.id
      LEFT JOIN (
        -- 开放池需求无场景维度（表无 scenario_id 列），维持视图语义
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
    `,
    [scenarioId, includeLegacy]
  );
  return rows as RoleGapRow[];
}
