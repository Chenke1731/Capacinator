/**
 * Estimation backfill API semantics — IP-07a / C11 / C12.
 *
 * 真实 HTTP + 迁移库持久化验证:
 * - C11: 部分回填保留未提交字段(actual_design_pm=1 不被清空)
 * - C12: 空回填被拒,原行实际值与完成标记不变
 * - 完整回填(三项工作量实际齐)才写 backfilled_at;部分回填后仍可继续修订
 * - 设计侧单字段回填同语义
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';

test.describe('Estimation backfill semantics (C11/C12)', () => {
  let testContext: TestDataContext;
  let projectId: string;

  test.beforeEach(async ({ testDataHelpers }) => {
    testContext = testDataHelpers.createTestContext('estbf');
    const testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 1,
      people: 1,
      assignments: 0
    });
    projectId = testData.projects[0].id;
  });

  test.afterEach(async ({ testDataHelpers }) => {
    await testDataHelpers.cleanupTestContext(testContext);
  });

  async function createEstimation(apiContext: any) {
    const res = await apiContext.post(`/api/estimations/project/${projectId}`, {
      data: { estimated_loc: 1000, loc_rate_per_pm: 500, design_share_pct: 25 }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    return body.data;
  }

  async function fetchCurrentEstimation(apiContext: any) {
    const res = await apiContext.get(`/api/estimations/project/${projectId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const rows = body.data || body;
    return rows[0];
  }

  test(`${tags.api} C11: partial backfill keeps unsubmitted actuals and stays revisable`, async ({ apiContext }) => {
    const est = await createEstimation(apiContext);

    // 首次部分回填:design=1、dev=2,loc 缺 → 不完整
    const first = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_design_pm: 1, actual_dev_pm: 2 }
    });
    expect(first.ok()).toBeTruthy();
    let row = await fetchCurrentEstimation(apiContext);
    expect(row.actual_design_pm).toBe(1);
    expect(row.actual_dev_pm).toBe(2);
    expect(row.actual_loc).toBeNull();
    expect(row.backfilled_at).toBeFalsy(); // 部分回填不标完成

    // C11:只补 dev=3,design=1 必须保留
    const second = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_dev_pm: 3 }
    });
    expect(second.ok()).toBeTruthy();
    const secondBody = await second.json();
    expect(secondBody.data.actual_design_pm).toBe(1);
    expect(secondBody.data.actual_dev_pm).toBe(3);

    row = await fetchCurrentEstimation(apiContext);
    expect(row.actual_design_pm).toBe(1);
    expect(row.actual_dev_pm).toBe(3);
    expect(row.actual_loc).toBeNull();
    expect(row.backfilled_at).toBeFalsy();

    // 补齐最后一项 → 完整,标完成
    const third = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_loc: 900, actual_delivery_date: '2026-12-20' }
    });
    expect(third.ok()).toBeTruthy();
    row = await fetchCurrentEstimation(apiContext);
    expect(row.actual_loc).toBe(900);
    expect(row.actual_design_pm).toBe(1);
    expect(row.actual_dev_pm).toBe(3);
    expect(row.backfilled_at).toBeTruthy();
  });

  test(`${tags.api} C12: empty and invalid backfills are rejected without touching the row`, async ({ apiContext }) => {
    const est = await createEstimation(apiContext);
    const seed = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_design_pm: 1, actual_dev_pm: 2 }
    });
    expect(seed.ok()).toBeTruthy();

    const empty = await apiContext.post(`/api/estimations/${est.id}/backfill`, { data: {} });
    expect(empty.status()).toBe(400);

    const negative = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_dev_pm: -1 }
    });
    expect(negative.status()).toBe(400);

    const explicitNull = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_design_pm: null }
    });
    expect(explicitNull.status()).toBe(400);

    const badDate = await apiContext.post(`/api/estimations/${est.id}/backfill`, {
      data: { actual_delivery_date: 'not-a-date' }
    });
    expect(badDate.status()).toBe(400);

    const row = await fetchCurrentEstimation(apiContext);
    expect(row.actual_design_pm).toBe(1);
    expect(row.actual_dev_pm).toBe(2);
    expect(row.actual_loc).toBeNull();
    expect(row.backfilled_at).toBeFalsy();
  });

  test(`${tags.api} design estimation backfill: empty rejected, single field completes`, async ({ apiContext }) => {
    const createRes = await apiContext.post(`/api/design-estimations/project/${projectId}`, {
      data: { estimated_design_pm: 1.5 }
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()).data;

    const empty = await apiContext.post(`/api/design-estimations/${created.id}/backfill`, { data: {} });
    expect(empty.status()).toBe(400);

    const backfill = await apiContext.post(`/api/design-estimations/${created.id}/backfill`, {
      data: { actual_design_pm: 2 }
    });
    expect(backfill.ok()).toBeTruthy();
    const body = await backfill.json();
    expect(body.data.actual_design_pm).toBe(2);
    expect(body.data.backfilled_at).toBeTruthy();

    const listRes = await apiContext.get(`/api/design-estimations/project/${projectId}`);
    expect(listRes.ok()).toBeTruthy();
    const rows = (await listRes.json()).data || (await listRes.json());
    const current = rows[0];
    expect(current.actual_design_pm).toBe(2);
    expect(current.backfilled_at).toBeTruthy();
  });
});
