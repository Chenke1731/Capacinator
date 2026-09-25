import type { Knex } from 'knex';

/**
 * 065 — 通知子系统三表补齐（2026-09-25）
 *
 * EmailService / NotificationsController 一直读写 email_templates、
 * notification_preferences、notification_history，但从未有任何 migration
 * 创建它们——通知/邮件功能在所有环境（dev/prod/e2e）静默失败，每次
 * assignment 写操作都产生 SQL 报错噪音，且异步链上的报错掩盖了审计
 * 行为的可观测性（变异校准 M17 由此而来）。
 *
 * createTableIfNotExists：对任何手工建过表的环境是 no-op，纯增量。
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('email_templates'))) {
    await knex.schema.createTable('email_templates', table => {
      table.string('id', 36).primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
      table.string('name', 255).notNullable();
      table.string('type', 100).notNullable();
      table.string('subject', 500).notNullable();
      table.text('body_html').nullable();
      table.text('body_text').nullable();
      table.text('variables').nullable(); // JSON array of variable names
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.unique(['name']);
    });
  }

  if (!(await knex.schema.hasTable('notification_preferences'))) {
    await knex.schema.createTable('notification_preferences', table => {
      table.string('id', 36).primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
      table.string('user_id', 36).notNullable();
      table.string('type', 100).notNullable();
      table.boolean('enabled').defaultTo(true);
      table.boolean('email_enabled').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.unique(['user_id', 'type']);
      table.index(['user_id']);
    });
  }

  if (!(await knex.schema.hasTable('notification_history'))) {
    await knex.schema.createTable('notification_history', table => {
      table.string('id', 36).primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
      table.string('user_id', 36).notNullable();
      table.string('type', 100).notNullable();
      table.string('subject', 500).nullable();
      table.text('body').nullable();
      table.string('email_to', 255).nullable();
      table.string('email_from', 255).nullable();
      table.timestamp('sent_at').defaultTo(knex.fn.now()).notNullable();
      table.string('status', 20).notNullable(); // 'sent' | 'failed'
      table.text('error_message').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.index(['user_id']);
      table.index(['sent_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = ['notification_history', 'notification_preferences', 'email_templates'] as const;
  for (const t of tables) {
    if (await knex.schema.hasTable(t)) {
      await knex.schema.dropTable(t);
    }
  }
}
