import { EstimationController } from '../EstimationController.js';
import { createMockDb, flushPromises } from './helpers/mockDb.js';

/**
 * EstimationController.backfill — IP-07a / C11 / C12.
 *
 * 回填载荷语义（真实 knex 语义下,update 载荷里省略的键不改写列值）:
 * - 只提交的字段进入载荷,未提交字段保持原值 (C11)
 * - 空请求拒绝,不写库、不标完成 (C12)
 * - 负数 / NaN / 非法日期 / 显式 null 拒绝 (显式清空语义未裁决,见 D11)
 * - backfilled_at 仅在合并后行完整时写入——Lifecycle 告警与面板把它当
 *   "已回填"信号,部分回填不得冒充完整
 */
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const EXISTING = {
  id: 7,
  project_id: 'p1',
  estimated_loc: 1000,
  loc_rate_per_pm: 500,
  design_share_pct: 25,
  deviation_low_pct: 20,
  deviation_high_pct: 50,
  expected_delivery_date: null,
  review_notes: null,
  actual_loc: null,
  actual_design_pm: 1,
  actual_dev_pm: 2,
  actual_delivery_date: null,
  backfilled_at: null,
  created_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z'
};

describe('EstimationController.backfill', () => {
  let controller: EstimationController;
  let mockReq: any;
  let mockRes: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();

    controller = new EstimationController();
    mockReq = { params: { id: '7' }, body: {}, headers: {}, logger: mockLogger };
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

  test('C11: submitting only actual_dev_pm keeps other actuals (payload omits them)', async () => {
    mockReq.body = { actual_dev_pm: 3 };
    mockDb._setUpdateResult([{ ...EXISTING, actual_dev_pm: 3 }]);

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).not.toHaveBeenCalledWith(400);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(updatePayload()).toMatchObject({ actual_dev_pm: 3 });
    expect(updatePayload()).not.toHaveProperty('actual_design_pm');
    expect(updatePayload()).not.toHaveProperty('actual_loc');
    expect(updatePayload()).not.toHaveProperty('actual_delivery_date');
    // actual_loc 仍为 null → 不完整 → 不得标记完成
    expect(updatePayload()).not.toHaveProperty('backfilled_at');
  });

  test('C12: empty backfill body is rejected and nothing is written', async () => {
    mockReq.body = {};

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('negative value is rejected', async () => {
    mockReq.body = { actual_dev_pm: -1 };

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
    mockReq.body = { actual_loc: 'many' };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('invalid delivery date is rejected', async () => {
    mockReq.body = { actual_delivery_date: 'not-a-date' };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  test('date-only backfill writes only the date column', async () => {
    mockReq.body = { actual_delivery_date: '2026-12-20' };
    mockDb._setUpdateResult([{ ...EXISTING, actual_delivery_date: '2026-12-20' }]);

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).not.toHaveBeenCalledWith(400);
    expect(updatePayload()).toMatchObject({ actual_delivery_date: '2026-12-20' });
    expect(updatePayload()).not.toHaveProperty('actual_loc');
    expect(updatePayload()).not.toHaveProperty('actual_design_pm');
    expect(updatePayload()).not.toHaveProperty('actual_dev_pm');
    expect(updatePayload()).not.toHaveProperty('backfilled_at');
  });

  test('submitting all effort actuals marks the row complete (backfilled_at written)', async () => {
    mockReq.body = { actual_loc: 900, actual_design_pm: 1, actual_dev_pm: 3, actual_delivery_date: '2026-12-20' };
    mockDb._setUpdateResult([{
      ...EXISTING, actual_loc: 900, actual_dev_pm: 3, actual_delivery_date: '2026-12-20', backfilled_at: 'NOW-TS'
    }]);

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).not.toHaveBeenCalledWith(400);
    expect(updatePayload()).toMatchObject({
      actual_loc: 900,
      actual_design_pm: 1,
      actual_dev_pm: 3,
      actual_delivery_date: '2026-12-20',
      backfilled_at: 'NOW-TS'
    });
  });

  test('completion is judged on the merged row: last missing field completes an earlier partial backfill', async () => {
    // 行上已有 design=1、dev=2(C11 场景后),仅补 loc 即完整
    mockDb._setFirstResult({ ...EXISTING, actual_design_pm: 1, actual_dev_pm: 2 });
    mockReq.body = { actual_loc: 900 };
    mockDb._setUpdateResult([{ ...EXISTING, actual_loc: 900, backfilled_at: 'NOW-TS' }]);

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).not.toHaveBeenCalledWith(400);
    expect(updatePayload()).toMatchObject({ actual_loc: 900 });
    expect(updatePayload()).toHaveProperty('backfilled_at');
  });

  test('404 when estimation does not exist', async () => {
    mockDb._setFirstResult(null);
    mockReq.body = { actual_dev_pm: 3 };

    await controller.backfill(mockReq, mockRes);
    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
