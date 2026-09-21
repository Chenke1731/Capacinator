import { Knex } from 'knex';

/**
 * Migration 055 — 人力分配逻辑核心数据模型
 *
 * 1. projects: lifecycle_state (8 态状态机) / ar_number (可选需求编号) / iteration_label
 * 2. project_assignments + scenario_project_assignments: status ('active'|'paused')
 *    暂停行保留但退出产能计算 (effective_project_assignments 仅透出 active)
 * 3. project_lifecycle_events: 状态迁移留档 (准入 AR / 退回 / 裁决取消等)
 * 4. project_design_estimations: 设计侧粗估人月 (镜像 project_estimations 历史模式)
 * 5. project_pool_demands: 池占位 (按角色数量需求, 不带人名, 参与产能计算)
 * 6. 视图重建: effective/assignments_view 透出 status; capacity_gaps/project_demands 纳入 open 池
 * 7. 存量回填: 需求交付/零星事项树项目 → 有分配 'in_iteration' 否则 'pending_rat';
 *    常驻类 (问题单支持/项目事务) 保持 NULL (生命周期不适用)
 *
 * 状态机 (code values, 展示走 i18n):
 *   pending_rat 待RAT → nok NOK ⇄ designing 设计中 → backlog 待排序 →
 *   scheduled 已排序 → in_iteration 已启动迭代 → delivered 已交付
 *   任意态 → cancelled 裁决取消 (终态); backlog/scheduled/in_iteration → designing (退回)
 */
export async function up(knex: Knex): Promise<void> {
  console.log('Adding lifecycle columns to projects...');
  await knex.schema.alterTable('projects', (table) => {
    table.text('lifecycle_state'); // null = 不适用 (常驻类事项)
    table.text('ar_number');
    table.text('iteration_label');
  });

  console.log('Adding status column to assignment tables...');
  await knex.schema.alterTable('project_assignments', (table) => {
    table.text('status').notNullable().defaultTo('active');
  });
  await knex.schema.alterTable('scenario_project_assignments', (table) => {
    table.text('status').notNullable().defaultTo('active');
  });

  console.log('Creating project_lifecycle_events table...');
  await knex.schema.createTable('project_lifecycle_events', (table) => {
    table.increments('id').primary();
    table.string('project_id', 36).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.text('from_state').nullable();
    table.text('to_state').notNullable();
    table.text('ar_number').nullable();
    table.text('iteration_label').nullable();
    table.text('note').nullable();
    table.text('actor').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.index('project_id', 'idx_lifecycle_events_project');
    table.index(['project_id', 'id'], 'idx_lifecycle_events_project_id');
  });

  console.log('Creating project_design_estimations table...');
  await knex.schema.createTable('project_design_estimations', (table) => {
    table.increments('id').primary();
    table.string('project_id', 36).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.float('estimated_design_pm').notNullable();
    table.float('deviation_low_pct').notNullable().defaultTo(20);
    table.float('deviation_high_pct').notNullable().defaultTo(50);
    table.text('notes').nullable();
    table.float('actual_design_pm').nullable();
    table.datetime('backfilled_at').nullable();
    table.string('created_by', 36).nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index('project_id', 'idx_design_estimations_project');
    table.index(['project_id', 'created_at'], 'idx_design_estimations_project_created');
  });

  console.log('Creating project_pool_demands table...');
  await knex.schema.createTable('project_pool_demands', (table) => {
    table.string('id', 36).primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
    table.string('project_id', 36).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.string('role_id', 36).notNullable()
      .references('id').inTable('roles').onDelete('RESTRICT');
    table.float('headcount').notNullable(); // FTE 数 (0.1 ~ 10)
    table.date('start_date').nullable();
    table.date('end_date').nullable();
    table.text('status').notNullable().defaultTo('open'); // open | named | cancelled
    table.text('notes').nullable();
    table.string('created_by', 36).nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index('project_id', 'idx_pool_demands_project');
    table.index(['status', 'role_id'], 'idx_pool_demands_status_role');
  });

  // Backfill lifecycle states for existing trackable projects
  console.log('Backfilling lifecycle_state for existing projects...');
  await knex.raw(`
    UPDATE projects SET lifecycle_state = CASE
      WHEN EXISTS (
        SELECT 1 FROM scenario_project_assignments spa WHERE spa.project_id = projects.id
        UNION ALL
        SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id
      ) THEN 'in_iteration' ELSE 'pending_rat' END
    WHERE project_type_id IN (
      SELECT id FROM project_types WHERE name IN ('需求交付', '零星事项')
    )
  `);

  // ---- View rebuilds (dependents first) ----
  await knex.raw('DROP VIEW IF EXISTS project_demands_view');
  await knex.raw('DROP VIEW IF EXISTS scenario_filtered_assignments');
  await knex.raw('DROP VIEW IF EXISTS capacity_gaps_view');
  await knex.raw('DROP VIEW IF EXISTS effective_project_assignments');

  console.log('Rebuilding effective_project_assignments (active rows only, status passthrough)...');
  await knex.raw(`
    CREATE VIEW effective_project_assignments AS
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
      pa.computed_start_date,
      pa.computed_end_date,
      pa.notes,
      pa.status,
      'base' as source_type,
      null as scenario_id,
      'added' as change_type,
      null as base_assignment_id,
      pa.created_at,
      pa.updated_at
    FROM project_assignments pa
    WHERE pa.status = 'active'

    UNION ALL

    SELECT
      spa.id,
      spa.project_id,
      spa.person_id,
      spa.role_id,
      spa.phase_id,
      spa.allocation_percentage,
      spa.assignment_date_mode,
      spa.start_date,
      spa.end_date,
      spa.computed_start_date,
      spa.computed_end_date,
      spa.notes,
      spa.status,
      'scenario' as source_type,
      spa.scenario_id,
      spa.change_type,
      spa.base_assignment_id,
      spa.created_at,
      spa.updated_at
    FROM scenario_project_assignments spa
    WHERE spa.status = 'active'
  `);

  console.log('Rebuilding scenario_filtered_assignments...');
  await knex.raw(`
    CREATE VIEW scenario_filtered_assignments AS
    SELECT
      epa.*,
      s.scenario_type,
      s.parent_scenario_id
    FROM effective_project_assignments epa
    LEFT JOIN scenarios s ON epa.scenario_id = s.id
  `);

  console.log('Rebuilding capacity_gaps_view (role demand includes open pool placeholders)...');
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
      -- Named assignments + open pool placeholders, both in FTE terms.
      -- Pool rows consume role capacity exactly like named assignments.
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

  console.log('Rebuilding project_demands_view (pool rows included)...');
  await knex.raw(`
    CREATE VIEW project_demands_view AS
    SELECT
      epa.project_id,
      p.name as project_name,
      p.description as project_description,
      p.priority,
      p.include_in_demand,
      epa.phase_id,
      CASE
        WHEN epa.assignment_date_mode = 'fixed' THEN epa.start_date
        WHEN epa.assignment_date_mode = 'phase' AND ppt.start_date IS NOT NULL THEN ppt.start_date
        ELSE p.aspiration_start
      END as start_date,
      CASE
        WHEN epa.assignment_date_mode = 'fixed' THEN epa.end_date
        WHEN epa.assignment_date_mode = 'phase' AND ppt.end_date IS NOT NULL THEN ppt.end_date
        ELSE p.aspiration_finish
      END as end_date,
      epa.role_id,
      r.name as role_name,
      epa.allocation_percentage,
      1 as people_count,
      epa.allocation_percentage as total_demand_percentage,
      ROUND(
        (epa.allocation_percentage / 100.0) *
        (
          julianday(
            CASE
              WHEN epa.assignment_date_mode = 'fixed' THEN epa.end_date
              WHEN epa.assignment_date_mode = 'phase' AND ppt.end_date IS NOT NULL THEN ppt.end_date
              ELSE p.aspiration_finish
            END
          ) - julianday(
            CASE
              WHEN epa.assignment_date_mode = 'fixed' THEN epa.start_date
              WHEN epa.assignment_date_mode = 'phase' AND ppt.start_date IS NOT NULL THEN ppt.start_date
              ELSE p.aspiration_start
            END
          )
        ) *
        (5.0/7.0) *
        8.0 *
        1
      ) as demand_hours,
      CASE
        WHEN CASE
          WHEN epa.assignment_date_mode = 'fixed' THEN epa.end_date
          WHEN epa.assignment_date_mode = 'phase' AND ppt.end_date IS NOT NULL THEN ppt.end_date
          ELSE p.aspiration_finish
        END < date('now') THEN 'PAST'
        WHEN CASE
          WHEN epa.assignment_date_mode = 'fixed' THEN epa.start_date
          WHEN epa.assignment_date_mode = 'phase' AND ppt.start_date IS NOT NULL THEN ppt.start_date
          ELSE p.aspiration_start
        END > date('now') THEN 'FUTURE'
        ELSE 'CURRENT'
      END as time_status,
      p.project_type_id,
      pt.name as project_type_name,
      epa.scenario_id,
      s.name as scenario_name,
      s.status as scenario_status,
      s.scenario_type,
      epa.source_type,
      epa.change_type
    FROM effective_project_assignments epa
    JOIN projects p ON epa.project_id = p.id
    JOIN project_types pt ON p.project_type_id = pt.id
    JOIN roles r ON epa.role_id = r.id
    LEFT JOIN scenarios s ON epa.scenario_id = s.id
    LEFT JOIN project_phases_timeline ppt ON epa.phase_id = ppt.phase_id AND epa.project_id = ppt.project_id
    WHERE p.include_in_demand = 1
      AND epa.allocation_percentage > 0
      AND (s.status = 'active' OR s.status IS NULL)

    UNION ALL

    -- Pool placeholder demand: headcount FTE, no person attached.
    -- allocation_percentage is FTE-normalized (100 = 1 person) so downstream
    -- sums stay consistent with named rows.
    SELECT
      pmd.project_id,
      p.name as project_name,
      p.description as project_description,
      p.priority,
      p.include_in_demand,
      null as phase_id,
      COALESCE(pmd.start_date, p.aspiration_start) as start_date,
      COALESCE(pmd.end_date, p.aspiration_finish) as end_date,
      pmd.role_id,
      r.name as role_name,
      ROUND(pmd.headcount * 100) as allocation_percentage,
      pmd.headcount as people_count,
      ROUND(pmd.headcount * 100) as total_demand_percentage,
      ROUND(
        pmd.headcount *
        (
          julianday(COALESCE(pmd.end_date, p.aspiration_finish)) -
          julianday(COALESCE(pmd.start_date, p.aspiration_start))
        ) *
        (5.0/7.0) *
        8.0
      ) as demand_hours,
      CASE
        WHEN COALESCE(pmd.end_date, p.aspiration_finish) < date('now') THEN 'PAST'
        WHEN COALESCE(pmd.start_date, p.aspiration_start) > date('now') THEN 'FUTURE'
        ELSE 'CURRENT'
      END as time_status,
      p.project_type_id,
      pt.name as project_type_name,
      null as scenario_id,
      null as scenario_name,
      null as scenario_status,
      null as scenario_type,
      'pool' as source_type,
      null as change_type
    FROM project_pool_demands pmd
    JOIN projects p ON pmd.project_id = p.id
    JOIN project_types pt ON p.project_type_id = pt.id
    JOIN roles r ON pmd.role_id = r.id
    WHERE pmd.status = 'open'
      AND p.include_in_demand = 1
  `);

  console.log('Rebuilding assignments_view (status passthrough, paused rows still listed)...');
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

  console.log('✅ Migration 055 complete: lifecycle, pool demands, design estimations, views rebuilt');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Reverting migration 055 (best effort)...');

  await knex.raw('DROP VIEW IF EXISTS project_demands_view');
  await knex.raw('DROP VIEW IF EXISTS scenario_filtered_assignments');
  await knex.raw('DROP VIEW IF EXISTS capacity_gaps_view');
  await knex.raw('DROP VIEW IF EXISTS effective_project_assignments');
  await knex.raw('DROP VIEW IF EXISTS assignments_view');

  // Restore pre-055 views (034/035 shapes)
  await knex.raw(`
    CREATE VIEW effective_project_assignments AS
    SELECT pa.id, pa.project_id, pa.person_id, pa.role_id, pa.phase_id,
      pa.allocation_percentage, pa.assignment_date_mode, pa.start_date, pa.end_date,
      pa.computed_start_date, pa.computed_end_date, pa.notes,
      'base' as source_type, null as scenario_id, 'added' as change_type,
      null as base_assignment_id, pa.created_at, pa.updated_at
    FROM project_assignments pa
    UNION ALL
    SELECT spa.id, spa.project_id, spa.person_id, spa.role_id, spa.phase_id,
      spa.allocation_percentage, spa.assignment_date_mode, spa.start_date, spa.end_date,
      spa.computed_start_date, spa.computed_end_date, spa.notes,
      'scenario' as source_type, spa.scenario_id, spa.change_type,
      spa.base_assignment_id, spa.created_at, spa.updated_at
    FROM scenario_project_assignments spa
  `);
  await knex.raw(`
    CREATE VIEW scenario_filtered_assignments AS
    SELECT epa.*, s.scenario_type, s.parent_scenario_id
    FROM effective_project_assignments epa
    LEFT JOIN scenarios s ON epa.scenario_id = s.id
  `);

  await knex.schema.dropTableIfExists('project_pool_demands');
  await knex.schema.dropTableIfExists('project_design_estimations');
  await knex.schema.dropTableIfExists('project_lifecycle_events');

  console.log('✅ Migration 055 reverted (status/lifecycle columns retained to preserve data)');
}
