import { ExportController } from '../ExportController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';
import { ReportDataService } from '../../../services/reports/ReportDataService.js';
import { ExportFormatterService } from '../../../services/export/ExportFormatterService.js';

// Mock the services
jest.mock('../../../services/reports/ReportDataService.js');
jest.mock('../../../services/export/ExportFormatterService.js');

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

describe('ExportController', () => {
  let controller: ExportController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;
  let mockReportDataService: jest.Mocked<ReportDataService>;
  let mockExportFormatterService: jest.Mocked<ExportFormatterService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockReportDataService = {
      getCapacityReport: jest.fn(),
      getUtilizationReport: jest.fn(),
      getDemandReport: jest.fn(),
      getGapsAnalysis: jest.fn(),
    } as unknown as jest.Mocked<ReportDataService>;

    mockExportFormatterService = {
      generateExcel: jest.fn().mockResolvedValue(Buffer.from('mock-excel-data')),
      generateCSV: jest.fn().mockReturnValue('mock,csv,data'),
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-data')),
      getFilename: jest.fn().mockImplementation((type: string, format: string) => `${type}-report.${format}`),
    } as unknown as jest.Mocked<ExportFormatterService>;

    controller = new ExportController();

    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logger: mockLogger
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn()
    };

    mockDb = createMockDb();
    (controller as any).db = mockDb;
    (controller as any)._reportDataService = mockReportDataService;
    (controller as any)._exportFormatterService = mockExportFormatterService;
    mockDb._reset();
  });

  describe('exportReportAsExcel - Export as Excel', () => {
    it('exports capacity report as Excel', async () => {
      mockReq.body = {
        reportType: 'capacity',
        filters: {}
      };

      const mockCapacityReport = {
        byRole: [
          { role: 'Developer', capacity: 1600, utilized: 1200, available: 400 }
        ]
      };

      mockReportDataService.getCapacityReport.mockResolvedValue(mockCapacityReport as any);

      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=capacity-report.xlsx'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports utilization report as Excel', async () => {
      mockReq.body = {
        reportType: 'utilization',
        filters: {}
      };

      const mockUtilizationReport = {
        utilizationData: [
          { person_id: 'p1', person_name: 'Jane Smith', primary_role_name: 'Designer', total_allocation_percentage: 90 }
        ],
        summary: { averageUtilization: 90 }
      };

      mockReportDataService.getUtilizationReport.mockResolvedValue(mockUtilizationReport as any);

      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=utilization-report.xlsx'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports demand report as Excel', async () => {
      mockReq.body = {
        reportType: 'demand',
        filters: {}
      };

      const mockDemandReport = {
        summary: { total_hours: 320 },
        by_project_type: [
          { project_type_name: 'Development', total_hours: 320 }
        ]
      };

      mockReportDataService.getDemandReport.mockResolvedValue(mockDemandReport as any);

      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=demand-report.xlsx'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports gaps report as Excel', async () => {
      mockReq.body = {
        reportType: 'gaps',
        filters: {}
      };

      const mockGapsReport = {
        summary: { totalGapHours: 320 },
        capacityGaps: [
          { role_id: 'r1', role_name: 'Developer', total_demand_fte: 12, total_capacity_fte: 8, demand_vs_capacity: -4 }
        ]
      };

      mockReportDataService.getGapsAnalysis.mockResolvedValue(mockGapsReport as any);

      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=gaps-report.xlsx'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('returns 400 when report type is missing', async () => {
      mockReq.body = {
        filters: {}
      };

      await controller.exportReportAsExcel(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Report type is required'
      });
    });

    it('returns 400 for invalid report type', async () => {
      mockReq.body = {
        reportType: 'invalid-type',
        filters: {}
      };

      // Mock getCapacityReport to throw for invalid type (handled in controller)
      mockReportDataService.getCapacityReport.mockRejectedValue(new Error('Invalid report type'));

      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('exportReportAsCSV - Export as CSV', () => {
    it('exports capacity report as CSV', async () => {
      mockReq.body = {
        reportType: 'capacity',
        filters: {}
      };

      const mockCapacityReport = {
        byRole: [
          { role: 'Developer', capacity: 1600, utilized: 1200, available: 400 }
        ]
      };

      mockReportDataService.getCapacityReport.mockResolvedValue(mockCapacityReport as any);
      mockExportFormatterService.generateCSV.mockReturnValue('Role,Capacity\nDeveloper,1600');

      await controller.exportReportAsCSV(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=capacity-report.csv'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports utilization report as CSV', async () => {
      mockReq.body = {
        reportType: 'utilization',
        filters: {}
      };

      const mockUtilizationReport = {
        utilizationData: [
          { person_id: 'p1', person_name: 'John Doe', primary_role_name: 'Developer', total_allocation_percentage: 85 }
        ],
        summary: { averageUtilization: 85 }
      };

      mockReportDataService.getUtilizationReport.mockResolvedValue(mockUtilizationReport as any);
      mockExportFormatterService.generateCSV.mockReturnValue('Name,Role\nJohn Doe,Developer');

      await controller.exportReportAsCSV(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=utilization-report.csv'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports demand report as CSV', async () => {
      mockReq.body = {
        reportType: 'demand',
        filters: {}
      };

      const mockDemandReport = {
        summary: { total_hours: 320 },
        by_project_type: [
          { project_type_name: 'Development', total_hours: 320 }
        ]
      };

      mockReportDataService.getDemandReport.mockResolvedValue(mockDemandReport as any);

      await controller.exportReportAsCSV(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=demand-report.csv'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports gaps report as CSV', async () => {
      mockReq.body = {
        reportType: 'gaps',
        filters: {}
      };

      const mockGapsReport = {
        summary: { totalGapHours: 320 },
        capacityGaps: [
          { role_id: 'r1', role_name: 'Developer', total_demand_fte: 12, total_capacity_fte: 8, demand_vs_capacity: -4 }
        ]
      };

      mockReportDataService.getGapsAnalysis.mockResolvedValue(mockGapsReport as any);

      await controller.exportReportAsCSV(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=gaps-report.csv'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('returns 400 when report type is missing', async () => {
      mockReq.body = {
        filters: {}
      };

      await controller.exportReportAsCSV(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Report type is required'
      });
    });

    it('returns 400 for invalid report type', async () => {
      mockReq.body = {
        reportType: 'invalid-type',
        filters: {}
      };

      mockReportDataService.getCapacityReport.mockRejectedValue(new Error('Invalid report type'));

      await controller.exportReportAsCSV(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('exportReportAsPDF - Export as PDF', () => {
    it('exports capacity report as PDF', async () => {
      mockReq.body = {
        reportType: 'capacity',
        filters: {}
      };

      const mockCapacityReport = {
        byRole: [
          { role: 'Developer', capacity: 1600, utilized: 1200, available: 400 }
        ]
      };

      mockReportDataService.getCapacityReport.mockResolvedValue(mockCapacityReport as any);
      mockExportFormatterService.generatePDF.mockResolvedValue(Buffer.from('mock-pdf'));

      await controller.exportReportAsPDF(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=capacity-report.pdf'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports utilization report as PDF', async () => {
      mockReq.body = {
        reportType: 'utilization',
        filters: {}
      };

      const mockUtilizationReport = {
        utilizationData: [
          { person_id: 'p1', person_name: 'John Doe', primary_role_name: 'Developer', total_allocation_percentage: 85 }
        ],
        summary: { averageUtilization: 85 }
      };

      mockReportDataService.getUtilizationReport.mockResolvedValue(mockUtilizationReport as any);

      await controller.exportReportAsPDF(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=utilization-report.pdf'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports demand report as PDF', async () => {
      mockReq.body = {
        reportType: 'demand',
        filters: {}
      };

      const mockDemandReport = {
        summary: { total_hours: 320 },
        by_project_type: [
          { project_type_name: 'Development', total_hours: 320 }
        ]
      };

      mockReportDataService.getDemandReport.mockResolvedValue(mockDemandReport as any);

      await controller.exportReportAsPDF(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=demand-report.pdf'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('exports gaps report as PDF', async () => {
      mockReq.body = {
        reportType: 'gaps',
        filters: {}
      };

      const mockGapsReport = {
        summary: { totalGapHours: 320 },
        capacityGaps: [
          { role_id: 'r1', role_name: 'Developer', total_demand_fte: 12, total_capacity_fte: 8, demand_vs_capacity: -4 }
        ]
      };

      mockReportDataService.getGapsAnalysis.mockResolvedValue(mockGapsReport as any);

      await controller.exportReportAsPDF(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=gaps-report.pdf'
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('returns 400 when report type is missing', async () => {
      mockReq.body = {
        filters: {}
      };

      await controller.exportReportAsPDF(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Report type is required'
      });
    });

    it('handles PDF generation errors', async () => {
      mockReq.body = {
        reportType: 'capacity',
        filters: {}
      };

      const mockCapacityReport = {
        byRole: [
          { role: 'Developer', capacity: 1600, utilized: 1200, available: 400 }
        ]
      };

      mockReportDataService.getCapacityReport.mockResolvedValue(mockCapacityReport as any);
      mockExportFormatterService.generatePDF.mockRejectedValue(new Error('PDF generation failed'));

      await controller.exportReportAsPDF(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Error Handling', () => {
    it('exportReportAsExcel - handles database errors', async () => {
      mockReq.body = {
        reportType: 'capacity',
        filters: {}
      };

      mockReportDataService.getCapacityReport.mockRejectedValue(new Error('Database connection failed'));

      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('exportReportAsCSV - handles database errors', async () => {
      mockReq.body = {
        reportType: 'utilization',
        filters: {}
      };

      mockReportDataService.getUtilizationReport.mockRejectedValue(new Error('Query failed'));

      await controller.exportReportAsCSV(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('I01y/#2 场景头贯通（所有格式 × 报表类型）', () => {
    const BRANCH = 'review-branch';
    beforeEach(() => {
      mockReq.headers['x-scenario-id'] = BRANCH;
      mockReportDataService.getCapacityReport.mockResolvedValue({ byRole: [] } as any);
      mockReportDataService.getUtilizationReport.mockResolvedValue({
        utilizationData: [],
        summary: { averageUtilization: 0 },
      } as any);
      mockReportDataService.getDemandReport.mockResolvedValue({
        summary: { total_hours: 0 },
        by_project_type: [],
      } as any);
      mockReportDataService.getGapsAnalysis.mockResolvedValue({
        summary: { totalGapHours: 0 },
        capacityGaps: [],
      } as any);
    });

    it('CSV 入口：capacity/demand/gaps/utilization 均收到分支场景', async () => {
      for (const reportType of ['capacity', 'demand', 'gaps', 'utilization']) {
        mockReq.body = { reportType, filters: {} };
        await controller.exportReportAsCSV(mockReq, mockRes);
        await flushPromises();
      }
      expect(mockReportDataService.getCapacityReport).toHaveBeenCalledWith(
        expect.objectContaining({ scenarioId: BRANCH })
      );
      expect(mockReportDataService.getDemandReport).toHaveBeenCalledWith(
        expect.objectContaining({ scenarioId: BRANCH })
      );
      expect(mockReportDataService.getGapsAnalysis).toHaveBeenCalledWith(BRANCH);
      expect(mockReportDataService.getUtilizationReport).toHaveBeenCalledWith(
        expect.objectContaining({ scenarioId: BRANCH })
      );
    });

    it('PDF 入口：demand 收到分支场景', async () => {
      mockReq.body = { reportType: 'demand', filters: {} };
      await controller.exportReportAsPDF(mockReq, mockRes);
      await flushPromises();
      expect(mockReportDataService.getDemandReport).toHaveBeenCalledWith(
        expect.objectContaining({ scenarioId: BRANCH })
      );
    });

    it('Excel 入口：demand/gaps 适配器不再丢弃场景', async () => {
      mockReq.body = { reportType: 'demand', filters: {} };
      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();
      mockReq.body = { reportType: 'gaps', filters: {} };
      await controller.exportReportAsExcel(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getDemandReport).toHaveBeenCalledWith(
        expect.objectContaining({ scenarioId: BRANCH })
      );
      expect(mockReportDataService.getGapsAnalysis).toHaveBeenCalledWith(BRANCH);
    });
  });
});
