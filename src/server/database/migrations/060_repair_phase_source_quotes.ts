import { Knex } from 'knex';

/**
 * 060 — 修复 041 遗留的坏 schema 文本(双引号字面量)
 *
 * 041 用 `DEFAULT "template"` / `CHECK (phase_source IN ("template","custom"))`
 * (MySQL 风格双引号)给 project_phases_timeline 加列。SQLite 平时按"双引号
 * 字符串误用"容忍它,但任何触发全 schema 引用解析的 DDL——ALTER TABLE
 * RENAME COLUMN / RENAME TO(含 knex 重建表的收尾改名)——都会因
 * "no such column: template" 直接失败(2026-09-22 迁移 061 时实锤)。
 *
 * 修法: 摘掉引用本表的视图/触发器(RENAME 重解析要求全 schema 无悬空引用,
 * 本库实证: project_demands_view 会让中间态炸掉) → 建正确单引号定义的新表
 * → 搬数 → DROP 旧表(坏文本随行消失) → RENAME 回原名 → 重建索引与
 * 视图(按 sqlite_master 原文重建,不复制粘贴定义)。
 */
export async function up(knex: Knex): Promise<void> {
  // 引用本表的视图/触发器: 记录原文,先摘后还原
  const dependents = await knex.raw(
    `SELECT type, name, sql FROM sqlite_master
      WHERE type IN ('view', 'trigger')
        AND sql LIKE '%project_phases_timeline%'`
  );
  const saved: Array<{ type: string; name: string; sql: string }> = dependents;
  for (const d of saved) {
    await knex.raw(`DROP ${d.type.toUpperCase()} IF EXISTS ${d.name}`);
  }

  await knex.raw(`
    CREATE TABLE project_phases_timeline__repair (
      \`id\` varchar(36) default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      \`project_id\` varchar(36),
      \`phase_id\` varchar(36),
      \`start_date\` date not null,
      \`end_date\` date not null,
      \`created_at\` datetime not null default CURRENT_TIMESTAMP,
      \`updated_at\` datetime not null default CURRENT_TIMESTAMP,
      phase_source TEXT DEFAULT 'template' NOT NULL CHECK (phase_source IN ('template', 'custom')),
      template_phase_id TEXT NULL,
      is_deletable INTEGER DEFAULT 1 NOT NULL,
      original_duration_days INTEGER NULL,
      template_min_duration_days INTEGER NULL,
      template_max_duration_days INTEGER NULL,
      is_duration_customized INTEGER DEFAULT 0 NOT NULL,
      is_name_customized INTEGER DEFAULT 0 NOT NULL,
      template_compliance_data TEXT NULL,
      foreign key(\`project_id\`) references \`projects\`(\`id\`) on delete CASCADE,
      foreign key(\`phase_id\`) references \`project_phases\`(\`id\`) on delete RESTRICT,
      primary key (\`id\`)
    )
  `);
  await knex.raw(`
    INSERT INTO project_phases_timeline__repair
      (id, project_id, phase_id, start_date, end_date, created_at, updated_at,
       phase_source, template_phase_id, is_deletable, original_duration_days,
       template_min_duration_days, template_max_duration_days,
       is_duration_customized, is_name_customized, template_compliance_data)
    SELECT
      id, project_id, phase_id, start_date, end_date, created_at, updated_at,
      phase_source, template_phase_id, is_deletable, original_duration_days,
      template_min_duration_days, template_max_duration_days,
      is_duration_customized, is_name_customized, template_compliance_data
    FROM project_phases_timeline
  `);
  await knex.raw('DROP TABLE project_phases_timeline');
  await knex.raw('ALTER TABLE project_phases_timeline__repair RENAME TO project_phases_timeline');

  await knex.raw('CREATE UNIQUE INDEX project_phases_timeline_project_id_phase_id_unique on project_phases_timeline (project_id, phase_id)');
  await knex.raw('CREATE INDEX project_phases_timeline_project_id_start_date_end_date_index on project_phases_timeline (project_id, start_date, end_date)');
  await knex.raw('CREATE INDEX project_phases_timeline_phase_source_index ON project_phases_timeline (phase_source)');
  await knex.raw('CREATE INDEX project_phases_timeline_template_phase_id_index ON project_phases_timeline (template_phase_id)');
  await knex.raw('CREATE INDEX project_phases_timeline_is_deletable_index ON project_phases_timeline (is_deletable)');

  for (const d of saved) {
    await knex.raw(d.sql);
  }
}

export async function down(knex: Knex): Promise<void> {
  // 坏定义无需恢复——回到 041 的错误文本没有任何价值;061 之前的库结构不受影响
  await knex.raw('SELECT 1 WHERE 0 = 1');
}

