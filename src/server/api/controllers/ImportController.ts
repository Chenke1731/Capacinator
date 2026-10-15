import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { ExcelImporter } from '../../services/import/ExcelImporter.js';
import { ExcelImporterV2 } from '../../services/import/ExcelImporterV2.js';
import { logger } from '../../services/logging/config.js';
import { getConfig } from '../../config/index.js';
import { storedDateToIso, toIsoDateString } from '../../utils/isoDate.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import type ExcelJSTypes from 'exceljs';
import { resolveScenarioId } from '../../services/calc/effectiveAssignments.js';

// Import ExcelJS using dynamic import for better ES module compatibility
let ExcelJS: typeof ExcelJSTypes | null = null;

async function initializeExcelJS(): Promise<typeof ExcelJSTypes> {
  if (!ExcelJS) {
    ExcelJS = (await import('exceljs')).default;
  }
  return ExcelJS;
}

// ============================================================================
// Import Types
// ============================================================================

/**
 * Template options for export/import templates
 */
interface TemplateOptions {
  includeInstructions?: boolean;
  includeExamples?: boolean;
  dataTypes?: string[];
  templateType?: string;
  includeAssignments?: boolean;
  includePhases?: boolean;
  generatedAt?: string;
}

/**
 * Scenario data for export metadata
 */
interface ScenarioData {
  id: string;
  name: string;
  description?: string;
  scenario_type?: string;
  status?: string;
  created_at?: string;
  parent_scenario_id?: string;
  created_by_name?: string;
}

/**
 * Export options for data export
 */
interface ExportOptions {
  includeMetadata?: boolean;
  dataTypes?: string[];
  includeAssignments?: boolean;
  includePhases?: boolean;
  exportedBy?: string;
  exportedAt?: string;
}

interface ImportSettings {
  clearExistingData: boolean;
  validateDuplicates: boolean;
  autoCreateMissingRoles: boolean;
  autoCreateMissingLocations: boolean;
  defaultProjectPriority: number;
  dateFormat: string;
}

/**
 * Import history record from database
 */
interface ImportHistoryRecord {
  id: string;
  file_name: string;
  file_size: string;
  file_mime_type: string;
  import_type: string;
  status: string;
  imported_counts?: string;
  errors?: string;
  warnings?: string;
  duplicates_found?: string;
  started_at?: Date;
  completed_at?: Date;
  duration_ms?: number;
  imported_by?: string;
}

/**
 * ImportController
 * 
 * ADMIN/UTILITY USE ONLY
 * 
 * This controller is maintained for administrative utility access only.
 * The Excel import functionality has been removed from the main UI to
 * streamline the user experience. Import operations should now be performed
 * using the command-line utility script: scripts/import-excel.js
 * 
 * Usage: npm run import:excel -- --file=data.xlsx [options]
 */
export class ImportController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  private upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ];
      
      if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
      }
    },
    limits: {
      fileSize: getConfig().server.maxFileSize
    }
  });

  getUploadMiddleware() {
    return this.upload.single('excelFile');
  }

  private async getImportSettings(): Promise<ImportSettings> {
    try {
      // Check if settings table exists first
      const tableExists = await this.db.schema.hasTable('settings');

      if (!tableExists) {
        // Return default settings if table doesn't exist
        return {
          clearExistingData: false,
          validateDuplicates: true,
          autoCreateMissingRoles: false,
          autoCreateMissingLocations: false,
          defaultProjectPriority: 2,
          dateFormat: 'MM/DD/YYYY'
        };
      }

      const result = await this.db('settings')
        .where('category', 'import')
        .first();

      if (!result) {
        // Return default settings if none found
        return {
          clearExistingData: false,
          validateDuplicates: true,
          autoCreateMissingRoles: false,
          autoCreateMissingLocations: false,
          defaultProjectPriority: 2,
          dateFormat: 'MM/DD/YYYY'
        };
      }

      return JSON.parse(result.value || '{}');
    } catch {
      // Silently return default settings on error - settings table is optional
      return {
        clearExistingData: false,
        validateDuplicates: true,
        autoCreateMissingRoles: false,
        autoCreateMissingLocations: false,
        defaultProjectPriority: 2,
        dateFormat: 'MM/DD/YYYY'
      };
    }
  }

  async getImportSettingsEndpoint(req: Request, res: Response) {
    try {
      const settings = await this.getImportSettings();
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      this.handleError(error, res, 'Failed to get import settings');
    }
  }

  /**
   * 导入布尔选项统一解释（IP-05a/F04）：显式 true/false（含 multipart 字符串形式）
   * 一律保留——显式 false 必须能覆盖已保存的 true；仅缺省（undefined/null/空串）
   * 才回落保存设置。upload 与 analyze 共用同一解释,预览与执行不再分叉。
   */
  private parseImportOptions(body: Record<string, unknown>, saved: ImportSettings, dryRun = false) {
    const bool = (raw: unknown, savedDefault: boolean): boolean => {
      if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
      if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
      return savedDefault; // 缺省或无法解释的值:遵循保存设置
    };
    return {
      clearExisting: bool(body.clearExisting, saved.clearExistingData),
      useV2: bool(body.useV2, false),
      validateDuplicates: bool(body.validateDuplicates, saved.validateDuplicates),
      autoCreateMissingRoles: bool(body.autoCreateMissingRoles, saved.autoCreateMissingRoles),
      autoCreateMissingLocations: bool(body.autoCreateMissingLocations, saved.autoCreateMissingLocations),
      defaultProjectPriority:
        body.defaultProjectPriority != null && body.defaultProjectPriority !== ''
          ? parseInt(String(body.defaultProjectPriority), 10)
          : saved.defaultProjectPriority,
      dateFormat: (body.dateFormat as string) || saved.dateFormat,
      ...(dryRun ? { dryRun: true } : {})
    };
  }

  async uploadExcel(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select an Excel file to upload'
        });
      }

      // Load saved import settings from database
      const savedSettings = await this.getImportSettings();

      // Parse import options from request body with fallback to saved settings
      const importOptions = {
        ...this.parseImportOptions(req.body, savedSettings),
        // 贯通: 场景事实(分配)写请求选定场景切片,缺省 baseline
        scenarioId: resolveScenarioId(req.headers['x-scenario-id'])
      };
      
      logger.info('Starting Excel import', { path: req.file.path, options: importOptions });
      
      // Create import history record
      const startTime = Date.now();
      const historyRecord = {
        file_name: req.file.originalname,
        file_size: req.file.size.toString(),
        file_mime_type: req.file.mimetype,
        import_type: importOptions.useV2 ? 'v2' : 'v1',
        clear_existing: importOptions.clearExisting,
        validate_duplicates: importOptions.validateDuplicates,
        auto_create_missing_roles: importOptions.autoCreateMissingRoles,
        auto_create_missing_locations: importOptions.autoCreateMissingLocations,
        default_project_priority: importOptions.defaultProjectPriority,
        date_format: importOptions.dateFormat,
        status: 'processing',
        imported_by: req.user?.name || req.user?.email || 'anonymous',
        started_at: new Date(),
        request_id: req.headers['x-request-id'] || (req as Request & { id?: string }).id,
        ip_address: req.ip
      };

      const [historyId] = await this.db('import_history')
        .insert(historyRecord)
        .returning('id');

      let result;
      try {
        result = importOptions.useV2
          ? await new ExcelImporterV2().importFromFile(req.file.path, importOptions)
          : await new ExcelImporter().importFromFile(req.file.path, importOptions);
      } catch (importError: unknown) {
        // Update history record with failure
        const errorMessage = importError instanceof Error ? importError.message : 'Unknown import error';
        await this.db('import_history')
          .where('id', historyId.id || historyId)
          .update({
            status: 'failed',
            errors: JSON.stringify([errorMessage]),
            duration_ms: Date.now() - startTime,
            completed_at: new Date()
          });
        throw importError;
      }
      
      // Update history record with results
      await this.db('import_history')
        .where('id', historyId.id || historyId)
        .update({
          status: result.success ? 'success' : 'failed',
          imported_counts: JSON.stringify(result.imported),
          errors: result.errors ? JSON.stringify(result.errors) : null,
          warnings: result.warnings ? JSON.stringify(result.warnings) : null,
          duplicates_found: result.duplicatesFound ? JSON.stringify(result.duplicatesFound) : null,
          duration_ms: Date.now() - startTime,
          completed_at: new Date()
        });

      // Clean up uploaded file
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
      }

      if (result.success) {
        res.json({
          success: true,
          message: 'Excel import completed successfully',
          imported: result.imported,
          warnings: result.warnings
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Excel import completed with errors',
          imported: result.imported,
          errors: result.errors,
          warnings: result.warnings
        });
      }

    } catch (error) {
      // Clean up uploaded file on error
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        }
      }

      this.handleError(error, res, 'Excel import failed');
    }
  }

  async downloadTemplate(req: Request, res: Response) {
    try {
      const includeAssignments = req.query.includeAssignments !== 'false';
      const includePhases = req.query.includePhases !== 'false';
      const templateType = req.query.templateType as string || 'complete';
      
      // Initialize ExcelJS
      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      
      // Set workbook metadata
      workbook.creator = 'Capacinator';
      workbook.lastModifiedBy = 'System';
      workbook.created = new Date();
      workbook.modified = new Date();
      (workbook.properties as unknown as Record<string, unknown>).title = 'Capacinator Import Template';
      (workbook.properties as unknown as Record<string, unknown>).subject = 'Capacinator Data Import Template';
      (workbook.properties as unknown as Record<string, unknown>).description = 'Blank template for importing scenario data into Capacinator';

      // Create Template Info sheet first
      await this.addTemplateInfoSheet(workbook, {
        templateType,
        includeAssignments,
        includePhases,
        generatedAt: new Date().toISOString()
      });
      
      // Create Projects worksheet with enhanced formatting
      await this.addProjectsTemplateSheet(workbook);
      
      // Create People/Rosters worksheet with enhanced formatting
      await this.addPeopleTemplateSheet(workbook);
      
      // Create Standard Allocations worksheet
      await this.addStandardAllocationsTemplateSheet(workbook);
      
      if (includeAssignments) {
        // Create Project Assignments template
        await this.addAssignmentsTemplateSheet(workbook);
      }
      
      if (includePhases) {
        // Create Project Phase Timelines template
        await this.addPhaseTimelinesTemplateSheet(workbook);
      }

      // Add validation and instructions sheet
      await this.addInstructionsSheet(workbook, {
        includeAssignments,
        includePhases,
        templateType
      });
      
      // Generate Excel buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      // Set response headers with enhanced filename
      const timestamp = toIsoDateString(new Date());
      const filename = `capacinator_import_template_${templateType}_${timestamp}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Send the file
      res.send(buffer);

    } catch (error) {
      this.handleError(error, res, 'Failed to generate template');
    }
  }

  async getImportHistory(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = (page - 1) * limit;
      
      // Get total count
      const totalCountResult = await this.db('import_history').count('* as count').first();
      const totalCount = parseInt(totalCountResult.count, 10);
      
      // Get import history records
      const imports = await this.db('import_history')
        .select('*')
        .orderBy('started_at', 'desc')
        .limit(limit)
        .offset(offset);
      
      // Parse JSON fields
      const formattedImports = imports.map((record: ImportHistoryRecord) => ({
        ...record,
        imported_counts: record.imported_counts ? JSON.parse(record.imported_counts) : null,
        errors: record.errors ? JSON.parse(record.errors) : [],
        warnings: record.warnings ? JSON.parse(record.warnings) : [],
        duplicates_found: record.duplicates_found ? JSON.parse(record.duplicates_found) : null
      }));
      
      res.json({
        success: true,
        data: {
          imports: formattedImports,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNextPage: page < Math.ceil(totalCount / limit),
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to fetch import history');
    }
  }

  async validateFile(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select an Excel file to validate'
        });
      }

      // Check file format first
      const allowedExtensions = ['.xlsx', '.xls'];
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      
      if (!allowedExtensions.includes(fileExtension)) {
        // Clean up uploaded file
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        }
        
        return res.status(400).json({
          valid: false,
          canImport: false,
          errors: [{
            type: 'error',
            severity: 'critical',
            message: 'File must be an Excel file (.xlsx or .xls)',
            suggestion: 'Please select a valid Excel file'
          }]
        });
      }

      // Parse import options to determine which importer to use
      const useV2 = req.body.useV2 === 'true' || req.body.useV2 === true;
      
      logger.info('Validating Excel file', { filename: req.file.originalname, format: useV2 ? 'V2' : 'V1' });

      // Perform comprehensive validation
      let validationResult;
      try {
        if (useV2) {
          const importer = new ExcelImporterV2();
          validationResult = await importer.validateExcelStructure(req.file.path);
        } else {
          const importer = new ExcelImporter();
          validationResult = await importer.validateExcelStructure(req.file.path);
        }
      } catch (validationError) {
        // Clean up uploaded file
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        }
        
        return res.status(400).json({
          valid: false,
          canImport: false,
          errors: [{
            type: 'error',
            severity: 'critical',
            message: `Validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`,
            suggestion: 'Ensure the file is not corrupted and follows the expected format'
          }]
        });
      }

      // Clean up uploaded file
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
      }

      // Return comprehensive validation results
      res.json({
        success: true,
        ...validationResult,
        fileInfo: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype,
          formatVersion: useV2 ? 'V2 (Fiscal Weeks)' : 'V1 (Standard)'
        }
      });

    } catch (error) {
      // Clean up uploaded file on error
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        }
      }

      this.handleError(error, res, 'File validation failed');
    }
  }

  async exportScenarioData(req: Request, res: Response) {
    try {
      logger.info('Export scenario data request received', {
        scenarioId: req.query.scenarioId,
        includeAssignments: req.query.includeAssignments,
        includePhases: req.query.includePhases,
        user: req.user?.email || 'unknown'
      });

      const scenarioId = req.query.scenarioId as string;
      const includeAssignments = req.query.includeAssignments !== 'false';
      const includePhases = req.query.includePhases !== 'false';
      
      // Default to baseline scenario if none specified
      let targetScenarioId = scenarioId;
      if (!targetScenarioId) {
        const baselineScenario = await this.db('scenarios')
          .where('scenario_type', 'baseline')
          .first();
        
        if (!baselineScenario) {
          return res.status(400).json({
            error: 'No scenario specified and no baseline scenario found',
            message: 'Please specify a scenario ID or ensure a baseline scenario exists'
          });
        }
        targetScenarioId = baselineScenario.id;
      }

      // Verify scenario exists
      const scenario = await this.db('scenarios')
        .where('id', targetScenarioId)
        .first();
      
      if (!scenario) {
        return res.status(404).json({
          error: 'Scenario not found',
          message: 'The specified scenario does not exist'
        });
      }

      logger.info('Exporting scenario data', { scenarioName: scenario.name, scenarioType: scenario.scenario_type });

      // Initialize ExcelJS
      const ExcelJSClass = await initializeExcelJS();
      const workbook = new ExcelJSClass.Workbook();
      
      // Set workbook metadata
      workbook.creator = 'Capacinator';
      workbook.lastModifiedBy = req.user?.name || 'System';
      workbook.created = new Date();
      workbook.modified = new Date();
      (workbook.properties as unknown as Record<string, unknown>).title = `${scenario.name} - Scenario Export`;
      (workbook.properties as unknown as Record<string, unknown>).subject = 'Capacinator Scenario Data Export';
      (workbook.properties as unknown as Record<string, unknown>).description = `Complete scenario data export for re-import. Scenario: ${scenario.name} (${scenario.scenario_type})`;

      // Export Projects
      await this.addProjectsToWorkbook(workbook, targetScenarioId, scenario.scenario_type);
      
      // Export People (roster)
      await this.addPeopleToWorkbook(workbook, targetScenarioId, scenario.scenario_type);
      
      // Export Standard Allocations
      await this.addStandardAllocationsToWorkbook(workbook, targetScenarioId, scenario.scenario_type);
      
      if (includeAssignments) {
        // Export Project Assignments
        await this.addAssignmentsToWorkbook(workbook, targetScenarioId, scenario.scenario_type);
      }
      
      if (includePhases) {
        // Export Project Phase Timelines
        await this.addPhaseTimelinesToWorkbook(workbook, targetScenarioId, scenario.scenario_type);
      }

      // Add metadata sheet
      await this.addMetadataToWorkbook(workbook, scenario, {
        includeAssignments,
        includePhases,
        exportedBy: req.user?.name || 'System',
        exportedAt: new Date().toISOString()
      });

      // Generate Excel buffer
      logger.debug('Generating Excel buffer');
      const buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
      logger.info('Excel buffer generated successfully', { size: buffer.byteLength });
      
      // Set response headers
      const filename = `${scenario.name.replace(/[^a-zA-Z0-9]/g, '_')}_export_${toIsoDateString(new Date())}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      logger.info('Sending export file', { filename });
      // Send the file
      res.send(buffer);

    } catch (error) {
      logger.error('Export scenario data failed', error instanceof Error ? error : undefined);
      this.handleError(error, res, 'Failed to export scenario data');
    }
  }

  async analyzeImport(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select an Excel file to analyze'
        });
      }

      // Load saved import settings from database
      const savedSettings = await this.getImportSettings();

      // Parse import options with the same shared interpretation as execution (IP-05a/F04)
      const importOptions = {
        ...this.parseImportOptions(req.body, savedSettings, true),
        scenarioId: resolveScenarioId(req.headers['x-scenario-id'])
      };
      
      logger.info('Starting dry-run import analysis', { path: req.file.path, options: importOptions });
      
      // Perform dry-run analysis
      let analysisResult;
      try {
        // IP-05b: V2 预览用 V2 自己的分析器(同管线事务回滚),不再借 V1
        const importer = importOptions.useV2
          ? new ExcelImporterV2()
          : new ExcelImporter();
        analysisResult = await importer.analyzeImport(req.file.path, importOptions);
      } catch (analysisError) {
        return res.status(400).json({
          success: false,
          error: 'Analysis failed',
          message: `Import analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`,
          details: analysisError
        });
      }

      // Clean up uploaded file
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
      }

      // Return comprehensive analysis results
      res.json({
        success: true,
        message: 'Import analysis completed successfully',
        analysis: analysisResult,
        options: importOptions,
        fileInfo: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype,
          formatVersion: importOptions.useV2 ? 'V2 (Fiscal Weeks)' : 'V1 (Standard)'
        }
      });

    } catch (error) {
      // Clean up uploaded file on error
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          logger.warn('Failed to clean up uploaded file', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
        }
      }

      this.handleError(error, res, 'Import analysis failed');
    }
  }

  private async addTemplateInfoSheet(workbook: ExcelJSTypes.Workbook, templateOptions: TemplateOptions): Promise<void> {
    const infoSheet = workbook.addWorksheet('Template Info');
    
    // Define columns for template info
    infoSheet.columns = [
      { header: 'Property', key: 'property', width: 30 },
      { header: 'Value', key: 'value', width: 50 }
    ];

    // Style the header row
    this.styleHeaderRow(infoSheet);

    // Add template information
    const templateInfo = [
      { property: 'Template Type', value: 'Capacinator Data Import Template' },
      { property: 'Template Version', value: 'V1.0 - Enhanced' },
      { property: 'Compatible Import Format', value: 'V1 (Standard) and V2 (Fiscal Weeks)' },
      { property: 'Generated At', value: templateOptions.generatedAt },
      { property: 'Template Configuration', value: templateOptions.templateType },
      { property: 'Include Assignments Sheet', value: templateOptions.includeAssignments ? 'Yes' : 'No' },
      { property: 'Include Phase Timelines Sheet', value: templateOptions.includePhases ? 'Yes' : 'No' },
      { property: 'Capacinator Version', value: 'v1.0.0' }
    ];

    templateInfo.forEach(item => {
      infoSheet.addRow(item);
    });

    // Add usage instructions
    infoSheet.addRow({});
    infoSheet.addRow({ property: 'USAGE INSTRUCTIONS', value: '' });
    infoSheet.addRow({ property: '1. Fill in Data', value: 'Complete the data in each worksheet tab' });
    infoSheet.addRow({ property: '2. Follow Format', value: 'Follow the exact column headers and data formats shown' });
    infoSheet.addRow({ property: '3. Remove Sample Data', value: 'Delete any sample/example rows before importing' });
    infoSheet.addRow({ property: '4. Validate Data', value: 'Use the Import page to validate before final import' });
    infoSheet.addRow({ property: '5. Review Instructions', value: 'Check the Instructions tab for detailed requirements' });
  }

  private async addProjectsTemplateSheet(workbook: ExcelJSTypes.Workbook): Promise<void> {
    const projectsSheet = workbook.addWorksheet('Projects');
    
    // Define columns with enhanced format
    projectsSheet.columns = [
      { header: 'Project Name *', key: 'name', width: 30 },
      { header: 'Project Type *', key: 'project_type', width: 20 },
      { header: 'Project Sub Type', key: 'project_sub_type', width: 20 },
      { header: 'Location *', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Owner', key: 'owner', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Aspiration Start', key: 'aspiration_start', width: 15 },
      { header: 'Aspiration Finish', key: 'aspiration_finish', width: 15 },
      { header: 'External ID', key: 'external_id', width: 20 }
    ];

    // Enhanced header styling
    this.styleHeaderRow(projectsSheet);
    
    // Add data validation and sample data
    projectsSheet.addRow({
      name: 'Example: Digital Transformation Initiative',
      project_type: 'Development',
      project_sub_type: 'Web Application',
      location: 'San Francisco',
      priority: 2,
      description: 'Complete modernization of legacy systems with cloud migration',
      start_date: '2024-01-15',
      end_date: '2024-12-31',
      owner: 'Jane Smith',
      status: 'planned',
      aspiration_start: '2024-01-01',
      aspiration_finish: '2024-11-30',
      external_id: 'PROJ-2024-001'
    });

    // Add data format notes
    this.addFormatNotesToSheet(projectsSheet, [
      'Required fields marked with *',
      'Dates should be in YYYY-MM-DD format',
      'Priority: 1=Low, 2=Medium, 3=High',
      'Status values: planned, active, on-hold, completed',
      'Delete this sample row before importing'
    ]);
  }

  private async addPeopleTemplateSheet(workbook: ExcelJSTypes.Workbook): Promise<void> {
    const rostersSheet = workbook.addWorksheet('Rosters');
    
    // Define columns with enhanced format
    rostersSheet.columns = [
      { header: 'Name *', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'primary_role', width: 20 },
      { header: 'Worker Type *', key: 'worker_type', width: 15 },
      { header: 'Supervisor', key: 'supervisor', width: 25 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Availability % *', key: 'availability', width: 15 },
      { header: 'Hours Per Day *', key: 'hours_per_day', width: 15 },
      { header: 'Is Bubble', key: 'is_bubble', width: 12 }
    ];

    // Enhanced header styling
    this.styleHeaderRow(rostersSheet);
    
    // Add sample data with realistic examples
    rostersSheet.addRow({
      name: 'Alice Johnson',
      email: 'alice.johnson@company.com',
      primary_role: 'Senior Developer',
      worker_type: 'FTE',
      supervisor: 'Bob Smith',
      location: 'San Francisco',
      availability: 100,
      hours_per_day: 8,
      is_bubble: 'No'
    });

    rostersSheet.addRow({
      name: 'Carlos Rodriguez',
      email: 'carlos.rodriguez@company.com',
      primary_role: 'UI/UX Designer',
      worker_type: 'Contractor',
      supervisor: 'Alice Johnson',
      location: 'Remote',
      availability: 75,
      hours_per_day: 6,
      is_bubble: 'Yes'
    });

    // Add data format notes
    this.addFormatNotesToSheet(rostersSheet, [
      'Required fields marked with *',
      'Worker Type: FTE, Contractor, or Consultant',
      'Availability: percentage (0-100)',
      'Hours Per Day: decimal numbers allowed (e.g., 7.5)',
      'Is Bubble: Yes or No (indicates temporary/flexible resource)',
      'Delete sample rows before importing'
    ]);
  }

  private async addStandardAllocationsTemplateSheet(workbook: ExcelJSTypes.Workbook): Promise<void> {
    const allocationsSheet = workbook.addWorksheet('Standard Allocations');
    
    // Define columns with enhanced format
    allocationsSheet.columns = [
      { header: 'Project Type *', key: 'project_type', width: 20 },
      { header: 'Project Sub Type', key: 'project_sub_type', width: 20 },
      { header: 'Phase *', key: 'phase', width: 20 },
      { header: 'Role *', key: 'role', width: 20 },
      { header: 'Allocation % *', key: 'allocation', width: 15 }
    ];

    // Enhanced header styling
    this.styleHeaderRow(allocationsSheet);
    
    // Add comprehensive sample data
    allocationsSheet.addRow({
      project_type: 'Development',
      project_sub_type: 'Web Application',
      phase: 'Planning',
      role: 'Project Manager',
      allocation: 25
    });

    allocationsSheet.addRow({
      project_type: 'Development',
      project_sub_type: 'Web Application',
      phase: 'Development',
      role: 'Senior Developer',
      allocation: 80
    });

    allocationsSheet.addRow({
      project_type: 'Development',
      project_sub_type: 'Mobile Application',
      phase: 'Testing',
      role: 'QA Engineer',
      allocation: 100
    });

    // Add data format notes
    this.addFormatNotesToSheet(allocationsSheet, [
      'Required fields marked with *',
      'Allocation: percentage of time (0-100)',
      'Project Sub Type is optional - leave blank for general type allocations',
      'These define default allocations for project planning',
      'Delete sample rows before importing'
    ]);
  }

  private async addAssignmentsTemplateSheet(workbook: ExcelJSTypes.Workbook): Promise<void> {
    const assignmentsSheet = workbook.addWorksheet('Project Assignments');
    
    // Define columns for assignments
    assignmentsSheet.columns = [
      { header: 'Project Name *', key: 'project_name', width: 30 },
      { header: 'Person Name *', key: 'person_name', width: 25 },
      { header: 'Role *', key: 'role_name', width: 20 },
      { header: 'Phase', key: 'phase_name', width: 20 },
      { header: 'Allocation % *', key: 'allocation_percentage', width: 15 },
      { header: 'Assignment Mode *', key: 'assignment_date_mode', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    // Enhanced header styling
    this.styleHeaderRow(assignmentsSheet);
    
    // Add sample assignment data
    assignmentsSheet.addRow({
      project_name: 'Digital Transformation Initiative',
      person_name: 'Alice Johnson',
      role_name: 'Senior Developer',
      phase_name: 'Development',
      allocation_percentage: 75,
      assignment_date_mode: 'phase',
      start_date: '',
      end_date: '',
      notes: 'Lead developer for backend services'
    });

    assignmentsSheet.addRow({
      project_name: 'Digital Transformation Initiative',
      person_name: 'Carlos Rodriguez',
      role_name: 'UI/UX Designer',
      phase_name: 'Design',
      allocation_percentage: 50,
      assignment_date_mode: 'fixed',
      start_date: '2024-02-01',
      end_date: '2024-04-30',
      notes: 'Responsible for user interface design'
    });

    // Add data format notes
    this.addFormatNotesToSheet(assignmentsSheet, [
      'Required fields marked with *',
      'Assignment Mode: fixed, phase, or project',
      'For fixed mode: provide Start Date and End Date',
      'For phase/project mode: dates calculated automatically',
      'Allocation: percentage of person\'s time (0-100)',
      'Delete sample rows before importing'
    ]);
  }

  private async addPhaseTimelinesTemplateSheet(workbook: ExcelJSTypes.Workbook): Promise<void> {
    const phasesSheet = workbook.addWorksheet('Project Phase Timelines');
    
    // Define columns for phase timelines
    phasesSheet.columns = [
      { header: 'Project Name *', key: 'project_name', width: 30 },
      { header: 'Phase Name *', key: 'phase_name', width: 25 },
      { header: 'Start Date *', key: 'start_date', width: 15 },
      { header: 'End Date *', key: 'end_date', width: 15 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    // Enhanced header styling
    this.styleHeaderRow(phasesSheet);
    
    // Add sample phase timeline data
    phasesSheet.addRow({
      project_name: 'Digital Transformation Initiative',
      phase_name: 'Planning',
      start_date: '2024-01-15',
      end_date: '2024-02-15',
      notes: 'Requirements gathering and architecture design'
    });

    phasesSheet.addRow({
      project_name: 'Digital Transformation Initiative',
      phase_name: 'Development',
      start_date: '2024-02-16',
      end_date: '2024-08-31',
      notes: 'Core development phase with iterative releases'
    });

    phasesSheet.addRow({
      project_name: 'Digital Transformation Initiative',
      phase_name: 'Testing',
      start_date: '2024-09-01',
      end_date: '2024-10-31',
      notes: 'UAT, performance testing, and bug fixes'
    });

    // Add data format notes
    this.addFormatNotesToSheet(phasesSheet, [
      'Required fields marked with *',
      'Dates should be in YYYY-MM-DD format',
      'Phases should be sequential and non-overlapping',
      'Phase names must match existing system phases',
      'Delete sample rows before importing'
    ]);
  }

  private async addInstructionsSheet(workbook: ExcelJSTypes.Workbook, templateOptions: TemplateOptions): Promise<void> {
    const instructionsSheet = workbook.addWorksheet('Instructions');
    
    // Define columns for instructions
    instructionsSheet.columns = [
      { header: 'Section', key: 'section', width: 25 },
      { header: 'Instructions', key: 'instructions', width: 80 }
    ];

    // Enhanced header styling
    this.styleHeaderRow(instructionsSheet);
    
    // Add comprehensive instructions
    const instructions = [
      { section: 'OVERVIEW', instructions: 'This template allows you to import data into Capacinator. Complete each worksheet tab with your data following the format requirements.' },
      { section: '', instructions: '' },
      { section: 'GENERAL RULES', instructions: '' },
      { section: 'Required Fields', instructions: 'Fields marked with * are required and must have values' },
      { section: 'Data Types', instructions: 'Follow exact data types: text, numbers, dates (YYYY-MM-DD), percentages (0-100)' },
      { section: 'Sample Data', instructions: 'Delete all sample/example rows before importing - they are for reference only' },
      { section: 'Validation', instructions: 'Use the Import page validation feature before final import to check for errors' },
      { section: '', instructions: '' },
      { section: 'WORKSHEET DETAILS', instructions: '' },
      { section: 'Projects', instructions: 'Define projects with types, locations, priorities, and timelines' },
      { section: 'Rosters', instructions: 'Define people/resources with roles, availability, and supervisor relationships' },
      { section: 'Standard Allocations', instructions: 'Define default time allocations for role-phase combinations' }
    ];

    if (templateOptions.includeAssignments) {
      instructions.push({ section: 'Project Assignments', instructions: 'Assign specific people to projects with allocation percentages and date modes' });
    }

    if (templateOptions.includePhases) {
      instructions.push({ section: 'Phase Timelines', instructions: 'Define project phases with start/end dates and dependencies' });
    }

    instructions.push(
      { section: '', instructions: '' },
      { section: 'IMPORT PROCESS', instructions: '' },
      { section: '1. Prepare Data', instructions: 'Complete all worksheets, remove sample data, verify data formats' },
      { section: '2. Validate File', instructions: 'Use Import page validation to check for errors and compatibility' },
      { section: '3. Choose Import Mode', instructions: 'Select appropriate import options (clear existing, create missing entities, etc.)' },
      { section: '4. Review Results', instructions: 'Check import results and resolve any warnings or errors' },
      { section: '', instructions: '' },
      { section: 'SUPPORT', instructions: '' },
      { section: 'Data Relationships', instructions: 'Ensure referenced entities (people, roles, locations) exist or will be created during import' },
      { section: 'Date Formats', instructions: 'Always use YYYY-MM-DD format for dates (e.g., 2024-03-15)' },
      { section: 'Percentages', instructions: 'Enter percentages as numbers 0-100 (e.g., 75 for 75%)' },
      { section: 'Text Fields', instructions: 'Use consistent naming for entities that need to match (case-sensitive)' }
    );

    instructions.forEach(item => {
      instructionsSheet.addRow(item);
    });
  }

  private addFormatNotesToSheet(worksheet: ExcelJSTypes.Worksheet, notes: string[]): void {
    // Add spacing
    worksheet.addRow({});

    // Get first column key, default to 'A' if not set
    const firstColumnKey = worksheet.columns[0]?.key as string || 'A';

    // Add notes header
    const notesHeaderRow = worksheet.addRow({ [firstColumnKey]: 'FORMAT NOTES:' });
    notesHeaderRow.font = { bold: true, color: { argb: 'FF0066CC' } };

    // Add each note
    notes.forEach(note => {
      const noteRow = worksheet.addRow({ [firstColumnKey]: `• ${note}` });
      noteRow.font = { italic: true, color: { argb: 'FF666666' } };
    });
  }

  private async addProjectsToWorkbook(workbook: ExcelJSTypes.Workbook, scenarioId: string, scenarioType: string): Promise<void> {
    const projectsSheet = workbook.addWorksheet('Projects');
    
    // Define columns for projects
    projectsSheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Project Type', key: 'project_type', width: 20 },
      { header: 'Project Sub Type', key: 'project_sub_type', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Owner', key: 'owner', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Aspiration Start', key: 'aspiration_start', width: 15 },
      { header: 'Aspiration Finish', key: 'aspiration_finish', width: 15 },
      { header: 'External ID', key: 'external_id', width: 20 }
    ];

    // Style the header row
    this.styleHeaderRow(projectsSheet);

    // Get projects data based on scenario type
    let projectsQuery;
    if (scenarioType === 'baseline') {
      // For baseline, get all projects directly
      projectsQuery = this.db('projects')
        .leftJoin('project_types', 'projects.project_type_id', 'project_types.id')
        .leftJoin('project_sub_types', 'projects.project_sub_type_id', 'project_sub_types.id')
        .leftJoin('locations', 'projects.location_id', 'locations.id')
        .leftJoin('people as owners', 'projects.owner_id', 'owners.id')
        .select(
          'projects.*',
          'project_types.name as project_type_name',
          'project_sub_types.name as project_sub_type_name',
          'locations.name as location_name',
          'owners.name as owner_name'
        );
    } else {
      // For branches/sandbox, get scenario-specific projects
      projectsQuery = this.db('scenario_projects')
        .join('projects', 'scenario_projects.project_id', 'projects.id')
        .leftJoin('project_types', 'projects.project_type_id', 'project_types.id')
        .leftJoin('project_sub_types', 'projects.project_sub_type_id', 'project_sub_types.id')
        .leftJoin('locations', 'projects.location_id', 'locations.id')
        .leftJoin('people as owners', 'projects.owner_id', 'owners.id')
        .where('scenario_projects.scenario_id', scenarioId)
        .where('scenario_projects.change_type', '!=', 'removed')
        .select(
          'projects.*',
          'scenario_projects.name as scenario_name',
          'scenario_projects.priority as scenario_priority',
          'scenario_projects.aspiration_start as scenario_aspiration_start',
          'scenario_projects.aspiration_finish as scenario_aspiration_finish',
          'project_types.name as project_type_name',
          'project_sub_types.name as project_sub_type_name',
          'locations.name as location_name',
          'owners.name as owner_name'
        );
    }

    const projects: Array<Record<string, unknown>> = await projectsQuery;

    // Add project data
    projects.forEach((project) => {
      projectsSheet.addRow({
        name: scenarioType !== 'baseline' && project.scenario_name ? project.scenario_name : project.name,
        project_type: project.project_type_name,
        project_sub_type: project.project_sub_type_name,
        location: project.location_name,
        priority: scenarioType !== 'baseline' && project.scenario_priority !== null ? project.scenario_priority : project.priority,
        description: project.description,
        start_date: project.start_date ? storedDateToIso(project.start_date as string) : '',
        end_date: project.end_date ? storedDateToIso(project.end_date as string) : '',
        owner: project.owner_name,
        status: project.status,
        aspiration_start: scenarioType !== 'baseline' && project.scenario_aspiration_start ?
          storedDateToIso(project.scenario_aspiration_start as string) :
          (project.aspiration_start ? storedDateToIso(project.aspiration_start as string) : ''),
        aspiration_finish: scenarioType !== 'baseline' && project.scenario_aspiration_finish ?
          storedDateToIso(project.scenario_aspiration_finish as string) :
          (project.aspiration_finish ? storedDateToIso(project.aspiration_finish as string) : ''),
        external_id: project.external_id
      });
    });
  }

  private async addPeopleToWorkbook(workbook: ExcelJSTypes.Workbook, _scenarioId: string, _scenarioType: string): Promise<void> {
    const rostersSheet = workbook.addWorksheet('Rosters');
    
    // Define columns for people
    rostersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Primary Role', key: 'primary_role', width: 20 },
      { header: 'Worker Type', key: 'worker_type', width: 15 },
      { header: 'Supervisor', key: 'supervisor', width: 25 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Availability %', key: 'availability', width: 15 },
      { header: 'Hours Per Day', key: 'hours_per_day', width: 15 },
      { header: 'Is Bubble', key: 'is_bubble', width: 12 }
    ];

    // Style the header row
    this.styleHeaderRow(rostersSheet);

    // Get people data - scenarios don't typically modify people directly, so get from base table
    const people: Array<Record<string, unknown>> = await this.db('people')
      .leftJoin('roles', 'people.primary_person_role_id', 'roles.id')
      .leftJoin('people as supervisors', 'people.supervisor_id', 'supervisors.id')
      .leftJoin('locations', 'people.location_id', 'locations.id')
      .select(
        'people.*',
        'roles.name as primary_role_name',
        'supervisors.name as supervisor_name',
        'locations.name as location_name'
      );

    // Add people data
    people.forEach((person) => {
      rostersSheet.addRow({
        name: person.name,
        email: person.email,
        primary_role: person.primary_role_name,
        worker_type: person.worker_type,
        supervisor: person.supervisor_name,
        location: person.location_name,
        availability: person.default_availability_percentage,
        hours_per_day: person.default_hours_per_day,
        is_bubble: person.is_bubble ? 'Yes' : 'No'
      });
    });
  }

  private async addStandardAllocationsToWorkbook(workbook: ExcelJSTypes.Workbook, _scenarioId: string, _scenarioType: string): Promise<void> {
    const allocationsSheet = workbook.addWorksheet('Standard Allocations');
    
    // Define columns for standard allocations
    allocationsSheet.columns = [
      { header: 'Project Type', key: 'project_type', width: 20 },
      { header: 'Project Sub Type', key: 'project_sub_type', width: 20 },
      { header: 'Phase', key: 'phase', width: 20 },
      { header: 'Role', key: 'role', width: 20 },
      { header: 'Allocation %', key: 'allocation', width: 15 }
    ];

    // Style the header row
    this.styleHeaderRow(allocationsSheet);

    try {
      // Get standard allocations - these are typically global, not scenario-specific
      const allocations = await this.db('resource_templates')
      .leftJoin('project_types', 'resource_templates.project_type_id', 'project_types.id')
      .leftJoin('project_sub_types', 'resource_templates.project_sub_type_id', 'project_sub_types.id')
      .leftJoin('project_phases', 'resource_templates.phase_id', 'project_phases.id')
      .leftJoin('roles', 'resource_templates.role_id', 'roles.id')
      .select(
        'resource_templates.*',
        'project_types.name as project_type_name',
        'project_sub_types.name as project_sub_type_name',
        'project_phases.name as phase_name',
        'roles.name as role_name'
      );

      // Add allocation data
      allocations.forEach((allocation: Record<string, unknown>) => {
        allocationsSheet.addRow({
          project_type: allocation.project_type_name,
          project_sub_type: allocation.project_sub_type_name,
          phase: allocation.phase_name,
          role: allocation.role_name,
          allocation: allocation.allocation_percentage
        });
      });
    } catch (error: unknown) {
      // Handle missing standard_allocations table gracefully
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.info('Standard allocations table not found, skipping allocation data export', { error: errorMessage });
      
      // Add a note in the sheet that standard allocations are not available
      allocationsSheet.addRow({
        project_type: 'Standard allocations data not available',
        project_sub_type: 'Table not found in database',
        phase: 'This feature may not be implemented yet',
        role: 'N/A',
        allocation: 'N/A'
      });
    }
  }

  private async addAssignmentsToWorkbook(workbook: ExcelJSTypes.Workbook, scenarioId: string, scenarioType: string): Promise<void> {
    const assignmentsSheet = workbook.addWorksheet('Project Assignments');
    
    // Define columns for assignments
    assignmentsSheet.columns = [
      { header: 'Project Name', key: 'project_name', width: 30 },
      { header: 'Person Name', key: 'person_name', width: 25 },
      { header: 'Role', key: 'role_name', width: 20 },
      { header: 'Phase', key: 'phase_name', width: 20 },
      { header: 'Allocation %', key: 'allocation_percentage', width: 15 },
      { header: 'Assignment Mode', key: 'assignment_date_mode', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    // Style the header row
    this.styleHeaderRow(assignmentsSheet);

    // Get assignments based on scenario type
    let assignmentsQuery;
    if (scenarioType === 'baseline') {
      // For baseline, get project assignments directly
      assignmentsQuery = this.db('project_assignments')
        .join('projects', 'project_assignments.project_id', 'projects.id')
        .join('people', 'project_assignments.person_id', 'people.id')
        .join('roles', 'project_assignments.role_id', 'roles.id')
        .leftJoin('project_phases', 'project_assignments.phase_id', 'project_phases.id')
        .select(
          'project_assignments.*',
          'projects.name as project_name',
          'people.name as person_name',
          'roles.name as role_name',
          'project_phases.name as phase_name'
        );
    } else {
      // For scenarios, get scenario-specific assignments
      assignmentsQuery = this.db('scenario_project_assignments')
        .join('projects', 'scenario_project_assignments.project_id', 'projects.id')
        .join('people', 'scenario_project_assignments.person_id', 'people.id')
        .join('roles', 'scenario_project_assignments.role_id', 'roles.id')
        .leftJoin('project_phases', 'scenario_project_assignments.phase_id', 'project_phases.id')
        .where('scenario_project_assignments.scenario_id', scenarioId)
        .where('scenario_project_assignments.change_type', '!=', 'removed')
        .select(
          'scenario_project_assignments.*',
          'projects.name as project_name',
          'people.name as person_name',
          'roles.name as role_name',
          'project_phases.name as phase_name'
        );
    }

    const assignments: Array<Record<string, unknown>> = await assignmentsQuery;

    // Add assignment data
    assignments.forEach((assignment) => {
      assignmentsSheet.addRow({
        project_name: assignment.project_name,
        person_name: assignment.person_name,
        role_name: assignment.role_name,
        phase_name: assignment.phase_name,
        allocation_percentage: assignment.allocation_percentage,
        assignment_date_mode: assignment.assignment_date_mode,
        start_date: assignment.start_date ? storedDateToIso(assignment.start_date as string) : '',
        end_date: assignment.end_date ? storedDateToIso(assignment.end_date as string) : '',
        notes: assignment.notes
      });
    });
  }

  private async addPhaseTimelinesToWorkbook(workbook: ExcelJSTypes.Workbook, scenarioId: string, scenarioType: string): Promise<void> {
    const phasesSheet = workbook.addWorksheet('Project Phase Timelines');
    
    // Define columns for phase timelines
    phasesSheet.columns = [
      { header: 'Project Name', key: 'project_name', width: 30 },
      { header: 'Phase Name', key: 'phase_name', width: 25 },
      { header: 'Start Date', key: 'start_date', width: 15 },
      { header: 'End Date', key: 'end_date', width: 15 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    // Style the header row
    this.styleHeaderRow(phasesSheet);

    // Get phase timelines based on scenario type
    let phasesQuery;
    if (scenarioType === 'baseline') {
      // For baseline, get phase timelines directly
      phasesQuery = this.db('project_phases_timeline')
        .join('projects', 'project_phases_timeline.project_id', 'projects.id')
        .join('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
        .select(
          'project_phases_timeline.*',
          'projects.name as project_name',
          'project_phases.name as phase_name'
        );
    } else {
      // For scenarios, get scenario-specific phase timelines
      phasesQuery = this.db('scenario_project_phases')
        .join('projects', 'scenario_project_phases.project_id', 'projects.id')
        .join('project_phases', 'scenario_project_phases.phase_id', 'project_phases.id')
        .where('scenario_project_phases.scenario_id', scenarioId)
        .where('scenario_project_phases.change_type', '!=', 'removed')
        .select(
          'scenario_project_phases.*',
          'projects.name as project_name',
          'project_phases.name as phase_name'
        );
    }

    const phases: Array<Record<string, unknown>> = await phasesQuery;

    // Add phase timeline data
    phases.forEach((phase) => {
      phasesSheet.addRow({
        project_name: phase.project_name,
        phase_name: phase.phase_name,
        start_date: phase.start_date ? storedDateToIso(phase.start_date as string) : '',
        end_date: phase.end_date ? storedDateToIso(phase.end_date as string) : '',
        notes: phase.notes
      });
    });
  }

  private async addMetadataToWorkbook(workbook: ExcelJSTypes.Workbook, scenario: ScenarioData, exportOptions: ExportOptions): Promise<void> {
    const metadataSheet = workbook.addWorksheet('Export Metadata');
    
    // Define columns for metadata
    metadataSheet.columns = [
      { header: 'Property', key: 'property', width: 30 },
      { header: 'Value', key: 'value', width: 50 }
    ];

    // Style the header row
    this.styleHeaderRow(metadataSheet);

    // Add metadata rows
    const metadata = [
      { property: 'Export Type', value: 'Capacinator Scenario Export' },
      { property: 'Scenario Name', value: scenario.name },
      { property: 'Scenario Type', value: scenario.scenario_type },
      { property: 'Scenario ID', value: scenario.id },
      { property: 'Scenario Description', value: scenario.description || 'N/A' },
      { property: 'Parent Scenario ID', value: scenario.parent_scenario_id || 'N/A' },
      { property: 'Created By', value: scenario.created_by_name || 'Unknown' },
      { property: 'Scenario Created', value: scenario.created_at ? new Date(scenario.created_at).toISOString() : 'Unknown' },
      { property: 'Exported By', value: exportOptions.exportedBy },
      { property: 'Exported At', value: exportOptions.exportedAt },
      { property: 'Include Assignments', value: exportOptions.includeAssignments ? 'Yes' : 'No' },
      { property: 'Include Phase Timelines', value: exportOptions.includePhases ? 'Yes' : 'No' },
      { property: 'Export Format Version', value: 'V1 (Compatible with Import)' },
      { property: 'Capacinator Version', value: 'v1.0.0' }
    ];

    metadata.forEach(item => {
      metadataSheet.addRow(item);
    });

    // Add warning about re-import
    metadataSheet.addRow({});
    metadataSheet.addRow({ property: 'IMPORTANT NOTES', value: '' });
    metadataSheet.addRow({ property: 'Re-import Compatibility', value: 'This export is compatible with Capacinator import functionality' });
    metadataSheet.addRow({ property: 'Scenario Context', value: 'When re-importing, consider target scenario (baseline vs branch)' });
    metadataSheet.addRow({ property: 'Data Integrity', value: 'Verify all relationships exist in target environment before import' });
  }

  private styleHeaderRow(worksheet: ExcelJSTypes.Worksheet): void {
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };
    worksheet.getRow(1).border = {
      bottom: { style: 'thin' }
    };
  }
}