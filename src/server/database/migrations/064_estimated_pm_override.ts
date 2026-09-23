import { Knex } from 'knex';

/**
 * 064 — 人月手动覆盖(2026-09-23 用户裁决"换算给默认,手动可覆盖")
 *
 * estimated_loc(KLOC×1000)仍是源头;新增 estimated_pm 存手动覆盖值:
 * NULL = 未覆盖(前端显示自动换算 loc/rate);有值 = 用编辑值。
 * 改代码规模不重置覆盖(覆盖是明确意图)。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('project_estimations', (table) => {
    table.float('estimated_pm').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('project_estimations', (table) => {
    table.dropColumn('estimated_pm');
  });
}
