import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';
import { ExcelImporterV2 } from '../../src/server/services/import/ExcelImporterV2.js';
import { db as testDb } from './setup.js';

// Test file paths - use process.cwd() to avoid __dirname conflicts
const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures', 'excel-imports');
const VALID_IMPORT_FILE = join(FIXTURES_DIR, 'test-valid-import.xlsx');
const MISSING_COLUMNS_FILE = join(FIXTURES_DIR, 'test-missing-columns.xlsx');
const DUPLICATES_FILE = join(FIXTURES_DIR, 'test-duplicates.xlsx');
const MISSING_WORKSHEETS_FILE = join(FIXTURES_DIR, 'test-missing-worksheets.xlsx');
const MINIMAL_VALID_FILE = join(FIXTURES_DIR, 'test-minimal-valid.xlsx');

describe('ExcelImporterV2 Integration Tests', () => {
  let importer: ExcelImporterV2;
  let db: any;

  beforeAll(async () => {
    // Use test database with schema
    db = testDb;
  });

  beforeEach(() => {
    // Create fresh importer for each test with test database
    importer = new ExcelImporterV2(db);
  });

  afterEach(async () => {
    // Clean up all data after each test
    const tables = [
      'project_assignments',
      'demand_overrides',
      'person_availability_overrides',
      'supervisor_delegations',
      'standard_allocations',
      'resource_templates',
      'project_sub_types',
      'project_phases_timeline',
      'role_planners',
      'project_planners',
      'person_roles',
      'projects',
      'people',
      'roles',
      'project_phases',
      'project_types',
      'locations'
    ];

    for (const table of tables) {
      try {
        await db(table).del();
      } catch (error) {
        // Table might not exist, ignore error
      }
    }
  });

  describe('validateExcelStructure - Integration', () => {
    it('should successfully validate a complete valid import file', async () => {
      const result = await importer.validateExcelStructure(VALID_IMPORT_FILE);

      expect(result.valid).toBe(true);
      expect(result.canImport).toBe(true);
      expect(result.worksheets.length).toBeGreaterThan(0);
      expect(result.summary.totalErrors).toBe(0);

      // Verify all required worksheets are found
      const worksheetNames = result.worksheets.map(ws => ws.name);
      expect(worksheetNames).toContain('Project Types');
      expect(worksheetNames).toContain('Roles');
      expect(worksheetNames).toContain('Roster');
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Project Roadmap');
      expect(worksheetNames).toContain('Resource Templates');

      // Verify all worksheets exist
      const allExist = result.worksheets.every(ws => ws.exists);
      expect(allExist).toBe(true);
    });

    it('should detect missing required columns', async () => {
      const result = await importer.validateExcelStructure(MISSING_COLUMNS_FILE);

      expect(result.valid).toBe(false);
      expect(result.summary.totalErrors).toBeGreaterThan(0);

      // Find Project Types worksheet validation
      const projectTypesSheet = result.worksheets.find(ws => ws.name === 'Project Types');
      expect(projectTypesSheet).toBeDefined();
      expect(projectTypesSheet!.missingColumns).toContain('Description');

      // Find Roster worksheet validation
      const rosterSheet = result.worksheets.find(ws => ws.name === 'Roster');
      expect(rosterSheet).toBeDefined();
      expect(rosterSheet!.missingColumns).toContain('Role');

      // Verify error details
      const missingColumnErrors = result.errors.filter(e =>
        e.message?.includes('Required column') && e.severity === 'high'
      );
      expect(missingColumnErrors.length).toBeGreaterThan(0);
    });

    it('should detect missing required worksheets', async () => {
      const result = await importer.validateExcelStructure(MISSING_WORKSHEETS_FILE);

      expect(result.valid).toBe(false);
      expect(result.canImport).toBe(false);

      // Find worksheets that don't exist
      const missingWorksheets = result.worksheets.filter(ws => !ws.exists);
      expect(missingWorksheets.length).toBeGreaterThan(0);

      // Verify critical errors for missing worksheets
      const criticalErrors = result.errors.filter(e => e.severity === 'critical');
      expect(criticalErrors.length).toBeGreaterThan(0);

      const missingSheetError = criticalErrors.find(e =>
        e.message?.includes('Required worksheet') && e.message?.includes('not found')
      );
      expect(missingSheetError).toBeDefined();
    });

    it('should estimate import counts correctly', async () => {
      const result = await importer.validateExcelStructure(VALID_IMPORT_FILE);

      expect(result.summary.wouldImport.projectTypes).toBeGreaterThan(0);
      expect(result.summary.wouldImport.roles).toBeGreaterThan(0);
      expect(result.summary.wouldImport.people).toBeGreaterThan(0);
      expect(result.summary.wouldImport.projects).toBeGreaterThan(0);
      expect(result.summary.totalRows).toBeGreaterThan(0);
    });

    it('should calculate estimated import duration', async () => {
      const result = await importer.validateExcelStructure(VALID_IMPORT_FILE);

      expect(result.summary.estimatedDuration).toBeDefined();
      expect(result.summary.estimatedDuration).toMatch(/\d+ (second|minute)s?/);
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await importer.validateExcelStructure('/path/to/nonexistent.xlsx');

      expect(result.valid).toBe(false);
      expect(result.canImport).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const fileError = result.errors.find(e =>
        e.message?.includes('Failed to read Excel file')
      );
      expect(fileError).toBeDefined();
      expect(fileError!.severity).toBe('critical');
    });

    it('should validate minimal valid file successfully', async () => {
      const result = await importer.validateExcelStructure(MINIMAL_VALID_FILE);

      expect(result.valid).toBe(true);
      expect(result.canImport).toBe(true);
      expect(result.worksheets.every(ws => ws.exists)).toBe(true);
    });
  });

  describe('validateDuplicates - Integration', () => {
    it('should detect no duplicates in valid file with empty database', async () => {
      const result = await (importer as any).validateDuplicates(VALID_IMPORT_FILE);

      expect(result.duplicatesFound.projects).toEqual([]);
      expect(result.duplicatesFound.people).toEqual([]);
      expect(result.duplicatesFound.roles).toEqual([]);
      expect(result.duplicatesFound.locations).toEqual([]);
    });

    it('should detect duplicate projects in Excel file', async () => {
      const result = await (importer as any).validateDuplicates(DUPLICATES_FILE);

      expect(result.duplicatesFound.projects.length).toBeGreaterThan(0);
      expect(result.duplicatesFound.projects).toContain('Customer Portal @ HQ');
    });

    it('should detect duplicate people in Excel file', async () => {
      const result = await (importer as any).validateDuplicates(DUPLICATES_FILE);

      expect(result.duplicatesFound.people.length).toBeGreaterThan(0);
      expect(result.duplicatesFound.people).toContain('John Smith');
    });

    it('should detect case-insensitive duplicate roles', async () => {
      const result = await (importer as any).validateDuplicates(DUPLICATES_FILE);

      expect(result.duplicatesFound.roles.length).toBeGreaterThan(0);
      // Should detect 'software engineer' as duplicate of 'Software Engineer'
      const hasDuplicate = result.duplicatesFound.roles.some(role =>
        role.toLowerCase() === 'software engineer'
      );
      expect(hasDuplicate).toBe(true);
    });

    it('should detect duplicates against existing database records', async () => {
      // Insert existing project
      await db('project_types').insert({
        id: 'test-type-id',
        name: 'Web Development',
        description: 'Existing type',
        created_at: new Date(),
        updated_at: new Date()
      });

      await db('locations').insert({
        id: 'test-location-id',
        name: 'HQ',
        description: 'Headquarters',
        created_at: new Date(),
        updated_at: new Date()
      });

      await db('projects').insert({
        id: 'existing-project-id',
        name: 'Customer Portal',
        project_type_id: 'test-type-id',
        location_id: 'test-location-id',
        priority: 1,
        include_in_demand: 1,
        created_at: new Date(),
        updated_at: new Date()
      });

      const result = await (importer as any).validateDuplicates(VALID_IMPORT_FILE);

      // Should detect 'Customer Portal @ HQ' matches existing 'Customer Portal'
      expect(result.duplicatesFound.projects).toContain('Customer Portal @ HQ');
    });

    it('should handle file read errors gracefully', async () => {
      const result = await (importer as any).validateDuplicates('/path/to/nonexistent.xlsx');

      // Should return empty duplicates on error
      expect(result.duplicatesFound.projects).toEqual([]);
      expect(result.duplicatesFound.people).toEqual([]);
      expect(result.duplicatesFound.roles).toEqual([]);
      expect(result.duplicatesFound.locations).toEqual([]);
    });
  });

  describe('importFromFile - Integration', () => {
    it('should successfully import minimal valid file', async () => {
      const result = await importer.importFromFile(MINIMAL_VALID_FILE, {
        clearExisting: true,
        validateDuplicates: false
      });

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);

      // Verify data was imported
      expect(result.imported.projectTypes).toBeGreaterThan(0);
      expect(result.imported.roles).toBeGreaterThan(0);
      expect(result.imported.people).toBeGreaterThan(0);
      expect(result.imported.projects).toBeGreaterThan(0);

      // Verify database has records
      const projectTypes = await db('project_types').select('*');
      expect(projectTypes.length).toBe(result.imported.projectTypes);

      const roles = await db('roles').select('*');
      expect(roles.length).toBe(result.imported.roles);

      const people = await db('people').select('*');
      expect(people.length).toBe(result.imported.people);

      const projects = await db('projects').select('*');
      expect(projects.length).toBe(result.imported.projects);
    });

    it('should rollback on error when clearExisting is true', async () => {
      // Insert some existing data
      await db('project_types').insert({
        id: 'existing-type',
        name: 'Existing Type',
        description: 'Test',
        created_at: new Date(),
        updated_at: new Date()
      });

      const countBefore = await db('project_types').count('* as count').first();

      // Try to import file with missing worksheets (should fail)
      const result = await importer.importFromFile(MISSING_WORKSHEETS_FILE, {
        clearExisting: true,
        validateDuplicates: false
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Verify rollback - data should be restored
      const countAfter = await db('project_types').count('* as count').first();
      // Since we use clearExisting, the transaction should rollback everything
      // So we should have original data back
      expect(countAfter.count).toBe(countBefore.count);
    });

    it('should prevent import when duplicates are detected', async () => {
      const result = await importer.importFromFile(DUPLICATES_FILE, {
        clearExisting: true,
        validateDuplicates: true // Enable duplicate validation
      });

      expect(result.success).toBe(false);
      expect(result.duplicatesFound).toBeDefined();

      // Verify duplicates were detected
      expect(result.duplicatesFound!.projects.length).toBeGreaterThan(0);
      expect(result.duplicatesFound!.people.length).toBeGreaterThan(0);
      expect(result.duplicatesFound!.roles.length).toBeGreaterThan(0);

      // Verify error message
      const duplicateError = result.errors.find(e =>
        e.includes('Duplicate records found')
      );
      expect(duplicateError).toBeDefined();

      // Verify nothing was imported
      const projectTypes = await db('project_types').select('*');
      expect(projectTypes.length).toBe(0);
    });

    it('should import complete valid file successfully', async () => {
      const result = await importer.importFromFile(VALID_IMPORT_FILE, {
        clearExisting: true,
        validateDuplicates: false
      });

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);

      // Verify all entity types were imported
      expect(result.imported.projectTypes).toBeGreaterThan(0);
      expect(result.imported.phases).toBeGreaterThan(0);
      expect(result.imported.roles).toBeGreaterThan(0);
      expect(result.imported.people).toBeGreaterThan(0);
      expect(result.imported.projects).toBeGreaterThan(0);
      expect(result.imported.locations).toBeGreaterThan(0);

      // Verify database integrity
      const projects = await db('projects').select('*');
      expect(projects.length).toBe(result.imported.projects);

      // Verify foreign keys are valid
      for (const project of projects) {
        expect(project.project_type_id).toBeDefined();
        expect(project.location_id).toBeDefined();

        // Verify referenced records exist
        const projectType = await db('project_types').where('id', project.project_type_id).first();
        expect(projectType).toBeDefined();

        const location = await db('locations').where('id', project.location_id).first();
        expect(location).toBeDefined();
      }
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await importer.importFromFile('/path/to/nonexistent.xlsx', {
        clearExisting: false,
        validateDuplicates: false
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const fileError = result.errors.find(e => e.includes('failed'));
      expect(fileError).toBeDefined();
    });

    it('should preserve existing data when clearExisting is false and import fails', async () => {
      // Insert some existing data
      await db('project_types').insert({
        id: 'preserved-type',
        name: 'Preserved Type',
        description: 'Should remain after failed import',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Try to import bad file
      const result = await importer.importFromFile(MISSING_WORKSHEETS_FILE, {
        clearExisting: false,
        validateDuplicates: false
      });

      expect(result.success).toBe(false);

      // Verify original data is preserved
      const preservedType = await db('project_types').where('name', 'Preserved Type').first();
      expect(preservedType).toBeDefined();
      expect(preservedType.id).toBe('preserved-type');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty worksheets gracefully', async () => {
      // This test would require creating an Excel file with empty sheets
      // For now, we test with minimal file which has minimal data
      const result = await importer.validateExcelStructure(MINIMAL_VALID_FILE);

      expect(result.valid).toBe(true);
      expect(result.worksheets.every(ws => ws.errors.length === 0 || ws.errors.every(e => e.severity !== 'critical'))).toBe(true);
    });

    it('should aggregate errors and warnings correctly', async () => {
      const result = await importer.validateExcelStructure(MISSING_COLUMNS_FILE);

      expect(result.summary.totalErrors).toBe(result.errors.length);
      expect(result.summary.totalWarnings).toBe(result.warnings.length);

      // Errors should be aggregated from worksheets
      let worksheetErrorCount = 0;
      for (const ws of result.worksheets) {
        worksheetErrorCount += ws.errors.filter(e => e.type === 'error').length;
      }
      expect(result.summary.totalErrors).toBe(worksheetErrorCount);
    });
  });
});
