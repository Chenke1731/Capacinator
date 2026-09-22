import { Knex } from 'knex';

/**
 * 063b — 设计粗估分量列（设计 §0.4, R1 终版）
 *
 * se_estimate_pm / mde_estimate_pm 落在粗估记录上（非裸字段）:
 * 粗估历史与"实际回填校准"机制原样生效。存量记录只有总人月
 * (estimated_design_pm),分量为空时看板显示"—"不混算（设计 §5）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('project_design_estimations', (table) => {
    table.float('se_estimate_pm').nullable();
    table.float('mde_estimate_pm').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('project_design_estimations', (table) => {
    table.dropColumn('se_estimate_pm');
    table.dropColumn('mde_estimate_pm');
  });
}
