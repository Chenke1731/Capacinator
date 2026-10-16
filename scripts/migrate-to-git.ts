#!/usr/bin/env npx ts-node

/**
 * SQLite to Git Repository Migration Script
 * Feature: 001-git-sync-integration
 * Task: T098
 *
 * One-time migration tool to export existing SQLite database to Git repository JSON format
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-git.ts --database=capacinator.db --output=../capacinator-data
 *   npx ts-node scripts/migrate-to-git.ts --help
 *
 * Options:
 *   --database=<path>  Path to SQLite database file (default: capacinator.db)
 *   --output=<path>    Output directory for Git repository (default: ./capacinator-data-export)
 *   --scenario=<id>    Export specific scenario (default: 'working')
 *   --dry-run          Preview export without writing files
 *   --verbose          Enable verbose logging
 *   --init-git         Initialize Git repository in output directory
 *   --help             Show this help message
 */

import knex from 'knex';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SCHEMA_VERSION } from '../shared/types/json-schemas.js';
import type { ScenarioExportData } from '../shared/types/git-entities.js';

const execFileAsync = promisify(execFile);

// Parse command line arguments
function parseArgs(): {
  database: string;
  output: string;
  scenario: string;
  dryRun: boolean;
  verbose: boolean;
  initGit: boolean;
  help: boolean;
} {
  const args: Record<string, string | boolean> = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  }

  return {
    database: (args['database'] as string) || 'capacinator.db',
    output: (args['output'] as string) || './capacinator-data-export',
    scenario: (args['scenario'] as string) || 'working',
    dryRun: args['dry-run'] === true,
    verbose: args['verbose'] === true,
    initGit: args['init-git'] === true,
    help: args['help'] === true,
  };
}

function showHelp(): void {
  console.log(`
SQLite to Git Repository Migration Script
=========================================

One-time migration tool to export existing SQLite database to Git repository JSON format.

Usage:
  npx ts-node scripts/migrate-to-git.ts [options]

Options:
  --database=<path>  Path to SQLite database file (default: capacinator.db)
  --output=<path>    Output directory for Git repository (default: ./capacinator-data-export)
  --scenario=<id>    Scenario identifier for export (default: 'working')
  --dry-run          Preview export without writing files
  --verbose          Enable verbose logging
  --init-git         Initialize Git repository in output directory
  --help             Show this help message

Examples:
  # Basic export
  npx ts-node scripts/migrate-to-git.ts --database=capacinator.db --output=../capacinator-data

  # Preview what would be exported
  npx ts-node scripts/migrate-to-git.ts --database=capacinator.db --dry-run --verbose

  # Full migration with Git initialization
  npx ts-node scripts/migrate-to-git.ts --database=capacinator.db --output=../capacinator-data --init-git

Repository Structure:
  The script creates the following structure:

  <output>/
  ├── scenarios/
  │   ├── working/
  │   │   ├── projects.json
  │   │   ├── people.json
  │   │   ├── assignments.json
  │   │   └── project_phases.json
  │   └── committed/
  │       └── [same structure]
  ├── master-data/
  │   ├── roles.json
  │   ├── locations.json
  │   └── project_types.json
  └── audit/
      └── changes.jsonl
`);
}

function log(verbose: boolean, ...args: any[]): void {
  if (verbose) {
    console.log('[migrate-to-git]', ...args);
  }
}

async function main(): Promise<void> {
  const config = parseArgs();

  if (config.help) {
    showHelp();
    process.exit(0);
  }

  console.log('\n🚀 SQLite to Git Migration Tool\n');
  console.log('Configuration:');
  console.log(`  Database: ${config.database}`);
  console.log(`  Output:   ${config.output}`);
  console.log(`  Scenario: ${config.scenario}`);
  console.log(`  Dry run:  ${config.dryRun}`);
  console.log(`  Init Git: ${config.initGit}`);
  console.log('');

  // Check if database exists
  try {
    await fs.access(config.database);
  } catch {
    console.error(`❌ Database file not found: ${config.database}`);
    process.exit(1);
  }

  // Initialize database connection
  const db = knex({
    client: 'better-sqlite3',
    connection: {
      filename: config.database,
    },
    useNullAsDefault: true,
  });

  try {
    // Verify database tables exist
    log(config.verbose, 'Verifying database schema...');

    const tables = await db.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'"
    );
    const tableNames = tables.map((t: { name: string }) => t.name);

    const requiredTables = ['projects', 'people', 'project_assignments', 'project_phases', 'roles', 'locations', 'project_types'];
    const missingTables = requiredTables.filter((t) => !tableNames.includes(t));

    if (missingTables.length > 0) {
      console.error(`❌ Missing required tables: ${missingTables.join(', ')}`);
      process.exit(1);
    }

    log(config.verbose, `Found tables: ${tableNames.join(', ')}`);

    // Create output directory structure
    if (!config.dryRun) {
      log(config.verbose, 'Creating output directory structure...');

      const dirs = [
        config.output,
        path.join(config.output, 'scenarios', config.scenario),
        path.join(config.output, 'scenarios', 'committed'),
        path.join(config.output, 'master-data'),
        path.join(config.output, 'audit'),
      ];

      for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
      }
    }

    // Helper to create export data wrapper
    function createExportData(data: any[], scenarioId: string = config.scenario): ScenarioExportData {
      return {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        exportedBy: 'migrate-to-git',
        scenarioId,
        data,
      };
    }

    // Helper to write JSON file
    async function writeJSON(filePath: string, data: any): Promise<void> {
      const fullPath = path.join(config.output, filePath);

      if (config.dryRun) {
        console.log(`  [DRY RUN] Would write: ${filePath} (${JSON.stringify(data).length} bytes)`);
      } else {
        await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`  ✓ Wrote: ${filePath}`);
      }
    }

    // Export scenario data
    console.log('\n📦 Exporting scenario data...\n');

    // Projects
    const projects = await db('projects').select('*');
    console.log(`  Found ${projects.length} projects`);
    await writeJSON(`scenarios/${config.scenario}/projects.json`, createExportData(projects));

    // People
    const people = await db('people').select('*');
    console.log(`  Found ${people.length} people`);
    await writeJSON(`scenarios/${config.scenario}/people.json`, createExportData(people));

    // Assignments
    const assignments = await db('project_assignments').select('*');
    console.log(`  Found ${assignments.length} assignments`);
    await writeJSON(`scenarios/${config.scenario}/assignments.json`, createExportData(assignments));

    // Project Phases
    const phases = await db('project_phases').select('*');
    console.log(`  Found ${phases.length} project phases`);
    await writeJSON(`scenarios/${config.scenario}/project_phases.json`, createExportData(phases));

    // Also export to committed scenario (initial state)
    console.log('\n📦 Creating committed scenario (copy of working)...\n');
    await writeJSON('scenarios/committed/projects.json', createExportData(projects, 'committed'));
    await writeJSON('scenarios/committed/people.json', createExportData(people, 'committed'));
    await writeJSON('scenarios/committed/assignments.json', createExportData(assignments, 'committed'));
    await writeJSON('scenarios/committed/project_phases.json', createExportData(phases, 'committed'));

    // Export master data
    console.log('\n📦 Exporting master data...\n');

    // Roles
    const roles = await db('roles').select('*');
    console.log(`  Found ${roles.length} roles`);
    await writeJSON('master-data/roles.json', {
      schemaVersion: SCHEMA_VERSION,
      data: roles,
    });

    // Locations
    const locations = await db('locations').select('*');
    console.log(`  Found ${locations.length} locations`);
    await writeJSON('master-data/locations.json', {
      schemaVersion: SCHEMA_VERSION,
      data: locations,
    });

    // Project Types
    const projectTypes = await db('project_types').select('*');
    console.log(`  Found ${projectTypes.length} project types`);
    await writeJSON('master-data/project_types.json', {
      schemaVersion: SCHEMA_VERSION,
      data: projectTypes,
    });

    // Export audit log (if table exists)
    console.log('\n📦 Exporting audit log...\n');

    if (tableNames.includes('audit_log')) {
      const auditLogs = await db('audit_log').select('*').orderBy('changed_at', 'asc');
      console.log(`  Found ${auditLogs.length} audit log entries`);

      if (!config.dryRun) {
        // Write as JSONL (one JSON object per line)
        const jsonlContent = auditLogs.map((log: any) => JSON.stringify(log)).join('\n');
        const auditPath = path.join(config.output, 'audit', 'changes.jsonl');
        await fs.writeFile(auditPath, jsonlContent, 'utf-8');
        console.log(`  ✓ Wrote: audit/changes.jsonl`);
      } else {
        console.log(`  [DRY RUN] Would write: audit/changes.jsonl (${auditLogs.length} lines)`);
      }
    } else {
      console.log('  ⚠ No audit_log table found, skipping audit export');
    }

    // Initialize Git repository if requested
    if (config.initGit && !config.dryRun) {
      console.log('\n🔧 Initializing Git repository...\n');

      try {
        const outputDir = path.resolve(config.output);

        // Initialize git (using execFile to avoid shell injection)
        await execFileAsync('git', ['init'], { cwd: outputDir });
        console.log('  ✓ Initialized Git repository');

        // Create .gitignore
        const gitignore = `
# OS files
.DS_Store
Thumbs.db

# Editor files
*.swp
*.swo
.vscode/
.idea/

# Temporary files
*.tmp
*.temp
`;
        await fs.writeFile(path.join(config.output, '.gitignore'), gitignore.trim(), 'utf-8');
        console.log('  ✓ Created .gitignore');

        // Stage all files
        await execFileAsync('git', ['add', '.'], { cwd: outputDir });
        console.log('  ✓ Staged all files');

        // Create initial commit
        const commitMessage = `Initial migration from SQLite (${new Date().toISOString()})`;
        await execFileAsync('git', ['commit', '-m', commitMessage], { cwd: outputDir });
        console.log('  ✓ Created initial commit');
      } catch (gitError) {
        console.error('  ⚠ Git initialization failed:', (gitError as Error).message);
        console.log('  You can manually initialize Git later.');
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Migration complete!\n');

    const summary = {
      projects: projects.length,
      people: people.length,
      assignments: assignments.length,
      phases: phases.length,
      roles: roles.length,
      locations: locations.length,
      projectTypes: projectTypes.length,
    };

    console.log('Summary:');
    Object.entries(summary).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });

    console.log(`\nOutput directory: ${path.resolve(config.output)}`);

    if (config.dryRun) {
      console.log('\n⚠ This was a dry run. No files were written.');
      console.log('Run without --dry-run to perform the actual migration.');
    } else {
      console.log('\nNext steps:');
      console.log('1. Review the exported files in the output directory');
      console.log('2. Create a GitHub Enterprise repository');
      console.log('3. Add remote and push: git remote add origin <url> && git push -u origin main');
      console.log('4. Configure Capacinator to use the repository');
    }
  } finally {
    await db.destroy();
  }
}

// Run the migration
main().catch((error) => {
  console.error('\n❌ Migration failed:', error.message);
  if (process.env.VERBOSE) {
    console.error(error.stack);
  }
  process.exit(1);
});
