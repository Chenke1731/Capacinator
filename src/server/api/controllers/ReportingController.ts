import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { ReportDataService } from '../../services/reports/ReportDataService.js';
import type { DemandReportFilters, ProjectReportFilters, DateRangeFilter } from '../../services/reports/types.js';

// Alias for backward compatibility
type RequestWithLogging = RequestWithContext;

export class ReportingController extends BaseController {
  private _reportDataService?: ReportDataService;

  constructor(container?: ServiceContainer) {
    super({ enableLogging: true }, { container });
  }

  // Lazy initialization to allow db mocking in tests
  private get reportDataService(): ReportDataService {
    if (!this._reportDataService) {
      this._reportDataService = new ReportDataService(this.db);
    }
    return this._reportDataService;
  }

  getDashboard = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    req.logger.info('Dashboard endpoint called');

    const result = await this.executeQuery(
      async () => this.reportDataService.getDashboardStats(),
      res,
      'Failed to fetch dashboard data'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  getTest = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    req.logger.info('Test endpoint called');
    try {
      const projects = await this.db('projects').select('*').limit(1);
      req.logger.info('Projects query successful', { projects });
      this.sendSuccess(req, res, { status: 'ok', data: projects });
    } catch (error) {
      req.logger.error('Test endpoint error', error);
      this.handleError(error, req, res, 'Test failed');
    }
  });

  getCapacityReport = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const filters: DateRangeFilter = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };

    const result = await this.executeQuery(
      async () => this.reportDataService.getCapacityReport(filters),
      res,
      'Failed to fetch capacity report'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  getProjectReport = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const filters: ProjectReportFilters = {
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      projectType: req.query.projectType as string | undefined,
      location: req.query.location as string | undefined,
    };

    const result = await this.executeQuery(
      async () => this.reportDataService.getProjectReport(filters),
      req,
      res,
      'Failed to fetch project report'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  /**
   * By-component analytics (066): demand count and staffing weight per
   * software component — the payoff endpoint for the controlled
   * component dimension. Unassigned projects land in an explicit
   * "未归属" bucket so coverage is visible, not hidden.
   */
  getComponentReport = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const result = await this.executeQuery(
      async () => {
        const UNASSIGNED = { id: null, name: '未归属' };
        const projectCounts: Array<{ id: string | null; name: string | null; project_count: number }> =
          await this.db('projects')
            .leftJoin('components', 'projects.component_id', 'components.id')
            .select('components.id', 'components.name')
            .count('projects.id as project_count')
            .groupBy('components.id', 'components.name');

        // Staffing follows the report-wide union convention (baseline
        // project_assignments UNION ALL active scenarios' scenario_project_
        // assignments) so component analytics match every other report.
        const staffing: Array<{ id: string | null; name: string | null; assignment_count: number; total_allocation: number }> =
          await this.db.raw(`
            SELECT c.id, c.name,
                   COUNT(*) as assignment_count,
                   SUM(a.allocation_percentage) as total_allocation
            FROM (
              SELECT pa.project_id, pa.allocation_percentage
              FROM project_assignments pa
              WHERE pa.status = 'active'
              UNION ALL
              SELECT spa.project_id, spa.allocation_percentage
              FROM scenario_project_assignments spa
              JOIN scenarios s ON spa.scenario_id = s.id
              WHERE s.status = 'active' AND spa.status = 'active'
            ) a
            JOIN projects p ON a.project_id = p.id
            LEFT JOIN components c ON p.component_id = c.id
            GROUP BY c.id, c.name
          `);

        const byKey = new Map<string, { component_id: string | null; component_name: string; project_count: number; assignment_count: number; total_allocation_pct: number }>();
        for (const row of projectCounts) {
          const key = row.id ?? '_none';
          byKey.set(key, {
            component_id: row.id,
            component_name: row.name ?? UNASSIGNED.name,
            project_count: Number(row.project_count) || 0,
            assignment_count: 0,
            total_allocation_pct: 0,
          });
        }
        for (const row of staffing) {
          const key = row.id ?? '_none';
          const entry = byKey.get(key) ?? {
            component_id: row.id,
            component_name: row.name ?? UNASSIGNED.name,
            project_count: 0,
            assignment_count: 0,
            total_allocation_pct: 0,
          };
          entry.assignment_count = Number(row.assignment_count) || 0;
          entry.total_allocation_pct = Number(row.total_allocation) || 0;
          byKey.set(key, entry);
        }
        return {
          data: [...byKey.values()].sort((a, b) => b.project_count - a.project_count),
          generated_at: new Date().toISOString(),
        };
      },
      req,
      res,
      'Failed to fetch component report'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  getTimelineReport = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    const filters: DateRangeFilter = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };

    const result = await this.executeQuery(
      async () => this.reportDataService.getTimelineReport(filters),
      res,
      'Failed to fetch timeline report'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  getDemandReport = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    req.logger.info('Demand report endpoint called');

    const filters: DemandReportFilters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      scenarioId: req.headers['x-scenario-id'] as string | undefined,
      includeAllScenarios: req.query.includeAllScenarios === 'true',
    };

    const result = await this.executeQuery(
      async () => this.reportDataService.getDemandReport(filters),
      res,
      'Failed to fetch demand report'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  getUtilizationReport = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    req.logger.info('Utilization report endpoint called');

    const filters: DateRangeFilter = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };

    req.logger.info('Date filters:', filters);

    const result = await this.executeQuery(
      async () => this.reportDataService.getUtilizationReport(filters),
      res,
      'Failed to fetch utilization report'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });

  getGapsAnalysis = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    req.logger.info('Gaps analysis endpoint called');

    const result = await this.executeQuery(
      async () => this.reportDataService.getGapsAnalysis(),
      res,
      'Failed to fetch gaps analysis'
    );

    if (result) {
      this.sendSuccess(req, res, result);
    }
  });
}
