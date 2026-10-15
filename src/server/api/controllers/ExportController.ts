import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { ReportDataService } from '../../services/reports/ReportDataService.js';
import { ExportFormatterService } from '../../services/export/ExportFormatterService.js';
import { resolveScenarioId } from '../../services/calc/effectiveAssignments.js';
import type { ReportType, ExportCapacityData, ExportUtilizationData, ExportDemandData, ExportGapsData } from '../../services/export/types.js';
import type { DateRangeFilter } from '../../services/reports/types.js';

/**
 * Filter parameters for report generation
 */
interface ReportFilters extends DateRangeFilter {
  projectTypeId?: string;
  locationId?: string;
  roleId?: string;
}

export class ExportController extends BaseController {
  private _reportDataService?: ReportDataService;
  private _exportFormatterService?: ExportFormatterService;

  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  // Lazy initialization to allow db mocking in tests
  private get reportDataService(): ReportDataService {
    if (!this._reportDataService) {
      this._reportDataService = new ReportDataService(this.db);
    }
    return this._reportDataService;
  }

  private get exportFormatterService(): ExportFormatterService {
    if (!this._exportFormatterService) {
      this._exportFormatterService = new ExportFormatterService();
    }
    return this._exportFormatterService;
  }

  async exportReportAsExcel(req: Request, res: Response) {
    try {
      const { reportType, filters = {} } = req.body;

      if (!reportType) {
        return res.status(400).json({ error: 'Report type is required' });
      }

      // IP-02b: 报表导出沿用请求选定场景切片(缺省 baseline)
      const data = await this.getReportData(reportType, { ...filters, scenarioId: resolveScenarioId(req.headers['x-scenario-id']) });
      const buffer = await this.exportFormatterService.generateExcel(reportType, data);
      const filename = this.exportFormatterService.getFilename(reportType, 'xlsx');

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(buffer);
    } catch (error) {
      this.handleError(error, res, 'Export failed');
    }
  }

  async exportReportAsCSV(req: Request, res: Response) {
    try {
      const { reportType, filters = {} } = req.body;

      if (!reportType) {
        return res.status(400).json({ error: 'Report type is required' });
      }

      const data = await this.getReportData(reportType, filters);
      const csvContent = this.exportFormatterService.generateCSV(reportType, data);
      const filename = this.exportFormatterService.getFilename(reportType, 'csv');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(csvContent);
    } catch (error) {
      this.handleError(error, res, 'CSV export failed');
    }
  }

  async exportReportAsPDF(req: Request, res: Response) {
    try {
      const { reportType, filters = {} } = req.body;

      if (!reportType) {
        return res.status(400).json({ error: 'Report type is required' });
      }

      const data = await this.getReportData(reportType, filters);
      const pdfBuffer = await this.exportFormatterService.generatePDF(reportType, data);
      const filename = this.exportFormatterService.getFilename(reportType, 'pdf');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(pdfBuffer);
    } catch (error) {
      this.handleError(error, res, 'PDF export failed');
    }
  }

  /**
   * Get report data based on report type and filters
   */
  private async getReportData(reportType: ReportType, filters: ReportFilters): Promise<unknown> {
    switch (reportType) {
      case 'capacity':
        return this.getCapacityExportData(filters);
      case 'utilization':
        return this.getUtilizationExportData(filters);
      case 'demand':
        return this.getDemandExportData(filters);
      case 'gaps':
        return this.getGapsExportData();
      default:
        throw new Error('Invalid report type');
    }
  }

  private async getCapacityExportData(filters: ReportFilters): Promise<ExportCapacityData> {
    const report = await this.reportDataService.getCapacityReport(filters);

    return {
      totalCapacity: report.byRole.reduce((sum, r) => sum + r.capacity, 0),
      utilizedCapacity: report.byRole.reduce((sum, r) => sum + r.utilized, 0),
      availableCapacity: report.byRole.reduce((sum, r) => sum + r.available, 0),
      byRole: report.byRole.map((r) => ({
        role: r.role,
        capacity: r.capacity,
        utilized: r.utilized,
      })),
    };
  }

  private async getUtilizationExportData(filters: ReportFilters): Promise<ExportUtilizationData> {
    const report = await this.reportDataService.getUtilizationReport(filters);

    return {
      peopleUtilization: report.utilizationData.map((p) => ({
        id: p.person_id,
        name: p.person_name,
        role: p.primary_role_name || '',
        utilization: Math.round(p.total_allocation_percentage),
      })),
      averageUtilization: report.summary.averageUtilization,
    };
  }

  private async getDemandExportData(filters: ReportFilters): Promise<ExportDemandData> {
    const report = await this.reportDataService.getDemandReport({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    return {
      totalDemand: report.summary.total_hours,
      byProjectType: report.by_project_type.map((t) => ({
        type: t.project_type_name,
        demand: t.total_hours,
      })),
    };
  }

  private async getGapsExportData(): Promise<ExportGapsData> {
    const report = await this.reportDataService.getGapsAnalysis();

    return {
      totalGap: report.summary.totalGapHours,
      gapsByRole: report.capacityGaps.map((g) => ({
        roleId: g.role_id,
        roleName: g.role_name,
        demand: Math.round((g.total_demand_fte || 0) * 160),
        capacity: Math.round((g.total_capacity_fte || 0) * 160),
        gap: Math.round((g.demand_vs_capacity || 0) * 160),
      })),
    };
  }
}
