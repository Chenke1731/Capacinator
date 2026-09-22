import { Knex } from 'knex';

/**
 * 061 — 编号字段泛化: projects.ar_number → projects.external_number
 *
 * 2026-09-22 裁决(混排世界): SR/AR 粒度是事项自身属性,不是树结构位置;
 * SR 与 AR 都有外部编号,前缀(SRxxx/ARxxx)自述粒度,统一为一个自由文本
 * 字段,不校验格式(与版本字段同一哲学)。
 *
 * 用 RENAME COLUMN 原地改名: 数据零搬移、约束/索引/视图全保留。
 * 前置依赖 060: 041 遗留的双引号字面量坏 schema 文本会令任何
 * RENAME 的全 schema 引用解析直接失败(实测)。060 修复后本迁移一步到位。
 * (踩坑记录: 试过加列+knex dropColumn 重建表——重建中间态令引用
 * projects 的视图悬空、且 knex 的 PRAGMA foreign_keys 开关被迁移事务
 * 空操作化,DDL 在 FK 开启连接上炸;全部不如修好 060 后的原地改名。)
 *
 * 告警联动: LifecycleService 新增 NO_ITERATION_NUMBER
 * (in_iteration 而编号为空)。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.renameColumn('ar_number', 'external_number');
  });
  // 事件表同列: transition 时记录的编号快照,一并泛化
  await knex.schema.alterTable('project_lifecycle_events', (table) => {
    table.renameColumn('ar_number', 'external_number');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.renameColumn('external_number', 'ar_number');
  });
  await knex.schema.alterTable('project_lifecycle_events', (table) => {
    table.renameColumn('external_number', 'ar_number');
  });
}
