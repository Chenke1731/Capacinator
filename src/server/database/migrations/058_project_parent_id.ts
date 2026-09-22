import { Knex } from 'knex';

/**
 * 058 — SR→AR 父子分解(2026-09-22 用户真实人力排序表借鉴,JDC/SR 分解成 AR 是真实关系)。
 * 设计: 同一实体同一需求台,分解是演化动作不是类型声明——无子行=普通需求/AR,
 * 有子行=SR 折叠头(汇总只读)。只允许一层(父不得再有父),子行各自持有
 * 版本/优先级/状态/人力(与真实表一致),不继承不双轨。
 *
 * 注: SQLite 下带 FK 的 alterTable 会走整表重建,撞上库内陈旧触发器
 * (phase_template_change_history 引用不存在的 template 列)。故 FK 不落库,
 * 由应用层守卫: validateParent(一层校验) + delete 有子拒绝。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.string('parent_id', 36).nullable();
  });
  await knex.schema.alterTable('projects', (table) => {
    table.index('parent_id', 'idx_projects_parent_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.dropIndex('idx_projects_parent_id');
  });
  await knex.schema.alterTable('projects', (table) => {
    table.dropColumn('parent_id');
  });
}
