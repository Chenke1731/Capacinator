import type { Knex } from 'knex';

/**
 * IP-07c / F06（2026-10-17）：关键写入实体的乐观锁版本列。
 *
 * 现状是"后写静默覆盖"：两个人工月账/分配并发编辑，后写者无提示地冲掉
 * 先写者的修改。updated_at 不适合作比较令牌——真库 TEXT 默认值（CURRENT_
 * TIMESTAMP）与代码 Date 写入（驱动序列化）形态混存，字符串比较不可靠
 * （实测）。整数 version 列原子比较（WHERE version=expected_version），
 * 冲突 409 载荷带回当前值，前端保留草稿。
 *
 * 渐进收紧：带 expected_version 的写入启用乐观锁；不带者维持旧行为（兼容
 * 既有调用方），但 version 同样递增——令牌永远可比。不做全库一刀切，
 * 只覆盖"实际被人工编辑"的三张表。
 */
const TABLES = ['project_actual_investments', 'scenario_project_assignments', 'project_assignments'];

export async function up(knex: Knex): Promise<void> {
  for (const t of TABLES) {
    await knex.schema.alterTable(t, (table) => {
      table.integer('version').notNullable().defaultTo(1);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const t of TABLES) {
    await knex.schema.alterTable(t, (table) => {
      table.dropColumn('version');
    });
  }
}
