import { Knex } from 'knex';

/**
 * Tag system for projects (事项标签).
 *
 * Replaces the "[预留]" name-prefix convention: classification now lives in
 * a many-to-many tag system used for filtering and cross-cutting labels
 * (紧急/外包/产品线/预留...). Tags carry NO calculation semantics — capacity
 * math treats every allocation alike regardless of tags.
 */
export async function up(knex: Knex): Promise<void> {
  console.log('Creating tags and project_tags tables...');

  await knex.schema.createTable('tags', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('color', 9).nullable(); // hex like '#f59e0b'
    table.text('description').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('project_tags', (table) => {
    table.increments('id').primary();
    table.string('project_id', 36).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.integer('tag_id').notNullable()
      .references('id').inTable('tags').onDelete('CASCADE');
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['project_id', 'tag_id'], 'idx_project_tags_unique');
    table.index('tag_id', 'idx_project_tags_tag_id');
  });

  // Retire the [预留] prefix: tag the two reservation pools and strip the
  // prefix from project and project-type names
  const [reservedTag] = await knex('tags')
    .insert({ name: '预留', color: '#f59e0b', description: '常驻人力预留(问题单/事务等),照常参与产能计算' })
    .returning('*');

  const reservedProjects = await knex('projects')
    .where('name', 'like', '[预留]%')
    .select('id', 'name');
  for (const project of reservedProjects) {
    await knex('project_tags').insert({
      project_id: project.id,
      tag_id: reservedTag.id
    });
    await knex('projects')
      .where('id', project.id)
      .update({ name: project.name.replace(/^\[预留\]\s*/, '') });
  }

  await knex.raw("UPDATE project_types SET name = replace(name, '[预留] ', '') WHERE name LIKE '[预留]%'");
  await knex.raw("UPDATE project_sub_types SET name = replace(name, '[预留] ', '') WHERE name LIKE '[预留]%'");

  console.log(`✅ tag system created; tagged ${reservedProjects.length} reservation project(s), prefix stripped`);
}

export async function down(knex: Knex): Promise<void> {
  // Note: the name-prefix restoration is not reversible (original names
  // could collide); dropping the tables is the meaningful rollback.
  await knex.schema.dropTableIfExists('project_tags');
  await knex.schema.dropTableIfExists('tags');
  console.log('✅ tags and project_tags tables dropped');
}
