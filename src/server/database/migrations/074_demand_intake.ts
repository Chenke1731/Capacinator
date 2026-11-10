import type { Knex } from 'knex';

/**
 * I01 需求收件箱（2026-11-10 设计稿 docs/plans/2026-11-10-demand-intake-quick-capture-design.md §3.1）。
 *
 * W0 需求进入段此前没有流程对象：录入即分类、即建计划、即产生"从今天
 * 起算"的模板日期（inheritProjectPhases 缺 aspiration 时用 now——示例库
 * 47 个项目 aspiration 填充为 0 的根因）。收件箱把"收进来"和"分流成项目"
 * 拆开：捕获只要标题+来源；转换事务才写 projects / 生命周期事件 / 阶段基线。
 *
 * 草稿不进 projects 的原因：类型/子类型必填约束不能为录入体验破坏；
 * projects 行会进看板/产能/报表，收件箱独立表零污染。
 *
 * 去重：同 (source_channel, source_ref) 唯一，但 rejected 不占键——
 * 被拒编号允许重新捕获（部分唯一索引表达，knex 建表器无 WHERE，走 raw）。
 *
 * 时间戳一律 ISO 字符串（dateText 教训：Date 对象经驱动落成毫秒文本，
 * 字符串比较/过滤失配）；日期字段仅 YYYY-MM-DD。
 */
const SOURCE_CHANNELS = ['jdc_sr', 'internal', 'ticket', 'product', 'email', 'other'] as const;
const STATUSES = ['new', 'converted', 'rejected'] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('demand_intake', (table) => {
    table.string('id').primary();
    table.string('title', 255).notNullable();
    table.text('raw_text');
    table.enum('source_channel', [...SOURCE_CHANNELS]).notNullable().defaultTo('internal');
    table.string('source_ref', 500);
    table.string('requester', 255);
    table.integer('priority_hint');
    table.string('expected_start', 10);
    table.string('expected_finish', 10);
    table.text('note');
    table.enum('status', [...STATUSES]).notNullable().defaultTo('new');
    table.text('reject_reason');
    table.string('converted_project_id', 36);
    table.string('converted_at', 30);
    table.string('created_by', 36);
    table.string('created_at', 30).notNullable();
    table.string('updated_at', 30).notNullable();

    table
      .foreign('converted_project_id')
      .references('id')
      .inTable('projects')
      .onDelete('SET NULL');
    table
      .foreign('created_by')
      .references('id')
      .inTable('people')
      .onDelete('SET NULL');

    table.index(['status', 'created_at'], 'idx_demand_intake_status_created');
    table.index(['source_channel', 'created_at'], 'idx_demand_intake_source_created');
    table.index('converted_project_id', 'idx_demand_intake_converted_project');
  });

  await knex.raw(
    `CREATE UNIQUE INDEX idx_demand_intake_source_ref_unique
       ON demand_intake(source_channel, source_ref)
       WHERE source_ref IS NOT NULL AND source_ref <> '' AND status <> 'rejected'`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('demand_intake');
}
