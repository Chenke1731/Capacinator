import { Knex } from 'knex';

/**
 * Backfill legacy free-text component values into the controlled
 * components dimension (066).
 *
 * The old `projects.component` free-text column was exactly the
 * "anyone can type anything" problem the component management feature
 * exists to fix: 6 live rows carry values (HCCL_驱动组 ×4, HCCL_平台组,
 * 调度组). Each distinct text becomes a components row and the matching
 * projects get component_id set. The text column stays in place,
 * read-only — new writes go through component_id only.
 */
export async function up(knex: Knex): Promise<void> {
  const distinct = await knex('projects')
    .whereNotNull('component')
    .where('component', '!=', '')
    .distinct('component');

  for (const { component } of distinct) {
    const name = String(component).trim();
    if (!name) continue;
    // findOrCreate by name (unique constraint)
    const existing = await knex('components').where('name', name).first();
    const componentId = existing
      ? existing.id
      : (await knex('components').insert({ name }).returning('id'))[0].id;
    await knex('projects').where('component', name).update({ component_id: componentId });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse is lossy-safe: clear the backfilled FK only where the text
  // still agrees with the referenced component name.
  const rows = await knex('projects')
    .join('components', 'projects.component_id', 'components.id')
    .whereRaw('projects.component = components.name')
    .select('projects.id');
  for (const { id } of rows) {
    await knex('projects').where('id', id).update({ component_id: null });
  }
}
