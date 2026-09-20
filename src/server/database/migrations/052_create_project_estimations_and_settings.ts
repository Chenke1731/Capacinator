import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('Creating project_estimations table...');

  await knex.schema.createTable('project_estimations', (table) => {
    // Primary key
    table.increments('id').primary();

    // Project relationship (projects uses UUID string PKs)
    table.string('project_id', 36).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');

    // Estimation inputs (Step 1 requirement: LOC-based estimation)
    table.float('estimated_loc').notNullable();               // SE's estimated lines of code
    table.float('loc_rate_per_pm').notNullable().defaultTo(500); // LOC per person-month (0.5k)
    table.float('design_share_pct').notNullable().defaultTo(15); // design share of total PM (editable placeholder)
    table.float('deviation_low_pct').notNullable().defaultTo(20); // optimistic deviation
    table.float('deviation_high_pct').notNullable().defaultTo(50); // pessimistic deviation
    table.date('expected_delivery_date').nullable();          // expected delivery (deadline input)
    table.text('review_notes').nullable();                    // review notes

    // Post-delivery backfill (calibration)
    table.float('actual_loc').nullable();
    table.float('actual_design_pm').nullable();
    table.float('actual_dev_pm').nullable();
    table.date('actual_delivery_date').nullable();
    table.datetime('backfilled_at').nullable();

    // Audit
    table.string('created_by', 36).nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('project_id', 'idx_project_estimations_project_id');
    table.index(['project_id', 'created_at'], 'idx_project_estimations_project_created');
  });

  console.log('✅ project_estimations table created successfully');

  console.log('Creating settings table...');

  await knex.schema.createTable('settings', (table) => {
    table.text('category').primary(); // 'system' | 'import'
    table.text('settings').notNullable(); // JSON blob
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Seed the system settings row so GET /api/settings/system returns data
  // instead of 404 (values match the Settings page defaults)
  await knex('settings').insert({
    category: 'system',
    settings: JSON.stringify({
      defaultWorkHoursPerWeek: 40,
      defaultVacationDaysPerYear: 15,
      fiscalYearStartMonth: 1,
      allowOverAllocation: true,
      maxAllocationPercentage: 120,
      requireApprovalForOverrides: true,
      autoArchiveCompletedProjects: false,
      archiveAfterDays: 90,
      enableEmailNotifications: false,
      defaultLocRatePerPersonMonth: 500
    })
  });

  console.log('✅ settings table created and seeded');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Dropping project_estimations and settings tables...');
  await knex.schema.dropTableIfExists('project_estimations');
  await knex.schema.dropTableIfExists('settings');
  console.log('✅ project_estimations and settings tables dropped');
}
