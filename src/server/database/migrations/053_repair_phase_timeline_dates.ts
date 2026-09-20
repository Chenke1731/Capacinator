import { Knex } from 'knex';

/**
 * Repair project_phases_timeline rows written with epoch-millisecond numbers
 * by the old project-creation / custom-phase code paths.
 *
 * SQLite compares numbers and strings by type (any number < any text), so
 * numeric dates silently fail every string comparison — most visibly the
 * dashboard "current projects" count, which was permanently 0.
 *
 * The writers were fixed to store ISO 'YYYY-MM-DD' strings (canonical
 * format used by seeds, the cascade update path, and all report queries);
 * this migration converts any legacy numeric rows to the same format.
 * 'localtime' matches how those epoch values were produced from local-time
 * JS Date objects.
 */
export async function up(knex: Knex): Promise<void> {
  console.log('Repairing project_phases_timeline date format...');

  const repaired = await knex('project_phases_timeline')
    .whereRaw("typeof(start_date) != 'text' OR typeof(end_date) != 'text'")
    .update({
      start_date: knex.raw("date(start_date/1000, 'unixepoch', 'localtime')"),
      end_date: knex.raw("date(end_date/1000, 'unixepoch', 'localtime')")
    });

  console.log(`✅ repaired ${repaired} phase timeline rows (epoch-ms → ISO date)`);
}

export async function down(knex: Knex): Promise<void> {
  // Not reversible: the original epoch values are not recoverable after
  // conversion, and reverting would reintroduce the format mismatch.
  void knex;
}
