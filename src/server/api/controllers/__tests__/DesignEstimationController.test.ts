import { DesignEstimationController } from '../DesignEstimationController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

/**
 * DesignEstimationController.backfill — IP-07a / C11 / C12 (设计侧).
 *
 * 单字段回填:未提交保持原值、空请求拒绝、负数/NaN/显式 null 拒绝;
 * actual_design_pm 非空即完整,写 backfilled_at。
 */
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const EXISTING = {
  id: 3,
  project_id: 'p1',
  estimated_design_pm: 1.5,
  deviation_low_pct: 20,
  deviation_high_pct: 50,
  notes: null,
  actual_design_pm: null,
  backfilled_at: null,
  created_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z'
};

describe('DesignEstimationController.backfill', () => {
  let controller: DesignEstimationController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();

    controller = new DesignEstimationController();
    mockReq = { params: { id: '3' }, body: {}, headers: {}, logger: mockLogger };
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    mockDb = createMockDb();
    (controller as any).db = mockDb;
    mockDb.fn = { now: jest.fn(() => 'NOW-TS') };
    mockDb._reset();
    mockDb._setFirstResult(EXISTING);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const updatePayload = () => mockDb.update.mock.calls[0]?.[0] as Record<string, unknown>;

  test('backfill writes the single field and marks complete', async () => {
    mockReq.body = { actual_design_pm: 2 };
    mockDb._setUpdateResult([{ ...EXISTING, actual_design_pm: 2, backfilled_at: 'NOW-TS' }]);

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).not.toHaveBeenCalledWith(400);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(updatePayload()).toMatchObject({ actual_design_pm: 2, backfilled_at: 'NOW-TS' });
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        deviation: { design_pm: 33.3 } // (2 - 1.5) / 1.5 = +33.3%
      })
    );
  });

  test('C12: empty body is rejected and nothing is written', async () => {
    mockReq.body = {};

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('negative value is rejected', async () => {
    mockReq.body = { actual_design_pm: -0.5 };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('explicit null is rejected (clearing is not an adjudicated operation, D11)', async () => {
    mockReq.body = { actual_design_pm: null };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('non-numeric value is rejected', async () => {
    mockReq.body = { actual_design_pm: 'lots' };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('404 when design estimation does not exist', async () => {
    mockDb._setFirstResult(null);
    mockReq.body = { actual_design_pm: 2 };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
