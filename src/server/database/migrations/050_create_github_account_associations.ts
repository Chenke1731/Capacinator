import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('Creating github_account_associations table...');

  await knex.schema.createTable('github_account_associations', (table) => {
    // Primary key
    table.increments('id').primary();

    // Relationship to github_connections
    table.integer('github_connection_id').notNullable()
      .references('id').inTable('github_connections').onDelete('CASCADE');

    // Relationship to people
    table.integer('person_id').notNullable()
      .references('id').inTable('people').onDelete('CASCADE');

    // Association metadata
    table.text('association_type').notNullable(); // 'automatic' or 'manual'
    table.integer('associated_by_user_id').nullable()
      .references('id').inTable('people').onDelete('SET NULL');
    table.boolean('active').notNullable().defaultTo(true);

    // Timestamps
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for performance
    table.index('github_connection_id', 'idx_github_associations_connection_id');
    table.index('person_id', 'idx_github_associations_person_id');
  });

  // Create unique index to prevent duplicate active associations
  // SQLite partial indexes must be created separately
  await knex.raw(`
    CREATE UNIQUE INDEX idx_github_associations_unique_pair
    ON github_account_associations(github_connection_id, person_id)
    WHERE active = 1
  `);

  console.log('✅ github_account_associations table created successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Dropping github_account_associations table...');

  await knex.schema.dropTableIfExists('github_account_associations');

  console.log('✅ github_account_associations table dropped successfully');
}
