import { Knex } from 'knex';

/**
 * 057 — 需求台"所属组件"字段(2026-09-22 用户真实人力排序表借鉴):
 * 自由文本 + combobox 就地编辑,与版本字段同款裁决(不做组件表、不做格式校验)。
 * 呈现: 可见窄列(省略号截断) + 工具栏筛选。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.text('component').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.dropColumn('component');
  });
}
