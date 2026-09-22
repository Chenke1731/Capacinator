import { Knex } from 'knex';

/**
 * 063d — 字典种子: MDE 角色（设计 §0.5）
 *
 * 只种字典;演示数据(迭代/粗估分量/主投入/挂接/MDE 人员)在
 * scripts/reset-demo-lifecycle.sql（可重跑,实施日志 D1）。
 * MDE = 模块设计师: 迭代内做详细设计,与开发结对交付(设计 §0.2)。
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex('roles').where({ name: 'MDE' }).first();
  if (!exists) {
    await knex('roles').insert({
      name: 'MDE',
      description: '模块设计师: 迭代内详细设计,与开发结对交付'
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('roles').where({ name: 'MDE' }).del();
}
