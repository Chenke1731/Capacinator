import { Knex } from 'knex';

/**
 * Migration 056 — 版本字段 (2026-09-21 裁决)
 *
 * 交付里程碑用版本语言而不是日期:
 *  - product_version  产品版本 (A/B/C/D…), 自由文本
 *  - release_version  交付版本 (26.RP4 = 26年第4个交付节奏), 自由文本
 * 不做格式校验——命名约定靠 placeholder 引导; 文本排序天然正确
 * (26.RP4 < 27.RP1)。期望交付日(expected_delivery_date)保持不动,
 * 版本给人看, 日期给死线校验用。
 */
export async function up(knex: Knex): Promise<void> {
  console.log('Adding version columns to projects...');
  await knex.schema.alterTable('projects', (table) => {
    table.text('product_version');
    table.text('release_version');
  });
  console.log('✅ projects.product_version / release_version added');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Dropping version columns (best effort — SQLite may refuse)...');
  await knex.schema.alterTable('projects', (table) => {
    table.dropColumn('product_version');
    table.dropColumn('release_version');
  });
  console.log('✅ version columns dropped');
}
