import { describe, test, expect } from '@jest/globals';
import { RecommendationsController } from '../../../../src/server/api/controllers/RecommendationsController';

/**
 * 推荐链 501 契约（2026-10-16 缺口④）：
 * 组合级推荐引擎从未实装——getRecommendations 恒返空三桶、
 * executeRecommendation 在无业务表的环境也回"执行成功"（零写入）。
 * 按既有裁决"保留则接真实计算，否则明确不可用"（同
 * DemandController.calculateScenario / IP-02e 先例）显式 501：
 * 占位实现不得产出"推荐可用/已执行"的结论。真实引擎归
 * IP-09/自动排程后续包。
 */
function mockRes() {
  const r: {
    statusCode: number;
    body: unknown;
    status: (c: number) => typeof r;
    json: (b: unknown) => typeof r;
  } = {
    statusCode: 0,
    body: undefined,
    status(c: number) { r.statusCode = c; return r; },
    json(b: unknown) { r.body = b; return r; }
  };
  return r;
}

/** db 任何方法被调用即炸——501 路径必须零数据库访问 */
const boomDb = new Proxy(
  {},
  { get: () => { throw new Error('db must not be used on 501 path'); } }
) as never;
const boomContainer = { getDb: () => boomDb } as never;

describe('RecommendationsController 501 契约 (缺口④)', () => {
  const controller = new RecommendationsController(boomContainer);

  test('getRecommendations 显式 501，不产空三桶假可用', async () => {
    const res = mockRes();
    await controller.getRecommendations({} as never, res as never);
    expect(res.statusCode).toBe(501);
    expect((res.body as { error: string }).error).toBe('Not implemented');
  });

  test('executeRecommendation 显式 501，不再假成功', async () => {
    const res = mockRes();
    await controller.executeRecommendation({ params: { recommendationId: 'rec-1' } } as never, res as never);
    expect(res.statusCode).toBe(501);
    expect((res.body as { error: string }).error).toBe('Not implemented');
    expect(JSON.stringify(res.body)).not.toContain('executed successfully');
  });
});
