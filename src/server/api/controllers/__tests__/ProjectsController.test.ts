import { ProjectsController } from '../ProjectsController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

// Mock the notification scheduler
jest.mock('../../../services/NotificationScheduler', () => ({
  notificationScheduler: {
    sendProjectTimelineNotification: jest.fn()
  }
}));

// Create a shared mock instance for PhaseTemplateValidationService
const mockPhaseValidationService = {
  validatePhaseUpdates: jest.fn(),
  validateCustomPhaseAddition: jest.fn(),
  getProjectTemplateCompliance: jest.fn()
};

// Mock the phase validation service
jest.mock('../../../services/PhaseTemplateValidationService', () => ({
  PhaseTemplateValidationService: jest.fn().mockImplementation(() => mockPhaseValidationService)
}));

// Create a shared mock instance for CustomPhaseManagementService
const mockCustomPhaseService = {
  addCustomPhase: jest.fn(),
  updatePhase: jest.fn(),
  deletePhase: jest.fn()
};

// Mock the custom phase management service
jest.mock('../../../services/CustomPhaseManagementService', () => ({
  CustomPhaseManagementService: jest.fn().mockImplementation(() => mockCustomPhaseService)
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logBusinessOperation: jest.fn()
};

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProjectsController();

    mockReq = {
      query: {},
      params: {},
      body: {},
      headers: {},
      logger: mockLogger,
      logAuditEvent: jest.fn().mockResolvedValue(undefined)
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };

    mockDb = createMockDb();
    (controller as any).db = mockDb;
    mockDb._reset();

    // Mock db.raw for subqueries
    mockDb.raw = jest.fn((sql) => ({
      toString: () => sql
    }));
  });

  describe('getAll - List All Projects', () => {
    it('retrieves all projects with pagination', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Project Alpha',
          description: 'Test project',
          priority: 'high',
          project_type_id: 'type-1',
          project_sub_type_id: 'subtype-1',
          location_id: 'loc-1',
          location_name: 'New York',
          project_type_name: 'Development',
          project_sub_type_name: 'Web App',
          project_type_color_code: '#FF5733',
          owner_name: 'John Doe',
          current_phase_name: 'Planning',
          start_date: new Date('2024-01-01').getTime(),
          end_date: new Date('2024-12-31').getTime(),
          staffing_summary: {
            design: { named: 0, pool: 0, named_detail: [] },
            dev: { named: 0, pool: 0, named_detail: [] }
          }
        }
      ];

      const mockCount = { count: 1 };

      // Queue responses: projects → tags → staffing(named/pool) → estimations → count
      mockDb._queueQueryResult(mockProjects);
      mockDb._queueQueryResult([]); // tags
      mockDb._queueQueryResult([]); // staffing named (assignments_view)
      mockDb._queueQueryResult([]); // staffing pool (project_pool_demands)
      mockDb._queueQueryResult([]); // estimations
      mockDb._queueFirstResult(mockCount);

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('projects');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockProjects,
          pagination: expect.objectContaining({
            page: 1,
            limit: 50
          })
        })
      );
    });

    it('applies filters for project_type_id and location_id', async () => {
      mockReq.query = {
        project_type_id: 'type-1',
        location_id: 'loc-1',
        page: '1',
        limit: '10'
      };

      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      mockDb._queueFirstResult({ count: 0 });

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('handles pagination parameters', async () => {
      mockReq.query = {
        page: '2',
        limit: '25'
      };

      mockDb._queueQueryResult([]);
      mockDb._queueQueryResult([]);
      mockDb._queueFirstResult({ count: 100 });

      await controller.getAll(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [],
          pagination: expect.objectContaining({
            page: 2,
            limit: 25
          })
        })
      );
    });
  });

  describe('getById - Get Specific Project', () => {
    it('retrieves project with phases, assignments, and planners', async () => {
      mockReq.params.id = 'project-1';

      const mockProject = {
        id: 'project-1',
        name: 'Project Alpha',
        description: 'Test project',
        project_type_name: 'Development',
        location_name: 'New York'
      };

      const mockPhases = [
        {
          id: 'phase-1',
          phase_id: 'phase-type-1',
          phase_name: 'Planning',
          start_date: new Date('2024-01-01').getTime(),
          end_date: new Date('2024-03-31').getTime()
        }
      ];

      const mockAssignments = [
        {
          id: 'assign-1',
          person_id: 'person-1',
          person_name: 'John Doe',
          role_id: 'role-1',
          role_name: 'Developer',
          allocation_percentage: 50
        }
      ];

      const mockPlanners = [
        {
          id: 'planner-1',
          person_id: 'person-1',
          person_name: 'Jane Smith',
          is_primary_planner: true
        }
      ];

      // getById 顺序: project → tags → phases → assignments_view → pool_demands → planners
      mockDb._queueFirstResult(mockProject);
      mockDb._queueQueryResult([]); // tags
      mockDb._queueQueryResult(mockPhases);
      mockDb._queueQueryResult(mockAssignments);
      mockDb._queueQueryResult([]); // pool demands
      mockDb._queueQueryResult(mockPlanners);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          ...mockProject,
          phases: mockPhases,
          assignments: mockAssignments,
          pool_demands: [], // getById 现挂载池需求与生命周期告警(2026-09-22 对齐实现)
          lifecycle_warnings: [],
          planners: mockPlanners
        }
      });
    });

    it('returns 404 when project not found', async () => {
      mockReq.params.id = 'nonexistent-project';

      mockDb._setFirstResult(null);

      await controller.getById(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Project not found'
        })
      );
    });
  });

  describe('create - Create New Project', () => {
    it('creates a new project with validation', async () => {
      mockReq.body = {
        name: 'New Project',
        description: 'Test description',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1',
        location_id: 'loc-1',
        priority: 'high'
      };

      const mockProjectType = {
        id: 'type-1',
        name: 'Development'
      };

      const mockSubType = {
        id: 'subtype-1',
        name: 'Web App',
        project_type_id: 'type-1',
        is_active: true
      };

      const mockCreatedProject = {
        id: expect.any(String),
        name: 'New Project',
        description: 'Test description',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1'
      };

      // Validation queries
      mockDb._queueFirstResult(mockProjectType); // project type check
      mockDb._queueFirstResult(mockSubType); // sub-type check
      mockDb._queueFirstResult(mockSubType); // get project_type_id from sub-type
      // Phase inheritance queries
      mockDb._queueQueryResult([]); // project_type_phases
      // Lifecycle default lookup (055): type name decides 待RAT vs standing
      mockDb._queueFirstResult(mockProjectType);
      // Final project fetch
      mockDb._queueFirstResult(mockCreatedProject);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'projects',
        expect.any(String),
        'CREATE',
        undefined,
        mockCreatedProject
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Project created successfully'
        })
      );
    });

    it('inherits phases from project type template', async () => {
      mockReq.body = {
        name: 'New Project',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1'
      };

      const mockProjectType = {
        id: 'type-1',
        name: 'Development'
      };

      const mockSubType = {
        id: 'subtype-1',
        name: 'Web App',
        project_type_id: 'type-1',
        is_active: true
      };

      const mockTemplatePhases = [
        {
          template_phase_id: 'template-1',
          phase_id: 'phase-1',
          phase_name: 'Planning',
          order_index: 1,
          is_mandatory: true,
          min_duration_days: 10,
          max_duration_days: 60,
          default_duration_days: 30,
          is_locked_order: true
        },
        {
          template_phase_id: 'template-2',
          phase_id: 'phase-2',
          phase_name: 'Development',
          order_index: 2,
          is_mandatory: true,
          default_duration_days: 90
        }
      ];

      const mockProject = {
        id: expect.any(String),
        name: 'New Project',
        aspiration_start: new Date('2024-01-01'),
        aspiration_finish: new Date('2024-12-31')
      };

      // Validation + phase inheritance + project fetch
      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockSubType);
      mockDb._queueFirstResult(mockSubType);
      mockDb._queueQueryResult(mockTemplatePhases); // Template phases
      mockDb._queueFirstResult(mockProject); // Project for date calculation
      mockDb._queueFirstResult(mockProject); // Final fetch

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.insert).toHaveBeenCalledTimes(2); // Project + phases timeline
    });

    it('returns error when project sub-type is missing', async () => {
      mockReq.body = {
        name: 'New Project',
        project_type_id: 'type-1'
        // Missing project_sub_type_id
      };

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create project',
        details: undefined
      });
    });

    it('returns error when sub-type does not match project type', async () => {
      mockReq.body = {
        name: 'New Project',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-2'
      };

      const mockProjectType = {
        id: 'type-1',
        name: 'Development'
      };

      const mockSubType = {
        id: 'subtype-2',
        name: 'Mobile App',
        project_type_id: 'type-2', // Different type!
        is_active: true
      };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockSubType);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create project',
        details: undefined
      });
    });

    it('returns error when sub-type is not active', async () => {
      mockReq.body = {
        name: 'New Project',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1'
      };

      const mockProjectType = {
        id: 'type-1',
        name: 'Development'
      };

      const mockSubType = {
        id: 'subtype-1',
        name: 'Web App',
        project_type_id: 'type-1',
        is_active: false // Inactive!
      };

      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockSubType);

      await controller.create(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create project',
        details: undefined
      });
    });
  });

  describe('update - Update Project', () => {
    it('updates project successfully', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        name: 'Updated Project Name',
        description: 'Updated description'
      };

      const mockCurrentProject = {
        id: 'project-1',
        name: 'Original Name',
        description: 'Original description',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1'
      };

      const mockUpdatedProject = {
        id: 'project-1',
        name: 'Updated Project Name',
        description: 'Updated description',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1'
      };

      mockDb._queueFirstResult(mockCurrentProject);
      mockDb._queueFirstResult(mockUpdatedProject);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'projects',
        'project-1',
        'UPDATE',
        mockCurrentProject,
        mockUpdatedProject
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Project updated successfully'
        })
      );
    });

    it('validates project type and sub-type when updating', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        project_type_id: 'type-2',
        project_sub_type_id: 'subtype-2'
      };

      const mockCurrentProject = {
        id: 'project-1',
        name: 'Project',
        project_type_id: 'type-1',
        project_sub_type_id: 'subtype-1'
      };

      const mockProjectType = {
        id: 'type-2',
        name: 'New Type'
      };

      const mockSubType = {
        id: 'subtype-2',
        name: 'New SubType',
        project_type_id: 'type-2',
        is_active: true
      };

      const mockUpdatedProject = {
        id: 'project-1',
        name: 'Project',
        project_type_id: 'type-2',
        project_sub_type_id: 'subtype-2'
      };

      mockDb._queueFirstResult(mockCurrentProject);
      mockDb._queueFirstResult(mockProjectType);
      mockDb._queueFirstResult(mockSubType);
      mockDb._queueFirstResult(mockUpdatedProject);

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('returns 404 when project not found', async () => {
      mockReq.params.id = 'nonexistent-project';
      mockReq.body = { name: 'Updated Name' };

      mockDb._queueFirstResult({ id: 'nonexistent-project' }); // currentProject fetch
      mockDb._setFirstResult(null); // updated project fetch returns null

      await controller.update(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Project not found'
        })
      );
    });
  });

  describe('delete - Delete Project', () => {
    it('deletes project successfully', async () => {
      mockReq.params.id = 'project-1';

      const mockProject = {
        id: 'project-1',
        name: 'Project to Delete'
      };

      mockDb._setFirstResult(mockProject);
      mockDb._setDeleteResult(1);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).toHaveBeenCalled();
      expect(mockReq.logAuditEvent).toHaveBeenCalledWith(
        'projects',
        'project-1',
        'DELETE',
        mockProject,
        undefined
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Project deleted successfully'
        })
      );
    });

    it('returns 404 when project not found', async () => {
      mockReq.params.id = 'nonexistent-project';

      mockDb._setFirstResult(null);

      await controller.delete(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.del).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Project not found'
        })
      );
    });
  });

  describe('getHealth - Get Project Health', () => {
    it('retrieves project health data', async () => {
      const mockHealthData = [
        {
          project_id: 'project-1',
          health_score: 85,
          risk_level: 'low'
        },
        {
          project_id: 'project-2',
          health_score: 45,
          risk_level: 'high'
        }
      ];

      mockDb._setQueryResult(mockHealthData);

      await controller.getHealth(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('project_health_view');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockHealthData
        })
      );
    });
  });

  describe('getDemands - Get Project Demands', () => {
    it('retrieves project demands', async () => {
      mockReq.params.id = 'project-1';

      const mockDemands = [
        {
          project_id: 'project-1',
          role_id: 'role-1',
          role_name: 'Developer',
          demand_hours: 160,
          start_date: new Date('2024-01-01')
        }
      ];

      mockDb._setQueryResult(mockDemands);

      await controller.getDemands(mockReq, mockRes);
      await flushPromises();

      expect(mockDb).toHaveBeenCalledWith('project_demands_view');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockDemands
        })
      );
    });
  });

  describe('deleteTestData - Delete Test Projects', () => {
    it('deletes projects with Test_ prefix', async () => {
      mockDb.del = jest.fn().mockResolvedValue(5); // 5 projects deleted

      await controller.deleteTestData(mockReq, mockRes);
      await flushPromises();

      expect(mockDb.where).toHaveBeenCalledWith('name', 'like', 'Test_%');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { message: 'Deleted 5 test projects' }
        })
      );
    });
  });

  describe('getProjectTimeline - Get Project Timeline', () => {
    it('retrieves project timeline with phases', async () => {
      mockReq.params.id = 'project-1';

      const mockTimeline = [
        {
          id: 'timeline-1',
          phase_id: 'phase-1',
          phase_name: 'Planning',
          phase_description: 'Planning phase',
          start_date: new Date('2024-01-01').getTime(),
          end_date: new Date('2024-03-31').getTime(),
          duration_days: 90,
          phase_source: 'template',
          template_phase_id: 'template-1',
          is_deletable: false,
          is_duration_customized: false,
          is_name_customized: false,
          template_compliance_data: JSON.stringify({
            is_mandatory: true,
            is_locked_order: true
          })
        }
      ];

      mockDb._setQueryResult(mockTimeline);

      await controller.getProjectTimeline(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            projectId: 'project-1',
            phases: expect.arrayContaining([
              expect.objectContaining({
                id: 'timeline-1',
                name: 'Planning',
                template_compliance_data: {
                  is_mandatory: true,
                  is_locked_order: true
                }
              })
            ])
          })
        })
      );
    });
  });

  describe('validatePhaseUpdates - Validate Phase Updates', () => {
    it('validates phase updates successfully', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        updates: [
          {
            phaseTimelineId: 'timeline-1',
            newDurationDays: 45
          }
        ]
      };

      const mockValidationResult = {
        isValid: true,
        warnings: [],
        errors: []
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const _PhaseTemplateValidationService = require('../../../services/PhaseTemplateValidationService').PhaseTemplateValidationService;
      mockPhaseValidationService.validatePhaseUpdates.mockResolvedValue(mockValidationResult);

      await controller.validatePhaseUpdates(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockValidationResult
        })
      );
    });

    it('returns 400 when updates array is invalid', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        updates: 'not-an-array'
      };

      await controller.validatePhaseUpdates(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid updates array provided'
      });
    });
  });

  describe('validateCustomPhase - Validate Custom Phase', () => {
    it('validates custom phase addition', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        phaseName: 'Custom Testing Phase',
        insertIndex: 2
      };

      const mockValidationResult = {
        isValid: true,
        canAdd: true
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const _PhaseTemplateValidationService = require('../../../services/PhaseTemplateValidationService').PhaseTemplateValidationService;
      mockPhaseValidationService.validateCustomPhaseAddition.mockResolvedValue(mockValidationResult);

      await controller.validateCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockValidationResult
        })
      );
    });

    it('returns 400 when phase name is missing', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        insertIndex: 2
      };

      await controller.validateCustomPhase(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phase name is required'
      });
    });
  });

  describe('getTemplateCompliance - Get Template Compliance', () => {
    it('retrieves template compliance summary', async () => {
      mockReq.params.id = 'project-1';

      const mockCompliance = {
        projectId: 'project-1',
        isCompliant: true,
        deviations: [],
        compliancePercentage: 100
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const _PhaseTemplateValidationService = require('../../../services/PhaseTemplateValidationService').PhaseTemplateValidationService;
      mockPhaseValidationService.getProjectTemplateCompliance.mockResolvedValue(mockCompliance);

      await controller.getTemplateCompliance(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockCompliance
        })
      );
    });
  });

  describe('addCustomPhase - Add Custom Phase', () => {
    it('adds custom phase successfully', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        name: 'Custom Testing Phase',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-07-31'),
        insertIndex: 2
      };

      const mockResult = {
        success: true,
        phase: {
          id: 'timeline-new',
          phase_id: 'phase-custom',
          name: 'Custom Testing Phase'
        }
      };

      mockCustomPhaseService.addCustomPhase.mockResolvedValue(mockResult);

      await controller.addCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockResult
        })
      );
    });

    it('returns 400 when phase name is missing', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        startDate: new Date('2024-06-01')
      };

      await controller.addCustomPhase(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phase name is required'
      });
    });

    it('returns 400 when service returns failure', async () => {
      mockReq.params.id = 'project-1';
      mockReq.body = {
        name: 'Invalid Phase'
      };

      const mockResult = {
        success: false,
        message: 'Cannot add phase: violates template constraints'
      };

      mockCustomPhaseService.addCustomPhase.mockResolvedValue(mockResult);

      await controller.addCustomPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Cannot add phase: violates template constraints'
      });
    });
  });

  describe('updateProjectPhase - Update Project Phase', () => {
    it('updates project phase successfully', async () => {
      mockReq.params.id = 'project-1';
      mockReq.params.phaseTimelineId = 'timeline-1';
      mockReq.body = {
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-04-15')
      };

      const mockResult = {
        success: true,
        phase: {
          id: 'timeline-1',
          start_date: new Date('2024-01-15').getTime(),
          end_date: new Date('2024-04-15').getTime()
        }
      };

      mockCustomPhaseService.updatePhase.mockResolvedValue(mockResult);

      await controller.updateProjectPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockResult
        })
      );
    });

    it('returns 400 when update violates constraints', async () => {
      mockReq.params.id = 'project-1';
      mockReq.params.phaseTimelineId = 'timeline-1';
      mockReq.body = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05') // Too short
      };

      const mockResult = {
        success: false,
        message: 'Phase duration below minimum constraint'
      };

      mockCustomPhaseService.updatePhase.mockResolvedValue(mockResult);

      await controller.updateProjectPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Phase duration below minimum constraint'
      });
    });
  });

  describe('deleteProjectPhase - Delete Project Phase', () => {
    it('deletes project phase successfully', async () => {
      mockReq.params.id = 'project-1';
      mockReq.params.phaseTimelineId = 'timeline-1';

      const mockResult = {
        success: true,
        message: 'Phase deleted successfully'
      };

      mockCustomPhaseService.deletePhase.mockResolvedValue(mockResult);

      await controller.deleteProjectPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockResult
        })
      );
    });

    it('returns 400 when phase cannot be deleted', async () => {
      mockReq.params.id = 'project-1';
      mockReq.params.phaseTimelineId = 'timeline-1';

      const mockResult = {
        success: false,
        message: 'Cannot delete mandatory phase'
      };

      mockCustomPhaseService.deletePhase.mockResolvedValue(mockResult);

      await controller.deleteProjectPhase(mockReq, mockRes);
      await flushPromises();

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Cannot delete mandatory phase'
      });
    });
  });
});
