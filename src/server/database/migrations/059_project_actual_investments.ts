import { Knex } from 'knex';

/**
 * 059 — 实投入月帐(2026-09-22 用户真实人力排序表借鉴: "9月实投入/10月实投入"列)。
 * 口径: 计划=当月有效实名分配(池不计,池是计划杠杆);实际=月末快照默认值+主管改写。
 * source: 'snapshot'(自动,可被覆盖刷新) | 'manual'(主管改写,快照不覆盖)。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('project_actual_investments', (table) => {
    table.increments('id').primary();
    table.string('project_id', 36).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.text('month').notNullable(); // 'YYYY-MM'
    table.float('fte').notNullable();
    table.text('source').notNullable().defaultTo('snapshot');
    table.string('created_by', 36).nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['project_id', 'month']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('project_actual_investments');
}
