import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('Creating github_connections table...');

  await knex.schema.createTable('github_connections', (table) => {
    // Primary key
    table.increments('id').primary();

    // User relationship
    table.integer('user_id').notNullable()
      .references('id').inTable('people').onDelete('CASCADE');

    // GitHub account information
    table.integer('github_user_id').notNullable();
    table.text('github_username').notNullable();

    // Connection details
    table.text('connection_method').notNullable(); // 'oauth' or 'pat'
    table.text('encrypted_token').notNullable();
    table.datetime('token_expires_at').nullable();
    table.text('refresh_token').nullable();
    table.text('scopes').notNullable(); // JSON array of scopes
    table.text('github_base_url').notNullable().defaultTo('https://api.github.com');
    table.text('status').notNullable().defaultTo('active'); // 'active', 'expired', 'revoked', 'error'
    table.boolean('is_default').notNullable().defaultTo(false);
    table.datetime('last_used_at').nullable();
    table.integer('encryption_version').notNullable().defaultTo(1);

    // Timestamps
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for performance
    table.index('user_id', 'idx_github_connections_user_id');
    table.index('github_user_id', 'idx_github_connections_github_user_id');
  });

  // Create unique index to prevent duplicate active connections for same GitHub account
  // SQLite doesn't support partial indexes in CREATE TABLE, so we add them separately
  await knex.raw(`
    CREATE UNIQUE INDEX idx_github_connections_unique_github_account
    ON github_connections(github_user_id, github_base_url)
    WHERE status = 'active'
  `);

  // Create unique index to ensure at most one default connection per user
  await knex.raw(`
    CREATE UNIQUE INDEX idx_github_connections_one_default_per_user
    ON github_connections(user_id)
    WHERE is_default = 1
  `);

  console.log('✅ github_connections table created successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Dropping github_connections table...');

  await knex.schema.dropTableIfExists('github_connections');

  console.log('✅ github_connections table dropped successfully');
}
