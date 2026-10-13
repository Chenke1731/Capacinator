import { Knex } from 'knex';

/**
 * 人员停用位(2026-10-13 全库审计收口): People 删除已加 409 引用守卫
 * (person_id FK CASCADE 会销毁全部排产历史),下线一个人从此走停用——
 * 停用者保留历史、不再出现在分配/负责人选择器里(?is_active=true 过滤)。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('people', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('people', (table) => {
    table.dropColumn('is_active');
  });
}
