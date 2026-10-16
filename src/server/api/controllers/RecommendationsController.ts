import type { Request, Response } from 'express';
import { db as globalDb } from '../../database/index.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';

/**
 * 组合级推荐引擎为未完成能力（2026-10-16 缺口④收口）：
 * getRecommendations 曾恒返空三桶、executeRecommendation 曾无业务表也回
 * "执行成功"（零写入）。按既有裁决"保留则接真实计算，否则明确不可用"
 * （同 DemandController.calculateScenario / IP-02e 先例）显式返回 501：
 * 占位实现不得产出"推荐可用/已执行"的结论。假消费方（Assignments 推荐
 * tab + api.recommendations）已随本批移除。真实引擎（含契约重设计）归
 * IP-09/自动排程后续包，届时以真实多事推演替换本契约。
 */
export class RecommendationsController {
  private db: any;

  constructor(container?: ServiceContainer) {
    this.db = container ? container.getDb() : globalDb;
  }

  async getRecommendations(req: Request, res: Response) {
    void req;
    void this.db; // 501 路径零数据库访问（契约测试以 Proxy 守卫）
    res.status(501).json({
      error: 'Not implemented',
      message: 'portfolio recommendation engine is not implemented; no recommendations are produced here'
    });
  }

  async executeRecommendation(req: Request, res: Response) {
    const { recommendationId } = req.params;
    void this.db; // 501 路径零数据库访问（契约测试以 Proxy 守卫）
    res.status(501).json({
      error: 'Not implemented',
      message: `recommendation ${recommendationId} cannot be executed: recommendation engine is not implemented`
    });
  }
}
