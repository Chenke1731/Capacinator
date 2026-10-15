import { ImportController } from '../ImportController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

// Mock the ExcelImporter services
jest.mock('../../../services/import/ExcelImporter', () => ({
  ExcelImporter: jest.fn().mockImplementation(() => ({
    importFromFile: jest.fn().mockResolvedValue({
      success: true,
      imported: { projects: 10, people: 5, assignments: 15 },
      warnings: [],
      errors: []
    }),
    validateExcelStructure: jest.fn().mockResolvedValue({
      valid: true,
      canImport: true,
      errors: []
    }),
    analyzeImport: jest.fn().mockResolvedValue({
      summary: { projects: 10, people: 5 },
      conflicts: []
    })
  }))
}));

jest.mock('../../../services/import/ExcelImporterV2', () => ({
  ExcelImporterV2: jest.fn().mockImplementation(() => ({
    importFromFile: jest.fn().mockResolvedValue({
      success: true,
      imported: { projects: 10, people: 5, assignments: 15 },
      warnings: [],
      errors: []
    }),
    validateExcelStructure: jest.fn().mockResolvedValue({
      valid: true,
      canImport: true,
      errors: []
    }),
    analyzeImport: jest.fn().mockResolvedValue({
      summary: { projects: 10, people: 5 },
      conflicts: []
    })
  }))
}));

// Mock fs/promises for file operations
jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined)
}));

// Mock ExcelJS - need to handle dynamic import
// Define the mock instance that will be shared across all Workbook instances
const mockWorkbookInstance = {
  creator: '',
  lastModifiedBy: '',
  created: new Date(),
  modified: new Date(),
  properties: {
    title: '',
    subject: '',
    description: ''
  },
  addWorksheet: jest.fn((name: string) => ({
    columns: [],
    addRow: jest.fn(() => ({
      font: {},
      fill: {},
      border: {},
      alignment: {},
      numFmt: ''
    })),
    getRow: jest.fn(() => ({
      font: {},
      fill: {},
      border: {},
      alignment: {},
      numFmt: ''
    }))
  })),
  xlsx: {
    writeBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-excel-data'))
  }
};

// Mock exceljs module for dynamic imports
// Create the mock Workbook class that will be returned
class MockWorkbookClass {
  creator = '';
  lastModifiedBy = '';
  created = new Date();
  modified = new Date();
  properties = {
    title: '',
    subject: '',
    description: ''
  };

  addWorksheet(name: string) {
    return mockWorkbookInstance.addWorksheet(name);
  }

  get xlsx() {
    return mockWorkbookInstance.xlsx;
  }
}

jest.mock('exceljs', () => ({
  __esModule: true,
  default: {
    Workbook: MockWorkbookClass
  }
}));

describe('ImportController', () => {
  let controller: ImportController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock workbook
    mockWorkbookInstance.addWorksheet.mockClear();
    mockWorkbookInstance.xlsx.writeBuffer.mockResolvedValue(Buffer.from('mock-excel-data'));

    controller = new ImportController();

    // Create mock request
    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      file: undefined,
      user: {
        name: 'Test User',
        email: 'test@example.com'
      },
      ip: '127.0.0.1',
      id: 'req-123'
    };

    // Create mock response
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn()
    };

    // Create mock database
    mockDb = createMockDb();
    (controller as any).db = mockDb;
    mockDb._reset();
  });

  describe('getImportSettingsEndpoint - Get Import Settings', () => {
    it('returns import settings from database', async () => {
      const mockSettings = {
        category: 'import',
        value: JSON.stringify({
          clearExistingData: false,
          validateDuplicates: true,
          autoCreateMissingRoles: false,
          autoCreateMissingLocations: false,
          defaultProjectPriority: 2,
          dateFormat: 'MM/DD/YYYY'
        })
      };

      mockDb._setFirstResult(mockSettings);

      await controller.getImportSettingsEndpoint(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('settings');
      expect(mockDb.where).toHaveBeenCalledWith('category', 'import');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          clearExistingData: false,
          validateDuplicates: true,
          defaultProjectPriority: 2
        })
      });
    });

    it('returns default settings when none found in database', async () => {
      mockDb._setFirstResult(null);

      await controller.getImportSettingsEndpoint(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          clearExistingData: false,
          validateDuplicates: true,
          autoCreateMissingRoles: false,
          autoCreateMissingLocations: false,
          defaultProjectPriority: 2,
          dateFormat: 'MM/DD/YYYY'
        })
      });
    });

    it('returns default settings on database error', async () => {
      mockDb._setFirstResult(null);
      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.getImportSettingsEndpoint(mockReq, mockRes);

      // Should still return settings (default) despite error
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          defaultProjectPriority: 2
        })
      });
    });
  });

  describe('uploadExcel - Excel File Upload', () => {
    beforeEach(() => {
      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      mockReq.body = {
        clearExisting: 'false',
        useV2: 'false',
        validateDuplicates: 'true'
      };
    });

    it('uploads and imports Excel file successfully', async () => {
      // Mock getImportSettings
      mockDb._queueFirstResult({
        value: JSON.stringify({
          clearExistingData: false,
          validateDuplicates: true,
          defaultProjectPriority: 2
        })
      });

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update (success)
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          file_name: 'test-data.xlsx',
          file_size: '102400',
          status: 'processing'
        })
      );

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success'
        })
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Excel import completed successfully',
        imported: expect.any(Object),
        warnings: expect.any(Array)
      });
    });

    it('returns 400 when no file uploaded', async () => {
      mockReq.file = undefined;

      await controller.uploadExcel(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No file uploaded',
        message: 'Please select an Excel file to upload'
      });
    });

    it('uses V2 importer when useV2 is true', async () => {
      mockReq.body.useV2 = 'true';

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          import_type: 'v2'
        })
      );
    });

    it('records import failure in history', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExcelImporter } = require('../../../services/import/ExcelImporter');
      ExcelImporter.mockImplementationOnce(() => ({
        importFromFile: jest.fn().mockRejectedValue(new Error('Import failed'))
      }));

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update (failure)
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errors: expect.stringContaining('Import failed')
        })
      );
    });

    it('parses import options from request body', async () => {
      mockReq.body = {
        clearExisting: 'true',
        useV2: 'false',
        validateDuplicates: 'true',
        autoCreateMissingRoles: 'true',
        autoCreateMissingLocations: 'true',
        defaultProjectPriority: '1',
        dateFormat: 'YYYY-MM-DD'
      };

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          clear_existing: true,
          validate_duplicates: true,
          auto_create_missing_roles: true,
          auto_create_missing_locations: true,
          default_project_priority: 1,
          date_format: 'YYYY-MM-DD'
        })
      );
    });

    it('F04: explicit string false overrides saved true (saved true must not swallow it)', async () => {
      mockReq.body = { clearExisting: 'false', useV2: 'false', validateDuplicates: 'false' };

      // 保存设置:清库=true、查重=true —— 本次显式 false 必须生效
      mockDb._queueFirstResult({
        value: JSON.stringify({
          clearExistingData: true,
          validateDuplicates: true,
          defaultProjectPriority: 2
        })
      });
      mockDb._queueInsertResult([{ id: 'history-123' }]);
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({ clear_existing: false, validate_duplicates: false })
      );
    });

    it('F04: explicit boolean false also overrides saved true', async () => {
      mockReq.body = { clearExisting: false, useV2: 'false' };

      mockDb._queueFirstResult({
        value: JSON.stringify({ clearExistingData: true, validateDuplicates: true })
      });
      mockDb._queueInsertResult([{ id: 'history-123' }]);
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({ clear_existing: false })
      );
    });

    it('F04: absent option falls back to saved setting (explicit-wins does not break defaults)', async () => {
      mockReq.body = { useV2: 'false' }; // clearExisting 未提交

      mockDb._queueFirstResult({
        value: JSON.stringify({ clearExistingData: true, validateDuplicates: true })
      });
      mockDb._queueInsertResult([{ id: 'history-123' }]);
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({ clear_existing: true, validate_duplicates: true })
      );
    });

    it('returns 400 when import completes with errors', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExcelImporter } = require('../../../services/import/ExcelImporter');
      ExcelImporter.mockImplementationOnce(() => ({
        importFromFile: jest.fn().mockResolvedValue({
          success: false,
          imported: { projects: 5, people: 0 },
          errors: ['Failed to import people'],
          warnings: []
        })
      }));

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Excel import completed with errors',
        imported: expect.any(Object),
        errors: expect.arrayContaining(['Failed to import people']),
        warnings: expect.any(Array)
      });
    });
  });

  describe('getImportHistory - Import History', () => {
    it('returns paginated import history', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          file_name: 'data1.xlsx',
          status: 'success',
          imported_counts: JSON.stringify({ projects: 10, people: 5 }),
          errors: null,
          warnings: null,
          duplicates_found: null,
          started_at: new Date('2025-01-01')
        },
        {
          id: 'history-2',
          file_name: 'data2.xlsx',
          status: 'failed',
          imported_counts: JSON.stringify({ projects: 0, people: 0 }),
          errors: JSON.stringify(['Import error']),
          warnings: JSON.stringify(['Warning']),
          duplicates_found: null,
          started_at: new Date('2025-01-02')
        }
      ];

      mockDb._setCountResult(2);
      mockDb._setQueryResult(mockHistory);

      await controller.getImportHistory(mockReq, mockRes);

      expect(mockDb).toHaveBeenCalledWith('import_history');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imports: expect.arrayContaining([
            expect.objectContaining({
              file_name: 'data1.xlsx',
              status: 'success',
              imported_counts: { projects: 10, people: 5 },
              errors: [],
              warnings: []
            }),
            expect.objectContaining({
              file_name: 'data2.xlsx',
              status: 'failed',
              errors: ['Import error'],
              warnings: ['Warning']
            })
          ]),
          pagination: expect.objectContaining({
            page: 1,
            limit: 50,
            totalCount: 2,
            totalPages: 1
          })
        }
      });
    });

    it('handles pagination parameters', async () => {
      mockReq.query = { page: '2', limit: '10' };

      mockDb._setCountResult(25);
      mockDb._setQueryResult([]);

      await controller.getImportHistory(mockReq, mockRes);

      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(mockDb.offset).toHaveBeenCalledWith(10); // (page 2 - 1) * 10
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imports: [],
          pagination: expect.objectContaining({
            page: 2,
            limit: 10,
            totalCount: 25,
            totalPages: 3,
            hasNextPage: true,
            hasPrevPage: true
          })
        }
      });
    });

    it('orders history by started_at descending', async () => {
      mockDb._setCountResult(0);
      mockDb._setQueryResult([]);

      await controller.getImportHistory(mockReq, mockRes);

      expect(mockDb.orderBy).toHaveBeenCalledWith('started_at', 'desc');
    });

    it('parses JSON fields correctly', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          file_name: 'data.xlsx',
          imported_counts: JSON.stringify({ projects: 10 }),
          errors: JSON.stringify(['error1', 'error2']),
          warnings: JSON.stringify(['warning1']),
          duplicates_found: JSON.stringify({ duplicate_projects: ['Project A'] })
        }
      ];

      mockDb._setCountResult(1);
      mockDb._setQueryResult(mockHistory);

      await controller.getImportHistory(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data.imports[0]).toEqual(
        expect.objectContaining({
          imported_counts: { projects: 10 },
          errors: ['error1', 'error2'],
          warnings: ['warning1'],
          duplicates_found: { duplicate_projects: ['Project A'] }
        })
      );
    });
  });

  describe('validateFile - File Validation', () => {
    beforeEach(() => {
      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      mockReq.body = { useV2: 'false' };
    });

    it('validates Excel file successfully', async () => {
      await controller.validateFile(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        valid: true,
        canImport: true,
        errors: [],
        fileInfo: {
          name: 'test-data.xlsx',
          size: 102400,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          formatVersion: 'V1 (Standard)'
        }
      });
    });

    it('returns 400 when no file uploaded', async () => {
      mockReq.file = undefined;

      await controller.validateFile(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No file uploaded',
        message: 'Please select an Excel file to validate'
      });
    });

    it('rejects non-Excel file formats', async () => {
      mockReq.file.originalname = 'test-data.pdf';

      await controller.validateFile(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        valid: false,
        canImport: false,
        errors: expect.arrayContaining([
          expect.objectContaining({
            type: 'error',
            severity: 'critical',
            message: expect.stringContaining('Excel file')
          })
        ])
      });
    });

    it('uses V2 validator when useV2 is true', async () => {
      mockReq.body.useV2 = 'true';

      await controller.validateFile(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          fileInfo: expect.objectContaining({
            formatVersion: 'V2 (Fiscal Weeks)'
          })
        })
      );
    });

    it('handles validation errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExcelImporter } = require('../../../services/import/ExcelImporter');
      ExcelImporter.mockImplementationOnce(() => ({
        validateExcelStructure: jest.fn().mockRejectedValue(new Error('Corrupted file'))
      }));

      await controller.validateFile(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        valid: false,
        canImport: false,
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Corrupted file')
          })
        ])
      });
    });

    it('accepts .xls and .xlsx extensions', async () => {
      // Test .xlsx
      mockReq.file.originalname = 'data.xlsx';
      await controller.validateFile(mockReq, mockRes);
      await flushPromises();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );

      jest.clearAllMocks();

      // Test .xls
      mockReq.file.originalname = 'data.xls';
      await controller.validateFile(mockReq, mockRes);
      await flushPromises();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('downloadTemplate - Template Download', () => {
    it('generates and downloads template successfully', async () => {
      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('capacinator_import_template')
      );
      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('excludes assignments when includeAssignments is false', async () => {
      mockReq.query = { includeAssignments: 'false' };

      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });

    it('excludes phases when includePhases is false', async () => {
      mockReq.query = { includePhases: 'false' };

      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });

    it('includes templateType in filename', async () => {
      mockReq.query = { templateType: 'basic' };

      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('basic')
      );
    });

    it('includes current date in filename', async () => {
      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      const today = new Date().toISOString().split('T')[0];
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining(today)
      );
    });
  });

  describe('exportScenarioData - Scenario Export', () => {
    it('exports scenario data successfully', async () => {
      mockReq.query = { scenarioId: 'scenario-123' };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        scenario_type: 'baseline',
        description: 'Test scenario description'
      };

      // Mock scenario lookup
      mockDb._queueFirstResult(mockScenario);

      // Mock projects query
      mockDb._queueQueryResult([]);

      // Mock people query
      mockDb._queueQueryResult([]);

      // Mock standard allocations query
      mockDb._queueQueryResult([]);

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('defaults to baseline scenario when none specified', async () => {
      mockReq.query = {};

      const mockBaselineScenario = {
        id: 'baseline-123',
        name: 'Baseline',
        scenario_type: 'baseline'
      };

      // Mock baseline scenario lookup
      mockDb._queueFirstResult(mockBaselineScenario);

      // Mock scenario details lookup
      mockDb._queueFirstResult(mockBaselineScenario);

      // Mock queries for export data
      mockDb._queueQueryResult([]); // projects
      mockDb._queueQueryResult([]); // people
      mockDb._queueQueryResult([]); // allocations

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });

    it('returns 400 when no scenario specified and no baseline exists', async () => {
      mockReq.query = {};

      // Mock baseline scenario lookup - not found
      mockDb._setFirstResult(null);

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No scenario specified and no baseline scenario found',
        message: 'Please specify a scenario ID or ensure a baseline scenario exists'
      });
    });

    it('returns 404 when scenario not found', async () => {
      mockReq.query = { scenarioId: 'nonexistent' };

      // Mock scenario lookup - not found
      mockDb._setFirstResult(null);

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Scenario not found',
        message: 'The specified scenario does not exist'
      });
    });

    it('includes assignments when includeAssignments is true', async () => {
      mockReq.query = {
        scenarioId: 'scenario-123',
        includeAssignments: 'true'
      };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        scenario_type: 'baseline'
      };

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult([]); // projects
      mockDb._queueQueryResult([]); // people
      mockDb._queueQueryResult([]); // allocations
      mockDb._queueQueryResult([]); // assignments

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });

    it('includes phases when includePhases is true', async () => {
      mockReq.query = {
        scenarioId: 'scenario-123',
        includePhases: 'true'
      };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        scenario_type: 'baseline'
      };

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult([]); // projects
      mockDb._queueQueryResult([]); // people
      mockDb._queueQueryResult([]); // allocations
      mockDb._queueQueryResult([]); // phases

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('analyzeImport - Dry-Run Analysis', () => {
    beforeEach(() => {
      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      mockReq.body = { useV2: 'false' };
    });

    it('analyzes import without making changes', async () => {
      // Mock getImportSettings
      mockDb._setFirstResult(null);

      await controller.analyzeImport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Import analysis completed successfully',
        analysis: expect.objectContaining({
          summary: expect.any(Object),
          conflicts: expect.any(Array)
        }),
        options: expect.objectContaining({
          dryRun: true
        }),
        fileInfo: expect.objectContaining({
          name: 'test-data.xlsx',
          formatVersion: 'V1 (Standard)'
        })
      });
    });

    it('returns 400 when no file uploaded', async () => {
      mockReq.file = undefined;

      await controller.analyzeImport(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No file uploaded',
        message: 'Please select an Excel file to analyze'
      });
    });

    it('F04: preview keeps an explicit false against saved true (same interpretation as execution)', async () => {
      mockReq.body = { clearExisting: 'false', useV2: 'false' };

      mockDb._setFirstResult({
        value: JSON.stringify({ clearExistingData: true, validateDuplicates: true })
      });

      await controller.analyzeImport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ clearExisting: false, dryRun: true })
        })
      );
    });

    it('uses V2 analyzer when useV2 is true', async () => {
      mockReq.body.useV2 = 'true';

      // Mock getImportSettings
      mockDb._setFirstResult(null);

      await controller.analyzeImport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          fileInfo: expect.objectContaining({
            formatVersion: 'V2 (Fiscal Weeks)'
          })
        })
      );
    });

    it('returns 400 when analysis fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExcelImporter } = require('../../../services/import/ExcelImporter');
      ExcelImporter.mockImplementationOnce(() => ({
        analyzeImport: jest.fn().mockRejectedValue(new Error('Analysis failed'))
      }));

      // Mock getImportSettings
      mockDb._setFirstResult(null);

      await controller.analyzeImport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Analysis failed',
        message: expect.stringContaining('Analysis failed'),
        details: expect.any(Error)
      });
    });

    it('forces dryRun mode for analysis', async () => {
      mockReq.body = {
        useV2: 'false',
        clearExisting: 'true',
        validateDuplicates: 'false'
      };

      // Mock getImportSettings
      mockDb._setFirstResult(null);

      await controller.analyzeImport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            dryRun: true, // Should be true regardless of input
            clearExisting: true
            // Note: validateDuplicates will be true from defaults when no saved settings exist
          })
        })
      );
    });

    it('merges request options with saved settings', async () => {
      mockReq.body = {
        clearExisting: 'true',
        defaultProjectPriority: '3'
      };

      const mockSettings = {
        value: JSON.stringify({
          clearExistingData: false,
          validateDuplicates: true,
          autoCreateMissingRoles: true,
          defaultProjectPriority: 2,
          dateFormat: 'MM/DD/YYYY'
        })
      };

      mockDb._setFirstResult(mockSettings);

      await controller.analyzeImport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            clearExisting: true, // From request
            defaultProjectPriority: 3, // From request
            validateDuplicates: true, // From settings
            autoCreateMissingRoles: true // From settings
          })
        })
      );
    });
  });

  describe('getUploadMiddleware - Multer Configuration', () => {
    it('returns multer middleware for single file upload', () => {
      const middleware = controller.getUploadMiddleware();

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('File Upload Filtering', () => {
    it('accepts Excel files with correct mimetype', () => {
      const middleware = controller.getUploadMiddleware();
      expect(middleware).toBeDefined();
    });

    it('handles file upload with user info', async () => {
      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      mockReq.user = {
        name: 'Test User',
        email: 'test@example.com'
      };

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          imported_by: 'Test User'
        })
      );
    });

    it('handles upload without user info', async () => {
      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      mockReq.user = undefined;

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          imported_by: 'anonymous'
        })
      );
    });
  });

  describe('exportScenarioData - Advanced Scenarios', () => {
    it('exports branch scenario with scenario-specific projects', async () => {
      mockReq.query = { scenarioId: 'branch-123' };

      const mockScenario = {
        id: 'branch-123',
        name: 'Branch Scenario',
        scenario_type: 'branch',
        description: 'Branch scenario'
      };

      // Mock scenario lookup
      mockDb._queueFirstResult(mockScenario);

      // Mock scenario_projects query (for branch scenarios)
      mockDb._queueQueryResult([]);

      // Mock people query
      mockDb._queueQueryResult([]);

      // Mock standard allocations query
      mockDb._queueQueryResult([]);

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('handles missing standard_allocations table gracefully', async () => {
      mockReq.query = { scenarioId: 'scenario-123' };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        scenario_type: 'baseline'
      };

      // Mock scenario lookup
      mockDb._queueFirstResult(mockScenario);

      // Mock projects query (succeeds)
      mockDb._queueQueryResult([]);

      // Mock people query (succeeds)
      mockDb._queueQueryResult([]);

      // Mock standard allocations query - queue error for missing table
      mockDb._queueError(new Error('no such table: resource_templates'));

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      // Should still complete successfully with note about missing table
      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('exports with both assignments and phases', async () => {
      mockReq.query = {
        scenarioId: 'scenario-123',
        includeAssignments: 'true',
        includePhases: 'true'
      };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Complete Export',
        scenario_type: 'baseline'
      };

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult([]); // projects
      mockDb._queueQueryResult([]); // people
      mockDb._queueQueryResult([]); // allocations
      mockDb._queueQueryResult([]); // assignments
      mockDb._queueQueryResult([]); // phases

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockWorkbookInstance.addWorksheet).toHaveBeenCalled();
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports with actual project data', async () => {
      mockReq.query = { scenarioId: 'scenario-123' };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        scenario_type: 'baseline'
      };

      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project Alpha',
          project_type_name: 'Development',
          project_sub_type_name: 'Web App',
          location_name: 'San Francisco',
          priority: 1,
          description: 'Test project',
          start_date: '2025-01-01',
          end_date: '2025-12-31',
          owner_name: 'John Doe',
          status: 'active',
          aspiration_start: '2025-01-01',
          aspiration_finish: '2025-12-31',
          external_id: 'PROJ-001'
        }
      ];

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult(mockProjects); // projects with data
      mockDb._queueQueryResult([]); // people
      mockDb._queueQueryResult([]); // allocations

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports with actual people data', async () => {
      mockReq.query = { scenarioId: 'scenario-123' };

      const mockScenario = {
        id: 'scenario-123',
        name: 'Test Scenario',
        scenario_type: 'baseline'
      };

      const mockPeople = [
        {
          id: 'person-1',
          name: 'Alice Johnson',
          email: 'alice@example.com',
          primary_role_name: 'Developer',
          worker_type: 'FTE',
          supervisor_name: 'Bob Smith',
          location_name: 'San Francisco',
          default_availability_percentage: 100,
          default_hours_per_day: 8,
          is_bubble: false
        }
      ];

      mockDb._queueFirstResult(mockScenario);
      mockDb._queueQueryResult([]); // projects
      mockDb._queueQueryResult(mockPeople); // people with data
      mockDb._queueQueryResult([]); // allocations

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('Import History with Complex Data', () => {
    it('handles import history with null JSON fields', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          file_name: 'data.xlsx',
          status: 'success',
          imported_counts: null,
          errors: null,
          warnings: null,
          duplicates_found: null
        }
      ];

      mockDb._setCountResult(1);
      mockDb._setQueryResult(mockHistory);

      await controller.getImportHistory(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data.imports[0]).toEqual(
        expect.objectContaining({
          imported_counts: null,
          errors: [],
          warnings: []
        })
      );
    });

    it('calculates pagination correctly for last page', async () => {
      mockReq.query = { page: '3', limit: '10' };

      mockDb._setCountResult(25);
      mockDb._setQueryResult([]);

      await controller.getImportHistory(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imports: [],
          pagination: expect.objectContaining({
            page: 3,
            totalPages: 3,
            hasNextPage: false,
            hasPrevPage: true
          })
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('handles database errors in getImportHistory', async () => {
      mockDb.count = jest.fn().mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await controller.getImportHistory(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles Excel generation errors in downloadTemplate', async () => {
      // Mock workbook to throw error
      mockWorkbookInstance.xlsx.writeBuffer.mockRejectedValueOnce(new Error('ExcelJS error'));

      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles errors in exportScenarioData', async () => {
      mockReq.query = { scenarioId: 'scenario-123' };

      mockDb._setFirstResult(null);
      mockDb.where = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await controller.exportScenarioData(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('cleans up uploaded file on validation error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs/promises');

      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExcelImporter } = require('../../../services/import/ExcelImporter');
      ExcelImporter.mockImplementationOnce(() => ({
        validateExcelStructure: jest.fn().mockRejectedValue(new Error('Validation error'))
      }));

      await controller.validateFile(mockReq, mockRes);
      await flushPromises();

      expect(fs.unlink).toHaveBeenCalledWith('/tmp/test-upload.xlsx');
    });

    it('cleans up uploaded file on upload error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs/promises');

      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExcelImporter } = require('../../../services/import/ExcelImporter');
      ExcelImporter.mockImplementationOnce(() => ({
        importFromFile: jest.fn().mockRejectedValue(new Error('Import error'))
      }));

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      expect(fs.unlink).toHaveBeenCalledWith('/tmp/test-upload.xlsx');
    });

    it('handles file cleanup errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs/promises');
      fs.unlink.mockRejectedValueOnce(new Error('Cannot delete file'));

      mockReq.file = {
        path: '/tmp/test-upload.xlsx',
        originalname: 'test-data.xlsx',
        size: 102400,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      // Mock getImportSettings
      mockDb._queueFirstResult(null);

      // Mock import history insert
      mockDb._queueInsertResult([{ id: 'history-123' }]);

      // Mock import history update
      mockDb._queueUpdateResult([1]);

      await controller.uploadExcel(mockReq, mockRes);
      await flushPromises();

      // Should still complete successfully
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });
  });

  describe('Template Generation Details', () => {
    it('generates template with all sheets', async () => {
      mockReq.query = {
        includeAssignments: 'true',
        includePhases: 'true',
        templateType: 'complete'
      };

      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      // Should create multiple worksheets
      expect(mockWorkbookInstance.addWorksheet).toHaveBeenCalled();
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('generates basic template without optional sheets', async () => {
      mockReq.query = {
        includeAssignments: 'false',
        includePhases: 'false',
        templateType: 'basic'
      };

      await controller.downloadTemplate(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.send).toHaveBeenCalled();
    });
  });
});
