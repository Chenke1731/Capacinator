import { getAuditedDb } from '../../database/index.js';
import { logger } from '../logging/config.js';
import type { Worksheet, Row } from 'exceljs';

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
import { ImportErrorCollector, ImportErrorUtils, ProgressCallback, ImportProgressTracker, ImportPhase } from './ImportError.js';

export interface ImportOptions {
  clearExisting?: boolean;
  validateDuplicates?: boolean;
  autoCreateMissingRoles?: boolean;
  autoCreateMissingLocations?: boolean;
  defaultProjectPriority?: number;
  dateFormat?: string;
  progressCallback?: ProgressCallback;
}

export interface ValidationError {
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  worksheet?: string;
  row?: number;
  column?: string;
  field?: string;
  currentValue?: string;
  expectedValue?: string;
  message: string;
  suggestion?: string;
}

export interface WorksheetValidation {
  name: string;
  exists: boolean;
  requiredColumns: string[];
  missingColumns: string[];
  extraColumns: string[];
  rowCount: number;
  validRows: number;
  errors: ValidationError[];
  estimatedImportCount: number;
}

export interface ValidationResult {
  valid: boolean;
  canImport: boolean;
  worksheets: WorksheetValidation[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalRows: number;
    estimatedDuration: string;
    wouldImport: {
      locations: number;
      projectTypes: number;
      phases: number;
      roles: number;
      people: number;
      projects: number;
      standardAllocations: number;
      assignments: number;
    };
  };
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ImportResult {
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

export class ExcelImporter {
  private db: any;

  constructor() {
    this.db = getAuditedDb();
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

      // Define required worksheets and their expected columns
      const requiredWorksheets = [
        {
          name: 'Projects',
          aliases: ['Projects'],
          requiredColumns: ['Project Name', 'Project Type', 'Location', 'Priority'],
          optionalColumns: ['Description', 'Start Date', 'End Date', 'Owner']
        },
        {
          name: 'People',
          aliases: ['Rosters', 'People'],
          requiredColumns: ['Name', 'Role'],
          optionalColumns: ['Email', 'Location', 'Supervisor', 'Start Date']
        },
        {
          name: 'Standard Allocations',
          aliases: ['Standard Allocations', 'Allocations'],
          requiredColumns: ['Role', 'Project Type', 'Allocation'],
          optionalColumns: ['Phase', 'Description']
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
            suggestion: `Add a worksheet named '${worksheetDef.name}' or one of: ${worksheetDef.aliases.join(', ')}`
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

          // Validate data rows
          let validRows = 0;
          const rowErrors: ValidationError[] = [];
          
          for (let rowNumber = 2; rowNumber <= worksheet.rowCount && rowErrors.length < 10; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const values = row.values as any[];
            
            if (values.length <= 1 || !values[1]) continue; // Skip empty rows
            
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
                  field: 'Project Name',
                  message: 'Project Name is required',
                  suggestion: 'Enter a project name'
                });
                rowValid = false;
              }
            } else if (worksheetDef.name === 'People') {
              if (!values[1]) { // Name
                rowErrors.push({
                  type: 'error',
                  severity: 'high',
                  worksheet: foundName,
                  row: rowNumber,
                  column: 'A',
                  field: 'Name',
                  message: 'Person Name is required',
                  suggestion: 'Enter a person name'
                });
                rowValid = false;
              }
            }
            
            if (rowValid) validRows++;
          }
          
          worksheetValidation.validRows = validRows;
          worksheetValidation.estimatedImportCount = validRows;
          worksheetValidation.errors.push(...rowErrors);
          
          // Update summary counts
          if (worksheetDef.name === 'Projects') {
            result.summary.wouldImport.projects = validRows;
          } else if (worksheetDef.name === 'People') {
            result.summary.wouldImport.people = validRows;
          } else if (worksheetDef.name === 'Standard Allocations') {
            result.summary.wouldImport.standardAllocations = validRows;
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
      if (criticalErrors.length > 0) {
        result.canImport = false;
        result.valid = false;
      }

      // Estimate import duration (rough calculation)
      const totalRows = result.summary.totalRows;
      const estimatedSeconds = Math.max(1, Math.ceil(totalRows / 100)); // ~100 rows per second
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
          const projectName = row.getCell(1).value?.toString();
          if (projectName) {
            const lowerName = projectName.toLowerCase();
            if (existingProjectNames.has(lowerName) || projectNames.has(lowerName)) {
              duplicates.projects.push(projectName);
            }
            projectNames.add(lowerName);
          }
        }
      }

      // Check for duplicate people
      const peopleWorksheet = workbook.getWorksheet('Rosters') || workbook.getWorksheet('People');
      if (peopleWorksheet) {
        const peopleNames = new Set<string>();
        const existingPeople = await this.db('people').select('name');
        const existingPeopleNames = new Set(existingPeople.map((p: { name: string }) => p.name.toLowerCase()));

        for (let rowNumber = 2; rowNumber <= peopleWorksheet.rowCount; rowNumber++) {
          const row = peopleWorksheet.getRow(rowNumber);
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

      // Check for duplicate locations
      const locationsWorksheet = workbook.getWorksheet('Locations');
      if (locationsWorksheet) {
        const locationNames = new Set<string>();
        const existingLocations = await this.db('locations').select('name');
        const existingLocationNames = new Set(existingLocations.map((l: { name: string }) => l.name.toLowerCase()));

        for (let rowNumber = 2; rowNumber <= locationsWorksheet.rowCount; rowNumber++) {
          const row = locationsWorksheet.getRow(rowNumber);
          const locationName = row.getCell(1).value?.toString();
          if (locationName) {
            const lowerName = locationName.toLowerCase();
            if (existingLocationNames.has(lowerName) || locationNames.has(lowerName)) {
              duplicates.locations.push(locationName);
            }
            locationNames.add(lowerName);
          }
        }
      }

    } catch (error) {
      logger.error('Error validating duplicates', error instanceof Error ? error : undefined);
    }

    return { duplicatesFound: duplicates };
  }

  private async clearExistingData() {
    // Clear in reverse dependency order
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
    // Clear in reverse dependency order
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

  private async findOrCreateLocation(name: string): Promise<string> {
    let location = await this.db('locations').where('name', name).first();
    
    if (!location) {
      const [newLocation] = await this.db('locations')
        .insert({
          name,
          description: `Imported location: ${name}`,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      location = newLocation;
    }
    
    return location.id;
  }

  private async findOrCreateProjectType(name: string): Promise<string> {
    let projectType = await this.db('project_types').where('name', name).first();
    
    if (!projectType) {
      const [newType] = await this.db('project_types')
        .insert({
          name,
          description: `Imported project type: ${name}`,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      projectType = newType;
    }
    
    return projectType.id;
  }

  /**
   * projects.project_sub_type_id is NOT NULL with no default, but an import
   * row only carries a project type. Fall back to the type's default
   * sub-type, then the first by sort order, then auto-create one — otherwise
   * every imported project row violated the constraint and rolled the whole
   * import back.
   */
  private async findOrCreateDefaultSubType(projectTypeId: string, projectTypeName: string): Promise<string> {
    let subType = await this.db('project_sub_types')
      .where('project_type_id', projectTypeId)
      .orderBy('is_default', 'desc')
      .orderBy('sort_order', 'asc')
      .first();

    if (!subType) {
      const [created] = await this.db('project_sub_types').insert({
        project_type_id: projectTypeId,
        name: `${projectTypeName} (default)`,
        description: 'Auto-created by import: project type has no sub-types',
        is_default: 1,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');
      subType = created;
    }

    return subType.id;
  }

  private async findOrCreateRole(name: string): Promise<string> {
    let role = await this.db('roles').where('name', name).first();
    
    if (!role) {
      const [newRole] = await this.db('roles')
        .insert({
          name,
          description: `Imported role: ${name}`,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      role = newRole;
    }
    
    return role.id;
  }

  private async findOrCreatePhase(name: string, orderIndex: number): Promise<string> {
    let phase = await this.db('project_phases').where('name', name).first();
    
    if (!phase) {
      const [newPhase] = await this.db('project_phases')
        .insert({
          name,
          description: `Imported phase: ${name}`,
          order_index: orderIndex,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      phase = newPhase;
    }
    
    return phase.id;
  }

  private async importProjects(worksheet: ExcelWorksheet, errorCollector: ImportErrorCollector, progressTracker?: ImportProgressTracker): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errorCollector.addCriticalError('Projects', 'Projects worksheet not found', 'Add a worksheet named "Projects" to your Excel file');
      return { count, errors };
    }

    progressTracker?.startPhase(ImportPhase.PROJECTS, `Processing ${worksheet.rowCount - 1} projects`);

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as string[];
    
    // Expected columns based on original Excel structure
    const expectedColumns = {
      name: this.findColumnIndex(headers, ['Project Name', 'Name']),
      projectType: this.findColumnIndex(headers, ['Project Type', 'Type']),
      location: this.findColumnIndex(headers, ['Location', 'Site']),
      priority: this.findColumnIndex(headers, ['Priority']),
      description: this.findColumnIndex(headers, ['Description', 'Notes']),
      aspirationStart: this.findColumnIndex(headers, ['Start Date', 'Aspiration Start']),
      aspirationFinish: this.findColumnIndex(headers, ['End Date', 'Aspiration Finish', 'Finish Date']),
      owner: this.findColumnIndex(headers, ['Owner', 'Project Manager', 'PM'])
    };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const values = row.values as any[];

        if (!values[expectedColumns.name]) continue; // Skip empty rows

        const projectName = values[expectedColumns.name]?.toString();
        const projectTypeName = values[expectedColumns.projectType]?.toString();
        const locationName = values[expectedColumns.location]?.toString();

        if (!projectName) {
          errorCollector.addDataError('Projects', rowNumber, 'A', 'Project Name', values[expectedColumns.name], 'string', 'Project Name is required', 'Enter a project name in column A');
          continue;
        }
        if (!projectTypeName) {
          errorCollector.addDataError('Projects', rowNumber, this.getColumnLetter(expectedColumns.projectType), 'Project Type', values[expectedColumns.projectType], 'string', 'Project Type is required', 'Enter a project type');
          continue;
        }
        if (!locationName) {
          errorCollector.addDataError('Projects', rowNumber, this.getColumnLetter(expectedColumns.location), 'Location', values[expectedColumns.location], 'string', 'Location is required', 'Enter a location name');
          continue;
        }

        // Find or create referenced entities
        const locationId = await this.findOrCreateLocation(locationName);
        const projectTypeId = await this.findOrCreateProjectType(projectTypeName);
        const projectSubTypeId = await this.findOrCreateDefaultSubType(projectTypeId, projectTypeName);

        // Find owner (if specified)
        let ownerId = null;
        const ownerName = values[expectedColumns.owner]?.toString();
        if (ownerName) {
          const owner = await this.db('people').where('name', 'like', `%${ownerName}%`).first();
          if (owner) {
            ownerId = owner.id;
          }
        }

        const projectData = {
          name: projectName,
          project_type_id: projectTypeId,
          location_id: locationId,
          project_sub_type_id: projectSubTypeId,
          priority: parseInt(values[expectedColumns.priority]?.toString() || '3', 10) || 3,
          description: values[expectedColumns.description]?.toString() || '',
          include_in_demand: 1,
          aspiration_start: this.parseDate(values[expectedColumns.aspirationStart]),
          aspiration_finish: this.parseDate(values[expectedColumns.aspirationFinish]),
          owner_id: ownerId,
          created_at: new Date(),
          updated_at: new Date()
        };

        await this.db('projects').insert(projectData);
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

  private async importPeople(worksheet: ExcelWorksheet, errorCollector: ImportErrorCollector, progressTracker?: ImportProgressTracker): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errorCollector.addCriticalError('People', 'People/Rosters worksheet not found', 'Add a worksheet named "People" or "Rosters" to your Excel file');
      return { count, errors };
    }

    progressTracker?.startPhase(ImportPhase.PEOPLE, `Processing ${worksheet.rowCount - 1} people`);

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as string[];
    
    const expectedColumns = {
      name: this.findColumnIndex(headers, ['Name', 'Full Name', 'Employee Name']),
      email: this.findColumnIndex(headers, ['Email', 'Email Address']),
      primaryRole: this.findColumnIndex(headers, ['Primary Role', 'Role', 'Job Title']),
      workerType: this.findColumnIndex(headers, ['Worker Type', 'Type', 'Employment Type']),
      supervisor: this.findColumnIndex(headers, ['Supervisor', 'Manager', 'Reports To']),
      availability: this.findColumnIndex(headers, ['Availability', 'Availability %', 'Capacity']),
      hoursPerDay: this.findColumnIndex(headers, ['Hours Per Day', 'Daily Hours', 'Hours/Day'])
    };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const values = row.values as any[];

        if (!values[expectedColumns.name]) continue;

        const personName = values[expectedColumns.name]?.toString();
        const personEmail = values[expectedColumns.email]?.toString();
        const primaryRoleName = values[expectedColumns.primaryRole]?.toString();
        const availability = values[expectedColumns.availability];
        const hoursPerDay = values[expectedColumns.hoursPerDay];

        // Validate required name field
        if (!ImportErrorUtils.validateRequired(personName)) {
          errorCollector.addDataError('People', rowNumber, 'A', 'Name', values[expectedColumns.name], 'string', 'Person name is required', 'Enter a person name in column A');
          continue;
        }

        // Validate email format if provided
        if (personEmail && personEmail.trim() && !ImportErrorUtils.validateEmail(personEmail)) {
          errorCollector.addError(ImportErrorUtils.invalidEmail('People', rowNumber, this.getColumnLetter(expectedColumns.email), personEmail));
        }

        // Validate availability percentage
        let validatedAvailability = 100;
        if (availability) {
          const availabilityValidation = ImportErrorUtils.validatePercentage(availability);
          if (!availabilityValidation.isValid) {
            errorCollector.addDataError('People', rowNumber, this.getColumnLetter(expectedColumns.availability), 'Availability', availability, 'percentage (0-100)', 'Invalid availability percentage', 'Enter a number between 0 and 100');
          } else {
            validatedAvailability = availabilityValidation.numericValue!;
          }
        }

        // Validate hours per day
        let validatedHoursPerDay = 8;
        if (hoursPerDay) {
          const hoursValidation = ImportErrorUtils.validatePositiveNumber(hoursPerDay);
          if (!hoursValidation.isValid) {
            errorCollector.addDataError('People', rowNumber, this.getColumnLetter(expectedColumns.hoursPerDay), 'Hours Per Day', hoursPerDay, 'positive number', 'Invalid hours per day', 'Enter a positive number');
          } else if (hoursValidation.numericValue! > 24) {
            errorCollector.addError({
              type: 'warning',
              severity: 'medium',
              category: 'validation',
              worksheet: 'People',
              row: rowNumber,
              column: this.getColumnLetter(expectedColumns.hoursPerDay),
              field: 'Hours Per Day',
              currentValue: hoursPerDay,
              message: 'Hours per day exceeds 24 hours',
              suggestion: 'Consider if this value is correct'
            });
            validatedHoursPerDay = hoursValidation.numericValue!;
          } else {
            validatedHoursPerDay = hoursValidation.numericValue!;
          }
        }

        // Find or create primary role
        let primaryRoleId: string | null = null;
        if (primaryRoleName) {
          primaryRoleId = await this.findOrCreateRole(primaryRoleName);
        }

        const personData = {
          name: personName,
          email: personEmail && personEmail.trim() ? personEmail : null,
          worker_type: values[expectedColumns.workerType]?.toString() || 'FTE',
          default_availability_percentage: validatedAvailability,
          default_hours_per_day: validatedHoursPerDay,
          created_at: new Date(),
          updated_at: new Date()
        };

        const [insertedPerson] = await this.db('people').insert(personData).returning('*');

        // Link the primary role through person_roles — people.primary_person_role_id
        // FKs that join table, not the roles table. The old code wrote a
        // non-existent primary_role_id column, so every V1 person insert
        // failed and rolled the whole import back (schema drift, 2026-09-26).
        if (primaryRoleId) {
          const [personRole] = await this.db('person_roles').insert({
            person_id: insertedPerson.id,
            role_id: primaryRoleId,
            is_primary: 1
          }).returning('*');
          await this.db('people')
            .where('id', insertedPerson.id)
            .update({ primary_person_role_id: personRole.id });
        }

        // Handle supervisor relationship (will be processed in a second pass)
        const supervisorName = values[expectedColumns.supervisor]?.toString();
        if (supervisorName) {
          // Store for second pass processing
          await this.db('temp_supervisor_mapping').insert({
            person_id: insertedPerson.id,
            supervisor_name: supervisorName
          }).onConflict(['person_id']).merge();
        }

        count++;

      } catch (error) {
        errorCollector.addError({
          type: 'error',
          severity: 'high',
          category: 'system',
          worksheet: 'People',
          row: rowNumber,
          message: `Failed to import person: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestion: 'Check the data format and try again'
        });
      }
    }

    return { count, errors };
  }

  private async importStandardAllocations(worksheet: ExcelWorksheet, errorCollector: ImportErrorCollector, progressTracker?: ImportProgressTracker): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    if (!worksheet) {
      errorCollector.addCriticalError('Standard Allocations', 'Standard Allocations worksheet not found', 'Add a worksheet named "Standard Allocations" or "Allocations" to your Excel file');
      return { count, errors };
    }

    progressTracker?.startPhase(ImportPhase.ALLOCATIONS, `Processing ${worksheet.rowCount - 1} allocations`);

    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values as string[];
    
    const expectedColumns = {
      projectType: this.findColumnIndex(headers, ['Project Type', 'Type']),
      phase: this.findColumnIndex(headers, ['Phase', 'Project Phase']),
      role: this.findColumnIndex(headers, ['Role', 'Role Name']),
      allocation: this.findColumnIndex(headers, ['Allocation %', 'Allocation', 'Percentage'])
    };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      try {
        const row = worksheet.getRow(rowNumber);
        const values = row.values as any[];

        if (!values[expectedColumns.projectType]) continue;

        const projectTypeName = values[expectedColumns.projectType]?.toString();
        const phaseName = values[expectedColumns.phase]?.toString();
        const roleName = values[expectedColumns.role]?.toString();
        const allocationPercentage = parseFloat(values[expectedColumns.allocation]?.toString());

        if (!projectTypeName) {
          errorCollector.addDataError('Standard Allocations', rowNumber, this.getColumnLetter(expectedColumns.projectType), 'Project Type', values[expectedColumns.projectType], 'string', 'Project Type is required', 'Enter a project type');
          continue;
        }
        if (!phaseName) {
          errorCollector.addDataError('Standard Allocations', rowNumber, this.getColumnLetter(expectedColumns.phase), 'Phase', values[expectedColumns.phase], 'string', 'Phase is required', 'Enter a phase name');
          continue;
        }
        if (!roleName) {
          errorCollector.addDataError('Standard Allocations', rowNumber, this.getColumnLetter(expectedColumns.role), 'Role', values[expectedColumns.role], 'string', 'Role is required', 'Enter a role name');
          continue;
        }
        if (isNaN(allocationPercentage)) {
          errorCollector.addDataError('Standard Allocations', rowNumber, this.getColumnLetter(expectedColumns.allocation), 'Allocation', values[expectedColumns.allocation], 'number', 'Allocation percentage must be a valid number', 'Enter a number between 0 and 100');
          continue;
        }

        const projectTypeId = await this.findOrCreateProjectType(projectTypeName);
        const phaseId = await this.findOrCreatePhase(phaseName, count); // Use count as order index
        const roleId = await this.findOrCreateRole(roleName);

        const allocationData = {
          project_type_id: projectTypeId,
          phase_id: phaseId,
          role_id: roleId,
          allocation_percentage: allocationPercentage,
          created_at: new Date(),
          updated_at: new Date()
        };

        // Table was renamed to resource_templates (migration 046) — the old
        // name made every allocations data row fail with "no such table"
        // and roll the whole import back
        await this.db('resource_templates').insert(allocationData);
        count++;

      } catch (error) {
        errorCollector.addError({
          type: 'error',
          severity: 'high',
          category: 'system',
          worksheet: 'Standard Allocations',
          row: rowNumber,
          message: `Failed to import allocation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestion: 'Check the data format and try again'
        });
      }
    }

    return { count, errors };
  }

  private findColumnIndex(headers: string[], possibleNames: string[]): number {
    for (const name of possibleNames) {
      const index = headers.findIndex(header => 
        header && header.toString().toLowerCase().includes(name.toLowerCase())
      );
      if (index !== -1) return index;
    }
    return -1;
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

  private parseDate(value: any): string | null {
    if (!value) return null;
    
    try {
      if (value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      
      // Handle Excel date numbers
      if (typeof value === 'number') {
        const date = new Date((value - 25569) * 86400 * 1000);
        return date.toISOString().split('T')[0];
      }
    } catch {
      logger.warn('Failed to parse date', { value });
    }

    return null;
  }

  async importFromFile(filePath: string, options: ImportOptions = {}): Promise<ImportResult> {
    const { clearExisting = false, validateDuplicates = false, progressCallback } = options;
    const errorCollector = new ImportErrorCollector();
    const progressTracker = new ImportProgressTracker(progressCallback);
    
    const result: ImportResult = {
      success: false,
      imported: {
        locations: 0,
        projectTypes: 0,
        phases: 0,
        roles: 0,
        people: 0,
        projects: 0,
        standardAllocations: 0,
        assignments: 0
      },
      errors: [],
      warnings: []
    };
    
    // Estimate total operations for progress tracking
    progressTracker.setTotalOperations(10); // Basic estimate, will be refined

    // Validate duplicates first (before starting transaction)
    if (validateDuplicates) {
      try {
        progressTracker.startPhase(ImportPhase.VALIDATION, 'Checking for duplicate records');
        const duplicateCheck = await this.validateDuplicates(filePath);
        if (duplicateCheck.duplicatesFound && Object.values(duplicateCheck.duplicatesFound).some(arr => arr.length > 0)) {
          result.duplicatesFound = duplicateCheck.duplicatesFound;
          result.errors.push('Duplicate records found. Import cancelled to prevent data conflicts.');
          return result;
        }
        progressTracker.completeOperation('Duplicate validation completed');
      } catch (error) {
        result.errors.push(`Duplicate validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return result;
      }
    }

    // Start database transaction
    let trx;
    
    try {
      trx = await this.db.transaction();
      // Temporarily override database connection to use transaction
      const originalDb = this.db;
      this.db = trx;
      
      // Create temporary table for supervisor mapping within transaction
      await trx.schema.createTable('temp_supervisor_mapping', (table: import('knex').Knex.CreateTableBuilder) => {
        table.uuid('person_id').primary();
        table.string('supervisor_name');
      }).catch(() => {}); // Ignore if table already exists

      if (clearExisting) {
        progressTracker.startPhase(ImportPhase.PREPARATION, 'Clearing existing data');
        await this.clearExistingDataInTransaction(trx);
        progressTracker.completeOperation('Existing data cleared');
      }

      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      await workbook.xlsx.readFile(filePath);

      // Import in dependency order
      const peopleWorksheet = workbook.getWorksheet('Rosters') || workbook.getWorksheet('People');
      const peopleResult = await this.importPeople(peopleWorksheet, errorCollector, progressTracker);
      result.imported.people = peopleResult.count;
      result.errors.push(...peopleResult.errors);

      const projectsWorksheet = workbook.getWorksheet('Projects');
      const projectsResult = await this.importProjects(projectsWorksheet, errorCollector, progressTracker);
      result.imported.projects = projectsResult.count;
      result.errors.push(...projectsResult.errors);

      const allocationsWorksheet = workbook.getWorksheet('Standard Allocations') || workbook.getWorksheet('Allocations');
      const allocationsResult = await this.importStandardAllocations(allocationsWorksheet, errorCollector, progressTracker);
      result.imported.standardAllocations = allocationsResult.count;
      result.errors.push(...allocationsResult.errors);

      // Second pass: Update supervisor relationships
      progressTracker.startPhase(ImportPhase.FINALIZATION, 'Updating supervisor relationships');
      const supervisorMappings = await this.db('temp_supervisor_mapping').select('*');
      for (const mapping of supervisorMappings) {
        const supervisor = await this.db('people')
          .where('name', 'like', `%${mapping.supervisor_name}%`)
          .first();
        
        if (supervisor) {
          await this.db('people')
            .where('id', mapping.person_id)
            .update({ supervisor_id: supervisor.id });
        } else {
          errorCollector.addWarning('People', `Could not find supervisor: ${mapping.supervisor_name}`, undefined, undefined, 'Ensure supervisor exists in the People worksheet or will be created by import');
        }
      }
      progressTracker.completeOperation('Supervisor relationships updated');

      // Clean up temp table
      await trx.schema.dropTable('temp_supervisor_mapping').catch(() => {});

      // Count imported entities
      result.imported.locations = await this.db('locations').count('* as count').first().then((r: { count?: number | string } | undefined) => Number(r?.count) || 0);
      result.imported.projectTypes = await this.db('project_types').count('* as count').first().then((r: { count?: number | string } | undefined) => Number(r?.count) || 0);
      result.imported.phases = await this.db('project_phases').count('* as count').first().then((r: { count?: number | string } | undefined) => Number(r?.count) || 0);
      result.imported.roles = await this.db('roles').count('* as count').first().then((r: { count?: number | string } | undefined) => Number(r?.count) || 0);

      // Collect all structured errors and warnings
      const errorSummary = errorCollector.toJSON();
      result.errors.push(...errorSummary.errors.map(e => e.detailedMessage || e.message));
      result.warnings.push(...errorSummary.warnings.map(w => w.detailedMessage || w.message));

      // Check if there were any errors
      if (errorCollector.hasErrors() || result.errors.length > 0) {
        progressTracker.updateProgress('Rolling back due to errors');
        await trx.rollback();
        result.success = false;
        result.errors.unshift('Import rolled back due to errors.');
      } else {
        progressTracker.complete();
        await trx.commit();
        result.success = true;
      }

      // Restore original database connection
      this.db = originalDb;

    } catch (error) {
      if (trx) {
        await trx.rollback();
      }
      result.errors.push(`Import failed and rolled back: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.success = false;
    }

    return result;
  }

  async analyzeImport(filePath: string, options: ImportOptions = {}): Promise<any> {
    logger.info('Starting dry-run import analysis', { filePath });
    
    const analysis = {
      summary: {
        totalChanges: 0,
        wouldCreate: {
          locations: 0,
          projectTypes: 0,
          phases: 0,
          roles: 0,
          people: 0,
          projects: 0,
          standardAllocations: 0,
          assignments: 0
        },
        wouldUpdate: {
          people: 0,
          projects: 0,
          assignments: 0
        },
        wouldDelete: {
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
      conflicts: [] as string[],
      warnings: [] as string[],
      errors: [] as string[],
      preview: {
        newEntities: [] as Array<{ type: string; name: string; action: string; details?: Record<string, unknown> }>,
        modifiedEntities: [] as Array<{ type: string; name: string; action: string; changes?: string[] }>,
        deletedEntities: [] as Array<{ type: string; name: string; action: string }>,
        duplicates: [] as Array<{ type: string; name: string; existing: string }>
      },
      riskAssessment: {
        level: 'low' as 'low' | 'medium' | 'high',
        factors: [] as string[],
        recommendations: [] as string[]
      }
    };

    try {
      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      // Initialize error collector for analysis
      const errorCollector = new ImportErrorCollector();
      
      // Analyze each worksheet
      const analysisPromises = [
        this.analyzeProjectsWorksheet(workbook, options, analysis, errorCollector),
        this.analyzePeopleWorksheet(workbook, options, analysis, errorCollector),
        this.analyzeStandardAllocationsWorksheet(workbook, options, analysis, errorCollector)
      ];

      await Promise.all(analysisPromises);

      // Calculate risk assessment
      this.assessImportRisk(analysis);
      
      // Aggregate errors and warnings
      const collectedErrors = errorCollector.getErrors();
      analysis.errors = collectedErrors.filter(e => e.severity === 'critical' || e.severity === 'high').map(e => e.message);
      analysis.warnings = collectedErrors.filter(e => e.severity === 'medium' || e.severity === 'low').map(e => e.message);

      // Calculate total changes
      analysis.summary.totalChanges = 
        Object.values(analysis.summary.wouldCreate).reduce((sum, count) => sum + count, 0) +
        Object.values(analysis.summary.wouldUpdate).reduce((sum, count) => sum + count, 0) +
        Object.values(analysis.summary.wouldDelete).reduce((sum, count) => sum + count, 0);

      logger.info('Dry-run analysis completed', { summary: analysis.summary });
      return analysis;

    } catch (error) {
      analysis.errors.push(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      analysis.riskAssessment.level = 'high';
      analysis.riskAssessment.factors.push('File analysis failed');
      return analysis;
    }
  }

  private async analyzeProjectsWorksheet(workbook: any, options: ImportOptions, analysis: any, errorCollector: ImportErrorCollector) {
    const projectsSheet = workbook.getWorksheet('Projects');
    if (!projectsSheet) {
      errorCollector.addError(ImportErrorUtils.missingWorksheet('Projects'));
      return;
    }

    const projects = [];
    const existingProjects = await this.db('projects').select('name', 'id');
    const existingProjectNames = new Set(existingProjects.map((p: { name: string }) => p.name.toLowerCase()));

    projectsSheet.eachRow((row: Row, rowNumber: number) => {
      if (rowNumber === 1) return; // Skip header

      const projectName = row.getCell(1).value?.toString()?.trim();
      if (!projectName) return;

      const isNew = !existingProjectNames.has(projectName.toLowerCase());
      
      if (isNew) {
        analysis.summary.wouldCreate.projects++;
        analysis.preview.newEntities.push({
          type: 'project',
          name: projectName,
          action: 'create',
          data: {
            name: projectName,
            type: row.getCell(2).value?.toString(),
            location: row.getCell(3).value?.toString(),
            priority: row.getCell(4).value?.toString()
          }
        });
      } else if (!options.clearExisting) {
        analysis.summary.wouldUpdate.projects++;
        analysis.preview.modifiedEntities.push({
          type: 'project',
          name: projectName,
          action: 'update',
          changes: ['Will be updated with new data from import']
        });
      }

      projects.push({ name: projectName, isNew });
    });

    // Check for potential deletions if clearExisting is true
    if (options.clearExisting) {
      const projectsToDelete = existingProjects.length;
      analysis.summary.wouldDelete.projects = projectsToDelete;
      if (projectsToDelete > 0) {
        analysis.preview.deletedEntities.push({
          type: 'projects',
          count: projectsToDelete,
          reason: 'Clear existing data option selected'
        });
        analysis.riskAssessment.factors.push(`${projectsToDelete} existing projects will be deleted`);
      }
    }
  }

  private async analyzePeopleWorksheet(workbook: any, options: ImportOptions, analysis: any, errorCollector: ImportErrorCollector) {
    const peopleSheet = workbook.getWorksheet('Rosters') || workbook.getWorksheet('People');
    if (!peopleSheet) {
      errorCollector.addError(ImportErrorUtils.missingWorksheet('Rosters/People'));
      return;
    }

    const existingPeople = await this.db('people').select('name', 'email', 'id');
    const existingPeopleNames = new Set(existingPeople.map((p: { name: string }) => p.name.toLowerCase()));
    const existingEmails = new Set(existingPeople.filter((p: { email?: string }) => p.email).map((p: { email: string }) => p.email.toLowerCase()));

    peopleSheet.eachRow((row: Row, rowNumber: number) => {
      if (rowNumber === 1) return; // Skip header

      const personName = row.getCell(1).value?.toString()?.trim();
      const personEmail = row.getCell(2).value?.toString()?.trim();
      
      if (!personName) return;

      const isNewName = !existingPeopleNames.has(personName.toLowerCase());
      const emailConflict = personEmail && existingEmails.has(personEmail.toLowerCase());

      if (isNewName && !emailConflict) {
        analysis.summary.wouldCreate.people++;
        analysis.preview.newEntities.push({
          type: 'person',
          name: personName,
          action: 'create',
          data: {
            name: personName,
            email: personEmail,
            role: row.getCell(3).value?.toString()
          }
        });
      } else {
        if (emailConflict) {
          analysis.conflicts.push({
            type: 'email_conflict',
            message: `Email ${personEmail} already exists for a different person`,
            entity: personName,
            field: 'email',
            existingValue: personEmail,
            suggestedAction: 'Review and resolve email duplication'
          });
        } else {
          analysis.summary.wouldUpdate.people++;
          analysis.preview.modifiedEntities.push({
            type: 'person',
            name: personName,
            action: 'update',
            changes: ['Personal information will be updated']
          });
        }
      }
    });
  }

  private async analyzeStandardAllocationsWorksheet(workbook: any, options: ImportOptions, analysis: any, _errorCollector: ImportErrorCollector) {
    const allocationsSheet = workbook.getWorksheet('Standard Allocations');
    if (!allocationsSheet) {
      return; // Optional worksheet
    }

    const existingAllocations = await this.db('standard_allocations').count('* as count').first() as { count: number } | undefined;
    let newAllocations = 0;

    allocationsSheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return; // Skip header

      const projectType = row.getCell(1).value?.toString()?.trim();
      const role = row.getCell(2).value?.toString()?.trim();
      const allocation = row.getCell(3).value;

      if (projectType && role && allocation) {
        newAllocations++;
      }
    });

    if (options.clearExisting && existingAllocations && existingAllocations.count > 0) {
      analysis.summary.wouldDelete.standardAllocations = existingAllocations.count;
      analysis.preview.deletedEntities.push({
        type: 'standard_allocations',
        count: existingAllocations.count,
        reason: 'Clear existing data option selected'
      });
    }

    analysis.summary.wouldCreate.standardAllocations = newAllocations;
  }

  private assessImportRisk(analysis: any) {
    const riskFactors = [];
    let riskLevel = 'low';

    // Check for high-impact operations
    const totalDeletions = Object.values(analysis.summary.wouldDelete as Record<string, number>).reduce((sum, count) => sum + count, 0);
    const totalCreations = Object.values(analysis.summary.wouldCreate as Record<string, number>).reduce((sum, count) => sum + count, 0);

    if (totalDeletions > 0) {
      riskLevel = 'high';
      riskFactors.push(`${totalDeletions} existing records will be deleted`);
      analysis.riskAssessment.recommendations.push('Consider backing up data before proceeding');
    }

    if (totalCreations > 100) {
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
      riskFactors.push(`Large import: ${totalCreations} new records will be created`);
      analysis.riskAssessment.recommendations.push('Consider importing in smaller batches');
    }

    if (analysis.conflicts.length > 0) {
      riskLevel = 'high';
      riskFactors.push(`${analysis.conflicts.length} data conflicts detected`);
      analysis.riskAssessment.recommendations.push('Resolve conflicts before importing');
    }

    if (analysis.errors.length > 0) {
      riskLevel = 'high';
      riskFactors.push(`${analysis.errors.length} critical errors found`);
      analysis.riskAssessment.recommendations.push('Fix errors before proceeding with import');
    }

    if (riskFactors.length === 0) {
      riskFactors.push('No significant risks detected');
      analysis.riskAssessment.recommendations.push('Import appears safe to proceed');
    }

    analysis.riskAssessment.level = riskLevel;
    analysis.riskAssessment.factors = riskFactors;
  }
}