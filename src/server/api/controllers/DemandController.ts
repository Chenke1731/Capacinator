import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { DemandCalculationService } from '../../services/demand/DemandCalculationService.js';
import { resolveScenarioId } from '../../services/calc/effectiveAssignments.js';
import type { DemandSummaryFilters } from '../../services/demand/types.js';

export class DemandController extends BaseController {
  private _demandService?: DemandCalculationService;

  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  // Lazy initialization to allow db mocking in tests
  private get demandService(): DemandCalculationService {
    if (!this._demandService) {
      this._demandService = new DemandCalculationService(this.db);
    }
    return this._demandService;
  }

  async getProjectDemands(req: Request, res: Response) {
    const { project_id } = req.params;

    const result = await this.executeQuery(
      async () => {
        const data = await this.demandService.getProjectDemands(project_id);
        if (!data) {
          this.handleNotFound(res, 'Project');
          return null;
        }
        return data;
      },
      res,
      'Failed to fetch project demands'
    );

    if (result) {
      res.json(result);
    }
  }

  async getDemandSummary(req: Request, res: Response) {
    const filters: DemandSummaryFilters = {
      startDate: req.query.start_date as string | undefined,
      endDate: req.query.end_date as string | undefined,
      locationId: req.query.location_id as string | undefined,
      projectTypeId: req.query.project_type_id as string | undefined,
      // IP-02b: 需求按请求选定场景的有效切片计算(缺省 baseline)
      scenarioId: resolveScenarioId(req.headers['x-scenario-id']),
    };

    const result = await this.executeQuery(
      async () => this.demandService.getDemandSummary(filters),
      res,
      'Failed to fetch demand summary'
    );

    if (result) {
      res.json(result);
    }
  }

  async createOverride(req: Request, res: Response) {
    const overrideData = req.body;

    const result = await this.executeQuery(async () => {
      const project = await this.db('projects').where('id', overrideData.project_id).first();
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const [override] = await this.db('demand_overrides')
        .insert({
          ...overrideData,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      return override;
    }, res, 'Failed to create demand override');

    if (result) {
      res.status(201).json(result);
    }
  }

  async deleteOverride(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const deleted = await this.db('demand_overrides').where('id', id).del();

      if (deleted === 0) {
        this.handleNotFound(res, 'Demand override');
        return null;
      }

      return { message: 'Demand override deleted successfully' };
    }, res, 'Failed to delete demand override');

    if (result) {
      res.json(result);
    }
  }

  async getDemandForecast(req: Request, res: Response) {
    const months = Number(req.query.months) || 6;

    const result = await this.executeQuery(
      async () => this.demandService.getDemandForecast(months),
      res,
      'Failed to generate demand forecast'
    );

    if (result) {
      res.json(result);
    }
  }

  async getDemandGaps(req: Request, res: Response) {
    const result = await this.executeQuery(
      async () => this.demandService.getDemandGaps(),
      res,
      'Failed to fetch demand gaps'
    );

    if (result) {
      res.json(result);
    }
  }

  async calculateScenario(req: Request, res: Response) {
    // IP-02e/F08: 场景影响模拟为未完成能力——新项目需求读已改名的旧表、
    // 缺口为占位实现。按裁决"保留则接真实计算,否则明确不可用"显式返回
    // 501:占位数据不得产出"资源可行"的结论。接回真实计算属 IP-09b 多事推演。
    void req;
    res.status(501).json({
      error: 'Not implemented',
      message: 'scenario impact analysis is not implemented; no feasibility conclusion is produced here'
    });
  }
}
