import { Knex } from 'knex';

/**
 * 063a — 迭代表 + projects.iteration_id（设计 §0.1/§9）
 *
 * 迭代 = 执行窗口的唯一日期真相（名 + 起止）；季度由 start_date 派生不落库。
 * iteration_id 为事实字段（非场景化,设计 §0.6 裁决）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('iterations', (table) => {
    table.string('id', 36).primary();
    table.string('name', 255).notNullable();
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.timestamps(true, true);
  });
  // 原生 ADD COLUMN 带 REFERENCES: knex alterTable+.references() 会走表重建,
  // 重建中间态令引用 projects 的视图悬空(061 实证同坑)——原生加列免重建
  await knex.raw(
    `ALTER TABLE projects ADD COLUMN iteration_id VARCHAR(36)
       REFERENCES iterations(id) ON DELETE SET NULL`
  );
}

/** down: 删列走表重建,须先摘视图(061 实证的悬空引用问题)再还原 */
export async function down(knex: Knex): Promise<void> {
  const saved: Array<{ type: string; name: string; sql: string }> = await knex.raw(
    `SELECT type, name, sql FROM sqlite_master WHERE type IN ('view','trigger') ORDER BY rowid`
  );
  for (const d of saved) await knex.raw(`DROP ${d.type.toUpperCase()} IF EXISTS ${d.name}`);
  await knex.schema.alterTable('projects', (table) => table.dropColumn('iteration_id'));
  await knex.schema.dropTableIfExists('iterations');
  for (const d of saved) await knex.raw(d.sql);
}
