import { getAuditedDb } from '../../database/index.js';
import { logger } from '../logging/config.js';
import type { Worksheet } from 'exceljs';

// Import ExcelJS using dynamic import for better ES module compatibility
let ExcelJS: any;

async function initializeExcelJS() {
  if (!ExcelJS) {
    ExcelJS = (await import('exceljs')).default;
  }
  return ExcelJS;
}

// Type alias for ExcelJS worksheet
type ExcelWorksheet = Worksheet;
import {
  fiscalWeekToDate,
  extractFiscalWeekColumns,
  parseProjectSite,
  PHASE_ABBREVIATIONS
} from '../../utils/fiscalWeek.js';
import { v4 as uuidv4 } from 'uuid';
import { ImportOptions, ValidationResult, ValidationError, WorksheetValidation } from './ExcelImporter.js';
import { ImportErrorCollector } from './ImportError.js';

export interface ImportResultV2 {
  success: boolean;
  imported: {
    locations: number;
    projectTypes: number;
    phases: number;
    roles: number;
    people: number;
    projects: number;
    standardAllocations: number;
    assignments: number;
    phaseTimelines: number;
    demands: number;
    availabilityOverrides: number;
  };
  errors: string[];
  warnings: string[];
  duplicatesFound?: {
    projects: string[];
    people: string[];
    roles: string[];
    locations: string[];
  };
}

export class ExcelImporterV2 {
  private db: any;
  private planOwnerMap: Map<string, string> = new Map(); // name -> person_id
  private roleMap: Map<string, string> = new Map(); // name -> role_id
  private projectMap: Map<string, string> = new Map(); // name -> project_id
  private phaseMap: Map<string, string> = new Map(); // abbreviation -> phase_id

  constructor(db?: any) {
    this.db = db || getAuditedDb();
  }

  private async clearExistingData() {
    const tables = [
      'project_assignments',
      'demand_overrides',
      'person_availability_overrides',
      'supervisor_delegations',
      'standard_allocations',
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
      await this.db(table).del();
    }
  }

  private async clearExistingDataInTransaction(trx: any) {
    const tables = [
      'project_assignments',
      'demand_overrides',
      'person_availability_overrides',
      'supervisor_delegations',
      'standard_allocations',
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
      await trx(table).del();
    }
  }

  async validateExcelStructure(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      canImport: true,
      worksheets: [],
      summary: {
        totalErrors: 0,
        totalWarnings: 0,
        totalRows: 0,
        estimatedDuration: '0 seconds',
        wouldImport: {
          locations: 0,
          projectTypes: 0,
          phases: 0,
          roles: 0,
          people: 0,
          projects: 0,
          standardAllocations: 0,
          assignments: 0
        }
      },
      errors: [],
      warnings: []
    };

    try {
      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      await workbook.xlsx.readFile(filePath);

      // Define required worksheets for V2 format (fiscal weeks)
      const requiredWorksheets = [
        {
          name: 'Project Types',
          aliases: ['Project Types'],
          requiredColumns: ['Type', 'Description'],
          optionalColumns: ['Location', 'Default Phase']
        },
        {
          name: 'Roles',
          aliases: ['Roles'],
          requiredColumns: ['Role', 'Plan Owner', 'CW Option', 'Data Access'],
          optionalColumns: ['Description', 'Department']
        },
        {
          name: 'Roster',
          aliases: ['Roster'],
          requiredColumns: ['Name', 'Role'],
          optionalColumns: ['Email', 'Location', 'Supervisor', 'Plan Owner']
        },
        {
          name: 'Projects',
          aliases: ['Projects'],
          requiredColumns: ['Project', 'Type', 'Location', 'Priority'],
          optionalColumns: ['Description', 'Plan Owner']
        },
        {
          name: 'Project Roadmap',
          aliases: ['Project Roadmap'],
          requiredColumns: ['Project'],
          optionalColumns: ['Phase', 'Location'] // Plus fiscal week columns
        },
        {
          name: 'Resource Templates',
          aliases: ['Resource Templates'],
          requiredColumns: ['Type', 'Phase', 'Role'],
          optionalColumns: ['Allocation', 'Description']
        }
      ];

      // Validate each required worksheet
      for (const worksheetDef of requiredWorksheets) {
        let worksheet = null;
        let foundName = '';
        
        // Try to find worksheet by name or alias
        for (const alias of worksheetDef.aliases) {
          worksheet = workbook.getWorksheet(alias);
          if (worksheet) {
            foundName = alias;
            break;
          }
        }

        const worksheetValidation: WorksheetValidation = {
          name: worksheetDef.name,
          exists: !!worksheet,
          requiredColumns: worksheetDef.requiredColumns,
          missingColumns: [],
          extraColumns: [],
          rowCount: worksheet ? worksheet.rowCount - 1 : 0, // Exclude header row
          validRows: 0,
          errors: [],
          estimatedImportCount: 0
        };

        if (!worksheet) {
          worksheetValidation.errors.push({
            type: 'error',
            severity: 'critical',
            worksheet: worksheetDef.name,
            message: `Required worksheet '${worksheetDef.name}' not found`,
            suggestion: `Add a worksheet named '${worksheetDef.name}' with V2 format structure`
          });
          result.valid = false;
          result.canImport = false;
        } else {
          // Validate column headers
          const headerRow = worksheet.getRow(1);
          const actualColumns = (headerRow.values as string[]).slice(1); // Remove first empty element
          
          // Check for missing required columns
          for (const reqCol of worksheetDef.requiredColumns) {
            if (!actualColumns.find(col => col && col.toString().toLowerCase().includes(reqCol.toLowerCase()))) {
              worksheetValidation.missingColumns.push(reqCol);
              worksheetValidation.errors.push({
                type: 'error',
                severity: 'high',
                worksheet: foundName,
                column: reqCol,
                message: `Required column '${reqCol}' not found`,
                suggestion: `Add a column with header '${reqCol}' or similar`
              });
            }
          }

          // Special validation for fiscal week columns in certain worksheets
          if (worksheetDef.name === 'Project Roadmap' || worksheetDef.name === 'Resource Templates') {
            const fiscalWeekColumns = extractFiscalWeekColumns(actualColumns);
            if (fiscalWeekColumns.length === 0) {
              worksheetValidation.errors.push({
                type: 'warning',
                severity: 'medium',
                worksheet: foundName,
                message: 'No fiscal week columns found',
                suggestion: 'Add columns for fiscal weeks (e.g., FY24W01, FY24W02, etc.)'
              });
            }
          }

          // Validate data rows (limited sample for performance)
          let validRows = 0;
          const rowErrors: ValidationError[] = [];
          const maxRowsToCheck = Math.min(worksheet.rowCount, 50); // Check first 50 rows
          
          for (let rowNumber = 2; rowNumber <= maxRowsToCheck && rowErrors.length < 10; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const values = row.values as any[];

            // Skip completely empty rows (no data in any column)
            const hasAnyData = values.slice(1).some(v => v !== null && v !== undefined && v !== '');
            if (!hasAnyData) continue;

            let rowValid = true;

            // Validate required fields based on worksheet type
            if (worksheetDef.name === 'Projects') {
              if (!values[1]) { // Project Name
                rowErrors.push({
                  type: 'error',
                  severity: 'high',
                  worksheet: foundName,
                  row: rowNumber,
                  column: 'A',
                  field: 'Project',
                  message: 'Project name is required',
                  suggestion: 'Enter a project name'
                });
                rowValid = false;
              }
            } else if (worksheetDef.name === 'Roster') {
              if (!values[1]) { // Name
                rowErrors.push({
                  type: 'error',
                  severity: 'high',
                  worksheet: foundName,
                  row: rowNumber,
                  column: 'A',
                  field: 'Name',
                  message: 'Person name is required',
                  suggestion: 'Enter a person name'
                });
                rowValid = false;
              }
            } else if (worksheetDef.name === 'Roles') {
              if (!values[1]) { // Role
                rowErrors.push({
                  type: 'error',
                  severity: 'high',
                  worksheet: foundName,
                  row: rowNumber,
                  column: 'A',
                  field: 'Role',
                  message: 'Role name is required',
                  suggestion: 'Enter a role name'
                });
                rowValid = false;
              }
            }

            if (rowValid) validRows++;
          }
          
          // Estimate total valid rows based on sample
          const totalDataRows = worksheet.rowCount - 1; // Exclude header
          const sampledRows = maxRowsToCheck - 1;
          const estimatedValidRows = sampledRows > 0 
            ? Math.round((validRows / sampledRows) * totalDataRows)
            : 0;
          
          worksheetValidation.validRows = estimatedValidRows;
          worksheetValidation.estimatedImportCount = estimatedValidRows;
          worksheetValidation.errors.push(...rowErrors);
          
          // Update summary counts
          if (worksheetDef.name === 'Projects') {
            result.summary.wouldImport.projects = estimatedValidRows;
          } else if (worksheetDef.name === 'Roster') {
            result.summary.wouldImport.people = estimatedValidRows;
          } else if (worksheetDef.name === 'Roles') {
            result.summary.wouldImport.roles = estimatedValidRows;
          } else if (worksheetDef.name === 'Project Types') {
            result.summary.wouldImport.projectTypes = estimatedValidRows;
          } else if (worksheetDef.name === 'Resource Templates') {
            result.summary.wouldImport.standardAllocations = estimatedValidRows;
          }
        }

        result.worksheets.push(worksheetValidation);
        result.summary.totalRows += worksheetValidation.rowCount;
      }

      // Aggregate errors and warnings
      for (const ws of result.worksheets) {
        for (const error of ws.errors) {
          if (error.type === 'error') {
            result.errors.push(error);
            result.summary.totalErrors++;
          } else if (error.type === 'warning') {
            result.warnings.push(error);
            result.summary.totalWarnings++;
          }
        }
      }

      // Determine if import can proceed
      const criticalErrors = result.errors.filter(e => e.severity === 'critical');
      const highSeverityErrors = result.errors.filter(e => e.severity === 'high');
      if (criticalErrors.length > 0) {
        result.canImport = false;
        result.valid = false;
      } else if (highSeverityErrors.length > 0) {
        // High severity errors (like missing required columns) make it invalid but might allow import with warnings
        result.valid = false;
      }

      // Estimate import duration (V2 is more complex, so slower)
      const totalRows = result.summary.totalRows;
      const estimatedSeconds = Math.max(1, Math.ceil(totalRows / 50)); // ~50 rows per second for V2
      result.summary.estimatedDuration = estimatedSeconds < 60 
        ? `${estimatedSeconds} seconds` 
        : `${Math.ceil(estimatedSeconds / 60)} minutes`;

    } catch (error) {
      result.valid = false;
      result.canImport = false;
      result.errors.push({
        type: 'error',
        severity: 'critical',
        message: `Failed to read Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Ensure the file is a valid Excel file and not corrupted'
      });
    }

    return result;
  }

  private async validateDuplicates(filePath: string): Promise<{ duplicatesFound: { projects: string[]; people: string[]; roles: string[]; locations: string[] } }> {
    const duplicates = {
      projects: [] as string[],
      people: [] as string[],
      roles: [] as string[],
      locations: [] as string[]
    };

    try {
      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      await workbook.xlsx.readFile(filePath);

      // Check for duplicate projects
      const projectsWorksheet = workbook.getWorksheet('Projects');
      if (projectsWorksheet) {
        const projectNames = new Set<string>();
        const existingProjects = await this.db('projects').select('name');
        const existingProjectNames = new Set(existingProjects.map((p: { name: string }) => p.name.toLowerCase()));

        for (let rowNumber = 2; rowNumber <= projectsWorksheet.rowCount; rowNumber++) {
          const row = projectsWorksheet.getRow(rowNumber);
          const projectSite = row.getCell(1).value?.toString();
          if (projectSite) {
            // Parse "Project @ Site" format to extract just the project name
            const { project: projectName } = parseProjectSite(projectSite);
            if (projectName) {
              const lowerName = projectName.toLowerCase();
              if (existingProjectNames.has(lowerName) || projectNames.has(lowerName)) {
                duplicates.projects.push(projectSite); // Keep full format for display
              }
              projectNames.add(lowerName);
            }
          }
        }
      }

      // Check for duplicate people in Roster sheet
      const rosterWorksheet = workbook.getWorksheet('Roster');
      if (rosterWorksheet) {
        const peopleNames = new Set<string>();
        const existingPeople = await this.db('people').select('name');
        const existingPeopleNames = new Set(existingPeople.map((p: { name: string }) => p.name.toLowerCase()));

        for (let rowNumber = 2; rowNumber <= rosterWorksheet.rowCount; rowNumber++) {
          const row = rosterWorksheet.getRow(rowNumber);
          const personName = row.getCell(1).value?.toString();
          if (personName) {
            const lowerName = personName.toLowerCase();
            if (existingPeopleNames.has(lowerName) || peopleNames.has(lowerName)) {
              duplicates.people.push(personName);
            }
            peopleNames.add(lowerName);
          }
        }
      }

      // Check for duplicate roles
      const rolesWorksheet = workbook.getWorksheet('Roles');
      if (rolesWorksheet) {
        const roleNames = new Set<string>();
        const existingRoles = await this.db('roles').select('name');
        const existingRoleNames = new Set(existingRoles.map((r: { name: string }) => r.name.toLowerCase()));

        for (let rowNumber = 2; rowNumber <= rolesWorksheet.rowCount; rowNumber++) {
          const row = rolesWorksheet.getRow(rowNumber);
          const roleName = row.getCell(1).value?.toString();
          if (roleName) {
            const lowerName = roleName.toLowerCase();
            if (existingRoleNames.has(lowerName) || roleNames.has(lowerName)) {
              duplicates.roles.push(roleName);
            }
            roleNames.add(lowerName);
          }
        }
      }

      // Check projects sheet for locations (from "Project @ Site" format)
      if (projectsWorksheet) {
        const locationNames = new Set<string>();
        const existingLocations = await this.db('locations').select('name');
        const existingLocationNames = new Set(existingLocations.map((l: { name: string }) => l.name.toLowerCase()));
        const reportedDuplicates = new Set<string>(); // Track which duplicates we've already reported

        for (let rowNumber = 2; rowNumber <= projectsWorksheet.rowCount; rowNumber++) {
          const row = projectsWorksheet.getRow(rowNumber);
          const projectSite = row.getCell(1).value?.toString();
          if (projectSite) {
            // Parse "Project @ Site" format to extract the site/location name
            const { site: siteName } = parseProjectSite(projectSite);
            if (siteName) {
              const lowerName = siteName.toLowerCase();
              // Only flag as duplicate if it exists in database and we haven't reported it yet
              if (existingLocationNames.has(lowerName) && !reportedDuplicates.has(lowerName)) {
                duplicates.locations.push(siteName);
                reportedDuplicates.add(lowerName);
              }
              locationNames.add(lowerName);
            }
          }
        }
      }

    } catch (error) {
      logger.error('Error validating duplicates', error instanceof Error ? error : undefined);
    }

    return { duplicatesFound: duplicates };
  }

  private async importProjectTypes(worksheet: ExcelWorksheet, _errorCollector: ImportErrorCollector): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Project Types worksheet not found');
      return { count, errors };
    }

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const name = row.getCell(1).value?.toString();

        if (!name) continue;

        await this.db('project_types').insert({
          id: uuidv4(),
          name,
          description: `Imported project type: ${name}`,
          created_at: new Date(),
          updated_at: new Date()
        });
        count++;

      } catch (error) {
        errors.push(`Project Types Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async importProjectPhases(worksheet: ExcelWorksheet, _errorCollector: ImportErrorCollector): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    // Import standard phases from abbreviations
    let orderIndex = 0;
    for (const [abbrev, fullName] of Object.entries(PHASE_ABBREVIATIONS)) {
      try {
        const phaseId = uuidv4();
        await this.db('project_phases').insert({
          id: phaseId,
          name: fullName,
          description: `Phase: ${fullName} (${abbrev})`,
          order_index: orderIndex++,
          created_at: new Date(),
          updated_at: new Date()
        });
        this.phaseMap.set(abbrev, phaseId);
        count++;
      } catch (error) {
        errors.push(`Failed to create phase ${fullName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Import custom phases from worksheet if present
    if (worksheet) {
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        try {
          const row = worksheet.getRow(rowNumber);
          const name = row.getCell(1).value?.toString();

          if (!name) continue;

          // Skip if already imported from abbreviations
          const abbrev = Object.keys(PHASE_ABBREVIATIONS).find(k => PHASE_ABBREVIATIONS[k] === name);
          if (abbrev) continue;

          const phaseId = uuidv4();
          await this.db('project_phases').insert({
            id: phaseId,
            name,
            description: `Imported phase: ${name}`,
            order_index: orderIndex++,
            created_at: new Date(),
            updated_at: new Date()
          });
          count++;

        } catch (error) {
          errors.push(`Project Phases Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return { count, errors };
  }

  private async importRoles(worksheet: ExcelWorksheet, _errorCollector: ImportErrorCollector): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Roles worksheet not found');
      return { count, errors };
    }

    // Note: headerRow and headers available for future column validation

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const roleName = row.getCell(1).value?.toString(); // Role
        const planOwner = row.getCell(2).value?.toString(); // Plan Owner
        // Note: cwOption (cell 3) available for CW Option field
        const dataAccess = row.getCell(4).value?.toString(); // Required Data Access

        if (!roleName) continue;

        const roleId = uuidv4();
        await this.db('roles').insert({
          id: roleId,
          name: roleName,
          description: `Role: ${roleName}${dataAccess ? ` - Requires: ${dataAccess}` : ''}`,
          external_id: null, // Don't use CW Option as external_id since it's not unique
          created_at: new Date(),
          updated_at: new Date()
        });

        this.roleMap.set(roleName, roleId);

        // Handle Plan Owner relationship
        if (planOwner) {
          this.planOwnerMap.set(planOwner, roleId); // Store for later processing
        }

        count++;

      } catch (error) {
        errors.push(`Roles Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async importRoster(worksheet: ExcelWorksheet, _errorCollector: ImportErrorCollector): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Roster worksheet not found');
      return { count, errors };
    }

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as any[];
    const fiscalWeeks = extractFiscalWeekColumns(headers);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const personName = row.getCell(1).value?.toString(); // Person
        const roleName = row.getCell(2).value?.toString(); // Role

        if (!personName) continue;

        const personId = uuidv4();
        const roleId = roleName ? this.roleMap.get(roleName) : null;

        // Get availability from fiscal week columns
        let defaultAvailability = 100;
        const availabilities: Record<string, number> = {};
        
        headers.forEach((header, index) => {
          if (typeof header === 'string' && fiscalWeeks.includes(header)) {
            const cellValue = row.getCell(index).value;
            if (cellValue !== null && cellValue !== undefined) {
              const availability = parseFloat(cellValue.toString());
              if (!isNaN(availability)) {
                availabilities[header] = availability > 1 ? availability : availability * 100; // Handle both percentage and decimal formats
              }
            }
          }
        });

        // Calculate average availability as default
        const availValues = Object.values(availabilities);
        if (availValues.length > 0) {
          defaultAvailability = availValues.reduce((a, b) => a + b, 0) / availValues.length;
        }

        await this.db('people').insert({
          id: personId,
          name: personName,
          worker_type: 'FTE',
          default_availability_percentage: defaultAvailability,
          default_hours_per_day: 8,
          created_at: new Date(),
          updated_at: new Date()
        });

        // Add person-role relationship. person_roles has no created_at column
        // and people.primary_person_role_id FKs the join row (the old code
        // wrote a non-existent primary_role_id column on people and
        // timestamp columns that person_roles does not have — both inserts
        // failed and rolled the whole V2 import back).
        if (roleId) {
          const personRoleId = uuidv4();
          await this.db('person_roles').insert({
            id: personRoleId,
            person_id: personId,
            role_id: roleId,
            proficiency_level: 3,
            is_primary: 1
          });
          await this.db('people')
            .where('id', personId)
            .update({ primary_person_role_id: personRoleId });
        }

        // Import availability overrides for specific weeks
        for (const [fiscalWeek, availability] of Object.entries(availabilities)) {
          if (availability !== defaultAvailability && availability < 100) {
            const weekDate = fiscalWeekToDate(fiscalWeek);
            if (weekDate) {
              await this.db('person_availability_overrides').insert({
                id: uuidv4(),
                person_id: personId,
                start_date: weekDate,
                end_date: new Date(weekDate.getTime() + 6 * 24 * 60 * 60 * 1000), // End of week
                availability_percentage: availability, // Already converted to percentage
                override_type: 'OTHER',
                reason: 'Imported from Excel',
                is_approved: true,
                approved_at: new Date(),
                created_at: new Date(),
                updated_at: new Date()
              });
            }
          }
        }

        count++;

      } catch (error) {
        errors.push(`Roster Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async importProjects(worksheet: ExcelWorksheet, errorCollector: ImportErrorCollector): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Projects worksheet not found');
      return { count, errors };
    }

    // First, ensure we have all locations
    const locations = new Map<string, string>();
    
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const projectSite = row.getCell(1).value?.toString(); // Project/Site
        const projectType = row.getCell(2).value?.toString(); // Project Type
        const includeInDemand = row.getCell(3).value?.toString(); // Inc. in Demand
        const priority = row.getCell(4).value?.toString(); // Priority

        if (!projectSite) continue;

        const { project: projectName, site: siteName } = parseProjectSite(projectSite);
        
        if (!projectName) {
          errorCollector.addDataError('Projects', rowNumber, 'A', 'Project/Site', projectSite, 'string', 'Invalid project/site format - missing project name', 'Use format "ProjectName @ SiteName"');
          continue;
        }
        if (!siteName) {
          errorCollector.addDataError('Projects', rowNumber, 'A', 'Project/Site', projectSite, 'string', 'Invalid project/site format - missing site name', 'Use format "ProjectName @ SiteName"');
          continue;
        }

        // Find or create location
        let locationId = locations.get(siteName);
        if (!locationId) {
          const existing = await this.db('locations').where('name', siteName).first();
          if (existing) {
            locationId = existing.id;
          } else {
            locationId = uuidv4();
            await this.db('locations').insert({
              id: locationId,
              name: siteName,
              description: `Location: ${siteName}`,
              created_at: new Date(),
              updated_at: new Date()
            });
          }
          locations.set(siteName, locationId!);
        }

        // Find project type
        const projectTypeRecord = await this.db('project_types').where('name', projectType).first();
        if (!projectTypeRecord) {
          errorCollector.addDataError('Projects', rowNumber, 'B', 'Project Type', projectType, 'string', `Project type not found: ${projectType}`, 'Ensure the project type exists in the Project Types worksheet');
          continue;
        }

        // projects.project_sub_type_id is NOT NULL with no default — the
        // import row only carries a type, so resolve the type's default
        // sub-type (then first by sort, then auto-create one). Same schema
        // drift fixed in the V1 importer.
        let projectSubTypeId = (await this.db('project_sub_types')
          .where('project_type_id', projectTypeRecord.id)
          .orderBy('is_default', 'desc')
          .orderBy('sort_order', 'asc')
          .first())?.id as string | undefined;
        if (!projectSubTypeId) {
          projectSubTypeId = uuidv4();
          await this.db('project_sub_types').insert({
            id: projectSubTypeId,
            project_type_id: projectTypeRecord.id,
            name: `${projectType} (default)`,
            description: 'Auto-created by import: project type has no sub-types',
            is_default: 1,
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        const projectId = uuidv4();
        await this.db('projects').insert({
          id: projectId,
          name: projectName,
          project_type_id: projectTypeRecord.id,
          project_sub_type_id: projectSubTypeId,
          location_id: locationId,
          priority: parseInt(priority || '3', 10) || 3,
          include_in_demand: includeInDemand === 'Y' ? 1 : 0,
          created_at: new Date(),
          updated_at: new Date()
        });

        this.projectMap.set(projectName, projectId);
        count++;

      } catch (error) {
        errorCollector.addError({
          type: 'error',
          severity: 'high',
          category: 'system',
          worksheet: 'Projects',
          row: rowNumber,
          message: `Failed to import project: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestion: 'Check the data format and try again'
        });
      }
    }

    return { count, errors };
  }

  private async importProjectRoadmap(worksheet: ExcelWorksheet): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Project Roadmap worksheet not found');
      return { count, errors };
    }

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as any[];
    const fiscalWeeks = extractFiscalWeekColumns(headers);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const projectSite = row.getCell(1).value?.toString();

        if (!projectSite) continue;

        const { project: projectName } = parseProjectSite(projectSite);
        const projectId = this.projectMap.get(projectName);

        if (!projectId) {
          errors.push(`Roadmap Row ${rowNumber}: Project not found: ${projectName}`);
          continue;
        }

        // Read phase data from fiscal week columns
        const phaseRanges = new Map<string, { start: string; end: string }>();
        let currentPhase: string | null = null;
        let phaseStart: string | null = null;

        headers.forEach((header, index) => {
          if (typeof header === 'string' && fiscalWeeks.includes(header)) {
            const cellValue = row.getCell(index).value?.toString();
            
            if (cellValue && cellValue !== currentPhase) {
              // New phase started
              if (currentPhase && phaseStart) {
                // Save previous phase
                const existing = phaseRanges.get(currentPhase);
                if (!existing || fiscalWeeks.indexOf(phaseStart) < fiscalWeeks.indexOf(existing.start)) {
                  phaseRanges.set(currentPhase, { 
                    start: phaseStart, 
                    end: headers[index - 1] as string 
                  });
                }
              }
              currentPhase = cellValue;
              phaseStart = header;
            } else if (cellValue === currentPhase && !phaseStart) {
              phaseStart = header;
            }
          }
        });

        // Handle last phase
        if (currentPhase && phaseStart) {
          const lastFiscalWeek = fiscalWeeks[fiscalWeeks.length - 1];
          phaseRanges.set(currentPhase, { start: phaseStart, end: lastFiscalWeek });
        }

        // Create phase timeline entries
        for (const [phaseAbbrev, range] of phaseRanges) {
          const phaseId = this.phaseMap.get(phaseAbbrev);
          if (!phaseId) {
            errors.push(`Roadmap Row ${rowNumber}: Unknown phase: ${phaseAbbrev}`);
            continue;
          }

          const startDate = fiscalWeekToDate(range.start);
          const endDate = fiscalWeekToDate(range.end);

          if (startDate && endDate) {
            await this.db('project_phases_timeline').insert({
              id: uuidv4(),
              project_id: projectId,
              phase_id: phaseId,
              start_date: startDate,
              end_date: endDate,
              created_at: new Date(),
              updated_at: new Date()
            });
            count++;
          }
        }

      } catch (error) {
        errors.push(`Roadmap Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async importProjectDemand(worksheet: ExcelWorksheet): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Project Demand worksheet not found');
      return { count, errors };
    }

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as any[];
    const fiscalWeeks = extractFiscalWeekColumns(headers);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const projectSite = row.getCell(1).value?.toString();
        // Note: planOwner (cell 2) available for plan owner assignment
        const roleName = row.getCell(3).value?.toString();

        if (!projectSite || !roleName) continue;

        const { project: projectName } = parseProjectSite(projectSite);
        const projectId = this.projectMap.get(projectName);
        const roleId = this.roleMap.get(roleName);

        if (!projectId || !roleId) {
          errors.push(`Demand Row ${rowNumber}: Project or role not found`);
          continue;
        }

        // Read demand values from fiscal week columns
        for (let index = 0; index < headers.length; index++) {
          const header = headers[index];
          if (typeof header === 'string' && fiscalWeeks.includes(header)) {
            const cellValue = row.getCell(index).value;
            if (cellValue !== null && cellValue !== undefined) {
              const demandHours = parseFloat(cellValue.toString());
              if (!isNaN(demandHours) && demandHours > 0) {
                const weekDate = fiscalWeekToDate(header);
                if (weekDate) {
                  await this.db('demand_overrides').insert({
                    id: uuidv4(),
                    project_id: projectId,
                    role_id: roleId,
                    start_date: weekDate,
                    end_date: new Date(weekDate.getTime() + 6 * 24 * 60 * 60 * 1000),
                    demand_hours: demandHours * 40, // Convert FTE to hours (40 hours/week)
                    reason: 'Imported from Excel',
                    created_at: new Date(),
                    updated_at: new Date()
                  });
                  count++;
                }
              }
            }
          }
        }

      } catch (error) {
        errors.push(`Demand Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async importProjectAssignments(worksheet: ExcelWorksheet): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Project Assignments worksheet not found');
      return { count, errors };
    }

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as any[];
    const fiscalWeeks = extractFiscalWeekColumns(headers);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const projectSite = row.getCell(1).value?.toString();
        const personName = row.getCell(2).value?.toString();
        const roleName = row.getCell(3).value?.toString();

        if (!projectSite || !personName || !roleName) continue;

        const { project: projectName } = parseProjectSite(projectSite);
        const projectId = this.projectMap.get(projectName);
        const person = await this.db('people').where('name', personName).first();
        const roleId = this.roleMap.get(roleName);

        if (!projectId || !person || !roleId) {
          errors.push(`Assignment Row ${rowNumber}: Project, person, or role not found`);
          continue;
        }

        // Read allocation percentages from fiscal week columns
        const allocations: { week: string; percentage: number }[] = [];
        
        headers.forEach((header, index) => {
          if (typeof header === 'string' && fiscalWeeks.includes(header)) {
            const cellValue = row.getCell(index).value;
            if (cellValue !== null && cellValue !== undefined) {
              const percentage = parseFloat(cellValue.toString()) * 100; // Convert to percentage
              if (!isNaN(percentage) && percentage > 0) {
                allocations.push({ week: header, percentage });
              }
            }
          }
        });

        // Group consecutive weeks with same allocation
        if (allocations.length > 0) {
          let startWeek = allocations[0].week;
          let currentPercentage = allocations[0].percentage;
          
          for (let i = 1; i <= allocations.length; i++) {
            if (i === allocations.length || allocations[i].percentage !== currentPercentage) {
              // Create assignment for this range
              const startDate = fiscalWeekToDate(startWeek);
              const endDate = fiscalWeekToDate(allocations[i - 1].week);
              
              if (startDate && endDate) {
                await this.db('project_assignments').insert({
                  id: uuidv4(),
                  project_id: projectId,
                  person_id: person.id,
                  role_id: roleId,
                  allocation_percentage: currentPercentage,
                  start_date: startDate,
                  end_date: new Date(endDate.getTime() + 6 * 24 * 60 * 60 * 1000),
                  created_at: new Date(),
                  updated_at: new Date()
                });
                count++;
              }
              
              if (i < allocations.length) {
                startWeek = allocations[i].week;
                currentPercentage = allocations[i].percentage;
              }
            }
          }
        }

      } catch (error) {
        errors.push(`Assignment Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async importStandardAllocations(worksheet: ExcelWorksheet): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errors.push('Standard Allocations worksheet not found');
      return { count, errors };
    }

    // Note: headerRow available for column validation if needed

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const roleName = row.getCell(1).value?.toString();
        const projectTypeName = row.getCell(2).value?.toString();

        if (!roleName || !projectTypeName) continue;

        const roleId = this.roleMap.get(roleName);
        const projectType = await this.db('project_types').where('name', projectTypeName).first();

        if (!roleId || !projectType) {
          errors.push(`Standard Allocation Row ${rowNumber}: Role or project type not found`);
          continue;
        }

        // Read phase allocations (columns 3 onwards)
        let colIndex = 3;
        for (const phaseAbbrev of Object.keys(PHASE_ABBREVIATIONS)) {
          const cellValue = row.getCell(colIndex).value;
          if (cellValue !== null && cellValue !== undefined) {
            const allocation = parseFloat(cellValue.toString()) * 100;
            if (!isNaN(allocation) && allocation > 0) {
              const phaseId = this.phaseMap.get(phaseAbbrev);
              if (phaseId) {
                // resource_templates since migration 046 (standard_allocations no longer exists)
                await this.db('resource_templates').insert({
                  id: uuidv4(),
                  project_type_id: projectType.id,
                  phase_id: phaseId,
                  role_id: roleId,
                  allocation_percentage: allocation,
                  created_at: new Date(),
                  updated_at: new Date()
                });
                count++;
              }
            }
          }
          colIndex++;
        }

      } catch (error) {
        errors.push(`Standard Allocation Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private async processRolePlanners(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    // Process Plan Owner relationships from roles sheet
    for (const [planOwnerName, roleId] of this.planOwnerMap) {
      try {
        const planOwner = await this.db('people').where('name', planOwnerName).first();
        if (planOwner) {
          await this.db('role_planners').insert({
            role_id: roleId,
            person_id: planOwner.id,
            is_primary: true,
            can_allocate_resources: true,
            can_approve_assignments: true,
            can_modify_standard_allocations: true
          });
          count++;
        } else {
          errors.push(`Plan owner not found: ${planOwnerName}`);
        }
      } catch (error) {
        errors.push(`Role planner error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { count, errors };
  }

  private getColumnLetter(index: number): string {
    if (index < 0) return 'Unknown';
    let result = '';
    while (index >= 0) {
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }

  async importFromFile(filePath: string, options: ImportOptions = {}): Promise<ImportResultV2> {
    const { clearExisting = false, validateDuplicates = false } = options;
    const errorCollector = new ImportErrorCollector();
    const result: ImportResultV2 = {
      success: false,
      imported: {
        locations: 0,
        projectTypes: 0,
        phases: 0,
        roles: 0,
        people: 0,
        projects: 0,
        standardAllocations: 0,
        assignments: 0,
        phaseTimelines: 0,
        demands: 0,
        availabilityOverrides: 0
      },
      errors: [],
      warnings: []
    };

    // Validate duplicates first (before starting transaction)
    if (validateDuplicates) {
      try {
        const duplicateCheck = await this.validateDuplicates(filePath);
        if (duplicateCheck.duplicatesFound && Object.values(duplicateCheck.duplicatesFound).some(arr => arr.length > 0)) {
          result.duplicatesFound = duplicateCheck.duplicatesFound;
          result.errors.push('Duplicate records found. Import cancelled to prevent data conflicts.');
          return result;
        }
      } catch (error) {
        result.errors.push(`Duplicate validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
      }
    }

    // Start database transaction
    const trx = await this.db.transaction();

    try {
      // Temporarily override database connection to use transaction
      const originalDb = this.db;
      this.db = trx;

      if (clearExisting) {
        await this.clearExistingDataInTransaction(trx);
      }

      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      await workbook.xlsx.readFile(filePath);

      // Import in dependency order
      
      // 1. Project Types
      const typesWorksheet = workbook.getWorksheet('Project Types');
      if (!typesWorksheet) {
        errorCollector.addCriticalError('Project Types', 'Project Types worksheet not found', 'Add a worksheet named "Project Types" to your Excel file');
      } else {
        const typesResult = await this.importProjectTypes(typesWorksheet, errorCollector);
        result.imported.projectTypes = typesResult.count;
        result.errors.push(...typesResult.errors);
      }

      // 2. Project Phases (optional - creates standard phases from PHASE_ABBREVIATIONS)
      const phasesWorksheet = workbook.getWorksheet('Project Phases');
      const phasesResult = await this.importProjectPhases(phasesWorksheet, errorCollector);
      result.imported.phases = phasesResult.count;
      result.errors.push(...phasesResult.errors);

      // 3. Roles
      const rolesWorksheet = workbook.getWorksheet('Roles');
      if (!rolesWorksheet) {
        errorCollector.addCriticalError('Roles', 'Roles worksheet not found', 'Add a worksheet named "Roles" to your Excel file');
      } else {
        const rolesResult = await this.importRoles(rolesWorksheet, errorCollector);
        result.imported.roles = rolesResult.count;
        result.errors.push(...rolesResult.errors);
      }

      // 4. Roster (People)
      const rosterWorksheet = workbook.getWorksheet('Roster');
      if (!rosterWorksheet) {
        errorCollector.addCriticalError('Roster', 'Roster worksheet not found', 'Add a worksheet named "Roster" to your Excel file');
      } else {
        const rosterResult = await this.importRoster(rosterWorksheet, errorCollector);
        result.imported.people = rosterResult.count;
        result.errors.push(...rosterResult.errors);
      }

      // 5. Projects
      const projectsWorksheet2 = workbook.getWorksheet('Projects');
      if (!projectsWorksheet2) {
        errorCollector.addCriticalError('Projects', 'Projects worksheet not found', 'Add a worksheet named "Projects" to your Excel file');
      } else {
        const projectsResult = await this.importProjects(projectsWorksheet2, errorCollector);
        result.imported.projects = projectsResult.count;
        result.errors.push(...projectsResult.errors);
      }

      // 6. Project Roadmap (Phase Timelines) - optional
      const roadmapWorksheet = workbook.getWorksheet('Project Roadmap');
      const roadmapResult = roadmapWorksheet ? await this.importProjectRoadmap(roadmapWorksheet) : { count: 0, errors: [] };
      result.imported.phaseTimelines = roadmapResult.count;
      result.errors.push(...roadmapResult.errors);

      // 7. Standard Allocations - optional
      const allocationsWorksheet2 = workbook.getWorksheet('Standard Allocations');
      const allocationsResult = allocationsWorksheet2 ? await this.importStandardAllocations(allocationsWorksheet2) : { count: 0, errors: [] };
      result.imported.standardAllocations = allocationsResult.count;
      result.errors.push(...allocationsResult.errors);

      // 8. Project Demand - optional
      const demandWorksheet = workbook.getWorksheet('Project Demand');
      const demandResult = demandWorksheet ? await this.importProjectDemand(demandWorksheet) : { count: 0, errors: [] };
      result.imported.demands = demandResult.count;
      result.errors.push(...demandResult.errors);

      // 9. Project Assignments - optional
      const assignmentsWorksheet = workbook.getWorksheet('Project Assignments');
      const assignmentsResult = assignmentsWorksheet ? await this.importProjectAssignments(assignmentsWorksheet) : { count: 0, errors: [] };
      result.imported.assignments = assignmentsResult.count;
      result.errors.push(...assignmentsResult.errors);

      // 10. Process Role Planners
      const plannersResult = await this.processRolePlanners();
      result.warnings.push(...plannersResult.errors);

      // Count imported locations
      result.imported.locations = await this.db('locations').count('* as count').first().then((r: { count?: number | string } | undefined) => parseInt(String(r?.count || '0'), 10));

      // Count availability overrides
      result.imported.availabilityOverrides = await this.db('person_availability_overrides').count('* as count').first().then((r: { count?: number | string } | undefined) => parseInt(String(r?.count || '0'), 10));

      // Collect all structured errors and warnings
      const errorSummary = errorCollector.toJSON();
      result.errors.push(...errorSummary.errors.map(e => e.detailedMessage || e.message));
      result.warnings.push(...errorSummary.warnings.map(w => w.detailedMessage || w.message));

      // Check if there were any errors
      if (errorCollector.hasErrors() || result.errors.length > 0) {
        await trx.rollback();
        result.success = false;
        result.errors.unshift('Import rolled back due to errors.');
      } else {
        await trx.commit();
        result.success = true;
      }

      // Restore original database connection
      this.db = originalDb;

    } catch (error) {
      await trx.rollback();
      result.errors.push(`Import failed and rolled back: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.success = false;
    }

    return result;
  }
}