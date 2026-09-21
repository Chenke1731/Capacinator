import { ReportingController } from '../ReportingController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';
import { ReportDataService } from '../../../services/reports/ReportDataService.js';

// Mock the service
jest.mock('../../../services/reports/ReportDataService.js');

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logPerformance: jest.fn(),
  logBusinessOperation: jest.fn()
};

describe('ReportingController', () => {
  let controller: ReportingController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;
  let mockReportDataService: jest.Mocked<ReportDataService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock service instance
    mockReportDataService = {
      getDashboardStats: jest.fn(),
      getCapacityReport: jest.fn(),
      getUtilizationReport: jest.fn(),
      getDemandReport: jest.fn(),
      getGapsAnalysis: jest.fn(),
      getTimelineReport: jest.fn(),
      getProjectReport: jest.fn(),
    } as unknown as jest.Mocked<ReportDataService>;

    controller = new ReportingController();

    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      requestId: 'test-request-id',
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        logPerformance: jest.fn(),
        logBusinessOperation: jest.fn()
      }
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    mockDb = createMockDb();
    mockDb.countDistinct = jest.fn().mockReturnValue(mockDb);
    (controller as any).db = mockDb;
    (controller as any)._reportDataService = mockReportDataService;
    mockDb._reset();
  });

  describe('getDashboard - Get Dashboard Data', () => {
    it('retrieves dashboard with all components', async () => {
      const mockDashboardData = {
        summary: {
          projects: 5,
          people: 20,
          roles: 8
        },
        projectHealth: {
          ACTIVE: 3,
          PLANNING: 2,
          COMPLETE: 0
        },
        capacityGaps: {
          GAP: 1,
          TIGHT: 2,
          OK: 5
        },
        utilization: {
          OVER_ALLOCATED: 2,
          OPTIMAL: 10,
          UNDER_ALLOCATED: 8
        },
        availability: {
          AVAILABLE: 5,
          ASSIGNED: 15
        },
        design_watch: [],
        lifecycle_summary: {}
      };

      mockReportDataService.getDashboardStats.mockResolvedValue(mockDashboardData);

      await controller.getDashboard(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getDashboardStats).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockDashboardData
        })
      );
    });

    it('handles empty database gracefully', async () => {
      const mockEmptyData = {
        summary: {
          projects: 0,
          people: 0,
          roles: 0
        },
        projectHealth: {},
        capacityGaps: { GAP: 0, TIGHT: 0, OK: 0 },
        utilization: {},
        availability: { AVAILABLE: 0, ASSIGNED: 0 },
        design_watch: [],
        lifecycle_summary: {}
      };

      mockReportDataService.getDashboardStats.mockResolvedValue(mockEmptyData);

      await controller.getDashboard(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            summary: {
              projects: 0,
              people: 0,
              roles: 0
            }
          })
        })
      );
    });
  });

  describe('getCapacityReport - Get Capacity Report', () => {
    it('retrieves capacity report with date range filtering', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const mockCapacityData = {
        capacityGaps: [
          { role_id: 'role-1', role_name: 'Developer', status: 'GAP', gap_fte: 2 }
        ],
        byRole: [
          { role: 'Developer', capacity: 1600, utilized: 1920, available: -320 }
        ],
        personUtilization: [],
        utilizationData: [],
        projectDemands: [],
        timeline: [{ period: '2024-01', capacity: 800 }],
        summary: { totalGaps: 1, totalTight: 0 }
      };

      mockReportDataService.getCapacityReport.mockResolvedValue(mockCapacityData as any);

      await controller.getCapacityReport(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getCapacityReport).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockCapacityData
        })
      );
    });

    it('calculates capacity gaps with correct status', async () => {
      mockReq.query = {};

      const mockCapacityData = {
        capacityGaps: [
          { role_id: 'role-1', role_name: 'Developer', status: 'GAP', gap_fte: 1 },
          { role_id: 'role-2', role_name: 'Designer', status: 'TIGHT', gap_fte: 0.3 },
          { role_id: 'role-3', role_name: 'Manager', status: 'OK', gap_fte: -1 }
        ],
        byRole: [],
        personUtilization: [],
        utilizationData: [],
        projectDemands: [],
        timeline: [],
        summary: { totalGaps: 1, totalTight: 1 }
      };

      mockReportDataService.getCapacityReport.mockResolvedValue(mockCapacityData as any);

      await controller.getCapacityReport(mockReq, mockRes);
      await flushPromises();

      const response = mockRes.json.mock.calls[0][0];
      const capacityGaps = response.data.capacityGaps;

      expect(capacityGaps[0].status).toBe('GAP');
      expect(capacityGaps[1].status).toBe('TIGHT');
      expect(capacityGaps[2].status).toBe('OK');
    });
  });

  describe('getProjectReport - Get Project Report', () => {
    it('retrieves projects without filters', async () => {
      mockReq.query = {};

      const mockProjectData = {
        projects: [
          { project_id: 'project-1', project_name: 'Project A', health_status: 'ACTIVE', priority: 1 },
          { project_id: 'project-2', project_name: 'Project B', health_status: 'PLANNING', priority: 2 }
        ],
        summary: {
          byStatus: { ACTIVE: 1, PLANNING: 1 },
          byPriority: { 1: 1, 2: 1 }
        }
      };

      mockReportDataService.getProjectReport.mockResolvedValue(mockProjectData as any);

      await controller.getProjectReport(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getProjectReport).toHaveBeenCalledWith({
        status: undefined,
        priority: undefined,
        projectType: undefined,
        location: undefined
      });
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockProjectData
        })
      );
    });

    it('applies status and priority filtering', async () => {
      mockReq.query = {
        status: 'ACTIVE',
        priority: 'high'
      };

      const mockProjectData = {
        projects: [
          { project_id: 'project-1', project_name: 'High Priority Active', health_status: 'ACTIVE', priority: 1 }
        ],
        summary: {
          byStatus: { ACTIVE: 1 },
          byPriority: { 1: 1 }
        }
      };

      mockReportDataService.getProjectReport.mockResolvedValue(mockProjectData as any);

      await controller.getProjectReport(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getProjectReport).toHaveBeenCalledWith({
        status: 'ACTIVE',
        priority: 'high',
        projectType: undefined,
        location: undefined
      });
    });
  });

  describe('getTimelineReport - Get Timeline Report', () => {
    it('retrieves timeline with date range', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const mockTimelineData = {
        projects: [
          {
            id: 'project-1',
            name: 'Project A',
            aspiration_start: '2024-03-01',
            aspiration_finish: '2024-09-30',
            priority: 1
          }
        ],
        phases: [
          { id: 'phase-1', project_id: 'project-1', phase_name: 'Planning', start_date: '2024-03-01', end_date: '2024-04-30' },
          { id: 'phase-2', project_id: 'project-1', phase_name: 'Development', start_date: '2024-05-01', end_date: '2024-09-30' }
        ]
      };

      mockReportDataService.getTimelineReport.mockResolvedValue(mockTimelineData as any);

      await controller.getTimelineReport(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getTimelineReport).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockTimelineData
        })
      );
    });
  });

  describe('getDemandReport - Get Demand Report', () => {
    it('retrieves demand data with date filtering', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };
      mockReq.headers['x-scenario-id'] = 'scenario-baseline';

      const mockDemandData = {
        summary: { total_hours: 1600, total_fte: 10, total_projects: 3 },
        by_project_type: [
          { project_type_name: 'Development', total_hours: 1200, total_fte: 7.5 }
        ],
        by_role: [
          { role_name: 'Developer', total_hours: 800, total_fte: 5 }
        ],
        byProject: [],
        timeline: []
      };

      mockReportDataService.getDemandReport.mockResolvedValue(mockDemandData as any);

      await controller.getDemandReport(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getDemandReport).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        scenarioId: 'scenario-baseline',
        includeAllScenarios: false
      });
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockDemandData
        })
      );
    });

    it('aggregates demand by project, role, and project type', async () => {
      mockReq.query = {};

      const mockDemandData = {
        summary: { total_hours: 480, total_fte: 3, total_projects: 2 },
        by_project_type: [
          { project_type_name: 'Development', total_hours: 320, total_fte: 2 },
          { project_type_name: 'Maintenance', total_hours: 160, total_fte: 1 }
        ],
        by_role: [
          { role_name: 'Developer', total_hours: 320, total_fte: 2 },
          { role_name: 'Designer', total_hours: 160, total_fte: 1 }
        ],
        byProject: [
          { project_id: 'p1', project_name: 'Project A', total_hours: 320 }
        ],
        timeline: []
      };

      mockReportDataService.getDemandReport.mockResolvedValue(mockDemandData as any);

      await controller.getDemandReport(mockReq, mockRes);
      await flushPromises();

      const response = mockRes.json.mock.calls[0][0];
      expect(response.data.by_project_type).toHaveLength(2);
      expect(response.data.by_role).toHaveLength(2);
    });
  });

  describe('getUtilizationReport - Get Utilization Report', () => {
    it('retrieves utilization data with date filtering', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const mockUtilizationData = {
        utilizationData: [
          { person_id: 'p1', person_name: 'John Doe', primary_role_name: 'Developer', total_allocation_percentage: 85 }
        ],
        summary: {
          averageUtilization: 85,
          overAllocated: 2,
          optimal: 15,
          underAllocated: 3
        }
      };

      mockReportDataService.getUtilizationReport.mockResolvedValue(mockUtilizationData as any);

      await controller.getUtilizationReport(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getUtilizationReport).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockUtilizationData
        })
      );
    });
  });

  describe('getGapsAnalysis - Get Gaps Analysis', () => {
    it('retrieves gaps analysis data', async () => {
      const mockGapsData = {
        capacityGaps: [
          { role_id: 'r1', role_name: 'Developer', total_demand_fte: 12, total_capacity_fte: 8, demand_vs_capacity: -4 }
        ],
        summary: {
          totalGapHours: 640,
          rolesWithGaps: 1
        }
      };

      mockReportDataService.getGapsAnalysis.mockResolvedValue(mockGapsData as any);

      await controller.getGapsAnalysis(mockReq, mockRes);
      await flushPromises();

      expect(mockReportDataService.getGapsAnalysis).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockGapsData
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('handles service errors in getDashboard', async () => {
      mockReportDataService.getDashboardStats.mockRejectedValue(new Error('Database error'));

      await controller.getDashboard(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('handles service errors in getCapacityReport', async () => {
      mockReportDataService.getCapacityReport.mockRejectedValue(new Error('Query failed'));

      await controller.getCapacityReport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in getDemandReport', async () => {
      mockReportDataService.getDemandReport.mockRejectedValue(new Error('Query failed'));

      await controller.getDemandReport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in getUtilizationReport', async () => {
      mockReportDataService.getUtilizationReport.mockRejectedValue(new Error('Query failed'));

      await controller.getUtilizationReport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in getGapsAnalysis', async () => {
      mockReportDataService.getGapsAnalysis.mockRejectedValue(new Error('Query failed'));

      await controller.getGapsAnalysis(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in getTimelineReport', async () => {
      mockReportDataService.getTimelineReport.mockRejectedValue(new Error('Query failed'));

      await controller.getTimelineReport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in getProjectReport', async () => {
      mockReportDataService.getProjectReport.mockRejectedValue(new Error('Query failed'));

      await controller.getProjectReport(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
