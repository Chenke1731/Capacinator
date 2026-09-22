import { Knex } from 'knex';

/**
 * 062 — 引用码数字化: projects.seq_number
 *
 * 2026-09-22 裁决: 详情页引用码用纯数字序号(用户:#g4iere 这类字母组合
 * 奇怪,数字才好口头指代"3号需求")。派生排位(rank/rowid)会因删除/导入
 * 变动而失效——引用码必须稳定,所以落真列: 创建序号,回填 1..N(按
 * created_at,id 兜底排序),新建走 max+1(单用户无并发竞争)。
 *
 * 仅服务引用码(详情页 chip + 需求台 #N 搜索定位),不进列表列,
 * 不承载域语义。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.integer('seq_number');
  });
  await knex.raw(`
    UPDATE projects SET seq_number = (
      SELECT rn FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM projects
      ) t WHERE t.id = projects.id
    )
  `);
  await knex.raw('CREATE UNIQUE INDEX projects_seq_number_unique ON projects (seq_number)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS projects_seq_number_unique');
  await knex.schema.alterTable('projects', (table) => {
    table.dropColumn('seq_number');
  });
}
