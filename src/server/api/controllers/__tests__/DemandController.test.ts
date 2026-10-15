import { DemandController } from '../DemandController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';
import { DemandCalculationService } from '../../../services/demand/DemandCalculationService.js';

// Mock the service
jest.mock('../../../services/demand/DemandCalculationService.js');

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

describe('DemandController', () => {
  let controller: DemandController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;
  let mockDemandService: jest.Mocked<DemandCalculationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();

    // Create mock service instance
    mockDemandService = {
      getProjectDemands: jest.fn(),
      getDemandSummary: jest.fn(),
      getDemandForecast: jest.fn(),
      getDemandGaps: jest.fn(),
      calculateScenarioImpact: jest.fn(),
    } as unknown as jest.Mocked<DemandCalculationService>;

    controller = new DemandController();

    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logger: mockLogger
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    mockDb = createMockDb();
    (controller as any).db = mockDb;
    (controller as any)._demandService = mockDemandService;
    mockDb._reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getProjectDemands - Get Project Demands', () => {
    it('retrieves project demands with phases and summary', async () => {
      mockReq.params.project_id = 'project-1';

      const mockProjectDemandsResult = {
        project: {
          id: 'project-1',
          name: 'Test Project',
          project_type_id: 'type-1',
          project_type_name: 'Development'
        },
        phases: [
          {
            phase_id: 'phase-1',
            phase_name: 'Planning',
            total_hours: 160,
            roles: [{ role_name: 'Developer', demand_hours: 160 }]
          },
          {
            phase_id: 'phase-2',
            phase_name: 'Development',
            total_hours: 320,
            roles: [{ role_name: 'Developer', demand_hours: 320 }]
          }
        ],
        summary: {
          total_phases: 2,
          total_demands: 2,
          total_hours: 480,
          override_count: 0,
          roles_needed: 1
        }
      };

      mockDemandService.getProjectDemands.mockResolvedValue(mockProjectDemandsResult as any);

      await controller.getProjectDemands(mockReq, mockRes);
      await flushPromises();

      expect(mockDemandService.getProjectDemands).toHaveBeenCalledWith('project-1');
      expect(mockRes.json).toHaveBeenCalledWith(mockProjectDemandsResult);
    });

    it('returns 404 when project not found', async () => {
      mockReq.params.project_id = 'nonexistent-project';

      mockDemandService.getProjectDemands.mockResolvedValue(null as any);

      await controller.getProjectDemands(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project not found'
      });
    });
  });

  describe('getDemandSummary - Get Demand Summary', () => {
    it('retrieves demand summary with filters', async () => {
      mockReq.query = {
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        location_id: 'loc-1',
        project_type_id: 'type-1'
      };

      const mockSummaryResult = {
        filters: {
          start_date: '2024-01-01',
          end_date: '2024-12-31'
        },
        summary: {
          total_demands: 1,
          total_projects: 1
        },
        by_role: [{ role_name: 'Developer', total_fte: 0.5 }],
        by_project_type: [{ project_type_name: 'Development', total_fte: 0.5 }],
        timeline: [{ month: '2024-01', total_fte: 0.5 }]
      };

      mockDemandService.getDemandSummary.mockResolvedValue(mockSummaryResult as any);

      await controller.getDemandSummary(mockReq, mockRes);
      await flushPromises();

      expect(mockDemandService.getDemandSummary).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        locationId: 'loc-1',
        projectTypeId: 'type-1',
        scenarioId: 'baseline-0000-0000-0000-000000000000' // IP-02b: 缺省场景切片
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockSummaryResult);
    });

    it('returns empty summary when no demands exist', async () => {
      mockReq.query = {
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };

      const mockEmptyResult = {
        filters: {},
        summary: {
          total_demands: 0,
          total_projects: 0
        },
        by_role: [],
        by_project_type: [],
        timeline: []
      };

      mockDemandService.getDemandSummary.mockResolvedValue(mockEmptyResult as any);

      await controller.getDemandSummary(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            total_demands: 0,
            total_projects: 0
          })
        })
      );
    });
  });

  describe('createOverride - Create Demand Override', () => {
    it('creates demand override successfully', async () => {
      mockReq.body = {
        project_id: 'project-1',
        phase_id: 'phase-1',
        role_id: 'role-1',
        demand_hours: 200,
        notes: 'Increased demand for critical path'
      };

      const mockProject = {
        id: 'project-1',
        name: 'Test Project'
      };

      const mockOverride = {
        id: 'override-1',
        project_id: 'project-1',
        phase_id: 'phase-1',
        role_id: 'role-1',
        demand_hours: 200,
        notes: 'Increased demand for critical path',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb._queueFirstResult(mockProject);
      mockDb._setInsertResult([mockOverride]);

      await controller.createOverride(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockOverride);
    });

    it('returns 404 when project not found', async () => {
      mockReq.body = {
        project_id: 'nonexistent-project',
        phase_id: 'phase-1',
        role_id: 'role-1',
        demand_hours: 200
      };

      mockDb._setFirstResult(null);

      await controller.createOverride(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Project not found'
      });
    });
  });

  describe('deleteOverride - Delete Demand Override', () => {
    it('deletes override successfully', async () => {
      mockReq.params.id = 'override-1';

      mockDb._setDeleteResult(1);

      await controller.deleteOverride(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Demand override deleted successfully'
      });
    });

    it('returns 404 when override not found', async () => {
      mockReq.params.id = 'nonexistent-override';

      mockDb._setDeleteResult(0);

      await controller.deleteOverride(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Demand override not found'
      });
    });
  });

  describe('getDemandForecast - Get Demand Forecast', () => {
    it('generates demand forecast for specified months', async () => {
      mockReq.query = { months: '3' };

      const mockForecastResult = {
        forecast: [
          { month: '2024-01', total_fte: 2.5, by_role: { Developer: 1.5, Designer: 1.0 } }
        ],
        summary: {
          months: 3,
          total_projects: 1
        }
      };

      mockDemandService.getDemandForecast.mockResolvedValue(mockForecastResult as any);

      await controller.getDemandForecast(mockReq, mockRes);
      await flushPromises();

      expect(mockDemandService.getDemandForecast).toHaveBeenCalledWith(3);
      expect(mockRes.json).toHaveBeenCalledWith(mockForecastResult);
    });

    it('defaults to 6 months when not specified', async () => {
      mockReq.query = {};

      const mockForecastResult = {
        forecast: [],
        summary: { months: 6, total_projects: 0 }
      };

      mockDemandService.getDemandForecast.mockResolvedValue(mockForecastResult as any);

      await controller.getDemandForecast(mockReq, mockRes);
      await flushPromises();

      expect(mockDemandService.getDemandForecast).toHaveBeenCalledWith(6);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            months: 6
          })
        })
      );
    });
  });

  describe('getDemandGaps - Get Demand Gaps', () => {
    it('retrieves capacity gaps', async () => {
      const mockGapsResult = {
        gaps: [
          {
            role_id: 'role-1',
            role_name: 'Developer',
            gap_fte: 3
          }
        ],
        summary: {
          total_gaps: 1,
          total_shortage_fte: 3
        }
      };

      mockDemandService.getDemandGaps.mockResolvedValue(mockGapsResult as any);

      await controller.getDemandGaps(mockReq, mockRes);
      await flushPromises();

      expect(mockDemandService.getDemandGaps).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockGapsResult);
    });

    it('returns empty gaps when no shortage exists', async () => {
      const mockGapsResult = {
        gaps: [],
        summary: {
          total_gaps: 0,
          total_shortage_fte: 0
        }
      };

      mockDemandService.getDemandGaps.mockResolvedValue(mockGapsResult as any);

      await controller.getDemandGaps(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          gaps: [],
          summary: expect.objectContaining({
            total_gaps: 0,
            total_shortage_fte: 0
          })
        })
      );
    });
  });

  describe('calculateScenario - Calculate Scenario Impact', () => {
    it('calculates scenario impact with new projects', async () => {
      mockReq.body = {
        scenario: {
          new_projects: [
            {
              id: 'new-project-1',
              project_type_id: 'type-1',
              start_date: '2024-04-01',
              end_date: '2024-06-30'
            }
          ]
        }
      };

      const mockScenarioResult = {
        scenario: mockReq.body.scenario,
        baseline: { total_demand_fte: 5 },
        projected: { total_demand_fte: 8 },
        impact: { fte_change: 3 },
        recommendation: 'Scenario is feasible with current capacity'
      };

      mockDemandService.calculateScenarioImpact.mockResolvedValue(mockScenarioResult as any);

      await controller.calculateScenario(mockReq, mockRes);
      await flushPromises();

      expect(mockDemandService.calculateScenarioImpact).toHaveBeenCalledWith(mockReq.body.scenario);
      expect(mockRes.json).toHaveBeenCalledWith(mockScenarioResult);
    });

    it('provides recommendations based on impact', async () => {
      mockReq.body = {
        scenario: {
          remove_projects: ['project-1']
        }
      };

      const mockScenarioResult = {
        scenario: mockReq.body.scenario,
        baseline: { total_demand_fte: 10 },
        projected: { total_demand_fte: 5 },
        impact: { fte_change: -5 },
        recommendation: 'Scenario is feasible with current capacity'
      };

      mockDemandService.calculateScenarioImpact.mockResolvedValue(mockScenarioResult as any);

      await controller.calculateScenario(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendation: expect.stringContaining('feasible')
        })
      );
    });

    it('provides recommendation for scenarios with capacity gaps', async () => {
      mockReq.body = {
        scenario: {
          new_projects: [
            {
              id: 'big-project',
              project_type_id: 'type-1',
              start_date: '2024-01-01',
              end_date: '2024-12-31'
            }
          ]
        }
      };

      const mockScenarioResult = {
        scenario: mockReq.body.scenario,
        baseline: { total_demand_fte: 5 },
        projected: { total_demand_fte: 15 },
        impact: { fte_change: 10 },
        recommendation: 'Scenario creates capacity gaps in some roles'
      };

      mockDemandService.calculateScenarioImpact.mockResolvedValue(mockScenarioResult as any);

      await controller.calculateScenario(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendation: expect.stringContaining('capacity gaps')
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('handles service errors in getProjectDemands', async () => {
      mockReq.params.project_id = 'project-1';

      mockDemandService.getProjectDemands.mockRejectedValue(new Error('Database connection failed'));

      await controller.getProjectDemands(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('handles service errors in getDemandSummary', async () => {
      mockReq.query = {
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      };

      mockDemandService.getDemandSummary.mockRejectedValue(new Error('Database connection failed'));

      await controller.getDemandSummary(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('handles service errors in getDemandForecast', async () => {
      mockReq.query = { months: '6' };

      mockDemandService.getDemandForecast.mockRejectedValue(new Error('Query failed'));

      await controller.getDemandForecast(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in getDemandGaps', async () => {
      mockDemandService.getDemandGaps.mockRejectedValue(new Error('Query failed'));

      await controller.getDemandGaps(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('handles service errors in calculateScenario', async () => {
      mockReq.body = {
        scenario: {
          new_projects: []
        }
      };

      mockDemandService.calculateScenarioImpact.mockRejectedValue(new Error('Database error'));

      await controller.calculateScenario(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
