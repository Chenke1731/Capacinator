import { Knex } from 'knex';

/**
 * 063c — 分配主投入标记（设计 §4/G3）
 *
 * is_primary: 开发侧主投入（看板"实名投入"格显示口径）。
 * 部分唯一索引保证每 project×scenario 至多一条主投入;
 * 应用层仅对开发侧分配设主（SE/MDE 单人格无需主次）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scenario_project_assignments', (table) => {
    table.boolean('is_primary').defaultTo(false).notNullable();
  });
  await knex.raw(
    `CREATE UNIQUE INDEX spa_primary_unique
       ON scenario_project_assignments (scenario_id, project_id) WHERE is_primary = 1`
  );
}

export async function down(knex: Knex): Promise<void> {
  const saved: Array<{ type: string; name: string; sql: string }> = await knex.raw(
    `SELECT type, name, sql FROM sqlite_master WHERE type IN ('view','trigger') ORDER BY rowid`
  );
  for (const d of saved) await knex.raw(`DROP ${d.type.toUpperCase()} IF EXISTS ${d.name}`);
  await knex.raw('DROP INDEX IF EXISTS spa_primary_unique');
  await knex.schema.alterTable('scenario_project_assignments', (table) => {
    table.dropColumn('is_primary');
  });
  for (const d of saved) await knex.raw(d.sql);
}
