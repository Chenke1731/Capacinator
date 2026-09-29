import { Knex } from 'knex';

/**
 * Software component management (2026-09-29 design).
 *
 * A component is a controlled structural dimension answering "which part
 * of the software does this piece of work belong to" (reporting engine,
 * platform core, ...) — orthogonal to project_type (nature of work) and
 * deliberately NOT a tag (tags carry no calculation semantics by
 * design, migration 054; components feed demand/workload analytics).
 *
 * Projects reference exactly ONE component (nullable for legacy rows);
 * people diversification across components happens through multi-project
 * assignments — assignment → project → component is the analytics path.
 */
export async function up(knex: Knex): Promise<void> {
  console.log('Creating components table...');

  await knex.schema.createTable('components', (table) => {
    table.string('id', 36).primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
    table.string('name', 255).notNullable().unique();
    table.string('code', 50).nullable();
    table.text('description');
    table.string('owner_id', 36).nullable()
      .references('id').inTable('people').onDelete('SET NULL');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['owner_id']);
  });

  // SQLite: knex's alterTable rebuilds the table (temp table → copy →
  // RENAME), and RENAME chokes on views referencing it
  // (project_health_view → "no such table: main.projects"). A plain
  // ADD COLUMN avoids the rebuild; REFERENCES still records the FK.
  await knex.raw('ALTER TABLE projects ADD COLUMN component_id VARCHAR(36) REFERENCES components(id) ON DELETE RESTRICT');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_projects_component_id ON projects(component_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_projects_component_id');
  await knex.raw('ALTER TABLE projects DROP COLUMN component_id');
  await knex.schema.dropTableIfExists('components');
}
